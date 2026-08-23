import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Leg } from './leg.entity';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { buildMayflyWorkbook } from './mayfly-export';
import { TripsService } from '../trips/trips.service';

@Injectable()
export class LegsService {
  constructor(
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    private readonly tripsService: TripsService,
  ) {}

  async create(dto: CreateLegDto): Promise<Leg> {
    const currentMax = await this.legRepo.maximum('legId');
    const legId = (currentMax ?? 0) + 1;
    const trip = await this.tripsService.findOrCreateByTripNo(dto.tripNo);
    const leg = this.legRepo.create({ ...dto, legId, tripId: trip.id });
    return this.legRepo.save(leg);
  }

  findAll(): Promise<Leg[]> {
    return this.legRepo.find({ order: { legId: 'ASC' } });
  }

  findOne(id: string): Promise<Leg | null> {
    return this.legRepo.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateLegDto): Promise<Leg> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);

    const tripNoChanged = dto.tripNo !== undefined && dto.tripNo !== leg.tripNo;

    Object.assign(leg, {
      ...dto,
      arrDate: dto.arrDate !== undefined ? new Date(dto.arrDate) : leg.arrDate,
      depDate: dto.depDate !== undefined ? new Date(dto.depDate) : leg.depDate,
    });

    if (tripNoChanged) {
      const trip = await this.tripsService.findOrCreateByTripNo(dto.tripNo!);
      leg.tripId = trip.id;
    }

    return this.legRepo.save(leg);
  }

  async markComplete(id: string): Promise<Leg> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);
    leg.completedAt = new Date();
    return this.legRepo.save(leg);
  }

  findCompletedInRange(from: Date, to: Date): Promise<Leg[]> {
    return this.legRepo.find({ where: { completedAt: Between(from, to) }, order: { completedAt: 'ASC' } });
  }

  async exportMayflyBuffer(from: Date, to: Date): Promise<Buffer> {
    const legs = await this.findCompletedInRange(from, to);
    return buildMayflyWorkbook(legs);
  }
}
