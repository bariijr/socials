import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Requirement } from '../service-cases/requirement.entity';
import { ServiceCase } from '../service-cases/service-case.entity';
import { ServiceOrder } from '../service-cases/service-order.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { renderTemplate } from '../form-templates/template-renderer';
import { computeRequiredByZ, computeUrgency } from './permit-deadline';
import { evaluateReconfirm } from './reconfirm';
import { MailService } from '../mail/mail.service';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';

@Injectable()
export class PermitsService {
  constructor(
    @InjectRepository(Requirement) private readonly requirementRepo: Repository<Requirement>,
    @InjectRepository(ServiceCase) private readonly serviceCaseRepo: Repository<ServiceCase>,
    @InjectRepository(ServiceOrder) private readonly serviceOrderRepo: Repository<ServiceOrder>,
    @InjectRepository(Comm) private readonly commRepo: Repository<Comm>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    @InjectRepository(CountryRequirement) private readonly countryRequirementRepo: Repository<CountryRequirement>,
    @InjectRepository(FormTemplate) private readonly formTemplateRepo: Repository<FormTemplate>,
    private readonly mailService: MailService,
  ) {}

  private toFlat(requirement: Requirement, serviceCase: ServiceCase, serviceOrder: ServiceOrder) {
    return {
      id: serviceCase.id,
      legId: requirement.legId,
      country: requirement.country,
      status: serviceCase.status,
      requiredByZ: requirement.requiredByZ,
      validFrom: serviceCase.validFrom,
      validTo: serviceCase.validTo,
      clearanceNumber: serviceCase.clearanceNumber,
      correlationToken: serviceOrder.correlationToken,
      submissionEmail: serviceOrder.submissionEmail,
      responsibility: requirement.responsibility,
      createdAt: serviceCase.createdAt,
      updatedAt: serviceCase.updatedAt,
    };
  }

  async create(legId: string, country: string) {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const countryRequirement = await this.countryRequirementRepo.findOne({ where: { country } });
    if (!countryRequirement) throw new NotFoundException(`No CountryRequirement for ${country}`);

    const requiredByZ = leg.arrDate
      ? new Date(computeRequiredByZ(leg.arrDate.toISOString(), countryRequirement))
      : null;

    const requirement = await this.requirementRepo.save(
      this.requirementRepo.create({
        legId,
        country,
        serviceCategory: 'PERMIT',
        serviceType: 'PERMIT',
        responsibility: 'OUR_ARRANGEMENT',
        requiredByZ,
      }),
    );

    const serviceCase = await this.serviceCaseRepo.save(
      this.serviceCaseRepo.create({
        requirementId: requirement.id,
        status: 'REQUESTED',
      }),
    );

    const correlationToken = `${leg.legId}/${serviceCase.id}`;

    const serviceOrder = await this.serviceOrderRepo.save(
      this.serviceOrderRepo.create({
        serviceCaseId: serviceCase.id,
        submissionEmail: countryRequirement.submissionEmail,
        correlationToken,
      }),
    );

    const template = await this.formTemplateRepo.findOne({ where: { country } });
    const body = template
      ? renderTemplate(template, {
          tripNo: leg.tripNo,
          tail: leg.tail ?? '',
          icao: leg.icao,
          acType: leg.acType ?? '',
          captName: leg.captName ?? '',
          captEmail: leg.captEmail ?? '',
        })
      : `Requesting permit for trip ${leg.tripNo}, tail ${leg.tail ?? 'N/A'}.`;

    if (countryRequirement.submissionEmail) {
      await this.mailService.send({
        to: countryRequirement.submissionEmail,
        subject: `Permit Request — Trip ${leg.tripNo} — ${country} [${correlationToken}]`,
        body,
      });

      await this.commRepo.save(
        this.commRepo.create({
          direction: 'OUTBOUND',
          legId,
          serviceCaseId: serviceCase.id,
          correlationToken,
          fromAddress: process.env.SMTP_FROM ?? '',
          toAddress: countryRequirement.submissionEmail,
          subject: `Permit Request — Trip ${leg.tripNo} — ${country} [${correlationToken}]`,
          body,
          kind: 'REQUEST',
          sentAt: new Date(),
        }),
      );
    }

    return this.toFlat(requirement, serviceCase, serviceOrder);
  }

  async findByLeg(legId: string) {
    const requirements = await this.requirementRepo.find({ where: { legId } });
    const results = [];
    for (const requirement of requirements) {
      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId: requirement.id } });
      if (!serviceCase) continue;
      const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
      if (!serviceOrder) continue;
      results.push(this.toFlat(requirement, serviceCase, serviceOrder));
    }
    return results;
  }

  async update(id: string, dto: UpdatePermitRequestDto) {
    const serviceCase = await this.serviceCaseRepo.findOne({ where: { id } });
    if (!serviceCase) throw new NotFoundException(`PermitRequest ${id} not found`);

    if (dto.status) serviceCase.status = dto.status;
    if (dto.clearanceNumber) serviceCase.clearanceNumber = dto.clearanceNumber;
    if (dto.validFrom) serviceCase.validFrom = new Date(dto.validFrom);
    if (dto.validTo) serviceCase.validTo = new Date(dto.validTo);
    await this.serviceCaseRepo.save(serviceCase);

    const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
    if (!requirement) throw new NotFoundException(`Requirement for ${id} not found`);

    if (dto.responsibility) {
      requirement.responsibility = dto.responsibility;
      await this.requirementRepo.save(requirement);
    }

    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: id } });
    if (!serviceOrder) throw new NotFoundException(`ServiceOrder for ${id} not found`);

    return this.toFlat(requirement, serviceCase, serviceOrder);
  }

  async findAllWithUrgency() {
    const serviceCases = await this.serviceCaseRepo.find();
    const now = new Date().toISOString();

    const withUrgency = [];
    for (const serviceCase of serviceCases) {
      const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
      if (!requirement) continue;
      const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
      if (!serviceOrder) continue;
      const leg = await this.legRepo.findOne({ where: { id: requirement.legId } });
      const urgency = requirement.requiredByZ ? computeUrgency(requirement.requiredByZ.toISOString(), now) : 'OK';
      withUrgency.push({
        ...this.toFlat(requirement, serviceCase, serviceOrder),
        urgency,
        legSummary: leg ? { tripNo: leg.tripNo, icao: leg.icao, tail: leg.tail } : null,
      });
    }
    return withUrgency;
  }

  async reconcileForLeg(legId: string, currentArrDateZ: Date | null): Promise<void> {
    const requirements = await this.requirementRepo.find({ where: { legId } });
    const now = new Date();

    for (const requirement of requirements) {
      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId: requirement.id } });
      if (!serviceCase) continue;

      const nextStatus = evaluateReconfirm(
        { status: serviceCase.status, requiredByZ: requirement.requiredByZ, validFrom: serviceCase.validFrom, validTo: serviceCase.validTo },
        currentArrDateZ,
        now,
      );
      if (nextStatus !== serviceCase.status) {
        serviceCase.status = nextStatus;
        await this.serviceCaseRepo.save(serviceCase);
      }
    }
  }

  async addManualComm(
    serviceCaseId: string,
    input: { fromAddress: string; subject: string; body: string },
  ): Promise<Comm> {
    const serviceCase = await this.serviceCaseRepo.findOne({ where: { id: serviceCaseId } });
    if (!serviceCase) throw new NotFoundException(`ServiceCase ${serviceCaseId} not found`);

    const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
    if (!requirement) throw new NotFoundException(`Requirement for ${serviceCaseId} not found`);

    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId } });

    return this.commRepo.save(
      this.commRepo.create({
        direction: 'INBOUND',
        legId: requirement.legId,
        serviceCaseId,
        correlationToken: serviceOrder?.correlationToken ?? null,
        fromAddress: input.fromAddress,
        toAddress: process.env.SMTP_FROM ?? '',
        subject: input.subject,
        body: input.body,
        kind: 'REQUEST',
        sentAt: new Date(),
      }),
    );
  }
}
