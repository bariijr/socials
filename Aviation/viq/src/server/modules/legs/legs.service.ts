import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { computeOverflightCountries, applyFirAdjustments } from '../../common/geo.util';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';

@Injectable()
export class LegsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly stops: StopsService,
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

  async findOne(legId: string) {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    return leg;
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

  // Item 16: when consecutive legs connect (this leg's arrival = another
  // leg's departure, or vice versa), that airport is a real stop the trip
  // makes — ensure a Stop row exists for it instead of requiring it to be
  // added by hand. Ground handling itself doesn't depend on this Stop row
  // existing (ServicesService.generateArrivalServices already fires per-leg
  // arrival unconditionally) — this only fixes the Stops tab/summary being
  // silently incomplete for a connecting airport.
  private async ensureConnectingStops(tripId: string, user: string) {
    const legs = await this.prisma.leg.findMany({ where: { tripId }, orderBy: { seq: 'asc' } });
    const existingStops = await this.prisma.stop.findMany({ where: { tripId } });
    const stopIcaos = new Set(existingStops.map((s) => s.icao));

    for (let i = 0; i < legs.length - 1; i++) {
      const current = legs[i];
      const next = legs[i + 1];
      if (current.arrIcao !== next.depIcao) continue; // not a connecting route
      const icao = current.arrIcao;
      if (stopIcaos.has(icao)) continue;

      const stopId = `${tripId}-STOP-${icao}-${Date.now().toString(36).toUpperCase()}`;
      const groundTimeHours = Math.max(0, (next.etdZ.getTime() - current.etaZ.getTime()) / (1000 * 60 * 60));
      await this.stops.create({
        stopId,
        tripId,
        icao,
        arrZ: current.etaZ.toISOString(),
        depZ: next.etdZ.toISOString(),
        groundTimeHours,
        purpose: 'Tech',
        user,
      });
      stopIcaos.add(icao); // don't create a second Stop for the same airport within this pass
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

    return leg;
  }

  async update(legId: string, dto: UpdateLegDto) {
    const before = await this.findOne(legId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, generateServices, departureGroundHandling, ...data } = dto;

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

    const leg = await this.prisma.leg.update({ where: { legId }, data });
    await this.audit.logDiff(user, 'Leg', legId, before as unknown as Record<string, unknown>, leg as unknown as Record<string, unknown>);

    if (reconcileOverflight) {
      await this.services.reconcileOverflightServices(legId, user);
    }

    if (generateServices) {
      await this.services.generateOverflightServices(legId, user);
      await this.services.generateArrivalServices(legId, { departureGroundHandling }, user);
    }

    return leg;
  }

  async remove(legId: string, user = 'SYSTEM') {
    await this.findOne(legId);
    await this.prisma.leg.delete({ where: { legId } });
    await this.audit.log(user, 'Leg', legId, 'Deleted', legId, '');
    return { legId, deleted: true };
  }
}
