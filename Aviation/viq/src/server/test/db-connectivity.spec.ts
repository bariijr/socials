import { PrismaClient } from '@prisma/client';
import { truncateAll } from './db-test-utils';

describe('test database connectivity', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects, truncates, and can round-trip a simple query', async () => {
    await truncateAll(prisma);
    const result = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 as one`;
    expect(result[0].one).toBe(1);
  });
});
