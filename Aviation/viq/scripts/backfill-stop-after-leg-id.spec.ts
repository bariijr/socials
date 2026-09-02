import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../src/server/test/db-test-utils';
import { backfillStopAfterLegId } from './backfill-stop-after-leg-id';

describe('backfillStopAfterLegId', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('claims one existing Stop for one FALA transition and creates the missing one for the other, leaving HECA untouched', async () => {
    // Reproduces the pre-fix bug's data shape: HTDA->FALA, FALA->HECA,
    // HECA->FALA, FALA->FBMN -- FALA is the connecting airport for two
    // non-adjacent transitions, but the old ICAO-Set dedup only ever
    // created one Stop row at FALA. Simulate that buggy end state
    // directly (two Stop rows, both afterLegId: null) rather than
    // running the old buggy code, since Task 4 already replaced it.
    const tripId = 'TEST-BACKFILL-1';
    await prisma.trip.create({ data: { tripId, client: 'Test Client' } });
    const leg1 = await prisma.leg.create({
      data: {
        legId: `${tripId}-LEG-1`, tripId, seq: 1, depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T04:00:00.000Z'), etaZ: new Date('2026-10-01T06:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });
    const leg2 = await prisma.leg.create({
      data: {
        legId: `${tripId}-LEG-2`, tripId, seq: 2, depIcao: 'FALA', arrIcao: 'HECA',
        etdZ: new Date('2026-10-01T07:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });
    const leg3 = await prisma.leg.create({
      data: {
        legId: `${tripId}-LEG-3`, tripId, seq: 3, depIcao: 'HECA', arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T10:00:00.000Z'), etaZ: new Date('2026-10-01T12:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });
    await prisma.leg.create({
      data: {
        legId: `${tripId}-LEG-4`, tripId, seq: 4, depIcao: 'FALA', arrIcao: 'FBMN',
        etdZ: new Date('2026-10-01T13:00:00.000Z'), etaZ: new Date('2026-10-01T16:00:00.000Z'),
        blockHours: 3, countriesOverflown: [],
      },
    });
    // Pre-fix buggy state: one Stop at FALA (should really be two), one at HECA. Neither linked.
    await prisma.stop.create({
      data: { stopId: `${tripId}-STOP-FALA-OLD`, tripId, icao: 'FALA', arrZ: leg1.etaZ, depZ: leg2.etdZ, groundTimeHours: 1, purpose: 'Tech' },
    });
    await prisma.stop.create({
      data: { stopId: `${tripId}-STOP-HECA-OLD`, tripId, icao: 'HECA', arrZ: leg2.etaZ, depZ: leg3.etdZ, groundTimeHours: 1, purpose: 'Tech' },
    });

    const summary = await backfillStopAfterLegId(prisma);

    expect(summary).toEqual([{ tripId, claimed: 2, created: 1 }]);

    const stopRows = await prisma.stop.findMany({ where: { tripId } });
    expect(stopRows).toHaveLength(3);

    const falaStops = stopRows.filter((s) => s.icao === 'FALA');
    expect(falaStops).toHaveLength(2);
    expect(falaStops.map((s) => s.afterLegId).sort()).toEqual([leg1.legId, leg3.legId].sort());

    const hecaStop = stopRows.find((s) => s.icao === 'HECA');
    expect(hecaStop?.afterLegId).toBe(leg2.legId);
  });

  it('is a no-op on a trip with no unlinked stops', async () => {
    const tripId = 'TEST-BACKFILL-2';
    await prisma.trip.create({ data: { tripId, client: 'Test Client' } });
    await prisma.leg.create({
      data: {
        legId: `${tripId}-LEG-1`, tripId, seq: 1, depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T04:00:00.000Z'), etaZ: new Date('2026-10-01T06:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });

    const summary = await backfillStopAfterLegId(prisma);

    expect(summary).toEqual([]);
  });
});
