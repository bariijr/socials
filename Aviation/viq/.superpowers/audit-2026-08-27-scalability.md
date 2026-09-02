# VIQ Scalability Review — 2026-08-27

**Stack for context:** NestJS 10 + Prisma 5 + PostgreSQL 16 (server), React 19 + Vite (client), one unified source tree, single Postgres instance, JWT bearer-token auth (12h expiry, stateless, no refresh). Today: single-admin local/preview usage. Target assessed here: the same single-tenant data model, scaled to serve thousands of concurrent users across many internal divisions of one organization — NOT multi-tenancy (confirmed scope with the requester).

Read-only review, no code changed, no load test run (none of this codebase's tooling supports one — findings below are static-analysis-derived, flagged with confidence levels accordingly).

---

## 1. Statelessness / horizontal-scaling readiness

**Finding: the newly-added rate limiter on `/api/quotes` will not work correctly across multiple instances.**

`src/server/modules/quotes/quotes.module.ts:10` — `ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])` — no `storage` option is passed. `@nestjs/throttler`'s default `ThrottlerStorageService` is an in-memory `Map`, scoped to the Node process that created it.

**Why it matters at scale:** the moment VIQ runs as more than one instance behind a load balancer (which "1000s of concurrent users" requires), each instance keeps its own independent counter for the same rate-limit key. With N instances round-robining traffic, a client that would be limited to 5 requests/minute against one instance can actually get up to 5×N requests/minute against the fleet, since no instance sees the others' counts. The limiter doesn't break outright — it just silently becomes N times weaker than configured, with no error or warning anywhere.

**Confidence:** High — confirmed directly by reading the throttler config; no custom storage adapter is registered anywhere in the codebase (grepped all modules).

**Fix:** swap in `@nestjs/throttler`'s Redis-backed storage adapter (`@nestjs/throttler-storage-redis` or equivalent), pointed at a shared Redis instance. This is the same piece of infrastructure recommended in Finding 5 below for other reasons, so it's a single new dependency serving two purposes, not two. Effort: small (a few hours) once Redis exists in the deployment; the throttler API change is a one-line `storage:` option.

**Everything else in this codebase is correctly stateless for horizontal scaling:**
- `OcrService` (`src/server/modules/docs/ocr.service.ts:34`) holds a single long-lived Tesseract worker as instance state (`private worker: Worker | null`), created once per process in `onModuleInit`. This is **not** a correctness problem at multi-instance scale — it's per-instance compute capacity, not shared state two instances need to agree on. Each instance OCRs its own requests independently; there's nothing to get out of sync. It IS a per-instance *throughput* concern — see Finding 8 below.
- `MailService` (`src/server/modules/mail/mail.service.ts:11`) holds a single `nodemailer` transporter as instance state — also fine, it's a stateless connection-pool object, not request-correlated data.
- No other `@Injectable()` service anywhere in `src/server/modules/` was found holding request-correlated mutable state in an instance field (checked every module).
- JWT auth is fully stateless by design (no server-side session store) — this is actually the *right* shape for horizontal scaling; the tradeoffs it brings are covered in Finding 6, not here.

*(Note: `preloadReferenceData()`'s in-memory cache is a client-side/browser concern, not a server-scaling one — out of scope for this review, covered by the parallel UX/data-management review instead.)*

---

## 2. Database connection pooling

**Finding: no explicit connection pool size is configured, and Prisma's default scales with each instance's own CPU count, not with awareness of other instances.**

`.env`'s `DATABASE_URL` (`postgresql://jetflow:jetflow@localhost:5442/jetflow?schema=public`) has no `connection_limit` query parameter. `PrismaService` (`src/server/prisma/prisma.service.ts`) does a bare `extends PrismaClient` with no explicit `datasources` override. Prisma's documented default when `connection_limit` is unset is `num_physical_cpus() * 2 + 1` **per PrismaClient instance** — and each running Nest process creates exactly one `PrismaService`/`PrismaClient` singleton (confirmed: `PrismaModule` is imported once in `AppModule`, standard Nest DI gives one instance per process).

**Why it matters at scale:** on a 4-core container, that's a default pool of 9 connections per instance. Postgres 16's own default `max_connections` is 100. Run 12 instances of VIQ (a plausible fleet size for "1000s of concurrent users") and the fleet alone wants up to 12 × 9 = 108 connections — already over Postgres's stock ceiling before counting `psql`/admin tooling/migrations/the `AuditService` write on every mutation. The failure mode isn't a graceful slowdown — Postgres starts rejecting new connections outright once `max_connections` is hit, which looks like random 500s under load, not a capacity warning.

**Confidence:** High on the current configuration (verified: no `connection_limit` anywhere in `.env`, `.env.example`, or `main.ts`); the specific instance-count example is illustrative, not a measured number — the actual failure threshold depends on final deployment topology.

**Fix:** two independent, complementary moves, both small effort:
1. Set `connection_limit` explicitly in `DATABASE_URL` (e.g., `?connection_limit=10`) sized so `instances × connection_limit < Postgres max_connections`, with headroom for direct/admin connections.
2. Raise Postgres's own `max_connections` (a config change, not a schema change) and/or put PgBouncer (transaction-pooling mode) in front of Postgres — the standard pattern for "many app instances, one Postgres" — so app-side pool sizing stops being a single point of fleet-wide fragility.

---

## 3. N+1 query risk under load

**Checked:** `TripsService.sheet()` (`src/server/modules/trips/trips.service.ts:34-52`) — the single most data-heavy read in the app (a trip's full legs/persons/stops/services/docs/comms). It uses one Prisma query with nested `include` (legs → assignments → person, plus stops/services/docs/comms as sibling includes) — **this is correctly a single round-trip, not N+1.** Good pattern, and it's the one other services should be compared against.

**Checked:** `PersonsService.findAll()` and `PersonsService.findAssignments()` (`src/server/modules/persons/persons.service.ts`) — both use `include` (`{ include: { person: true } }`, `{ include: { leg: { select: {...} } } }`) for their joins. Also single-query, not N+1.

**Checked:** `AuditService.logDiff()` (`src/server/modules/audit/audit.service.ts:15-30`) — this is a **real N+1, but on writes, not reads.** Every mutation that changes M fields issues M separate `INSERT`s into `audit_log` (one `this.log()` call per changed field, in a loop, each awaited sequentially — line 27). For a trip update touching, say, 6 fields, that's 6 sequential round-trips to Postgres just for audit logging, on top of the actual `UPDATE`. Every write path in the entire app that calls `logDiff` (trips, legs, services, persons, docs, invoices — essentially every mutating endpoint) pays this cost per write.

**Why it matters at scale:** this isn't a correctness bug (audit entries are correct), but at high concurrent write volume it multiplies database round-trips for the most common operation type (an edit) by however many fields changed, sequentially rather than batched. At low usage this is invisible; at "1000s of concurrent users" doing normal edit-heavy work, this compounds directly into write latency and connection-hold time (which feeds back into Finding 2's pool-exhaustion risk, since each held connection is unavailable to other requests for longer).

**Confidence:** High — read the exact loop; `await this.log(...)` inside a `for...of` is unambiguous.

**Fix:** batch the audit rows into one `createMany` call instead of N sequential `create` calls. Small, self-contained change — `AuditService.logDiff()` is the only place this pattern lives, and every caller already goes through it, so fixing it once fixes it everywhere. No schema change needed.

---

## 4. Frontend bundle size and load performance

**Finding: confirmed no code-splitting configured; the whole app ships as one 1.3MB JS chunk to every visitor.**

`vite.config.ts` has no `build.rollupOptions.output.manualChunks` and no other chunking config — matches the build's own warning (`dist/public/assets/index-*.js`, 1,386.49 kB / 379 kB gzipped). `App.tsx`'s route table imports every page component eagerly at the top of the file (`import AdminSettings from './pages/admin/AdminSettings'`, etc.) — none use `React.lazy()`/dynamic `import()` (grepped `App.tsx`, zero matches for either).

**Why it matters at scale:** this is a per-user download-and-parse cost, not a server-concurrency cost — but at 1000s of concurrent users, that's 1000s of ~380KB-gzip downloads hitting whatever's serving static assets (today, Nest's own `ServeStaticModule` — see also Finding 5's CDN note), and 1000s of browsers parsing/executing a bundle most of which (every admin-only page: Settings, Users, Message Templates, Billing, Assets, Reference Data) a typical Coordinator user never visits in a session.

**Confidence:** High — directly observed in the build output and confirmed via `vite.config.ts`/`App.tsx` inspection.

**Fix, concrete and low-effort:** `react-router`'s route table in `App.tsx` is already the natural split boundary. Convert each `admin/*` page import to `React.lazy(() => import('./pages/admin/XxxPage'))` and wrap the `<Routes>` tree (or just the admin subtree) in a `<Suspense>` boundary. This alone splits off Settings/Users/MessageTemplates/Billing/Assets/NewTripWizard/PersonDetail into separate chunks only downloaded when an admin actually navigates there — a Coordinator's initial load shrinks by roughly however much of the bundle those pages account for (not measured here, but they're a large fraction of the admin-heavy page count). No other build config change is needed for this first pass; static asset serving efficiency (gzip/brotli, cache headers, CDN) is a separate, also-worthwhile follow-up but not blocking.

---

## 5. Health checks and observability

**Finding: no health-check endpoint exists anywhere in the app.**

Grepped every controller in `src/server/modules/` for anything resembling `health`/`Health` — zero matches. A load balancer or orchestrator (Kubernetes readiness/liveness probes, an ALB target-group health check, etc.) has nothing to poll that would distinguish "this instance is up and can serve traffic" from "this instance is up but its DB connection just died."

**Finding: no structured logging.** `main.ts` and every service that logs (e.g., `OcrService`'s `new Logger(OcrService.name)`) use Nest's default `Logger`, which writes human-formatted text lines to stdout. No JSON structured-logging library (Pino, Winston, etc.) appears in `package.json`. At single-admin scale this is fine — someone reads the console. At "1000s of concurrent users," an operator diagnosing an incident has no way to filter/aggregate/correlate log lines across N instances beyond grep-ing raw text, and no request-ID correlation to trace one user's request across the stack.

**Why it matters at scale:** both gaps are invisible until the first real production incident, at which point they're the difference between a 5-minute diagnosis and a multi-hour one. Neither is a correctness bug today — this is entirely about operability once there's a fleet instead of one process on a laptop.

**Confidence:** High (both are absence-of-evidence findings, straightforward to confirm by grep).

**Fix, minimal first step (don't over-build this):**
1. Add one `GET /api/health` route (a new one-line controller) that does a trivial `SELECT 1`-equivalent Prisma call and returns 200/503 — this alone unblocks load-balancer health checks, the highest-leverage single addition here. Effort: tiny.
2. Defer full structured logging / distributed tracing until there's an actual multi-instance deployment to instrument — building it now, before Redis/PgBouncer/multi-instance infra exists, is premature. When that time comes, Nest's `LoggerService` interface is designed to be swapped for Pino without touching call sites, so this isn't a change that needs to happen early to avoid rework later.

---

## 6. Session/auth design at scale

**Current state (from README, confirmed unchanged in this review):** 12h stateless JWTs, no refresh flow, no server-side revocation — a deactivated user's `active` flag is only checked at login, so an already-issued token remains valid until it naturally expires.

**Assessment: this genuinely does get concretely worse at higher user counts and more divisions — not a hypothetical.** With one admin and a handful of coordinators, "wait up to 12h for a bad token to expire" is a tolerable, rare edge case the team can watch for manually. Across many divisions with hundreds-to-thousands of accounts, the base rate of "an account needs to be forcibly cut off *now*" (someone leaves the org, a device is lost, credentials leak) rises with headcount, and there is currently no way to do that — Admin can deactivate the account in `/admin/users`, but anyone already holding a valid token keeps working for up to 12h regardless.

**Confidence:** High that the gap is real and unchanged; the specific "how much worse" is a judgment call, not a measurement — flagged as reasoning, not data.

**Fix:** this doesn't require abandoning stateless JWTs (which are still the right shape for horizontal scaling — don't reintroduce server-side sessions to solve this). The standard middle ground is a short-lived access token (e.g., 15 min) plus a refresh token that's checked against a revocation list (a small Redis set of revoked token IDs, or a `revokedAt` check against the `User` row on refresh) — this bounds the "already-issued token still works" window to the access-token lifetime instead of 12h, while keeping most request-path auth checks stateless. This is a real, non-trivial change (new refresh endpoint, client-side token-refresh logic, a revocation store) — sized as a follow-up project of its own, not a quick fix, and worth sequencing after the infra work above since it also benefits from the same Redis instance.

---

## 7. Audit log and other unbounded-growth tables

**Finding: `audit_log` has no archival, retention, or enforced pagination — it grows forever and `GET /audit` can return unbounded result sets on request.**

`AuditService.recent()` (`src/server/modules/audit/audit.service.ts:39-44`) defaults to `limit = 100` when the caller doesn't specify one, which is a reasonable default — but nothing caps the *maximum* a caller can request. The frontend already calls this with `?limit=1000` (per this codebase's own prior documentation of `AuditPage.tsx`'s fetch pattern). There's no `@Max()` validation on the `limit` query param in `AuditController` (`src/server/modules/audit/audit.controller.ts:9` — `limit ? Number(limit) : undefined`, no upper bound, no `class-validator` DTO on this query param at all since it's a plain `@Query()` string). Nothing in the schema or a scheduled job archives, partitions, or trims old rows — every mutation across the whole app (every trip, leg, service, person, doc edit) writes at least one row (per-field, per Finding 3) forever.

**Why it matters at scale:** at "1000s of concurrent users" doing normal day-to-day editing across many divisions, `audit_log` becomes the fastest-growing table in the schema by a wide margin (Finding 3's per-field-write amplification compounds this further). Two separate risks: (a) an uncapped `?limit=` query lets any authenticated user (the route has no `@Roles` restriction — confirmed earlier in the parallel security review, not re-litigated here) request an arbitrarily large result set in one call, a real resource-exhaustion vector at high concurrency even without malice; (b) with no retention policy, query performance against `audit_log` degrades over the lifetime of the deployment (index growth, table bloat) even for well-formed, correctly-limited queries.

**Confidence:** High on the missing cap and missing retention policy (both directly confirmed in the code); the *rate* of growth is an estimate, not a measurement (no volume metrics exist to measure it from — see Finding 5).

**Fix:**
1. Add a `@Max(500)`-equivalent bound on the `limit` query param (cheap, immediate).
2. Batch audit writes per Finding 3's fix, which independently slows the row-growth rate for the same operation set.
3. A retention/archival policy (e.g., a scheduled job that moves `audit_log` rows older than N months to cold storage, or a Postgres partitioning scheme by month) is a real, deliberate decision about how long audit history needs to stay hot-queryable — that's a product/compliance question for the user to answer, not something to default silently. Flagged here as a needed decision, not prescribed.

---

## 8. Additional finding surfaced during this review (not in the original checklist)

**`OcrService`'s single Tesseract worker per instance is a per-instance throughput bottleneck, separate from the correctness question in Finding 1.** `tesseract.js`'s `createWorker()` returns a worker that processes one recognition job at a time; concurrent OCR requests to the same instance queue behind each other rather than running in parallel. At low usage this is invisible (OCR is an occasional, user-initiated action, not every request). At "1000s of concurrent users across many divisions" all doing document-heavy trip-support work, if OCR usage scales proportionally, a single serialized worker per instance becomes a real queueing delay under sustained load. Confidence: Medium — this is `tesseract.js`'s well-documented single-worker behavior, not independently load-tested here. Fix, if this becomes a real bottleneck in practice (don't build ahead of evidence): a small worker pool (`tesseract.js` supports a `Scheduler` for exactly this) sized to the instance's CPU count, or move OCR to a background job queue so it doesn't compete with request-serving latency at all — the latter is the more scalable long-term shape but is real, non-trivial work; the worker-pool bump is a much smaller first step.

---

## Also relevant, already known (not re-litigated here — see prior audit/README)

- `TripsService.nextTripId()`'s count-then-format race condition (flagged in the earlier security-hardening pass, deliberately deferred there) directly gets *worse*, not just "still present," under higher concurrency — the collision window this bug depends on becomes far more likely to be hit at "1000s of concurrent users" than at today's single-admin usage. This review doesn't re-derive the bug (already fully diagnosed elsewhere in this project's records) but flags that it should be treated as a scale-blocking item, not a nice-to-have, given this specific goal.
- The client-side `preloadReferenceData()` in-memory-cache-per-tab pattern (documented in README as "a deliberate trade-off... given this is a single-admin local tool today") is explicitly scoped out of this review as a client-side data-consistency concern for the parallel review to own — but note for that reviewer: "single-admin local tool" is exactly the premise this scalability review is asked to move away from, so that trade-off's justification no longer holds once many divisions are using the app concurrently.

---

## Top 3 — if you do nothing else, do these first

1. **Fix the connection-pool math (Finding 2) before anything else.** This is the one failure mode that doesn't degrade gracefully — Postgres hitting `max_connections` produces hard failures (rejected connections, random 500s) the moment a second instance is added, not a slowdown. Everything else on this list is a performance or operability improvement; this one is a correctness cliff edge waiting for the first horizontal-scale deployment.
2. **Fix the rate limiter's storage backend (Finding 1) at the same time you fix #1** — both point at the same root cause (in-process state that silently stops meaning what it says the moment there's more than one process) and both are naturally paired with introducing Redis into the deployment, so do them together rather than twice.
3. **Add the one-line health endpoint (Finding 5, item 1) before deploying more than one instance.** Without it, there is no way for a load balancer to know an unhealthy instance should stop receiving traffic — every other fix on this list assumes a fleet that can actually be load-balanced correctly, and that requires this first.
