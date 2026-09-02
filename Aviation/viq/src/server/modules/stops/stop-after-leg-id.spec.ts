import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';

describe('Stop.afterLegId', () => {
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

  it('allows a Stop to be created with afterLegId set, linking it to a leg', async () => {
    await prisma.trip.create({ data: { tripId: 'TEST-AFTERLEG-1', client: 'Test Client' } });
    const leg = await prisma.leg.create({
      data: {
        legId: 'TEST-AFTERLEG-1-LEG-1',
        tripId: 'TEST-AFTERLEG-1',
        seq: 1,
        depIcao: 'HTDA',
        arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T06:00:00.000Z'),
        etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 3,
        countriesOverflown: [],
      },
    });

    const stop = await prisma.stop.create({
      data: {
        stopId: 'TEST-AFTERLEG-1-STOP-1',
        tripId: 'TEST-AFTERLEG-1',
        icao: 'FALA',
        arrZ: leg.etaZ,
        depZ: leg.etaZ,
        groundTimeHours: 0,
        purpose: 'Tech',
        afterLegId: leg.legId,
      },
    });

    expect(stop.afterLegId).toBe(leg.legId);
  });

  it('rejects a second Stop with the same afterLegId (unique constraint)', async () => {
    await prisma.trip.create({ data: { tripId: 'TEST-AFTERLEG-2', client: 'Test Client' } });
    const leg = await prisma.leg.create({
      data: {
        legId: 'TEST-AFTERLEG-2-LEG-1',
        tripId: 'TEST-AFTERLEG-2',
        seq: 1,
        depIcao: 'HTDA',
        arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T06:00:00.000Z'),
        etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 3,
        countriesOverflown: [],
      },
    });

    await prisma.stop.create({
      data: {
        stopId: 'TEST-AFTERLEG-2-STOP-1',
        tripId: 'TEST-AFTERLEG-2',
        icao: 'FALA',
        arrZ: leg.etaZ,
        depZ: leg.etaZ,
        groundTimeHours: 0,
        purpose: 'Tech',
        afterLegId: leg.legId,
      },
    });

    await expect(
      prisma.stop.create({
        data: {
          stopId: 'TEST-AFTERLEG-2-STOP-2',
          tripId: 'TEST-AFTERLEG-2',
          icao: 'FALA',
          arrZ: leg.etaZ,
          depZ: leg.etaZ,
          groundTimeHours: 0,
          purpose: 'Tech',
          afterLegId: leg.legId,
        },
      }),
    ).rejects.toThrow();
  });
});
