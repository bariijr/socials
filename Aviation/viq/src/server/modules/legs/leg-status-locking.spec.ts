import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';

describe('Leg version/status-tracking columns', () => {
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

  it('defaults a new Leg to status Planned with null status-change tracking', async () => {
    await prisma.trip.create({ data: { tripId: 'TEST-LEG-STATUS-1', client: 'Test Client' } });
    const leg = await prisma.leg.create({
      data: {
        legId: 'TEST-LEG-STATUS-1-LEG-1', tripId: 'TEST-LEG-STATUS-1', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });

    expect(leg.status).toBe('Planned');
    expect(leg.statusChangedAt).toBeNull();
    expect(leg.statusChangedBy).toBeNull();
  });
});
