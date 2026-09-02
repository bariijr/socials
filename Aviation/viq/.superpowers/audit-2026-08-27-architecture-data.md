# VIQ Architecture & Data-Management Review — 2026-08-27

**What VIQ is:** an internal aviation trip-operations tool. NestJS 10 + Prisma 5 + PostgreSQL 16 on the server, React 19 + Vite on the client, one unified source tree (`src/server`, `src/client`, `prisma`). It manages trips, legs, permits/handling services, crew/passenger rosters, documents (with OCR), billing, and communications for a flight-support/permits desk. This review is read-only static code analysis — no files were changed, no server was started.

Scope: (1) simplification opportunities that preserve current behavior exactly, (2) data-management logic — transaction safety, the client-side caching model, database indexing, and validation consistency — evaluated with an eye toward the stated goal of supporting **1,000s of concurrent users across multiple internal divisions of one organization** (not multi-tenant).

---

## Part 1 — Simplification opportunities

Ranked by value (impact of the mess vs. cost of the fix). All of these are pure refactors — no behavior change, no API/route change, no schema change.

### 1.1 `dataStore.ts` is a 1,869-line single file covering ~20 unrelated resource types (HIGH VALUE)

**What:** `src/client/lib/dataStore.ts` is the single data-access layer for the entire client. It contains, in one file: Trip/Leg/Stop/Service CRUD, ServiceType/LegPurpose catalog CRUD, Person roster/assignment/ratings, Comms, Docs/OCR, Audit, Invoices + PDF/QR generation, backup export, and *all nine* reference-data resources (Aircraft/Provider/Airport/Country/Operator/MessageTemplate/CountryFee/CountryRule/Users) including their shared in-memory cache. It has over 100 exported functions.

**Why it matters:** every edit to any one resource type requires holding a 1,869-line file's worth of unrelated context, and `grep`/navigation across concerns is harder than it needs to be. This is the single largest file in the codebase by a wide margin (next largest client file is `TripDetail.tsx` at 2,008 lines, but that one is a page component with proportionally more markup — `dataStore.ts` is pure logic).

**Fix:** split into per-domain modules under `src/client/lib/data/` — e.g. `trips.ts`, `persons.ts`, `docs.ts`, `comms.ts`, `invoices.ts`, `reference.ts` (the 9-resource cache-and-CRUD block), `audit.ts`, `format.ts` (the color/urgency/date helpers at the bottom) — each exporting exactly the same function names it does today. `dataStore.ts` itself becomes a barrel file: `export * from './data/trips'; export * from './data/persons'; ...`. Every existing `import { X } from '@/lib/dataStore'` across the app keeps working unchanged, because the barrel re-exports everything. This is mechanical (cut, paste, add a re-export line) and can be verified purely by `tsc` passing with zero other files touched.

**Effort:** Medium (a few hours of careful cut/paste + import path fixes fixes *inside* the new files, since the mapper functions like `mapTripFromApi` are private but called across the trip functions — needs one pass to identify which private helpers travel with which public functions). **Risk:** Low — it's a pure move, and TypeScript will catch any missed reference immediately at compile time.

### 1.2 `TripDetail.tsx` bundles 11 components in one 2,008-line file (MEDIUM-HIGH VALUE)

**What:** `src/client/pages/TripDetail.tsx` defines `FirTagInput`, `AddManifestPersonDialog`, `LegEditor` (~600 lines, lines 212–816, by far the largest sub-component), `ServiceInlineEditor`, `PermitSubmissionGroups`, `bucketForService`, `AttentionStrip`, `DeadlineRail`, `svcStatusIcon`, `TripInfoEditor`, and finally the page component itself (`export default function TripDetail()`, ~780 lines) — all in one file, all currently unexported (module-private).

**Why it matters:** each of these already has a clean, self-contained props interface (visible in their own function signatures) — this isn't tangled state, it's already-separable code that just hasn't been moved. `LegEditor` alone is bigger than most other page files in the app.

**Fix:** extract each into its own file under a new `src/client/components/trip-detail/` directory (e.g. `LegEditor.tsx`, `ServiceInlineEditor.tsx`, `AttentionStrip.tsx`, etc.), imported back into `TripDetail.tsx`. Zero behavior change — this is the same code, same props, different file boundary. Do this incrementally (one component at a time, verify build after each) rather than as one giant diff, since it's the app's single most business-critical page.

**Effort:** Medium-High (11 extractions, each needs its own import wiring, and a couple of these components close over sibling functions like `serviceLabel`/`toInputDate` that need to move to a shared file too). **Risk:** Low-medium — mechanical, but this is the highest-traffic page in the app, so each extraction should get its own quick manual smoke test.

### 1.3 The exact urgency predicate `Urgency === 'URGENT' || Urgency === 'BREACH'` is duplicated in 4 places, plus a third independent "rank" reimplementation (HIGH VALUE, LOW EFFORT)

**What:** the literal expression `s.Urgency === 'URGENT' || s.Urgency === 'BREACH'` appears independently in `Dashboard.tsx:28`, `AdminDashboard.tsx:44` and `:56`, and `Layout.tsx:107`. Separately, `AdminTrips.tsx:38` defines its own `URGENCY_RANK: Record<string, number> = { BREACH: 0, URGENT: 1, DUE: 2, OK: 3 }` — a third, independent encoding of the same four-value severity order that `dataStore.ts`'s exported `urgencyRank()` function (line 1807) already provides.

**Why it matters:** this is not hypothetical risk — it already caused a real, user-visible bug. The Phase 1–3 upgrade found that `Dashboard.tsx`'s urgent count (which filters through `openServices` first, then applies the predicate) and `AdminDashboard.tsx`'s count (which applies the predicate directly, no `openServices` pre-filter) disagreed by one (42 vs. 43) on the same data — exactly the kind of drift that four independent copies of "what counts as urgent" will keep producing.

**Fix:** add one exported helper — `isUrgentOrBreach(service: Service): boolean` — to `dataStore.ts` (or its future `format.ts` split, see 1.1), and have all four call sites use it. Separately, replace `AdminTrips.tsx`'s local `URGENCY_RANK` with the existing `urgencyRank()` export. Two tiny, independent, low-risk diffs.

**Effort:** Low (under an hour, including verifying the Dashboard/AdminDashboard count discrepancy either disappears or is explicitly, deliberately resolved one way). **Risk:** Very low.

### 1.4 Two separate admin surfaces manage Airports/Countries (ALREADY TRACKED — no new investigation needed)

Still open, already slated as this project's own "Phase 4" (Reference Data consolidation) per the existing plan — `/reference` and `/admin/assets` both have Airports/Countries tabs with no stated canonical owner, and `/reference` now has strictly more capability (search, Excel, and — for Countries — Country Rules) than `/admin/assets`'s equivalent tabs. Cross-referencing here for completeness; not re-investigated.

### 1.5 One confirmed dead dependency (LOW VALUE, TRIVIAL EFFORT)

`package.json`'s `@types/content-disposition` (pinned `^0.5.9`) is confirmed dead: the real `content-disposition` package (v3.0.0) ships its own bundled `dist/index.d.ts`, which TypeScript resolves in preference to the DefinitelyTyped stub — and the stub describes an old API shape (`export =` default function) that doesn't even match how the package is actually imported in this codebase (`import { create as contentDisposition } from 'content-disposition'`, confirmed the only usage, in `docs.controller.ts:4`). Already flagged as a deferred minor in the Phase 1–3 SDD ledger. Safe to `npm uninstall @types/content-disposition` — zero behavior change, since nothing consumes it.

### 1.6 The reference-data cache pattern is applied consistently — no drift found

Checked: every one of the 9 resources documented in README's "Reference data durability (4e)" section (Aircraft, Provider, Airport, Country, Operator, MessageTemplate, CountryFee, CountryRule) plus Users all go through the same `getXList()`/`saveX`/`deleteX` shape backed by the one `preloadReferenceData()` boot-time fetch. No stray resource was found reinventing its own fetch-and-cache pattern. This is a genuine strength, not a finding — noting it so the reviewer isn't left wondering whether it was checked. (Its *scaling* implications are covered in Part 2.2 below — this section is purely about internal consistency, which is fine.)

---

## Part 2 — Data-management logic

### 2.1 `Trip` has zero indexes beyond its primary key; `Service.urgency` and `AuditEntry.timestampZ` are unindexed hot-path sort/filter columns (HIGH VALUE — directly blocks the stated scale goal)

**What:** reading `prisma/schema.prisma` end to end, every model has at least an `@@index` on its foreign keys *except* `Trip`, which has none at all beyond its `@id` on `tripId`. Concretely:

- `TripsService.findAll()` (`trips.service.ts:23`) runs `prisma.trip.findMany({ orderBy: { createdZ: 'desc' } })` — **no `WHERE`, no `LIMIT`, no index on `createdZ`**. Every call to `GET /trips` (which `TripsPage.tsx` and `AdminTrips.tsx` both call on every load) does a full table scan, sorts every row, and returns every row to the client. This gets linearly slower as trips accumulate and is exactly the kind of query that goes from "fine in dev with 9 seed trips" to "a multi-second page load" once real usage across several divisions accumulates months of trip history.
- `AdminDashboard.tsx`/`Dashboard.tsx`/`Layout.tsx` all call `GET /services` unfiltered and then filter client-side for `urgency IN ('URGENT','BREACH')` (see Part 1.3) — but the *server* has no index on `Service.urgency` either (only `tripId` and `[scopeType, scopeId]` are indexed, `services.service.ts`'s hot filters aren't). Every service row for every trip that ever existed is pulled over the wire on every dashboard load, all the time — this is both an indexing problem and (see 2.4) a missing-pagination problem.
- `AuditService.findAll()` (`audit.service.ts:40-41`) runs `auditEntry.findMany({ orderBy: { timestampZ: 'desc' } })` (README documents this is called with `?limit=1000`) — no index on `timestampZ`, only on `[table, recordId]`. The audit table is append-only and grows with *every mutation in the app*, making this the single fastest-growing table with the least query support for its own most common access pattern (recent-first).

**Fix (concrete, minimal):**
```prisma
model Trip {
  // ...
  @@index([status])
  @@index([createdZ])
}
model Service {
  // ...
  @@index([urgency])
}
model AuditEntry {
  // ...
  @@index([timestampZ])
}
```
A normal Prisma migration (`prisma migrate dev`), fully additive, zero application-code change required alongside it — these indexes make the *existing* queries faster without changing what they return.

**Effort:** Low (one migration). **Risk:** Very low — pure additive indexing, standard practice, no behavior change.

### 2.2 The client-side "cache primed once at app boot" pattern doesn't just mean stale tabs — it's the same shape as the newly-added rate limiter's in-memory storage, and both break the moment there's more than one server process

**What:** `preloadReferenceData()` (`Layout.tsx`) populates an in-memory JS cache in *the browser*, once per browser session, for all 9 reference-data resources — this part is genuinely fine at any user count, since each browser tab only ever talks to itself. The known, already-documented trade-off (a second tab/session doesn't see another session's edit until reload) is real but low-stakes: reference data (countries, aircraft, providers) changes rarely, and the blast radius is "an admin's second tab shows a stale value until refresh," not data loss.

**The more consequential finding, not previously documented:** Phase 1–3 of this project's own upgrade work added `@nestjs/throttler` to rate-limit the public quote endpoint, using `ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])` with no custom storage configured — which means the throttler's request counters live **in the Node process's own memory**, exactly the same "single-instance-only" shape as the client cache, but on the *server* this time. This is invisible today because there's exactly one server process. The moment this app is scaled horizontally (multiple Node instances behind a load balancer — the natural way to serve "1,000s of concurrent users"), each instance tracks its own independent rate-limit counters: a client load-balanced across 4 instances could send 5 requests to *each* instance (20 total) before any single instance would return 429, silently multiplying the effective rate limit by however many instances are running. This isn't a new bug introduced carelessly — it's the standard default behavior of every in-process rate limiter — but it's a concrete, specific gap between "works today" and "works at the target scale," and it's cheap to close now while it's fresh: `@nestjs/throttler` supports a pluggable `ThrottlerStorage` (a Redis-backed implementation is a well-trodden path) that makes counters shared across instances.

**Fix:** not urgent today (single instance), but should be the very first thing addressed *before* any horizontal scaling work — swap `ThrottlerModule.forRoot`'s default in-memory storage for a shared store (Redis is the standard choice) as part of whatever infrastructure work introduces multiple server instances. Flagging now so it's not rediscovered the hard way after the app is already running on 4 pods and getting spammed.

**Effort:** Low-Medium once Redis (or an equivalent shared cache) exists in the deployment anyway for other scaling reasons (see the separate scalability review for session/cache infrastructure recommendations). **Risk of not fixing before scaling:** Medium — not a security hole (the endpoint is still capped per-instance), but the *intent* of the rate limit (stop abuse of the public form) silently weakens as instance count grows, with no error or warning anywhere to notice it.

### 2.3 `generateOverflightServices`/`generateArrivalServices` do sequential, unbatched, non-transactional writes per country — safe by design, but slow at scale

**What:** both functions (`services.service.ts:118-158` and `:164+`) loop over a leg's countries and, for each one needing a service, do 3 sequential `await`s (a `country` lookup, a `leadTimeHours` lookup, a `resolveProvider` lookup) followed by one `create()` and one `audit.log()` call — none of it wrapped in `$transaction`, none of it batched.

**This is NOT a correctness bug** — worth stating clearly, since "no transaction" can look alarming out of context. Each service's ID is deterministic (`${legId}-OVF-${iso2}`, etc.) and every call re-checks "does this already exist" before creating it, so the functions are genuinely idempotent and resumable exactly as README already documents: a crash mid-loop just leaves a partial result that the *next* call (which happens automatically on every leg save) completes. No duplicate rows, no partial-record corruption.

**It is a performance/scale finding**, though: for a leg overflying N countries, this is 3×N+N sequential round-trips to the database, one leg-save at a time, holding whatever connection-pool slot it has open for the whole loop's duration. Under concurrent load from many divisions saving legs simultaneously, this pattern (a) is slower than it needs to be per-request and (b) holds pooled DB connections longer than the actual work requires, which directly reduces how many concurrent requests the connection pool can serve.

**Fix (optional, only worth doing if this path is measured as a real bottleneck under load):** batch the independent lookups with `Promise.all` per country instead of sequential `await`s (the 3 lookups per country don't depend on each other), and consider `createMany` for the final inserts once all per-country data is resolved — though `createMany` would need the audit-log call decoupled from each individual create, which is a real design decision, not a trivial change. Given this only runs once per leg save (not on every page load), it's lower priority than 2.1/2.4's read-path fixes — flagging for awareness, not urging immediate action.

**Effort:** Medium (requires care around what `resolveProvider`/`leadTimeHours` actually do — not inspected in depth here). **Risk:** Low-Medium — touches business logic, deserves its own test pass if pursued.

### 2.4 No endpoint in the app paginates (compounds 2.1 directly)

**What:** `GET /trips`, `GET /services`, `GET /persons` (full roster), `GET /docs`, `GET /audit` (capped at a hardcoded `?limit=1000` by convention, not by the server enforcing a max) — every list-returning endpoint returns its entire result set, every time, with no `skip`/`take`/cursor support anywhere in any `*.service.ts`'s `findMany` calls.

**Why it matters:** this is fine at today's data volume (single-digit trips, a few hundred services) and becomes the dominant cost driver at the target scale — both in query time (see 2.1) and in payload size shipped to every client on every page load, for every one of the "1,000s of concurrent users." This is arguably the single most consequential data-management finding for the stated scale goal, more so than any individual missing index, since even a perfectly-indexed unbounded query is still an unbounded query.

**Fix:** out of scope to fully design here (it touches every list page's frontend pagination UI too, not just the backend), but flagging as the top scale-readiness item for a future dedicated pass — likely `skip`/`take` query params on every list endpoint, with the frontend's list pages adding pagination controls where they don't have any today (most currently render every row from `getTrips()`/`getServices()` etc. directly).

### 2.5 DTO validation consistency: authenticated write endpoints don't get the same size discipline the public endpoint just did

**What:** Phase 1–3 added `@MaxLength` to `CreateQuoteDto`'s free-text fields (the *public*, unauthenticated endpoint) after a security audit flagged unbounded string/array sizes. Spot-checking `CreateTripDto` (an authenticated-only endpoint) shows the identical gap: `client`, `notes`, `operationType`, `missionType`, `billToAddress` etc. are all bare `@IsString()` with no `@MaxLength`, same as `CreateQuoteDto` was before that fix.

**Why it matters:** lower severity than the public endpoint (this one requires a valid Coordinator/Admin JWT), but it's the same class of issue, left unaddressed on every *other* write DTO in the app — worth a follow-up pass to apply the same discipline consistently rather than only where an audit happened to look. Not spot-checked exhaustively here (time-boxed to 1 file) — a full DTO audit would be a quick, mechanical follow-up task.

**Effort:** Low per DTO. **Risk:** Very low (adding a length cap to an existing optional string field practically never breaks legitimate usage).

---

## Summary table

| # | Finding | Area | Value | Effort | Risk |
|---|---|---|---|---|---|
| 1.1 | Split `dataStore.ts` into per-domain modules + barrel | Simplify | High | Medium | Low |
| 1.2 | Extract `TripDetail.tsx`'s 11 sub-components to their own files | Simplify | Med-High | Med-High | Low-Med |
| 1.3 | One shared `isUrgentOrBreach()`/`urgencyRank()` everywhere | Simplify | High | Low | Very low |
| 1.5 | Drop dead `@types/content-disposition` | Simplify | Low | Trivial | None |
| 2.1 | Add indexes: `Trip.status`/`createdZ`, `Service.urgency`, `AuditEntry.timestampZ` | Data/Scale | High | Low | Very low |
| 2.2 | Plan for shared (Redis) throttler storage before horizontal scaling | Data/Scale | Medium (now) / High (at scale) | Low-Med | — |
| 2.3 | Batch per-country lookups in service-generation loops | Data/Scale | Low-Med | Medium | Low-Med |
| 2.4 | Add pagination to every list endpoint | Data/Scale | High (at scale) | High | Med |
| 2.5 | Extend `@MaxLength` discipline to authenticated DTOs | Data/Scale | Low-Med | Low | Very low |
