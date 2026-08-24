import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ServiceCase } from '../service-cases/service-case.entity';
import { Requirement } from '../service-cases/requirement.entity';
import { Leg } from '../legs/leg.entity';
import { evaluateReconfirm } from './reconfirm';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class ReconfirmSweepService {
  private readonly logger = new Logger(ReconfirmSweepService.name);

  constructor(
    @InjectRepository(ServiceCase) private readonly serviceCaseRepo: Repository<ServiceCase>,
    @InjectRepository(Requirement) private readonly requirementRepo: Repository<Requirement>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async scheduledSweep() {
    const flipped = await this.sweep();
    if (flipped > 0) this.logger.log(`Reconfirm sweep flipped ${flipped} service case(s).`);
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
      const leg = requirement ? await this.legRepo.findOne({ where: { id: requirement.legId } }) : null;
      const nextStatus = evaluateReconfirm(
        {
          status: serviceCase.status,
          requiredByZ: requirement?.requiredByZ ?? null,
          validFrom: serviceCase.validFrom,
          validTo: serviceCase.validTo,
        },
        leg?.arrDate ?? null,
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
