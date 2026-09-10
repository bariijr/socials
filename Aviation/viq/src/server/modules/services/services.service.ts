import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Service, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { computeUrgency } from '../../common/geo.util';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ChangeVendorDto } from './dto/change-vendor.dto';
import { changeVendorAllowed, isValidServiceTransition, serviceAuthorizationLinkAllowed, withServiceTransitions } from '../../common/statusTransitions';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';

type ServiceType = 'Permit' | 'Overflight' | 'GroundHandling';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vendorResolver: VendorResolverService,
  ) {
    // Superseded by resolveVendor/VendorResolverService at both call sites, but kept
    // temporarily as dead code (removal is a later cleanup task, not this one). This
    // reference marks it "read" for noUnusedLocals without touching its own declaration.
    void this.resolveProvider;
  }

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

  async update(svcId: string, dto: UpdateServiceDto, currentUsername?: string) {
    const before = await this.prisma.service.findUnique({ where: { svcId } });
    if (!before) throw new NotFoundException(`Service ${svcId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, subItems, version, ...data } = dto;

    if (data.status && data.status !== before.status && !isValidServiceTransition(before.status, data.status)) {
      throw new BadRequestException(`Cannot transition Service from "${before.status}" to "${data.status}"`);
    }

    const requiredByZ = data.requiredByZ ?? before.requiredByZ.toISOString();
    const statusChanging = data.status !== undefined && data.status !== before.status;
    // The moment a service actually transitions to Confirmed is the moment
    // of truth for who confirmed it -- stamp from the server-verified JWT
    // identity (never the client-supplied dto.user field, same reasoning
    // as Trip reopening and permit-authorization verify/revoke), and let
    // it win over anything the client happened to also send in this same
    // request. A later, separate edit (status already Confirmed, not
    // transitioning again) is unaffected and can still freely correct
    // confirmedBy/confirmedAtZ by hand.
    const becomingConfirmed = statusChanging && data.status === 'Confirmed';
    const providerChanging = data.providerId !== undefined && data.providerId !== before.providerId;
    // A provider explicitly cleared to null is a deliberate un-assignment,
    // not a resolved selection -- stamping USER_SELECTED here would make the
    // service invisible to the task-sync NO_ELIGIBLE_VENDOR safety net (it
    // filters on that literal string), silently dropping a service that
    // genuinely needs attention out of the "needs attention" pool. Re-surface
    // it the same way an unresolved generation-time service would read.
    const clearingProvider = providerChanging && data.providerId === null;
    const result = await this.prisma.service.updateMany({
      where: { svcId, version },
      data: {
        ...data,
        subItems: subItems as Prisma.InputJsonValue | undefined,
        urgency: computeUrgency(requiredByZ),
        version: { increment: 1 },
        ...(statusChanging ? { statusChangedAt: new Date(), statusChangedBy: user } : {}),
        ...(becomingConfirmed ? { confirmedBy: currentUsername ?? user, confirmedAtZ: new Date() } : {}),
        ...(providerChanging
          ? { vendorSelectionSource: clearingProvider ? 'NO_ELIGIBLE_VENDOR' : 'USER_SELECTED', vendorSelectedAtZ: new Date(), vendorAssignmentId: null }
          : {}),
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
    if (svc.basedOnEtdZ < auth.validFrom || svc.basedOnEtdZ > auth.validUntil) {
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
        confirmedBy: user,
        confirmedAtZ: new Date(),
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
    await this.audit.logDiff(user, 'Service', svcId, svc as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
    return withServiceTransitions(updated!);
  }

  // Sub-project 3b: atomically writes a VendorChangeLog row and flips the
  // Service's provider + status together. Non-Admin callers are restricted
  // to the same eligible pool changeVendorCandidates() surfaces to the
  // client; an Admin may override into any provider. Like linkAuthorization
  // and update(), enforces optimistic locking via `version`.
  async changeVendor(svcId: string, dto: ChangeVendorDto, currentUsername: string, callerRole?: string) {
    const svc = await this.prisma.service.findUnique({ where: { svcId } });
    if (!svc) throw new NotFoundException(`Service ${svcId} not found`);
    if (!changeVendorAllowed(svc.status)) {
      throw new BadRequestException(`Cannot change vendor on a service with status "${svc.status}"`);
    }
    if (!svc.providerId) {
      throw new BadRequestException('Service has no current provider to change from');
    }

    if (callerRole !== 'Admin') {
      const pool = svc.countryIso2
        ? await this.changeVendorCandidates(svcId)
        : { candidates: [] };
      const eligible = pool.candidates.some((c) => c.vendorId === dto.toProviderId);
      if (!eligible) {
        throw new ForbiddenException('Replacement vendor is not in the eligible list — requires Admin to override');
      }
    }

    const result = await this.prisma.service.updateMany({
      where: { svcId, version: dto.version },
      data: {
        providerId: dto.toProviderId,
        vendorSelectionSource: 'USER_SELECTED',
        vendorAssignmentId: null,
        vendorSelectedAtZ: new Date(),
        status: 'Submission Pending',
        statusChangedAt: new Date(),
        statusChangedBy: currentUsername,
        version: { increment: 1 },
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

    await this.prisma.vendorChangeLog.create({
      data: {
        svcId,
        fromProviderId: svc.providerId,
        toProviderId: dto.toProviderId,
        reason: dto.reason,
        notes: dto.notes,
        cancellationCommId: dto.cancellationCommId,
        changedBy: currentUsername,
      },
    });

    const updated = await this.prisma.service.findUnique({ where: { svcId } });
    await this.audit.logDiff(currentUsername, 'Service', svcId, svc as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
    return withServiceTransitions(updated!);
  }

  async patchVendorChangeLogNewRequestComm(id: string, newRequestCommId: string) {
    return this.prisma.vendorChangeLog.update({ where: { id }, data: { newRequestCommId } });
  }

  async vendorChangeLogsForService(svcId: string) {
    return this.prisma.vendorChangeLog.findMany({ where: { svcId }, orderBy: { changedAtZ: 'asc' } });
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
      if (authorization.status === 'Revoked') {
        return { authorization, eligible: false, reason: 'Revoked' };
      }
      if (authorization.status !== 'Verified') {
        return { authorization, eligible: false, reason: `${authorization.status} — not yet verified` };
      }
      if (svc.basedOnEtdZ < authorization.validFrom || svc.basedOnEtdZ > authorization.validUntil) {
        return { authorization, eligible: false, reason: 'Validity window does not cover this service’s required date' };
      }
      return { authorization, eligible: true };
    });
  }

  async vendorCandidates(svcId: string) {
    const svc = await this.findOne(svcId);
    if (!svc.countryIso2) return { status: 'NO_ELIGIBLE_VENDOR', alternatives: [] };
    const resolution = await this.resolveVendor(svc.serviceType, svc.icao ?? '', svc.countryIso2, svc.tripId);
    if (resolution.alternatives.length === 0) {
      return { status: resolution.status, alternatives: [] };
    }
    const providers = await this.prisma.provider.findMany({
      where: { providerId: { in: resolution.alternatives.map((a) => a.vendorId) } },
    });
    const nameById = new Map(providers.map((p) => [p.providerId, p.name]));
    return {
      status: resolution.status,
      alternatives: resolution.alternatives.map((a) => ({ vendorId: a.vendorId, providerName: nameById.get(a.vendorId) ?? a.vendorId })),
    };
  }

  async changeVendorCandidates(svcId: string) {
    const svc = await this.findOne(svcId);
    if (!svc.countryIso2) return { candidates: [] };
    const trip = await this.prisma.trip.findUnique({ where: { tripId: svc.tripId }, select: { clientId: true } });
    const pool = await this.vendorResolver.eligiblePool({
      countryIso2: svc.countryIso2,
      icao: svc.icao ?? '',
      serviceType: svc.serviceType,
      clientId: trip?.clientId ?? undefined,
    });
    if (pool.length === 0) return { candidates: [] };
    const providers = await this.prisma.provider.findMany({ where: { providerId: { in: pool.map((p) => p.vendorId) } } });
    const nameById = new Map(providers.map((p) => [p.providerId, p.name]));
    return { candidates: pool.map((p) => ({ vendorId: p.vendorId, providerName: nameById.get(p.vendorId) ?? p.vendorId })) };
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

  private async resolveVendor(serviceType: string, icao: string, iso2: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { tripId }, select: { clientId: true } });
    return this.vendorResolver.resolve({
      countryIso2: iso2,
      icao,
      serviceType,
      clientId: trip?.clientId ?? undefined,
    });
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

  private async toleranceHours(iso2: string, serviceType: string): Promise<number> {
    const rule = await this.prisma.countryRule.findUnique({
      where: { countryIso2_serviceType: { countryIso2: iso2, serviceType } },
    });
    return rule?.toleranceHours ?? 0;
  }

  // Shared by both Change Impact flagging methods below: flips a Confirmed
  // service to Re-confirm Required, appends the human-readable reason to
  // its notes, bumps `version` (so a stale-draft client save conflicts
  // instead of silently reverting this flag -- see Finding 1), and logs the
  // audit entry.
  private async applyReconfirmFlag(svc: Service, reason: string, user: string): Promise<Service> {
    const updated = await this.prisma.service.update({
      where: { svcId: svc.svcId },
      data: {
        status: 'Re-confirm Required',
        statusChangedAt: new Date(),
        statusChangedBy: user,
        version: { increment: 1 },
        notes: `${svc.notes} Auto-flagged: ${reason}.`.trim(),
      },
    });
    await this.audit.log(user, 'Service', svc.svcId, 'AutoReconfirm', 'Confirmed', 'Re-confirm Required');
    return updated;
  }

  // Change Impact trigger: an ETD/ETA shift beyond a country's configured
  // tolerance invalidates an already-Confirmed service -- the permit was
  // granted against the old time. A service not yet Confirmed is left
  // alone (it hasn't locked anything in yet that needs invalidating), and
  // a service with no countryIso2 at all is skipped -- there's no country
  // to look a tolerance up against (different from "no CountryRule row for
  // an existing country", which still defaults to 0 and flags).
  //
  // `onlyIds`, when provided, restricts flagging to that set of svcIds --
  // used by LegsService.update() to exclude services created earlier in the
  // very same call (by reconcileOverflightServices/generateOverflightServices/
  // generateArrivalServices) from being re-flagged against a change they
  // were never actually granted before. Omitted by the trip-identity call
  // site in trips.service.ts, which has no equivalent same-call risk.
  async flagConfirmedServicesForScheduleChange(
    legId: string,
    oldTime: Date,
    newTime: Date,
    label: 'ETD' | 'ETA',
    user = 'SYSTEM',
    onlyIds?: string[],
  ): Promise<Service[]> {
    const deltaHours = Math.abs(newTime.getTime() - oldTime.getTime()) / (1000 * 60 * 60);
    if (deltaHours === 0) return [];
    const where: Prisma.ServiceWhereInput = { scopeId: legId, status: 'Confirmed' };
    if (onlyIds) where.svcId = { in: onlyIds };
    const confirmed = await this.prisma.service.findMany({ where });
    const flagged: Service[] = [];
    for (const svc of confirmed) {
      if (!svc.countryIso2) continue;
      const tolerance = await this.toleranceHours(svc.countryIso2, svc.serviceType);
      if (deltaHours <= tolerance) continue;
      const deltaText = deltaHours < 1 ? `${Math.round(deltaHours * 60)}min` : `${deltaHours.toFixed(1)}h`;
      const reason = `${label} moved ${deltaText} (exceeds ${tolerance}h tolerance for ${svc.countryIso2} ${svc.serviceType})`;
      flagged.push(await this.applyReconfirmFlag(svc, reason, user));
    }
    return flagged;
  }

  // Generic bulk flag for the no-tolerance Change Impact triggers (route
  // change, trip-identity change) -- every Confirmed service matching
  // `where` is flagged with the same human-readable reason. The caller
  // builds the reason string since it's the one that knows what actually
  // changed (a leg's route vs a trip's operator/registration).
  //
  // `onlyIds` -- see flagConfirmedServicesForScheduleChange's doc comment.
  async flagConfirmedServices(
    where: Prisma.ServiceWhereInput,
    reason: string,
    user = 'SYSTEM',
    onlyIds?: string[],
  ): Promise<Service[]> {
    const fullWhere: Prisma.ServiceWhereInput = { ...where, status: 'Confirmed' };
    if (onlyIds) fullWhere.svcId = { in: onlyIds };
    const confirmed = await this.prisma.service.findMany({ where: fullWhere });
    const flagged: Service[] = [];
    for (const svc of confirmed) {
      flagged.push(await this.applyReconfirmFlag(svc, reason, user));
    }
    return flagged;
  }

  private async createOverflightService(
    leg: { legId: string; tripId: string; depIcao: string; arrIcao: string; etdZ: Date },
    iso2: string,
    user: string,
    notes: string,
  ): Promise<Service> {
    const leadHours = await this.leadTimeHours(iso2, 'Overflight', 48);
    const requiredByZ = new Date(leg.etdZ.getTime() - leadHours * 60 * 60 * 1000);
    // Single trip lookup covering both the resolver's clientId need and the
    // authorization lookup's registration need (previously two separate
    // findUnique calls -- one hidden inside resolveVendor, one here). The
    // resolver is called directly (not via resolveVendor) so the already-
    // fetched clientId can be passed straight through without a second query.
    const trip = await this.prisma.trip.findUnique({ where: { tripId: leg.tripId }, select: { clientId: true, registration: true } });
    // Overflight generation deliberately passes icao: '' rather than
    // leg.depIcao -- an overflight of a country shouldn't be decided by a
    // rule scoped to a specific (and possibly unrelated) airport, and the
    // created Service row never persists an icao for Overflight services
    // anyway. vendorCandidates() reads svc.icao ?? '' for this same service
    // later, so this keeps generation-time resolution and the tie-resolution
    // dialog's candidate lookup symmetric (see Fix 3 in the vendor-assignment
    // live-wiring fix wave).
    const resolution = await this.vendorResolver.resolve({
      countryIso2: iso2,
      icao: '',
      serviceType: 'Overflight',
      clientId: trip?.clientId ?? undefined,
    });
    const providerId = resolution.status === 'RESOLVED' ? resolution.selectedVendorId : null;
    const auth = await this.resolveAuthorization(trip?.registration ?? null, iso2, 'Overflight', leg.etdZ);
    const svc = await this.prisma.service.create({
      data: {
        svcId: `${leg.legId}-OVF-${iso2}`,
        tripId: leg.tripId,
        scopeType: 'SEGMENT',
        scopeId: leg.legId,
        serviceType: 'Overflight',
        providerId,
        vendorSelectionSource: resolution.status === 'RESOLVED' ? resolution.selectionSource : resolution.status,
        vendorAssignmentId: resolution.status === 'RESOLVED' ? (resolution.matchedRule?.id ?? null) : null,
        vendorSelectedAtZ: resolution.status === 'RESOLVED' ? new Date() : null,
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
        confirmedBy: auth ? user : undefined,
        confirmedAtZ: auth ? new Date() : undefined,
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
  //
  // IMPORTANT: all four authorization match sites — this function's two call
  // sites (createOverflightService / generateArrivalServices's make(), both
  // passing leg.etdZ), linkAuthorization, and authorizationCandidates — must
  // compare against the leg's actual ETD (Service.basedOnEtdZ), never the
  // lead-time-adjusted requiredByZ. Matching on requiredByZ lets generation
  // and manual linking disagree about whether the same authorization covers
  // the same service; see the "matching-date inconsistency" finding this
  // comment was added to prevent from reoccurring.
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
      orderBy: { validUntil: 'desc' },
    });
  }

  // Item 16: keeps a leg's Overflight services in sync with its current
  // countriesOverflown (already Avoid/Include-adjusted by LegsService by the
  // time this runs) — adds services for newly-required countries the same
  // way generateOverflightServices does, AND removes services for countries
  // that dropped out (e.g. now avoided). Removal is deliberately narrow: a
  // service is only ever auto-deleted while it's still 'Not Started' (no
  // real work done on it yet), OR it was auto-confirmed by matching a
  // Verified authorization at generation time (authorizationId set) AND no
  // coordinator has ever touched its status since (statusChangedBy still
  // null) — that second case is generation's own work, not a human's, so it
  // gets the same auto-removal treatment as 'Not Started'. Anything with
  // actual progress (Requested, Confirmed via a manual link, a RefNumber
  // typed in by hand, etc.) is left alone and flagged in the audit log
  // instead, the same caution this app already applies elsewhere (Operator
  // delete guard, Draft-only invoice line-item editing) rather than silently
  // destroying something a coordinator may have already acted on.
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
      if (svc.status === 'Not Started' || (svc.authorizationId !== null && svc.statusChangedBy === null)) {
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
      const resolution = await this.resolveVendor(serviceType, icao, iso2, leg.tripId);
      const providerId = resolution.status === 'RESOLVED' ? resolution.selectedVendorId : null;
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
          vendorSelectionSource: resolution.status === 'RESOLVED' ? resolution.selectionSource : resolution.status,
          vendorAssignmentId: resolution.status === 'RESOLVED' ? (resolution.matchedRule?.id ?? null) : null,
          vendorSelectedAtZ: resolution.status === 'RESOLVED' ? new Date() : null,
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
          confirmedBy: auth ? user : undefined,
          confirmedAtZ: auth ? new Date() : undefined,
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
