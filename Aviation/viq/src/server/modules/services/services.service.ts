import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Service, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { computeUrgency } from '../../common/geo.util';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { isValidServiceTransition, serviceAuthorizationLinkAllowed, withServiceTransitions } from '../../common/statusTransitions';

type ServiceType = 'Permit' | 'Overflight' | 'GroundHandling';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(tripId?: string) {
    return this.prisma.service.findMany({
      where: tripId ? { tripId } : undefined,
      orderBy: { requiredByZ: 'asc' },
    });
  }

  async open(limit: number, search?: string) {
    const where: Prisma.ServiceWhereInput = { status: { notIn: ['Confirmed', 'Not Required'] } };
    if (search) {
      const q = search.trim();
      where.OR = [
        { svcId: { contains: q, mode: 'insensitive' } },
        { serviceType: { contains: q, mode: 'insensitive' } },
        { tripId: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.service.findMany({
      where,
      orderBy: { requiredByZ: 'asc' },
      take: limit,
      include: { trip: { select: { tripId: true, registration: true } } },
    });
  }

  async findAllPaginated(page: number, limit: number, tripId?: string) {
    const skip = (page - 1) * limit;
    const where = tripId ? { tripId } : undefined;
    const [data, total] = await Promise.all([
      this.prisma.service.findMany({ where, orderBy: { requiredByZ: 'asc' }, skip, take: limit }),
      this.prisma.service.count({ where }),
    ]);
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  forScope(scopeType: string, scopeId: string) {
    return this.prisma.service.findMany({ where: { scopeType, scopeId } });
  }

  async findOne(svcId: string) {
    const svc = await this.prisma.service.findUnique({ where: { svcId } });
    if (!svc) throw new NotFoundException(`Service ${svcId} not found`);
    return withServiceTransitions(svc);
  }

  async create(dto: CreateServiceDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, subItems, ...data } = dto;
    const svc = await this.prisma.service.create({
      data: {
        ...data,
        subItems: subItems as Prisma.InputJsonValue | undefined,
        urgency: computeUrgency(data.requiredByZ),
      },
    });
    await this.audit.log(user, 'Service', svc.svcId, 'Created', '', svc.svcId);
    return withServiceTransitions(svc);
  }

  async update(svcId: string, dto: UpdateServiceDto) {
    const before = await this.prisma.service.findUnique({ where: { svcId } });
    if (!before) throw new NotFoundException(`Service ${svcId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, subItems, version, ...data } = dto;

    if (data.status && data.status !== before.status && !isValidServiceTransition(before.status, data.status)) {
      throw new BadRequestException(`Cannot transition Service from "${before.status}" to "${data.status}"`);
    }

    const requiredByZ = data.requiredByZ ?? before.requiredByZ.toISOString();
    const statusChanging = data.status !== undefined && data.status !== before.status;
    const result = await this.prisma.service.updateMany({
      where: { svcId, version },
      data: {
        ...data,
        subItems: subItems as Prisma.InputJsonValue | undefined,
        urgency: computeUrgency(requiredByZ),
        version: { increment: 1 },
        ...(statusChanging ? { statusChangedAt: new Date(), statusChangedBy: user } : {}),
      } as Prisma.ServiceUncheckedUpdateInput,
    });

    if (result.count === 0) {
      const current = await this.prisma.service.findUnique({ where: { svcId } });
      const history = await this.audit.forRecord('Service', svcId);
      const latest = history[0];
      throw new ConflictException({
        message: `Service ${svcId} was modified by someone else`,
        current: withServiceTransitions(current!),
        changedBy: latest?.user,
        changedAt: latest?.timestampZ,
      });
    }

    const svc = await this.prisma.service.findUnique({ where: { svcId } });
    await this.audit.logDiff(user, 'Service', svcId, before as unknown as Record<string, unknown>, svc as unknown as Record<string, unknown>);
    return withServiceTransitions(svc!);
  }

  async remove(svcId: string, user = 'SYSTEM') {
    const svc = await this.findOne(svcId);
    await this.prisma.service.delete({ where: { svcId } });
    // Record the dismissal so generateOverflightServices/generateArrivalServices
    // don't silently recreate this exact slot next time they run (Phase 0
    // Conflict #2). Country-less services were never auto-generation
    // candidates in the first place, so there's nothing to suppress.
    if (svc.countryIso2) {
      await this.prisma.dismissedServiceCandidate.upsert({
        where: {
          scopeType_scopeId_serviceType_countryIso2: {
            scopeType: svc.scopeType,
            scopeId: svc.scopeId,
            serviceType: svc.serviceType,
            countryIso2: svc.countryIso2,
          },
        },
        create: {
          tripId: svc.tripId,
          scopeType: svc.scopeType,
          scopeId: svc.scopeId,
          serviceType: svc.serviceType,
          countryIso2: svc.countryIso2,
          dismissedBy: user,
        },
        update: { dismissedAt: new Date(), dismissedBy: user },
      });
    }
    await this.audit.log(user, 'Service', svcId, 'Deleted', svcId, '');
    return { svcId, deleted: true };
  }

  // Validates the named authorization actually matches this service (same
  // operator/country/serviceType, and the service's requiredByZ falls in
  // its validity window) before applying — covers the common case where an
  // authorization is verified after the service already exists. This is a
  // system-assisted shortcut to Confirmed, not a coordinator status click,
  // so it checks serviceAuthorizationLinkAllowed rather than
  // isValidServiceTransition (see that function's doc comment) — and, like
  // update(), enforces optimistic locking via `version`.
  async linkAuthorization(svcId: string, authorizationId: string, version: number, user = 'SYSTEM') {
    const svc = await this.prisma.service.findUnique({ where: { svcId } });
    if (!svc) throw new NotFoundException(`Service ${svcId} not found`);
    const auth = await this.prisma.permitAuthorization.findUnique({ where: { id: authorizationId } });
    if (!auth) throw new NotFoundException(`PermitAuthorization ${authorizationId} not found`);
    if (auth.status !== 'Verified') {
      throw new BadRequestException(`Authorization ${authorizationId} is not Verified (status: ${auth.status})`);
    }
    if (!svc.countryIso2 || auth.countryIso2 !== svc.countryIso2 || auth.serviceType !== svc.serviceType) {
      throw new BadRequestException('Authorization does not match this service’s country/service type');
    }
    const trip = await this.prisma.trip.findUnique({ where: { tripId: svc.tripId }, select: { registration: true } });
    const aircraft = trip?.registration ? await this.prisma.aircraft.findUnique({ where: { registration: trip.registration } }) : null;
    if (!aircraft || aircraft.currentOperatorId !== auth.operatorId) {
      throw new BadRequestException('Authorization operator does not match this trip’s aircraft operator');
    }
    if (svc.requiredByZ < auth.validFrom || svc.requiredByZ > auth.validUntil) {
      throw new BadRequestException('Authorization validity window does not cover this service’s required date');
    }
    if (!serviceAuthorizationLinkAllowed(svc.status)) {
      throw new BadRequestException(`Cannot link an authorization to a service with status "${svc.status}"`);
    }

    const result = await this.prisma.service.updateMany({
      where: { svcId, version },
      data: {
        status: 'Confirmed',
        refNumber: auth.referenceNumber,
        validityZ: auth.validUntil,
        authorizationId: auth.id,
        notes: `${svc.notes} Linked to ${auth.authorizationType} permit ${auth.referenceNumber}.`.trim(),
        version: { increment: 1 },
        statusChangedAt: new Date(),
        statusChangedBy: user,
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.service.findUnique({ where: { svcId } });
      const history = await this.audit.forRecord('Service', svcId);
      const latest = history[0];
      throw new ConflictException({
        message: `Service ${svcId} was modified by someone else`,
        current: withServiceTransitions(current!),
        changedBy: latest?.user,
        changedAt: latest?.timestampZ,
      });
    }

    const updated = await this.prisma.service.findUnique({ where: { svcId } });
    await this.audit.log(user, 'Service', svcId, 'LinkedAuthorization', '', authorizationId);
    return withServiceTransitions(updated!);
  }

  // Resolves operator/country/serviceType server-side from the service and
  // its trip (same resolution resolveAuthorization uses) rather than
  // requiring the client to look up Trip -> Aircraft -> Operator itself.
  async authorizationCandidates(svcId: string) {
    const svc = await this.findOne(svcId);
    if (!svc.countryIso2) return [];
    const trip = await this.prisma.trip.findUnique({ where: { tripId: svc.tripId }, select: { registration: true } });
    const aircraft = trip?.registration ? await this.prisma.aircraft.findUnique({ where: { registration: trip.registration } }) : null;
    if (!aircraft) return [];

    const matches = await this.prisma.permitAuthorization.findMany({
      where: { operatorId: aircraft.currentOperatorId, countryIso2: svc.countryIso2, serviceType: svc.serviceType },
      orderBy: { createdAt: 'desc' },
    });
    return matches.map((authorization) => {
      if (authorization.status !== 'Verified') {
        return { authorization, eligible: false, reason: `${authorization.status} — not yet verified` };
      }
      if (svc.requiredByZ < authorization.validFrom || svc.requiredByZ > authorization.validUntil) {
        return { authorization, eligible: false, reason: 'Validity window does not cover this service’s required date' };
      }
      return { authorization, eligible: true };
    });
  }

  // Recomputes Urgency for every non-final service against "now" — call this
  // periodically (cron) or on-demand from an admin action to keep the
  // BREACH/URGENT/DUE/OK badges accurate as time passes without user edits.
  async refreshUrgency() {
    const open = await this.prisma.service.findMany({
      where: { status: { notIn: ['Confirmed', 'Cancelled', 'Not Required'] } },
    });
    let updated = 0;
    for (const svc of open) {
      const urgency = computeUrgency(svc.requiredByZ);
      if (urgency !== svc.urgency) {
        await this.prisma.service.update({ where: { svcId: svc.svcId }, data: { urgency } });
        updated++;
      }
    }
    return { checked: open.length, updated };
  }

  private async resolveProvider(serviceType: string, icao: string, iso2: string): Promise<string | null> {
    const byIcao = await this.prisma.provider.findFirst({
      where: { serviceTypes: { has: serviceType }, scopeType: 'ICAO', scope: icao },
    });
    if (byIcao) return byIcao.providerId;

    const byCountry = await this.prisma.provider.findFirst({
      where: { serviceTypes: { has: serviceType }, scopeType: 'Country', scope: iso2 },
    });
    if (byCountry) return byCountry.providerId;

    const global = await this.prisma.provider.findFirst({
      where: { serviceTypes: { has: serviceType }, scopeType: 'Global' },
    });
    return global?.providerId ?? null;
  }

  private async leadTimeHours(iso2: string, serviceType: string, fallback: number): Promise<number> {
    const rule = await this.prisma.countryRule.findUnique({
      where: { countryIso2_serviceType: { countryIso2: iso2, serviceType } },
    });
    return rule?.leadTimeHours ?? fallback;
  }

  private async createOverflightService(
    leg: { legId: string; tripId: string; depIcao: string; arrIcao: string; etdZ: Date },
    iso2: string,
    user: string,
    notes: string,
  ): Promise<Service> {
    const leadHours = await this.leadTimeHours(iso2, 'Overflight', 48);
    const requiredByZ = new Date(leg.etdZ.getTime() - leadHours * 60 * 60 * 1000);
    const providerId = await this.resolveProvider('Overflight', leg.depIcao, iso2);
    const trip = await this.prisma.trip.findUnique({ where: { tripId: leg.tripId }, select: { registration: true } });
    const auth = await this.resolveAuthorization(trip?.registration ?? null, iso2, 'Overflight', leg.etdZ);
    const svc = await this.prisma.service.create({
      data: {
        svcId: `${leg.legId}-OVF-${iso2}`,
        tripId: leg.tripId,
        scopeType: 'SEGMENT',
        scopeId: leg.legId,
        serviceType: 'Overflight',
        providerId,
        status: auth ? 'Confirmed' : 'Not Started',
        basedOnEtdZ: leg.etdZ,
        requiredByZ,
        urgency: computeUrgency(requiredByZ),
        assignedTo: 'Unassigned',
        notes: auth ? `${notes} Auto-confirmed via ${auth.authorizationType} permit ${auth.referenceNumber}.` : notes,
        countryIso2: iso2,
        refNumber: auth?.referenceNumber ?? '',
        validityZ: auth?.validUntil,
        authorizationId: auth?.id,
      },
    });
    await this.audit.log(user, 'Service', svc.svcId, 'Created', '', svc.svcId);
    return svc;
  }

  // Great-circle-derived overflown countries → one Overflight Service each,
  // for every country that actually requires an overflight permit. Idempotent:
  // running it again on the same leg does not create duplicates. Add-only —
  // see reconcileOverflightServices for the add-and-remove version Item 16's
  // Avoid/Include FIR editing needs.
  async generateOverflightServices(legId: string, user = 'SYSTEM') {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const existing = await this.prisma.service.findMany({
      where: { tripId: leg.tripId, serviceType: 'Overflight', scopeType: 'SEGMENT', scopeId: legId },
    });
    const existingCountries = new Set(existing.map((s) => s.countryIso2));
    const dismissedCountries = await this.dismissedCountries('SEGMENT', legId, 'Overflight');

    const created: Service[] = [];
    for (const iso2 of leg.countriesOverflown) {
      if (existingCountries.has(iso2) || dismissedCountries.has(iso2)) continue;
      const country = await this.prisma.country.findUnique({ where: { iso2 } });
      if (!country?.overflightPermitRequired) continue;
      created.push(await this.createOverflightService(leg, iso2, user, `Auto-derived from great-circle route ${leg.depIcao}–${leg.arrIcao}.`));
    }
    return created;
  }

  // Shared by generateOverflightServices/reconcileOverflightServices/
  // generateArrivalServices -- countries a coordinator explicitly dismissed
  // (deleted) for this exact scope+type, which regeneration must not recreate.
  private async dismissedCountries(scopeType: string, scopeId: string, serviceType: string): Promise<Set<string>> {
    const rows = await this.prisma.dismissedServiceCandidate.findMany({
      where: { scopeType, scopeId, serviceType },
    });
    return new Set(rows.map((r) => r.countryIso2));
  }

  // Operator-level match only (see design spec's "Coverage matching" — no
  // per-aircraft/callsign tracking). Returns null (never throws) whenever
  // resolution isn't possible, so callers can always fall back to normal
  // Not Started generation.
  private async resolveAuthorization(
    registration: string | null,
    countryIso2: string,
    serviceType: string,
    atDate: Date,
  ) {
    if (!registration) return null;
    const aircraft = await this.prisma.aircraft.findUnique({ where: { registration } });
    if (!aircraft) return null;
    return this.prisma.permitAuthorization.findFirst({
      where: {
        operatorId: aircraft.currentOperatorId,
        countryIso2,
        serviceType,
        status: 'Verified',
        validFrom: { lte: atDate },
        validUntil: { gte: atDate },
      },
    });
  }

  // Item 16: keeps a leg's Overflight services in sync with its current
  // countriesOverflown (already Avoid/Include-adjusted by LegsService by the
  // time this runs) — adds services for newly-required countries the same
  // way generateOverflightServices does, AND removes services for countries
  // that dropped out (e.g. now avoided). Removal is deliberately narrow: a
  // service is only ever auto-deleted while it's still 'Not Started' — no
  // real work done on it yet. Anything with actual progress (Requested,
  // Confirmed, a RefNumber, etc.) is left alone and flagged in the audit
  // log instead, the same caution this app already applies elsewhere
  // (Operator delete guard, Draft-only invoice line-item editing) rather
  // than silently destroying something a coordinator may have already
  // acted on.
  async reconcileOverflightServices(legId: string, user = 'SYSTEM') {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);

    const existing = await this.prisma.service.findMany({
      where: { tripId: leg.tripId, serviceType: 'Overflight', scopeType: 'SEGMENT', scopeId: legId },
    });
    const wantedCountries = new Set(leg.countriesOverflown);
    const existingCountries = new Set(existing.map((s) => s.countryIso2));
    const dismissedCountries = await this.dismissedCountries('SEGMENT', legId, 'Overflight');

    const created: Service[] = [];
    for (const iso2 of leg.countriesOverflown) {
      if (existingCountries.has(iso2) || dismissedCountries.has(iso2)) continue;
      const country = await this.prisma.country.findUnique({ where: { iso2 } });
      if (!country?.overflightPermitRequired) continue;
      created.push(await this.createOverflightService(leg, iso2, user, `Auto-derived from great-circle route ${leg.depIcao}–${leg.arrIcao} (Avoid/Include FIRs applied).`));
    }

    const removed: Service[] = [];
    const flagged: Service[] = [];
    for (const svc of existing) {
      if (!svc.countryIso2 || wantedCountries.has(svc.countryIso2)) continue;
      if (svc.status === 'Not Started') {
        await this.prisma.service.delete({ where: { svcId: svc.svcId } });
        await this.audit.log(user, 'Service', svc.svcId, 'AutoRemoved', svc.countryIso2, '(no longer overflown — Avoid FIR)');
        removed.push(svc);
      } else {
        await this.audit.log(user, 'Service', svc.svcId, 'FlaggedStale', svc.countryIso2, `Status is ${svc.status} — not auto-removed despite ${svc.countryIso2} being avoided; review manually.`);
        flagged.push(svc);
      }
    }

    return { created, removed, flagged };
  }

  // Landing permit + ground handling for the leg's arrival country (both
  // automatic whenever the destination calls for them). Departure-country
  // ground handling is opt-in — most operators arrange that locally on
  // request rather than pre-booking it.
  async generateArrivalServices(legId: string, opts: { departureGroundHandling?: boolean } = {}, user = 'SYSTEM') {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    const trip = await this.prisma.trip.findUnique({ where: { tripId: leg.tripId }, select: { registration: true } });

    const existing = await this.prisma.service.findMany({
      where: { tripId: leg.tripId, scopeType: 'LEG', scopeId: legId },
    });
    const has = (serviceType: string, iso2: string) =>
      existing.some((s) => s.serviceType === serviceType && s.countryIso2 === iso2);
    const dismissed = await this.prisma.dismissedServiceCandidate.findMany({
      where: { scopeType: 'LEG', scopeId: legId },
    });
    const isDismissed = (serviceType: string, iso2: string) =>
      dismissed.some((d) => d.serviceType === serviceType && d.countryIso2 === iso2);

    const created: Service[] = [];
    const make = async (serviceType: ServiceType, iso2: string, icao: string, direction: 'ARR' | 'DEP', notes: string) => {
      if (has(serviceType, iso2) || isDismissed(serviceType, iso2)) return;
      const leadHours = await this.leadTimeHours(iso2, serviceType, 48);
      const requiredByZ = new Date(leg.etdZ.getTime() - leadHours * 60 * 60 * 1000);
      const providerId = await this.resolveProvider(serviceType, icao, iso2);
      const auth = serviceType === 'Permit'
        ? await this.resolveAuthorization(trip?.registration ?? null, iso2, 'Permit', leg.etdZ)
        : null;
      const svc = await this.prisma.service.create({
        data: {
          svcId: `${legId}-${serviceType.toUpperCase()}-${direction}-${iso2}`,
          tripId: leg.tripId,
          scopeType: 'LEG',
          scopeId: legId,
          serviceType,
          providerId,
          status: auth ? 'Confirmed' : 'Not Started',
          basedOnEtdZ: leg.etdZ,
          requiredByZ,
          urgency: computeUrgency(requiredByZ),
          assignedTo: 'Unassigned',
          notes: auth ? `${notes} Auto-confirmed via ${auth.authorizationType} permit ${auth.referenceNumber}.` : notes,
          countryIso2: iso2,
          icao,
          refNumber: auth?.referenceNumber ?? '',
          validityZ: auth?.validUntil,
          authorizationId: auth?.id,
        },
      });
      await this.audit.log(user, 'Service', svc.svcId, 'Created', '', svc.svcId);
      created.push(svc);
    };

    const arrAirport = await this.prisma.airport.findUnique({ where: { icao: leg.arrIcao } });
    if (arrAirport) {
      const arrCountry = await this.prisma.country.findUnique({ where: { iso2: arrAirport.countryIso2 } });
      if (arrCountry?.landingPermitRequired) {
        await make('Permit', arrAirport.countryIso2, arrAirport.icao, 'ARR', `Landing permit for ${arrAirport.icao} arrival.`);
      }
      await make('GroundHandling', arrAirport.countryIso2, arrAirport.icao, 'ARR', `Ground handling at ${arrAirport.icao} arrival.`);
    }

    if (opts.departureGroundHandling) {
      const depAirport = await this.prisma.airport.findUnique({ where: { icao: leg.depIcao } });
      if (depAirport) {
        await make('GroundHandling', depAirport.countryIso2, depAirport.icao, 'DEP', `Ground handling at ${depAirport.icao} departure — arranged on request.`);
      }
    }

    return created;
  }
}
