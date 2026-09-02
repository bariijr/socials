# VIQ Test Foundation + Leg/Stop Correction — Design

Sub-project selected from
[2026-09-02-viq-phase0-architectural-assessment.md](2026-09-02-viq-phase0-architectural-assessment.md)
as the first slice of the platform-upgrade proposal: it's the one every
later phase depends on, and it resolves Conflict #1 (stop deduplication)
from that assessment.

## Scope

In scope:
- A Jest-based test framework for `src/server`, running against a real
  Postgres test database.
- Fixing the "N Stops" display to mean arrival events (per leg), not the
  `Stop` table's row count.
- Making connecting-stop creation idempotent per leg-transition instead of
  per-ICAO, so repeated-ICAO itineraries (demo flights, same-airport
  positioning legs) get a distinct `Stop` row per transition.
- A migration that backfills the new linkage and repairs any stops the old
  ICAO-dedup bug previously suppressed.
- Integration tests for the four §79 stop scenarios plus a documenting
  regression test for the known service-regeneration limitation.

Explicitly out of scope (deferred to later phases per the assessment):
- `Stop.stopType` classification (§30) — additive field, separate fast-follow.
- ICAO/IATA/name autocomplete (§31) — unverified UI-layer item, separate.
- Dismissal-tracking for `generateOverflightServices`/`generateArrivalServices`
  (Conflict #2) — belongs to the Change Impact Engine phase.
- Client-side test setup, or tests for any module outside Leg/Stop/route-country
  generation (comms, docs, invoices, etc.) — scoped per the earlier decision.

## Root cause: what "0 stops" actually means today

`Stop` rows represent connecting/technical layovers between two legs.
`ensureConnectingStops` (`src/server/modules/legs/legs.service.ts:105-131`)
only creates one when `legA.arrIcao === legB.depIcao` for consecutive legs
— a single-leg trip (`HTDA → FALA`) has no "next leg," so it legitimately
has zero `Stop` rows under that definition. The UI reads this same count
(`trip.Counts.Stops`, sourced from a Prisma `_count` per
`ARCHITECTURE.md`'s Stage 2b pagination notes) and displays it as the
trip's stop total — which is a different concept than what the spec means
by "N Stops" (arrival events after departure, destination included).

**Fix:** compute the *display* stop count from `legs.length` (one arrival
event per leg, including the final one), not from the `Stop` table's row
count. The `Stop` table keeps its existing meaning — connecting/technical
layover tracking, used for ground-time and stop-scoped services — untouched.
This is a query/display fix in the endpoints and components that currently
read `trip.Counts.Stops` (`TripsPage.tsx:75,903`, `AdminTrips.tsx:236`, and
wherever `TripDetail.tsx`'s route summary renders a stop count), not a
schema change.

Two display forms per the spec (§28):
- Default: `"N STOPS"` + list of arrival ICAOs (all legs after the first
  departure).
- Optional "N OPERATIONAL EVENTS" view: departure/exit + stop, e.g.
  `HTDA EXIT` / `FALA STOP` — a toggle or expanded view, not a replacement
  for the default.

## Fixing idempotency: `Stop.afterLegId`

`ensureConnectingStops` reruns on every leg save for the whole trip
(`legs.service.ts:170`). Simply removing the `stopIcaos.has(icao)` check
would create a fresh duplicate `Stop` row on every subsequent save, since
`Stop` currently has no link back to which leg-transition produced it
(`stopId`/`tripId`/`icao`/`arrZ`/`depZ` only) — the ICAO set was standing
in, incorrectly, for "have I already created the stop for this transition."

**Schema change:** add `Stop.afterLegId String? @unique` (FK to
`Leg.legId`, `onDelete: SetNull` — a stop shouldn't vanish if its leg is
later deleted, but should stop being claimed by the generator). Manually
added stops (never created by `ensureConnectingStops`) leave this null and
are never touched by the generator's idempotency check.

**Logic change:** `ensureConnectingStops` checks "does a `Stop` already
exist with `afterLegId = current.legId`" instead of the ICAO `Set`. Every
qualifying transition (`current.arrIcao === next.depIcao`) gets its own
stop regardless of how many other transitions in the trip share that ICAO
— directly satisfying §29's "no deduplication by ICAO, ever," including
for auto-generated connecting stops (broader than the originally-proposed
compromise, per the resolved decision in the Phase 0 assessment).

**Migration + data repair:** a Prisma migration adds the column, then a
one-time backfill script re-runs the same connecting-leg matching logic
per trip:
1. For each trip, walk consecutive leg pairs where `legA.arrIcao === legB.depIcao`.
2. Try to claim an existing unclaimed `Stop` row matching that ICAO (best-effort,
   first-unclaimed-match — this is exactly the ambiguous case the old bug
   created, so a match is a guess, not a certainty) and set its `afterLegId`.
3. If no existing `Stop` row is available to claim for that transition,
   **create one** — this is the previously-suppressed stop the old
   ICAO-dedup bug silently dropped.

This is an intentional data-repair side effect, not a hidden one — trips
with repeated-ICAO itineraries will gain `Stop` rows they were always
supposed to have. Flag this explicitly to the user before running the
migration against production data (row counts before/after per trip should
be logged for review).

## Test foundation

No test framework exists anywhere in the repo today (`grep -i jest` /
`grep -i vitest` / `grep -i mocha` against `package.json` all return
nothing). Scope, per the earlier decision, is `src/server` only.

- **Framework:** Jest + `ts-jest` + `@nestjs/testing`. Standard NestJS
  pairing; no reason to deviate.
- **Database:** a second database, `jetflow_test`, on the same existing
  `docker-compose.yml` Postgres container (`jetflow_api_postgres`, port
  5442) — no new infrastructure. `DATABASE_URL` is overridden for test
  runs via `.env.test`.
- **Schema sync:** a `pretest` npm script runs `prisma migrate deploy`
  against `jetflow_test` before the suite executes, so the test DB always
  matches the current migration history.
- **Isolation:** a truncate-all-tables helper (respecting FK order, or
  `TRUNCATE ... CASCADE`) runs in `beforeEach`, so tests don't leak state
  into each other. Real Prisma client, real queries, real constraints — no
  mocked Prisma client, per the earlier decision (this project has
  explicit prior guidance against mocking things that previously caused
  mock/prod divergence).
- **Location:** co-located `*.spec.ts` files next to the service they
  test (`legs.service.spec.ts` next to `legs.service.ts`), matching Nest's
  own convention.

## Tests to write

Integration tests against `LegsService`/`ServicesService` directly (not
through HTTP), using the real test-DB Prisma client:

1. **`HTDA → FALA` (single leg).** Expect display stop count = 1
   (`FALA`), zero `Stop` DB rows (no connecting transition exists).
2. **`FALA → HECA → HAAB` (two legs, no repeats).** Expect display stop
   count = 2 (`HECA`, `HAAB`); one connecting `Stop` row at `HECA` with
   `afterLegId` set to leg 1.
3. **`HTDA → FALA → FALA` (repeated ICAO, demo-flight shape).** Expect
   both the `HTDA→FALA` and `FALA→FALA` transitions to each produce their
   own `Stop` row at `FALA` (two rows, same ICAO, different `afterLegId`)
   — this is the direct regression test for Conflict #1.
4. **`FALA → FALA → FBMN` (repeated ICAO, different position).** Only the
   first transition (`FALA→FALA`) qualifies as connecting under
   `current.arrIcao === next.depIcao`. Assert exactly one `Stop` row is
   created, for that transition. `FBMN` does not get a connecting `Stop`
   row — it's the trip's final arrival, correctly represented as a
   display-only "stop" via `legs.length`, not a DB `Stop` row. Display
   stop count for this trip = 2 (`FALA`, `FBMN`).
5. **Migration repair test.** Seed a trip with a pre-migration-shape
   database state reproducing the old bug (two transitions sharing one
   ICAO, only one `Stop` row present, `afterLegId` absent/null), run the
   backfill logic, assert a second `Stop` row is created for the
   previously-suppressed transition.
6. **Documenting regression test for the known regeneration limitation.**
   Create a leg, call `generateOverflightServices`, delete the resulting
   service, save the leg again, assert the service reappears. This locks
   in and documents the existing behavior (per Phase 0 assessment
   Conflict #2) rather than leaving it silently uncovered — the test's
   name/comment should make clear this is a known, accepted limitation in
   this phase, not a bug being introduced.

## Migration risk and rollout

The `afterLegId` migration touches production trip data (creates new
`Stop` rows). Recommended rollout: run the backfill against a copy of
production data first, review the row-count delta per trip, then apply to
production during a low-traffic window. This is a data-repair migration,
not a purely additive schema change — treat it with the same care as any
other production data migration in this project.

## Out-of-scope reminder

This sub-project does not touch: `Stop.stopType`, ICAO autocomplete, the
Change Impact Engine, or any client-side test coverage. Those remain
tracked in the Phase 0 assessment for their own future brainstorm/spec
cycles.
