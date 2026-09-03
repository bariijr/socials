import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';

describe('Trip version/status-tracking columns', () => {
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

  it('defaults a new Trip to version 1 with null status-change tracking', async () => {
    const trip = await prisma.trip.create({
      data: { tripId: 'TEST-VERSION-1', client: 'Test Client' },
    });

    expect(trip.version).toBe(1);
    expect(trip.statusChangedAt).toBeNull();
    expect(trip.statusChangedBy).toBeNull();
  });
});
