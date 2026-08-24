import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Requirement, ServiceType } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
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

const PRE_CONFIRMATION_STATUSES = ['REQUESTED', 'CHASING', 'RECONFIRM_REQUIRED'];

@Injectable()
export class PermitsService {
  constructor(
    @InjectRepository(Requirement) private readonly requirementRepo: Repository<Requirement>,
    @InjectRepository(RequirementLeg) private readonly requirementLegRepo: Repository<RequirementLeg>,
    @InjectRepository(ServiceCase) private readonly serviceCaseRepo: Repository<ServiceCase>,
    @InjectRepository(ServiceOrder) private readonly serviceOrderRepo: Repository<ServiceOrder>,
    @InjectRepository(Comm) private readonly commRepo: Repository<Comm>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    @InjectRepository(CountryRequirement) private readonly countryRequirementRepo: Repository<CountryRequirement>,
    @InjectRepository(FormTemplate) private readonly formTemplateRepo: Repository<FormTemplate>,
    private readonly mailService: MailService,
  ) {}

  private async legIdsFor(requirementId: string): Promise<string[]> {
    const rows = await this.requirementLegRepo.find({ where: { requirementId } });
    return rows.map((r) => r.legId);
  }

  private async toFlat(requirement: Requirement, serviceCase: ServiceCase, serviceOrder: ServiceOrder) {
    return {
      id: serviceCase.id,
      legIds: await this.legIdsFor(requirement.id),
      country: requirement.country,
      serviceType: requirement.serviceType,
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

  async findCompatible(legId: string, country: string, serviceType: ServiceType) {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const tripLegs = await this.legRepo.find({ where: { tripId: leg.tripId } });
    const tripLegIds = tripLegs.map((l) => l.id);
    if (tripLegIds.length === 0) return null;

    const candidateLegRows = await this.requirementLegRepo.find({ where: { legId: In(tripLegIds) } });
    const candidateRequirementIds = Array.from(new Set(candidateLegRows.map((r) => r.requirementId)));

    for (const requirementId of candidateRequirementIds) {
      const requirement = await this.requirementRepo.findOne({ where: { id: requirementId } });
      if (!requirement) continue;
      if (requirement.country !== country || requirement.serviceType !== serviceType) continue;

      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId } });
      if (!serviceCase || !PRE_CONFIRMATION_STATUSES.includes(serviceCase.status)) continue;

      const legIds = await this.legIdsFor(requirementId);
      if (legIds.includes(legId)) continue;

      const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
      return {
        requirementId,
        legIds,
        status: serviceCase.status,
        correlationToken: serviceOrder?.correlationToken ?? null,
      };
    }

    return null;
  }

  async create(legId: string, country: string, serviceType: ServiceType) {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const countryRequirement = await this.countryRequirementRepo.findOne({ where: { country, serviceType } });
    if (!countryRequirement) throw new NotFoundException(`No CountryRequirement for ${country}/${serviceType}`);

    const requiredByZ = leg.arrDate
      ? new Date(computeRequiredByZ(leg.arrDate.toISOString(), countryRequirement))
      : null;

    const requirement = await this.requirementRepo.save(
      this.requirementRepo.create({
        country,
        serviceCategory: 'PERMIT',
        serviceType,
        responsibility: 'OUR_ARRANGEMENT',
        requiredByZ,
      }),
    );

    await this.requirementLegRepo.save(this.requirementLegRepo.create({ requirementId: requirement.id, legId }));

    const serviceCase = await this.serviceCaseRepo.save(
      this.serviceCaseRepo.create({ requirementId: requirement.id, status: 'REQUESTED' }),
    );

    const correlationToken = `${leg.legId}/${serviceCase.id}`;

    const serviceOrder = await this.serviceOrderRepo.save(
      this.serviceOrderRepo.create({
        serviceCaseId: serviceCase.id,
        submissionEmail: countryRequirement.submissionEmail,
        correlationToken,
      }),
    );

    const template = await this.formTemplateRepo.findOne({ where: { country, serviceType } });
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

  async merge(legId: string, requirementId: string) {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const requirement = await this.requirementRepo.findOne({ where: { id: requirementId } });
    if (!requirement) throw new NotFoundException(`Requirement ${requirementId} not found`);

    const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId } });
    if (!serviceCase) throw new NotFoundException(`ServiceCase for ${requirementId} not found`);
    if (!PRE_CONFIRMATION_STATUSES.includes(serviceCase.status)) {
      throw new NotFoundException(`Requirement ${requirementId} is no longer open for merging`);
    }

    const existingLegIds = await this.legIdsFor(requirementId);
    if (!existingLegIds.includes(legId)) {
      await this.requirementLegRepo.save(this.requirementLegRepo.create({ requirementId, legId }));
    }

    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
    if (!serviceOrder) throw new NotFoundException(`ServiceOrder for ${requirementId} not found`);

    return this.toFlat(requirement, serviceCase, serviceOrder);
  }

  async findByLeg(legId: string) {
    const legRows = await this.requirementLegRepo.find({ where: { legId } });
    const results = [];
    for (const legRow of legRows) {
      const requirement = await this.requirementRepo.findOne({ where: { id: legRow.requirementId } });
      if (!requirement) continue;
      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId: requirement.id } });
      if (!serviceCase) continue;
      const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId: serviceCase.id } });
      if (!serviceOrder) continue;
      results.push(await this.toFlat(requirement, serviceCase, serviceOrder));
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

    if (dto.responsibility) requirement.responsibility = dto.responsibility;
    if (dto.serviceType) requirement.serviceType = dto.serviceType;
    if (dto.responsibility || dto.serviceType) await this.requirementRepo.save(requirement);

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
      const legIds = await this.legIdsFor(requirement.id);
      const anchorLeg = legIds.length ? await this.legRepo.findOne({ where: { id: legIds[0] } }) : null;
      const urgency = requirement.requiredByZ ? computeUrgency(requirement.requiredByZ.toISOString(), now) : 'OK';
      withUrgency.push({
        ...(await this.toFlat(requirement, serviceCase, serviceOrder)),
        urgency,
        legSummary: anchorLeg ? { tripNo: anchorLeg.tripNo, icao: anchorLeg.icao, tail: anchorLeg.tail } : null,
      });
    }
    return withUrgency;
  }

  private async pickArrDateForReconfirm(
    requirementId: string,
    changedLegId: string,
    changedLegArrDateZ: Date | null,
    validFrom: Date | null,
    validTo: Date | null,
  ): Promise<Date | null> {
    const legIds = await this.legIdsFor(requirementId);
    const arrDates: Date[] = [];

    for (const legId of legIds) {
      const arrDate = legId === changedLegId
        ? changedLegArrDateZ
        : (await this.legRepo.findOne({ where: { id: legId } }))?.arrDate ?? null;
      if (arrDate) arrDates.push(arrDate);
    }
    if (arrDates.length === 0) return null;

    const outside = arrDates.find((d) => validFrom && validTo && (d < validFrom || d > validTo));
    if (outside) return outside;

    return arrDates.sort((a, b) => a.getTime() - b.getTime())[0];
  }

  async reconcileForLeg(legId: string, currentArrDateZ: Date | null): Promise<void> {
    const legRows = await this.requirementLegRepo.find({ where: { legId } });

    for (const legRow of legRows) {
      const requirement = await this.requirementRepo.findOne({ where: { id: legRow.requirementId } });
      if (!requirement) continue;
      const serviceCase = await this.serviceCaseRepo.findOne({ where: { requirementId: requirement.id } });
      if (!serviceCase) continue;

      const arrDateToCheck = await this.pickArrDateForReconfirm(
        requirement.id, legId, currentArrDateZ, serviceCase.validFrom, serviceCase.validTo,
      );
      const nextStatus = evaluateReconfirm(
        { status: serviceCase.status, requiredByZ: requirement.requiredByZ, validFrom: serviceCase.validFrom, validTo: serviceCase.validTo },
        arrDateToCheck,
        new Date(),
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

    const legIds = await this.legIdsFor(requirement.id);
    const serviceOrder = await this.serviceOrderRepo.findOne({ where: { serviceCaseId } });

    return this.commRepo.save(
      this.commRepo.create({
        direction: 'INBOUND',
        legId: legIds[0] ?? null,
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
