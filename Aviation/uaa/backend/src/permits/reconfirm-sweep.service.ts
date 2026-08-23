import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { PermitRequest } from './permit-request.entity';
import { Leg } from '../legs/leg.entity';
import { evaluateReconfirm } from './reconfirm';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class ReconfirmSweepService {
  private readonly logger = new Logger(ReconfirmSweepService.name);

  constructor(
    @InjectRepository(PermitRequest) private readonly permitRequestRepo: Repository<PermitRequest>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async scheduledSweep() {
    const flipped = await this.sweep();
    if (flipped > 0) this.logger.log(`Reconfirm sweep flipped ${flipped} permit request(s).`);
  }

  async sweep(): Promise<number> {
    const requests = await this.permitRequestRepo.find({
      where: [{ status: Not(In(['CANCELLED', 'RECONFIRM_REQUIRED'])) }],
    });

    const now = new Date();
    let flipped = 0;

    for (const request of requests) {
      if (request.status === 'CANCELLED') continue;

      const leg = await this.legRepo.findOne({ where: { id: request.legId } });
      const nextStatus = evaluateReconfirm(request, leg?.arrDate ?? null, now);
      if (nextStatus !== request.status) {
        request.status = nextStatus;
        await this.permitRequestRepo.save(request);
        flipped++;
      }
    }

    return flipped;
  }
}
