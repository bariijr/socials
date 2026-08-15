# Ad-hoc/Private Flights Trip Management Platform — Design

Status: Approved for implementation planning
Date: 2026-08-15

## Purpose

A trip-operations platform for a private/ad-hoc flight operator: record trips,
break them into legs and stops, request and track third-party services
(permits, fuel, handling, catering, crew transport, customs) against those
legs/stops, correspond with providers by email with a reliable inbound/outbound
audit trail, and push internal notifications to crew/flight-dept when
schedules move or a service is at risk of breaching its deadline.

This supersedes an earlier Excel/Office.js-add-in version of this design. That
approach was abandoned because the add-in sandbox cannot send/receive real
mail or safely write to a workbook multiple staff have open concurrently. This
is a standalone web application instead: real database, real backend, real
SMTP/IMAP worker.

## Scope

- **New, standalone project**, living in this folder (`actuator/`), but not
  wired into Actuator's existing NestJS modules (Permits/Billing/Compliance/
  Reference/Auth/Tenants). Own docker-compose, own port, own auth, once a
  backend exists.
- **Frontend-first build**: static HTML pages + vanilla JavaScript (ES
  modules) against hardcoded/seeded mock data, no backend, no build step.
  This is a deliberate intermediate step — once the page flow is validated,
  it converts to Next.js (the domain-logic layer is written framework-free
  from the start specifically so that conversion is a lift, not a rewrite).
  Backend (NestJS + Postgres + SMTP/IMAP worker) is a later phase, out of
  scope for the implementation plan that follows this spec.
- **Single flat role** for now — every user is an ops staffer with full
  access to everything (trips, services, comms, reference data). No RBAC,
  no per-trip assignment gating. `AssignedTo` on a service is a label, not
  an access-control mechanism.

## Data model

Ten tables. Reference tables are seeded with real data for the operator's
region; transactional tables start empty (seed data for page-flow work comes
from hardcoded mock fixtures in the frontend, not these tables).

**Reference**
- `Airports` — ICAO (key), IATA, name, country, ISO2, timezone
- `Countries` — name, ISO2, region, overflight/landing permit required,
  AOC docs required, default escalation contact
- `CountryRules` — (Country, ServiceType) → LeadTimeHours, WorkingDaysOnly,
  ToleranceHours, DocsRequired, EscalationContact, Notes. This is the only
  place urgency/lead-time behavior is configured — never hardcoded per
  service type in code.
- `Aircraft` — Registration (key), ICAO type designator, manufacturer/series,
  MTOW, noise cert
- `Providers` — ProviderID, name, ServiceType, scope (ICAO or Country),
  email, AOG contact, working hours (Z)

**Transactional spine**
- `Trips` — TripID, client/operator, registration, status (Draft/Confirmed/
  Cancelled/Completed), owner, notify recipients (crew/flight-dept emails),
  created timestamp
- `Legs` — LegID, TripID, sequence, DepICAO, ArrICAO, ETD (Z), ETA (Z),
  pax, crew count, overflight countries (staff-entered list — no
  great-circle computation), revision counter (bumped whenever ETD/ETA/route
  changes, drives re-confirm invalidation)
- `Stops` — StopID, TripID, ICAO, ArrZ, DepZ, ground time, purpose
  (turnaround/tech/night stop). Derived from consecutive legs but persisted
  as real rows — never computed on the fly — because a stop owns ground
  time, handler, uplift, hotel, PPR/slot data with no other home.
- `Services` — ServiceID, TripID, ScopeType (LEG / STOP / SEGMENT),
  ScopeID, ServiceType, ProviderID, Status, RefNumber, BasedOnETD_Z (the leg
  time this service was requested against), RequiredByZ (computed), Urgency
  (computed), AssignedTo (label only). One polymorphic table, not one table
  per service type — one status board, one SLA clock, one email queue, one
  audit trail.

**Ledgers**
- `Comms` — CommID, direction (in/out), TripID, ServiceID, correlation
  token, from/to, subject, body, kind (REQUEST/NOTIFICATION), timestamp (Z)
- `Audit` — timestamp (Z), user, table, record ID, field, old value, new
  value. Field-level, not full-record — covers leg times, service status/
  provider, trip status; not every keystroke.

### Polymorphic scope rules

`ScopeType` constrains which `ServiceType`s are valid and which entity
`ScopeID` points at:

| ScopeType | Valid ServiceTypes | Points at |
|---|---|---|
| SEGMENT | Overflight permit | A (Leg, Country) pair — one row per country crossed per leg |
| LEG | Landing/departure permit | Legs |
| STOP | Fuel, Handling, Catering, Crew Transport, Customs | Stops |

The UI enforces this by filtering the scope picker to valid targets for the
chosen `ServiceType` — staff cannot file a fuel request against a leg because
the picker never offers legs for that type.

### Service lifecycle

`Not Required → Not Started → Requested → Chasing → Confirmed →
Re-confirm Required → Cancelled`

One enum for every service type. No bespoke per-service-type statuses.

### Urgency and schedule-change invalidation

- `RequiredByZ = BasedOnETD_Z − LeadTimeHours` (from `CountryRules`,
  respecting `WorkingDaysOnly`).
- `Urgency` = OK / DUE / URGENT / BREACH, a pure function of `RequiredByZ`
  vs. now — same formula for every row, all variation lives in
  `CountryRules` data, never in code.
- When a Leg's ETD changes beyond that service's `ToleranceHours` (from
  `CountryRules`), any Service whose `BasedOnETD_Z` no longer matches flips
  from `Confirmed` to `Re-confirm Required` automatically and reappears on
  the Action Board. This is the platform's core operational safety feature —
  flying on a permit issued for a stale time slot is the real risk, not
  slow email.

### Stop rebuild

Editing a leg's route/ICAOs (not just its time) requires re-deriving stops.
This is an explicit **"Rebuild Stops"** action, never automatic: it diffs
proposed stops against existing ones by (ICAO, sequence), preserves any stop
that already has services attached, and surfaces new/orphaned stops for
staff review rather than silently deleting data.

## Comms

- **Correlation token** `[TripCode/SVC-ID]` embedded in every outbound
  subject line — the only reliable mechanism for filing inbound replies back
  to the right service, with or without any particular mail provider.
- **Outbound**: Composer (a drawer opened from a Service, not a page)
  pre-fills a per-ServiceType template (permit: reg/type/route/times/docs;
  fuel: uplift qty/into-plane agent; handling: pax/PPR) with the token baked
  into the subject. Send fires real SMTP via a backend worker (credentials
  live in the worker's environment, never in the frontend or any data
  store the frontend reads) and logs to `Comms`, flips Service to
  `Requested`.
- **Inbound**: backend worker polls IMAP, matches token in subject, appends
  to that Service's Comms thread automatically. Manual "file this email"
  exists as a fallback for anything the token match misses.
- **Notifications** (crew/flight-dept) use the same `Comms`/worker
  machinery but are tagged `NOTIFICATION`, not `REQUEST`, need no
  correlation token (no reply expected), and fire on: a Leg's ETD moving
  beyond tolerance, a Service reaching `Urgency = BREACH` (escalated to
  `EscalationContact` for that country/service), and Trip status changes to
  Confirmed/Cancelled. Recipients come from a simple email list attached to
  the Trip, not a separate contacts table.

## Page flow (frontend-first, hardcoded seed data)

Next.js, mock-data only for this phase — no backend calls.

**Navigation**: Action Board (default) · Trips · Reference Data. No
standalone pages for Legs/Stops/Services/Comms — always edited in context.

1. **Action Board** — every Service not `Confirmed`, sorted by
   `RequiredByZ`, urgency-colored. The default landing page.
2. **Trips** — searchable/filterable list (status, date range,
   registration).
3. **Trip Sheet** (`/trips/:id`) — hub for one trip, tabs: *Itinerary*
   (legs/stops/segments), *Services*, *Comms*, *History*. Trip header
   includes the Notify recipient list.
4. **Trip creation wizard**: Step 1 header (client/operator, registration,
   owner) → Step 2 legs (repeatable rows, ICAO autocomplete against
   `Airports`, overflight country list per leg) → Step 3 review
   system-derived stops before confirming. No forced "add services" step —
   services get added later from the Trip Sheet.
5. **Service drawer** (opened from Trip Sheet's Services tab): Add Service
   form with type-driven scope picker, live `RequiredByZ`/`Urgency` preview,
   default Provider from scope+type.
6. **Composer drawer** (opened from a Service row): per-type template,
   token-tagged subject, Send / logged history. Reopens pre-filled with a
   "schedule change" variant when a service flips to `Re-confirm Required`.
7. **Reference Data** pages: Airports, Aircraft, Providers, Country Rules —
   plain CRUD-style tables, not gated behind a separate admin role.

## Explicitly out of scope for this phase

- Backend implementation (NestJS + Postgres + SMTP/IMAP worker) — separate
  future spec/plan.
- RBAC / multi-role permissions.
- Great-circle overflight-country computation (stays staff-entered).
- Any Excel/Office-add-in artifact — fully superseded by this design.
