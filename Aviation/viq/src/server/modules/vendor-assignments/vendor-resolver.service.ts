import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export type VendorResolutionStatus = 'RESOLVED' | 'CHOICE_REQUIRED' | 'NO_ELIGIBLE_VENDOR' | 'BLOCKED';

export interface VendorResolutionContext {
  countryIso2?: string;
  icao?: string;
  serviceType: string;
  permitType?: string;
  clientId?: string;
  asOfZ?: Date;
}

export interface VendorResolutionResult {
  status: VendorResolutionStatus;
  selectedVendorId?: string;
  selectionSource?: string;
  matchedRule?: { id: string; rank: number | null; preferred: boolean };
  alternatives: { vendorId: string; rank: number | null }[];
  reason: string;
}

type AssignmentWithProvider = Prisma.VendorAssignmentGetPayload<{ include: { provider: true } }>;

// Fully isolated from ServicesService/LegsService/TripsService by design
// (see the sub-project 1 design spec) -- pure read of VendorAssignment +
// Provider, returns a result, writes nothing. Not called from anywhere
// live yet; sub-project 2 wires this into service generation.
@Injectable()
export class VendorResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(ctx: VendorResolutionContext): Promise<VendorResolutionResult> {
    const asOfZ = ctx.asOfZ ?? new Date();
    // Both buildContextFilter and validityConditions return arrays of
    // conditions (not pre-wrapped {AND:[...]} objects) specifically so
    // they can be flattened into ONE AND array here -- spreading two
    // objects that each independently carry an `AND` key would silently
    // let the second overwrite the first, dropping half the filter.
    const conditions = [...this.buildContextFilter(ctx), ...this.validityConditions(asOfZ)];

    const [candidates, prohibitions] = await Promise.all([
      this.prisma.vendorAssignment.findMany({
        where: { serviceType: ctx.serviceType, prohibited: false, active: true, AND: conditions },
        include: { provider: true },
      }),
      this.prisma.vendorAssignment.findMany({
        where: { serviceType: ctx.serviceType, prohibited: true, active: true, AND: conditions },
      }),
    ]);

    // Prohibition is an absolute, provider-wide ban applied here, before
    // specificity tiering (selectTopTier) even runs -- a prohibition row
    // at any tier removes that provider from consideration at every tier,
    // it does not merely lose to a more-specific non-prohibited row. This
    // is a deliberate design choice (reviewed), not tier-aware; do not
    // "fix" it to only apply within the matching tier without revisiting
    // that decision first.
    const bannedProviderIds = new Set(prohibitions.map((p) => p.providerId));
    const capabilityBlockedIds = await this.capabilityBlockedProviderIds(
      candidates.map((c) => c.providerId),
      ctx,
    );
    const eligible = candidates.filter(
      (c) =>
        !bannedProviderIds.has(c.providerId) &&
        !capabilityBlockedIds.has(c.providerId) &&
        c.provider.contractActive &&
        c.provider.serviceTypes.includes(ctx.serviceType),
    );

    if (eligible.length === 0) {
      // Three distinguishable cases, not two: (1) no assignment row ever
      // matched this context at all; (2) every matching row's provider is
      // specifically prohibited (a genuinely unrelated prohibition row for
      // a provider that was never a candidate here must NOT trigger this --
      // that's case 1); (3) rows matched but were filtered out on
      // eligibility grounds unrelated to prohibition (inactive contract or
      // a serviceTypes mismatch).
      const allCandidatesProhibited = candidates.length > 0 && candidates.every((c) => bannedProviderIds.has(c.providerId));
      let reason: string;
      if (candidates.length === 0) {
        reason = 'No active vendor assignment matches this context';
      } else if (allCandidatesProhibited) {
        reason = 'All otherwise-eligible vendors are prohibited for this client/context';
      } else {
        reason = 'Vendor assignments matched this context, but no eligible provider survived filtering (inactive contract, service type mismatch, or an unapproved capability request covering this context)';
      }
      return { status: 'NO_ELIGIBLE_VENDOR', alternatives: [], reason };
    }

    const topTier = this.selectTopTier(eligible);
    const preferredOnly = topTier.filter((r) => r.preferred);
    const pool = preferredOnly.length > 0 ? preferredOnly : topTier;

    const minRank = Math.min(...pool.map((r) => r.rank ?? Number.MAX_SAFE_INTEGER));
    const winners = pool.filter((r) => (r.rank ?? Number.MAX_SAFE_INTEGER) === minRank);

    if (winners.length === 1) {
      const w = winners[0];
      const selectionSource = this.describeSelectionSource(w);
      return {
        status: 'RESOLVED',
        selectedVendorId: w.providerId,
        selectionSource,
        matchedRule: { id: w.id, rank: w.rank, preferred: w.preferred },
        alternatives: pool.filter((r) => r.id !== w.id).map((r) => ({ vendorId: r.providerId, rank: r.rank })),
        reason: `${selectionSource}: rank ${w.rank}${w.preferred ? ', preferred' : ''}`,
      };
    }

    return {
      status: 'CHOICE_REQUIRED',
      alternatives: winners.map((r) => ({ vendorId: r.providerId, rank: r.rank })),
      reason: `${winners.length} vendors tied at rank ${minRank} for this context`,
    };
  }

  // Sub-project 3b: Change Vendor's replacement picker needs "every
  // eligible vendor at any tier", not resolve()'s "the winning tier only"
  // -- a service with a single top-tier winner and no ties would otherwise
  // show an empty picker even when legitimate lower-tier vendors exist.
  // Reuses resolve()'s exact candidate-filtering (context + validity +
  // active/contractActive/serviceTypes + prohibition exclusion) but skips
  // the specificity-tiering/winner-selection step -- returns every
  // surviving candidate, sorted most- to least-specific then by rank.
  // A single provider can have multiple matching VendorAssignment rows at
  // different tiers (e.g. a global default AND a country override) -- the
  // pool is de-duplicated by vendorId, keeping each vendor's most-specific
  // (i.e. first, since the list is already sorted) surviving row.
  async eligiblePool(ctx: VendorResolutionContext): Promise<{ vendorId: string; rank: number | null }[]> {
    const asOfZ = ctx.asOfZ ?? new Date();
    const conditions = [...this.buildContextFilter(ctx), ...this.validityConditions(asOfZ)];

    const [candidates, prohibitions] = await Promise.all([
      this.prisma.vendorAssignment.findMany({
        where: { serviceType: ctx.serviceType, prohibited: false, active: true, AND: conditions },
        include: { provider: true },
      }),
      this.prisma.vendorAssignment.findMany({
        where: { serviceType: ctx.serviceType, prohibited: true, active: true, AND: conditions },
      }),
    ]);

    const bannedProviderIds = new Set(prohibitions.map((p) => p.providerId));
    const capabilityBlockedIds = await this.capabilityBlockedProviderIds(
      candidates.map((c) => c.providerId),
      ctx,
    );
    const eligible = candidates.filter(
      (c) =>
        !bannedProviderIds.has(c.providerId) &&
        !capabilityBlockedIds.has(c.providerId) &&
        c.provider.contractActive &&
        c.provider.serviceTypes.includes(ctx.serviceType),
    );

    const sorted = eligible.sort(
      (a, b) => this.compareTuple(this.specificity(b), this.specificity(a)) || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER),
    );

    const seenProviderIds = new Set<string>();
    const deduped: AssignmentWithProvider[] = [];
    for (const row of sorted) {
      if (seenProviderIds.has(row.providerId)) continue;
      seenProviderIds.add(row.providerId);
      deduped.push(row);
    }

    return deduped.map((row) => ({ vendorId: row.providerId, rank: row.rank }));
  }

  private buildContextFilter(ctx: VendorResolutionContext): Prisma.VendorAssignmentWhereInput[] {
    const optionalMatch = (value: string | undefined, field: 'icao' | 'countryIso2' | 'clientId' | 'permitType'): Prisma.VendorAssignmentWhereInput =>
      value ? { OR: [{ [field]: value }, { [field]: null }] } : { [field]: null };

    return [
      optionalMatch(ctx.permitType, 'permitType'),
      optionalMatch(ctx.icao, 'icao'),
      optionalMatch(ctx.countryIso2, 'countryIso2'),
      optionalMatch(ctx.clientId, 'clientId'),
    ];
  }

  private validityConditions(asOfZ: Date): Prisma.VendorAssignmentWhereInput[] {
    return [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOfZ } }] },
      { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: asOfZ } }] },
    ];
  }

  // Capability gate (spec §16/§44): a provider is excluded from a context if
  // a VendorCapabilityRequest row exists whose scope COVERS that context and
  // whose status is not APPROVED. No matching row at all -- the default for
  // every pre-existing Provider -- means this gate does nothing; it is
  // deliberately opt-in, never a default-deny.
  //
  // Scope matching mirrors buildContextFilter/optionalMatch above exactly: a
  // NULL field on the stored row is "unscoped at that level" and matches ANY
  // context value there; a non-NULL field must equal the context's value.
  // This is load-bearing, not a nicety -- an Admin-created capability request
  // is scoped to EITHER a country OR an airport (never both), while the real
  // GroundHandling/Permit resolution contexts built by services.service.ts
  // ALWAYS carry BOTH (those services are airport-scoped, and the airport is
  // in a country). Exact-tuple matching therefore made the gate completely
  // inert for its two primary service types (final-review finding C1).
  // A country-scoped row {TZ, null} covers every airport in TZ; an
  // airport-scoped row {null, HTDA} covers HTDA only and never leaks into a
  // sibling airport such as FALA.
  private async capabilityBlockedProviderIds(providerIds: string[], ctx: VendorResolutionContext): Promise<Set<string>> {
    if (providerIds.length === 0) return new Set();
    // `||` (not `??`) deliberately: production callers (e.g.
    // services.service.ts's overflight generation) pass icao: '' rather
    // than omitting it, and '' is never a legitimate ISO2/ICAO code, so
    // treating it the same as unset here matches how the row was actually
    // stored (NULL) by VendorCapabilityService.create().
    const countryIso2 = ctx.countryIso2 || null;
    const icao = ctx.icao || null;
    const countryCondition: Prisma.VendorCapabilityRequestWhereInput = countryIso2
      ? { OR: [{ countryIso2 }, { countryIso2: null }] }
      : { countryIso2: null };
    const icaoCondition: Prisma.VendorCapabilityRequestWhereInput = icao ? { OR: [{ icao }, { icao: null }] } : { icao: null };
    const rows = await this.prisma.vendorCapabilityRequest.findMany({
      where: {
        providerId: { in: providerIds },
        serviceType: ctx.serviceType,
        // Both conditions flattened into one AND array for the same reason
        // resolve() does it -- two objects each carrying `OR` would collide.
        AND: [countryCondition, icaoCondition],
      },
      orderBy: { createdAtZ: 'desc' },
    });
    // Multiple rows can cover the same (providerId, serviceType, context)
    // over time (a routine re-verification resend, or a country-scoped row
    // alongside an airport-scoped one) -- only the newest COVERING row per
    // provider determines block status, not "any row ever". Iterating
    // desc-ordered rows and only
    // setting a providerId's entry the first time it's seen naturally
    // keeps just the newest row per provider.
    const latestStatusByProvider = new Map<string, string>();
    for (const row of rows) {
      if (!latestStatusByProvider.has(row.providerId)) latestStatusByProvider.set(row.providerId, row.status);
    }
    return new Set([...latestStatusByProvider.entries()].filter(([, status]) => status !== 'APPROVED').map(([providerId]) => providerId));
  }

  // Specificity tuple order verified against the source doc's own 11-tier
  // list: client status dominates, then permit-type match, then geography
  // (airport beats country beats global). Field order here is NOT
  // arbitrary -- do not reorder without re-checking that list.
  private specificity(row: { clientId: string | null; permitType: string | null; icao: string | null; countryIso2: string | null }): [number, number, number, number] {
    return [row.clientId ? 1 : 0, row.permitType ? 1 : 0, row.icao ? 1 : 0, row.countryIso2 ? 1 : 0];
  }

  private selectTopTier(rows: AssignmentWithProvider[]): AssignmentWithProvider[] {
    let best: [number, number, number, number] = [0, 0, 0, 0];
    for (const row of rows) {
      const s = this.specificity(row);
      if (this.compareTuple(s, best) > 0) best = s;
    }
    return rows.filter((row) => this.compareTuple(this.specificity(row), best) === 0);
  }

  private compareTuple(a: [number, number, number, number], b: [number, number, number, number]): number {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  // _DEFAULT means "a plain geography-only fallback rule, nothing more
  // specific layered on it"; _OVERRIDE means "this row deliberately narrows
  // beyond plain geography" (client-specific or permit-type-specific). The
  // geography component (COUNTRY/AIRPORT/GLOBAL) alone never triggers
  // _OVERRIDE -- only clientId or permitType does.
  private describeSelectionSource(row: { clientId: string | null; icao: string | null; countryIso2: string | null; permitType: string | null }): string {
    const geo = row.icao ? 'AIRPORT' : row.countryIso2 ? 'COUNTRY' : 'GLOBAL';
    const parts = [row.clientId ? 'CLIENT' : null, geo, row.permitType ? 'PERMIT_TYPE' : null].filter(Boolean);
    const isOverride = Boolean(row.clientId || row.permitType);
    return parts.join('_') + (isOverride ? '_OVERRIDE' : '_DEFAULT');
  }
}
