import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // YYMM + sequence within that month, e.g. 2608005 for the 5th trip created in Aug 2026.
  async nextTripId(): Promise<string> {
    const now = new Date();
    const prefix = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Atomic upsert-increment — a single SQL statement, so Postgres's own
    // row-level locking on the "trip_id_counters" row serializes concurrent
    // callers (including across multiple server processes), unlike the
    // previous count()-then-format() approach this replaces.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO trip_id_counters (prefix, count)
      VALUES (${prefix}, 1)
      ON CONFLICT (prefix) DO UPDATE SET count = trip_id_counters.count + 1
      RETURNING count
    `;
    return `${prefix}${String(rows[0].count).padStart(3, '0')}`;
  }

  findAll() {
    return this.prisma.trip.findMany({ orderBy: { createdZ: 'desc' } });
  }

  async findAllPaginated(
    page: number,
    limit: number,
    search?: string,
    opts: { upcomingHours?: number; enquiriesOnly?: boolean } = {},
  ) {
    const skip = (page - 1) * limit;
    const conditions: Prisma.TripWhereInput[] = [];
    if (search) {
      conditions.push({
        OR: [
          { tripId: { contains: search, mode: 'insensitive' } },
          { client: { contains: search, mode: 'insensitive' } },
          { registration: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (opts.upcomingHours) {
      // Matches GET /legs/upcoming's own "now" convention (real wall-clock
      // time via `new Date()`), not the frontend's fixed demo-data epoch —
      // kept consistent with that sibling endpoint rather than reinvented here.
      const now = new Date();
      const cutoff = new Date(now.getTime() + opts.upcomingHours * 60 * 60 * 1000);
      conditions.push({ legs: { some: { etdZ: { gte: now, lte: cutoff } } } });
    }
    if (opts.enquiriesOnly) {
      conditions.push({ owner: 'Web Enquiry', status: 'Planning' });
    }
    const where: Prisma.TripWhereInput | undefined = conditions.length ? { AND: conditions } : undefined;
    const [data, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { createdZ: 'desc' },
        skip,
        take: limit,
        include: {
          legs: {
            orderBy: { seq: 'asc' },
            select: { legId: true, seq: true, depIcao: true, arrIcao: true, etdZ: true, etaZ: true },
          },
          _count: { select: { stops: true, services: true, comms: true } },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findOne(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { tripId } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    return trip;
  }

  // Full trip sheet: trip + legs (each carrying its own leg-scoped
  // persons) + stops + services + docs + comms.
  async sheet(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { tripId },
      include: {
        legs: { orderBy: { seq: 'asc' }, include: { assignments: { include: { person: true } } } },
        stops: true,
        services: true,
        docs: true,
        comms: { orderBy: { timestampZ: 'desc' } },
      },
    });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    const legs = trip.legs.map(({ assignments, ...leg }) => ({
      ...leg,
      persons: assignments.map((a) => ({ ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel })),
    }));
    const { legs: _legs, ...rest } = trip;
    return { ...rest, legs };
  }

  async create(dto: CreateTripDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const trip = await this.prisma.trip.create({ data });
    await this.audit.log(user, 'Trip', trip.tripId, 'Created', '', trip.tripId);
    return trip;
  }

  async update(tripId: string, dto: UpdateTripDto) {
    const before = await this.findOne(tripId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const trip = await this.prisma.trip.update({ where: { tripId }, data });
    await this.audit.logDiff(user, 'Trip', tripId, before as unknown as Record<string, unknown>, trip as unknown as Record<string, unknown>);
    return trip;
  }

  async remove(tripId: string, user = 'SYSTEM') {
    await this.findOne(tripId);
    await this.prisma.trip.delete({ where: { tripId } });
    await this.audit.log(user, 'Trip', tripId, 'Deleted', tripId, '');
    return { tripId, deleted: true };
  }
}
