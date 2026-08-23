import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip } from './trip.entity';
import { Leg } from '../legs/leg.entity';

export interface TripWorkspace {
  tripNo: string;
  tails: string[];
  operatorNames: string[];
  countries: string[];
  legCount: number;
  firstDeparture: Date | null;
  lastArrival: Date | null;
  status: 'ACTIVE' | 'COMPLETED';
  legs: Leg[];
}

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
  ) {}

  async findOrCreateByTripNo(tripNo: string): Promise<Trip> {
    const existing = await this.tripRepo.findOne({ where: { tripNo } });
    if (existing) return existing;
    return this.tripRepo.save(this.tripRepo.create({ tripNo }));
  }

  async getWorkspace(tripNo: string): Promise<TripWorkspace> {
    const trip = await this.tripRepo.findOne({ where: { tripNo } });
    if (!trip) throw new NotFoundException(`Trip ${tripNo} not found`);

    const legs = await this.legRepo.find({ where: { tripId: trip.id }, order: { legId: 'ASC' } });

    const tails = Array.from(new Set(legs.map((l) => l.tail).filter((t): t is string => !!t)));
    const operatorNames = Array.from(new Set(legs.map((l) => l.operatorName).filter((o): o is string => !!o)));
    const countries = Array.from(new Set(legs.map((l) => l.country).filter((c): c is string => !!c)));
    const departures = legs.map((l) => l.depDate).filter((d): d is Date => d != null);
    const arrivals = legs.map((l) => l.arrDate).filter((d): d is Date => d != null);
    const status: 'ACTIVE' | 'COMPLETED' = legs.every((l) => l.completedAt) ? 'COMPLETED' : 'ACTIVE';

    return {
      tripNo,
      tails,
      operatorNames,
      countries,
      legCount: legs.length,
      firstDeparture: departures.length ? new Date(Math.min(...departures.map((d) => d.getTime()))) : null,
      lastArrival: arrivals.length ? new Date(Math.max(...arrivals.map((d) => d.getTime()))) : null,
      status,
      legs,
    };
  }
}
