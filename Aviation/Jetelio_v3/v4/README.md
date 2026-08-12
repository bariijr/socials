# Jetelio V3 (v4 rebuild) — Phase 1

Flight-support trip and permit planning platform for business-jet and charter
operations across Africa, the Middle East, Europe and India. This is the
Phase 1 slice of the V3 rebuild: **compose skeleton → PostGIS geometry →
migrations → idempotent importer with a readiness report → reference-data
CRUD API → a minimal reference-data browser UI**. Engines (routing, permits,
performance, credentials), Feasibility IQ, the Trip Manager, documents,
messaging, PDF/branding all land in later phases per the build order below.

## Quickstart

```bash
cp .env.example .env        # fill in POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, JWT_SECRET_KEY
make up                     # docker compose up --build -d — migrations run automatically
make import                 # loads .LAYOUT/JTLlayout-Index_admin.xlsx and prints the readiness report
```

Then open `http://localhost:8080` (nginx). The API is at `http://localhost:8080/api`,
OpenAPI docs at `http://localhost:8080/docs`.

Seeded demo users (see `app/importer/loaders/users.py`) all share the password
`Jetelio-Phase1-ChangeMe!` — reset before any real use. Roles: `ops@jetelio.com`
(SUPER ADMIN), `specialist@jetelio.com` (OPERATIONS SPECIALIST),
`audit@jetelio.com` (AUDITOR), `ops@example.com` (CLIENT - VIEW ONLY).

## Architecture

Layered per the spec: **api routers → services (use cases) → domain (pure
functions) → repositories → db**. The domain layer
(`app/domain/*`) imports nothing from FastAPI or SQLAlchemy — it is
unit-tested in isolation (`tests/unit/domain/`) so its outputs can be diffed
against the legacy workbook.

```
v4/
├── docker-compose.yml        # db(PostGIS) · redis · minio · mailhog · api · worker · web · nginx
├── .env.example
├── Makefile
├── data/
│   ├── JTLlayout-Index_admin.xlsx   # importer source
│   └── geo/                          # Natural Earth 10m countries + VATSpy FIR boundaries (see geo/SOURCES.md)
├── backend/
│   ├── Dockerfile             # multi-stage, non-root, pinned base
│   ├── docker-entrypoint.sh   # runs `alembic upgrade head` before serving
│   ├── alembic/versions/      # one hand-trimmed initial migration (18 reference-data tables)
│   └── app/
│       ├── models/            # SQLAlchemy ORM — one file per domain area
│       ├── schemas/           # Pydantic v2 request/response shapes
│       ├── domain/            # pure functions: reference_status, visa_resolution, service_catalogue
│       ├── repositories/      # generic CRUD repo (optimistic lock + soft delete) + audit log writer
│       ├── services/          # use-case layer, one per entity group
│       ├── api/routers/       # thin FastAPI routers
│       ├── importer/          # xlsx_reader, geo_loader, loaders/*, cli.py (`python -m app.importer.cli`)
│       └── worker/            # Celery app (no tasks yet — Phase 2+)
├── frontend/                  # Next.js 14 App Router, TS, Tailwind, TanStack Query
└── nginx/                     # reverse proxy: /api -> api, /docs -> api, else -> web
```

## The verification contract

This is what makes the platform trustworthy rather than merely plausible.
Every fallback number lives in the `settings` table (seeded from
`app/core/settings_registry.py`, editable by SUPER ADMIN) — no engine or
service contains a hard-coded literal. Every reference fact that matters
operationally carries `source` / `verified_by` / `verified_on`; presence of a
value is never treated as verification. Every derived status
(`countries.reference_status`, `aircraft_performance.planning_status`,
`airports.tech_stop_readiness`, `operators.assignable`) is computed on read
by `app/domain/reference_status.py`, never stored as an editable typed field.

`GET /readiness/pilot-exit-gates` recomputes the nine pilot-exit gates live,
every call — country lead times, permit flags, ground-handling policy,
operators assignable, aircraft types approved, airports tech-stop ready,
visa matrix cells, vendor questionnaires, country requirement records. While
any gate is blocked (true on a fresh import — see below) the app is in
**PILOT** mode; the frontend's `GateBanner` renders on every page.

## Importer

`python -m app.importer.cli data/JTLlayout-Index_admin.xlsx` (or `make
import`) is idempotent — safe to re-run, upserts on natural/business keys.
It prints a full report (rows seen/loaded/skipped/quarantined per sheet,
the data-readiness breakdown, and the nine gates) and writes
`data/import_report.json`.

Migration defects fixed on import, not carried over:
- **service_catalogue parentage** is re-derived from the code prefix
  (`app/domain/service_catalogue.py`), never trusted from the source's
  `parent_service_id` column — this is the actual fix for the historical
  SS-017+ off-by-one shift. Unresolvable rows fail loudly.
- **44 unnamed operators** are imported and flagged `quarantined = true`,
  `quarantine_reason = 'BLOCKED - OPERATOR NAME REQUIRED'` — visible, not
  dropped.
- **Aircraft with no resolvable operator, or with an unknown icao_type,
  or a duplicate registration** are quarantined (skipped, logged), never
  silently merged or admitted with a dangling reference.
- **Country permit lead times and flags** import with whatever
  source/verified_by/verified_on the sheet actually has — for the shipped
  workbook that's none, so all 142 read `UNVERIFIED - USING FALLBACK` /
  `UNVERIFIED - NO SOURCE`, exactly matching the DATA READINESS sheet.
- The **visa matrix ships (nearly) empty** on purpose — 1 of 24,708 cells
  answered is the correct, honest import result, not a bug.

Geo data (`data/geo/`) is real PostGIS polygons — Natural Earth 10m
admin-0 countries (public domain) and the VATSpy Data Project's FIR
boundaries (CC BY-SA 4.0, attribute on any published output) — never the
0.5° raster grid the spec calls out to retire. See `data/geo/SOURCES.md`.

## Tests

```bash
make test                      # domain unit tests (no DB needed) + integration tests
```

Integration tests need a real PostgreSQL + PostGIS database (geometry
columns have no SQLite equivalent); point `TEST_DATABASE_URL` at one — the
`db` service works once you `CREATE DATABASE jetelio_v4_test`.

## Build order (spec)

1. ✅ Compose, DB, PostGIS, migrations, importer with readiness report, reference CRUD — **this phase**
2. Routing, permit, deadline and performance engines as pure functions with full unit tests
3. Feasibility IQ public form
4. Trip Manager console and the register
5. Documents (OCR + verification), visas, vendors, billing
6. Messaging engine, templates, bulk dispatch, inbound parsing
7. PDF trip sheet, notifications, audit, RBAC hardening, PWA, branding panel

## Conventions

Country names shown to humans everywhere; ISO3 is a database/API key only.
ICAO is the primary airport identifier everywhere; IATA is a secondary
bracketed label, never a key. All timestamps UTC with a `Z` suffix. Money as
integer minor units with an explicit currency column. Soft delete only
(`deleted_at`), enforced via the generic `Repository` in
`app/repositories/base.py`. Every mutating service call writes an
`audit_log` row (actor, action, entity, from/to, reason).
