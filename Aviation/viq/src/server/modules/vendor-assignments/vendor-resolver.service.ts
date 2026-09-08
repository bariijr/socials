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

    const bannedProviderIds = new Set(prohibitions.map((p) => p.providerId));
    const eligible = candidates.filter(
      (c) => !bannedProviderIds.has(c.providerId) && c.provider.contractActive,
    );

    if (eligible.length === 0) {
      return {
        status: 'NO_ELIGIBLE_VENDOR',
        alternatives: [],
        reason: bannedProviderIds.size > 0
          ? 'All otherwise-eligible vendors are prohibited for this client/context'
          : 'No active vendor assignment matches this context',
      };
    }

    const topTier = this.selectTopTier(eligible);
    const preferredOnly = topTier.filter((r) => r.preferred);
    const pool = preferredOnly.length > 0 ? preferredOnly : topTier;

    const minRank = Math.min(...pool.map((r) => r.rank ?? Number.MAX_SAFE_INTEGER));
    const winners = pool.filter((r) => (r.rank ?? Number.MAX_SAFE_INTEGER) === minRank);

    if (winners.length === 1) {
      const w = winners[0];
      return {
        status: 'RESOLVED',
        selectedVendorId: w.providerId,
        selectionSource: this.describeSelectionSource(w),
        matchedRule: { id: w.id, rank: w.rank, preferred: w.preferred },
        alternatives: pool.filter((r) => r.id !== w.id).map((r) => ({ vendorId: r.providerId, rank: r.rank })),
        reason: `${this.describeSelectionSource(w)}: rank ${w.rank}${w.preferred ? ', preferred' : ''}`,
      };
    }

    return {
      status: 'CHOICE_REQUIRED',
      alternatives: winners.map((r) => ({ vendorId: r.providerId, rank: r.rank })),
      reason: `${winners.length} vendors tied at rank ${minRank} for this context`,
    };
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

  private describeSelectionSource(row: { clientId: string | null; icao: string | null; countryIso2: string | null; permitType: string | null }): string {
    const geo = row.icao ? 'AIRPORT' : row.countryIso2 ? 'COUNTRY' : 'GLOBAL';
    const parts = [row.clientId ? 'CLIENT' : null, geo, row.permitType ? 'PERMIT_TYPE' : null].filter(Boolean);
    return parts.join('_') + (row.clientId || row.icao || row.countryIso2 || row.permitType ? '_OVERRIDE' : '_DEFAULT');
  }
}
