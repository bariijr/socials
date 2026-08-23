import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermitRequest } from './permit-request.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { renderTemplate } from '../form-templates/template-renderer';
import { computeRequiredByZ } from './permit-deadline';
import { evaluateReconfirm } from './reconfirm';
import { MailService } from '../mail/mail.service';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';

@Injectable()
export class PermitsService {
  constructor(
    @InjectRepository(PermitRequest) private readonly permitRequestRepo: Repository<PermitRequest>,
    @InjectRepository(Comm) private readonly commRepo: Repository<Comm>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    @InjectRepository(CountryRequirement) private readonly countryRequirementRepo: Repository<CountryRequirement>,
    @InjectRepository(FormTemplate) private readonly formTemplateRepo: Repository<FormTemplate>,
    private readonly mailService: MailService,
  ) {}

  async create(legId: string, country: string): Promise<PermitRequest> {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const countryRequirement = await this.countryRequirementRepo.findOne({ where: { country } });
    if (!countryRequirement) throw new NotFoundException(`No CountryRequirement for ${country}`);

    const requiredByZ = leg.arrDate
      ? new Date(computeRequiredByZ(leg.arrDate.toISOString(), countryRequirement))
      : null;

    const permitRequest = await this.permitRequestRepo.save(
      this.permitRequestRepo.create({
        legId,
        country,
        status: 'REQUESTED',
        requiredByZ,
        submissionEmail: countryRequirement.submissionEmail,
        correlationToken: '',
      }),
    );

    const correlationToken = `${leg.legId}/${permitRequest.id}`;
    permitRequest.correlationToken = correlationToken;
    await this.permitRequestRepo.save(permitRequest);

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
          permitRequestId: permitRequest.id,
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

    return permitRequest;
  }

  findByLeg(legId: string): Promise<PermitRequest[]> {
    return this.permitRequestRepo.find({ where: { legId } });
  }

  async update(id: string, dto: UpdatePermitRequestDto): Promise<PermitRequest> {
    const permitRequest = await this.permitRequestRepo.findOne({ where: { id } });
    if (!permitRequest) throw new NotFoundException(`PermitRequest ${id} not found`);

    if (dto.status) permitRequest.status = dto.status;
    if (dto.clearanceNumber) permitRequest.clearanceNumber = dto.clearanceNumber;
    if (dto.validFrom) permitRequest.validFrom = new Date(dto.validFrom);
    if (dto.validTo) permitRequest.validTo = new Date(dto.validTo);

    return this.permitRequestRepo.save(permitRequest);
  }

  async reconcileForLeg(legId: string, currentArrDateZ: Date | null): Promise<void> {
    const requests = await this.permitRequestRepo.find({ where: { legId } });
    const now = new Date();

    for (const request of requests) {
      const nextStatus = evaluateReconfirm(request, currentArrDateZ, now);
      if (nextStatus !== request.status) {
        request.status = nextStatus;
        await this.permitRequestRepo.save(request);
      }
    }
  }
}
