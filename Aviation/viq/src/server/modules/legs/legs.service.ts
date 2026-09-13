import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { computeOverflightCountries, applyFirAdjustments } from '../../common/geo.util';
import { isValidLegTransition, legReopenAllowed, withLegTransitions } from '../../common/statusTransitions';
import { OperationalEventsService } from '../operational-events/operational-events.service';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { CancelLegDto } from './dto/cancel-leg.dto';
import { CancelLegsDto } from './dto/cancel-legs.dto';

@Injectable()
export class LegsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly stops: StopsService,
    private readonly events: OperationalEventsService,
  ) {}

  findAll(tripId?: string) {
    return this.prisma.leg.findMany({
      where: tripId ? { tripId } : undefined,
      orderBy: { seq: 'asc' },
    });
  }

  async upcoming(limit: number, search?: string) {
    const where: Prisma.LegWhereInput = { etdZ: { gte: new Date() } };
    if (search) {
      const q = search.trim();
      where.OR = [
        { tripId: { contains: q, mode: 'insensitive' } },
        { depIcao: { contains: q, mode: 'insensitive' } },
        { arrIcao: { contains: q, mode: 'insensitive' } },
        { trip: { registration: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.leg.findMany({
      where,
      orderBy: { etdZ: 'asc' },
      take: limit,
      include: { trip: { select: { tripId: true, registration: true, status: true } } },
    });
  }

  async findOne(legId: string, role?: string) {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    return withLegTransitions(leg, role);
  }

  // Server-side source of truth for "which countries does this route overfly" —
  // the great-circle approximation described in common/geo.util.ts.
  async computeOverflown(depIcao: string, arrIcao: string): Promise<string[]> {
    const [dep, arr] = await Promise.all([
      this.prisma.airport.findUnique({ where: { icao: depIcao } }),
      this.prisma.airport.findUnique({ where: { icao: arrIcao } }),
    ]);
    if (!dep || !arr) return [];
    const countries = await this.prisma.country.findMany({
      select: { iso2: true, centroidLat: true, centroidLng: true },
    });
    return computeOverflightCountries(
      { icao: dep.icao, latitude: dep.latitude, longitude: dep.longitude, countryIso2: dep.countryIso2 },
      { icao: arr.icao, latitude: arr.latitude, longitude: arr.longitude, countryIso2: arr.countryIso2 },
      countries.map((c) => ({ iso2: c.iso2, centroidLat: c.centroidLat, centroidLng: c.centroidLng })),
    );
  }

  // AvoidFIRs/IncludeFIRs entries are usually already a country ISO2 by the
  // time they reach here — TripDetail.tsx's normalizeFIR() converts a typed
  // country name/ISO2 client-side before saving — but this also accepts a
  // raw country name or a real ICAO FIR code (resolved via
  // ICAORule.inheritedCountryIso2) directly, so the automation is correct
  // for any caller, not just the one existing frontend path that happens to
  // pre-normalize. Anything that resolves to neither is dropped rather than
  // silently miscounted.
  private async resolveFirsToCountryIso2s(codes: string[]): Promise<string[]> {
    if (!codes.length) return [];
    const [countries, icaoRules] = await Promise.all([
      this.prisma.country.findMany({ select: { iso2: true, name: true } }),
      this.prisma.iCAORule.findMany({ select: { icao: true, inheritedCountryIso2: true } }),
    ]);
    const countrySet = new Set(countries.map((c) => c.iso2));
    const nameToIso2 = new Map(countries.map((c) => [c.name.toUpperCase(), c.iso2]));
    const icaoToCountry = new Map(icaoRules.map((r) => [r.icao, r.inheritedCountryIso2]));
    const resolved: string[] = [];
    for (const raw of codes) {
      const code = raw.trim().toUpperCase();
      if (countrySet.has(code)) { resolved.push(code); continue; }
      if (nameToIso2.has(code)) { resolved.push(nameToIso2.get(code)!); continue; }
      const inherited = icaoToCountry.get(code);
      if (inherited) resolved.push(inherited);
    }
    return [...new Set(resolved)];
  }

  // Item 16 (extended): when consecutive legs connect (this leg's arrival
  // = the next leg's departure), that airport is a real stop the trip
  // makes -- ensure a Stop row exists for it instead of requiring it to
  // be added by hand. Idempotency is checked per leg-transition
  // (Stop.afterLegId), never by ICAO alone -- a repeated-ICAO itinerary
  // (a demo flight landing at the same airport twice, or revisiting an
  // airport later in the trip) must get one Stop row per transition, not
  // one Stop row per distinct ICAO. See the Phase 0 assessment's
  // Conflict #1 for why the previous ICAO-Set-based dedup was wrong.
  //
  // Final-review fix: before creating a brand-new Stop for a connecting
  // transition, first look for a pre-existing *unlinked* Stop at that ICAO
  // on this trip (afterLegId: null) and claim it instead. Every trip that
  // existed before this Stop.afterLegId feature landed has stops in
  // exactly that shape (see prisma/seed.ts's OMDB stop on trip 2608001),
  // and the same shape reappears any time a leg is deleted (the FK is
  // onDelete: SetNull, so deleting a leg orphans its stop rather than
  // removing it) or a stop is added by hand. Creating unconditionally
  // there produced a silent duplicate Stop row and orphaned the original
  // -- along with any GroundHandling/Fuel services scoped to it. This
  // claim-before-create step mirrors scripts/backfill-stop-after-leg-id.ts,
  // which performs the same repair for pre-existing trips in bulk.
  private async ensureConnectingStops(tripId: string, user: string) {
    const legs = await this.prisma.leg.findMany({ where: { tripId }, orderBy: { seq: 'asc' } });

    for (let i = 0; i < legs.length - 1; i++) {
      const current = legs[i];
      const next = legs[i + 1];
      if (current.arrIcao !== next.depIcao) continue; // not a connecting route

      const already = await this.prisma.stop.findUnique({ where: { afterLegId: current.legId } });
      if (already) continue; // this specific transition already has its stop

      const icao = current.arrIcao;
      const arrZ = current.etaZ.toISOString();
      const depZ = next.etdZ.toISOString();
      const groundTimeHours = Math.max(0, (next.etdZ.getTime() - current.etaZ.getTime()) / (1000 * 60 * 60));

      // Claim an existing unlinked Stop at this ICAO on this trip instead
      // of creating a duplicate, if one is available. Goes straight to
      // Prisma (not StopsService.update/UpdateStopDto) because afterLegId
      // is deliberately excluded from the public update DTO -- it's an
      // internal linkage the generator (and the backfill script) own, not
      // something a PATCH /stops/:id caller should be able to rewrite.
      const unclaimed = await this.prisma.stop.findFirst({ where: { tripId, icao, afterLegId: null } });
      if (unclaimed) {
        const updated = await this.prisma.stop.update({
          where: { stopId: unclaimed.stopId },
          data: { afterLegId: current.legId },
        });
        await this.audit.logDiff(
          user,
          'Stop',
          updated.stopId,
          unclaimed as unknown as Record<string, unknown>,
          updated as unknown as Record<string, unknown>,
        );
        continue;
      }

      // legId is already guaranteed unique per leg, so it's a safer
      // uniqueness source for stopId than Date.now() -- repeated-ICAO
      // transitions handled within the same loop pass (e.g.
      // FALA -> FALA -> FALA) could otherwise collide on the same
      // millisecond and violate the Stop primary key.
      const stopId = `${tripId}-STOP-${icao}-${current.legId}`;
      await this.stops.create({
        stopId,
        tripId,
        icao,
        arrZ,
        depZ,
        groundTimeHours,
        purpose: 'Tech',
        afterLegId: current.legId,
        user,
      });
    }
  }

  async create(dto: CreateLegDto) {
    const user = dto.user || 'SYSTEM';
    let countriesOverflown = dto.countriesOverflown;
    if (!countriesOverflown) {
      const geometric = await this.computeOverflown(dto.depIcao, dto.arrIcao);
      const [include, avoid] = await Promise.all([
        this.resolveFirsToCountryIso2s(dto.includeFirs ?? []),
        this.resolveFirsToCountryIso2s(dto.avoidFirs ?? []),
      ]);
      countriesOverflown = applyFirAdjustments(geometric, include, avoid);
    }

    // dto.status is intentionally NOT included below, even though
    // CreateLegDto validates it -- accepting it here would let a caller
    // create a Leg directly into Active/Completed/Cancelled, bypassing
    // LEG_TRANSITIONS entirely and leaving statusChangedAt/statusChangedBy
    // null. A new Leg always starts Planned (the schema default); all
    // status movement must go through update(), where the transition graph
    // is actually enforced.
    const leg = await this.prisma.leg.create({
      data: {
        legId: dto.legId,
        tripId: dto.tripId,
        seq: dto.seq,
        depIcao: dto.depIcao,
        arrIcao: dto.arrIcao,
        etdZ: dto.etdZ,
        etaZ: dto.etaZ,
        blockHours: dto.blockHours ?? 0,
        paxCount: dto.paxCount ?? 0,
        crewCount: dto.crewCount ?? 0,
        countriesOverflown,
        revision: dto.revision ?? 1,
        callSign: dto.callSign,
        avoidFirs: dto.avoidFirs ?? [],
        includeFirs: dto.includeFirs ?? [],
      },
    });
    await this.audit.log(user, 'Leg', leg.legId, 'Created', '', leg.legId);

    // Item 16: a connecting route (this leg's arrival = another leg's
    // departure) gets its intermediate Stop auto-created — safe to attempt
    // on every leg creation, not just the second of a pair, since whichever
    // leg lands second is the one that actually completes a connection.
    await this.ensureConnectingStops(dto.tripId, user);

    if (dto.generateServices !== false) {
      await this.services.generateOverflightServices(leg.legId, user);
      await this.services.generateArrivalServices(leg.legId, { departureGroundHandling: dto.departureGroundHandling }, user);
    }

    return withLegTransitions(leg);
  }

  async update(legId: string, dto: UpdateLegDto, role?: string) {
    const before = await this.prisma.leg.findUnique({ where: { legId } });
    if (!before) throw new NotFoundException(`Leg ${legId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, generateServices, departureGroundHandling, version, ...data } = dto;

    if (data.status && data.status !== before.status) {
      if (!isValidLegTransition(before.status, data.status)) {
        throw new BadRequestException(`Cannot transition Leg from "${before.status}" to "${data.status}"`);
      }
      if (!legReopenAllowed(before.status, role)) {
        throw new ForbiddenException('Reopening a Completed leg requires the Admin role');
      }
    }

    // Route or Avoid/Include FIRs changed → recompute overflown countries,
    // unless the caller passed an explicit list. Item 16: this is also what
    // makes Avoid/Include actually affect anything — before this, changing
    // either field only ever changed what was displayed, never what
    // countriesOverflown (and therefore which Overflight services exist)
    // actually was.
    const firsChanged = dto.avoidFirs !== undefined || dto.includeFirs !== undefined;
    let reconcileOverflight = false;
    if ((dto.depIcao || dto.arrIcao || firsChanged) && !dto.countriesOverflown) {
      const geometric = await this.computeOverflown(
        dto.depIcao ?? before.depIcao,
        dto.arrIcao ?? before.arrIcao,
      );
      const [include, avoid] = await Promise.all([
        this.resolveFirsToCountryIso2s(dto.includeFirs ?? before.includeFirs),
        this.resolveFirsToCountryIso2s(dto.avoidFirs ?? before.avoidFirs),
      ]);
      data.countriesOverflown = applyFirAdjustments(geometric, include, avoid);
      reconcileOverflight = true;
    }

    const statusChanging = data.status !== undefined && data.status !== before.status;
    const result = await this.prisma.leg.updateMany({
      where: { legId, version },
      data: {
        ...data,
        version: { increment: 1 },
        ...(statusChanging ? { statusChangedAt: new Date(), statusChangedBy: user } : {}),
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.leg.findUnique({ where: { legId } });
      const history = await this.audit.forRecord('Leg', legId);
      const latest = history[0];
      throw new ConflictException({
        message: `Leg ${legId} was modified by someone else`,
        current: current ? withLegTransitions(current, role) : current,
        changedBy: latest?.user,
        changedAt: latest?.timestampZ,
      });
    }

    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    await this.audit.logDiff(user, 'Leg', legId, before as unknown as Record<string, unknown>, leg as unknown as Record<string, unknown>);

    // Snapshot which services were ALREADY Confirmed before the
    // reconcile/generate calls below run. Those calls can create brand-new
    // services already Confirmed (auto-matched against a Verified
    // PermitAuthorization for the NEW post-update ETD) -- without this
    // snapshot, the Change Impact triggers further down would immediately
    // re-flag those same-call creations as needing reconfirmation against a
    // change they were never actually granted before.
    const preExistingConfirmedIds = (await this.prisma.service.findMany({
      where: { scopeId: legId, status: 'Confirmed' },
      select: { svcId: true },
    })).map((s) => s.svcId);

    if (reconcileOverflight) {
      await this.services.reconcileOverflightServices(legId, user);
    }

    if (generateServices) {
      await this.services.generateOverflightServices(legId, user);
      await this.services.generateArrivalServices(legId, { departureGroundHandling }, user);
    }

    // Change Impact triggers -- only ever touch services already Confirmed
    // before this call started (see preExistingConfirmedIds above and
    // ServicesService.flagConfirmedServicesForScheduleChange /
    // flagConfirmedServices for why). Route change is checked BEFORE the
    // schedule checks: a route change is categorically a different permit
    // application (the more consequential fact), while a schedule check
    // running first would flip a matching service away from Confirmed,
    // leaving nothing for the route check to find and silently dropping
    // the route reason whenever both changes land in the same update.
    const icaoChanged = (dto.depIcao !== undefined && before.depIcao !== leg!.depIcao)
      || (dto.arrIcao !== undefined && before.arrIcao !== leg!.arrIcao);
    const routeChanged = icaoChanged
      || JSON.stringify(before.countriesOverflown) !== JSON.stringify(leg!.countriesOverflown);
    if (routeChanged) {
      const changedSegments: string[] = [];
      if (dto.depIcao !== undefined && before.depIcao !== leg!.depIcao) changedSegments.push(`dep ${before.depIcao} → ${leg!.depIcao}`);
      if (dto.arrIcao !== undefined && before.arrIcao !== leg!.arrIcao) changedSegments.push(`arr ${before.arrIcao} → ${leg!.arrIcao}`);
      const reason = changedSegments.length > 0
        ? `route changed: ${changedSegments.join(', ')}`
        : 'overflown countries changed';
      await this.services.flagConfirmedServices({ scopeId: legId }, reason, user, preExistingConfirmedIds);
    }
    if (dto.etdZ !== undefined && before.etdZ.getTime() !== leg!.etdZ.getTime()) {
      await this.services.flagConfirmedServicesForScheduleChange(legId, before.etdZ, leg!.etdZ, 'ETD', user, preExistingConfirmedIds);
    }
    if (dto.etaZ !== undefined && before.etaZ.getTime() !== leg!.etaZ.getTime()) {
      await this.services.flagConfirmedServicesForScheduleChange(legId, before.etaZ, leg!.etaZ, 'ETA', user, preExistingConfirmedIds);
    }

    return withLegTransitions(leg!, role);
  }

  async remove(legId: string, user = 'SYSTEM') {
    await this.findOne(legId);
    await this.prisma.leg.delete({ where: { legId } });
    await this.audit.log(user, 'Leg', legId, 'Deleted', legId, '');
    return { legId, deleted: true };
  }

  // "Requested" bucket generalizes Requested/Chasing/Re-confirm Required
  // (all mean "a request is already in flight"); "notStarted" generalizes
  // Not Started/Submission Pending/Submission Failed (nothing has been
  // sent yet). Matches the mega-spec §4's three-bucket impact preview.
  private static readonly REQUESTED_STATUSES = ['Requested', 'Chasing', 'Re-confirm Required'];
  private static readonly NOT_STARTED_STATUSES = ['Not Started', 'Submission Pending', 'Submission Failed'];

  async previewLegCancellation(legId: string) {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    const affected = await this.prisma.service.findMany({
      where: { scopeId: legId, status: { not: 'Cancelled' } },
      select: { status: true, providerId: true },
    });
    const confirmed = affected.filter((s) => s.status === 'Confirmed').length;
    const requested = affected.filter((s) => LegsService.REQUESTED_STATUSES.includes(s.status)).length;
    const notStarted = affected.filter((s) => LegsService.NOT_STARTED_STATUSES.includes(s.status)).length;
    const vendorNotifications = new Set(affected.filter((s) => s.providerId).map((s) => s.providerId)).size;
    return {
      legId,
      route: `${leg.depIcao} → ${leg.arrIcao}`,
      servicesAffected: affected.length,
      confirmed,
      requested,
      notStarted,
      vendorNotifications,
      crewCount: leg.crewCount,
      paxCount: leg.paxCount,
    };
  }

  async cancelLeg(legId: string, dto: CancelLegDto, role?: string) {
    const before = await this.prisma.leg.findUnique({ where: { legId } });
    if (!before) throw new NotFoundException(`Leg ${legId} not found`);
    if (!isValidLegTransition(before.status, 'Cancelled')) {
      throw new BadRequestException(`Cannot cancel a Leg with status "${before.status}"`);
    }
    if (!legReopenAllowed(before.status, role)) {
      throw new ForbiddenException('Cancelling from this status requires the Admin role');
    }
    const user = dto.user || 'SYSTEM';
    const cancelledAtZ = new Date();

    const affectedServices = await this.cancelLegTransaction(legId, before, dto, user, cancelledAtZ);

    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    await this.audit.logDiff(user, 'Leg', legId, before as unknown as Record<string, unknown>, leg as unknown as Record<string, unknown>);
    this.events.emit({ type: 'LEG_CANCELLED', legId, tripId: leg!.tripId, reason: dto.reason, user });
    for (const svc of affectedServices) {
      this.events.emit({ type: 'SERVICE_CANCELLED', svcId: svc.svcId, tripId: leg!.tripId, providerId: svc.providerId, reason: dto.reason, user });
    }
    return withLegTransitions(leg!, role);
  }

  async cancelLegs(legIds: string[], dto: CancelLegsDto) {
    const user = dto.user || 'SYSTEM';
    const results = [];
    for (const legId of legIds) {
      const before = await this.prisma.leg.findUnique({ where: { legId } });
      if (!before) throw new NotFoundException(`Leg ${legId} not found`);
      if (!isValidLegTransition(before.status, 'Cancelled')) {
        throw new BadRequestException(`Cannot cancel Leg ${legId} with status "${before.status}"`);
      }
      const cancelledAtZ = new Date();
      const affectedServices = await this.cancelLegTransaction(legId, before, dto, user, cancelledAtZ);

      const leg = await this.prisma.leg.findUnique({ where: { legId } });
      await this.audit.logDiff(user, 'Leg', legId, before as unknown as Record<string, unknown>, leg as unknown as Record<string, unknown>);
      this.events.emit({ type: 'LEG_CANCELLED', legId, tripId: leg!.tripId, reason: dto.reason, user });
      for (const svc of affectedServices) {
        this.events.emit({ type: 'SERVICE_CANCELLED', svcId: svc.svcId, tripId: leg!.tripId, providerId: svc.providerId, reason: dto.reason, user });
      }
      results.push(withLegTransitions(leg!));
    }
    return results;
  }

  // Shared by cancelLeg (caller-pinned version) and cancelLegs (freshly
  // read per Leg) -- both call this with `before` already loaded and
  // already validated, so this only ever performs the write.
  private async cancelLegTransaction(
    legId: string,
    before: { version: number },
    dto: { reason: string; remarks?: string; version?: number },
    user: string,
    cancelledAtZ: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.leg.updateMany({
        where: { legId, version: dto.version ?? before.version },
        data: {
          status: 'Cancelled',
          statusChangedAt: cancelledAtZ,
          statusChangedBy: user,
          cancellationReason: dto.reason,
          cancellationRemarks: dto.remarks,
          cancelledBy: user,
          cancelledAtZ,
          version: { increment: 1 },
        },
      });
      const affected = await tx.service.findMany({ where: { scopeId: legId, status: { not: 'Cancelled' } } });
      if (affected.length > 0) {
        await tx.service.updateMany({
          where: { svcId: { in: affected.map((s) => s.svcId) } },
          data: {
            status: 'Cancelled',
            statusChangedAt: cancelledAtZ,
            statusChangedBy: user,
            cancellationReason: dto.reason,
            cancellationRemarks: dto.remarks,
            cancelledBy: user,
            cancelledAtZ,
            version: { increment: 1 },
          },
        });
      }
      return affected;
    });
  }
}
