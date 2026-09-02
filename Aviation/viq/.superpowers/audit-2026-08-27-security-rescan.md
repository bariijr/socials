# VIQ Security Re-Audit — 2026-08-27

**Context for the reader:** VIQ is a NestJS + Prisma/PostgreSQL + React trip-management app for aviation trip-support coordinators. An earlier audit (2026-08-26) found 1 High, 5 Medium, 3 Low, 2 Info findings. A follow-up hardening pass ("Phase 1-3", `docs/superpowers/plans/2026-08-27-viq-upgrade-phase1-3.md`) claimed to fix the High finding and several Mediums. This report (a) independently verifies those fixes actually landed in the live code, (b) re-scans for anything missed, and (c) evaluates security implications of the app's stated future goal: serving "1,000s of concurrent users across many internal divisions of one organization" (explicitly NOT multi-tenancy — one shared instance, more internal users). Read-only static review; no live traffic sent except a handful of read-only local curl checks, each immediately reverted/stopped.

---

## Part 1: Verification of the 11-task Phase 1-3 hardening plan

All 7 checked items are read directly from the current source, not inferred from the plan's own claims.

| # | Claimed fix | File(s) | Verified? | Evidence |
|---|---|---|---|---|
| 1 | `InvoicesController` gated to Admin | `invoices.controller.ts:7-8` | ✅ PASS | `@Controller('invoices')` immediately followed by `@Roles('Admin')` at class level |
| 2 | `/admin/billing` route gated client-side | `App.tsx:44` | ✅ PASS | `<Route path="/admin/billing" element={<RequireRole role="Admin"><BillingPage /></RequireRole>} />` |
| 3 | Quote DTO size caps | `create-quote.dto.ts` | ✅ PASS | `@ArrayMaxSize(20)` on `legs`/`services`/`persons`; `@MaxLength(200)` on `client`; `@MaxLength(2000)` on both `notes` fields |
| 4 | Safe `Content-Disposition` | `docs.controller.ts:4,30` | ✅ PASS | Uses `create as contentDisposition` from the `content-disposition` package, not a hand-built template string |
| 5 | CORS denies by default in production | `main.ts:13-26` | ✅ PASS | `corsOrigin = !isProduction` when `CORS_ORIGIN` is unset — resolves to `false` when `NODE_ENV==='production'` |
| 6 | `/api/quotes` rate-limited | `quotes.module.ts`, `quotes.controller.ts` | ✅ PASS | `ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])` imported into `QuotesModule` only; `@UseGuards(ThrottlerGuard)` on `QuotesController` |
| 7 | Upload magic-byte verification | `docs.service.ts:4,27-29,62-69` | ✅ PASS | `file-type`'s `fromBuffer` checked against `SIGNATURE_VERIFIABLE_MIME_TYPES` for PDF/JPEG/PNG/GIF/TIFF/BMP before the file is persisted |

**7/7 PASS.** The Phase 1-3 plan's own claims are accurate — nothing was marked done that isn't actually in the code.

---

## Part 2: Fresh findings (not covered by the 2026-08-26 audit or Phase 1-3)

### F1 — `POST /auth/login` has no rate limiting (Medium-High)
- **File**: `src/server/modules/auth/auth.controller.ts:10-15` — `@Public() @Post('login')`, no `@UseGuards(ThrottlerGuard)`, no throttler module imported anywhere near `AuthModule`.
- **What**: The only endpoint that issues credentials is completely unthrottled. An attacker can attempt unlimited username/password combinations against it at whatever rate the server can handle.
- **Why it matters**: This is a classic credential-stuffing/brute-force surface, independent of the "1000s of users" scale question — it's exploitable today, at any scale, and gets *more* attractive to an attacker as the user base grows (more accounts = higher odds of a weak/reused password landing). The original 2026-08-26 audit's M1 only covered `/api/quotes`; this endpoint was not in its scope and Phase 1-3 (which added the throttler dependency for exactly this purpose) did not extend it here.
- **Confidence**: High — directly confirmed by reading the controller and confirming no guard/decorator anywhere in the auth module.
- **Fix**: Apply the same `@nestjs/throttler` pattern already proven in `QuotesModule` — e.g., 5-10 attempts/minute/IP on `POST /auth/login`, possibly combined with a per-username lockout counter for defense in depth (IP-based limits alone are weak against distributed attempts, which matters more once this is internet-reachable for "1000s of users" rather than a single office LAN).

### F2 — `GET /audit` has no upper bound on `limit` and no pagination
- **File**: `src/server/modules/audit/audit.controller.ts:8-11`, `audit.service.ts:39-44` — `recent(limit = 100)` passes whatever numeric value the client supplies straight to Prisma's `take`, with no maximum.
- **What**: A client can request `GET /audit?limit=5000000` and the service will attempt to return the entire audit-entry table in one response, with no cursor/offset pagination as an alternative for legitimately browsing older history.
- **Why it matters**: Low risk today (every route in this app requires authentication, and `/audit` is at minimum gated to authenticated users — see F2a below), but it's a genuine unbounded-query pattern that becomes a real resource/latency problem as the audit table grows under sustained multi-division usage (every mutation across every division writes to this one table forever, per `AuditService.log`/`logDiff` — no archival, no TTL, confirmed no such logic exists in `audit.service.ts`).
- **Confidence**: High.
- **Fix**: Clamp `limit` server-side (e.g., `Math.min(limit ?? 100, 500)`), and add real pagination (cursor or offset+limit) so "browse older history" doesn't require raising the cap.

### F2a — (re-confirmation, not new) `GET /audit` is still readable by Viewer role
- Same as the original audit's L2 — confirmed still open (`audit.controller.ts` has no `@Roles` decorator). Not fixed in Phase 1-3, correctly out of that plan's scope. Restating here only because F2's fix (pagination) touches the same file and a future editor should address both together if picked up.

### F3 — CORS's production-safe default depends on an env var that's undocumented and not validated at boot
- **Files**: `main.ts:13`, `.env.example` (no `NODE_ENV` line at all).
- **What**: Task 6's fix (Part 1, item 5) is correct code, but its safety is conditional on `NODE_ENV=production` actually being set at deploy time. `.env.example` — the one file an operator is most likely to copy from — has no `NODE_ENV` entry, and nothing in `main.ts` warns or fails if `NODE_ENV` is unset in what is otherwise clearly a production deployment (e.g., listening on a non-localhost interface).
- **Why it matters**: A real deployment that simply copies `.env.example` and fills in secrets, without separately knowing to add `NODE_ENV=production`, silently gets the *permissive* (pre-fix) CORS behavior — the fix protects nothing unless this undocumented precondition is met. This is exactly the kind of gap that matters more, not less, once "1000s of users across divisions" implies a real deployment pipeline rather than one person's local machine.
- **Confidence**: High.
- **Fix**: Add `NODE_ENV=production` to a `.env.production.example` (or a comment in `.env.example` explaining it's required for the CORS default to be safe), and/or have `main.ts` log a loud startup warning when `CORS_ORIGIN` is unset and `NODE_ENV !== 'production'` isn't explicitly confirmed either way.

### F4 — No `helmet` (or equivalent) — standard security response headers are absent
- **File**: `package.json` — no `helmet` dependency; `main.ts` sets no security headers anywhere.
- **What**: The original 2026-08-26 audit's M3 fix recommendation explicitly suggested "add `X-Content-Type-Options: nosniff` globally in `main.ts`" as a belt-and-suspenders measure alongside the magic-byte check. Phase 1-3's Task 8 implemented the magic-byte check (Part 1, item 7) but not this global header.
- **Why it matters**: Low-to-Medium — the magic-byte check already closes the main MIME-confusion vector, so this is defense-in-depth, not a live hole. `X-Frame-Options`/`Content-Security-Policy` absence is more relevant at higher exposure (more users, more browsers, more chance one is misconfigured or old).
- **Confidence**: High.
- **Fix**: `npm install helmet` and `app.use(helmet())` near the top of `main.ts`'s `bootstrap()`. Trivial to add, standard practice, no known downside for an API-only backend (the static client bundle is served by the same Nest process via `ServeStaticModule` per the README, so verify `helmet`'s CSP defaults don't break the SPA's own inline styles/scripts before enabling CSP specifically — the other headers are safe to enable unconditionally).

### F5 — Stale `.env.example` entries reference a removed auth mechanism
- **File**: `.env.example` — still lists `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`.
- **What**: Per this project's own README ("What's not done yet" section, already existing before this re-audit): "The former `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` env vars are now seed-time-only... `AuthService` no longer reads them at runtime." `.env.example` was never updated to reflect this.
- **Why it matters**: Low — purely a documentation/operator-confusion issue, not a vulnerability. A new operator following `.env.example` might believe changing these env vars changes the live admin password; it doesn't (only `prisma/seed.ts` reads them, and only at first-seed time).
- **Confidence**: High.
- **Fix**: Move these two vars to a comment noting they're seed-time-only, or relocate them to `prisma/.env.seed.example` if such a distinction is wanted.

No other new gaps found. RBAC coverage across every controller under `src/server/modules/` was re-enumerated (14 controllers checked) and matches the original audit's M5 finding exactly — Trips/Persons/Legs/Services/Stops/Comms/PersonRatings remain intentionally ungated for any Coordinator (a stated, unchanged design decision, not a new gap). SQL injection, secrets hygiene, and XSS surface were spot-re-checked and remain as previously documented — no regressions introduced by Phase 1-3.

---

## Part 3: Scale-specific findings (relevant only if/when this becomes multi-instance)

**Important framing**: everything below assumes the stated goal — "1,000s of concurrent users across many internal divisions, one organization, one shared instance" — eventually requires running VIQ's NestJS API as *more than one process* (horizontal scaling, e.g. behind a load balancer, in Kubernetes, or similar), since a single Node.js process realistically tops out somewhere in the hundreds of concurrent connections for an app doing synchronous-feeling work like Prisma queries and Tesseract OCR. **None of these are bugs in the current single-instance deployment.** They are things that will silently break or degrade the moment a second instance is added, if not addressed first.

### S1 — Rate limiting breaks silently under horizontal scaling (High confidence, High future impact)
- **File**: `quotes.module.ts:10` — `ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])` with no `storage` option configured.
- **What**: `@nestjs/throttler`'s default storage (`ThrottlerStorageService`) is an in-memory `Map`, scoped to the single Node.js process it runs in. This is standard, well-documented behavior for the package — there is no custom storage adapter anywhere in this codebase (confirmed via `grep` across `src/server` for `ThrottlerStorage`/`storage:` — no matches beyond the default).
- **Why it matters**: The moment VIQ runs as N horizontally-scaled instances behind a load balancer, each instance independently tracks its own 5-requests-per-60-seconds counter for the same client IP. A round-robin load balancer means the *effective* limit on `/api/quotes` (and, if F1's fix is applied the same way, on `/auth/login`) becomes N × 5/min rather than 5/min — silently defeating the abuse protection this project just added, with zero error or warning anywhere. This is the single most concrete, mechanical "this specific fix stops working at scale" finding in this report.
- **Fix**: Before horizontally scaling, swap to a shared-storage throttler backend — `@nestjs/throttler` supports pluggable storage; a Redis-backed storage adapter (e.g. `@nest-lab/throttler-storage-redis` or a hand-rolled one using `ioredis`) is the standard fix. This requires introducing Redis (or reusing one if it's added for other reasons — see S3) as new infrastructure, which should be planned for, not bolted on reactively.

### S2 — Prisma connection pool sizing is unconfigured and will be per-instance
- **File**: `src/server/prisma/prisma.service.ts` — `PrismaClient` is instantiated with zero options; `DATABASE_URL` in `.env.example` has no `connection_limit`/`pool_timeout` query parameters.
- **What**: Prisma's default connection pool size (when unconfigured) is `num_physical_cpus * 2 + 1` per `PrismaClient` instance. `PrismaService` is a single NestJS-DI-managed singleton, so today there's exactly one pool for the one running process. If VIQ scales to N instances (per S1's premise), that becomes N independent pools all competing for PostgreSQL's `max_connections` (Postgres defaults to 100), with no coordination between instances.
- **Why it matters**: At even a modest instance count (say, 8 instances on 4-vCPU boxes = 8 × 9 = 72 potential connections) you're already most of the way to exhausting a default Postgres install's connection budget, before counting any other service that talks to the same database (e.g., a future analytics job, `prisma studio`, migrations). Connection exhaustion manifests as intermittent, hard-to-diagnose request failures under load — exactly the failure mode a "1000s of concurrent users" deployment cannot tolerate.
- **Fix**: Explicitly tune `connection_limit` in `DATABASE_URL` per instance based on expected instance count and Postgres's `max_connections`, and/or introduce a connection pooler (PgBouncer, or a managed equivalent) between the app tier and Postgres — the standard pattern for horizontally-scaled Prisma deployments. This should be decided and load-tested before scaling out, not discovered via an outage.

### S3 — No caching/session layer exists yet — every "shared state" need currently lives in one process's memory
- **What**: Beyond the Throttler (S1), nothing in this codebase uses Redis, Memcached, or any shared cache. This isn't a defect in the current single-instance app — it's simply the natural consequence of not needing one yet. It's listed here because S1 and any future feature needing cross-instance coordination (a shared cache for the client's `preloadReferenceData()` pattern if that ever moves server-side, a distributed lock for something like S4, a shared session/JWT-denylist store if token revocation is ever added per the original audit's I1) will all want the *same* piece of new infrastructure. Planning for one shared Redis (or equivalent) instance once, rather than solving each of these one at a time with a different ad-hoc mechanism, is worth deciding early.
- **Confidence**: High (absence-of-evidence via exhaustive `grep` for `redis`/`memcache`/`ioredis` across `package.json` and `src/`) — genuinely zero hits.

### S4 — `TripsService.nextTripId()`'s race condition (already flagged in the Phase 1-3 ledger, restated here for scale framing)
- **File**: `src/server/modules/trips/trips.service.ts:15-20`.
- **What**: This was discovered during Phase 1-3's own Task 7 testing (see `.sdd/2026-08-27-viq-upgrade-phase1-3/progress.md`'s Task 7 entry) — `count()` then `format(count+1)` to generate the next trip ID, no transaction lock, no unique-constraint retry. Confirmed still unfixed as of this re-scan (the file is unchanged from what Task 7's investigation found).
- **Why it matters at scale specifically**: This bug is already real today at single-instance, low-concurrency scale (two coordinators submitting trips seconds apart can already collide) — but it gets **combinatorially worse**, not just "more of the same," under S1/S2's premise: more concurrent users directly increases how often two `nextTripId()` calls land inside the same race window, and a naive fix that adds a retry loop *inside a single process* doesn't fully solve it either once there are multiple processes, since the race is over a shared database sequence-like value, not process-local state. The correct fix (a real Postgres sequence, or a `SELECT ... FOR UPDATE`-guarded increment, or an application-level retry-on-P2002-conflict loop around the whole create) needs to be safe under both concurrent requests *and* concurrent processes — worth solving once, correctly, rather than patching for single-instance concurrency now and re-discovering the multi-instance case later.
- **Fix**: See the Phase 1-3 ledger's own recommendation — generate the ID inside the same transaction with retry-on-conflict, or switch to a DB-native sequence/atomic counter. Explicitly verify whatever fix is chosen is correct under concurrent *processes*, not just concurrent requests to one process, given the stated scaling goal.

### S5 — Frontend cache staleness gets worse with more concurrent sessions (data-consistency, not server security)
- **Files**: `src/client/lib/dataStore.ts` (module-level `_aircraftCache`/`_countryCache`/etc., populated once by `preloadReferenceData()` at app boot, per `Layout.tsx`).
- **What**: This is a **client-side**, per-browser-tab cache — not a server-side multi-instance problem (correcting an initial framing assumption before this investigation started: there is no server-side in-memory reference-data cache to worry about, only this frontend one). It's already a documented, accepted limitation in the README ("a second browser tab won't see edits made in another tab until it reloads — a deliberate trade-off... given this is a single-admin local tool today").
- **Why it matters at the stated scale**: The tradeoff's own stated justification ("single-admin local tool") stops holding once there are genuinely many concurrent Coordinator sessions across divisions editing shared reference data (aircraft, providers, country rules, etc.) — the *number* of sessions holding a stale snapshot at any moment scales with user count, and the *frequency* of a "someone else changed this while I was looking at it" collision scales similarly. This is a real UX/data-integrity concern worth the other review passes' attention (flagged here since it technically qualifies as "in-memory state assumption that gets worse at scale," but the fix belongs in the UX/data-management track, not a security fix).
- **Confidence**: High that the mechanism is exactly as described (confirmed by reading `dataStore.ts`); the severity judgment ("worth fixing before wide rollout") is a product call, not a security finding per se.

---

## Summary for peer review

Nothing here rises to Critical. The one item worth the most weight if this goes to another reviewer for debate is **S1** (rate limiting's in-memory storage silently stops working under horizontal scaling) — it's the most concrete, deterministic "this specific control that was just added will not do what it's supposed to do" finding, and it's easy to verify independently (read `@nestjs/throttler`'s own documentation on storage adapters). **F1** (unthrottled login) is the highest-priority fix regardless of scale plans, since it's exploitable today. **S4** (trip-ID race) is a correctness bug more than a security one, but was already flagged as a required follow-up before this re-scan and is restated here because "more users" directly worsens its likelihood.
