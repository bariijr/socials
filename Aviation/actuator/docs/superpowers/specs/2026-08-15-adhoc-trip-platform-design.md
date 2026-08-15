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

Thirteen tables. Reference tables are seeded with real data for the operator's
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
- `PersonRoles` — RoleID, Label. Seeded with PIC, SIC, FA, Mechanic,
  Engineer, Medical Staff, Other, Pax, VIP, Principal — editable/extendable
  by staff (a plain Reference Data page, same as the other four), never a
  hardcoded enum in code, because operators add role categories the platform
  didn't anticipate.

**Transactional spine**
- `Trips` — TripID, client/operator, registration, status (Draft/Confirmed/
  Cancelled/Completed), owner, notify recipients (crew/flight-dept emails),
  created timestamp
- `Persons` — PersonID, TripID, Name, RoleID (→ `PersonRoles`), Notes. A
  trip-level roster, not per-leg — real trips fly the same crew across
  multiple legs, and pax composition changes are the exception, not
  something worth a per-leg join table in this phase. Real telex requests
  name specific individuals (e.g. a crew-transport request naming one crew
  member by name), which a flat pax/crew count on the leg can't support.
- `Legs` — LegID, TripID, sequence, CallSign, DepICAO, ArrICAO, ETD (Z),
  ETA (Z, **nullable** — "TBD" is a real, common state when a return leg's
  arrival time isn't known yet), overflight countries (staff-entered list —
  no great-circle computation), revision counter (bumped whenever ETD/ETA/
  route changes, drives re-confirm invalidation). No `pax`/`crew` count
  fields — that information now lives in `Persons`.
- `Stops` — StopID, TripID, ICAO, ArrZ, DepZ, ground time, purpose
  (turnaround/tech/night stop). Derived from consecutive legs but persisted
  as real rows — never computed on the fly — because a stop owns ground
  time, handler, uplift, hotel, PPR/slot data with no other home. When the
  leg feeding a stop's arrival has no ETA yet, the stop's `ArrZ` and ground
  time are null too — the stop still exists (staff can still attach a
  handler while the time is pending), it just can't show a ground-time
  duration until the leg's ETA is filled in.
- `Services` — ServiceID, TripID, ScopeType (LEG / STOP / SEGMENT),
  ScopeID, ServiceType, ProviderID, Status, RefNumber, BasedOnETD_Z (the leg
  time this service was requested against), RequiredByZ (computed), Urgency
  (computed), AssignedTo (label only). One polymorphic table, not one table
  per service type — one status board, one SLA clock, one email queue, one
  audit trail.

**Ledgers**
- `Comms` — CommID, direction (in/out), TripID, ServiceID, correlation
  token, from/to, subject, body, kind (REQUEST/NOTIFICATION/CANCEL),
  timestamp (Z)
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
- **Template shape follows real industry telex format** (Universal Weather /
  A2G-style handling and permit requests), not a generic one-liner: a
  reference block (trip code, registration, call sign, PIC), an itinerary
  block, and a single numbered "PENDING CONFIRMATION" line naming the
  specific service this Composer instance is for (one Composer = one
  service, so the message never lists more than the one item it's actually
  requesting — real telexes bundle several services into one message because
  a human is typing once for a whole stop; this platform sends one
  correlation-tracked message per service instead, which is more messages
  but keeps the status/audit trail unambiguous per service).
- **Three template modes**, chosen automatically by the Composer based on
  the service's situation, sharing the same reference/itinerary header:
  - `REQUEST` — the default, for `Not Started`/`Requested`/`Chasing`.
  - `REVISION` — used when reopening the Composer for a `Re-confirm Required`
    service: shows the previous itinerary line (`BasedOnETD_Z`) against the
    new one (the leg's current `ETD`/`ETA`) side by side, mirroring the real
    "PREVIOUS ITINERARY" / "NEW ITINERARY" pattern, so the provider sees
    exactly what moved. Same correlation token as the original request — it
    threads into the existing conversation, it does not start a new one.
  - `CANCEL` — triggered from an explicit "Cancel" action on a Service (not
    a status change alone): tells the provider the service is no longer
    needed. Sets the Service to `Cancelled` on send.
- **Outbound**: Composer (a drawer opened from a Service, not a page)
  pre-fills the per-ServiceType, per-mode template (permit: reg/callsign/
  route/times/docs; fuel: uplift qty/into-plane agent; handling: pax/PPR)
  with the token baked into the subject. Send fires real SMTP via a backend
  worker (credentials live in the worker's environment, never in the
  frontend or any data store the frontend reads) and logs to `Comms`
  (`kind` = REQUEST or CANCEL to match the mode sent).
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

Static HTML pages + vanilla JS (ES modules), mock-data only for this phase —
no backend calls.

**Navigation**: Action Board (default) · Trips · Reference Data. No
standalone pages for Legs/Stops/Services/Comms/Persons — always edited in
context.

1. **Action Board** — every Service not `Confirmed`, sorted by
   `RequiredByZ`, urgency-colored. The default landing page.
2. **Trips** — searchable/filterable list (status, date range,
   registration).
3. **Trip Sheet** (`/trips/:id`) — hub for one trip, tabs: *Itinerary*
   (legs/stops/segments, each leg showing its Call Sign and ETA — "TBD" when
   null), *Roster* (the trip's `Persons` list — name + role, add/remove
   inline), *Services*, *Comms*, *History*. Trip header includes the Notify
   recipient list.
4. **Trip creation wizard**: Step 1 header (client/operator, registration,
   owner) → Step 2 legs (repeatable rows: Call Sign, ICAO autocomplete
   against `Airports`, overflight country list per leg, ETD required/ETA
   optional — leave blank for TBD) → Step 3 review system-derived stops
   before confirming. No forced "add services" or "add roster" step —
   both get added later from the Trip Sheet.
5. **Service drawer** (opened from Trip Sheet's Services tab): Add Service
   form with type-driven scope picker, live `RequiredByZ`/`Urgency` preview,
   default Provider from scope+type. Each Service row also has a **Cancel**
   action that opens the Composer in `CANCEL` mode.
6. **Composer drawer** (opened from a Service row): per-type, per-mode
   (`REQUEST`/`REVISION`/`CANCEL`) template in the telex-style format
   described under Comms, token-tagged subject, Send / logged history.
   Reopens automatically in `REVISION` mode when a service flips to
   `Re-confirm Required`.
7. **Reference Data** pages: Airports, Aircraft, Providers, Country Rules,
   Person Roles — plain CRUD-style tables, not gated behind a separate
   admin role.

## Explicitly out of scope for this phase

- Backend implementation (NestJS + Postgres + SMTP/IMAP worker) — separate
  future spec/plan.
- RBAC / multi-role permissions.
- Great-circle overflight-country computation (stays staff-entered).
- Any Excel/Office-add-in artifact — fully superseded by this design.
