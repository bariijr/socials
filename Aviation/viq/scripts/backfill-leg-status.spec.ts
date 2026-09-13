import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../src/server/test/db-test-utils';
import { backfillLegStatus, targetLegStatus } from './backfill-leg-status';

describe('targetLegStatus', () => {
  const now = new Date('2026-09-13T00:00:00.000Z');

  it('maps a Complete trip to Completed', () => {
    expect(targetLegStatus('Complete', new Date('2026-09-01T00:00:00.000Z'), now)).toBe('Completed');
  });

  it('maps a Cancelled trip to Cancelled', () => {
    expect(targetLegStatus('Cancelled', new Date('2026-10-01T00:00:00.000Z'), now)).toBe('Cancelled');
  });

  it('maps a future ETD on a non-terminal trip to Planned', () => {
    expect(targetLegStatus('Active', new Date('2026-10-01T00:00:00.000Z'), now)).toBe('Planned');
    expect(targetLegStatus('Planning', new Date('2026-10-01T00:00:00.000Z'), now)).toBe('Planned');
  });

  it('maps a past ETD on a non-terminal trip to Active', () => {
    expect(targetLegStatus('Active', new Date('2026-09-01T00:00:00.000Z'), now)).toBe('Active');
    expect(targetLegStatus('Planning', new Date('2026-09-01T00:00:00.000Z'), now)).toBe('Active');
  });
});

describe('backfillLegStatus', () => {
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

  it('backfills legs under Complete, Cancelled, and Active trips correctly, leaving already-correct legs untouched', async () => {
    const now = new Date('2026-09-13T00:00:00.000Z');

    await prisma.trip.create({ data: { tripId: 'TEST-BF-STATUS-1', client: 'Test Client', status: 'Complete' } });
    const completedLeg = await prisma.leg.create({
      data: {
        legId: 'TEST-BF-STATUS-1-LEG-1', tripId: 'TEST-BF-STATUS-1', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-09-01T06:00:00.000Z'), etaZ: new Date('2026-09-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });

    await prisma.trip.create({ data: { tripId: 'TEST-BF-STATUS-2', client: 'Test Client', status: 'Cancelled' } });
    const cancelledLeg = await prisma.leg.create({
      data: {
        legId: 'TEST-BF-STATUS-2-LEG-1', tripId: 'TEST-BF-STATUS-2', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });

    await prisma.trip.create({ data: { tripId: 'TEST-BF-STATUS-3', client: 'Test Client', status: 'Active' } });
    const futureLeg = await prisma.leg.create({
      data: {
        legId: 'TEST-BF-STATUS-3-LEG-1', tripId: 'TEST-BF-STATUS-3', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });
    const pastLeg = await prisma.leg.create({
      data: {
        legId: 'TEST-BF-STATUS-3-LEG-2', tripId: 'TEST-BF-STATUS-3', seq: 2,
        depIcao: 'FALA', arrIcao: 'HTDA',
        etdZ: new Date('2026-09-01T06:00:00.000Z'), etaZ: new Date('2026-09-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });

    const changed = await backfillLegStatus(prisma, now);

    // futureLeg's target ('Planned') matches its already-default status, so
    // backfillLegStatus's `if (target === leg.status) continue;` skips it —
    // it must NOT appear in `changed`.
    expect(changed).toHaveLength(3);
    expect(changed).toEqual(expect.arrayContaining([
      { legId: completedLeg.legId, from: 'Planned', to: 'Completed' },
      { legId: cancelledLeg.legId, from: 'Planned', to: 'Cancelled' },
      { legId: pastLeg.legId, from: 'Planned', to: 'Active' },
    ]));

    const [reloadedCompleted, reloadedCancelled, reloadedFuture, reloadedPast] = await Promise.all([
      prisma.leg.findUnique({ where: { legId: completedLeg.legId } }),
      prisma.leg.findUnique({ where: { legId: cancelledLeg.legId } }),
      prisma.leg.findUnique({ where: { legId: futureLeg.legId } }),
      prisma.leg.findUnique({ where: { legId: pastLeg.legId } }),
    ]);
    expect(reloadedCompleted!.status).toBe('Completed');
    expect(reloadedCancelled!.status).toBe('Cancelled');
    expect(reloadedFuture!.status).toBe('Planned'); // already correct via schema default, no-op
    expect(reloadedPast!.status).toBe('Active');
  });

  it('is idempotent: running it twice produces no further changes on the second run', async () => {
    const now = new Date('2026-09-13T00:00:00.000Z');
    await prisma.trip.create({ data: { tripId: 'TEST-BF-STATUS-4', client: 'Test Client', status: 'Complete' } });
    await prisma.leg.create({
      data: {
        legId: 'TEST-BF-STATUS-4-LEG-1', tripId: 'TEST-BF-STATUS-4', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-09-01T06:00:00.000Z'), etaZ: new Date('2026-09-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });

    const firstRun = await backfillLegStatus(prisma, now);
    expect(firstRun).toHaveLength(1);

    const secondRun = await backfillLegStatus(prisma, now);
    expect(secondRun).toHaveLength(0);
  });
});
