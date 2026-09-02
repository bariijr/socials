// scripts/setup-test-db.ts
//
// Idempotent: creates the database named in DATABASE_URL if it doesn't
// already exist, using a connection to the "postgres" maintenance
// database on the same server. Run via `npm run pretest` (see
// package.json) before every test run, so a fresh checkout never needs a
// manual database-creation step.
import { PrismaClient } from '@prisma/client';

async function main() {
  const testUrl = process.env.DATABASE_URL;
  if (!testUrl) {
    throw new Error('DATABASE_URL is not set — expected the jetflow_test connection string from .env.test');
  }
  const dbNameMatch = testUrl.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch?.[1];
  if (!dbName) {
    throw new Error(`Could not parse a database name out of DATABASE_URL: ${testUrl}`);
  }

  const adminUrl = testUrl.replace(`/${dbName}`, '/postgres');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database "${dbName}".`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(message)) {
      console.log(`Database "${dbName}" already exists — skipping.`);
    } else {
      throw err;
    }
  } finally {
    await admin.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
