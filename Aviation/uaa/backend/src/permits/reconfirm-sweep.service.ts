import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ServiceCase } from '../service-cases/service-case.entity';
import { Requirement } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
import { Leg } from '../legs/leg.entity';
import { evaluateReconfirm } from './reconfirm';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class ReconfirmSweepService {
  private readonly logger = new Logger(ReconfirmSweepService.name);

  constructor(
    @InjectRepository(ServiceCase) private readonly serviceCaseRepo: Repository<ServiceCase>,
    @InjectRepository(Requirement) private readonly requirementRepo: Repository<Requirement>,
    @InjectRepository(RequirementLeg) private readonly requirementLegRepo: Repository<RequirementLeg>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async scheduledSweep() {
    const flipped = await this.sweep();
    if (flipped > 0) this.logger.log(`Reconfirm sweep flipped ${flipped} service case(s).`);
  }

  private pickArrDate(arrDates: Date[], validFrom: Date | null, validTo: Date | null): Date | null {
    if (arrDates.length === 0) return null;
    const outside = arrDates.find((d) => validFrom && validTo && (d < validFrom || d > validTo));
    if (outside) return outside;
    return arrDates.sort((a, b) => a.getTime() - b.getTime())[0];
  }

  async sweep(): Promise<number> {
    const serviceCases = await this.serviceCaseRepo.find({
      where: [{ status: Not(In(['CANCELLED', 'RECONFIRM_REQUIRED'])) }],
    });

    const now = new Date();
    let flipped = 0;

    for (const serviceCase of serviceCases) {
      if (serviceCase.status === 'CANCELLED') continue;

      const requirement = await this.requirementRepo.findOne({ where: { id: serviceCase.requirementId } });
      const legRows = requirement
        ? await this.requirementLegRepo.find({ where: { requirementId: requirement.id } })
        : [];

      const arrDates: Date[] = [];
      for (const row of legRows) {
        const leg = await this.legRepo.findOne({ where: { id: row.legId } });
        if (leg?.arrDate) arrDates.push(leg.arrDate);
      }
      const arrDateToCheck = this.pickArrDate(arrDates, serviceCase.validFrom, serviceCase.validTo);

      const nextStatus = evaluateReconfirm(
        {
          status: serviceCase.status,
          requiredByZ: requirement?.requiredByZ ?? null,
          validFrom: serviceCase.validFrom,
          validTo: serviceCase.validTo,
        },
        arrDateToCheck,
        now,
      );
      if (nextStatus !== serviceCase.status) {
        serviceCase.status = nextStatus;
        await this.serviceCaseRepo.save(serviceCase);
        flipped++;
      }
    }

    return flipped;
  }
}
