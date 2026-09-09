// scripts/backfill-vendor-assignments-from-providers.ts
//
// One-time data repair for the Vendor Assignment & Resolution Engine
// (sub-project 2 live wiring, final fix wave -- Fix 1). Live service
// generation now calls VendorResolverService.resolve(), which reads ONLY
// the VendorAssignment table -- currently empty in every real/dev database,
// since there's no UI yet to populate it (that's a later sub-project). The
// OLD resolveProvider() fallback (still present as dead code in
// ServicesService, kept for reference -- see its constructor comment)
// resolved ICAO -> Country -> Global off Provider.scopeType/Provider.scope,
// and the seed Provider data covers most real cases, including 3
// Global-scoped providers that catch nearly everything. Without this
// backfill, every newly-generated service silently regresses from "gets a
// provider" to providerId: null + vendorSelectionSource:
// 'NO_ELIGIBLE_VENDOR', and the task-sync NO_ELIGIBLE_VENDOR trigger then
// spawns one Task per affected service per sync cycle, flooding the Action
// Board with false alarms.
//
// This script reproduces resolveProvider's old fallback behavior as real
// VendorAssignment rows: one row per (Provider x an entry in its
// serviceTypes[] array), with countryIso2/icao set from the provider's
// scopeType/scope (ICAO -> icao only, Country -> countryIso2 only,
// Global -> both null). It is idempotent -- re-running it skips any
// (providerId, serviceType, countryIso2, icao, clientId: null) combination
// that already has a matching VendorAssignment row, so it is safe to run
// more than once (e.g. after new Provider rows are added later).
//
// Note: two different Providers landing on the identical
// (countryIso2, icao, serviceType) context is expected and correct -- it
// surfaces a genuine CHOICE_REQUIRED tie where the old resolveProvider's
// unordered `findFirst` used to silently pick an arbitrary winner. This is
// a real improvement, not a bug; do not try to prevent it or pick a
// "winner" here.
//
// This is a manually-invoked script, not part of `prisma migrate deploy`.
//
// Run with: npx dotenv -e .env -- ts-node scripts/backfill-vendor-assignments-from-providers.ts
import { PrismaClient } from '@prisma/client';

export async function backfillVendorAssignmentsFromProviders(
  prisma: PrismaClient,
): Promise<{ providerId: string; created: number; skipped: number }[]> {
  const providers = await prisma.provider.findMany();
  const summary: { providerId: string; created: number; skipped: number }[] = [];

  for (const provider of providers) {
    let created = 0;
    let skipped = 0;
    const countryIso2 = provider.scopeType === 'Country' ? provider.scope : null;
    const icao = provider.scopeType === 'ICAO' ? provider.scope : null;
    // scopeType === 'Global' -> both countryIso2 and icao stay null.

    for (const serviceType of provider.serviceTypes) {
      const existing = await prisma.vendorAssignment.findFirst({
        where: {
          providerId: provider.providerId,
          serviceType,
          countryIso2,
          icao,
          clientId: null,
        },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await prisma.vendorAssignment.create({
        data: {
          providerId: provider.providerId,
          serviceType,
          countryIso2,
          icao,
          rank: 1,
          preferred: false,
          active: true,
          createdBy: 'SYSTEM_BACKFILL',
        },
      });
      created += 1;
    }

    if (created > 0 || skipped > 0) {
      summary.push({ providerId: provider.providerId, created, skipped });
    }
  }

  return summary;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillVendorAssignmentsFromProviders(prisma)
    .then((summary) => {
      const totalCreated = summary.reduce((sum, row) => sum + row.created, 0);
      const totalSkipped = summary.reduce((sum, row) => sum + row.skipped, 0);
      console.log(
        `Backfill complete. ${summary.length} provider(s) touched, ${totalCreated} VendorAssignment row(s) created, ${totalSkipped} already present (skipped).`,
      );
      for (const row of summary) {
        console.log(`  ${row.providerId}: created ${row.created}, skipped ${row.skipped}`);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
