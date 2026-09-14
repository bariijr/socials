import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isValidTripTransition, tripReopenAllowed, withTripTransitions, withServiceTransitions, withLegTransitions } from '../../common/statusTransitions';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { LegsService } from '../legs/legs.service';
import { OperationalEventsService } from '../operational-events/operational-events.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly legs: LegsService,
    private readonly events: OperationalEventsService,
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

  async findOne(tripId: string, role?: string) {
    const trip = await this.prisma.trip.findUnique({ where: { tripId } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    return withTripTransitions(trip, role);
  }

  // Full trip sheet: trip + legs (each carrying its own leg-scoped
  // persons) + stops + services + docs + comms.
  async sheet(tripId: string, role?: string) {
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
      ...withLegTransitions(leg, role),
      persons: assignments.map((a) => ({ ...a.person, role: a.role, commercialFlightEta: a.commercialFlightEta, hotel: a.hotel })),
    }));
    const { legs: _legs, services, ...rest } = trip;
    return { ...withTripTransitions(rest, role), legs, services: services.map(withServiceTransitions) };
  }

  // Aggregates each non-terminal Leg's own previewLegCancellation() across
  // the Trip. previewLegCancellation returns FOUR buckets -- confirmed,
  // requested, notStarted, and notRequired (the last added during Task 3's
  // review for a Service sitting in status "Not Required", which none of
  // the other three buckets cover) -- so the same four are summed here to
  // keep confirmed+requested+notStarted+notRequired === servicesAffected
  // holding at the Trip level too, not just per-Leg.
  async previewTripCancellation(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { tripId }, include: { legs: true } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    const nonTerminal = trip.legs.filter((l) => l.status !== 'Completed' && l.status !== 'Cancelled');
    const legPreviews = await Promise.all(nonTerminal.map((l) => this.legs.previewLegCancellation(l.legId)));
    return {
      tripId,
      legsToCancel: nonTerminal.length,
      servicesAffected: legPreviews.reduce((sum, p) => sum + p.servicesAffected, 0),
      confirmed: legPreviews.reduce((sum, p) => sum + p.confirmed, 0),
      requested: legPreviews.reduce((sum, p) => sum + p.requested, 0),
      notStarted: legPreviews.reduce((sum, p) => sum + p.notStarted, 0),
      notRequired: legPreviews.reduce((sum, p) => sum + p.notRequired, 0),
      vendorNotifications: legPreviews.reduce((sum, p) => sum + p.vendorNotifications, 0),
    };
  }

  // Cancels every non-terminal (not already Completed/Cancelled) Leg on the
  // Trip via LegsService.cancelLegs() -- which reads each Leg's own version
  // fresh right before writing, with no caller-supplied per-Leg version;
  // see Task 3's cancelLegs for that convention -- then cancels the Trip
  // itself under its own caller-supplied optimistic-lock version. Completed
  // Legs are left untouched entirely (the §101 acceptance scenario). If
  // cancelLegs throws partway through its batch, Legs it already committed
  // stay cancelled with their events already fired -- an accepted, already-
  // reviewed Task 3 design choice this method inherits as-is.
  async cancelTrip(tripId: string, dto: CancelTripDto, role?: string) {
    const before = await this.prisma.trip.findUnique({ where: { tripId }, include: { legs: true } });
    if (!before) throw new NotFoundException(`Trip ${tripId} not found`);
    if (!isValidTripTransition(before.status, 'Cancelled')) {
      throw new BadRequestException(`Cannot cancel a Trip with status "${before.status}"`);
    }
    // Checked here, before any Leg is touched -- cancelLegs() below commits
    // and cancels each Leg irreversibly (events already fired) with no
    // surrounding cross-Leg transaction, so a stale version caught only by
    // the final trip.updateMany would leave every Leg Cancelled while the
    // Trip itself stays unchanged and the caller sees a 409 that looks like
    // nothing happened. This catches the overwhelmingly common case (a
    // genuinely stale caller) up front.
    if (before.version !== dto.version) {
      throw new ConflictException({
        message: `Trip ${tripId} was modified by someone else`,
        current: withTripTransitions(before, role),
      });
    }
    const user = dto.user || 'SYSTEM';

    const nonTerminalLegIds = before.legs
      .filter((l) => l.status !== 'Completed' && l.status !== 'Cancelled')
      .map((l) => l.legId);
    if (nonTerminalLegIds.length > 0) {
      await this.legs.cancelLegs(nonTerminalLegIds, { legIds: nonTerminalLegIds, reason: dto.reason, remarks: dto.remarks, user });
    }

    const result = await this.prisma.trip.updateMany({
      where: { tripId, version: dto.version },
      data: {
        status: 'Cancelled',
        statusChangedAt: new Date(),
        statusChangedBy: user,
        cancellationReason: dto.reason,
        cancellationRemarks: dto.remarks,
        cancelledBy: user,
        cancelledAtZ: new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      // Narrow defense-in-depth guard against a genuine concurrent edit
      // landing during the cancelLegs() calls above (rare -- the early
      // version check further up catches the common stale-caller case
      // before any Leg is touched). By the time this fires, the Legs really
      // have already been cancelled, so the message below says so rather
      // than implying nothing happened.
      const current = await this.prisma.trip.findUnique({ where: { tripId } });
      throw new ConflictException({
        message: `Trip ${tripId} was modified during cancellation — its Legs have already been cancelled; retry to finish cancelling the Trip itself.`,
        current: current ? withTripTransitions(current, role) : current,
      });
    }

    const trip = await this.prisma.trip.findUnique({ where: { tripId } });
    // `before` was fetched with `include: { legs: true }` (needed above for
    // nonTerminalLegIds) -- strip that key before diffing against `trip`
    // (a plain findUnique with no include), or logDiff's shallow top-level
    // String(value) comparison sees before.legs stringify to
    // "[object Object],..." against trip's missing `legs` key entirely and
    // writes a bogus "legs changed" AuditEntry on every cancellation. Same
    // pattern sheet() already uses to drop legs before returning.
    const { legs: _legs, ...beforePlain } = before;
    await this.audit.logDiff(user, 'Trip', tripId, beforePlain as unknown as Record<string, unknown>, trip as unknown as Record<string, unknown>);
    this.events.emit({ type: 'TRIP_CANCELLED', tripId, reason: dto.reason, user });
    return withTripTransitions(trip!, role);
  }

  async create(dto: CreateTripDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const trip = await this.prisma.trip.create({ data });
    await this.audit.log(user, 'Trip', trip.tripId, 'Created', '', trip.tripId);
    return withTripTransitions(trip);
  }

  async update(tripId: string, dto: UpdateTripDto, role?: string) {
    const before = await this.prisma.trip.findUnique({ where: { tripId } });
    if (!before) throw new NotFoundException(`Trip ${tripId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, version, ...data } = dto;

    if (data.status && data.status !== before.status) {
      if (!isValidTripTransition(before.status, data.status)) {
        throw new BadRequestException(`Cannot transition Trip from "${before.status}" to "${data.status}"`);
      }
      if (!tripReopenAllowed(before.status, role)) {
        throw new ForbiddenException('Reopening a Complete trip requires the Admin role');
      }
    }

    const statusChanging = data.status !== undefined && data.status !== before.status;
    const result = await this.prisma.trip.updateMany({
      where: { tripId, version },
      data: {
        ...data,
        version: { increment: 1 },
        ...(statusChanging ? { statusChangedAt: new Date(), statusChangedBy: user } : {}),
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.trip.findUnique({ where: { tripId } });
      const history = await this.audit.forRecord('Trip', tripId);
      const latest = history[0];
      throw new ConflictException({
        message: `Trip ${tripId} was modified by someone else`,
        current: withTripTransitions(current!, role),
        changedBy: latest?.user,
        changedAt: latest?.timestampZ,
      });
    }

    const trip = await this.prisma.trip.findUnique({ where: { tripId } });
    await this.audit.logDiff(user, 'Trip', tripId, before as unknown as Record<string, unknown>, trip as unknown as Record<string, unknown>);

    const operatorChanged = data.operator !== undefined && data.operator !== before.operator;
    const registrationChanged = data.registration !== undefined && data.registration !== before.registration;
    if (operatorChanged || registrationChanged) {
      const changes: string[] = [];
      if (operatorChanged) changes.push(`operator changed from ${before.operator ?? 'unset'} to ${data.operator}`);
      if (registrationChanged) changes.push(`registration changed from ${before.registration ?? 'unset'} to ${data.registration}`);
      await this.services.flagConfirmedServices({ tripId }, changes.join('; '), user);
    }

    return withTripTransitions(trip!, role);
  }

  async remove(tripId: string, user = 'SYSTEM') {
    await this.findOne(tripId);
    await this.prisma.trip.delete({ where: { tripId } });
    await this.audit.log(user, 'Trip', tripId, 'Deleted', tripId, '');
    return { tripId, deleted: true };
  }
}
