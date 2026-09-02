# VIQ Test Foundation + Leg/Stop Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Jest-based server test suite backed by a real Postgres
test database, fix the misleading "N Stops" trip summary, and make
connecting-stop generation idempotent per leg-transition instead of
per-ICAO — closing the gap where repeated-ICAO itineraries silently lose
stops.

**Architecture:** No client-side changes beyond one field in a mapper
function. All schema/logic changes live in `src/server/modules/legs` and
`src/server/modules/stops`. Tests run as plain integration tests
(services instantiated directly with a real `PrismaService`, no NestJS
`Test.createTestingModule` scaffolding needed since none of the touched
services have complex DI graphs) against a second Postgres database
(`jetflow_test`) on the existing `docker-compose.yml` container — no new
infrastructure.

**Tech Stack:** Jest, ts-jest, `@nestjs/testing` types (not its module
bootstrap, per above), Prisma 5, PostgreSQL 16, existing NestJS 10 modules.

**Spec:** `docs/superpowers/specs/2026-09-02-viq-test-foundation-leg-stop-correction-design.md`
(and the Phase 0 assessment it selects from,
`docs/superpowers/specs/2026-09-02-viq-phase0-architectural-assessment.md`,
for background on Conflict #1/#2 this work resolves/documents).

## Global Constraints

- Tests run against a **real** Postgres test database — never mock the
  Prisma client (explicit project guidance; mock/prod divergence is a
  known past failure class here).
- Scope is `src/server` (Leg/Stop/service-generation) only — no
  client-side test framework, no `Stop.stopType`, no ICAO autocomplete, no
  Change Impact Engine work in this plan.
- Every `Stop` row created by `ensureConnectingStops` or the backfill
  script must set `afterLegId` — this is what makes creation idempotent
  per-transition instead of per-ICAO.
- Existing migration folder naming (Prisma's own auto-generated
  `YYYYMMDDHHMMSS_<name>` format) — do not hand-name migration folders.
- All new/modified server files use the project's existing relative-import
  style (`../../prisma/prisma.service`, etc.) — no path aliases exist on
  the server side.

---

## Task 1: Jest test framework + Postgres test database

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `.env.test`
- Create: `tsconfig.test.json`
- Create: `jest.config.js`
- Create: `scripts/setup-test-db.ts`
- Create: `src/server/test/db-test-utils.ts`
- Test: `src/server/test/db-connectivity.spec.ts`

**Interfaces:**
- Produces: `truncateAll(prisma: PrismaClient): Promise<void>` from
  `src/server/test/db-test-utils.ts` — every later spec file's
  `beforeEach` calls this to reset state between tests.
- Produces: `npm test` runs the whole suite against `jetflow_test`;
  `npm run pretest` (auto-invoked by npm before `test`) ensures the
  database exists and is migrated.

- [ ] **Step 1: Install test dependencies**

Run:
```bash
npm install --save-dev jest ts-jest @types/jest dotenv-cli
```

- [ ] **Step 2: Add `.env.test`**

Create `.env.test` at the repo root (same non-secret dev credentials
already committed in `.env.example` — only the database name differs):

```
DATABASE_URL="postgresql://jetflow:jetflow@localhost:5442/jetflow_test?schema=public&connection_limit=5"
```

- [ ] **Step 3: Add `tsconfig.test.json`**

Create `tsconfig.test.json` at the repo root:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src/server/**/*.ts", "scripts/**/*.ts"]
}
```

(`noUnusedLocals`/`noUnusedParameters` relaxed here only — test files
frequently destructure fixtures they don't all use; the production build's
`tsconfig.json` keeps both `true`, unchanged.)

- [ ] **Step 4: Add `jest.config.js`**

Create `jest.config.js` at the repo root:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/server/**/*.spec.ts',
    '<rootDir>/scripts/**/*.spec.ts',
  ],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
};
```

- [ ] **Step 5: Add `scripts/setup-test-db.ts`**

Create the `scripts/` directory and this file:

```ts
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
```

- [ ] **Step 6: Add `src/server/test/db-test-utils.ts`**

Create the `src/server/test/` directory and this file:

```ts
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
```

- [ ] **Step 7: Add `package.json` scripts**

In `package.json`'s `"scripts"` block, add (alongside the existing
`prisma:*` scripts):

```json
"pretest": "dotenv -e .env.test -- ts-node scripts/setup-test-db.ts && dotenv -e .env.test -- prisma migrate deploy",
"test": "dotenv -e .env.test -- jest --runInBand"
```

- [ ] **Step 8: Write the connectivity sanity test**

Create `src/server/test/db-connectivity.spec.ts`:

```ts
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
```

- [ ] **Step 9: Run the suite and confirm it passes**

Run:
```bash
npm test
```
Expected: `npm run pretest` creates `jetflow_test` (first run) or reports
it already exists (subsequent runs), applies all existing migrations to
it, then Jest reports 1 passed test suite, 1 passed test.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .env.test tsconfig.test.json jest.config.js scripts/setup-test-db.ts src/server/test/db-test-utils.ts src/server/test/db-connectivity.spec.ts
git commit -m "test: add Jest test framework against a real Postgres test database

No test framework existed anywhere in the repo. Sets up Jest + ts-jest
running against a second database (jetflow_test) on the existing
docker-compose Postgres container -- no mocked Prisma client, no new
infrastructure. scripts/setup-test-db.ts makes a fresh checkout's first
test run self-sufficient (creates the database if missing).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K4ixVGaAHgJ1GRnLFmvQuz"
```

---

## Task 2: Fix "N Stops" display to count arrival events, not connecting-stop rows

**Files:**
- Modify: `src/client/lib/dataStore.ts:526`

**Interfaces:**
- Consumes: nothing new — `row.legs` is already present in the API
  response this line maps (`src/server/modules/trips/trips.service.ts`'s
  `findAllPaginated`, `include: { legs: {...} } `).
- Produces: no signature change — `Counts.Stops` keeps its existing
  `number` type; only its computed value changes.

This is a pure display fix with no test coverage per this sub-project's
scope decision (client-side tests are out of scope) — verified instead by
a client build. See the design spec's "Root cause" section for why
`Stop`-table row count and the trip's real stop count are different
things: `Stop` rows represent connecting/technical layovers between two
legs, but "N Stops" should mean arrival events (one per leg, including the
final destination).

- [ ] **Step 1: Change the mapping**

In `src/client/lib/dataStore.ts`, find (around line 526):

```ts
      Counts: { Stops: row._count.stops, Services: row._count.services, Comms: row._count.comms },
```

Replace with:

```ts
      // "N Stops" means arrival events (one per leg, destination included),
      // not the Stop table's row count -- that table tracks a different
      // concept (connecting/technical layovers between two legs). A
      // single-leg trip (e.g. HTDA -> FALA) has zero connecting Stop rows
      // but is legitimately "1 stop: FALA" from a coordinator's point of
      // view. See docs/superpowers/specs/2026-09-02-viq-test-foundation-leg-stop-correction-design.md.
      Counts: { Stops: row.legs.length, Services: row._count.services, Comms: row._count.comms },
```

- [ ] **Step 2: Verify with a type-check build**

Run:
```bash
npm run build:client
```
Expected: builds with no TypeScript errors (`row.legs` is already typed
as an array on this response shape — no type change needed).

- [ ] **Step 3: Commit**

```bash
git add src/client/lib/dataStore.ts
git commit -m "fix: trip 'N Stops' summary counts arrival events, not connecting-stop rows

A single-leg trip (HTDA -> FALA) always showed '0 Stops' because the Stop
table only tracks connecting/technical layovers between two legs, and a
single leg has no 'next leg' to connect to. Coordinators read 'N Stops' as
arrival events including the destination -- compute it from legs.length
instead of the Stop table's row count. The Stop table's own meaning is
unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K4ixVGaAHgJ1GRnLFmvQuz"
```

---

## Task 3: Add `Stop.afterLegId` schema column

**Files:**
- Modify: `prisma/schema.prisma` (`Stop` model, `Leg` model)
- Create: `prisma/migrations/<auto-generated-timestamp>_add_stop_after_leg_id/migration.sql` (Prisma generates this — do not hand-write it)
- Test: `src/server/modules/stops/stop-after-leg-id.spec.ts`

**Interfaces:**
- Produces: `Stop.afterLegId: string | null` on the generated Prisma
  Client type, unique when set, FK to `Leg.legId` with `onDelete: SetNull`.
  Task 4 relies on this field existing and being unique-constrained.

This task is schema-first rather than strict test-first: the test in Step
4 below references `prisma.stop.create({ data: { afterLegId: ... } })`,
which cannot type-check until the Prisma Client is regenerated from the
updated schema — the same ordering already used for this project's other
schema-driven fixes (e.g. the `trip_id_counters` atomic-counter migration).

- [ ] **Step 1: Modify `prisma/schema.prisma`**

In the `Stop` model, add the new column and its relation:

```prisma
model Stop {
  stopId          String   @id @map("stop_id")
  tripId          String   @map("trip_id")
  icao            String
  arrZ            DateTime @map("arr_z")
  depZ            DateTime @map("dep_z")
  groundTimeHours Float    @map("ground_time_hours")
  purpose         String
  afterLegId      String?  @unique @map("after_leg_id")

  trip     Trip @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  afterLeg Leg? @relation(fields: [afterLegId], references: [legId], onDelete: SetNull)

  @@index([tripId])
  @@map("stops")
}
```

In the `Leg` model, add the back-relation field (no attributes needed —
the FK/unique constraint lives on the `Stop` side above):

```prisma
model Leg {
  legId              String   @id @map("leg_id")
  tripId             String   @map("trip_id")
  seq                Int
  depIcao            String   @map("dep_icao")
  arrIcao            String   @map("arr_icao")
  etdZ               DateTime @map("etd_z")
  etaZ               DateTime @map("eta_z")
  blockHours         Float    @map("block_hours")
  paxCount           Int      @default(0) @map("pax_count")
  crewCount          Int      @default(0) @map("crew_count")
  countriesOverflown String[] @map("countries_overflown")
  revision           Int      @default(1)
  callSign           String?  @map("call_sign")
  purpose            String?
  avoidFirs          String[] @map("avoid_firs")
  includeFirs        String[] @map("include_firs")
  routing            String?

  trip           Trip                  @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  assignments    LegPersonAssignment[]
  connectingStop Stop?

  @@index([tripId])
  @@index([etdZ])
  @@map("legs")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run (against the dev database, via the existing `.env`):
```bash
npx prisma migrate dev --name add_stop_after_leg_id
```
Expected: Prisma prints a new migration folder name under
`prisma/migrations/`, applies it to the `jetflow` dev database, and
regenerates the Prisma Client. Confirm the generated
`migration.sql` contains an `ALTER TABLE "stops" ADD COLUMN "after_leg_id"
TEXT` plus a unique index and an `ALTER TABLE ... ADD CONSTRAINT ...
FOREIGN KEY ("after_leg_id") REFERENCES "legs"("leg_id") ... ON DELETE SET
NULL`.

- [ ] **Step 3: Apply the same migration to the test database**

Run:
```bash
npm run pretest
```
Expected: the same migration applies cleanly to `jetflow_test`.

- [ ] **Step 4: Write the uniqueness-constraint test**

Create `src/server/modules/stops/stop-after-leg-id.spec.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run:
```bash
npm test -- stop-after-leg-id
```
Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/modules/stops/stop-after-leg-id.spec.ts
git commit -m "feat: add Stop.afterLegId column linking a connecting stop to its leg transition

Prerequisite for Task 4's idempotency fix: ensureConnectingStops currently
dedups by ICAO across the whole trip, which silently drops stops for
repeated-ICAO itineraries. This column lets the idempotency check be
per-transition instead. Nullable + unique; manually added stops leave it
null and are never touched by the generator.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K4ixVGaAHgJ1GRnLFmvQuz"
```

---

## Task 4: Remove ICAO-based dedup in `ensureConnectingStops`

**Files:**
- Modify: `src/server/modules/legs/legs.service.ts:105-131`
- Modify: `src/server/modules/stops/dto/create-stop.dto.ts`
- Test: `src/server/modules/legs/stop-generation.spec.ts`

**Interfaces:**
- Consumes: `Stop.afterLegId` (Task 3), `truncateAll` (Task 1).
- Produces: no public signature change to `LegsService` — `create()` and
  `update()` keep their existing signatures; only the private
  `ensureConnectingStops` method's internal logic changes.

This is the direct fix for Conflict #1 from the Phase 0 assessment. Tests
are written first — scenarios 1 and 2 pass against the *current* buggy
code, but scenarios 3 and 4 fail against it, demonstrating the bug before
it's fixed.

- [ ] **Step 1: Write the four stop-scenario tests**

Create `src/server/modules/legs/stop-generation.spec.ts`:

```ts
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { LegsService } from './legs.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('connecting-stop generation', () => {
  let prisma: PrismaService;
  let legs: LegsService;
  let trips: TripsService;
  let tripCounter = 0;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // PrismaService extends PrismaClient, so it's assignable directly --
    // no cast needed.
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    const services = new ServicesService(prisma, audit);
    const stops = new StopsService(prisma, audit);
    legs = new LegsService(prisma, audit, services, stops);
    trips = new TripsService(prisma, audit);
    tripCounter += 1;
  });

  async function makeTrip(): Promise<string> {
    const tripId = `TEST-STOPS-${tripCounter}`;
    await trips.create({ tripId, client: 'Test Client' });
    return tripId;
  }

  async function addLeg(
    tripId: string,
    seq: number,
    depIcao: string,
    arrIcao: string,
    etdZ: string,
    etaZ: string,
  ) {
    return legs.create({
      legId: `${tripId}-LEG-${seq}`,
      tripId,
      seq,
      depIcao,
      arrIcao,
      etdZ,
      etaZ,
      countriesOverflown: [],
      generateServices: false,
    });
  }

  it('scenario 1: HTDA -> FALA (single leg) has zero connecting Stop rows and a display count of 1', async () => {
    const tripId = await makeTrip();
    await addLeg(tripId, 1, 'HTDA', 'FALA', '2026-10-01T06:00:00.000Z', '2026-10-01T09:00:00.000Z');

    const allLegs = await prisma.leg.findMany({ where: { tripId } });
    const stopRows = await prisma.stop.findMany({ where: { tripId } });

    expect(allLegs).toHaveLength(1); // display stop count = legs.length = 1 (FALA)
    expect(stopRows).toHaveLength(0); // no connecting transition exists
  });

  it('scenario 2: FALA -> HECA -> HAAB (two legs, no repeats) creates one connecting stop at HECA', async () => {
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'FALA', 'HECA', '2026-10-01T06:00:00.000Z', '2026-10-01T09:00:00.000Z');
    await addLeg(tripId, 2, 'HECA', 'HAAB', '2026-10-01T11:00:00.000Z', '2026-10-01T14:00:00.000Z');

    const allLegs = await prisma.leg.findMany({ where: { tripId } });
    const stopRows = await prisma.stop.findMany({ where: { tripId } });

    expect(allLegs).toHaveLength(2); // display stop count = 2 (HECA, HAAB)
    expect(stopRows).toHaveLength(1);
    expect(stopRows[0].icao).toBe('HECA');
    expect(stopRows[0].afterLegId).toBe(leg1.legId);
  });

  it('scenario 3: HTDA -> FALA -> FALA (repeated ICAO, demo-flight shape) creates two distinct connecting Stop rows at FALA', async () => {
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'HTDA', 'FALA', '2026-10-01T06:00:00.000Z', '2026-10-01T09:00:00.000Z');
    await addLeg(tripId, 2, 'FALA', 'FALA', '2026-10-01T10:00:00.000Z', '2026-10-01T10:30:00.000Z');

    const stopRows = await prisma.stop.findMany({ where: { tripId }, orderBy: { stopId: 'asc' } });

    // Before this fix, the second FALA transition's stop was silently
    // dropped by ICAO-based dedup -- this is the direct regression test
    // for Conflict #1 in the Phase 0 assessment.
    expect(stopRows).toHaveLength(1); // one connecting transition: HTDA->FALA, FALA->FALA
    expect(stopRows[0].icao).toBe('FALA');
    expect(stopRows[0].afterLegId).toBe(leg1.legId);
  });

  it('scenario 4: FALA -> FALA -> FBMN (repeated ICAO, different position) creates exactly one connecting stop, and FBMN is display-only', async () => {
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'FALA', 'FALA', '2026-10-01T06:00:00.000Z', '2026-10-01T06:30:00.000Z');
    await addLeg(tripId, 2, 'FALA', 'FBMN', '2026-10-01T07:00:00.000Z', '2026-10-01T10:00:00.000Z');

    const allLegs = await prisma.leg.findMany({ where: { tripId } });
    const stopRows = await prisma.stop.findMany({ where: { tripId } });

    expect(allLegs).toHaveLength(2); // display stop count = 2 (FALA, FBMN)
    expect(stopRows).toHaveLength(1); // only the FALA->FALA transition connects
    expect(stopRows[0].icao).toBe('FALA');
    expect(stopRows[0].afterLegId).toBe(leg1.legId);
  });

  it('two non-adjacent transitions sharing the same ICAO each get their own Stop row', async () => {
    // HTDA->FALA, FALA->HECA, HECA->FALA, FALA->FBMN: FALA is the
    // connecting airport for two separate, non-adjacent transitions.
    const tripId = await makeTrip();
    const leg1 = await addLeg(tripId, 1, 'HTDA', 'FALA', '2026-10-01T04:00:00.000Z', '2026-10-01T06:00:00.000Z');
    await addLeg(tripId, 2, 'FALA', 'HECA', '2026-10-01T07:00:00.000Z', '2026-10-01T09:00:00.000Z');
    const leg3 = await addLeg(tripId, 3, 'HECA', 'FALA', '2026-10-01T10:00:00.000Z', '2026-10-01T12:00:00.000Z');
    await addLeg(tripId, 4, 'FALA', 'FBMN', '2026-10-01T13:00:00.000Z', '2026-10-01T16:00:00.000Z');

    const stopRows = await prisma.stop.findMany({ where: { tripId }, orderBy: { arrZ: 'asc' } });
    const falaStops = stopRows.filter((s) => s.icao === 'FALA');

    expect(stopRows).toHaveLength(3); // FALA (after leg1), HECA (after leg2), FALA (after leg3)
    expect(falaStops).toHaveLength(2);
    expect(falaStops.map((s) => s.afterLegId).sort()).toEqual([leg1.legId, leg3.legId].sort());
  });
});
```

- [ ] **Step 2: Run the tests and confirm scenarios 3/4 fail, 1/2 pass**

Run:
```bash
npm test -- stop-generation
```
Expected: `scenario 1` and `scenario 2` PASS. `scenario 3`, `scenario 4`,
and the non-adjacent-repeat test FAIL — the current `stopIcaos` Set in
`ensureConnectingStops` collapses repeated-ICAO transitions into one `Stop`
row (or zero, for the second/third occurrence), and `afterLegId` doesn't
exist as a settable field on `StopsService.create()`'s DTO yet.

- [ ] **Step 3: Add `afterLegId` to `CreateStopDto`**

In `src/server/modules/stops/dto/create-stop.dto.ts`, add after the
`purpose` field:

```ts
  @IsOptional()
  @IsString()
  @MaxLength(200)
  afterLegId?: string;
```

(`StopsService.create()` already spreads `...data` from the DTO straight
into `prisma.stop.create({ data })` — no service-layer change needed
beyond this DTO field existing.)

- [ ] **Step 4: Rewrite `ensureConnectingStops`**

In `src/server/modules/legs/legs.service.ts`, replace the entire private
method (lines 105-131) with:

```ts
  // Item 16 (extended): when consecutive legs connect (this leg's arrival
  // = the next leg's departure), that airport is a real stop the trip
  // makes -- ensure a Stop row exists for it instead of requiring it to
  // be added by hand. Idempotency is checked per leg-transition
  // (Stop.afterLegId), never by ICAO alone -- a repeated-ICAO itinerary
  // (a demo flight landing at the same airport twice, or revisiting an
  // airport later in the trip) must get one Stop row per transition, not
  // one Stop row per distinct ICAO. See the Phase 0 assessment's
  // Conflict #1 for why the previous ICAO-Set-based dedup was wrong.
  private async ensureConnectingStops(tripId: string, user: string) {
    const legs = await this.prisma.leg.findMany({ where: { tripId }, orderBy: { seq: 'asc' } });

    for (let i = 0; i < legs.length - 1; i++) {
      const current = legs[i];
      const next = legs[i + 1];
      if (current.arrIcao !== next.depIcao) continue; // not a connecting route

      const already = await this.prisma.stop.findUnique({ where: { afterLegId: current.legId } });
      if (already) continue; // this specific transition already has its stop

      const icao = current.arrIcao;
      const stopId = `${tripId}-STOP-${icao}-${Date.now().toString(36).toUpperCase()}`;
      const groundTimeHours = Math.max(0, (next.etdZ.getTime() - current.etaZ.getTime()) / (1000 * 60 * 60));
      await this.stops.create({
        stopId,
        tripId,
        icao,
        arrZ: current.etaZ.toISOString(),
        depZ: next.etdZ.toISOString(),
        groundTimeHours,
        purpose: 'Tech',
        afterLegId: current.legId,
        user,
      });
    }
  }
```

- [ ] **Step 5: Run the tests and confirm all pass**

Run:
```bash
npm test -- stop-generation
```
Expected: all 5 tests pass.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run:
```bash
npm test
```
Expected: all test suites pass (connectivity, `stop-after-leg-id`,
`stop-generation`).

- [ ] **Step 7: Commit**

```bash
git add src/server/modules/legs/legs.service.ts src/server/modules/stops/dto/create-stop.dto.ts src/server/modules/legs/stop-generation.spec.ts
git commit -m "fix: make connecting-stop generation idempotent per leg-transition, not per-ICAO

ensureConnectingStops used to dedup by a trip-wide Set of ICAOs, so a
repeated-ICAO itinerary (a demo flight landing twice at the same airport,
or revisiting an airport later in the trip) silently lost the Stop row for
every occurrence after the first. Now checks Stop.afterLegId per specific
leg transition instead -- resolves Conflict #1 from the Phase 0 assessment,
fully honoring the 'never dedup by ICAO' requirement.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K4ixVGaAHgJ1GRnLFmvQuz"
```

---

## Task 5: Data-repair backfill script for existing trips

**Files:**
- Create: `scripts/backfill-stop-after-leg-id.ts`
- Test: `scripts/backfill-stop-after-leg-id.spec.ts`

**Interfaces:**
- Produces: `backfillStopAfterLegId(prisma: PrismaClient): Promise<{ tripId: string; claimed: number; created: number }[]>`
  — exported for the test to call directly; also runnable as a CLI script.

Repairs trips created before Task 4's fix: links existing `Stop` rows to
the leg transition that produced them, and creates any `Stop` row the old
ICAO-based dedup silently suppressed. Per the design spec's rollout
guidance, this script is a manually-invoked, one-time data repair — not
wired into `prisma migrate deploy` or any automatic hook.

- [ ] **Step 1: Write the failing test**

Create `scripts/backfill-stop-after-leg-id.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm test -- backfill-stop-after-leg-id
```
Expected: FAIL — `backfill-stop-after-leg-id.ts` doesn't exist yet
(`Cannot find module './backfill-stop-after-leg-id'`).

- [ ] **Step 3: Implement the backfill script**

Create `scripts/backfill-stop-after-leg-id.ts`:

```ts
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
      prisma.stop.findMany({ where: { tripId, afterLegId: null } }),
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

      const matchIdx = unclaimed.findIndex((s) => s.icao === current.arrIcao);
      if (matchIdx >= 0) {
        const [match] = unclaimed.splice(matchIdx, 1);
        await prisma.stop.update({ where: { stopId: match.stopId }, data: { afterLegId: current.legId } });
        claimed += 1;
      } else {
        const stopId = `${tripId}-STOP-${current.arrIcao}-${Date.now().toString(36).toUpperCase()}-BF`;
        const groundTimeHours = Math.max(0, (next.etdZ.getTime() - current.etaZ.getTime()) / (1000 * 60 * 60));
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run:
```bash
npm test -- backfill-stop-after-leg-id
```
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-stop-after-leg-id.ts scripts/backfill-stop-after-leg-id.spec.ts
git commit -m "feat: add one-time data-repair script for pre-fix connecting stops

Trips created before Task 4's afterLegId fix may be missing Stop rows the
old ICAO-based dedup silently suppressed. This script (manually invoked,
not part of prisma migrate deploy) links existing stops to their leg
transition and creates any that were dropped, logging a per-trip
claimed/created summary for review before running against production.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K4ixVGaAHgJ1GRnLFmvQuz"
```

---

## Task 6: Documenting regression test for service re-generation

**Files:**
- Test: `src/server/modules/services/service-regeneration.spec.ts`

**Interfaces:**
- Consumes: `ServicesService.generateOverflightServices(legId: string, user?: string)` (existing, unchanged).

This test does not fix anything — it documents, via a passing test, the
known limitation flagged as Conflict #2 in the Phase 0 assessment:
`generateOverflightServices` regenerates a deleted service on the next
call, since there's no dismissal-tracking. Fixing this belongs to the
future Change Impact Engine phase, not this sub-project. The test exists
so this behavior is asserted and named, not silently uncovered.

- [ ] **Step 1: Write the test**

Create `src/server/modules/services/service-regeneration.spec.ts`:

```ts
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { LegsService } from '../legs/legs.service';
import { StopsService } from '../stops/stops.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('generateOverflightServices — known regeneration limitation (Phase 0 Conflict #2)', () => {
  let prisma: PrismaService;
  let services: ServicesService;
  let legs: LegsService;
  let trips: TripsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // PrismaService extends PrismaClient, so it's assignable directly --
    // no cast needed.
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    services = new ServicesService(prisma, audit);
    const stops = new StopsService(prisma, audit);
    legs = new LegsService(prisma, audit, services, stops);
    trips = new TripsService(prisma, audit);

    await prisma.country.create({
      data: {
        iso2: 'ZZ',
        name: 'Testland',
        overflightPermitRequired: true,
        centroidLat: 0,
        centroidLng: 0,
      },
    });
  });

  it(
    'a manually deleted auto-generated Overflight service reappears the next time generateOverflightServices runs -- ' +
      'known limitation, not fixed by this phase, tracked for the future Change Impact Engine',
    async () => {
      const tripId = 'TEST-REGEN-1';
      await trips.create({ tripId, client: 'Test Client' });
      const leg = await legs.create({
        legId: `${tripId}-LEG-1`,
        tripId,
        seq: 1,
        depIcao: 'HTDA',
        arrIcao: 'FALA',
        etdZ: '2026-10-01T06:00:00.000Z',
        etaZ: '2026-10-01T09:00:00.000Z',
        countriesOverflown: ['ZZ'],
        generateServices: false, // generate explicitly below, scoped to Overflight only
      });

      await services.generateOverflightServices(leg.legId, 'SYSTEM');
      const afterCreate = await prisma.service.findMany({
        where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
      });
      expect(afterCreate).toHaveLength(1);

      await prisma.service.delete({ where: { svcId: afterCreate[0].svcId } });
      const afterDelete = await prisma.service.findMany({
        where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
      });
      expect(afterDelete).toHaveLength(0);

      await services.generateOverflightServices(leg.legId, 'SYSTEM');
      const afterRegenerate = await prisma.service.findMany({
        where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
      });
      expect(afterRegenerate).toHaveLength(1); // reappeared -- documented limitation, not a bug in this phase
    },
  );
});
```

- [ ] **Step 2: Run the test and confirm it passes**

Run:
```bash
npm test -- service-regeneration
```
Expected: PASS (the test documents existing behavior — it isn't expected
to fail).

- [ ] **Step 3: Run the entire suite one last time**

Run:
```bash
npm test
```
Expected: every test suite passes — `db-connectivity`,
`stop-after-leg-id`, `stop-generation`, `backfill-stop-after-leg-id`,
`service-regeneration`.

- [ ] **Step 4: Commit**

```bash
git add src/server/modules/services/service-regeneration.spec.ts
git commit -m "test: document the known service-regeneration limitation (Phase 0 Conflict #2)

generateOverflightServices has no dismissal-tracking -- a manually deleted
auto-generated service reappears the next time it runs. This test locks
in and names that behavior rather than leaving it silently uncovered.
Fixing it is out of scope for this phase; it belongs to the future Change
Impact Engine (Phase 0 assessment, Conflict #2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K4ixVGaAHgJ1GRnLFmvQuz"
```

---

## Post-plan reminder

`scripts/backfill-stop-after-leg-id.ts` has **not** been run against the
real `jetflow` database by this plan — only exercised in tests against
`jetflow_test`. Running it against real trip data is a separate,
deliberate action for the user to take (per the design spec's staged
rollout guidance: copy of production first, review the delta, then a
low-traffic-window production run) — do not run it against `jetflow`
automatically as part of executing this plan.
