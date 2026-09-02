// scripts/backfill-stop-after-leg-id.ts
//
// One-time data repair for trips created before the Stop.afterLegId fix
// (Task 4 of docs/superpowers/plans/2026-09-02-viq-test-foundation-leg-stop-correction.md).
// Links existing connecting Stop rows to the leg transition that produced
// them, and creates any Stop row the old ICAO-based dedup in
// ensureConnectingStops silently suppressed (two connecting transitions
// sharing one ICAO used to collapse into a single Stop row).
//
// This is a manually-invoked script, not part of `prisma migrate deploy`
// -- per the design spec's rollout guidance, run it against a copy of
// production data first, review the logged per-trip delta, then run it
// against production during a low-traffic window.
//
// Run with: npx dotenv -e .env -- ts-node scripts/backfill-stop-after-leg-id.ts
import { PrismaClient } from '@prisma/client';

export async function backfillStopAfterLegId(
  prisma: PrismaClient,
): Promise<{ tripId: string; claimed: number; created: number }[]> {
  const allTrips = await prisma.trip.findMany({ select: { tripId: true } });
  const summary: { tripId: string; claimed: number; created: number }[] = [];

  for (const { tripId } of allTrips) {
    const [tripLegs, unlinkedStops] = await Promise.all([
      prisma.leg.findMany({ where: { tripId }, orderBy: { seq: 'asc' } }),
      // orderBy arrZ so that, when multiple unlinked stops share an ICAO,
      // findIndex below picks the earliest one deterministically rather
      // than whatever order Postgres happens to return rows in.
      prisma.stop.findMany({ where: { tripId, afterLegId: null }, orderBy: { arrZ: 'asc' } }),
    ]);
    const unclaimed = [...unlinkedStops];
    let claimed = 0;
    let created = 0;

    for (let i = 0; i < tripLegs.length - 1; i++) {
      const current = tripLegs[i];
      const next = tripLegs[i + 1];
      if (current.arrIcao !== next.depIcao) continue;

      const alreadyLinked = await prisma.stop.findUnique({ where: { afterLegId: current.legId } });
      if (alreadyLinked) continue;

      const groundTimeHours = Math.max(0, (next.etdZ.getTime() - current.etaZ.getTime()) / (1000 * 60 * 60));

      const matchIdx = unclaimed.findIndex((s) => s.icao === current.arrIcao);
      if (matchIdx >= 0) {
        const [match] = unclaimed.splice(matchIdx, 1);
        // Reconcile the claimed row's own timestamps to the transition it
        // now represents -- the matching here is best-effort (this is
        // exactly the ambiguous case the old ICAO-dedup bug created), so
        // the row's arrZ/depZ/groundTimeHours may belong to a different
        // leg pair than the one it's being claimed for. Without this, a
        // claimed stop keeps whatever timestamps it originally had, which
        // can be wrong for its new transition.
        await prisma.stop.update({
          where: { stopId: match.stopId },
          data: { afterLegId: current.legId, arrZ: current.etaZ, depZ: next.etdZ, groundTimeHours },
        });
        claimed += 1;
      } else {
        // legId is already guaranteed unique per leg -- a safer uniqueness
        // source for stopId than Date.now(), which could collide within
        // the same millisecond across repeated-ICAO transitions.
        const stopId = `${tripId}-STOP-${current.arrIcao}-${current.legId}-BF`;
        await prisma.stop.create({
          data: {
            stopId,
            tripId,
            icao: current.arrIcao,
            arrZ: current.etaZ,
            depZ: next.etdZ,
            groundTimeHours,
            purpose: 'Tech',
            afterLegId: current.legId,
          },
        });
        created += 1;
      }
    }

    if (claimed > 0 || created > 0) {
      summary.push({ tripId, claimed, created });
    }
  }

  return summary;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  backfillStopAfterLegId(prisma)
    .then((summary) => {
      console.log(`Backfill complete. ${summary.length} trip(s) affected:`);
      for (const row of summary) {
        console.log(`  ${row.tripId}: claimed ${row.claimed}, created ${row.created}`);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
