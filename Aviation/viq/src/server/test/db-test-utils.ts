// src/server/test/db-test-utils.ts
//
// Shared helper for integration test isolation: truncates every table in
// the public schema (except Prisma's own migration-tracking table)
// between tests, so no test leaks state into the next one. Table list is
// read from Postgres itself rather than hardcoded, so it never goes
// stale as the schema grows.
import { PrismaClient } from '@prisma/client';

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
