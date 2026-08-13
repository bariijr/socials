# Jetelio V3 (v4 rebuild) — Build State

This document is a complete, detailed snapshot of the v4 build as it stands today. It exists so a
new session (human or AI) can onboard without re-deriving anything from git history or source
reading. `README.md` is the short quickstart; this file is the long-form reference — data model,
engines, API surface, frontend structure, conventions, gotchas, and the full task history that
explains *why* things are shaped the way they are.

Jetelio is a flight-support trip and permit planning platform for business-jet/charter operations
across Africa, the Middle East, Europe and India. A flight-support company (JTL) uses it to run
overflight/landing permits, ground handling, navigation fees, and trip quoting for operators —
plus give operators a free public tool ("Viability IQ") to self-check whether a trip is feasible
before ever talking to a human.

---

## 1. Quickstart

```bash
cp .env.example .env        # fill in POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, JWT_SECRET_KEY
                             # ANTHROPIC_API_KEY is optional — only the trip-builder chat (§7.19)
                             # needs it; everything else works with it left empty
make up                     # docker compose up --build -d — migrations run automatically
make import                 # loads .LAYOUT/JTLlayout-Index_admin.xlsx and prints the readiness report
```

Open `http://localhost:8080` (nginx). API at `http://localhost:8080/api`, OpenAPI docs at
`http://localhost:8080/docs`.

Seeded demo users (`app/importer/loaders/users.py`) all share the password
`Jetelio-Phase1-ChangeMe!` — reset before any real use:

| Email | Role |
|---|---|
| `ops@jetelio.com` | SUPER_ADMIN |
| `specialist@jetelio.com` | OPERATIONS_SPECIALIST |
| `audit@jetelio.com` | AUDITOR |
| `ops@example.com` | CLIENT (view only) |

If a seeded account's login stops matching the documented password (seen once with
`ops@jetelio.com` — root cause not identified, other seeded accounts were unaffected), reset it
directly rather than assuming the docs are wrong: `docker compose exec api python3 -c "from
app.core.security import hash_password; print(hash_password('Jetelio-Phase1-ChangeMe!'))"`, then
`UPDATE users SET hashed_password='<output>' WHERE email='<the account>';` via `docker compose
exec db psql`.

**No bind mounts** — `api`, `api-test`, and `web` all `COPY . .` at image build time; they do not
live-reload from the host filesystem. After adding/editing any backend or frontend file, `docker
compose build <service>` before `up -d`/`run` — otherwise the container silently keeps running the
stale image and a brand-new file (e.g. a fresh Alembic migration) won't be found at all. Bitten by
this mid-build once: `docker compose build api` succeeded, then a migration file added *after* that
build wasn't in the image until rebuilt again.

**Watch host disk space.** Docker Desktop's daemon crashed twice during the task #89 build session
with a low free-space host drive (as little as 2.2GB free on a 238GB drive) — builds got slow
(minutes to unpack a layer) and the daemon eventually went down mid-build with a "read-only
filesystem" error writing buildkit's own metadata. `docker system prune`/`docker builder prune`
free only Docker's *own* footprint (was ~6GB in that incident) — if the host itself is nearly
full, that prune barely moves the needle and the daemon can crash again on the next heavy build.
If builds start taking noticeably longer than normal, check host free space before troubleshooting
anything Docker-config-side.

**Recurred worse during task #103**: `docker builder prune -a -f` was run *while already low on
space*, trying to reclaim room — this backfired. It deleted valid, reusable cache layers, so the
next build had to redo the `api` image's full `apt-get install gdal-bin libgdal-dev` layer from
scratch (~450 seconds alone, hundreds of MB of Debian packages) instead of a fast incremental
rebuild of just the changed Python files. Five build attempts in a row then got silently killed
partway through (no error output at all — not even a clean OOM/disk-full message), each one
leaving behind partial, uncleaned layer data, and host free space measurably *dropped* with every
failed attempt (2.5GB → 1.7GB) rather than staying flat. Docker Desktop itself later went fully
down (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`) and
needed a full relaunch. **Lesson: don't prune the builder cache as a low-space fix if the image
has any slow-to-rebuild layer (native apt/apk dependencies especially) — it trades a small,
uncertain space reclaim for a much larger guaranteed one-time rebuild cost, at the worst possible
moment (already low on space).** If a build starts failing silently and host space is critically
low (sub-2GB), stop retrying immediately — further attempts measurably burn more space with each
failure — and get the user to free real space first (Docker's own footprint is never the actual
problem at that point).

---

## 2. Architecture

Layered per the original spec: **api routers → services (use cases) → domain (pure functions) →
repositories → db**. The domain layer (`app/domain/*`) imports nothing from FastAPI or SQLAlchemy
— it's unit-tested in isolation (`tests/unit/domain/`) so its outputs can be diffed against the
legacy workbook and reasoned about without a database.

```
v4/
├── docker-compose.yml        # db(PostGIS) · redis · minio · mailhog · api · worker · web · nginx
├── .env.example
├── Makefile
├── Prompt.md                 # this file
├── README.md                 # short quickstart
├── data/
│   ├── JTLlayout-Index_admin.xlsx   # importer source (the "spec" — real production data)
│   └── geo/                          # Natural Earth 10m countries + VATSpy FIR boundaries
├── backend/
│   ├── Dockerfile             # multi-stage, non-root, pinned base
│   ├── docker-entrypoint.sh   # runs `alembic upgrade head` before serving
│   ├── alembic/versions/      # 14 migrations, chained (see §4.10)
│   └── app/
│       ├── models/            # SQLAlchemy ORM — one file per domain area
│       ├── schemas/           # Pydantic v2 request/response shapes
│       ├── domain/            # pure functions — great_circle, permits, capability, credentials,
│       │                      # nav_fees, trip_legs, visa_resolution, service_catalogue, reference_status
│       ├── repositories/      # generic CRUD repo (optimistic lock + soft delete) + audit log writer
│       ├── services/          # use-case layer, one per entity group
│       ├── api/routers/       # thin FastAPI routers
│       ├── core/               # settings_registry, storage (S3/MinIO), security, errors
│       ├── importer/          # xlsx_reader, geo_loader, loaders/*, export_service.py, cli.py
│       └── worker/            # Celery app (no tasks yet)
├── frontend/                  # Next.js 14 App Router, TS, Tailwind, TanStack Query
└── nginx/                     # reverse proxy: /api -> api, /docs -> api, else -> web
```

### Tech stack

- **Backend**: FastAPI + SQLAlchemy 2 (async) + Pydantic v2 + Alembic + PostgreSQL 16/PostGIS 3.4.
- **Frontend**: Next.js 14 App Router + TypeScript + Tailwind CSS + TanStack Query.
- **Storage**: MinIO (S3-compatible) for documents, accessed via `boto3` wrapped in
  `asyncio.to_thread` (`app/core/storage.py`).
- **Auth**: JWT access + refresh tokens, role-based (`app/api/deps.py`).
- **Infra**: docker-compose with `db`, `redis`, `minio`, `mailhog` (`profiles: ["dev"]`, not
  started by a plain `up -d`), `api`, `worker` (Celery, `-B` embedded Beat — first real task
  landed task #103, §4.16), `api-test` (test profile), `web`, `nginx`.

---

## 3. The verification contract

This is the single rule that makes the platform trustworthy rather than merely plausible, and it
has been enforced consistently across every phase of this build:

> **Presence of a number is never treated as verification.** Every operationally significant fact
> carries `source` / `verified_by` / `verified_on` provenance. Every fallback constant lives in
> the `settings` table (seeded from `app/core/settings_registry.py`), never hard-coded in a
> service or domain function. Every derived status is computed on read by
> `app/domain/reference_status.py`, never stored as an editable field that could drift from the
> data it's supposed to describe.

**Concrete incident that reinforced this rule**: the nav-fee calculator originally had a
`default_nav_fee_base_rate` fallback that would price *any* unconfigured FIR overflight at a
generic formula-derived number. The user caught this — Tanzania overflight was priced at $2000
when the real-world figure is ~$280. The fallback was removed entirely. Today, a FIR with no
admin-entered `NavFeeProvider` row returns `fee_usd: null` and a `NO_PROVIDER_CONFIGURED` status;
`fully_priced: false` gates the entire subtotal/margin/total to `null` rather than ever showing a
guessed number. **Never reintroduce a numeric fallback for financial or operational data** — this
is not a style preference, it's a lesson from a real near-miss.

`GET /readiness/pilot-exit-gates` recomputes nine pilot-exit gates live on every call — country
lead times, permit flags, ground-handling policy, operators assignable, aircraft types approved,
airports tech-stop ready, visa matrix cells, vendor questionnaires, country requirement records.
While any gate is blocked the app is in **PILOT** mode. (The global `GateBanner` UI element that
used to announce this on every page was removed per user request — task #81 — but the gate
computation itself is untouched and still queryable.)

---

## 4. Data model

All tables use `StandardMixin` (`id` UUID PK, `created_at`, `updated_at`, `version` for optimistic
locking, `deleted_at` for soft delete) unless noted. Every mutating service call writes an
`audit_log` row (actor, action, entity, from/to, reason) via `app/repositories/audit.py`.

### 4.1 Reference data

- **`countries`** — `iso3` (PK), `iso2`, `name`, `region`, `overflight_permit_required`,
  `landing_permit_required`, `ground_handling_policy`, plus lead-time fields with
  `source`/`verified_by`/`verified_on`. `reference_status` and
  `effective_lead_time_hours`/`effective_lead_time_is_fallback` are computed, not stored
  (`app/domain/reference_status.py`).
- **`airports`** — `icao` (PK), `iata`, `name`, `city`, `country_iso3` (FK), `lat`/`lon`,
  `tech_stop_readiness` (computed).
- **`fir_boundaries`** — `icao_fir_code`, `name`, real PostGIS polygon geometry (Natural Earth /
  VATSpy sourced, never a 0.5° raster approximation).
- **`aircraft_performance`** — keyed on `icao_type`; manufacturer, model series, max range,
  cruise TAS, fuel burn, service ceiling, reserve safety margin, `source`/`verified`/`verified_by`/
  `verified_on`. `planning_status` and `practical_range_nm` are computed.
- **`vendors`**, **`service_catalogue`**, **`visa_rules`**, **`country_requirements`**,
  **`message_templates`** — reference tables for the permit/service/visa/messaging engines.

### 4.2 Operators, fleet, documents (task #76)

- **`operators`** — company record: `name`, `aoc_number`, `icao_designator`/`iata_designator`,
  `home_base_icao`, contact fields, `occ_email`, `billing_email`, `currency`, `tax_id`,
  `credit_limit_minor_units`, messaging fields (`preferred_channel`, `messaging_to/cc`,
  `sita_address`, `aftn_address`, `message_format`, `sending_team_signature`), `assignable_status`
  (computed), `quarantined`/`quarantine_reason`.
- **`aircraft`** — one row per tail, FK `operator_id`. `registration`, `icao_type`,
  `manufacturer`, `model_series`, `serial_number`, `colors`, `nationality_iso3` (FK
  `countries.iso3`), `default_callsign`, `home_base_icao`, `mtow_kg`, `max_pax`, `cofa_expiry`,
  `insurance_expiry`, `total_hours`, `total_landings`, `status` (ACTIVE/GROUNDED/ARCHIVED).
- **`aircraft_documents`** — FK `aircraft_id` (CASCADE), `doc_type`
  (REGISTRATION/COFA/INSURANCE/AIRWORTHINESS/NOISE_CERTIFICATE/OTHER), `filename`, `s3_key`
  (unique), `content_type`, `file_size_bytes`, `expiry_date`, `uploaded_by`. Bytes live in
  MinIO (`app/core/storage.py`); the DB row is metadata only. Downloads are proxied through the
  API (`StreamingResponse`), never presigned URLs — the MinIO hostname isn't reachable from the
  browser in this topology.
- **⚠️ Superseding plan queued**: task #89 (Party/Role overhaul, see §9) will likely generalize
  `aircraft_documents` into a polymorphic `documents` table shared across person/aircraft/party.
  Not started — this section describes what exists *today*.

### 4.3 Clients

- **`clients`** — bill-to entities. An operator has *many* clients (one operator can bill several
  legal entities). `ClientLookupOut` (`id`, `source_ref`, `bill_to_legal_name`) is what the trip
  builder's per-leg bill-to picker uses.
- **`billing_ref`** (task #97) — every Client and Vendor is assigned a billing reference number at
  creation: `CLI-000123`/`VEN-000123`, sequence-backed (`clients_billing_ref_seq`/
  `vendors_billing_ref_seq` via `app/core/billing_ref.py::next_billing_ref`) rather than computed
  as `max()+1` in Python, to avoid a race under concurrent creates. Immutable — never re-derived,
  never user-editable. Existing rows were backfilled in creation order
  (`row_number() OVER (ORDER BY created_at)`) by migration `d4e7b2f9c6a3`, with each sequence
  advanced past the highest backfilled number so the next real create doesn't collide.

### 4.4 Trips — the core booking record

Trips deliberately **snapshot** aircraft/operator data at creation time rather than holding a live
foreign key, so that if a registration changes hands, gets re-typed, or an operator record is
edited, historical trips are never retroactively altered. This was an explicit design decision
articulated by the user and implemented exactly as specified.

**`trips`**:
- `status` — 6-value lifecycle `LEAD → ACTIVE → COMPLETED → CLOSED → BILLED`, plus `CANCELLED` as a
  terminal state reachable from `LEAD` or `ACTIVE` (task #96, §4.13). `source`
  (`PUBLIC_FEASIBILITY_IQ` or internal — display-renamed to "Public Viability IQ (VIQ)" on the
  frontend, see §7.3), `overall_verdict` (computed).
- Snapshot fields (never live FKs): `aircraft_registration`, `entered_mtow_kg`, `serial_number`,
  `colors`, `operator_airline_name`, `ops_type` (PRIVATE/MILITARY/CHARTER/CARGO/MEDEVAC/OTHER),
  `flight_purpose` (BUSINESS/TOURISM/FERRY/REPOSITION/OTHER), `owner_team` (free-text, no
  Team/User-group model exists to FK against — task #96).
- `requested_by_name/email/phone`, `notes`, `next_deadline` (computed), `start_date`/`end_date` on
  `TripOut` (computed from the first/last leg's `reference_datetime`/`arrival_datetime` by
  `leg_index`, not stored columns — task #96).
- `created_by`/`updated_by` — UUID columns, **deliberately no FK to `users.id`**, matching the
  existing `audit_log.actor_user_id` precedent: a JWT-carried user id is valid by virtue of login
  issuance, not by referencing a live row. (This also avoids `ForeignKeyViolationError` in tests
  where tokens carry random UUIDs.)

**`trip_legs`**:
- `dep_icao`/`arr_icao`, `reference_datetime` (departure) and `arrival_datetime` — **both are real,
  independently stored, editable columns**, not one derived from the other. See §5.8 for how this
  reconciles with permit computation always using the engine's own resolved time.
- `call_sign`, `registration` (nullable **override** of the trip-level default, for a leg flown by
  a different tail than the trip default), `filed_route` (free-text dispatcher route string,
  stored and shown as-is on permit paperwork — **never geometrically parsed**, see §5.1).
  `client_id` (FK `clients.id`, per-leg bill-to, not per-trip — an operator may bill different
  legs to different clients).
- `leg_type` (PRIMARY/ALTERNATE) and `leg_status` (PENDING/CONFIRMED/CANCELLED/COMPLETED).
  Chronological ordering (`validate_primary_leg_ordering`, `app/domain/trip_legs.py`) is enforced
  **only** among PRIMARY legs — ALTERNATE legs exist to hold contingency service bookings and are
  exempt from ordering but are still billed.
- `updated_by` — same no-FK pattern as `trips.created_by`.

### 4.5 Nav fee providers (task: nav fee calculator)

- **`nav_fee_providers`** — `fir_code` (FK `fir_boundaries.icao_fir_code`), `name`, `country`,
  `formula` (FLAT_RATE/MTOW_ONLY/DISTANCE_ONLY/MTOW_DISTANCE/DISTANCE_WEIGHT), `base_rate`,
  `minimum_fee`, `maximum_fee`, `vat_rate`, `applies_50km_deduction`, `currency`,
  `source`/`verified_by`/`verified_on`. **Every rate must be an admin-entered row with real
  provenance — there is no numeric fallback** (see §3's incident writeup). A FIR with no row
  configured resolves to `NO_PROVIDER_CONFIGURED`, never a guessed number.
- Named settings: `nav_fee_margin_percent` (JTL's markup, applied on top of the raw provider
  total).
- **`permit_fee_providers`** (task #83, see §5.6) — `country_iso3` (FK `countries.iso3`),
  `permit_type` (OVERFLIGHT/LANDING/GROUND_HANDLING), `fee_category` (CAA_FEE/NAFISAT), same
  formula/rate/min/max/VAT/currency/provenance shape as `nav_fee_providers` above, unique on
  `(country_iso3, permit_type, fee_category)`. Named setting: `jtl_service_fee_usd` (flat JTL
  service fee per permit line item, defaults to `0` until an admin sets a real value).

### 4.6 Party/Role grouping layer + Person + Document (task #89)

The user's original request — "replace Operator/Client/Vendor with a unified Party+Role model" —
was scoped down to an **additive grouping layer** after mapping the real blast radius: `aircraft`,
`clients`, `users`, and both vendor-coverage tables all hold direct FKs to `operators.id`/
`clients.id`/`vendors.id`, and every service/router in the app reads those models directly. A true
replace meant rewriting every one of those FKs and every service that touches them, in one
migration, against a live system with 214 passing tests and real trip data. **User's explicit
choice**, offered as two concrete options: link existing rows together under a new grouping
concept (chosen) vs. rewire every FK to point at the new tables (not chosen, higher risk). Nothing
that worked before this task changed — `Operator`/`Client`/`Vendor` and everything that references
them are byte-for-byte the tables they were in §4.2–§4.3.

- **`parties`** — core identity only: `name`, `legal_name`, `country_iso3`, `address`,
  `contact_name`/`email`/`phone`, `notes`. Deliberately thin — operational detail (credit limits,
  messaging preferences, fleet, capability questionnaires) stays on whichever role-specific table(s)
  a party's roles point at, not duplicated onto Party.
- **`party_roles`** — `party_id`, `role` (OPERATOR/CLIENT/VENDOR/AGENT/WALK_IN), and
  `operator_id`/`client_id`/`vendor_id` (each individually `UNIQUE`, so a given legacy row can
  belong to at most one Party — prevents the same Operator being grouped under two different
  identities). For OPERATOR/CLIENT/VENDOR, exactly one of those three must be set
  (`ValidationFailedError` → 422 otherwise); for AGENT/WALK_IN — genuinely new role types with no
  legacy table to point at — none of the three may be set, and the role's own sparse
  `credit_limit_minor_units`/`notes` columns hold what little data it has. A duplicate link
  attempt hits the DB unique constraint and is translated to a clean `ConflictError` → 409 (not a
  raw 500) — mirrors the exact `IntegrityError` → `ConflictError` pattern already established in
  `aircraft_service.create_aircraft`.
- **`persons`** — a reusable crew/pax reference record (`full_name`, `date_of_birth`,
  `nationality_iso3`, `role_hint` CREW/PAX/BOTH, contacts, passport number/expiry), optionally
  linked to a Party via nullable `party_id`. **Does not touch `TripLeg.persons`** — that JSON
  column stays exactly as it was, a point-in-time snapshot per leg (same snapshot-not-live-FK
  principle as Trip's aircraft fields, §4.4). `Person` is an optional CRM-style lookup an
  operator's repeat crew can be pre-registered in, not a replacement for the snapshot.
- **`documents`** + **`document_type_templates`** + **`credentials`** — a second, independent
  document subsystem alongside `aircraft_documents` (§4.2), **not a replacement for it** —
  AircraftDocument keeps its own table, service, router, and tests untouched. This one is
  polymorphic over `entity_type` (PERSON/PARTY) + `entity_id`, for the entity types that had
  nowhere to store documents before. `doc_type` is a real FK to
  `document_type_templates.doc_type` (not a free string) — four templates ship seeded
  (`PILOT_LICENSE`, `MEDICAL_CERTIFICATE`, `PASSPORT`, `OPERATOR_CERTIFICATE`), each with an
  `expected_fields` JSON schema (field key/label/type) driving what a verification screen would
  ask for. Seeded via `app/core/document_template_registry.py` +
  `document_template_service.ensure_seeded()` (mirrors `settings_service.ensure_seeded` exactly —
  idempotent, called at every startup and in the test `engine` fixture) — this is structural
  form-schema definition, not operational fact, so seeding it directly doesn't violate the
  never-fabricate-data rule the way a guessed fee or lead time would.
  **`ocr_raw_output`/`extracted_fields` are never populated by this build — no OCR vendor/API-key
  decision has been made.** A document just sits `PENDING_VERIFICATION` until a human confirms it
  via the `/verify` endpoint, exactly as if OCR had run and found nothing — same
  never-fabricate discipline as `NavFeeProvider`'s `NO_PROVIDER_CONFIGURED`. `Credential` is a
  child table off `Document` for license type ratings (one license, many ratings).
- **Fleet is unchanged** — the task's own spec framed Fleet as "attached to a Party's operator
  role," but per the additive decision, aircraft stay exactly where they are (`Aircraft.operator_id
  → operators.id`, §4.2) rather than moving under `party_roles`. A Party with an OPERATOR role can
  be traced to its fleet via `party_role.operator_id → operators.id → aircraft.operator_id`, a join
  rather than a schema change.
- **Storage key builder**: `app/core/storage.py::build_key` (aircraft documents' key builder,
  hardcodes an `"aircraft/..."` prefix) was left untouched; a new `build_entity_key()` was added
  alongside it for Person/Party documents rather than generalizing `build_key` in place — keeps
  existing aircraft document keys/tests unaffected by construction, not just by outcome.
- **Frontend UI landed in task #126 (§7.20)** — `/admin/persons`, `/admin/parties`, and a
  `DocumentsPanel` covering upload/list/download/delete/verify + OCR review + Credentials.
  Routers: `/parties`, `/party-roles`, `/persons`, `/documents/{entity_type}/{entity_id}/...`,
  `/document-type-templates`, `/credentials`.

### 4.7 Settings

`settings` — key/value store seeded additively from `app/core/settings_registry.py` at every app
startup (`ensure_seeded`, idempotent — adding a new `SettingDefinition` reaches an already-running
deployment on next restart without rerunning the importer). ~19 named settings today, covering
permit lead time fallback, ground notice, range reserve margin, passport validity buffer, document
expiry alert window, visa rule staleness, `allow_unverified_for_planning`, block speed, taxi
allowance, route sampling interval/min points, reroute corridor half-width/lane count, capability
tight-margin fraction, Viability IQ rate limit, quote TTL, nav fee margin percent, JTL service fee
(captcha TTL removed with the captcha feature, task #110).

### 4.8 Users & auth

- **`users`** — `email`, `password_hash`, `role` (`UserRole`: SUPER_ADMIN,
  OPERATIONS_SPECIALIST, AUDITOR, CLIENT_MODIFY, CLIENT_VIEW, FINANCE), `operator_scope`
  (NULL/"ALL"/specific — client-role users are scoped to one operator's own trips).
- JWT access tokens expire after 30 minutes; refresh flow implemented (see §7.2 —
  `fetchWithAuthRetry` in `lib/api.ts`).
- `canWrite(role)` → SUPER_ADMIN or OPERATIONS_SPECIALIST. `canDelete(role)` → SUPER_ADMIN only.
  These are UI-gating conveniences only (`lib/jwt.ts`); real enforcement is
  `require_write_access`/`require_delete_access` in `app/api/deps.py`.

### 4.9 Audit log

`audit_log` — `actor_user_id` (no FK, see §4.4), `actor_email`, `action`, `entity_type`,
`entity_id`, `from_value`/`to_value` (JSON), `reason`, timestamp. Written by every mutating
service call via `app/repositories/audit.py::write_audit_log`.

### 4.10 Migrations (chained, in order)

```
2bccf06f6bc7  initial_schema              — 18 reference-data tables
a1f3c9e7d2b4  route_cache
c7d4e1b9f6a3  trips                       — trips + trip_legs base tables
e2b8f4a1c6d9  trip_leg_constraints        — avoid/include states+firs
f3a9c2e8b5d1  trip_leg_service_assignments
b4d8e1a6c9f7  nav_fee_providers
c2f6a9d3e8b1  trip_leg_filed_route
d8a1f4b7c3e9  trip_leg_callsign_client_mtow
e5c2a8b4f1d6  trip_operator_airline_name
f7b3e9c2a5d8  trip_leg_snapshot_fields    — ops_type/flight_purpose/serial/colors, no-FK created_by/updated_by
a3d7e2f9b6c1  aircraft_fleet_and_documents — colors/nationality/default_callsign + aircraft_documents table
c9e4f7a2d5b8  permit_fee_providers        — CAA fee + nafisat reference data (§4.5, §5.6)
d1f6b3a9c7e2  parties_and_party_roles     — additive grouping layer over Operator/Client/Vendor (§4.6)
e7a4d2f8b1c6  persons                     — reusable crew/pax reference records (§4.6)
f4c8e1a6d3b9  documents_and_credentials   — polymorphic Person/Party documents + doc-type templates (§4.6)
a8e2c5f9b3d7  service_delivery_and_confirmation_routing — vendor_contacts + service_delivery_configs +
                                            confirmation_routing_configs (§4.11, §5.9, task #86)
b1d9f4e6a2c8  country_permit_validity     — countries.permit_validity_amount/unit + provenance (§4.12, task #95)
c3f8a1e5b9d2  trip_status_lifecycle       — Enquiry/Confirmed/Cancelled -> Lead/Active/Completed/Closed/
                                            Billed/Cancelled + trips.owner_team (§4.13, task #96)
d4e7b2f9c6a3  client_vendor_billing_ref   — clients.billing_ref + vendors.billing_ref, sequence-backed,
                                            backfilled (§4.3, task #97)
e6f3c9a2d5b7  service_messages            — comms log/thread behind a service assignment (§4.15, task #102)
f9d2b4e7a1c6  notifications               — lightweight admin-panel notification (§4.19, task #106)
```

**Known Alembic gotcha** (hit in `a3d7e2f9b6c1`): don't call `SomeEnum.create(bind,
checkfirst=True)` *and* reference that same `sa.Enum` object inside `op.create_table()` for a
brand-new table — `create_table`'s DDL compiler auto-emits `CREATE TYPE` for enum columns, so
calling `.create()` first causes `DuplicateObjectError`. Fix: let `create_table` handle creation;
keep the explicit `.drop()` in `downgrade()` since `drop_table` does not auto-drop the enum type.

**Related gotcha, opposite fix** (hit in `a8e2c5f9b3d7`): the rule above only holds when the enum
type is used by exactly *one* column in the migration. The moment the same enum needs to back a
second column — a plain `channel` field on one table and an `ARRAY(Enum(...))` column on
another — `create_table` would try to `CREATE TYPE` it twice and fail. There, do the opposite:
call `postgresql.ENUM(*values, name=...).create(bind, checkfirst=True)` once up front, then pass
`create_type=False` on every column-level `postgresql.ENUM(...)`/`ARRAY(postgresql.ENUM(...))`
reference after that. Same rule applies to `ARRAY(Enum(...))` columns generally — SQLAlchemy does
not auto-detect "I've already emitted CREATE TYPE for this name in this migration."

### 4.11 Multi-channel service delivery + confirmation routing (task #86)

Additive, standalone tables — nothing about `Operator`/`Client`/`Vendor`/`MessageTemplate` or their
existing `MessagingChannel`-typed columns changed. The four existing native Postgres enum types
backing those columns (`client_preferred_channel`, `message_template_channel`,
`operator_preferred_channel`, `vendor_preferred_channel`) stay exactly as they are — `ALTER TYPE`ing
any of them in place was judged riskier than a new, separate enum scoped only to these new tables.

- **`DeliveryChannel`** (new enum, `delivery_channel` in Postgres) — nine values: `EMAIL`, `PHONE`,
  `FAX`, `SMS`, `WHATSAPP`, `PORTAL`, `SITA`, `ARINC`, `AFTN`. A superset of the existing
  `MessagingChannel`, deliberately not unified with it (see above).
- **`vendor_contacts`** — a vendor's contact details per delivery channel (`vendor_id`, `channel`,
  `contact_value`, `contact_name`, `is_primary`, `notes`). A vendor can have several contacts on the
  same channel; `is_primary` picks the default.
- **`service_delivery_configs`** — how a service request gets sent to a vendor: `vendor_id`,
  `delivery_channels` (array — a request can go out on more than one channel simultaneously),
  optional `message_template_id`, optional `service_code` (FK `service_catalogue.code`; `NULL` =
  applies to every service at this scope). Scoped to **exactly one** of `leg_id`/`trip_id`/
  `operator_id` (enforced by a Pydantic `model_validator`, mirroring the `party_roles`
  exactly-one-link pattern from §4.6) — never more than one, never zero.
- **`confirmation_routing_configs`** — where a service confirmation gets routed once a vendor
  responds. Deliberately a separate table from `service_delivery_configs` (the user's spec called
  out "a separate confirmation message/delivery config" explicitly) — same scope shape
  (`leg_id`/`trip_id`/`operator_id`, exactly one), plus `target_role` (`CREW`/`DISPATCH`/`OTHER`)
  and `confirmation_channels` (array). `target_contact_override` is only meaningful for `OTHER` —
  CREW/DISPATCH are expected to resolve from the trip's own crew/operator contacts at send time,
  not stored here.
- **`Trip` has no `operator_id` FK** (§4.4 — only a snapshot string, `operator_airline_name`), so
  operator-scoped resolution can't be derived from a trip/leg alone. The resolve endpoints
  (`/service-delivery-configs/resolve`, `/confirmation-routing-configs/resolve`) accept
  `operator_id` as an explicit optional caller-supplied query parameter rather than inventing a
  derivation path the schema doesn't support.
- **No frontend UI yet** — same precedent as §4.5/§4.6: backend-CRUD-only for now. Routers:
  `/vendor-contacts`, `/service-delivery-configs` (+ `/resolve`), `/confirmation-routing-configs`
  (+ `/resolve`).

### 4.12 Permit validity — distinct from lead time (task #95)

The user drew an explicit line between two concepts that had been conflated: **lead time**
("leeway" — how far in advance a permit must be filed, backward from a leg's `reference_datetime`,
already `Country.standard_lead_time_hours` since task #77) and **validity** (how long a *granted*
permit stays good for once issued, forward from a `granted_at` instant, in hours/days/weeks/
months — not always hours, unlike lead time).

- **`countries.permit_validity_amount`** (`float | None`) + **`permit_validity_unit`**
  (`HOURS`/`DAYS`/`WEEKS`/`MONTHS` enum) + the standard provenance triple
  (`permit_validity_source`/`_verified_by`/`_verified_on`) — same verified-only-until-sourced
  discipline as lead time: null until an admin enters a real value, never guessed.
- **`resolve_effective_permit_validity()`** (`app/domain/reference_status.py`) mirrors
  `resolve_effective_lead_time_hours`/`EffectiveLeadTime` exactly — falls back to the named
  settings `default_permit_validity_amount`/`default_permit_validity_unit` (default `30 DAYS`)
  only when the country has neither value entered; a present-but-unverified value is used as-is.
- **`compute_valid_until(granted_at, amount, unit)`** (`app/domain/permits.py`) is the forward
  mirror of `compute_file_by` — `HOURS`/`DAYS`/`WEEKS` use fixed-duration `timedelta`, `MONTHS`
  uses `dateutil.relativedelta` (calendar arithmetic, not a fixed 30-day block — Jan 31 + 1 month
  correctly lands on Feb 28, which a `timedelta(days=30)` would get wrong). Fractional months are
  truncated to whole months (not meaningful otherwise).
- **This task only landed the schema + domain function.** The actual `granted_at` event — a
  `ServiceAssignment` transitioning to `CONFIRMED` — is wired up in task #101, §4.14.

### 4.13 Trip status lifecycle (task #96)

`TripStatus` was a 3-value `ENQUIRY`/`CONFIRMED`/`CANCELLED` enum with no real operational meaning
beyond "is this trip real yet" — replaced with a 6-value lifecycle: `LEAD → ACTIVE → COMPLETED →
CLOSED → BILLED`, plus `CANCELLED` as a terminal state reachable from `LEAD` or `ACTIVE` (user's
explicit choice — kept rather than dropped, since a real trip really can be cancelled at either
stage). Migration `c3f8a1e5b9d2` recreates the Postgres enum type (rename-old / create-new /
`CASE`-mapped column rewrite / drop-old, since Postgres can't remove enum values in place) and
data-migrates existing rows: `ENQUIRY→LEAD`, `CONFIRMED→ACTIVE`, `CANCELLED→CANCELLED` — verified
against live dev data after migration (6 LEAD / 3 ACTIVE / 2 CANCELLED, no stale values). The
downgrade path collapses `COMPLETED`/`CLOSED`/`BILLED` back to `CONFIRMED` as a best-effort inverse
— those three post-Active stages didn't exist before this migration.

- `Trip.owner_team` (new, free-text — no Team/User-group model exists to FK against, same
  snapshot-string pattern as `operator_airline_name`).
- Frontend: `TRIP_STATUSES`/`TripStatus` (`frontend/src/lib/types.ts`) is now the **single** source
  of truth, replacing two independently hardcoded `["ENQUIRY","CONFIRMED","CANCELLED"]` arrays
  (`admin/trips/page.tsx`, `admin/trips/[id]/page.tsx`). `StatusChip.tsx` extended:
  Active/Completed/Billed read as "ok" (green), Cancelled as "danger" (red); Lead/Closed fall
  through to the existing neutral default (no keyword match needed).
- Trips list (`/admin/trips`) columns rebuilt to the user's specified set — Trip / Registration /
  Start date / End date / Owner:Team / Source / Status — plus Legs/Verdict retained as
  lower-priority columns. `start_date`/`end_date` on `TripOut` are **computed**, not stored: first
  leg's `reference_datetime` / last leg's `arrival_datetime` by `leg_index`, computed in
  `trip_service._trip_out`.

### 4.14 ServiceAssignment status + validity (task #101)

Wires task #95's `compute_valid_until` to a real event. The `service_assignments` JSONB value
(§4.4) gained four fields: `status` (`PENDING → SENT → ACKNOWLEDGED → CONFIRMED`,
`ServiceAssignmentStatus` in `app/models/trip.py` — lives in JSONB like `ServiceProvider`, not a
real Postgres enum column), `confirmation_number` (typed by an admin, never fabricated),
`granted_at`/`valid_until` (both server-computed, never client-editable directly).

- **`granted_at` is set exactly once** — the first time `status` transitions to `CONFIRMED`.
  Re-saving an already-`CONFIRMED` assignment (e.g. editing `notes` while `status` stays
  `CONFIRMED`) must not reset it — `trip_service.update_service_assignment` checks
  `prior.get("granted_at")` before touching it. Covered by
  `test_confirming_a_service_assignment_sets_granted_at_and_valid_until`'s second-PUT assertion.
- **`valid_until`** — `trip_service._compute_service_valid_until(session, icao, granted_at)`
  resolves the assignment's `icao` → `Airport.country_iso3` → `Country`, applies
  `resolve_effective_permit_validity` (§4.12's fallback pattern — a country with no
  `permit_validity_amount`/`unit` entered falls back to the named settings
  `default_permit_validity_amount`/`_unit`, still a real computed date, never `null` just because
  nothing was configured), then `compute_valid_until`. Returns `None` only if the airport/country
  itself can't be resolved at all.
- **Real regression caught and fixed before it shipped**: `PUT
  /trips/{id}/legs/{leg}/service-assignments/{code}/{icao}` fully replaces the assignment (always
  has, since task #76). The existing Services-tab provider dropdown
  (`admin/trips/[id]/page.tsx`) only ever sent `{provider, vendor_id, notes}` — once `status`
  became a real field with a `PENDING` default, every provider change would have silently reset
  `status` back to `PENDING` (while leaving `granted_at` alone, producing a confusing
  "`CONFIRMED`-looking `granted_at` but `PENDING` `status`" state). Fixed by round-tripping the
  row's current `status`/`confirmation_number` in that one call site — the real Services tab
  rebuild (status badges, send, batch actions) is task #105; this was the minimum fix to avoid
  shipping a data-loss regression in between.

### 4.15 ServiceMessage comms log (task #102)

**`service_messages`** — one row per message/note against a service-assignment line item, the
thread task #86's config layer and task #104's "format & send" write into. Keyed loosely by
`leg_id` (real FK, `ON DELETE CASCADE`) + `service_code` + `icao` — the exact same composite key
`TripLeg.service_assignments` already uses (§4.4/§4.14) — not a hard FK to an assignment row,
since an assignment is a JSONB dict entry, not its own table.

- `direction`: `OUTBOUND` (a formatted request actually sent, task #104) / `INBOUND` (a reply,
  IMAP-matched via task #103 or hand-entered) / `MANUAL_NOTE` (free-text status update with no
  channel — "permit will be ready in 72hrs" — the ops equivalent of a sticky note, not a sent
  message).
- `channel` reuses task #86's `DeliveryChannel` enum (the existing `delivery_channel` Postgres
  type — migration `e6f3c9a2d5b7` references it with `create_type=False` rather than creating a
  second one). `None` only for `MANUAL_NOTE` rows.
- `sent_by_user_id`/`sent_by_name` — no FK to `users.id`, matching `AuditLog.actor_user_id`'s
  established pattern.
- **List + Create + (soft) Delete only — deliberately no Update.** A comms log is closer to an
  audit trail than an editable record: you don't rewrite history, you add to it or retract a
  mistaken entry. This is a narrower surface than the plan's original "mirror
  `vendor_contact_service.py`'s CRUD pattern" wording — judged the right call once actually
  building it, since `vendor_contact_service` manages configuration rows (freely editable) while
  this manages a message thread (append-only by nature).
- Router: `/trips/{trip_id}/legs/{leg_id}/services/{service_code}/{icao}/messages` (prefix baked
  into the `APIRouter`, matching `aircraft_documents.py`'s nested-resource precedent). Every
  operation re-validates the leg actually belongs to the trip in the URL (`_get_leg_or_404`,
  mirroring `update_service_assignment`'s existing check) — `DELETE` additionally checks the
  message itself belongs to the exact `(leg_id, service_code, icao)` in the path before deleting,
  not just that the id exists somewhere.

### 4.16 SMTP send + IMAP poll (task #103)

`app/core/email_client.py::send_email()` — every outbound message this system sends (permit
requests, task #104; PNR delivery, task #106) goes through this one function. Uses `aiosmtplib`
against the already-declared-but-previously-unused `smtp_*` settings (`app/config.py`). Local
dev/test sends through **MailHog** (`docker-compose.yml`'s `mailhog` service, `profiles: ["dev"]`
— **not** started by a plain `docker compose up -d`, needs `--profile dev`), a fake SMTP server
with an HTTP API (`:18025`) for inspecting what was actually captured — `tests/integration/
test_email_client.py` sends a real message and asserts on MailHog's own API response, not just
that `aiosmtplib.send()` didn't raise.

- **Reference tag**: every outbound message tied to a specific service line item gets
  `[JTL-{trip_id}-{leg_id}-{service_code}-{icao}]` embedded in its subject
  (`build_reference_tag`/`parse_reference_tag`). Subject-tag matching, not In-Reply-To/References
  threading, because thread headers don't reliably survive every vendor mail client or CAA
  webmail's reply behavior — a bracketed tag usually does (the same trick most support-ticket
  systems use). **Note the tag includes `icao`, not just `service_code`** — a single leg's two
  stops (departure, arrival) can carry the *same* `service_code` (e.g. `GH` at both ends), so
  `service_code` alone doesn't uniquely identify a service line item within a leg; the plan's
  original tag format omitted `icao` and was corrected while actually building this.
- `app/services/email_poll_service.py::poll_inbox()` — synchronous `imapclient` (no mature async
  IMAP client exists; fine since this only ever runs inside its own Celery task/process, never
  sharing an event loop with anything that needs to stay responsive) against `imap_*` settings.
  **Empty `imap_host` → no-op, returns `0`** — same `NO_PROVIDER_CONFIGURED`-style honesty as
  every other optional integration in this system: MailHog has no IMAP server at all, so this
  can't be exercised against local dev mail until the user supplies a real mailbox's credentials.
  A matched reply is filed as an `INBOUND` `ServiceMessage` (task #102) and advances the
  assignment's `status` to `ACKNOWLEDGED` — **never backward** from `CONFIRMED` (a stray
  follow-up email after confirmation shouldn't undo it).
- **Celery Beat runs embedded in the `worker` container** (`command: [..., "worker", "-B", ...]`
  in `docker-compose.yml`), not a separate `beat` service — simplest option for this
  single-worker deployment; would need splitting into a dedicated `beat` service before ever
  running more than one worker replica (each embedded beat would independently fire the same
  schedule). `app/worker/celery_app.py`'s `beat_schedule` fires `worker.poll_email_inbox` every
  2 minutes (`app/worker/tasks.py`, imported at the bottom of `celery_app.py` — after `celery_app`
  exists, specifically to avoid a circular import with `tasks.py`'s own `from
  app.worker.celery_app import celery_app`). This is the **first real Celery task** in the
  codebase — `celery_app.py`'s own docstring previously said "no business tasks yet." Verified
  live: manually triggered via `.delay()` and separately observed firing on its own schedule in
  the worker logs, both returning `0` (correct no-op, no IMAP configured).

### 4.17 Format & send (task #104)

`app/services/service_message_service.py::send_service_request()` is what actually puts task
#86's dormant config/resolve layer to work — `resolve_service_delivery` picks the winning vendor
+ channels for a leg/service, and this function is the first thing that ever sends anything with
that answer. `send_service_requests_batch()` wraps it per-item for "select multiple permit
services on a leg and send them all out together" — **never all-or-nothing**: each item resolves
and sends independently, so a `SendServiceRequestOut` list can be a mix of `sent: true`/`false`
in one response.

- **Only `EMAIL` has a real transport.** A resolved config whose `delivery_channels` don't include
  `EMAIL` (e.g. `SITA`-only) reports a clear error (`"...don't include EMAIL — only email sending
  is implemented; dispatch manually."`) rather than silently pretending to send over a channel
  with nothing behind it — same never-fabricate discipline as everywhere else. The vendor's
  `VendorContact` row for `EMAIL` (preferring `is_primary`) supplies the actual address; no
  contact on file is also a reported error, not an exception.
- **Rendering**: `MessageTemplate.subject_line`/`body`/`footer_block` are rendered with Jinja2
  (`autoescape` off, per the model's own docstring — plain-text messages) against a context built
  from the leg/trip (`dep_icao`, `arr_icao`, `aircraft_icao_type`, `registration`, `reference_datetime`,
  `vendor_name`, etc.). No template configured → a plain, honest default subject/body, not an
  error — a service request can still go out without a bespoke template. `build_reference_tag`
  (task #103) is always appended to the subject if the template didn't already include it, so
  every outbound message stays matchable to an inbound reply regardless of what the template says.
- **A send attempt is logged either way.** Even a failed `aiosmtplib` call still writes an
  `OUTBOUND` `ServiceMessage` (task #102) with `[SEND FAILED: ...]` appended to the body — a
  failed attempt is a real event worth keeping in the thread, not silently dropped.
- Assignment `status` advances `PENDING → SENT` only on a *successful* send, and only from
  `PENDING` — resending to an already `ACKNOWLEDGED`/`CONFIRMED` assignment (a manual follow-up)
  doesn't regress its status backward, mirroring task #103's poll-side "never regress" rule.
- Router: `POST /trips/{trip_id}/legs/{leg_id}/services/send` (new `service_send.py`, body
  `{"items": [{"service_code", "icao"}, ...]}`) — deliberately a sibling of, not nested inside,
  the `/messages` sub-router from task #102 (different path shape: this one spans multiple
  services in one call, `/messages` is scoped to exactly one).
- **Verified against a real MailHog capture**, not just that the API returned `sent: true` —
  `tests/integration/test_service_send_api.py` sends for real, then queries MailHog's own HTTP API
  for the message and asserts on its actual `To`/`Subject`/`Body`, including one test that
  confirms Jinja2 template variables render correctly in a real captured email.
  **Gotcha hit while writing that test**: a long subject with no whitespace to fold on (the
  `[JTL-...]` tag is one unbroken token) gets RFC 2047 encoded-word wrapped
  (`=?utf-8?q?...?=`) by Python's default email policy even though every character is plain
  ASCII — real inbound replies are already handled correctly (`email_poll_service.
  _decode_header_value` decodes this), but a test asserting on MailHog's raw stored header needs
  to decode it the same way before substring-matching, or the match silently comes back empty.

### 4.18 Services tab rebuild + "add more sub-services" (task #105)

**A real discovery before building anything**: the plan called for "seeding" ground-handling
sub-service catalogue rows (Crew transport, Pax visa, GPU, Supervisor). Querying the live dev DB
first showed this was already unnecessary — the real production workbook import already ships 69
`service_catalogue` rows including 7 real `GH-*` sub-services (Cargo & Baggage, De-icing,
Hangarage, Lavatory, Lounge, Ramp, Crew & Pax Transport) plus standalone top-level `CRT`/`PXT`
("Crew transport"/"Pax transport") and `CRH`/`PXH` (hotels) — the user's example list was
illustrative, not a literal gap. No seed data was written; §9's Excel-first convention held.

**A real architectural finding, not a bug**: `service_requirements` (what `service_assignments`
is generated from) deliberately **excludes `GH` itself** (`permit_engine_service.py`:
`ServiceCatalogueEntry.code != GROUND_HANDLING_CODE`) — ground handling has its own separate
`ground_handling_orders` tracking, computed `PER_COUNTRY_PER_TRIP` (once per country visited, not
once per stop), because a real GH order is filed once per country, not duplicated per landing.
Merging `GH` into the per-leg-per-icao `service_assignments` model would have double-tracked the
same real-world request under two systems. Left this boundary alone — extending
status/messaging/send to `ground_handling_orders` itself (a genuinely different per-trip-per-
country shape) is a separate piece of work, not pulled into this pass.

**What "add more sub-services" became, given that constraint**: a generic capability to add any
*additional* catalogue entry (including `GH-*` sub-services, or anything else) as an extra
`service_assignments` line item on a leg/stop, beyond what the engine auto-generated —
`POST /trips/{trip_id}/legs/{leg_id}/services/custom` (`trip_service.add_custom_service_assignment`)
validates the code is real and the icao is actually this leg's departure or arrival, rejects a
duplicate of an auto-generated or already-added key (409), and stores it with `"manual": true` +
`"service_name"` (the catalogue name, captured at add-time so display never needs a second
lookup). `_service_assignments_out` now unions the engine-generated list with any `manual: true`
extras found by scanning `service_assignments` directly (the only way to find them — they're
never in `service_requirements`). `DELETE .../services/custom/{code}/{icao}` only allows removing
manually-added ones, never an auto-generated line.

**Real regression caught before shipping**: `update_service_assignment`'s existing PUT fully
replaces the assignment dict every time. Without carrying `manual`/`service_name` forward from
the prior value, the very first provider/status edit on a manually-added line would silently wipe
its `manual: true` flag — making it vanish from `_service_assignments_out`'s output on the next
read, since the union-scan only picks up entries still flagged `manual`. Fixed by explicitly
preserving both fields from `prior` on every update. Covered by
`test_updating_a_manual_entry_preserves_manual_flag_and_name`.

**Frontend** (`admin/trips/[id]/page.tsx`, new `ServiceAssignmentsSection`/`ServiceRow`/
`MessageThread` components): per line item — `StatusChip(status)`, resolved vendor/channel via a
live `GET /service-delivery-configs/resolve` call (task #86, finally rendered somewhere), the
existing provider dropdown, a "Format & send" button (task #104), a "Messages" toggle opening an
inline thread (list + a manual-note quick-add, task #102), and a checkbox feeding a per-leg
"Send selected (`n`)" batch button. An "Add sub-service" control lists every catalogue
`SUB-SERVICE` row (across all parents, not just `GH`) with a departure/arrival airport picker.
Service catalogue and vendor list are each fetched once at the page level (~69 and small-N rows)
and passed down as lookup maps, same pattern as `airports/page.tsx`'s country-name lookup (§7.10).

### 4.19 Notifications + PNR email on submission (task #106)

**⚠️ Pre-existing bug found during live verification, not caused by this task**: the public VIQ
"Get estimate" submit button (`app/page.tsx`) stayed disabled in a browser check even with every
field valid and the captcha answered correctly — confirmed at the React prop level
(`disabled === true`), reproduced from a fresh page load multiple times. `page.tsx` has not been
touched by any task in the #95–114 backlog through #106, so this predates this batch of work
entirely. Backend wiring for this task was verified independently instead (real MailHog-captured
email + real DB-verified `Notification` row via `POST /feasibility/request-quote` called
directly, bypassing the broken button) — all passing. **This needs fixing as part of task #110**
(removes the captcha entirely, which is one of `canSubmit`'s gating terms) **and #111** (rebuilds
this form's submit flow as a staged wizard) — both about to touch this exact code next.

**`notifications`** — deliberately minimal: `entity_type`/`entity_id` (so the admin UI can link
straight to the thing it's about), `kind`, `message`, `seen_at`. Written once, from exactly one
place today — `POST /feasibility/request-quote` (the public VIQ "request a quote" submission) —
right after the enquiry `Trip` is committed. **Polled, not pushed**: `AdminNav` runs a
`react-query` `refetchInterval: 30_000` against `GET /notifications?unseen=true&page_size=1`
(cheap — only `total` is read) and renders a 🔔 badge; clicking it opens `/admin/notifications`
(list + "Mark seen" per row + "Mark all as seen"). Same no-websocket/realtime-infra convention as
the rest of this build — a 30s-stale admin badge for a low-frequency signal was judged not worth
adding push infrastructure for.

- **PNR email reuses task #82's PDF renderer** (`pnr_pdf_service.render_pnr_pdf`) and task #103's
  `send_email` — the same function `GET /trips/{id}/pnr.pdf` already used for the authenticated
  download now also fires automatically to `trip.requested_by_email` right after a public enquiry
  is created, as an attachment.
- **Both the notification write and the PNR email are best-effort side effects of an
  already-committed trip**, each wrapped in its own `try/except` + `logger.exception` (this
  router's first use of Python's stdlib `logging` — no structured logging framework exists
  elsewhere in this codebase, and none was worth introducing for one call site). A transient SMTP
  hiccup or a notification-write failure must never turn an already-successful enquiry submission
  into a 500 for the public submitter — the trip itself is the thing that matters, not its
  side effects.
- **Verified for real**, not just a 200 response: `test_writes_a_notification_and_emails_the_pnr`
  submits a real request-quote call, queries the DB directly for the `Notification` row, and
  queries MailHog's own API for a captured message to the exact contact email used — same
  real-capture discipline as every other email-sending test since task #103.

### 4.20 Person role vocabulary expansion (task #107)

`PersonPublicIn.role` (the field that actually governs "adding persons to a trip" — used by both
the public VIQ form and the internal trip-creation path; **not** the separate `PersonRoleHint` CRM
lookup on the standalone `Person` table, which is a different, correctly-scoped-as-is concept and
was left untouched) widened from a 2-value `^(CREW|PAX)$` pattern to
`^(PIC|FO|FA|MECHANIC|ENGINEER|CREW|PAX|VIP|PRINCIPAL|OTHER)$`. `CREW`/`PAX` remain valid — they're
still what quick/legacy entries and any already-stored `TripLeg.persons` JSONB rows use. No
migration needed: `role` was already free-text (a Pydantic regex, not a Postgres enum) both in the
schema and in the JSONB storage it flows into.

- **The real design problem wasn't the vocabulary, it was the counting logic.**
  `credentials_engine_service.compute_leg_credentials` computed `crew_count`/`pax_count` for
  souls-on-board via exact string equality (`p.role == "CREW"`), which would have silently stopped
  counting a `"PIC"` person as crew the moment the vocabulary widened. Fixed by adding
  `CREW_ROLES`/`PAX_ROLES` frozensets + `is_crew_role()`/`is_pax_role()` to
  `app/domain/credentials.py` and switching the two `sum(...)` calls to use them.
- **Bucketing**: `PIC/FO/FA/MECHANIC/ENGINEER` (+ generic `CREW`) → crew;
  `PAX/VIP/PRINCIPAL` (+ generic `PAX`) → pax. **`OTHER` buckets as pax**, not crew — an
  unclassified person is operationally closer to "someone occupying a seat" than to a certified
  crew position, matching this codebase's existing pattern of erring toward the stricter/safer
  interpretation when data is ambiguous (same instinct as the `NO_PROVIDER_CONFIGURED`/honest-error
  framing used everywhere else).
- Frontend: `PersonsEditor.tsx`'s role `<select>` (shared by the public VIQ form and the admin trip
  flow — single component, no duplication) now renders two `<optgroup>`s, Crew and Passengers, all
  10 values; `frontend/src/lib/types.ts`'s `PersonRole` union widened to match. Both
  `PersonVisaResult`/`PersonPublicInput` render sites (`FeasibilityResultsCard.tsx`,
  `admin/trips/[id]/page.tsx`) just print `p.role` as text with no branching, so they needed no
  changes.
- **Verified live**: DOM inspection of the rendered `<select>` on the public VIQ page confirmed all
  10 options across both optgroups with correct `value` attributes and `PAX` as the default
  selection (matching `addPerson()`'s `{ role: "PAX", ... }`). New unit tests
  (`TestRoleBucketing` in `tests/unit/domain/test_credentials.py`) cover all 10 values bucketing
  correctly; new integration test
  (`test_specific_role_vocabulary_buckets_into_crew_and_pax_for_souls_on_board`) submits a real
  `/feasibility/check` with `PIC/FA/VIP/PRINCIPAL` persons and asserts
  `souls_on_board_total == 4` end to end, not just at the domain-function level. Test count → 292.
- **Gotcha hit mid-task**: `api-test` builds from its own Dockerfile `target: test` — rebuilding
  `api`/`web` does **not** rebuild it. Running the suite against a stale `api-test` image silently
  ran the *old* test files (287 passed, no failures, looked clean) even though the new test file
  had 4 more tests on disk. Always `docker compose build api-test` (or `docker compose build` with
  no service name) alongside `api`/`web` before trusting a "all green" test run after any backend
  change — a stale image doesn't error, it just quietly doesn't run your new tests.

---

### 4.21 Document auto-attach on permit application (task #108)

**Reality check before building**: the plan called for matching `CountryRequirement.required_documents`
against "the trip's linked Person/Party documents." Investigation found `required_documents` is
free text from the source workbook's `documents_required` column and, as of this build, is empty
on both real rows in the live `country_requirements` table (only 2 rows exist at all —
`request_type` values `"SECURITY"` and `"GROUND HANDLING"`) — matching this codebase's established
pattern of thin real data behind an honestly-built mechanism (visa matrix, permit validity). More
importantly, `TripLeg.persons` (a role+nationality snapshot, see §4.20) has **no FK back to a real
`Person` row** — no name, no `person_id` pointing at `persons`. There is no reliable way to know
which uploaded crew document belongs to which person on a given trip, so **person/crew documents
(PILOT_LICENSE, MEDICAL_CERTIFICATE, PASSPORT) are deliberately out of scope** — matching by name
would be a guess presented as a fact, which this build never does.

**What's actually real and FK-backed**, so what got built:
- **Party documents**: `TripLeg.client_id -> Client -> PartyRole.client_id -> Party ->
  Document(entity_type=PARTY)`, filtered to `VERIFIED` status. Only one seeded PARTY template
  exists today (`OPERATOR_CERTIFICATE`, i.e. the AOC — see
  `app.core.document_template_registry`), so this is thin but genuine.
- **Aircraft documents**: `Trip.aircraft_registration` / `TripLeg.registration`, matched
  case-insensitively against `Aircraft.registration` -> its `AircraftDocument` rows
  (`REGISTRATION`/`COFA`/`INSURANCE`/`AIRWORTHINESS`/`NOISE_CERTIFICATE`) — the standard set of
  documents a country's authority actually asks for on a permit application.
- `app/domain/document_requirements.py` (pure): `match_document_type()` keyword-matches a
  free-text requirement string ("Certificate of Airworthiness (COFA)") against the small fixed
  vocabulary above (longest keyword wins, so "certificate of airworthiness" resolves to `COFA`
  before the shorter "airworthiness" substring can misfire to `AIRWORTHINESS`).
  `resolve_required_documents()` returns one of four honest outcomes per requirement —
  `ATTACHED` / `EXPIRED` / `MISSING` / `UNMATCHED` (a requirement string that doesn't map to any
  known type at all, surfaced rather than silently ignored) — never silently treats a document as
  present when it isn't.
- `app/services/document_attach_service.py`: `resolve_document_requirements()` unions
  `required_documents` across **every** `CountryRequirement` row on file for the stop's country
  (not filtered by `request_type` — that field doesn't map cleanly onto a service_code or a fixed
  taxonomy, and guessing a mapping would itself be a fabrication). `fetch_attachable_documents()`
  downloads bytes for every `ATTACHED` result via the existing `app.core.storage.download_file`.
- **Wired into #104's send flow**: `service_message_service.send_service_request` now resolves
  documents for the leg's `icao` before sending, passes `ATTACHED` ones as real email attachments,
  and returns non-`ATTACHED` results as `document_warnings: list[str]` on `SendServiceRequestResult`
  — sending still succeeds even with warnings (documents are a bonus, not a gate; nothing here
  blocks a send the way #101's channel/config checks do).
- **New read-only preview**: `GET /trips/{trip_id}/legs/{leg_id}/services/document-check?icao=...`
  — same resolution, no send, so the UI can show coverage before the admin clicks Format & send.
  Informational access level (any authenticated user), matching `/notifications`.

**Real bug found and fixed while building this** (same area, same class of correctness issue):
`permit_engine_service._ground_handling_lead_time_hours` compared `CountryRequirement.request_type`
against a `GROUND_HANDLING_REQUEST_TYPE = "GROUND_HANDLING"` constant with `==`. The real seeded
value is `"GROUND HANDLING"` (a space, not an underscore) — the lookup would have silently never
matched, always falling back to the global default even when a real per-country override existed.
Fixed with `app.domain.permits.normalize_request_type()` (strip/upper/space-and-hyphen-to-underscore)
applied to both sides. New regression test
(`test_ground_handling_lead_time_uses_country_requirement_override`) proves a real override with
the space-containing spelling now actually gets picked up. No test previously covered this path at
all — it was a silent bug with zero coverage until now.

- **Verified**: `tests/unit/domain/test_document_requirements.py` covers matching (keyword,
  case-insensitivity, longest-match precedence, unmatched) and resolution (attached/expired/
  missing, no-expiry-never-expires, boundary date). `tests/integration/test_document_attach.py`
  covers the full stack — a real `Aircraft`+`AircraftDocument` matches and gets reported
  `ATTACHED`; no matching aircraft reports `MISSING`; a country with no `CountryRequirement` rows
  returns `[]` (the real-world default today); a live `/send` call reports
  `document_warnings: ["MISSING: Insurance Certificate"]` when nothing's on file, without blocking
  the send. Test count → 309.

---

## 5. The planning engines

All engines are pure functions in `app/domain/*`, orchestrated by
`app/services/leg_feasibility_service.py::compute_leg_feasibility`. Full unit test coverage in
`tests/unit/domain/`.

### 5.1 Engine 1 — Great-circle routing (`great_circle.py`)

Computes great-circle distance/track between two ICAO airports, samples points along the route
(spacing controlled by `route_sample_interval_nm`/`route_sample_min_points`), and resolves which
countries/FIRs the track crosses via real PostGIS `ST_Contains` against the Natural Earth/VATSpy
polygons (`geo_repository.resolve_fir_hits`) — **never** a raster grid approximation. Also computes
`StateCrossing`/FIR crossings with `first_entry_nm` per state/FIR, which downstream code uses to
segment nav-fee distance and compute entry/exit times.

**Filed routes are never geometrically parsed.** A dispatcher's typed route string
(`"FAKN PKV UT915 VHA UL432 TUPIR B527 BJA L432 GAVDA GAVDA1B HRYR"`) is stored and displayed
as-is on permit paperwork (`TripLeg.filed_route`); overflown countries/FIRs are always derived
from the actual great-circle computation, never from parsing that string. This was an explicit
user clarification early in the FIQ redesign — the user considered and rejected geometric parsing
of filed routes.

**Avoid/include violations now produce a real alternate track, not just a distance delta (task
#121)**. Three real bugs the user caught on the live estimate/brief: avoided states/FIRs still
showed as crossed with no visual change; `required_missed` (an include constraint the route never
actually transits) was computed by the backend (`AvoidIncludeOut.required_missed`) but never
rendered anywhere in the frontend; and the map never changed at all when a constraint was
violated, because `RerouteResult` (`app/services/routing_engine_service.py::find_alternate_route`)
only ever carried `extra_distance_nm`/`extra_time_hours`/`extra_fuel_kg` — the A* search's own
`result.path` (real corridor-node coordinates) was computed and then discarded. Fixed by mapping
`result.path` through the corridor's `node_coords` into real `track_points`, plus a states/FIRs
list for the alternate path (batch-resolved once already, for blocking — just filtered/ordered by
path traversal, not requeried). `GET /feasibility/route-preview` now accepts optional
`avoid_states`/`include_states`/`avoid_firs`/`include_firs` query params (repeated-key list style,
not comma-split — no other GET endpoint in this codebase parses list query params, so this
establishes the pattern) and returns `avoid_include_violated` + a `reroute` block (found/
extra_distance_nm/extra_time_hours/track_points/states/firs) when violated. `RouteMap.tsx`'s
`tracks` prop now takes `{points, variant, label}` objects (`"primary" | "violated" | "alternate"`,
plain `[lat,lon][]` arrays still accepted for backward compat) — a violated direct track draws
dashed/danger, the real alternate draws solid/success, both visible on the same map.
`FeasibilityResultsCard.tsx` and the admin trip Permits tab both now render `required_missed`
alongside `avoided_transited`, gated on the list being non-empty rather than the parent
`.violated` flag (a route can violate purely on a missed include with nothing actually avoided).

**Real test-infra bug found while testing this**: `tests/integration/conftest.py`'s
`geo_region_base_lon` fixture (hands out a fresh non-overlapping longitude band to any test that
commits `CountryGeometry`, since committed geometry — unlike flushed-and-rolled-back geometry —
persists for the rest of the session) grew unboundedly (`30.0 + counter * 8.0`), and once enough
committing fixtures accumulated in one full-suite run it pushed past ±180°. Postgres stores those
raw coordinates as given, but `sample_great_circle_track`'s spherical bearing math (atan2-based)
always resolves into -180..180 — so a route's *sampled* points silently wrapped to the other side
of the world while the committed polygon they were supposed to cross stayed exactly where its raw
coordinate said, decoupling the two. Order-dependent (only surfaced in the full suite, never in
isolation), and pre-existing — not introduced by this task, just newly triggered by one more
committing fixture pushing the counter over the edge. Fixed by cycling the fixture through two
36-slot bands (`-168..-32`, `24..160`) instead of growing forever, with a 5°+ margin kept clear of
both ±180 and the `-15..15` band the suite's non-committing fixtures hardcode elsewhere.

**World map redesign (task #121, user's explicit choice — bundled world outline over a tile
provider)**: `RouteMap.tsx` was a from-scratch equirectangular SVG projection zoomed to the
route's own bounding box; now it's a fixed whole-world view (lon -180..180, lat -58..78 — cropped
clear of Antarctica/high Arctic, which nothing in this system's Africa/ME/Europe/India domain ever
touches) with every country's own real (heavily simplified, `ST_SimplifyPreserveTopology` at a
coarse world-scale tolerance) Natural Earth polygon as a background layer — no tile provider, no
API key, no fabricated coastline. New endpoint `GET /feasibility/world-outline`
(`geo_repository.fetch_world_outline`, `route_preview_service.get_world_outline`) — country
borders don't move, so the frontend caches it indefinitely (`staleTime`/`gcTime: Infinity`) and
the response sets `Cache-Control: public, max-age=86400`.

**Tests**: `tests/integration/test_routing_engine_service.py::TestFindAlternateRoute` extended to
assert the alternate track's real geometry (not just the distance number); new
`tests/integration/test_route_preview_api.py::TestRoutePreview::
test_avoided_state_returns_a_real_alternate_track` and `TestWorldOutline`. Full suite: 315 passing,
zero regressions — verified stable across two consecutive clean full-suite runs (the
`geo_region_base_lon` fix specifically needed re-verification since its failure mode was
order-dependent, not caught by a single run). Frontend (`next build`) compiles clean. Live-verified
through nginx post-rebuild: `GET /api/feasibility/world-outline` and `/api/feasibility/route-preview`
both 200 with real data. **Browser automation wasn't available in this environment** (Claude in
Chrome extension not connected, same limitation as §4.24/§7.17) — the map's visual rendering itself
was not checked in a live browser, only the endpoints, the TypeScript build, and the backend logic
under test.

**Avoid/include now actually reroutes permits/fees/capability, not just the map (task #124)**.
Real bug the user caught live: plotted a real leg, set avoid one country + include another, and the
returned permit list still had the avoided country's permit and was missing the included country's
— task #121 above only ever patched the *display* layer (the map's dashed/alternate track); the
underlying `compute_leg_feasibility` orchestration still fed permits/nav-fees/capability from the
original direct route unconditionally, computing `find_alternate_route` only afterward, purely to
report a distance delta nothing downstream ever consumed. Two compounding gaps, both fixed:

1. **`find_alternate_route` never honored `include_states`/`include_firs` at all** — its A* search
   only excluded avoided nodes; nothing rewarded or required passing through a required region.
   Rewritten (`app/services/routing_engine_service.py`) into a corridor-segment helper
   (`_corridor_segment_route`, generalized from airport-to-airport to arbitrary lat/lon so it can be
   chained) plus waypoint resolution: each included state/FIR gets one real point
   (`geo_repository.resolve_country_representative_point`/`..._fir_...`, `ST_PointOnSurface` — a
   real point verifiably inside the real polygon, not a fabricated "capital" guess), ordered by
   greedy nearest-neighbor from departure, and the route is chained dep -> waypoint(s) -> arr, each
   leg independently avoid-compliant. An include region with no resolvable geometry fails honestly
   (`found=False`) rather than silently dropping the constraint — repeating the bug one layer down
   would be worse than reporting it can't be satisfied. `RerouteResult.states`/`.firs` changed from
   flat lists to structured `StateEntry`/`FirEntry` (with `first_entry_index`) precisely so the
   result is `RoutePlan`-shaped and can fully replace the direct route below, not just annotate it.
2. **Nothing downstream ever used the alternate.** `leg_feasibility_service.compute_leg_feasibility`
   restructured: the direct route's own violation is checked (`check_avoid_include_violation`, the
   same domain function permits already used internally) *before* permits/capability/nav-fees run.
   **User's explicit choice**: auto-commit, not suggest-then-accept — the moment a viable alternate
   exists, it's swapped in as `route` itself (a synthetic `RoutePlan` built straight from the
   reroute's own states/firs/distance/sample_point_count), and every downstream computation
   (`route_states`/`route_firs`, `eet_hours`, `state_crossings`, permits, capability/tech-stops,
   nav fees, permit fees) naturally operates on it since they all read the same local `route`
   variable. `permits.avoid_include_violated` now correctly comes back `False` once a swap
   succeeds — verdict determination keeps a separate pre-swap `original_violated` flag specifically
   so `NOT_FEASIBLE_AS_ROUTED` still fires (a leg that only works *because* it was auto-replanned
   shouldn't silently read as a plain `FEASIBLE`), while a leg with no viable alternate still
   correctly reports `NOT_FEASIBLE` off the unchanged direct route.
3. **User's second requirement, same session**: if the (now-longer, rerouted) distance exceeds the
   aircraft's practical range, the trip should still plot but suggest a reasonable tech stop — this
   already worked by construction once `capability_engine_service.compute_leg_capability` received
   the swapped `route.distance_nm`, but tech-stop candidates (`is_airport_of_entry` airports — the
   existing "capital/high-traffic" proxy, not a new one invented for this) could have included one
   inside the very state being avoided. `avoid_states` threaded into
   `compute_leg_capability`/`_fetch_tech_stop_candidates` to exclude those.

**Tests**: `test_routing_engine_service.py::TestFindAlternateRoute` — `include_states` forces a real
waypoint chain (state present in the result, avoided one absent, distance longer than direct); an
unresolvable `include_states` code fails honestly. New
`test_leg_feasibility_service.py::TestAvoidIncludeAutoReroute` — the exact reported scenario
end-to-end (avoided country's permit gone, included country's permit present, `avoid_include_violated`
now `False`, distance/EET reflect the real route, verdict `NOT_FEASIBLE_AS_ROUTED`, `reroute.found`
`True`); a no-viable-alternate case stays on the direct route and reports `NOT_FEASIBLE`. New
`test_capability_engine_service.py` — a tech-stop candidate inside an avoided state is excluded, a
safe one is still suggested. Full suite: 323 passing, stable across two consecutive clean runs.
Frontend `next build` clean — `FeasibilityResultsCard.tsx` and the admin Permits tab split the old
single warning block into two: a real warning (only when no alternate exists) and a new
non-warning info note ("route automatically adjusted... adds ~X NM") for the auto-committed case;
`RoutePreviewPanel.tsx`'s live-preview copy reworded from "the alternate route avoiding it adds..."
(optional-sounding) to "...will automatically use the alternate route instead" (factual, since it
now genuinely will be). Live-verified through nginx post-rebuild.

**Client-side search on the five admin list pages (task #122)**: Trips, Countries, Operators,
Fleet (aircraft-performance types), and Vendors all already fetch their full list in one call
(`page_size=500`/`200`) and render it through the shared `DataTable`; added a `SearchInput`
(`frontend/src/components/SearchInput.tsx`) plus a shared `matchesQuery(query, ...fields)`
case-insensitive substring helper (`frontend/src/lib/search.ts`) rather than a fifth ad-hoc filter
implementation. Filters client-side against the fields already on-screen or otherwise identifying
— Trips: id/registration/owner_team/source; Countries: iso3/name/region; Operators: name; Fleet:
icao_type/manufacturer/model_series; Vendors: name/billing_ref. No new endpoints — this is
filtering data already in memory, not a server-side search. Trips' existing status filter buttons
are untouched and compose with the new search box (both apply, search on top of whatever
status is selected). Frontend build verified clean; live-verified through nginx post-rebuild
(`GET /countries` 200).

### 5.2 Engine 2 — Permit ladder (`permits.py`)

For each crossed country: overflight/landing permit requirements, deadlines
(`file_by` = entry time − effective lead time, with `lead_time_is_fallback` flagged when no
verified per-country value exists), ground handling order requirements, service requirements
(from `service_catalogue`). Also computes avoid/include violations against a leg's
`avoid_states`/`include_states`/`avoid_firs`/`include_firs` constraints.

### 5.3 Engine 3 — Capability/range (`capability.py`)

Compares aircraft practical range (max range minus `range_reserve_margin`) against actual route
distance; flags `exceeds`, computes `margin_nm` and `margin_tight` (below
`capability_tight_margin_fraction`); suggests tech stops when range is exceeded.

### 5.4 Engine 4 — Credentials/visa (`credentials.py` + `visa_resolution.py`)

Per-person (crew/pax) visa requirement resolution against the visa matrix, with a documented
resolution-layer chain (`visa_answered_by_layer`) since the matrix ships mostly empty by design
(1 of 24,708 cells answered in the shipped workbook — an honest reflection of real data
availability, not a bug). Also flags `souls_on_board_exceeds_max_pax`.

### 5.5 Nav fees (`nav_fees.py` + `services/nav_fee_service.py`)

Reused formula math from an earlier prototype (`_navfees/` — now fully absorbed into this system,
prototype code not used directly): `FeeFormula` enum (FLAT_RATE/MTOW_ONLY/DISTANCE_ONLY/
MTOW_DISTANCE/DISTANCE_WEIGHT), per-component calculation, the 50km land-phase deduction rule, VAT
application, min/max bounds. For each FIR crossed (using the same `first_entry_nm` segmentation as
§5.1), looks up a `NavFeeProvider` row; **no row → `NO_PROVIDER_CONFIGURED`, `fee_usd: null`**
(see §3, §4.5 — this is the exact place the $2000-vs-$280 Tanzania incident happened and was
fixed).

Two distinct projections of the same computation, by design (explicit user scope decision):
- **Public Viability IQ**: `NavFeesSummary` — `fully_priced`, `subtotal_usd`, `margin_percent`,
  `margin_usd`, `total_usd`. **Total only, no per-FIR/provider breakdown** — "no cost or vendor
  data" is a hard public-facing constraint.
- **Trip Manager (authenticated)**: `NavFeesDetail` — adds `items: NavFeeLineItem[]` (per-FIR
  provider/formula/distance/fee/status/currency breakdown), the client-shareable itemized quote.

### 5.6 CAA permit fees + nafisat (task #83, `app/services/permit_fee_service.py`)

A second, separate cost dimension from nav fees above — the original FIQ spec's OUTPUT-1 cost
table showed CAA permit-filing fees and "nafisat" (a specific AFI-region fee system that only
applies to some countries) as distinct line items alongside nav fees and a flat JTL service fee.
Reuses the exact same formula machinery as nav fees (`app.domain.nav_fees.calculate_provider_fee`
— same `FeeFormula` enum, min/max bounds, VAT) but keyed by **(country, permit type)** rather than
FIR, since CAA/nafisat fees are billed per permit line item (one per overflight/landing/
ground-handling permit per country), not per FIR-crossing distance. `PermitFeeProvider`
(`permit_fee_providers` table) carries a `fee_category` column (`CAA_FEE` / `NAFISAT`) so both
categories share one table/CRUD/service rather than duplicating the machinery twice — only the tag
(and which countries have a row) differs. Same provenance discipline as everywhere else: no row →
`NO_PROVIDER_CONFIGURED`, never a guessed number. The flat JTL fee is a named setting
(`jtl_service_fee_usd`, defaults to `0` until an admin sets a real value) added per line item.

**Deliberately not merged with nav fees into one number.** `FirBoundary` carries no `country_iso3`
column, so there's no clean FIR-to-country join in this data model — rather than fabricate one, nav
fees stay FIR-keyed and permit fees stay country/permit-type-keyed as two independently-gated
totals (`LegResult.nav_fees.total_usd` + `LegResult.permit_fees.total_usd`). A leg's full
operational cost is the sum of both when both are `fully_priced`; the frontend sums them for
display rather than the backend fabricating a merged figure.

Same public/Trip-Manager split as nav fees: `PermitFeesSummary` (total only, on the public
Viability IQ door — `LegResult.permit_fees`) vs. `PermitFeesDetail` (itemized per line item, on
`TripLegDetail.permit_fees`, Trip-Manager-only). No dedicated admin UI for managing
`PermitFeeProvider` rows yet — same as `NavFeeProvider`, it's backend-CRUD-only for now
(`/permit-fee-providers`), reachable via the API/docs or a future Excel loader.

### 5.7 Verdict reasons (task #79)

`LegResultOut.reasons: list[str]` — plain-English sentences explaining *why* `verdict` landed where
it did, built by `_build_verdict_reasons()` in `app/services/leg_projection.py` and shared by both
the public Viability IQ result card and Trip Manager's Route tab (same projection function, same
list). Deliberately mirrors the exact precedence `app/domain/permits.py::determine_feasibility_verdict`
uses — capability shortfall (with/without a tech-stop fix), avoid/include conflicts (with/without a
viable reroute), then urgent permit/ground-handling deadlines — so the reasons can never drift out
of sync with the verdict word itself. Never empty: a clean `FEASIBLE` leg gets one affirmative "no
issues" reason rather than an empty list. This *is* exposed on the public path (unlike nav fee
detail, §5.5) — explaining why a leg isn't feasible is core value of the free public tool, not
cost/vendor data.

### 5.8 Arrival-driven timing

A leg's `LegCheckIn` schema accepts **exactly one** of `reference_datetime` (departure) or
`required_arrival_datetime` — enforced by a Pydantic `model_validator`. Whichever is *not* given is
back-calculated from route EET once it's known. `LegFeasibilityResult.reference_datetime` is
always populated with the resolved departure instant regardless of which one drove the plan.

Separately, `TripLeg.arrival_datetime` is a genuinely stored, independently editable column
(`arrival_datetime_override` in the API) — crew may want to adjust the displayed arrival for their
own planning reasons. **This is cosmetic only.** All downstream computation (permits, deadlines,
nav fees) is keyed strictly off the engine's own `reference_datetime + eet_hours`, never off the
override. This dual nature (stored+editable display value vs. engine-computed truth) is documented
at every code touch point — don't collapse them into one field.

### 5.9 Service delivery / confirmation routing resolution (`app/domain/service_delivery.py`, task #86)

A pure scope-precedence resolver, same shape as every other domain module in this build (no
FastAPI/SQLAlchemy imports, dataclass inputs, unit-tested without a database —
`tests/unit/domain/test_service_delivery.py`). Two entry points, `resolve_service_delivery_config`
and `resolve_confirmation_routing_config`, both ranking candidates by `_scope_rank` (0 = leg, 1 =
trip, 2 = operator — a `ValueError` if a candidate is scoped to none of the three, since every row
in §4.11's tables must satisfy the exactly-one-scope constraint before it ever reaches this
function).

- **Precedence is leg > trip > operator**, exactly as specified by the user: a config scoped to the
  specific leg being planned always wins over one scoped to the whole trip, which always wins over
  one scoped to the whole operator.
- For service delivery specifically, **scope beats service-code specificity** — a leg-wide wildcard
  config (`service_code=NULL`, applies to every service) still beats an operator-wide config that
  names the exact service being requested. Only *within* the same scope does an exact
  `service_code` match beat a wildcard. A row for a different, specific service never applies
  regardless of scope.
- `app/services/service_delivery_service.py` is the DB-facing half: `resolve_service_delivery` /
  `resolve_confirmation_routing` load the leg (404 if unknown), derive its `trip_id`, fetch every
  `ServiceDeliveryConfig`/`ConfirmationRoutingConfig` row matching that `leg_id`, that `trip_id`, or
  the caller-supplied `operator_id` (§4.11's caveat — `Trip` has no real `operator_id` FK to derive
  this from), and hand the candidates to the pure resolver above. Returns `config: null,
  matched_scope: null` when nothing matches — never a guessed default, same discipline as
  `NO_PROVIDER_CONFIGURED` elsewhere in this build.

---

## 6. API surface

Routers registered in `app/main.py` (see file for exact order — `aircraft-lookup` must be
registered before `/trips/{trip_id}` for correct path matching):

| Router | Prefix | Purpose |
|---|---|---|
| `health` | — | liveness |
| `auth` | `/auth` | login, refresh |
| `users` | `/users` | user CRUD (admin) |
| `settings` | `/settings` | named settings CRUD (SUPER_ADMIN) |
| `readiness` | `/readiness` | pilot-exit gates, data readiness report |
| `countries` | `/countries` | reference CRUD |
| `airports` | `/airports` | reference CRUD |
| `operators` | `/operators` | operator CRUD |
| `aircraft` | `/aircraft`, `/aircraft-performance` | fleet + performance-type CRUD |
| `aircraft_documents` | `/aircraft/{id}/documents` | upload/list/download/delete |
| `aircraft_document_types` | `/aircraft-document-types` | admin-editable doc-type reference (§4.25, task #118) |
| `person_roles` | `/person-roles` | admin-editable crew/pax role reference (§4.27, task #120) |
| `clients` | `/clients` | bill-to entity CRUD |
| `vendors` | `/vendors` | vendor CRUD |
| `service_catalogue` | `/service-catalogue` | service reference |
| `visa_rules` | `/visa-rules` | visa matrix |
| `message_templates` | `/message-templates` | messaging templates |
| `country_requirements` | `/country-requirements` | per-country requirement records |
| `nav_fee_providers` | `/nav-fee-providers` | nav fee rate CRUD (admin) |
| `permit_fee_providers` | `/permit-fee-providers` | CAA fee + nafisat rate CRUD (admin) |
| `data_import` | `/admin/import` | Excel import/export (§8) |
| `feasibility` | `/feasibility` | **public** Viability IQ endpoints (rate-limited; captcha removed, task #110) |
| `trips` | `/trips` | Trip Manager CRUD, leg add/update, aircraft-lookup, service assignments (+ `/services/custom` add/remove a manually-added line item, §4.18, task #105), `/pnr.pdf` (§7.11) |
| `parties` | `/parties`, `/party-roles` | Party+PartyRole grouping layer CRUD (§4.6, task #89) |
| `persons` | `/persons` | reusable crew/pax reference record CRUD (§4.6) |
| `documents` | `/documents/{entity_type}/{entity_id}/...`, `/document-type-templates` | polymorphic Person/Party document upload/list/download/verify/delete (§4.6) |
| `credentials` | `/credentials` | license type-rating child rows off a Document (§4.6) |
| `vendor_contacts` | `/vendor-contacts` | per-channel vendor contact CRUD (§4.11, task #86) |
| `service_delivery_configs` | `/service-delivery-configs` (+ `/resolve`) | how a service request gets sent to a vendor, leg>trip>operator scoped (§4.11, §5.9) |
| `confirmation_routing_configs` | `/confirmation-routing-configs` (+ `/resolve`) | where a service confirmation gets routed, leg>trip>operator scoped (§4.11, §5.9) |
| `service_messages` | `/trips/{trip_id}/legs/{leg_id}/services/{service_code}/{icao}/messages` | comms log/thread behind a service assignment — list/create/delete, no update (§4.15, task #102) |
| `service_send` | `/trips/{trip_id}/legs/{leg_id}/services/send` (+ `/document-check`) | format & send one or many service requests via email with auto-attached documents, batch never all-or-nothing (§4.17 task #104, §4.21 task #108) |
| `notifications` | `/notifications` (+ `/{id}/seen`, `/mark-all-seen`) | lightweight admin-panel notifications, polled not pushed (§4.19, task #106) |

Key `feasibility` endpoints: `POST /feasibility/check` (the public VIQ check),
`GET /feasibility/route-preview`, `GET /feasibility/airports`, `GET /feasibility/countries`,
`GET /feasibility/firs`, `GET /feasibility/person-roles` (public mirror of the admin `/person-roles`
list, rate-limited, no auth — §4.27, task #120).

Key `trips` endpoints: `POST /trips` (create, from either public VIQ hand-off or admin new-trip),
`GET/PATCH /trips/{id}`, `POST /trips/{id}/legs`, `PATCH /trips/{id}/legs/{leg_id}`,
`GET /trips/aircraft-lookup?registration=X` (**admin-only** — returns `AircraftLookupOut` with
operator name + client list; deliberately never exposed publicly, since it would let anyone type a
tail number and learn who operates it and their billing entities),
`PUT /trips/{id}/legs/{leg_id}/service-assignments/{code}/{icao}`.

### 4.22 Captcha removal (task #110)

Removed entirely — `app/core/captcha.py`, `CaptchaChallengeOut` schema,
`captcha_challenge_id`/`captcha_answer` from `FeasibilityCheckIn`, the `GET
/feasibility/captcha-challenge` endpoint, the `verify_challenge` 400-raise in `POST
/feasibility/check`, the `captcha_challenge_ttl_seconds` setting, `CaptchaChallenge.tsx`, and every
captcha field/state in `page.tsx`. The `check`/`lookup`/`quote` rate-limit buckets are the surviving
abuse-prevention layer — public endpoints stay rate-limited, just not captcha-gated. 8 captcha-only
unit tests deleted with the module; `test_feasibility_api.py`'s `_check_payload`/every test rewritten
to drop the two now-nonexistent fields. Test count → 299 (309 − 10: 8 deleted `test_captcha.py` tests
+ 2 now-meaningless "wrong/malformed captcha" tests removed from `test_feasibility_api.py`).

**Real bug found and fixed while verifying this, unrelated to captcha**: live browser verification
of the now-uncaptcha'd submit flow hit a full white-screen crash
(`RangeError: Invalid time value at Date.toISOString`) typing into `LegEditor.tsx`'s native
`datetime-local` input — both `applyDatetime()`'s `onChange` handler and the `enteredIso` render-time
calculation called `new Date(value).toISOString()` unguarded. The native input fires `onChange` with
partial/malformed values while a user is still typing each date/time segment (a completely normal
interaction, not an edge case), so this was a real, easily-reproducible crash blocking the entire
public VIQ page, not a hypothetical. Fixed with a `toIsoOrNull()` helper that checks
`Number.isNaN(d.getTime())` before ever calling `.toISOString()`, used in both spots. Confirmed fixed
via a clean before/after re-test in a browser session: the exact same input that previously
white-screened the app (verified via console `RangeError` + a rendered "Application error" page) now
produces zero console errors and a normal, if temporarily malformed-looking, date value that later
gets corrected — never an uncaught exception. This predates #110 entirely (confirmed `LegEditor.tsx`
was untouched by any task #95–109) — task #112 ("Compact date/time input for LegEditor") is the
right place for a proper redesign of this control; this fix only makes the existing one crash-proof.

**nginx gotcha extended (see §10.4)**: `nginx.conf` has a separate `web_upstream` with the exact same
IP-caching-at-startup behavior as `api_upstream` (confirmed by reading the config, not by hitting the
bug again) — recreating `web`, not just `api`, also needs `docker compose restart nginx`. Applied
proactively before live-verifying this task, continuing the standing habit from §4.18/§4.19.

### 4.23 OCR pipeline — Tesseract, CPU-only (task #109)

The one item left in the #95–114 backlog. Originally scoped against Baidu's `Unlimited-OCR` — a
GPU-oriented, multi-GB model needing its own isolated Docker service — and deliberately deferred
when host disk space hit ~5GB free (§9.2, prior text). Revisited with two new facts on the table:
disk space had recovered to ~16.4GB free (still checked, still tight — `docker image prune`
reclaimed 0B, since every image on the host besides `api-test`'s unique layer is actively in use by
a running container), and this host has **no NVIDIA GPU at all** (`nvidia-smi` not found), which
would have made the original GPU model unusable regardless of disk space. User's call: switch
engines rather than force a mismatched model onto this host — picked **Tesseract** over PaddleOCR's
CPU build specifically for its much smaller footprint.

- **Provider** (`app/core/ocr/tesseract_provider.py`): `extract_text_and_fields(content,
  content_type, doc_type) -> OcrResult | None`. PDFs render page 1 via PyMuPDF (`fitz`, pure pip
  wheel — no `poppler-utils` apt dependency); images load directly via PIL. `pytesseract.
  image_to_string` does the actual extraction; `TesseractNotFoundError`/`TesseractError` are caught
  and logged, never raised. **`extracted_fields` is an honestly-scoped heuristic, not a
  verification mechanism** — a label-proximity regex search against `DocumentTypeTemplate.
  expected_fields` (task #89, §4.6), skipping `list`-typed fields entirely as too unreliable to
  guess. Every failure mode (unsupported content type, undecodable file, missing binary) returns
  `None`, same `NO_PROVIDER_CONFIGURED`-style honesty as every other optional integration in this
  system — `verify_document`'s manual-only status flow (§4.6) is completely untouched; nothing here
  ever sets `status = VERIFIED`.
- **Dispatch**: `app/api/routers/documents.py::upload_document` fires `worker.run_document_ocr.
  delay(...)` right after its existing `session.commit()`, wrapped in the exact
  try/except-log-and-continue shape task #106 established in `feasibility.py::request_quote` — an
  OCR dispatch failure must never turn a successful upload into a 500.
- **`ocr_enabled` setting** (BOOLEAN, default `YES`, `app/core/settings_registry.py`) — an admin
  escape hatch to disable the pipeline without a redeploy, same role `allow_unverified_for_planning`
  plays elsewhere.
- **Real bug found and fixed while building this**: `app/database.py`'s module-level `engine`
  (`pool_pre_ping=True`, a normal pooled `AsyncAdaptedQueuePool`) is shared for the lifetime of
  whichever process imports it. Every Celery task wraps its async body in a bare `asyncio.run(...)`
  per invocation (`app/worker/tasks.py`) — each call gets a brand-new event loop, and a pooled
  asyncpg connection checked out under a *previous* call's now-closed loop doesn't fail cleanly:
  `pool_pre_ping`'s own validation ping raises a raw asyncio `RuntimeError: ... attached to a
  different loop` instead of the DBAPI-level error SQLAlchemy would otherwise discard-and-retry
  transparently. This was never caught before because `email_poll_service.poll_inbox()` (task #103)
  short-circuits before ever touching `AsyncSessionLocal` when `imap_host` is unset — the only path
  that would have exercised this has always been a no-op in every environment so far. Split into two
  functions to fix it and to make the pipeline directly testable: `ocr_service.run_document_ocr
  (session, document_id)` takes an injected session — the DI convention every *other* service module
  in this codebase already follows (`document_service`, `settings_service`, ...) — and
  `run_document_ocr_standalone(document_id: str)` is the thin Celery-task entry point that opens its
  own session and calls `engine.dispose()` in a `finally` block so no connection survives past the
  event loop that created it. Any future Celery task that opens `AsyncSessionLocal` more than once
  per worker process needs the same guard until this is addressed at the engine/worker-bootstrap
  level instead of per-task.
- **Tests**: `tests/unit/core/test_tesseract_provider.py` runs real Tesseract against synthetic
  in-memory images (no DB) — raw-text extraction, field-guessing near a label, `list`-typed fields
  never guessed, unsupported/corrupt input returns `None`. `tests/integration/test_document_ocr.py`
  calls the DI'd `run_document_ocr(session, ...)` directly against the test-scoped session/DB — the
  two no-op-path tests create their `Document` via `document_service` directly rather than the HTTP
  endpoint, deliberately bypassing the router's own `.delay()` dispatch (harmless either way, since
  `run_document_ocr_standalone` reads `DATABASE_URL`/the real dev DB, not `TEST_DATABASE_URL`, so it
  can never see test-only rows — but going straight through `document_service` keeps those two tests
  focused). Full suite: 308 passing (299 + 9 new), zero regressions.
- **Verified live, not just via tests**: real upload through the running stack
  (`POST /documents/PERSON/{id}`, a synthetic "Passport number P9988776" PNG) — `docker compose logs
  worker` showed `Task worker.run_document_ocr[...] succeeded in 1.6s: True`, and a follow-up `GET`
  showed `ocr_raw_output.text` containing the exact string, `extracted_fields.passport_number ==
  "P9988776"`, `status` still `PENDING_VERIFICATION`, `version` bumped from 1 to 2.
- **Dockerfile**: `tesseract-ocr` added to the `runtime` stage's existing apt line (alongside
  `libpq5 gdal-bin curl`) and as a new line in the `test` stage — deliberately does **not** touch the
  `builder` stage's `build-essential`/`libgdal-dev` layer (`pytesseract` is a pure-Python wheel
  needing no compilation), sidestepping the ~450-second gdal-reinstall cost §1 warns about. Default
  Debian `tesseract-ocr` ships English only; French/Arabic language packs weren't added preemptively
  — no evidence yet of which languages actually show up in real uploads, easy to add later.
- **No frontend UI** — same precedent as §4.5/§4.6/§4.11: backend pipeline only.
  `DocumentOut` already exposed `ocr_raw_output`/`extracted_fields`; an OCR-vs-entered verification
  screen was already flagged in `Document`'s own docstring as future work, not this task's scope.

### 4.24 Permit filing — overflight/landing permits become sendable (task #115)

Prompted by the user asking "how do I file permit requests?" — the honest answer until this task
was that you couldn't. The Permits tab had been a 100%-read-only deadline ladder since it was
built; the Services tab's full send/status/message-thread system (task #104) only ever generated
line items for `ServiceCategory.GROUND` catalogue codes — `OVF`/`LDG` (real seeded PERMIT-category
codes) never entered `service_requirements`, so they never became sendable `service_assignments`
entries.

- **`service_code` added to permit dicts** (`app/services/permit_engine_service.py`'s
  `OverflightPermit`/`LandingPermit` dataclasses, threaded through `app/schemas/feasibility.py`'s
  `OverflightPermitOut`/`LandingPermitOut` and `app/services/leg_projection.py`) — `"OVF"`/`"LDG"`
  respectively. Added as `str | None = None` on the Pydantic side specifically so an *old*
  `computed_snapshot` (frozen at leg-compute time, §10.2's forward-compatibility contract) still
  validates — a historical leg's permit entries just render without a send action, never a 500.
- **Country-keyed, not ICAO-keyed**: `TripLeg.service_assignments` (existing JSONB column, no
  migration) is keyed `"{service_code}:{icao}"` everywhere it's used — `update_service_assignment`,
  `send_service_request`, the `ServiceMessage` endpoints. None of them validate that second half
  against the `airports` table, so overflight/landing permits use the country's ISO3 there instead
  (an en-route country isn't an airport — there's no natural ICAO for an overflight permit at all).
  ICAO codes are always 4 letters and ISO3 codes are always 3, so every place needing to tell them
  apart (`trip_service._compute_service_valid_until`, `send_service_request`) does a simple,
  unambiguous `len() == 3` dispatch rather than adding a new parameter.
- **New `_permit_assignments_out`** (`app/services/trip_service.py`, mirrors
  `_service_assignments_out` exactly) derives a `permit_assignments` list per leg from
  `overflight_permits + landing_permits`, looked up against `service_assignments` the same way
  GROUND items are — same `PENDING` default, same `granted_at`/`valid_until`/`confirmation_number`
  fields (task #101's machinery, previously GROUND-only in practice, always category-agnostic in
  code). Kept as a genuinely separate list/schema (`PermitAssignmentOut`) from
  `ServiceAssignmentOut` rather than merged into it — permits carry `country_name`/entry/exit/
  deadline fields services don't, and the Services tab's existing GROUND-only `service_requirements`
  scan stays completely untouched, so nothing needed to change there at all.
- **`VendorCoverageCountry` fallback** (`app/services/service_delivery_service.py::
  resolve_service_delivery`, new optional `country_iso3` param) — this table (`vendor_id`,
  `country_iso3`, `has_caa_direct_account`) already existed, seeded via the importer, but was wired
  to nothing. An explicit `ServiceDeliveryConfig` (leg/trip/operator-scoped) is still always tried
  first and wins if present — an admin can override per-leg exactly like GROUND services already
  allow. Only when nothing explicit matches **and** a `country_iso3` was supplied does it fall back
  to the coverage table (preferring `has_caa_direct_account=True`). No coverage row either →
  `config: null`, same honest "nothing configured" result `send_service_request` already produced
  for GROUND — never a guessed recipient. `ServiceDeliveryResolvedOut` gained `fallback_vendor_id`
  (only set on this path, `matched_scope: "COUNTRY_COVERAGE"`) rather than fabricating a fake
  `ServiceDeliveryConfigOut` row (with a synthetic id/timestamps/`delivery_channels`) just to fit
  the existing shape — `send_service_request` branches on which one is present.
- **Frontend**: the Permits tab's read-only `<li>` list became `PermitRow` components
  (`admin/trips/[id]/page.tsx`) that adapt a `PermitAssignment` into a `ServiceAssignment`-shaped
  object and render the *existing* `ServiceRow` underneath a small deadline-ladder header — full
  reuse of the status chip, resolved-vendor display, "Format & send" button, and message thread,
  zero duplication of that logic. `ServiceRow` gained one small additive change: its
  `service-delivery-configs/resolve` call now always passes `country_iso3=assignment.icao`, which
  is a guaranteed no-op for every existing GROUND caller (a 4-letter ICAO can never match a
  `VendorCoverageCountry` row, always exactly 3 letters) and is exactly what a permit row needs. A
  new `showCheckbox` prop (default `true`) hides the batch-select checkbox for permit rows, since
  "Send selected" stays a Services-tab-only affordance.
- **Real bug caught by the test suite, not by inspection**: an existing `test_service_delivery_api.py`
  test asserted an exact-dict-equals response shape for the "nothing configured" resolve result —
  broke the moment `fallback_vendor_id` was added as a real (if usually-null) field. Fixed by
  updating the assertion, not the production code — the new field is correct and intentional, the
  test was just asserting a shape that predated it.
- **Verified live against the real dev DB**, not just tests: a real `OMDB → HECA` trip (Dubai to
  Cairo) produces exactly the overflight/landing permits you'd expect — `OVF` for Saudi Arabia and
  Jordan (en-route, correctly excluding departure/arrival states), `LDG` for Egypt. Created a real
  `Vendor` + `VendorContact` (EMAIL) + `VendorCoverageCountry` row for Saudi Arabia with no
  `ServiceDeliveryConfig` at all, resolved it (`matched_scope: "COUNTRY_COVERAGE"`), sent the `OVF`
  permit for real, and confirmed via MailHog's own API — subject `OVF request [JTL-...-OVF-SAU]` to
  `caa-live-test@example.com` — plus the assignment's status transitioning `PENDING → SENT` on a
  follow-up `GET`. Full backend suite: 313 passing (299 baseline + 9 OCR + 5 new permit tests), zero
  regressions. Frontend (`next build`) compiles clean. **Browser automation wasn't available in this
  environment** (Claude in Chrome extension not connected) — the Permits tab UI itself was not
  visually verified in a live browser, only its backend wiring end-to-end and the TypeScript build;
  flagging this explicitly rather than claiming a browser check that didn't happen.

### 4.25 Aircraft document taxonomy — 72-code admin-editable reference table (task #118)

Prompted by the user pasting a real 69-file (turned out to be 70 on disk) aircraft document folder
(`N80TE_DOCUMENTS`, organized by `AC `/`INS `/`LTR `/`PERMIT ` filename prefix) that dwarfed
`AircraftDocumentType`'s fixed 6-value Python enum (`REGISTRATION`/`COFA`/`INSURANCE`/
`AIRWORTHINESS`/`NOISE_CERTIFICATE`/`OTHER`, a native Postgres `ENUM` column).

- **New `aircraft_document_types` table** (`app/models/aircraft_document.py::
  AircraftDocumentTypeDefinition`) — `code` (unique `String(80)`), `label`, `category`
  (`AircraftDocumentCategory`: `AC`/`INS`/`LTR`/`PERMIT`), `sort_order`, `active`. Full admin CRUD
  router (`/aircraft-document-types`, `GET`/`POST`/`PATCH`, mirrors `service_catalogue`'s shape).
  `AircraftDocument.doc_type` changed from `Mapped[AircraftDocumentType]` (enum) to `Mapped[str]`
  with a real `ForeignKey("aircraft_document_types.code")`.
- **66 codes derived programmatically** from the real filenames (`AC_AIR_CARRIER_CERTIFICATE`,
  `INS_UNITED_ARAB_EMIRATES`, `LTR_LETTER_OF_ATTORNEY`, `PERMIT_BAHAMAS_BLANKET`, etc.) **plus the
  6 legacy enum values kept as-is** — 72 seeded rows total (`app/core/aircraft_document_type_registry.py`).
  Four filenames map to a *legacy* code instead of a derived one, specifically so no existing
  `AircraftDocument` row or `_KEYWORD_TO_TYPE` string-match (`app/domain/document_requirements.py`)
  breaks: `AC REGISTRATION CERTIFICATE.pdf` → `REGISTRATION`, `AC NOISE CERTIFICATE.pdf` →
  `NOISE_CERTIFICATE`, `AC AIRWORTHINESS CERTIFICATE.pdf` → `AIRWORTHINESS`,
  `INS CIVIL AIRCRAFT CERTIFICATE OF INSURANCE.pdf` → `INSURANCE`. `COFA` stays seeded but
  deliberately unused by any real file — same real-world certificate as `AIRWORTHINESS` under a
  different legacy name, a pre-existing quirk not touched here.
- **Enum→FK migration, seed-in-migration not seed-on-startup**: converting a live enum column
  (existing data) to a `ForeignKey` string means the 72 seed rows must be `bulk_insert`ed in the
  *same* migration, before the FK constraint is added — `ensure_seeded()` (app-startup) runs too
  late to satisfy the constraint for pre-existing rows. `ALTER COLUMN doc_type TYPE VARCHAR(80)
  USING doc_type::text`, then `fk_aircraft_documents_doc_type`, then drop the old Postgres enum
  type. This exact seed-in-migration pattern was reused as-is for §4.27's `person_role_definitions`.
- **Real bug caught by grep before running tests**: `document_attach_service.py`'s
  `_aircraft_documents` had `doc_type=d.doc_type.value` — crashed the instant `doc_type` became a
  plain string (`'str' object has no attribute 'value'`). Found by grepping for `AircraftDocumentType\b`
  across the whole backend before running anything, not by a failing test.
- **Validation moved from the type system to the service layer**: `doc_type: str` on the upload
  schema, with `aircraft_document_type_service.validate_active_code` (raises `ValidationFailedError`
  for an unknown/inactive code) called from `aircraft_document_service.upload_document` — same
  "validate against real DB rows, not a fixed Python type" pattern as §4.20's person-role work.
- **N80TE PDF import**: the real 70-file folder was uploaded for real (`POST
  /aircraft/{id}/documents`, multipart, real MinIO storage) against the `N80TE` aircraft
  (Sunset Aviation LLC dba Solairus Aviation) already present in the dev DB — a small one-off
  Python script (`httpx`, not part of the test suite) matched each filename to its seeded code via
  the identical prefix/slug derivation the registry itself uses, dry-run-verified (all 70 files
  matched a real seeded code, zero unmatched) before actually uploading. **70/70 uploaded**,
  confirmed via `SELECT count(*) FROM aircraft_documents WHERE aircraft_id = ...` and a real
  `GET .../download` round-trip (234 KB, valid PDF, not a stub) on the `AIRWORTHINESS` document.

### 4.26 Operator/Aircraft real-correspondence fields + category-aware message templates (task #119)

The user pasted three real Universal Weather-style reference messages (a handling-revision notice,
a handling request with `PENDING CONFIRMATION`/`CANCEL` sections, and a structured A–G overflight
permit request with attachments) and asked "Format & send" (task #104) to produce output in this
shape instead of the one generic one-line default it had used since #104 shipped.

- **New `Operator` fields** (`app/models/operator.py`): `address_line1/2`, `city`,
  `state_province`, `postal_code`, `country_iso3` (FK `countries.iso3`), `contact_fax`,
  `airline_code_aftn`, `airline_code_sita` — distinct from the pre-existing `icao_designator`/
  `iata_designator`, since a real permit request's AFTN/SITA reply-address prefix (`UVA (AFTN)
  UV (SITA/ARINC)` in the sample) is its own code, not an ICAO/IATA operator designator.
- **New `Aircraft.classification`** — free text (e.g. `"Private - Non Revenue"`), not an enum, per
  this codebase's existing convention for similar display-string fields (`NavFeeProvider.
  provider_name`).
- **`send_service_request` (`app/services/service_message_service.py`) rewritten**: looks up
  `ServiceCatalogueEntry.category` for the service code being sent and picks between two new
  renderer functions — `_default_handling_request` (GROUND: `ATTN`/`REF`/itinerary/`PENDING
  CONFIRMATION`) and `_default_permit_request` (PERMIT: the A–G structure — Operator/Registry/
  Classification/Itinerary/Route/Purpose/Crew, numbered attachments, CAA name + effective permit
  validity) — replacing the single hardcoded default. The per-scope `ServiceDeliveryConfig.
  message_template_id` override (task #86) is completely untouched; this only changes what
  `_render_template` falls back to when nothing's configured.
- **Snapshot design meant a fresh lookup, not a join**: `Trip`/`TripLeg` deliberately hold
  `aircraft_registration`/`operator_airline_name` as plain snapshot strings, never a live FK (by
  original design, for exact historical reproducibility — see §10.2). Producing a real operator
  address/AFTN/SITA block meant a new `_resolve_aircraft_and_operator` lookup (registration →
  `Aircraft` → `Operator`) inside `send_service_request` itself, not a join that doesn't exist.
- **Multi-leg same-country block, display-only by design**: the user's sample showed one message
  with `LEG1`/`LEG2` itinerary lines when the aircraft overflies/lands in the same country twice on
  one trip. Rather than restructuring the per-(leg, service_code, country) send/status-tracking
  model, `_other_legs_same_country` scans the trip's other legs' `computed_snapshot.permits` for the
  same country and renders them as extra `LEGn:` lines — but the send action itself still targets
  and advances only the one line item actually being sent (task #104's each-item-independent design
  untouched). Confirmed working **live**, not just in tests — see below.
- **Crew summary, never a fabricated name**: `_crew_summary` renders `"CAPTAIN <NAME> PLUS N CREW
  AND M PAX"` only when a named PIC is on file (from §4.27's new `PersonPublicIn.name`), otherwise
  falls back to a pure headcount (`"N CREW AND M PAX"`) — matches the sample's format without ever
  inventing a name that isn't real data.
- **Tests**: `test_service_send_api.py::test_default_template_is_handling_request_shape_for_ground_category`
  and `test_permit_send_api.py::test_default_template_is_structured_permit_request_shape` — both
  assert on real MailHog-captured bodies (section markers: `ATTN:`, `PENDING CONFIRMATION`,
  `A. OPERATOR:`, `D. ITINERARY:`, `G. CREW:`), not just the API response. The permit test needed a
  `_ensure_ldg_catalogue_entry` check-then-insert helper — `session` fixture rollback (conftest.py)
  only undoes *uncommitted* work between tests, so a second test in the same file committing the
  same `ServiceCatalogueEntry(code="LDG")` row hit a real `UniqueViolationError` against the first
  test's already-committed row, caught by rebuilding the `api-test` image and rerunning (see §10 —
  `docker compose run --rm api-test` silently reuses a stale image otherwise). Full suite: 313
  passing (311 baseline after §4.27's bucketing rewrite dropped 4 tests + 2 new).
- **Verified live against the real dev DB**: a real GROUND send (`FUL` at `HECA`) and a real PERMIT
  send (`OVF` at `SAU`) against two existing non-deleted trips, both captured by MailHog. The
  permit body's `D. ITINERARY:` section came back as a real `LEG1:` block (not the flat single-leg
  form) — this trip's other leg genuinely also transits Saudi airspace, so the multi-leg detection
  fired for real, not just in a constructed test fixture.

### 4.27 Person role reference table replaces the fixed CREW/PAX vocabulary (task #120)

Same message-sample request also asked for admin-configurable person roles ("crew (can be PIC, SIC,
FA, Mechanic, Engineer, Medical Staff, Other), Pax, VIP, Principal etc — allow adding more
categories in settings") — the old `PersonPublicIn.role` was a fixed Pydantic regex, and crew/pax
bucketing (souls-on-board counts feeding Engine 3's oxygen/credentials checks) was two hardcoded
`frozenset`s (`CREW_ROLES`/`PAX_ROLES` in `app/domain/credentials.py`).

- **New `person_role_definitions` table** (`app/models/person_role.py::PersonRoleDefinition`) —
  `code`, `label`, `is_crew: bool`, `sort_order`, `active`. 12 seeded rows: `PIC`/`SIC`/`FO`/`FA`/
  `MECHANIC`/`ENGINEER`/`MEDICAL_STAFF`/`CREW` (`is_crew=True`), `PAX`/`VIP`/`PRINCIPAL`/`OTHER`
  (`is_crew=False`) — `FO` kept alongside the requested `SIC` (same real position, different
  naming; JSONB-stored historical role strings can't be migrated, so neither name can be dropped).
  Admin CRUD router `/person-roles`; new **public**, rate-limited `/feasibility/person-roles` (no
  auth) for the same `PersonsEditor` component used on the unauthenticated VIQ form.
- **Bucketing became data-driven, fetched once per computation**: `app/domain/credentials.py` lost
  the frozensets/`is_crew_role`/`is_pax_role` functions entirely (kept that module free of
  role-vocabulary knowledge). `compute_leg_credentials` gained a `role_is_crew: dict[str, bool]`
  parameter; `leg_feasibility_service.compute_leg_feasibility` (the single shared entry point for
  both public and admin paths) fetches it once via `person_role_service.get_crew_bucket_map` —
  mirrors the existing `settings_map` fetch-once-thread-down pattern, not a DB query per person.
  `PersonPublicIn.role` lost its regex (now `Field(max_length=30)`); an unrecognized code raises
  `ValidationFailedError` from `leg_feasibility_service` instead of failing Pydantic validation.
- **Real auth-mismatch bug caught before finishing the frontend change**: the first
  `PersonsEditor.tsx` draft took a `roles` prop, expecting the parent page to fetch via the
  admin-authenticated `GET /person-roles` — but `PersonsEditor` is also used on the **public**,
  unauthenticated VIQ page, which would 401. Caught by checking whether `app/page.tsx` had any
  existing page-level query pattern to piggyback on (it didn't) and how the other public/admin
  shared component (`AircraftTypePicker`) handles this (self-fetches) — fixed by adding the public
  `/feasibility/person-roles` endpoint above and making `PersonsEditor` self-fetch via its own
  `useQuery`, matching `AircraftTypePicker`'s established pattern rather than page-level prop-drill.
  `PersonsEditor` also gained a `name` text input (optional — feeds §4.26's crew-summary naming).
- **Test count intentionally dropped by 4**: `test_credentials.py::TestRoleBucketing` (4 tests
  against the old fixed frozensets) was deleted, not left broken — bucketing correctness moved to
  service/API-layer tests instead, since the vocabulary itself is no longer fixed at the domain
  layer. Full suite went 315 → 311 from this alone (see §4.26 for where it went back up to 313).
- **Verified live**: `GET /person-roles` returns the real 12 seeded rows with correct `is_crew`
  bucketing; `GET /aircraft-document-types` returns the real 72 rows (§4.25); the public
  `/feasibility/person-roles` endpoint is reachable unauthenticated (confirmed rate-limited on
  repeated calls, as designed).

---

## 7. Frontend

Next.js 14 App Router, `frontend/src/`.

### 7.1 Routes

| Route | Purpose |
|---|---|
| `/` | Public **Viability IQ** (VIQ) — landing page + form |
| `/login` | Staff sign-in |
| `/admin` | Admin dashboard |
| `/admin/trips`, `/admin/trips/new`, `/admin/trips/[id]` | Trip Manager |
| `/admin/data` | Excel import/export UI |
| `/operators`, `/operators/[id]` | Operator list + detail (fleet + document manager, task #76) |
| `/countries`, `/countries/[iso3]` | Country list (read-only) + detail (all fields editable, incl. permit validity — task #100) |
| `/airports`, `/airports/[icao]` | Airport list (read-only) + detail (IATA/City/Country/lat/lon editable — task #100) |
| `/aircraft`, `/aircraft/[icaoType]` | Aircraft-type list (read-only) + detail (manufacturer/model/range/verified editable — task #100) |
| `/vendors`, `/vendors/[id]` | Vendor list (Capability status still inline-editable) + detail (task #100) |

### 7.2 `lib/`

- **`api.ts`** — `api.get/post/patch/put/del/upload/download`. `fetchWithAuthRetry` auto-refreshes
  the access token on a 401 (shared in-flight promise so concurrent 401s don't each fire their own
  refresh), retries once, redirects to `/login` on failure. `requestUpload` sends `FormData`
  without forcing `Content-Type` (browser sets the multipart boundary). `requestDownload` returns
  a `Blob` for client-side `<a download>` triggering.
- **`types.ts`** — the full TS mirror of every Pydantic schema that crosses the wire.
- **`format.ts`** — `formatUtc()` (`"13-Aug-2026 12:30Z"`, matches how flight ops actually files
  times) + `formatUtcDate()` (date-only variant, no time/`Z`, for calendar-date fields like
  document expiries — task #98), `formatTripSource()` (special-cases `PUBLIC_FEASIBILITY_IQ` →
  "Public Viability IQ (VIQ)" display text without touching the underlying enum value — see §7.3).
  As of task #98 this is the **only** date-formatting path in the frontend — no
  `toLocaleDateString()`/`toLocaleString()` calls remain on any datetime field anywhere (the
  handful of surviving `toLocaleString()` calls are all numeric, e.g. MTOW/hours formatting, not
  dates).
- **`jwt.ts`** — `getCurrentUserRole()` (decodes the JWT `role` claim, UI-gating only, never trust
  for real auth), `canWrite()`, `canDelete()`.
- **`useRequireAuth.ts`** — redirects to `/login` if no token.

### 7.3 The VIQ rebrand

"Feasibility IQ" was renamed to "**Viability IQ (VIQ)**" per explicit user request — but **only**
user-facing display text changed (page headers, nav labels, the trip-source display string via
`formatTripSource()`). Internal API paths (`/feasibility/*`), the `PUBLIC_FEASIBILITY_IQ` enum
value, and schema/service names were deliberately left unchanged — renaming those would touch
persisted data and every call site for zero functional gain. **If you're grepping for
"feasibility" expecting it to be gone, it isn't — only the words a user actually sees changed.**

### 7.4 Key components

- **`AircraftTypePicker`**, **`AirportPicker`**, **`MultiCodePicker`** — typeahead pickers hitting
  `/feasibility/*` lookup endpoints.
- **`LegEditor`** — the core per-leg form: departure/arrival airport pickers, call sign, filed
  route, a "time known as: departure/arrival" toggle driving `reference_datetime` vs.
  `required_arrival_datetime` (see §5.8) with the *other* value live-computed and displayed via
  `formatUtc`, routing constraints (avoid/include states/FIRs) behind a `<details>` disclosure.
  Renders `RoutePreviewPanel` **with `showMap={false}`** — the map graphic itself is deliberately
  *not* shown inline here (see §7.5).
- **`RoutePreviewPanel`** — fetches `/feasibility/route-preview` for a dep/arr pair, shows
  distance/EET/states/FIRs text and fires `onEetHours` (lets `LegEditor`'s time-driver toggle
  live-sync without a duplicate query). Takes `showStats`/`showMap` booleans (default both `true`)
  so callers can split the two — see §7.5.
- **`RouteMap`** — the actual Leaflet-style map graphic (track line + state/FIR polygon overlays).
- **`PersonsEditor`** — crew/pax list with role + nationality + optional name (task #120, §4.27).
  Self-fetches `/feasibility/person-roles` (its own `useQuery`, matching `AircraftTypePicker`'s
  pattern) rather than taking a `roles` prop, since it's shared between the public VIQ form (no
  page-level query to piggyback on) and the authenticated Trip Manager.
- **`AdminNav`** — global back/forward + cross-section admin nav, self-hides on public `/` and
  `/login`.
- **`StatusChip`** — color-codes any status string by keyword (VERIFIED→ok, BLOCKED/EXCEEDS→danger,
  UNVERIFIED/PENDING→warn, etc. — `toneFor()` in the component).
- **`FeasibilityResultsCard`** — renders one leg's full verdict (route, permits, capability,
  credentials, nav fees total-only with `fully_priced` gating).
- **`DataTable`** — generic responsive table (column `priority` 1/2/3 controls which breakpoint
  hides a column).
- **`EditableCell`** (`EditableText`/`EditableSelect`/`EditableCheckbox`) — click-to-edit table
  cells (task #77). Not writable → plain read-only text. `EditableText`: click turns the cell into
  an input, Enter/blur commits via the caller's `onSave` (a PATCH with `{version, [field]: value}`
  — every entity here uses the same optimistic-lock PATCH shape), Escape reverts. `EditableSelect`/
  `EditableCheckbox` commit immediately on change (no separate edit-mode toggle needed since a
  `<select>`/checkbox is already a click-to-open control). **Where it's wired as of task #100**:
  Trips list (Status only), Vendors list (Capability status only — the one deliberately-kept
  narrow inline-editable column, mirroring Operators). Everywhere else (Countries, Airports,
  Aircraft Types, Vendors' other fields, Operators) inline editing now lives **only** on the
  detail page, reached by clicking the item's name/code on an otherwise plain-text list — task
  #100 reversed the original task #77 pattern of editing directly on the list for
  Countries/Airports/Aircraft/Vendors, since Operators' list-vs-detail split was judged the better
  UX and the user asked for it applied everywhere.
  Same-file helper components `InfoField`/`EditableInfoField`/`EditableInfoCheckbox`/
  `EditableInfoSelect` (also in `EditableCell.tsx`, hoisted out of `operators/[id]/page.tsx` where
  they were originally defined once a second detail page needed the identical label-over-value
  grid cell) back every detail page's info-grid layout.
  **Always PATCH the row's *raw* stored field, never a computed/effective one** —
  e.g. Countries edits `standard_lead_time_hours` (nullable, admin-entered), not
  `effective_lead_time_hours` (the computed fallback-blended value) — conflating the two would
  silently write the fallback number back as if it were a real verified entry. Every list schema
  that gets inline-edited needs `version` in its `Out` response for the optimistic lock — `TripOut`
  and `AircraftPerformanceOut`'s frontend TS types were both missing it and were extended
  (`app/schemas/trip.py`, `lib/types.ts`) specifically to support this.
- **`LegSummaryTable`** (task #84) — the OUTPUT-1-style at-a-glance multi-leg overview shown above
  the detailed per-leg cards: one row per leg (from/to ICAO+date, call sign, registration, EET,
  distance), with aircraft type/MTOW shown once above the table (no per-leg override exists for
  those two in the data model). Used on both the public Viability IQ results (built from local form
  state + `LegResult[]`, no backend change needed there) and the Trip Manager Overview tab (built
  from `TripDetail.legs`, which needed a small backend addition — `TripLegDetailOut.aircraft_icao_type`,
  sourced from the real `TripLeg.aircraft_icao_type` column, since the type wasn't surfaced in the
  API response at all before this).

### 7.5 The "map below everything" layout rule (task #87)

Per explicit user instruction, the route **map graphic** must render *below* every other form
section — including "Requested by"/"Notes" on the admin new-trip form — not interleaved per-leg
inside the form. Implementation: `RoutePreviewPanel` was split into `showStats`/`showMap` props;
`LegEditor` renders it with `showMap={false}` (keeps the live text stats + EET callback inline,
where they're needed for the time-driver toggle); both `app/page.tsx` (public VIQ) and
`app/admin/trips/new/page.tsx` render a **separate, consolidated "Route map" section** near the
bottom of the form (after contact fields / after Notes respectively, before the submit button)
that loops over all legs and renders `<RoutePreviewPanel showStats={false} />` per leg. Multiple
instances sharing the same `["route-preview", dep, arr]` TanStack Query key dedupe/cache normally
— no wasted fetches.

`app/admin/trips/[id]/page.tsx` (trip detail) was **not** touched by this rule — its map lives in
a dedicated "Route" tab, structurally separate from the "Overview" tab's Requested/Notes fields
(different tabs, not stacked in one scroll), so the "below everything" concern doesn't apply the
same way there.

### 7.6 Uppercase identifier inputs (task #87)

Per explicit user instruction ("Entries must all be uppercase"), identifier-shaped fields force
uppercase on every keystroke via `.toUpperCase()` in the `onChange` handler: aircraft registration
(public VIQ + admin new-trip), serial number, call sign, filed route, per-leg registration
override, and the full `AircraftForm` identifier fields on `/operators/[id]` (registration,
icao_type, serial_number, nationality_iso3, default_callsign, home_base_icao). **Free-text fields
are deliberately excluded**: colors, manufacturer, model series, names, emails, notes — uppercase
would just be visually wrong there.

### 7.7 ⚠️ Tailwind gotcha: `text-base` collides with the custom `base` color

`tailwind.config.ts` extends `colors` with a custom `base` (the dark-mode background,
`rgb(var(--color-base))`). This collides with Tailwind's *built-in* `text-base` font-size utility
(1rem). **Whichever one Tailwind's generated CSS resolves last wins the cascade for the literal
class `text-base`** — in this build, that's the **color** utility, meaning `className="text-base"`
alone silently sets text color to the background color (invisible text), not font-size.

**The established, working pattern everywhere in this codebase is to always pair `text-base` with
an explicit `text-fg` class** (`className="... text-base text-fg"`) — `text-fg` is a different
class and wins the cascade tie, restoring the intended readable foreground color while `text-base`
still contributes its font-size role. This was already the consistent (if implicit) convention in
every pre-existing input across the app.

**Real bug caught and fixed during task #76**: the new `/operators/[id]` fleet card header used
`className="mono-figures text-base font-semibold"` for the registration span — *without* pairing
`text-fg` — so registration text rendered completely invisible (same RGB as the background,
confirmed via `getComputedStyle` returning `color: rgb(17, 17, 17)`, the `--color-base` value *at
the time* — see §7.9, that value has since changed but the collision and the fix pattern haven't)
even though the DOM held the correct text. Fixed by adding `text-fg`. **Grep the whole frontend for
`text-base` not immediately followed by `text-fg` before shipping any new UI** — the two must
always travel together in this codebase.

### 7.8 Autosave pattern (admin new-trip)

`app/admin/trips/new/page.tsx` debounce-creates a draft `Trip` (ENQUIRY status) 3 seconds after
the form becomes minimally valid, so an abandoned entry still shows up as a lead in the trips list.
Only fires the *initial* create; once a draft exists, further edits happen through the trip detail
page's own editing path (no second leg-diffing sync mechanism).

### 7.9 Luxury design pass (task #88)

Design-system-level pass for premium clientele — "use your judgment, tasteful aviation-luxury
defaults" was the explicit brief, no further direction given up front.

**Tokens** (`tailwind.config.ts` + `globals.css`):
- `base`/`surface` deepened from flat near-black (`17 17 17`) to a navy-tinted charcoal
  (`--color-base: 10 12 17`, `--color-surface: 20 23 31`) — "aviation night sky," not grayscale.
  `surface` is a new elevated-card-panel token (previously an unused dead config value); cards now
  sit on `bg-surface` with a border instead of floating transparent on the page background.
- New `accent` color (`#C6A15B`, muted gold) — **restrained use only**: kickers, dividers, focus/
  hover borders, section rules. Never a competing CTA color against `primary` (still the brand red,
  `#C8102E`, untouched — every button/active-state that was red stays red; this pass adds depth and
  refinement around it, it does not rebrand).
- Typography: fonts are now actually loaded (previously declared in `tailwind.config.ts` but never
  imported anywhere — silently falling back to system fonts the whole build). `next/font/google` in
  `app/layout.tsx`: Inter (`--font-sans`, body/UI), JetBrains Mono (`--font-mono`, figures — already
  the intent, just newly real), Playfair Display (`--font-display`, a serif reserved for hero H1s
  and major section titles only — **never** body copy, form labels, or dense tabular data, which
  stay in Inter/JetBrains Mono for readability).
- Applied prominently on the public Viability IQ page (`app/page.tsx` — highest priority per the
  brief): serif hero headline with a gold uppercase kicker line, elevated card surfaces with soft
  shadows on the form/results/quote-request containers, refined CTA button treatment. Lighter touch
  on admin (`AdminNav`, `/admin` dashboard) — accent-colored top-bar border and hover states, cards
  on `bg-surface` — deliberately not a full pixel-by-pixel rewrite of every admin table page, since
  those need to stay dense/legible, not editorial.

**PWA** (firm requirement, not optional):
- `frontend/public/manifest.webmanifest` (name/short_name/icons/theme_color/display: standalone),
  linked via `metadata.manifest` in `app/layout.tsx`.
- Icons generated with Python/Pillow (no rasterizer available in the frontend toolchain) — a simple
  gold chevron/wing mark on the navy base, at `public/icons/`: `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png` (generous safe-area padding for circular crop), `apple-touch-icon.png`,
  `icon.svg` (modern-browser tab favicon), plus `favicon.ico` for legacy fallback.
- `public/sw.js` + `components/ServiceWorkerRegistration.tsx` — a **minimal** service worker exists
  because Chrome's install-prompt criteria require one with a registered `fetch` handler; it
  deliberately caches only the static icon/manifest shell, never pages or `/api/*` — this is an
  operational tool where permit deadlines and verdicts must always be current, caching them would
  be a correctness bug, not a feature.

**Mobile nav** (firm requirement, matches this user's standard on other projects — bottom nav or
dropdown menus, not a scaled-down desktop layout):
- New `components/MobileNav.tsx` — bottom tab bar (`md:hidden`), 3 primary destinations (Home/
  Trips/Operators) + a "More" sheet (bottom drawer) for the rest (Countries/Airports/Aircraft/
  Vendors/Data Import). Inline SVG icons (no icon library dependency — none was installed, and
  adding one mid-pass for a handful of glyphs wasn't worth the Docker layer churn).
  Self-hides on the public door and `/login`, same `PUBLIC_PATHS` pattern as `AdminNav`.
- `AdminNav`'s top bar becomes desktop-only (`hidden md:flex`) — the two navs are mutually
  exclusive by breakpoint, never both visible.
- `ThemeToggle`'s fixed floating button was `bottom-4 right-4` — repositioned to `bottom-20 right-4
  md:bottom-4` so it doesn't overlap the new bottom nav bar on mobile. Real bug caught in review,
  not from live testing — check for this class of overlap whenever adding another fixed-position
  mobile element.

### 7.9a Admin nav dedup (task #99)

Real bug, not just cosmetic: `AdminNav` (desktop top bar) and `MobileNav` (bottom bar + "More"
sheet) each hand-maintained their own copy of the same 7 destination links, with inconsistent
labels ("Aircraft" vs. "Aircraft Types") — and on top of that, `/admin` and `/admin/data` *each*
rendered a **third** copy of nearly the same list directly in the page body, underneath the
already-visible sticky top bar. A desktop user on `/admin` saw the link set twice on screen at
once. Fixed with one shared `ADMIN_NAV_LINKS` constant (`frontend/src/lib/adminNav.ts`,
`{href, label}[]`, the 7 non-dashboard destinations) consumed by both nav components:
- `AdminNav.LINKS = [{ href: "/admin", label: "Dashboard" }, ...ADMIN_NAV_LINKS]`.
- `MobileNav.MORE_LINKS = ADMIN_NAV_LINKS.filter(l => !PRIMARY_HREFS.has(l.href))` — the 3 curated
  bottom-bar primaries (Home/Trips/Operators, each with its own icon) stay hand-picked since that's
  a deliberate small-screen-space decision, but the overflow "More" sheet now derives automatically
  from the shared list rather than needing a second manual edit whenever a destination is added.
- The page-local `<nav>` in `admin/page.tsx` and `QUICK_LINKS` in `admin/data/page.tsx` were
  deleted outright — the global nav already covers them, so the page body goes straight from its
  header into its actual content.

### 7.10 Country name display + airport search ranking (task #90)

Two conventions swept across the frontend, per explicit user rule: countries are always shown by
full name, never a bare ISO2/ISO3 code; airport search ranks ICAO match first, then IATA, then
city, then everything else.

**`components/CountryPicker.tsx`** (new) — two exports:
- `CountryPicker` — single-select country typeahead (same search-then-pick-then-"Change" pattern as
  `AirportPicker`), hits `/feasibility/countries?q=`, always displays the resolved name.
- `CountryName` — a read-only `{iso3} -> name` resolver for plain display contexts (an info grid
  cell, a list item), one `useQuery` per instance. **Only for small lists** — it does not batch.
  For a large table (Airports' ~500 rows), fetch the full `/countries?page_size=500` list once at
  the page level and build a local `iso3 -> name` map instead (see `app/airports/page.tsx`) — one
  request instead of hundreds.

Replaced raw-code display/input with these in: `components/PersonsEditor.tsx` (nationality was a
free-text 3-letter ISO3 box — now `CountryPicker`), `app/operators/[id]/page.tsx`'s `AircraftForm`
nationality field (same fix) and its read-only fleet-card nationality display (`CountryName`;
required widening the local `InfoField` helper's `value` prop from `string | null` to
`React.ReactNode` — backward compatible, every other caller still passes plain strings),
`app/airports/page.tsx`'s Country column (page-level lookup map), and the crew/pax nationality line
in both `FeasibilityResultsCard.tsx` and the admin trip detail page's Crew & Pax tab (`CountryName`,
small per-leg lists).

`components/MultiCodePicker.tsx` (avoid/include countries and FIRs in `LegEditor`) already showed
names in its search dropdown, but the *selected chips* only ever showed the bare code. Fixed with a
`nameCache: Record<string,string>` populated from every search-result batch seen — a selected code
always appeared in some search result at some point (that's the only way it could get selected), so
the cache always resolves by the time a chip needs to render it. Deliberately not FIR-vs-country
conditional — the same fix applies to both, and a FIR chip showing its name instead of its code is
not a regression.

Deliberately left alone: `app/countries/page.tsx`'s own ISO3 column — that's the row's own primary
key/identifier, the same convention already established for Airports' own ICAO column (see §11's
"ICAO is the primary airport identifier" rule) — the "always show name" rule targets a *foreign*
reference to a country via its code, not a reference table displaying its own key.

**`app/services/feasibility_iq_service.py::search_airports`** — was a plain `or_(icao/iata/name
ilike '%q%')` ordered alphabetically by name, and **never searched `city` at all**. Rewritten to
rank via a SQL `case()` expression (ICAO-prefix match → 0, IATA-prefix → 1, city-prefix → 2,
else → 3) ordered by that rank then name, with `city` now included in the match `WHERE` clause too.
New `tests/integration/test_airport_search.py` (3 tests) locks in the ranking order — the one thing
worth remembering if touching this test file again: `Airport.iata` is `varchar(3)`, test fixtures
must keep IATA values to exactly 3 characters (hit a `StringDataRightTruncationError` from this
once while writing them).

### 7.11 PNR/itinerary PDF download (task #82)

`GET /trips/{trip_id}/pnr.pdf` (`app/services/pnr_pdf_service.py`) renders a PDF straight from the
same `TripDetailOut` every other trip view reads — pure presentation, no second data path, never
invents anything not already computed by the four planning engines. Header/aircraft summary, the
OUTPUT-1-style leg table (§7.4's `LegSummaryTable`, same columns), a permits/deadlines table, and
per-leg verdict reasons (§5.7), styled with the luxury palette's navy/gold (§7.9).

**Library choice: `reportlab`, not an HTML-to-PDF renderer.** WeasyPrint (or similar) would have
let the PDF reuse actual HTML/CSS, but needs native system libraries (pango, cairo, gdk-pixbuf) —
real Docker image complexity and build risk, deliberately avoided given this build's disk-space
instability (§1). `reportlab` is pure Python; the only new transitive dependency is `Pillow`. The
PNR content is fundamentally tabular (leg data, permit deadlines) rather than richly styled prose,
so reportlab's `Table`/`Paragraph` flowables are a good structural fit anyway, not just the safer
choice.

Frontend: a "Download PNR" button in the admin trip detail header uses the same
`api.download()` → `Blob` → `<a download>` pattern already established for aircraft/Person document
downloads (§4.2, §4.6) — no new download mechanism, just a new endpoint to point it at.

### 7.12 Public Viability IQ landing-page redesign (task #78)

`app/page.tsx` restructured into a two-column layout — `MarketingPanel` (sticky on desktop) on the
left, the existing feasibility-check form on the right — rather than the form alone, stacked under
a plain header.

**Contains placeholder marketing copy, not real content.** The user's explicit direction
(2026-08-12, when asked how to handle the missing marketing copy this task was originally blocked
on): draft clearly-labeled placeholders for structure/layout only, to be swapped for real copy
before anything ships. The product name/headline ("Jetelio Viability IQ") and the one-line
functional description ("Route, permits, services and a verdict...") are real — they're factual,
not marketing claims — but the three value-prop bullets and the trust-signal line are bracketed
placeholder text (`[Value prop 1 — ...]`) inside a **visually distinct dashed-border box with a
"PLACEHOLDER COPY — REPLACE BEFORE LAUNCH" badge** — deliberately made impossible to mistake for
shippable copy, not just flagged in a code comment. **Do not remove the placeholder styling or
badge without the user supplying real copy to replace it with.**

### 7.13 Progressive-disclosure wizard (task #111)

`app/page.tsx`'s single always-all-visible form rewritten as a staged reveal, in the user's
confirmed order: **Aircraft → Legs → Client info → Result**. A new `WizardStage` component
(`{ step, label, children }`) renders each stage's numbered badge + label + a `.animate-in`
fade/slide (new plain-CSS `@keyframes` in `globals.css` — no animation library, matching this
codebase's established no-new-dependency convention for this kind of polish).

- **Stage 1 (Aircraft)** — always visible; nothing downstream is plannable without it.
- **Stage 2 (Legs)** — unlocks once `aircraft` is set. Contains the leg editor(s) +
  Add leg/Round trip, `PersonsEditor` (crew/pax), and the route map preview — everything
  operationally about the trip itself, as distinct from the contact-info stage.
- **Stage 3 (Your details)** — unlocks once `legsComplete` (every leg has dep/arr + exactly one
  of departure/arrival time set). Holds name/email/phone + the submit button — asking for contact
  details before the trip is even plannable would be a wasted step if the route turns out
  infeasible.
- **Stage 4 (Result)** — the existing `{result && !tripId && (...)}` block, now wrapped in the
  same `WizardStage` styling for visual consistency with stages 1–3, unchanged in behavior.
- **Design choice: additive reveal, not a collapsing/step-hiding wizard.** Earlier stages stay
  visible and editable once a later one unlocks — a user who already filled in leg details never
  sees them disappear behind a "Next" click. This matches "progressive disclosure" as the user
  specified it (unlock more of the form as you go), not a multi-page wizard with back/forward
  navigation, which wasn't asked for and would add real complexity (state-loss-on-back edge cases,
  a currentStep concept) for no stated benefit.
- Purely a frontend state-visibility change — `FeasibilityCheckIn`/`Out` and every backend
  endpoint are untouched.

**Real bug found and fixed in the same commit, not part of #111's stated scope but blocking its
live verification**: see §4.22 — `LegEditor.tsx`'s native datetime-local input threw an uncaught
`RangeError` and white-screened the whole page on realistic user input. Fixed with a
`toIsoOrNull()` guard before ever calling `.toISOString()`.

**Verified live in browser**: fresh page load shows only Stage 1; selecting an aircraft type
reveals Stage 2 immediately (confirmed via screenshot — dramatically less crowded than the old
always-visible layout, directly addressing the "crowded layout" complaint that motivated this
whole VIQ redesign group); completing a leg (departure/arrival airports + a valid datetime) reveals
Stage 3; submitting produces Stage 4 with a real `FEASIBLE` verdict — full Aircraft → Legs → Your
details → Result flow confirmed end to end, console clean of app errors (the only console entries
were a benign Chrome-extension messaging artifact from the browser-automation tooling itself, not
the app).

### 7.14 Compact date/time input + prominent time-driver toggle (task #112)

`LegEditor.tsx`'s single native `<input type="datetime-local">` (full-width, oversized, one of the
"crowded/messy" complaints motivating this whole VIQ redesign group) replaced with two separate,
normal-sized inputs side by side — `<input type="date">` (`w-40`) + `<input type="time">` (`w-28`),
each the same `h-11` height as every other field in the form, inside a bordered card with the
Departure/Arrival toggle now rendered as two full-width (`flex-1`) `h-11` buttons stacked above
them — considerably harder to miss than the old small inline label + pill pair, directly addressing
the "missing way to edit arrival" complaint (the toggle already existed and worked, per the
research at the top of the approved plan — this only makes it visually prominent, not new
capability).

- **State**: `dateStr`/`timeStr` are tracked as their own independent `useState`s, not derived by
  splitting `datetimeLocal` on every render. This matters because a user who's filled in the date
  but not yet the time must still see their date on screen — `datetimeLocal` (and therefore the
  value that propagates to the parent via `applyDatetime`) stays `""` until **both** parts are
  present, exactly matching the native `datetime-local` widget's own "incomplete = no value yet"
  semantics, but without ever losing a half-entered value the way splitting-on-render would.
- **A structural side-benefit, not the point of the task**: two independently-typed, correctly-typed
  (`type="date"`/`type="time"`) inputs each only ever produce a complete valid value or empty string
  — never the single combined widget's partial/malformed intermediate string that caused §4.22's
  `RangeError` crash in the first place. The `toIsoOrNull()` guard from that fix stays in place
  regardless (cheap insurance, not made redundant by this change).
- Purely a frontend, single-file change (`LegEditor.tsx` + a few new lines of layout CSS via
  Tailwind utility classes, no new file) — no backend or type-contract changes.
- **Verified live in browser**: screenshots confirm the compact side-by-side layout and the
  prominent full-width toggle render correctly; native per-segment typing (day/month/year/hour/
  minute) via keyboard automation was flaky **in the automation tooling itself** (Chrome's native
  date-input segment-caret positioning under synthetic keystrokes, not a fault in this component —
  a real mouse click reliably lands on the segment the user clicks), so the application logic itself
  was confirmed by setting both inputs' values directly (via the native input value setter +
  a dispatched `input` event, the same mechanism React itself listens for) and checking the result:
  values displayed correctly (`31/12/2026`, `12:00`), Stage 3 unlocked, and a full submission
  produced a real `FEASIBLE` verdict — same result as a normal manual fill, end to end.

### 7.15 MTOW unit-suffix control (task #113)

`app/page.tsx`'s MTOW field — a number input plus a separate two-button kg/lb segmented toggle,
both competing for one cramped 4-column grid cell — restyled into one unit-suffix-style control: a
single `h-11` bordered box containing the number input and a `KG`/`LB` suffix button (divided only
by a thin internal border), the button cycling the unit on click rather than needing two separate
buttons to pick between. Same underlying `mtowKg`/`mtowUnit` state and `LB_PER_KG` conversion in
`entered_mtow_kg()` — pure JSX/CSS restyle, no behavior change. Verified live: typed `8500`,
clicked the suffix, confirmed it toggled `KG → LB` with the entered number unchanged (matching the
original toggle's behavior — only how the number is *interpreted* on submit changes, never the
raw text itself), console clean.

### 7.15a Admin MTOW toggle parity + public registration autofill (task #123)

User noticed the admin Trip Manager's "new trip" MTOW field (`admin/trips/new/page.tsx`) still had
the *pre*-#113 look — a number input plus a separate two-button segmented kg/lb toggle — never
migrated when VIQ got the unit-suffix restyle. Fixed by copying §7.15's exact markup over; same
`mtowKg`/`mtowUnit` state and `mtowInKg()` conversion, pure JSX change.

**Public-safe registration autofill on VIQ**: the admin Trip Manager has long had a real
registration → aircraft-type/MTOW/operator/billing-client autofill
(`GET /trips/aircraft-lookup`, `AircraftLookupOut`) — but it's explicitly admin-only, its own
docstring warning that exposing it publicly "would leak one operator's fleet/contact details to
anyone who types their tail number." The user asked for VIQ's Registration/MTOW/Operator fields to
"autopopulate ... with available registries" too — a real conflict with that documented privacy
boundary, surfaced back to the user rather than silently building around or through it. **User's
explicit choice**: a new public endpoint returns type + MTOW only, never operator name/contact/
billing data — Operator/airline stays a manual field, same as it already was.

- New `PublicAircraftLookupOut` (`app/schemas/feasibility.py`) — `registration`/`icao_type`/
  `mtow_kg` only, no `operator_id`/`operator_name`/`clients`. Docstring spells out why it's a
  narrower projection than `AircraftLookupOut`, not just "the same minus some fields."
- `feasibility_iq_service.lookup_aircraft_by_registration()` — deliberately never even imports
  `Operator`/`Client` into this file, matching this codebase's existing discipline of not just
  omitting sensitive data from a response but not touching the tables that hold it at all.
- `GET /feasibility/aircraft-lookup?registration=` (public, rate-limited `lookup` bucket, 404 on no
  match — same shape as the admin endpoint otherwise).
- `app/page.tsx`: registration input's `onBlur` fires the lookup; a match autofills `aircraft`
  (type) and `mtowKg`/`mtowUnit`, with a "Matched — type & MTOW filled in below" confirmation.
  **Does not touch `operatorAirlineName`** — VIQ also accepts arbitrary/hypothetical aircraft (no
  registration required), so a 404 is a silent no-op, not an error; the fields stay manually
  editable either way, matching admin's "best-effort convenience" framing.
- **Tests**: `tests/integration/test_feasibility_api.py::TestPublicAircraftLookup` — matched
  registration returns type+MTOW and asserts `operator_name`/`operator_id`/`clients` are absent
  from the response body *and* the operator's real name string doesn't appear anywhere in the raw
  response text (not just "the named field is missing" — a stronger, harder-to-accidentally-break
  assertion); unmatched registration is 404; lookup is case-insensitive. 318 passing full suite,
  zero regressions. Frontend `next build` clean. Live-verified through nginx post-rebuild.

### 7.16 Single combined navigation map (task #114)

The public VIQ page's per-leg "Route map" section — one separate small `RoutePreviewPanel` map
stacked under every leg — replaced with one shared map for the whole trip.

- **`RouteMap.tsx` prop shape changed**: `trackPoints: [number, number][]` (one leg) →
  `tracks: [number, number][][]` (one array of points per leg, always — a single-leg caller just
  passes a length-1 array). Safe to change directly rather than adding a parallel prop: confirmed
  via grep that `RouteMap` is only ever imported by `RoutePreviewPanel.tsx`, nowhere else, so this
  is a fully contained rename — `RoutePreviewPanel` (and everything built on it: `LegEditor`,
  both admin Trip Manager pages) now passes `tracks={[data.track_points]}`, unchanged behavior for
  every existing single-leg caller.
- Each leg draws its own track path (still `stroke-fg`, matching the existing single-color style —
  legs of a real multi-stop trip are usually contiguous anyway, so per-leg color-coding wasn't
  needed); when more than one leg is present, a small numbered label (`1`, `2`, …) marks each leg's
  start point, and a text legend below the map (`1. OMAA → OOMS   2. OOMS → HECA`) ties the numbers
  back to the actual leg pairs.
- **Geometry dedup**: a country/FIR crossed by more than one leg (e.g. a shared overflight state on
  a return trip) is only drawn once — `CombinedRouteMap.tsx` merges every leg's `state_geometry`/
  `fir_geometry` by code (`Object.assign` across legs) before handing the combined dict to
  `RouteMap`, rather than layering identical polygons N times.
- **New `CombinedRouteMap.tsx`**: fetches every leg's `/feasibility/route-preview` independently via
  `useQueries` (same query key shape as `RoutePreviewPanel`'s own `useQuery`, so nothing re-fetches
  data a leg's own stats panel already warmed), then merges tracks + deduped geometry into one
  `RouteMap` call. `app/page.tsx` now renders `<CombinedRouteMap legs={legs.map(...)} />` once,
  instead of mapping over `legs` to render N separate `RoutePreviewPanel`s.
- **Verified live in browser**: a real 2-leg trip (OMAA → OOMS → HECA, spanning UAE/Oman/Egypt) shows
  one map with both legs' tracks overlaid in a single shared bounding box, numbered `1`/`2` start
  markers, the text legend below matching, and a full submission through to a real `FEASIBLE`
  Stage 4 result — confirming the merge, dedup, and downstream submit flow all still work together
  end to end. Console clean of app errors.

### 7.17 Two always-visible departure/arrival fields (task #116)

`LegEditor.tsx`'s "Time known as: Departure/Arrival" toggle (task #112) — one field pair, whichever
side isn't selected shown as read-only computed text — replaced per explicit user spec: two
always-visible, independently editable date/time field pairs. Departure is the sole real time
driver (`reference_datetime`); arrival auto-prefills from departure + EET once both are known, then
stays fully independent — edited manually or by the prefill, it's never silently recomputed out
from under the user on a later departure edit. Clearing arrival back to empty is the "reset to
computed" gesture (a small "Reset to computed" link does the same thing explicitly once arrival
differs from what EET would currently produce).

- **The backend mechanism already existed — just admin-only and unwired.** `TripLegIn.
  arrival_datetime_override` (task #101-adjacent, predates this task) was already exactly "cosmetic
  display override, never fed back into permit/deadline computation," with
  `trip_service._compute_and_build_leg` already doing `arrival_datetime = leg_in.
  arrival_datetime_override or computed_arrival`. `LegEditor.tsx` simply never wired an input to it.
  **Moved from admin-only `TripLegIn` up to the shared base `LegCheckIn`** (`app/schemas/
  feasibility.py`) so the public Viability IQ form gets it too, per the user's explicit "on admin
  and VIQ" — `TripLegIn` no longer redeclares it, inherited from the base.
- **Scope decision, made explicitly rather than silently**: the old arrival-driven mode
  (`required_arrival_datetime` — "a dispatcher who knows 'must land by X' rather than 'departing at
  Y'") is no longer reachable from either UI now that departure is unconditionally required and
  entered first. The backend still accepts it (nothing removed there), but no current caller sends
  it. `legTimeValid` in both `app/page.tsx` and `app/admin/trips/new/page.tsx` simplified from
  "exactly one of departure/required-arrival" to just "departure present."
- **Public path needed real plumbing, not just a schema move** — `POST /feasibility/check` doesn't
  write to the DB at all; it caches a hand-built dict in Redis (`feasibility_iq_service.
  check_trip_feasibility`, keyed `feasibility:check:{check_id}`), and `POST /feasibility/
  request-quote` reads that cache to build the real `TripLeg` row. `arrival_datetime_override`
  needed to be explicitly threaded into `cache_payload["legs"][...]["arrival_datetime"]`
  (`leg_in.arrival_datetime_override or leg_out.arrival_datetime`, mirroring the admin pattern
  exactly) — arriving on the schema alone would have done nothing, since `/request-quote` never
  re-reads the original request body.
- **Real bug caught by hand-testing the live API response, not by the test suite** (the test as
  first written only checked the eventual `TripLeg` row, which already worked): the immediate
  `/feasibility/check` response — what the user's results screen actually shows — did **not**
  reflect the override at all, only the plain engine-computed arrival. `leg_outs` (built by
  `project_leg_result`) is also what gets frozen into the cache's `snapshot` field for
  reproducibility, so overriding it in place would have leaked the override into
  `TripLeg.computed_snapshot` too — the same "frozen snapshot must stay the pure engine output"
  contract §10.2 documents for a different bug. Fixed by keeping `leg_outs` pristine (feeds the
  snapshot) and building a separate `response_legs` list (`leg_out.model_copy(update={"arrival_datetime":
  override})`) for what's actually returned to the caller — mirrors the admin path's own existing
  split between the override-aware top-level `TripLegDetailOut.arrival_datetime` (real column) and
  the always-computed nested `result.arrival_datetime` (frozen snapshot), which was already the
  established (if previously undocumented) design.
- **New `frontend/src/lib/time.ts`**: `addHours(iso, hours)` factors out the `date.getTime() + hours
  * 3600_000` arithmetic that was duplicated inline in both `RoutePreviewPanel.tsx` and (now, twice
  over) `LegEditor.tsx`.
- **Tests**: `tests/integration/test_feasibility_api.py::test_arrival_datetime_override_persists_on_the_public_path`
  — asserts the override shows up in the immediate check response (parsed as datetimes, not raw
  strings, since Pydantic serializes UTC as `Z` while Python's `.isoformat()` uses `+00:00`),
  survives to the real `TripLeg.arrival_datetime` column after `/request-quote`, leaves
  `reference_datetime` (departure) untouched, and — critically — that `TripLeg.computed_snapshot`
  stays un-overridden. Full suite: 314 passing (313 + 1 new), zero regressions from moving the
  schema field.
- **Verified live against the real dev API**, not just tests: a real `OMDB → HECA` check with
  `arrival_datetime_override` set ~10h past the computed EET-based arrival came back with that exact
  override in the response (confirmed via direct `curl`, not the browser — the Claude in Chrome
  extension wasn't connected in this environment, same limitation noted in §4.24). Converted to a
  real trip via `/request-quote` and fetched it back: `reference_datetime` unchanged,
  `arrival_datetime` (top-level) exactly the override, `result.arrival_datetime` (nested snapshot)
  the pure computed value — all three exactly as designed.

### 7.18 Add/Edit/Remove leg wired into the Route tab (task #117)

Fourth item from the same user report: "Legs do not have a way to add/remove/edit... or change leg
info." The Services tab already had full add/remove/edit for service line items (task #105); what
was actually missing was the leg's *own* fields — the backend already had complete CRUD
(`POST/PATCH/DELETE /trips/{id}/legs[/{leg_id}]`, wired to `trip_service.add_leg`/`update_leg`/
`remove_leg` since early in this build), but nothing on `admin/trips/[id]/page.tsx`'s Route tab
called any of it — 100% read-only, and `LegEditor` (just redesigned in task #116) was only ever
instantiated during trip *creation*.

- **Real data-loss bug caught while planning, before any code was written**: `TripLegDetailOut`
  didn't expose a leg's `avoid_states`/`include_states`/`avoid_firs`/`include_firs` anywhere — only
  the *violation result* (`result.permits.state_avoid_include.avoided_transited`) was returned,
  never the original input sets. `update_leg` fully replaces `TripLeg.constraints` from whatever's
  in the submitted payload — an edit form built without these fields would have silently wiped a
  leg's existing routing constraints the instant it was saved, since it would have had nothing to
  resubmit but empty arrays. Fixed *before* building the edit UI: `TripLegDetailOut` gained
  `avoid_states`/`include_states`/`avoid_firs`/`include_firs`, populated in `trip_service._leg_out`
  straight from the real `TripLeg.constraints` column (not the frozen `computed_snapshot`).
- **`legDetailToInput`** (`admin/trips/[id]/page.tsx`) converts a GET-returned leg back into the
  `LegInput` shape `LegEditor` needs. `client_id`/`registration`/`leg_type`/`leg_status` have no
  `LegEditor` input at all (true at creation time too) — seeding them here and never touching them
  in `LegEditor`'s `{...leg, ...patch}` merge is what makes them round-trip unchanged through an
  edit, the same way they already did implicitly during creation.
- **UI**: per-leg `writable`-gated "Edit" (swaps that card's body for `LegEditor` + Save/Cancel,
  `canRemove={false}` since removal is a separate explicit action on the card, not `LegEditor`'s
  internal array-remove button) and `canDelete`-gated "Remove" (no confirm dialog — matches this
  page's existing convention, e.g. `ServiceRow`'s manual-service Remove and `MessageThread`'s
  delete). "Add leg" at the bottom of the tab mirrors `admin/trips/new/page.tsx`'s own continuity
  default (new leg's departure defaults to the previous leg's arrival). Only one leg editable (or
  the one new leg being added) at a time — a single `editingLegId`/`addingLeg` pair, not per-row
  local state.
- **Known pre-existing gap, not introduced here, left alone**: `validate_primary_leg_ordering`
  (chronological-order enforcement for PRIMARY legs) is only called from `create_trip`, not
  `add_leg`/`update_leg` — the backend already allowed an out-of-order add/edit via the API before
  this task. Noted so it isn't mistaken for a regression; fixing it is separate scope.
- **Tests**: `tests/integration/test_trips_api.py::
  test_leg_avoid_include_constraints_survive_an_edit` — creates a leg with real
  `avoid_states`/`include_firs`, confirms they're present in the create response's new fields,
  resubmits them unchanged (exactly what `legDetailToInput` does) alongside an unrelated
  `call_sign` edit, and confirms both the edit and the constraints survive. Full suite: 315 passing
  (314 + 1 new), zero regressions.
- **Verified live against the real dev API**: created a real `OMDB → HECA` trip with
  `avoid_states: ["JOR"]` (correctly produces `NOT FEASIBLE AS ROUTED`, matching the real
  Jordan-overflight requirement seen in §4.24's live verification), `PATCH`ed it changing only
  `call_sign` while resubmitting the same constraint — both landed correctly and the constraint
  survived. Then `POST`ed a second leg (`HECA → OMDB`, leg count 1 → 2) and `DELETE`d it back down
  to 1. Browser UI itself not visually checked — the Claude in Chrome extension still wasn't
  connected in this environment, same limitation as §4.24/§7.17.

### 7.19 Trip-builder chat input (task #125)

User asked for a chatbot that can take a free-text or structured (CAA-style ATTN/FROM/ACFT
OPERATOR/ITINERARY block) message and build a trip from it, on both VIQ and admin, with the
parsed result shown for verification before anything commits — same "user's explicit choice"
pattern already established for the map redesign and public registration autofill (§5.1, §7.15a):
Anthropic (Claude) API with the user's own key, pre-filling the *existing* trip/leg builder form
rather than a separate custom preview screen.

- **Two-step extraction, deliberately kept separate**: `app/core/chat/anthropic_provider.py`
  (`extract_trip_request`, model `claude-sonnet-5`, forced tool-use for reliable structured JSON —
  `tool_choice: {"type": "tool", ...}`) extracts *verbatim* location/country names, dates, and
  avoid/include phrases — the system prompt explicitly instructs it never to convert a name into
  an ICAO/ISO code itself, never to guess one, and never to "correct" a name it doesn't recognize.
  `app/services/trip_chat_service.py` is the *only* place that resolves those verbatim names
  against real data — reusing the exact same `feasibility_iq_service.search_airports`/
  `search_countries`/`search_aircraft_types` functions the public lookup endpoints already use, top
  ranked match wins, no match means `icao`/`iso3` stays `null` and a plain-English warning is
  added (`"Could not match ... — please select it manually."`), never a fabricated code. Same
  "never trust free text as ground truth" discipline `route_preview_service` already applies to a
  dispatcher's own `filed_route` string — an LLM hallucinating a plausible airport code would be
  exactly the kind of fabricated operational data this codebase's own §3/§11 convention exists to
  prevent, so the resolution step is structurally incapable of accepting one.
- **`POST /feasibility/chat-parse`** — public (no cost/vendor data involved, same rationale as the
  rest of this router), but on its own, much stricter rate-limit bucket: new
  `chat_parse_rate_limit_per_hour` setting (default 10/hour, vs. the shared 30/hour `lookup`
  buckets) since each call is a real, paid Anthropic API request, not a free DB query.
  `rate_limit()` (`app/core/rate_limit.py`) generalized to accept a `limit_setting_key` override
  rather than hardcoding the one shared setting, for this bucket to use its own ceiling. Empty
  `ANTHROPIC_API_KEY` → `503` (`NO_PROVIDER_CONFIGURED`-style honesty, same as `imap_host`);
  extraction failure (bad response, API error) → `502` with a generic public-facing message —
  the real reason is logged server-side (`logger.warning(..., exc_info=True)`) for an admin to
  diagnose, never leaked to an unauthenticated caller.
- **`TripChatInput.tsx`** — a textarea + "Fill in from message" button, hands the raw parsed draft
  back to the page via `onParsed`, which maps it into that page's *own* existing form state
  (`applyChatDraft` in both `app/page.tsx` and `admin/trips/new/page.tsx`) — never submits
  anything itself. Registration set from the draft re-runs the same real-registry autofill lookup
  (§7.15a on VIQ, the admin Trip Manager's own on admin) a manual entry would trigger, passing the
  new value explicitly rather than reading it back from React state in the same tick (state
  updates are async — reading `registration` right after `setRegistration(...)` would see the
  stale pre-update value). Admin's page has no manual operator-name field at all (operator always
  comes from a real registration match, per that page's existing "every registration is expected
  to be a real fleet aircraft" convention) — a chat-extracted operator name with no matching
  registration has nowhere to go there and is silently not applied, unlike VIQ where it fills a
  real free-text field.
- **Real bug caught while wiring this up**: both pages' registration `<input>` had
  `onBlur={runLookup}` / `onBlur={runRegistrationLookup}` — passing the function reference
  directly meant React's synthetic `FocusEvent` would be passed as the new optional
  `overrideRegistration` parameter once that parameter was added, breaking the lookup (`.trim()`
  on an event object). Fixed to `onBlur={() => runLookup()}` on both pages before it ever shipped.
- **Tests**: `test_trip_chat_service.py` — matched locations resolve to real seeded codes; an
  unmatched location/country stays `null` and produces a warning (not a guess); extraction failure
  propagates as `None`, never a fabricated empty-but-successful draft. `test_feasibility_api.py::
  TestChatParse` — `503` when unconfigured, `502` when extraction fails, and a real end-to-end
  round trip (real router + real resolution + real seeded DB rows, only the Anthropic call itself
  mocked) asserting the JSON response's resolved codes. 329 tests passing, zero regressions.
  Frontend `next build` clean.
- **Live-verified through nginx post-rebuild, with the user's own real API key — and a real finding
  from doing so**: the request reached Anthropic's API correctly authenticated and formatted (got
  past auth into billing/credit validation, which only happens for a well-formed request), but
  failed with `Your credit balance is too low to access the Anthropic API` — confirming the
  integration itself is wired correctly; the account it's using needs credits added before a parse
  will actually succeed. This is exactly the failure mode the `502` design above exists for: caught
  cleanly, logged with the real reason, generic message shown publicly.

### 7.20 Person/Party admin pages + document upload/OCR-review UI (task #126)

User said they couldn't see the OCR feature anywhere in the app. Investigation confirmed why: task
#109's Tesseract pipeline (§4.23) and the whole polymorphic Person/Party/Document/Credential system
underneath it (task #89, §4.6) were built **entirely backend-only** — real, tested, working
endpoints, but zero frontend. Worse, there was nowhere to *put* a documents widget: no
`/admin/persons` or `/admin/parties` page existed at all, no frontend types for `Person`/`Party`/
`Document`/`Credential`, and the Trip page's own "Documents" tab was (and remains) the stale
"lands in Phase 5" placeholder flagged earlier in this same session. Building the OCR UI therefore
meant building the Person/Party admin surface first, not bolting a widget onto something that
already existed.

- **New pages**: `/admin/persons` (list, `SearchInput`/`matchesQuery` reused from task #122, inline
  "Add person" form) + `/admin/persons/[id]` (editable fields via the existing `EditableInfoField`/
  `EditableInfoSelect` pattern from `operators/[id]/page.tsx`, plus the new documents panel).
  `/admin/parties` + `/admin/parties/[id]` mirror the same shape, with a Roles section showing every
  linked `PartyRole` (`OPERATOR`/`CLIENT`/`VENDOR`/`AGENT`/`WALK_IN`) and an "Add role" control
  scoped to `AGENT`/`WALK_IN` only — the other three link to a real existing Operator/Client/Vendor
  row (`party_roles.operator_id` etc., exactly one of the three per `app/schemas/party.py`'s
  validation) and this app has no Operator/Client/Vendor picker component yet to support that
  safely; noted as a real gap rather than faked with a raw ID text box. Both list pages added to
  `ADMIN_NAV_LINKS` (`lib/adminNav.ts`, the task #99 single-source-of-truth nav list).
- **`DocumentsPanel.tsx`** — generic over `entity_type`/`entity_id`, structurally copied from the
  already-working `AircraftDocumentsPanel` (`operators/[id]/page.tsx`, a different, older
  polymorphic-adjacent system keyed by `aircraft_id`) for upload/list/download/delete, using
  `api.upload`/`api.download` (already existed in `lib/api.ts`, unused until now outside that one
  panel). What it adds on top:
  - **A "Review" flow, not an editable-fields form** — deliberately. `DocumentTypeTemplate.
    expected_fields` describes what a license/passport/certificate *should* have, and
    `Document.extracted_fields` is Tesseract's best-effort guess at those values (§4.23's own
    docstring: "an honestly-scoped heuristic, not a verification mechanism") — but there is no
    backend endpoint to persist a human's correction to those specific field values (`DocumentVerifyIn`
    is only `version`/`status`/`verified_by`). Building input boxes that looked editable but silently
    had nowhere to save would be worse than not building them, so the OCR-suggested values render
    read-only ("reference only — confirm against the real file") next to a raw-OCR-text `<details>`
    block, and the actual action is binary: **Mark verified** / **Reject** against the real
    `/verify` endpoint.
  - **Credentials are real, not a suggestion** — a `list`-typed expected field (`PILOT_LICENSE`'s
    "ratings") maps to actual `Credential` rows, a genuinely separate CRUD resource
    (`/credentials?document_id=`), so that one gets a real add/remove sub-list
    (`CredentialsSection`) instead of a read-only OCR guess.
  - `getCurrentUserEmail()` added to `lib/jwt.ts` (decodes the JWT's `email` claim, same
    display-only caveat as the existing `getCurrentUserRole()`) to populate `verified_by` without a
    manual prompt.
- **Live-verified against the real stack, not just built**: logged in as a real seeded user,
  created a real `Person` via `POST /persons`, uploaded a real synthetic passport image (`PIL`-drawn
  inside the `api` container, copied out, uploaded via `curl -F`) to `POST /documents/PERSON/{id}`,
  confirmed `ocr_raw_output`/`extracted_fields` were `null` immediately (async, as documented) and
  populated correctly ~8s later on re-fetch with **real Tesseract-extracted text** — imperfect
  (`"Expinydate"` for "Expiry date", one guessed field grabbing the wrong nearby value), which is
  the expected, honestly-labeled behavior this UI is built around, not a bug. Verified the document
  via the real `/verify` endpoint (status flipped to `VERIFIED`, `verified_by`/`verified_on`
  populated), then deleted the test document and person to leave no residue. Frontend `next build`
  clean (all four new routes compiled). No backend code changed for this task — everything consumed
  was already real, tested, working API surface; only the frontend was missing.

### 7.21 Trip-builder chat provider swapped: Anthropic → DeepSeek (task #127)

Task #125's Anthropic integration hit a real billing wall (§7.19 — "credit balance too low"). User's
explicit choice: switch providers rather than wait, supplying a DeepSeek key.

- **Extracted the provider-agnostic parts first**: `app/core/chat/schema.py` now owns the shared
  `LegExtraction`/`TripExtraction` dataclasses, the JSON-schema `INPUT_SCHEMA`, `TOOL_NAME`/
  `TOOL_DESCRIPTION`, and `SYSTEM_PROMPT` — none of it Anthropic- or DeepSeek-specific. This is what
  made the swap touch zero lines in `app.services.trip_chat_service`: it always imported
  `extract_trip_request` as a plain name from "the provider module," so redirecting that one import
  line was the entire integration point.
- **`app/core/chat/deepseek_provider.py`** replaces the deleted `anthropic_provider.py` — DeepSeek's
  chat API is OpenAI-compatible, so this talks to `https://api.deepseek.com/chat/completions`
  directly over `httpx` (already a dependency throughout this backend) rather than adding a whole
  provider SDK for one endpoint. Same forced-tool-call pattern as before
  (`tool_choice: {"type": "function", "function": {"name": ...}}`), model `deepseek-chat`. Same
  never-raises, log-and-return-`None` discipline on any failure.
  `anthropic` removed from `requirements.txt` (no longer used anywhere). Config field renamed
  `anthropic_api_key` → `deepseek_api_key` (`app/config.py`); the `/feasibility/chat-parse` "not
  configured" check (`app/api/routers/feasibility.py`) and `.env`/`.env.example` updated to match.
- **Real, unrelated breakage found and fixed along the way, explicitly scoped by the user before
  touching it**: `backend/app/main.py` had a genuine syntax error (a duplicated, orphaned import
  block) from separate, in-progress work on a new "Coordinator" feature
  (`app/api/routers/coordinator.py`, `app/importer/loaders/uaa_coordinator.py`, an
  `/admin/coordinator` frontend page) that isn't part of this task and was actively being built
  concurrently in the same working tree. Confirmed with the user before touching anything outside
  this task's own scope — fixed *only* the duplicate-import syntax error in `main.py` (de-duplicated,
  kept the version that already includes `coordinator`) and *only* one bad import inside
  `coordinator.py` itself (`app.schemas.base` doesn't exist; aliased to the real
  `app.schemas.common.Page`, matching every other router's import pattern) — both fixes were
  necessary just to make `app.main` importable again for this task's own test suite to run, nothing
  else in either file touched. **`main.py`/`coordinator.py`/`uaa_coordinator.py`/the new
  `/admin/coordinator` frontend page are deliberately left uncommitted** — that feature is the
  user's own in-progress work, not this task's, and isn't this session's to commit.
- **Tests**: unchanged in substance — `test_trip_chat_service.py`/`test_feasibility_api.py::
  TestChatParse` already mocked at the `trip_chat_service.extract_trip_request` boundary (a
  module-attribute patch, not an import-path patch), so the provider swap needed only an import-path
  fix (`anthropic_provider` → `schema` for the shared dataclasses), not new test logic. 329 passing,
  unchanged count.
- **Live-verified against the real DeepSeek API, with the user's own key**: same finding as task
  #125's Anthropic attempt — the request reached DeepSeek correctly authenticated and formatted
  (a clean `402 Payment Required` / `"Insufficient Balance"`, not an auth or malformed-request
  error), confirming the integration itself is wired correctly; this DeepSeek account also needs
  funds added before a parse will actually succeed. Confirmed directly against DeepSeek's API with
  `curl`, independent of this app, to rule out an app-side misconfiguration before reporting it as
  an account-balance issue.

### 7.22 `uaa_coordinator.py` importer rewrite (task #128)

A separate, in-progress "Coordinator" feature (not built by this session, see §7.21's note) had
added `app/importer/loaders/uaa_coordinator.py` — an importer for `UAA_Coordinator_v5JTL.xlsm`
(VENDORS/AGENTS/INTEL/TEAMS/TAILS/MAYFLY sheets). Assessed before touching anything (per the user's
explicit "assess first"): it had a real bug in nearly every function — wrong field names against
`Aircraft`/`ImportSheetResult`, `next_billing_ref()` called positionally against a keyword-only
signature, a hand-built `TripLeg` missing `verdict`/`rule_engine_version`/`computed_snapshot` (which
reproduces the §10.2 stale-snapshot bug), a hardcoded `"GLF5"` fallback, raw Excel codes inserted
into FK columns unvalidated, and no `AGENTS` implementation at all. Rewritten to reuse this
codebase's own established importer conventions (`app/importer/loaders/aircraft.py`/`vendors.py`/
`operators.py`'s quarantine-by-prevalidation pattern) and to route `MAYFLY` through the real
`app.services.trip_service.create_trip` feasibility pipeline — the same code every other trip in
this system goes through — instead of hand-rolling a fake snapshot, wrapped in a `begin_nested()`
savepoint so one bad trip in the workbook can't poison the rest of the import. Verified end-to-end
against a real disposable Postgres test DB with a synthetic workbook covering all six sheets before
committing (commit `52c45bf`); no unit tests added, matching every other loader in this directory.

### 7.23 Trip-builder chat: Ollama, then all four providers with priority + workload failover (tasks #129–131)

DeepSeek (§7.21) hit the same billing wall Anthropic did (§7.19) — both accounts needed funds. User's
first call: swap to a self-hosted Ollama model instead (task #129, no billing risk). Provider swap
followed the same pattern as before — only `app/services/trip_chat_service.py`'s provider import
changed, `app/core/chat/schema.py`'s contract stayed put. `app/core/chat/ollama_provider.py` calls
Ollama's OpenAI-compatible endpoint directly over `httpx`, no SDK. New `ollama` service added to
`docker-compose.yml` (`ollama/ollama:latest`, named volume, deliberately **not** a hard `depends_on`
of `api` — chat is an optional feature, same NO_PROVIDER_CONFIGURED honesty as everywhere else).

User then asked to run all four providers (Ollama/DeepSeek/Anthropic/OpenAI) at once rather than
picking one (task #130), then refined that to priority-ordered, workload-aware failover with
per-provider suspension (task #131) — "concurrent... based on workload, one can also be suspended".
`app/core/chat/dispatcher.py` now owns provider selection: an admin-editable `chat_provider_priority`
named setting (CSV try-order), `chat_provider_suspended` (CSV, skip entirely regardless of order),
and `chat_provider_max_concurrent` (per-provider in-flight cap, Redis-backed via new
`app/core/chat/workload.py` — advisory, TTL-bounded so a crashed request can't wedge a provider
"busy" forever). A configured-but-failing provider falls through to the next candidate on `None`,
not just an unconfigured/suspended/busy one. `deepseek_provider.py`/`anthropic_provider.py` recreated
(both raw `httpx` against each provider's native API, no SDK — same reasoning as the DeepSeek swap);
new `openai_provider.py` added the same way. 9 dedicated tests
(`tests/integration/test_chat_dispatcher.py`) cover priority order, suspension, failure-failover, and
workload-based skip with mocked providers — never hits a real API from an automated test.

**Live-verified against all four real providers** (task #131, after the `llama3.2:1b` model finally
pulled through a very slow/unreliable connection — two large-image-pull failures on
`ollama/ollama:latest` mid-download before it succeeded): a real `/feasibility/chat-parse` request
correctly tried Ollama first (60s timeout hit), fell through to DeepSeek (real `402 Payment
Required`), then to Anthropic (real `400`/"credit balance too low" — same billing wall as §7.19, just
a different status code), and correctly skipped OpenAI (no key configured) — proving the failover
chain itself is wired correctly end-to-end. **Two real findings from that live test, not just
"needs funding":**
- The `ollama` container's `mem_limit: 900m` (chosen for a small target VPS) was too tight for
  `llama3.2:1b` — confirmed via `docker stats` showing 99.9% memory and **37GB of block I/O in a few
  minutes** (severe swap thrashing), not just slow CPU. Raised to 3GB for testing, at which point it
  ran cleanly (314% CPU across cores, 1.66GB block I/O) and completed in ~41s — `mem_limit` is now
  `${OLLAMA_MEM_LIMIT:-900m}`, overridable per-deployment; `ollama_provider.py`'s
  `REQUEST_TIMEOUT_SECONDS` raised 60s → 120s to give real headroom above the measured baseline.
- Even with clean, unthrottled execution, `llama3.2:1b`'s tool-call **did not follow the required
  nested `legs[]` schema** — it flattened everything to top-level keys, put the aircraft registration
  in `operator_name`, and inverted an avoid/include direction. This parses without raising (so it
  wouldn't have been caught by the None-on-failure discipline) but produces a wrong, not just
  incomplete, draft. Recommendation given to the user: a 1B local model isn't reliable enough for
  this specific structured-extraction task on either resource axis (memory *or* accuracy) — funding
  one of the hosted providers is the more trustworthy path; Ollama stays wired as a free, zero-key
  fallback in the priority list but shouldn't be the primary.

### 7.24 Fleet search filter on the operator detail page (task #132)

User: "add a search filter for fleet after choosing an operator". `/operators/[id]`'s Fleet section
gained the same `SearchInput`/`matchesQuery` client-side filter task #122 already established for
the top-level Fleet/Trips/Countries/Operators/Vendors list pages (matches registration, ICAO type,
manufacturer, model series, default callsign) — no backend change, the full fleet list was already
fetched in one call. Verified via a clean `next build` and a live HTTP check (browser automation
unavailable this session — no visual confirmation, endpoint/build-verified only).

### 7.25 Operator merge/dedup (task #133)

User: "add a way to merge operators if they happen to be the same with names similar" (e.g. "XYZ
Aviation Inc" vs "XYZ aviatio, Inc"). New `POST /operators/{keep_id}/merge`
(`app/services/operator_service.merge_operators`, SUPER_ADMIN only — same access level as delete)
reassigns every real FK reference onto the survivor: `aircraft`, `clients`,
`service_delivery_configs`, `confirmation_routing_configs`, `users` via plain bulk `UPDATE`s, and
`party_roles` via a special path — `PartyRole.operator_id` is 1:1 (`uq_party_role_operator`), so a
naive bulk update would violate that constraint whenever both operators already have their own
`PartyRole` row; in that case the duplicate's role is retired (soft-deleted) instead of reassigned,
otherwise it's moved over normally. Any of the survivor's own blank fields get backfilled from the
duplicate's real data (never silently discarded) before the duplicate is soft-deleted and an
`action="MERGE"` audit log entry is written. 7 integration tests
(`tests/integration/test_operators_api.py`) cover the fleet/client/config/user reassignment, both
`PartyRole` branches, the self-merge guard, stale-version rejection, and the RBAC gate. Admin UI on
`/operators/[id]` (SUPER_ADMIN only): search → pick duplicate → confirm (explicit "not reversible"
copy) → see exactly what moved and what was backfilled.

### 7.26 Trip Manager Overview redesign + a real `update_trip` PATCH bug fix (task #134)

User expected the trip detail page's Overview to look like a reference screenshot — titled summary
cards (Flight Details / Operator & Purpose / Requester Contact) with inline editing, plus the legs
table below. Clarified first (the screenshot's fields — PGH/TSS Team/Intel/Progress — actually matched
the separate, unrelated "Coordinator" feature's data model, not this app's Trip Manager) before
building; user chose to redesign v4's own Trip Manager page using its own real data, not build a new
Coordinator-feature page. `/admin/trips/[id]`'s Overview tab rebuilt as three cards using the
existing `EditableInfoField`/`EditableInfoSelect` components (already proven on the operator/person
detail pages) wired to the existing `PATCH /trips/{id}` endpoint — no new backend fields needed,
`TripUpdateIn` already covered all of it.

**Real bug found and fixed while live-testing the inline-clear path**: `update_trip` applied every
field with `if payload.X is not None`, which can never distinguish "the client omitted this field"
from "the client explicitly wants it cleared to null" — a nullable field could be *set* through this
endpoint but never *unset*. This silently broke "clear to blank" for every nullable `Trip` field,
including the pre-existing `owner_team` inline-edit, not just the newly-added fields. Fixed to the
same `payload.model_dump(exclude={"version"}, exclude_unset=True)` pattern
`operator_service.update_operator` already used correctly. New regression test
(`test_explicit_null_clears_a_nullable_field`) proves both directions: an explicit `null` now clears,
and an omitted field is still left untouched. Live-verified via `curl` against the real running stack
(set then clear `serial_number`/`ops_type` on a real trip, confirmed via direct DB-backed API
responses) before and after the fix, then cleaned up the test data.

### 7.27 Unrelated "Coordinator" feature removed (task #135)

The separate, in-progress "Coordinator" work flagged throughout §7.21–7.23 (not built by this
session) is no longer wanted — user's explicit call. `backend/app/api/routers/coordinator.py` and
`frontend/src/app/admin/coordinator/` deleted outright. `backend/app/main.py` — which had **both** a
real duplicate-import syntax fix (needed just to make the app importable at all, task #127) **and**
the coordinator router wiring tangled in the same file — kept the syntax fix, removed only the
`coordinator` import and `app.include_router(coordinator.router)` line; confirmed the app still
imports cleanly afterward. `backend/app/importer/loaders/uaa_coordinator.py` (§7.22) was **not**
touched — that file was already rewritten into real, tested, working code and committed on its own
merit, independent of whether the rest of the Coordinator feature survives.

### 7.28 Chat provider admin panel (task #136)

User asked how to change the priority list, then clarified they expected a real admin-panel control
for priority *and* per-provider delay/timeout, not a curl command each time. Two backend gaps closed
first: per-provider timeouts were hardcoded module constants (`REQUEST_TIMEOUT_SECONDS` in each of
`ollama_provider.py`/`deepseek_provider.py`/`anthropic_provider.py`/`openai_provider.py`), not
settings-driven like priority/suspension/concurrency already were. Added four new named settings
(`chat_timeout_<provider>_seconds`, FLOAT, defaulting to each provider's previous hardcoded value —
120s for Ollama given the task #131 measurement, 30s for the three hosted ones); each
`extract_trip_request` now takes an optional `timeout` kwarg that overrides its module constant, and
`dispatcher.py` resolves+passes the live setting value per call.

New `/admin/settings` page (SUPER_ADMIN-only edit, matching the backend's `require_admin` gate on
`PATCH /settings/{key}`; read-only for other roles) — reorder priority with up/down buttons, a
suspend checkbox and a timeout-seconds input per provider, one shared max-concurrent input, single
"Save changes" button that only PATCHes whichever settings actually changed (skips a needless
version bump on unchanged ones). Live-verified the full save round-trip against the real running
stack via direct API calls matching exactly what the UI sends (reorder, suspend, change a timeout),
confirmed `dispatcher._candidate_order` picks up the new state immediately, then reverted the test
values back to the sensible defaults before finishing.

### 7.29 OCR + LLM combination (task #137)

User: "combine ocr with llm's available", after being offered the tradeoff between text-first
(cheap, reuses existing Tesseract output) and vision-first (send the image straight to a
vision-capable LLM) — chose text-first.

Generalized the chat-provider layer first: each provider module
(`ollama_provider.py`/`deepseek_provider.py`/`anthropic_provider.py`/`openai_provider.py`) now
exposes a generic `call_tool(message, *, system_prompt, tool_name, tool_description, input_schema,
timeout)` primitive; `extract_trip_request` became a thin wrapper over it using
`app.core.chat.schema`'s trip-specific contract, so `trip_chat_service`'s call site and every
existing chat test are untouched. `dispatcher.py` grew a matching generic `call_tool(session, ...)`
entry point sharing the exact same priority/suspension/workload/timeout failover loop
(`extract_trip_request` and `call_tool` both call a new shared `_dispatch` helper) — "AI usage
priority" is one shared setting across every feature that calls an LLM in this codebase, not a
second copy of the plumbing per feature.

New `app/core/ocr/llm_extractor.py` builds a per-doc_type JSON schema directly from
`app.core.document_template_registry.DOCUMENT_TEMPLATES_BY_TYPE` (the same source of truth
`tesseract_provider.py`'s regex guesser already reads), sends Tesseract's already-extracted raw text
through `dispatcher.call_tool`, and coerces the result back into `dict[str, str]`
(`Document.extracted_fields`'s real shape) — dropping any key the LLM didn't ask for, dropping
null/empty guesses, joining list fields into a comma string. `ocr_service.run_document_ocr` merges
LLM-found fields on top of the regex guess (LLM overrides when it found something, the regex guess
survives for any field the LLM left null) and records `llm_extraction_used` in `ocr_raw_output` for
transparency. Still no more authoritative than before — `extracted_fields` stays a best-effort
suggestion checked at `/verify` time, never something that sets `Document.status` itself, and when no
provider is configured/available the whole LLM pass is a clean no-op (regex-only, exactly the
pre-task-#137 behavior).

**Real regression caught before it shipped**: the existing `test_document_ocr.py` positive-path test
went through real `run_document_ocr` unmocked — after this change that would have started making real
network calls to whichever LLM providers happen to be configured in `.env` on every test run (against
this codebase's own "never hit a real API from an automated test" discipline). Mocked
`extract_fields_via_llm` in that test and added two new ones proving the merge behavior directly
(LLM overrides regex; regex survives when the LLM has nothing). 12 new tests total
(`test_ocr_llm_extractor.py` + the two additions), 360 passing overall.

Scope note: this only applies to Person/Party documents (passport, pilot license, medical
certificate, operator certificate) — `AircraftDocument` (registration, insurance, permits, etc.) has
no OCR pipeline at all yet, not even the Tesseract regex pass, and has no `expected_fields` schema
defined anywhere (~70+ distinct aircraft `doc_type` values found on one real aircraft's document set
in live testing, e.g. `PERMIT_US_CUSTOMS_BOND`, `LTR_VISA_WAIVER_PROGRAM_AGREEMENT` — the frontend's
`AircraftDocumentType` union is stale/incomplete relative to what's actually stored). Extending this
feature to aircraft documents is a real follow-up, not done in this session — would need either a
much larger per-type template registry or an open-ended (no-fixed-schema) extraction approach.

---

## 8. Document storage & Excel import/export

### 8.1 S3/MinIO (`app/core/storage.py`)

`boto3` sync client wrapped in `asyncio.to_thread`. `ensure_bucket_exists()` runs idempotently at
FastAPI `lifespan` startup (and is called manually in `tests/integration/conftest.py`'s
session-scoped `engine` fixture, since `lifespan` never fires under `httpx.ASGITransport` in
tests). Downloads are **proxied through the API** as a `StreamingResponse`, never presigned URLs —
MinIO's internal hostname isn't reachable from a browser in this docker-compose topology.

### 8.2 Excel import (`app/importer/`)

`python -m app.importer.cli data/JTLlayout-Index_admin.xlsx` (or `make import`) is idempotent —
upserts on natural/business keys, prints a full readiness report, writes
`data/import_report.json`. 12 loaders under `importer/loaders/` (countries, airports, aircraft,
operators, clients, vendors, users, messaging, visa, country_requirements, service_catalogue,
settings_sync), each hand-mapped to the exact header/row layout of the corresponding sheet in the
real 700+-row production workbook.

Known lossy/quarantine points, all intentional and logged rather than silently dropped:
- 44 unnamed operators import `quarantined = true`.
- Aircraft with no resolvable operator, unknown `icao_type`, or duplicate registration are
  quarantined, never silently merged.
- `service_catalogue` parentage is **re-derived from the code prefix**
  (`app/domain/service_catalogue.py`), never trusted from the source's `parent_service_id` column
  — this is the actual fix for a historical off-by-one shift in the legacy data (SS-017+).
- Country lead times import with whatever provenance the sheet actually has (mostly none — all
  142 read `UNVERIFIED - USING FALLBACK` / `UNVERIFIED - NO SOURCE`, matching the source's own
  DATA READINESS sheet).
- The visa matrix ships (nearly) empty on purpose (1/24,708 cells answered) — an honest reflection
  of real data availability.

### 8.3 Excel export (`app/importer/export_service.py`, `GET /admin/import/export`)

Full reverse-ETL rebuilding the entire JTLlayout-style workbook from live DB state — all 16
sheets. `xlsx_reader.read_rows()` has a `stop_at_blank` mode (vs. a fixed `data_end_row`) so
sheets that started with a small template row-cap (MESSAGE TEMPLATES, USERS & SETTINGS) can
auto-expand via `ws.insert_rows` on both import and export without a hard ceiling. Verified via a
manual round-trip against the real production dataset (zero data loss) plus an auto-expand edge
case (pushed Users past its 4-row template cap; correctly grew).

Known genuinely lossy round-trip points (documented, not bugs to "fix" without a spec change):
Client's 4-column address collapses to 1 DB column; `Vendor.messaging_cc` has no corresponding
sheet column; User `operator_scope` NULL-vs-"ALL" is ambiguous in the sheet's own convention.

---

## 9. Queued / not-yet-started work

### 9.1 Other pending tasks (see live task tracker for current status)

- **Real marketing copy for the public landing page** — the layout itself shipped (§7.12), but the
  value-prop bullets and trust-signal line are still bracketed placeholders behind a "PLACEHOLDER
  COPY" badge, by explicit user direction, pending the user's actual copy.
- **No admin UI yet for vendor contacts / service delivery / confirmation routing configs**
  (task #86, §5.9) — backend CRUD + resolve endpoints are complete and tested; a Trip Manager
  panel to manage them is not yet built (arrives with task #105, see below).
- **`VendorCoverageAirport`/`VendorCoverageCountry` have no editing UI** — task #100's new
  `/vendors/[id]` detail page deliberately scoped to the fields that were previously inline-edited
  on the list (name, preference rank, capability status) plus the read-only context already
  modeled in the frontend (billing ref, service scope, approval/questionnaire dates). Coverage-row
  management (per-airport FBO/contact details, per-country CAA-account flags) is a genuinely
  separate editor — comparable in size to Operators' Fleet/AircraftForm section — not pulled into
  this pass.
- **Structured trip reference numbers (`YYMMNNN`)** — raised by the user alongside the four items
  that led to §4.24/§7.17/§7.18/§4.26–4.27, then explicitly deferred ("not quite accurate, I will
  come back to it") once the conversation moved to permit filing. Not started; `Trip` currently has
  no such field, and `build_reference_tag`'s `[JTL-{trip_id}-{leg_id}-...]` format is unrelated and
  unaffected either way.

### 9.2 The #95–114 backlog (permit validity, admin ops buildout, VIQ redesign)

A large follow-on scope opened after task #94, roughly the size of the rest of this build
combined — planned in one pass, tracked as 20 sequential tasks (#95–114) on the live task
tracker, executed in that order. **20 of 20 complete** (#95–114) — #109 (OCR pipeline) was
deliberately deferred once, then completed in a later session once the disk-space/GPU picture was
reassessed, see below. Groups, in order:

- **A (#95–98, data model foundations)**: permit validity (§4.12), trip status lifecycle (§4.13),
  billing reference numbers for Clients/Vendors, date-format cleanup to `formatUtc` everywhere.
- **B (#99–100, admin nav)**: dedupe 4 independently hand-maintained nav-link arrays into one
  shared constant; reverse the inline-edit pattern so Countries/Airports/Aircraft/Vendors require
  opening the item first (matching how Operators already works), building new detail pages for
  the three that don't have one yet.
- **C (#101–106, permit/service messaging)**: activates task #86's dormant `ServiceDeliveryConfig`
  resolution layer with an actual send mechanism — `ServiceAssignment` status/validity fields, a
  `ServiceMessage` comms-log table, an SMTP-send/IMAP-poll email client, "format & send" wired to
  #86's resolver + Jinja2 templates, a rebuilt admin Services tab with ground-handling
  sub-services, and a lightweight `notifications` table + PNR-email-on-submission.
- **D (#107–109, documents + OCR)**: person role vocabulary widened (§4.20 — target field was
  `PersonPublicIn.role`, not the plan's originally-assumed `PersonRoleHint`, confirmed by
  investigation); document auto-attach on permit application shipped (§4.21 — Party/Aircraft
  documents only, person/crew documents deliberately out of scope, see that section for why).
  **#109 (OCR pipeline) shipped** (§4.23) — originally deferred against Baidu's `Unlimited-OCR`
  (GPU-oriented, multi-GB, needing an isolated Docker service) when host disk space was down to
  ~5GB free; revisited once space recovered to ~16.4GB *and* it was confirmed this host has no GPU
  at all, which would have made the original model choice unusable regardless of disk space. Built
  against **Tesseract** (CPU-only) instead — no isolated service needed, just an apt-get addition to
  the existing `runtime`/`test` Docker stages.
- **E (#110–114, VIQ redesign)** — all shipped: captcha removed entirely (§4.22, plus a real
  pre-existing `LegEditor.tsx` crash bug found and fixed along the way); the form rebuilt as a
  progressive-disclosure wizard, Aircraft → Legs → Client info → Result (§7.13); the oversized
  native `datetime-local` widget replaced with a compact two-input date+time control and a more
  prominent departure/arrival toggle (§7.14); the MTOW kg/lb toggle restyled as a unit-suffix
  control (§7.15); the per-leg route maps merged into one combined multi-leg map (§7.16).

Full plan detail (file-by-file scope, reuse points, the two AskUserQuestion decisions this backlog
was gated on) lives in the plan file this was built from; the task tracker is the live source of
truth for what's done vs. pending.

---

## 10. Testing

```bash
make test                      # domain unit tests (no DB needed) + integration tests
```

Integration tests need a real PostgreSQL + PostGIS database (geometry columns have no SQLite
equivalent) and a reachable MinIO (aircraft document tests upload/download for real, no mock) —
`docker compose --profile test run --rm api-test pytest -q` is the exact command used throughout
this build to verify every change. **329 tests passing** as of the most recent full-suite run
(task #125 completion — 323 (task #124) + 6 new (§7.19's `test_trip_chat_service.py` +
`TestChatParse`); task #122's admin search/filter work added no new backend tests (client-side
only); count previously dropped from 309 to 299 at task #110 as captcha-specific tests were
deleted along with the feature, see §4.22), zero known failures. Note:
`api-test` builds from its own Dockerfile
`target: test` — rebuilding `api`/`web` does not rebuild it; always `docker compose build api-test`
too, or a stale image will silently run old test files without erroring (see §4.20).

Two established test-fixture gotchas, both real bugs hit and fixed during this build:
1. **`client` fixture uses a separate DB connection than `session`** — a fixture that only calls
   `await session.flush()` (not `commit()`) is invisible to HTTP requests made through `client` in
   the same test. Always `commit()` in fixtures that seed data the test's HTTP calls need to see.
2. **`lifespan` never fires under `httpx.ASGITransport`** — anything wired into FastAPI's
   `lifespan` (settings seeding, `storage.ensure_bucket_exists()`) needs an explicit manual call in
   `tests/integration/conftest.py`'s session-scoped `engine` fixture, or tests relying on that
   setup will fail confusingly (e.g. "bucket not found" on a document upload test).

### 10.1 ⚠️ `api-test` only depends on `db` — not `minio`/`redis`

`docker compose --profile test run --rm api-test pytest` only declares `depends_on: db` in
`docker-compose.yml` — it does **not** start `minio`. If you run the test suite right after a fresh
`docker compose up` of just `api-test` (or after a host reboot where only `db` happened to already
be running), every test that touches document storage — `test_aircraft_documents_api.py` and, via
the shared session-scoped `engine` fixture's `storage.ensure_bucket_exists()` call, potentially
others sharing that fixture — fails with `EndpointConnectionError: Could not connect to ...
minio:9000`, not because of a code bug. Fix: `docker compose up -d` (the full stack) before running
tests, not just the `api-test` profile in isolation. Hit this for real after a host reboot mid-session
(task #90) — only `db` had auto-restarted, `minio`/`redis`/`api`/`web` were all down, and 63 of 214
tests errored on the storage connection until the full stack was brought up.

### 10.2 ⚠️ `computed_snapshot` forward-compatibility (real bug hit during task #84)

`TripLeg.computed_snapshot` freezes a full `LegResultOut` dict at compute time, by design, for
exact historical reproducibility (see `RULE_ENGINE_VERSION`'s docstring — "a permit list filed six
months ago reproduces exactly, even after the engines change"). `trip_service._leg_out` reads it
back with `LegResultOut.model_validate(refreshed)`. **This silently breaks every existing trip
whenever a new required field is added to `LegResultOut`** — old snapshots simply don't have that
key, so Pydantic raises a validation error and the whole `GET /trips/{id}` 500s, forever, for that
trip. Discovered live-testing task #84: adding `aircraft_icao_type` to `TripLegDetailOut` was safe
(built from the live `TripLeg` row, not the snapshot), but tasks #79 (`reasons`) and #83
(`permit_fees`) had each silently broken every trip already in the dev DB — all 9 of them 500'd on
read, undetected by the test suite because every test creates a fresh trip (fresh snapshot),
never reads an old stale one.

**The fix, and the pattern to follow for any future `LegResultOut` field**:
- If the new field has a real equivalent on the `TripLeg`/`Trip` row itself (like
  `reference_datetime`/`arrival_datetime`, which are genuine stored columns independent of the
  snapshot), backfill it from the row before validating: `refreshed.setdefault("field",
  leg.field)` in `_leg_out` — this is the row's real value, not a fabrication.
- If the new field has no row equivalent (like `reasons`, `permit_fees` — genuinely never computed
  under the old snapshot), give it a safe default on the Pydantic model itself (`= None` or
  `Field(default_factory=list)`) so old snapshots validate with an honest "not available for this
  historical record" empty value, while every fresh computation still populates it for real.

Separately: 7 of the 9 pre-existing dev trips turned out to predate even *that* fix — their
snapshots were from structurally different schema generations entirely (`avoid_include` instead of
`state_avoid_include`/`fir_avoid_include`, a flat `souls_on_board_total` instead of nested
`souls_on_board.total`, etc.), not just missing one or two fields. These were genuine dev/test
debris from earlier in this same build session, not data worth an archaeological compatibility
effort — soft-deleted (`deleted_at`, never a hard `DELETE`, matching the app's own convention) so
the trips list stops 500ing. If you hit a similarly ancient snapshot in the future, check how many
fields are actually missing before deciding whether to patch defaults or just retire the record.

### 10.3 ⚠️ Raw-SQL `CREATE SEQUENCE` is invisible to the test DB's `create_all()` (task #97)

`tests/integration/conftest.py` builds the test schema via `Base.metadata.create_all()`/
`drop_all()` (line 39/53), never Alembic — fast, but it means anything created with a bare
`op.execute("CREATE SEQUENCE ...")` in a migration (as `d4e7b2f9c6a3` does for
`clients_billing_ref_seq`/`vendors_billing_ref_seq`) exists in the real dev DB but **not** in the
test DB, since SQLAlchemy's metadata has no idea it exists — `SELECT nextval('...')` 500s with
`UndefinedTableError` in every test, dev DB unaffected. Fix: register a standalone
`Sequence("name", metadata=Base.metadata)` object at module scope in the owning model file (see
`app.models.client.clients_billing_ref_seq`) — not attached to any column's `server_default`, just
present in `Base.metadata` so both `create_all()`/`drop_all()` and Alembic's own autogenerate
machinery know it exists. The actual `nextval()` call still happens explicitly in
`app.core.billing_ref.next_billing_ref`. Same fix applies to any future raw Postgres object
(sequence, extension) a migration creates outside a table definition.

### 10.4 ⚠️ `nginx` caches the `api` container's IP — recreate `api` without restarting `nginx` and the login breaks (task #105)

`nginx/nginx.conf`'s `upstream api_upstream { server api:8000; }` resolves the `api` hostname to a
concrete container IP **once**, at nginx worker startup, and never re-resolves it for the life of
that process (standard nginx behavior for a plain-hostname `upstream` block — no `resolver`
directive is configured for dynamic re-resolution). Every `docker compose up -d api` after a
rebuild gives the `api` container a **new** internal Docker network IP. If `nginx` itself isn't
also restarted afterward, it keeps proxying to the old, now-dead IP:
`connect() failed (111: Connection refused) ... upstream: "http://172.18.0.8:8000/..."` — every
request through the `:8080` front door 502s, while a direct in-container call to the API (e.g.
`docker compose exec api python -c "httpx.post('http://localhost:8000/...')`) works fine, since
that path never touches nginx at all. **Symptom is confusing**: the frontend's login form treats
any non-2xx response as "Invalid email or password" (task #105 discovery — it doesn't
distinguish a real auth failure from a 502), so this reads exactly like a credentials/seed-data
problem until you check the actual network response status or nginx's error log. Fix:
`docker compose restart nginx` any time `api` gets recreated and something starts 502ing through
port 8080 — this bit live browser verification for task #105 (two failed login attempts, correct
credentials, before the actual cause was found).

**Applies equally to `web`** — `nginx.conf` has a second `upstream web_upstream { server web:3000; }`
block with the identical caching behavior. Recreating `web` after a frontend rebuild needs the same
`docker compose restart nginx` follow-up (task #110). Standing rule going forward: restart nginx
after recreating **either** `api` or `web`, not just `api`.

---

## 11. Conventions (unconditional, apply everywhere)

- Country names shown to humans everywhere; ISO3 is a database/API key only (§7.10, task #90).
- ICAO is the primary airport identifier everywhere; IATA is a secondary bracketed label, never a
  key.
- All timestamps UTC with a `Z` suffix; display via `formatUtc()` (§7.2), never a raw ISO string
  or local time.
- Money as integer minor units with an explicit currency column (e.g.
  `operators.credit_limit_minor_units` + `operators.currency`).
- Soft delete only (`deleted_at`), enforced via the generic `Repository` in
  `app/repositories/base.py`. Never a hard `DELETE`.
- Every mutating service call writes an `audit_log` row.
- **Never fabricate or guess an operational or financial number.** If real data isn't configured,
  return `null` and flag the status explicitly (`NO_PROVIDER_CONFIGURED`, `UNVERIFIED - USING
  FALLBACK`, etc.) — never synthesize a plausible-looking value. This is the one rule every other
  convention in this document exists to protect.
