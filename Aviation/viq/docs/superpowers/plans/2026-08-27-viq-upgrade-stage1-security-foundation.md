# VIQ Upgrade — Stage 1: Correctness & Security Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three release-blocking items from the VIQ Scale Review (the trip-ID race condition, the rate limiter's in-memory storage, and unthrottled login) plus the remaining Stage 1 hardening items agreed in the ChatGPT peer-review debate — before any horizontal scaling or further feature work.

**Architecture:** Seven tasks. The first introduces Redis as new shared infrastructure (used *only* for rate-limiter state — not general caching, per the explicit debate decision). The trip-ID fix moves ID generation from an application-level count-then-format race into a single atomic SQL statement. Everything else (helmet, health endpoint, DTO validation) is additive hardening with no architectural change.

**Tech Stack:** NestJS 10 / Prisma 5 / PostgreSQL 16 (unchanged) + Redis 7 (new) via `ioredis` + `@nest-lab/throttler-storage-redis` (new dependencies), `helmet` (new dependency).

**Spec:** None. Every decision below was resolved in the conversation this plan came from: the VIQ Scale Review (`.superpowers/audit-2026-08-27-*.md`), the ChatGPT peer-review response, and the user's explicit agreement to proceed with the corrected Stage 1 list (dropping two already-implemented items ChatGPT proposed: generic login-failure messages and the 8-character password minimum both already exist in `auth.service.ts`/`create-user.dto.ts`).

## Global Constraints

- This repo has no automated test framework. Verify every task with `npm run build:server`/`npm run build`, plus the live check the task specifies.
- This project is **not** git-tracked. Do not run any `git` commands, no commit steps.
- Windows/Prisma: if a build reports `EPERM` on `query_engine-windows.dll.node`, run `Get-Process node | Stop-Process -Force` first, then rebuild.
- Start the server for live checks via `npm run build` then `npm run start:prod` (`node dist/main.js`). Never `npm run start`/`nest start`. Stop the process when done.
- Postgres runs in Docker container `jetflow_api_postgres` on host port 5442 (`docker start jetflow_api_postgres` if not running). Credentials: user `jetflow`, password `jetflow`, database `jetflow`.
- **Never type a real password into any UI.** Mint JWTs locally via a `node -e` script using `jsonwebtoken` and this project's `.env`'s `JWT_SECRET`, payload `{ sub, username, role }` matching `auth.service.ts`'s login shape. Seeded users: `admin` (id `cmt9tqrv50000xruguvay2dsd`, role Admin), `coordinator1` (id `cmt9u8jfg0000coz4t3cjs1po`, role Coordinator).
- Redis is **new infrastructure scoped narrowly**: it backs the rate limiter's shared counters only. Do not use it as a general cache or session store in this plan — that's explicitly out of scope per the debate that produced this plan.
- New npm dependencies: install with `npm install <package>[@version]`.

---

### Task 1: Fix `nextTripId()`'s race condition with a database-level atomic counter

**Files:**
- Modify: `prisma/schema.prisma` (add `TripIdCounter` model)
- Create: `prisma/migrations/<timestamp>_add_trip_id_counter/migration.sql` (via `prisma migrate dev --create-only`, then hand-edited)
- Modify: `src/server/modules/trips/trips.service.ts` (rewrite `nextTripId()`)

**Interfaces:**
- Produces: `TripsService.nextTripId(): Promise<string>` — same signature and return shape as before (a 7-character `YYMM###` string), just implemented atomically. No other task depends on this one, but this must land and be verified correct *before* Task 2 introduces rate limiting on `/api/quotes` — deliberately sequenced this way so this task's concurrency test isn't complicated by an active rate limit.

**Why this matters:** the current implementation does `count()` then `format(count+1)` — two round-trips with no lock between them. Two concurrent trip-creation requests can read the same count, both compute the same ID, and the second insert fails on the unique-key constraint with an uncaught 500. This was discovered live during the original hardening pass's rate-limiter testing and independently confirmed by three separate reviews as a bug that gets *worse*, not just "still present," as concurrent usage grows.

- [ ] **Step 1: Confirm the current trip data this fix must not break**

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT trip_id FROM trips ORDER BY trip_id;"
```

Expected (as of this plan's writing): `2608001, 2608002, 2608003, 2608004, 2608009` — all sharing prefix `2608`, highest suffix `009`. If your actual output differs, use the real highest suffix per prefix in Step 5's verification instead of the number `9` used there as an example.

- [ ] **Step 2: Add the counter model to the schema**

In `prisma/schema.prisma`, add this model anywhere alongside the other models (e.g., right after the `Trip` model, which ends around line 304):

```prisma
model TripIdCounter {
  prefix String @id
  count  Int    @default(0)

  @@map("trip_id_counters")
}
```

- [ ] **Step 3: Generate the migration without applying it yet**

```bash
npx prisma migrate dev --create-only --name add_trip_id_counter
```

This writes a new file at `prisma/migrations/<timestamp>_add_trip_id_counter/migration.sql`. It should contain a `CREATE TABLE "trip_id_counters" (...)` statement (exact formatting comes from Prisma's generator — the important part is that it creates the table with a `prefix` primary key and an `count` integer column defaulting to 0; if the generated column ordering or constraint names differ slightly from what's shown here, that's fine).

- [ ] **Step 4: Append the backfill to the SAME migration file**

Open the migration file `prisma/migrations/<timestamp>_add_trip_id_counter/migration.sql` that Step 3 just created, and append this SQL to the **end** of it (after the generated `CREATE TABLE` statement):

```sql

-- Backfill: seed each existing trip-ID prefix's counter from the current
-- max suffix, so the first call to nextTripId() after this migration
-- continues the sequence instead of restarting at 001 and colliding with
-- an existing trip.
INSERT INTO "trip_id_counters" ("prefix", "count")
SELECT LEFT("trip_id", 4) AS prefix, MAX(CAST(RIGHT("trip_id", 3) AS INTEGER)) AS count
FROM "trips"
GROUP BY LEFT("trip_id", 4)
ON CONFLICT ("prefix") DO UPDATE SET "count" = GREATEST("trip_id_counters"."count", EXCLUDED."count");
```

This step is **not optional** — without it, the very first trip created after this migration would generate an ID that collides with an existing one.

- [ ] **Step 5: Apply the migration**

```bash
npx prisma migrate dev
```

This applies the migration file from Steps 3-4 (schema.prisma and the migration are already in sync, so this just runs the pending migration).

- [ ] **Step 6: Verify the backfill**

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT * FROM trip_id_counters;"
```

Expected: one row, `prefix = '2608'`, `count = 9` (or whatever the real highest suffix was per Step 1's actual output, if it differed from the example above).

- [ ] **Step 7: Rewrite `nextTripId()` to use an atomic upsert-increment**

In `src/server/modules/trips/trips.service.ts`, find:

```ts
  async nextTripId(): Promise<string> {
    const now = new Date();
    const prefix = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.prisma.trip.count({ where: { tripId: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(3, '0')}`;
  }
```

Replace with:

```ts
  async nextTripId(): Promise<string> {
    const now = new Date();
    const prefix = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Atomic upsert-increment — a single SQL statement, so Postgres's own
    // row-level locking on the "trip_id_counters" row serializes concurrent
    // callers (including across multiple server processes), unlike the
    // previous count()-then-format() approach this replaces.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO trip_id_counters (prefix, count)
      VALUES (${prefix}, 1)
      ON CONFLICT (prefix) DO UPDATE SET count = trip_id_counters.count + 1
      RETURNING count
    `;
    return `${prefix}${String(rows[0].count).padStart(3, '0')}`;
  }
```

- [ ] **Step 8: Build**

```bash
npm run build:server
```

Expected: no TypeScript errors.

- [ ] **Step 9: Live-verify under real concurrency**

Start the server (`npm run build` then `npm run start:prod`). The `/api/quotes` endpoint is NOT yet rate-limited at this point in the plan (Task 2 adds that next), so this test can fire genuinely concurrent requests without hitting a limiter:

```bash
node -e "
const payload = JSON.stringify({client: 'Concurrency Test', legs: [{clientLegId: '1', seq: 1, depIcao: 'KJFK', arrIcao: 'EGLL', etdZ: '2026-09-01T10:00:00Z', etaZ: '2026-09-01T18:00:00Z'}]});
const requests = Array.from({length: 20}, () =>
  fetch('http://localhost:4001/api/quotes', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: payload })
    .then(r => r.status)
);
Promise.all(requests).then(statuses => {
  console.log('Status codes:', statuses);
  console.log('All 201?', statuses.every(s => s === 201));
});
"
```

Expected: `All 201? true` — 20 genuinely concurrent requests, all succeeding with unique trip IDs (a pre-fix run of this exact test would have produced some `500`s from ID collisions). Confirm no duplicates and no failures:

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT trip_id, COUNT(*) FROM trips WHERE client = 'Concurrency Test' GROUP BY trip_id HAVING COUNT(*) > 1;"
```

Expected: 0 rows (no duplicate IDs were assigned). Then clean up:

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "DELETE FROM trips WHERE client = 'Concurrency Test';"
```

Expected: `DELETE 20`. Stop the server afterward.

---

### Task 2: Introduce Redis as shared throttler-state infrastructure

**Files:**
- Modify: `docker-compose.yml` (add a `redis` service)
- Modify: `.env.example` (add `REDIS_URL`)
- Create: `src/server/modules/throttling/throttling.module.ts`

**Interfaces:**
- Produces: a globally-available `ThrottlerModule` registration (via `@Global()`) backed by Redis, so any controller anywhere in the app can apply `@UseGuards(ThrottlerGuard)` without importing anything extra. Tasks 3 and 4 both consume this — neither imports `ThrottlerModule` directly.
- Consumes: nothing from earlier tasks.

**Why Redis, and why scoped this narrowly:** `@nestjs/throttler`'s default storage is an in-memory `Map`, correct only within a single Node process. The moment VIQ runs as more than one instance, each instance tracks its own counters, silently multiplying the effective rate limit by however many instances are running. This task's ONLY job is fixing that — Redis is not being introduced as a general cache or session store here (explicitly out of scope, decided in the debate that produced this plan).

- [ ] **Step 1: Add Redis to the local dev stack**

In `docker-compose.yml`, find:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: jetflow_api_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: jetflow
      POSTGRES_PASSWORD: jetflow
      POSTGRES_DB: jetflow
    ports:
      - "5442:5432"
    volumes:
      - jetflow_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jetflow -d jetflow"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  jetflow_pg_data:
```

Replace with:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: jetflow_api_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: jetflow
      POSTGRES_PASSWORD: jetflow
      POSTGRES_DB: jetflow
    ports:
      - "5442:5432"
    volumes:
      - jetflow_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jetflow -d jetflow"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: jetflow_api_redis
    restart: unless-stopped
    ports:
      - "6389:6379"
    volumes:
      - jetflow_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  jetflow_pg_data:
  jetflow_redis_data:
```

- [ ] **Step 2: Start it and confirm it's healthy**

```bash
docker compose up -d redis
docker ps --filter name=jetflow_api_redis --format "{{.Names}}: {{.Status}}"
```

Expected: status shows `(healthy)` within a few seconds.

- [ ] **Step 3: Document the connection string**

In `.env.example`, find:

```
JWT_SECRET="replace-with-a-long-random-secret"
ADMIN_USERNAME=admin
```

Replace with:

```
JWT_SECRET="replace-with-a-long-random-secret"
REDIS_URL="redis://localhost:6389"
ADMIN_USERNAME=admin
```

Also add the same line to your own local `.env` file (not `.env.example`) if it doesn't already have one — `.env` is gitignored and not part of this diff, but the app won't find Redis without it:

```bash
node -e "const fs=require('fs'); const c=fs.readFileSync('.env','utf8'); if (!c.includes('REDIS_URL')) fs.appendFileSync('.env', '\nREDIS_URL=\"redis://localhost:6389\"\n');"
```

- [ ] **Step 4: Install the dependencies**

```bash
npm install ioredis @nest-lab/throttler-storage-redis
```

- [ ] **Step 5: Create the global throttling module**

Create `src/server/modules/throttling/throttling.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

// Global so any controller can @UseGuards(ThrottlerGuard) directly without
// importing this module — the shared Redis-backed storage is what makes
// rate limits correct across multiple server instances, not just one.
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60000, limit: 5 }],
        storage: new ThrottlerStorageRedisService(process.env.REDIS_URL || 'redis://localhost:6389'),
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class ThrottlingModule {}
```

- [ ] **Step 6: Register it in `AppModule`**

In `src/server/app.module.ts`, find:

```ts
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
```

Replace with:

```ts
import { PrismaModule } from './prisma/prisma.module';
import { ThrottlingModule } from './modules/throttling/throttling.module';
import { AuthModule } from './modules/auth/auth.module';
```

Find:

```ts
    PrismaModule,
    AuthModule,
```

Replace with:

```ts
    PrismaModule,
    ThrottlingModule,
    AuthModule,
```

- [ ] **Step 7: Build**

```bash
npm run build:server
```

Expected: no TypeScript errors. (No live-verify for this task alone — Tasks 3 and 4 are what actually apply the guard and are where this gets exercised end to end.)

---

### Task 3: Migrate the public quote endpoint onto the shared Redis-backed throttler

**Files:**
- Modify: `src/server/modules/quotes/quotes.module.ts`
- Modify: `src/server/modules/quotes/quotes.controller.ts`

**Interfaces:**
- Consumes: the global `ThrottlerModule`/`ThrottlerGuard` from Task 2 — this task removes the LOCAL `ThrottlerModule.forRoot(...)` that the original hardening pass added directly to `QuotesModule`, since that local registration has its own separate in-memory storage instance. Leaving it in place alongside the new global one would mean quotes are throttled twice by two different counters — remove it, don't add to it.

- [ ] **Step 1: Remove the local throttler registration from `QuotesModule`**

Find:

```ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [
    TripsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
```

Replace with:

```ts
import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [TripsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
```

- [ ] **Step 2: Confirm `QuotesController` needs no change**

Read `src/server/modules/quotes/quotes.controller.ts` — it should already have `@UseGuards(ThrottlerGuard)` on the class from the original hardening pass, and `ThrottlerGuard` now resolves from the global module instead of the removed local one. No edit needed here; this step is a confirmation, not a code change. If for any reason `@UseGuards(ThrottlerGuard)` or its import is missing, that's a sign a different, unrelated regression occurred — stop and report BLOCKED rather than re-adding it blindly.

- [ ] **Step 3: Build**

```bash
npm run build:server
```

- [ ] **Step 4: Live-verify the shared limit still works**

Start the server, then fire 6 requests in a tight loop:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "request $i -> %{http_code}\n" -H "Content-Type: application/json" -d '{"client":"Throttle Migration Test","legs":[{"clientLegId":"1","seq":1,"depIcao":"KJFK","arrIcao":"EGLL","etdZ":"2026-09-01T10:00:00Z","etaZ":"2026-09-01T18:00:00Z"}]}' http://localhost:4001/api/quotes
done
```

Expected: requests 1-5 return `201`, request 6 returns `429` — same behavior as before, now backed by Redis instead of in-memory storage. Confirm the counter is actually in Redis, not memory:

```bash
docker exec jetflow_api_redis redis-cli KEYS '*'
```

Expected: at least one key present (the throttler's tracked-IP key). Clean up the test trips and stop the server:

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "DELETE FROM trips WHERE client = 'Throttle Migration Test';"
```

---

### Task 4: Rate-limit `/auth/login`

**Files:**
- Modify: `src/server/modules/auth/auth.controller.ts`

**Interfaces:**
- Consumes: the global `ThrottlerModule`/`ThrottlerGuard` from Task 2, the exact same way `QuotesController` does — no new module registration needed here.

**Why this matters:** the only endpoint that issues credentials currently has zero rate limiting — a brute-force/credential-stuffing surface, exploitable today regardless of any scaling plans. Two already-implemented protections mean this task does NOT need to add them: `auth.service.ts` already returns the identical `'Invalid credentials'` message for both a bad username and a bad password (no user enumeration), and `create-user.dto.ts` already enforces an 8-character password minimum. This task is narrowly about adding the rate limit itself.

- [ ] **Step 1: Apply the guard**

In `src/server/modules/auth/auth.controller.ts`, find:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }
}
```

Replace with:

```ts
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }
}
```

This reuses the exact same 5-requests/60-seconds/IP limit already configured in `ThrottlingModule` (Task 2) — no per-route override needed. `@Public()` still bypasses `JwtAuthGuard` (this route issues tokens, it can't require one) — `ThrottlerGuard` is a separate, independent guard and applies regardless of `@Public()`.

- [ ] **Step 2: Build**

```bash
npm run build:server
```

- [ ] **Step 3: Live-verify**

Start the server, then fire 6 login attempts in a tight loop (deliberately using a wrong password — this must not succeed regardless):

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "attempt $i -> %{http_code}\n" -H "Content-Type: application/json" -d '{"username":"admin","password":"wrong-password-on-purpose"}' http://localhost:4001/api/auth/login
done
```

Expected: attempts 1-5 return `401` (wrong password, correctly rejected), attempt 6 returns `429` (rate-limited). Stop the server afterward.

---

### Task 5: Add `helmet` and a loud `NODE_ENV` warning; clean up stale `.env.example` entries

**Files:**
- Modify: `src/server/main.ts`
- Modify: `.env.example`

**Interfaces:** None.

- [ ] **Step 1: Install helmet**

```bash
npm install helmet
```

- [ ] **Step 2: Add it to bootstrap, with CSP explicitly disabled for now**

In `src/server/main.ts`, find:

```ts
import 'reflect-metadata';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const uploadsDir = process.env.UPLOADS_DIR || './uploads';
  fs.mkdirSync(uploadsDir, { recursive: true });

  const app = await NestFactory.create(AppModule);

  const isProduction = process.env.NODE_ENV === 'production';
```

Replace with:

```ts
import 'reflect-metadata';
import * as fs from 'fs';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const uploadsDir = process.env.UPLOADS_DIR || './uploads';
  fs.mkdirSync(uploadsDir, { recursive: true });

  const app = await NestFactory.create(AppModule);

  // Content-Security-Policy is left disabled here deliberately: helmet's
  // default CSP would block the Google Fonts <link> tags and needs to be
  // tested against the real production bundle before enabling — a good
  // follow-up, not something to guess at in this task. Every other header
  // helmet sets (X-Content-Type-Options, X-Frame-Options, etc.) is safe to
  // enable unconditionally and has no known interaction with this app.
  app.use(helmet({ contentSecurityPolicy: false }));

  const isProduction = process.env.NODE_ENV === 'production';
```

- [ ] **Step 3: Add the loud startup warning**

Find:

```ts
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.useGlobalPipes(
```

Replace with:

```ts
  app.enableCors({ origin: corsOrigin, credentials: true });

  if (!isProduction) {
    // eslint-disable-next-line no-console
    console.warn(
      '[viq] NODE_ENV is not "production" — CORS will reflect any request Origin ' +
      '(the permissive dev default). If this is a real deployment, set ' +
      'NODE_ENV=production in your environment before starting the server.',
    );
  }

  app.useGlobalPipes(
```

- [ ] **Step 4: Clean up `.env.example`'s stale auth variables and undocumented `NODE_ENV` requirement**

Find:

```
DATABASE_URL="postgresql://jetflow:jetflow@localhost:5442/jetflow?schema=public"
PORT=4001
CORS_ORIGIN="http://localhost:5173,http://localhost:4173"
JWT_SECRET="replace-with-a-long-random-secret"
REDIS_URL="redis://localhost:6389"
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH="replace-with-a-bcrypt-hash-of-your-admin-password"
```

Replace with:

```
DATABASE_URL="postgresql://jetflow:jetflow@localhost:5442/jetflow?schema=public"
PORT=4001
# Set to "production" for any real deployment — an unset NODE_ENV makes
# CORS_ORIGIN's default permissive (reflects any request Origin), which is
# only safe for local development.
NODE_ENV=
CORS_ORIGIN="http://localhost:5173,http://localhost:4173"
JWT_SECRET="replace-with-a-long-random-secret"
REDIS_URL="redis://localhost:6389"
# ADMIN_USERNAME/ADMIN_PASSWORD_HASH are read only once, by prisma/seed.ts,
# to create the very first Admin user row. AuthService never reads these at
# runtime — changing them after the database has been seeded does nothing.
# Manage users afterward via /admin/users.
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH="replace-with-a-bcrypt-hash-of-your-admin-password"
```

- [ ] **Step 5: Build**

```bash
npm run build:server
```

- [ ] **Step 6: Live-verify the helmet headers and the warning**

Start the server with `NODE_ENV` unset (the normal local case) and confirm the warning appears in the console output, then confirm a helmet header is present:

```bash
curl -sI http://localhost:4001/ | grep -i "x-content-type-options\|x-frame-options"
```

Expected: both headers present (e.g. `X-Content-Type-Options: nosniff`). Stop the server afterward.

---

### Task 6: Add a health-check endpoint

**Files:**
- Create: `src/server/modules/health/health.controller.ts`
- Create: `src/server/modules/health/health.module.ts`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- Produces: `GET /api/health` — public, returns `200 { status: 'ok', timestamp: <ISO string> }` when the database is reachable, `503` otherwise. Scoped to database reachability only for this task — Redis-reachability is a reasonable future addition once there's a clean way to access the shared Redis client from outside `ThrottlingModule`, not something to build here.

- [ ] **Step 1: Create the controller**

Create `src/server/modules/health/health.controller.ts`:

```ts
import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 2: Create the module**

Create `src/server/modules/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 3: Register it**

In `src/server/app.module.ts`, find:

```ts
import { QuotesModule } from './modules/quotes/quotes.module';
import { UsersModule } from './modules/users/users.module';
```

Replace with:

```ts
import { QuotesModule } from './modules/quotes/quotes.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
```

Find:

```ts
    QuotesModule,
  ],
})
export class AppModule {}
```

Replace with:

```ts
    QuotesModule,
    HealthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Build**

```bash
npm run build:server
```

- [ ] **Step 5: Live-verify**

Start the server:

```bash
curl -s -o /dev/null -w "GET /api/health -> %{http_code}\n" http://localhost:4001/api/health
curl -s http://localhost:4001/api/health
```

Expected: `200`, and a JSON body like `{"status":"ok","timestamp":"2026-08-27T..."}`. Stop the server afterward.

---

### Task 7: Extend `@MaxLength` validation to authenticated write DTOs

**Files:**
- Modify: `src/server/modules/trips/dto/create-trip.dto.ts`
- Modify: `src/server/modules/trips/dto/update-trip.dto.ts` (if it does not simply `extends PartialType(CreateTripDto)` — check first; if it does, no separate edit is needed there, since it inherits the same decorators)
- Modify: every other `create-*.dto.ts` under `src/server/modules/*/dto/` **except** `create-quote.dto.ts` (already done in the original hardening pass) — the full list to check: `stops/dto/create-stop.dto.ts`, `comms/dto/create-comm.dto.ts`, `invoices/dto/create-invoice.dto.ts`, `legs/dto/create-leg.dto.ts`, `service-types/dto/create-service-type.dto.ts`, `services/dto/create-service.dto.ts`, `persons/dto/create-person.dto.ts`, `person-ratings/dto/create-rating.dto.ts`, `reference/dto/create-provider.dto.ts`, `reference/dto/create-airport.dto.ts`, `reference/dto/create-country.dto.ts`, `reference/dto/create-operator.dto.ts`, `reference/dto/create-aircraft.dto.ts`, `message-templates/dto/create-message-template.dto.ts`, `reference/dto/create-country-fee.dto.ts`, `users/dto/create-user.dto.ts`, `leg-purposes/dto/create-leg-purpose.dto.ts`, `reference/dto/create-country-rule.dto.ts`
- Corresponding `update-*.dto.ts` files only where they do NOT simply extend the create DTO via `PartialType`/`OmitType`/`PickType` from `@nestjs/mapped-types` (check each; most in this codebase do, per its established pattern — those inherit the decorators automatically and need no separate edit).

**Interfaces:** None — this task only adds validation decorators, never changes a field's type, optionality, or name.

**Why this matters:** the original hardening pass added `@MaxLength` to the *public*, unauthenticated `CreateQuoteDto` after a security audit flagged unbounded string sizes. Every other write DTO in the app — all of them requiring a valid Coordinator/Admin JWT — has the identical gap. Lower severity than the public endpoint (a valid token is required), but the same class of issue, worth closing everywhere rather than only where an audit happened to look.

**How to size the limit for each field** (apply this judgment consistently across every file in the list above — there is no single universal number, but there is a consistent rule):
- A short identifier/label/name-shaped field (client name, operation type, mission type, a person's name, an assigned-to string, a reference number, a role/status/type string that's plain text rather than a fixed enum) → `@MaxLength(200)`.
- A free-text notes/description/comment-shaped field (notes, comments, verification notes, message bodies) → `@MaxLength(2000)`.
- **Do not** add a length cap to: fields already constrained by `@IsIn(...)` (a fixed set of allowed values — a length cap is redundant there), ID/code fields that are looked up by exact match elsewhere (ISO2 country codes, ICAO codes, registration numbers — these are already short by nature and adding an arbitrary cap risks rejecting a legitimate value if you guess wrong), email fields (already validated by `@IsEmail()`), date/datetime string fields (`@IsDateString()` already constrains the format), and numeric/boolean fields (not applicable).
- **Do not** invent a tiny limit "to be safe" — per this task's own rationale, the goal is closing unbounded-payload risk, not creating a new operational friction point. When in doubt between two reasonable sizes, pick the larger one.
- If a DTO has **no** plain free-text `@IsString()` fields lacking `@IsIn`/`@IsEmail`/`@IsDateString` (e.g., a DTO that's entirely enums, IDs, and numbers), it needs no change — note this in your report rather than silently skipping it, so the reviewer can confirm it was actually checked.

- [ ] **Step 1: Work through every file in the list above**

For each `create-*.dto.ts` file: read it, identify every `@IsString()`-decorated field that doesn't already have a length constraint and isn't excluded by the rules above, and add the appropriate `@MaxLength(200)` or `@MaxLength(2000)` decorator directly above (or alongside) its existing `@IsString()`/`@IsOptional()` decorators — matching the exact decorator-ordering style already used in `create-quote.dto.ts` (`@IsOptional()` then `@IsString()` then `@MaxLength(N)`, each on its own line). Import `MaxLength` from `class-validator` in each file that needs it (add to the existing `import { ... } from 'class-validator';` line — do not create a duplicate import statement).

- [ ] **Step 2: Check each corresponding `update-*.dto.ts`**

For each resource, check whether its update DTO is declared as `export class UpdateXDto extends PartialType(CreateXDto) {}` (or `OmitType`/`PickType` wrapping the create DTO) — grep each `update-*.dto.ts` file for `extends PartialType\|extends OmitType\|extends PickType` if unsure. If so, it automatically inherits the new `@MaxLength` decorators — no edit needed. If an update DTO instead re-declares its own fields independently (not extending the create DTO), apply the same field-by-field treatment as Step 1 to that file too.

- [ ] **Step 3: Build**

```bash
npm run build:server
```

Expected: no TypeScript errors.

- [ ] **Step 4: Live-verify on one representative endpoint**

Start the server, mint an Admin JWT, then confirm a normal-length request still succeeds and an absurdly long one is rejected on whichever DTO you're most confident got a `@MaxLength(200)` field (e.g. `CreateTripDto.client`):

```bash
node -e "console.log(JSON.stringify({client: 'x'.repeat(500), registration: 'TESTREG'}))" > ./tmp-trip-payload.json
curl -s -o /dev/null -w "oversized client -> %{http_code}\n" -H "Authorization: Bearer <Admin JWT>" -H "Content-Type: application/json" -d @./tmp-trip-payload.json http://localhost:4001/api/trips
rm ./tmp-trip-payload.json
```

Expected: `400` (rejected by the new `@MaxLength(200)` on `client`, assuming that's the field/limit you applied — adjust the test field/length to match whatever you actually capped if `client` ended up differently sized). Stop the server afterward.

---

## Final note for whoever runs the whole-branch review

After all 7 tasks land, do a full `npm run build` from a clean state, confirm `docker ps` shows both `jetflow_api_postgres` and `jetflow_api_redis` healthy, and re-run Task 1's 20-concurrent-request test one more time as an end-to-end sanity check now that the rate limiter is also active (expect requests beyond the 5/min Redis-backed limit to correctly return `429` instead of racing into `nextTripId()` at all — a stronger guarantee than Task 1's own isolated test could show, since by this point in the plan both fixes are live together).
