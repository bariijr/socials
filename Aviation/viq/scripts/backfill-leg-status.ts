// scripts/backfill-leg-status.ts
//
// One-time data backfill for the Leg.status column added by the Leg
// Lifecycle & Status Foundation migration
// (docs/superpowers/plans/2026-09-13-viq-leg-lifecycle-status-foundation.md).
// Every existing Leg row gets the schema's 'Planned' default the moment
// the migration runs -- this script corrects that default to a
// meaningful status for legs that are not actually still Planned:
//
//   Trip.status === 'Complete'   -> Leg 'Completed'
//   Trip.status === 'Cancelled'  -> Leg 'Cancelled'
//   otherwise: 'Planned' if etdZ is in the future, else 'Active'
//
// No AuditEntry rows are written for these changes -- see the design
// spec's "Explicitly out of scope" section: this backfill doesn't invent
// a "reason" concept, and no other backfill script in this codebase
// writes synthetic audit rows either.
//
// This is a manually-invoked script, not part of `prisma migrate deploy`
// -- run it once, right after the migration, against a copy of
// production data first, review the logged per-leg delta, then run it
// against production during a low-traffic window.
//
// Run with: npx dotenv -e .env -- ts-node scripts/backfill-leg-status.ts
import { PrismaClient } from '@prisma/client';

export function targetLegStatus(tripStatus: string, etdZ: Date, now: Date): string {
  if (tripStatus === 'Complete') return 'Completed';
  if (tripStatus === 'Cancelled') return 'Cancelled';
  return etdZ.getTime() > now.getTime() ? 'Planned' : 'Active';
}

export async function backfillLegStatus(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ legId: string; from: string; to: string }[]> {
  const legs = await prisma.leg.findMany({
    select: { legId: true, status: true, etdZ: true, trip: { select: { status: true } } },
  });

  const changed: { legId: string; from: string; to: string }[] = [];
  for (const leg of legs) {
    const target = targetLegStatus(leg.trip.status, leg.etdZ, now);
    if (target === leg.status) continue;
    await prisma.leg.update({ where: { legId: leg.legId }, data: { status: target } });
    changed.push({ legId: leg.legId, from: leg.status, to: target });
  }
  return changed;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillLegStatus(prisma)
    .then((changed) => {
      console.log(`Backfill complete. ${changed.length} leg(s) changed:`);
      for (const c of changed) {
        console.log(`  ${c.legId}: ${c.from} -> ${c.to}`);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
