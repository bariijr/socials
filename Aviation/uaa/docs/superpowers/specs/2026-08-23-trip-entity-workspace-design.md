# Trip Entity & Workspace — Design

Status: Approved for implementation planning
Date: 2026-08-23

## Purpose

The coordinator's own description of the app's current gap: legs exist, but "I do not see trip info" — there is no view that answers "what is this trip, as a whole" when several `Leg` rows share the same `tripNo` (real example: trip `484701` has 4 legs across Nigeria and South Africa; trip `475087` has 5 legs across Morocco/Botswana/South Africa). This spec adds a real `Trip` entity and a Trip workspace page that surfaces that.

## Relationship to the larger request

This spec is **Sub-project A** of a much larger request (a full "Trip Operations / Flight Support Management Engine" covering Requirement/ServiceCase/ServiceOrder modeling, a country/airport knowledge base, a vendor directory, template/communication/revision/deadline engines, RBAC, multi-tenancy, real-time sync, and AI-assist hooks). That request was explicitly too large for one spec and was decomposed during brainstorming into a sequence:

- **Spec A (this document)** — a real `Trip` entity + workspace view, derived from existing `Leg` data. No RBAC, no multi-tenancy, no real-time sync (confirmed out of scope for this app for now — the existing project design spec already scopes phase 1 to a single coordinator role, and that decision stands).
- **Spec B (future)** — `Requirement` → `ServiceCase` → `ServiceOrder` domain model, the country+permit-type compatibility/grouping engine, and migrating the existing `PermitRequest` data onto it.
- **Spec C (future)** — the "other services request and management" module (fuel, catering, GPU, handling, etc.) as new `ServiceCase` types built on Spec B's engine.

`Trip` is introduced now — deliberately minimal — specifically because Spec B's `ServiceCase` will need a stable `tripId` to reference. Building that relationship now avoids a second migration later.

## Scope decisions (confirmed during brainstorming)

- **Trip fields: minimal, derived from existing Leg data.** Not the ~30-field Trip model from the original request (client, purpose, commercial/private designation, VIP info, billing entity, currency, sales owner, etc.) — none of that exists in the current data or the MAYFLY sheet today, and building two dozen fields nobody populates would violate this project's own YAGNI discipline. `Trip` itself stores only `id`, `tripNo`, `createdAt`, `updatedAt`; everything else (tails, operator, countries, date range, status) is computed from its legs at read time, so it can never drift out of sync with the leg data that's actually maintained.
- **Aircraft: no single-aircraft-per-trip constraint.** Each `Leg` already carries its own `tail`/`acType`/`mtowLb` independently (this predates this spec). A trip's "aircraft" for display purposes is simply the distinct tail(s) found across its legs — usually one, but the model doesn't forbid more. No new override mechanism needed; this is already how the data works today.
- **Status: derived, two states.** `ACTIVE` if any leg lacks `completedAt` (Slice 5), `COMPLETED` if every leg has it. No separate status field, no manual transitions, no `DRAFT`/`QUOTING`/`CONFIRMED`/etc. lifecycle — that richer status model belongs to a later spec if a real need for it shows up.
- **No separate Trips list/nav page.** The real gap is "click a leg, see its trip," not "browse all trips as a standalone screen" — the existing Legs list already surfaces every leg. A dedicated `/trips` index can be added later if it turns out to be wanted.
- **Additive only.** Nothing about the existing Legs list, Leg detail page, Permits, or Notifications changes. `PermitRequest` and `Comm` reference `legId` directly and are untouched by this spec.

## Data model

### `Trip` entity

```typescript
@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_no', unique: true })
  tripNo: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### `Leg` gets a `trip_id` FK

```typescript
  @Column({ name: 'trip_id', type: 'uuid' })
  tripId: string;
```

`Leg.tripNo` (the existing string column) is **not removed** — it's still what the MAYFLY export (`mayfly-export.ts`) and the Excel seed script (`seed-from-excel.ts`) key off, and it's the natural human-facing identifier. `tripId` is the new relational link; `tripNo` and `Trip.tripNo` are kept in sync by construction (see "Leg creation" below), not by a trigger or application-level reconciliation job.

### Migration

Two-part migration, run in one transaction:

1. `CREATE TABLE trips` (id, trip_no unique, created_at, updated_at).
2. Backfill: for each distinct `tripNo` among existing `legs` rows, insert one `trips` row; then `ALTER TABLE legs ADD trip_id uuid`, populate it by matching `legs.trip_no = trips.trip_no`, then set it `NOT NULL` once backfilled.

This mirrors the real seeded data: 62 legs, grouped into however many distinct trip numbers actually exist among them (a real count to confirm during implementation, not assumed here).

### Leg creation (`LegsService.create`)

Currently `create()` takes a `CreateLegDto` with a plain `tripNo` string. It gains a find-or-create step: look up `Trip` by `tripNo`; if none exists, create one. This matches the real workflow — a coordinator adds a leg under a trip number; a new number implicitly creates a new trip. No new API surface for "create a trip" directly; trips only ever come into existence via a leg.

## Computed trip aggregate (not stored)

Computed by `TripsService` from a trip's legs, on read:

```typescript
interface TripAggregate {
  tripNo: string;
  tails: string[];        // distinct, non-null tails across legs
  operatorNames: string[]; // distinct, non-null operator names across legs
  countries: string[];     // distinct, non-null countries, in leg order
  legCount: number;
  firstDeparture: Date | null; // min(depDate) across legs
  lastArrival: Date | null;    // max(arrDate) across legs
  status: 'ACTIVE' | 'COMPLETED';
}
```

## API

- `GET /trips/:tripNo` — returns the aggregate above plus the trip's legs (full `Leg` objects, ordered by `legId`). 404 if no trip has that `tripNo`.

No other trip routes in this spec (no create/update/delete — trips are implicit, per the scope decisions above).

## Frontend

- New page `frontend/src/app/trips/[tripNo]/page.tsx` — Trip workspace: header with `tripNo`, tails, operator(s), countries, status badge, leg count, date range; below it, a table of the trip's legs (trip no already known, so this table shows leg-specific columns — ICAO, tail if it differs from the trip's primary tail, arrival, departure, status), each row linking to the existing `/legs/[id]` detail page.
- `frontend/src/app/legs/[id]/page.tsx` gets a small addition: a link up to its trip ("Trip 484701 — 4 legs") in the header area, next to the existing Mark Complete control.
- `frontend/src/lib/api-client.ts` gets `getTrip(token, tripNo)` and a `Trip`/`TripAggregate`-shaped type.

## Explicitly out of scope (this spec)

- The ~30-field full Trip model (client, purpose, commercial status, billing entity, currency, sales owner, VIP info, etc.) — Spec A only.
- Aircraft substitution/override mechanics beyond what already exists on `Leg`.
- A manually-set Trip status/lifecycle (`DRAFT`/`QUOTING`/`CONFIRMED`/etc.).
- A `/trips` list/index page.
- Any change to `PermitRequest`, `Comm`, `Notifications`, or the existing Legs list/detail pages beyond the one added link.
- `Requirement`/`ServiceCase`/`ServiceOrder` — Spec B.
- RBAC, multi-tenancy, real-time updates — confirmed out of scope for this app for now, matching the existing project design spec's phase-1 decision.
