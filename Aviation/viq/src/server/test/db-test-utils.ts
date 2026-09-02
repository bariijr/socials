// src/server/test/db-test-utils.ts
//
// Shared helper for integration test isolation: truncates every table in
// the public schema (except Prisma's own migration-tracking table)
// between tests, so no test leaks state into the next one. Table list is
// read from Postgres itself rather than hardcoded, so it never goes
// stale as the schema grows.
import { PrismaClient } from '@prisma/client';

// Safety guard: `dotenv-cli` (used by `npm test`) does not override an
// already-exported DATABASE_URL environment variable, so a shell that has
// DATABASE_URL pointing at the real dev database (or worse) would have
// every test suite's beforeEach TRUNCATE it wholesale. Refuse to run
// unless the resolved database name ends with `_test` -- jetflow_test
// (this project's test database) passes; jetflow (dev) does not.
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const [{ current_database: dbName }] = await prisma.$queryRaw<{ current_database: string }[]>`
    SELECT current_database()
  `;
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `truncateAll refused to run: connected database "${dbName}" does not end with "_test". ` +
        'This almost certainly means DATABASE_URL is pointing at a non-test database (dotenv-cli ' +
        'does not override an already-exported DATABASE_URL). Refusing to avoid truncating real data.',
    );
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
