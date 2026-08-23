# Requirement / ServiceCase / ServiceOrder Model — Design (B1)

Status: Approved for implementation planning
Date: 2026-08-23

## Purpose

Introduce the `Requirement → ServiceCase → ServiceOrder` hierarchy the coordinator asked for, and migrate the existing `PermitRequest` data onto it — without changing any behavior a coordinator can currently observe. This is the "restructure the schema safely" half of Sub-project B; the compatibility/grouping engine (same-country + same-permit-type merging, landing/overflight kept separate) is B2, built afterward on top of this.

## Relationship to the larger request

Decomposition so far:
- **Sub-project A (done)** — `Trip` entity + workspace view.
- **Sub-project B1 (this spec)** — `Requirement`/`ServiceCase`/`ServiceOrder` schema, real migration of `PermitRequest` data onto it, API/behavior unchanged.
- **Sub-project B2 (future)** — the compatibility/grouping engine; real permit-type awareness in `CountryRequirement`/`FormTemplate`; multi-leg `Requirement`s.
- **Sub-project C (future)** — the ground-services module (fuel, catering, GPU, handling, etc.), built as new `ServiceCategory`/`ServiceType` values on this same model.

## Scope decisions (confirmed during brainstorming)

- **B1 is schema + migration only.** No compatibility/grouping logic, no permit-type awareness in `CountryRequirement`/`FormTemplate` — both deferred to B2, which is the plan that actually consumes them.
- **Status lifecycle: extend, don't replace.** `ServiceCase.status` keeps the exact same six values `PermitRequest.status` has today (`NOT_STARTED`/`REQUESTED`/`CHASING`/`CONFIRMED`/`RECONFIRM_REQUIRED`/`CANCELLED`). The already-shipped reconfirm/deadline engine (`evaluateReconfirm`, `ReconfirmSweepService`) keeps working against this exact same union — not the spec's original ~20-state lifecycle.
- **`responsibility` is new and real, but scoped narrowly.** Every `Requirement` gets a `responsibility` field (`OUR_ARRANGEMENT | CLIENT_ARRANGEMENT | OPERATOR_ARRANGEMENT | THIRD_PARTY_ARRANGEMENT | NOT_REQUIRED | WAIVED | TBD`), settable via the existing update endpoint, defaulting every migrated and newly-created row to `OUR_ARRANGEMENT`. What B1 does **not** add: a way to create a bare `Requirement` with no `ServiceCase` at all (e.g., marking a country `CLIENT_ARRANGED` before ever requesting anything) — today's only entry point is "create a permit request," which always produces a `Requirement` + `ServiceCase` + `ServiceOrder` together. A requirement-without-a-case flow is real, deferred, follow-up work, not a silently dropped requirement.
- **API surface unchanged.** `PermitsController`'s routes (`POST/GET /legs/:legId/permit-requests`, `GET /permit-requests`, `PATCH /permit-requests/:id`, `POST /permit-requests/:id/comms`) and response shape stay exactly as they are today, plus one new field (`responsibility`) on read and one new optional field on the `PATCH` body. The frontend's permit composer needs only a small addition to show/set `responsibility`; the Action Board, IMAP inbound matching, and Notifications module need zero changes.
- **`PermitsService`/`PermitsController`/`PermitsModule` keep their names.** They represent "the permit-flavored view of the generic engine" — Sub-project C will add a parallel controller for ground services reusing the same three entities, not rename this one.

## Data model

Three new tables replace `permit_requests`. All three live in a new `backend/src/service-cases/` directory (not `permits/`) since they're the generic, reusable model — `PermitsModule` registers them via `TypeOrmModule.forFeature([...])` directly, the same way `NotificationsModule` already reaches into other modules' entities.

### `Requirement`

```typescript
export type Responsibility =
  | 'OUR_ARRANGEMENT'
  | 'CLIENT_ARRANGEMENT'
  | 'OPERATOR_ARRANGEMENT'
  | 'THIRD_PARTY_ARRANGEMENT'
  | 'NOT_REQUIRED'
  | 'WAIVED'
  | 'TBD';

@Entity('requirements')
export class Requirement {
  id: string;
  legId: string;                 // single leg for B1 — B2 adds multi-leg via a join table
  country: string;
  serviceCategory: string;       // 'PERMIT' for everything B1 creates/migrates
  serviceType: string;           // 'PERMIT' for everything B1 creates/migrates — B2 introduces real OVERFLIGHT/LANDING values
  responsibility: Responsibility; // default 'OUR_ARRANGEMENT'
  requiredByZ: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### `ServiceCase`

```typescript
export type ServiceCaseStatus =
  | 'NOT_STARTED' | 'REQUESTED' | 'CHASING' | 'CONFIRMED' | 'RECONFIRM_REQUIRED' | 'CANCELLED';

@Entity('service_cases')
export class ServiceCase {
  id: string;
  requirementId: string;
  status: ServiceCaseStatus;
  validFrom: Date | null;
  validTo: Date | null;
  clearanceNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### `ServiceOrder`

```typescript
@Entity('service_orders')
export class ServiceOrder {
  id: string;
  serviceCaseId: string;
  submissionEmail: string | null;
  correlationToken: string;      // unique, same convention as today
  createdAt: Date;
  updatedAt: Date;
}
```

### `Comm`

`permitRequestId` renamed to `serviceCaseId` — same nullable uuid column, same meaning ("this comm belongs to this case's thread"), no new relationship introduced.

No foreign-key constraints on any of `requirements.leg_id`, `service_cases.requirement_id`, `service_orders.service_case_id`, or `comms.service_case_id` — matching the existing convention in this exact area of the schema (`permit_requests.leg_id` and `comms.leg_id`/`comms.permit_request_id` have never had DB-enforced FKs either; referential integrity here has always been application-level).

## Migration design

The one-time data migration is built around a deliberate id-reuse trick to minimize remapping risk:

- `service_cases.id` for each migrated row **is** the original `permit_requests.id` for that row.
- `requirements.id` for each migrated row **also uses that same value** (harmless — primary keys are only unique within their own table, and nothing outside this migration references `requirements.id` yet).
- Therefore `service_cases.requirement_id` (= the id shared by both new rows for that source row) is correct with zero lookup/mapping step, and `comms.permit_request_id`'s existing values are *already* valid `service_cases.id` values — the Comms migration is a plain `RENAME COLUMN`, not a data rewrite.
- `service_orders.id` gets a fresh `gen_random_uuid()` (nothing references it elsewhere yet); `service_orders.service_case_id` uses the shared id.

```sql
INSERT INTO requirements (id, leg_id, country, service_category, service_type, responsibility, required_by_z, created_at, updated_at)
SELECT id, leg_id, country, 'PERMIT', 'PERMIT', 'OUR_ARRANGEMENT', required_by_z, created_at, updated_at
FROM permit_requests;

INSERT INTO service_cases (id, requirement_id, status, valid_from, valid_to, clearance_number, created_at, updated_at)
SELECT id, id, status, valid_from, valid_to, clearance_number, created_at, updated_at
FROM permit_requests;

INSERT INTO service_orders (id, service_case_id, submission_email, correlation_token, created_at, updated_at)
SELECT gen_random_uuid(), id, submission_email, correlation_token, created_at, updated_at
FROM permit_requests;

ALTER TABLE comms RENAME COLUMN permit_request_id TO service_case_id;

DROP TABLE permit_requests;
```

`down()` reverses this: recreate `permit_requests`, repopulate it by joining `requirements`/`service_cases`/`service_orders` on their shared id, rename `comms.service_case_id` back, drop the three new tables.

## Service layer

`PermitsService` is internally restructured to operate across four repositories (`Requirement`, `ServiceCase`, `ServiceOrder`, plus the existing `Comm`/`Leg`/`CountryRequirement`/`FormTemplate`), but every public method keeps its current signature and returns the same flattened object shape `PermitRequest` used to, plus `responsibility`:

```typescript
{ id, legId, country, status, requiredByZ, validFrom, validTo, clearanceNumber, correlationToken, submissionEmail, responsibility, createdAt, updatedAt }
```
where `id`/`createdAt`/`updatedAt` come from `ServiceCase`, `legId`/`country`/`requiredByZ`/`responsibility` from `Requirement`, and `correlationToken`/`submissionEmail` from `ServiceOrder`.

- `create(legId, country)` — creates one `Requirement` (responsibility defaults to `OUR_ARRANGEMENT`), one `ServiceCase`, one `ServiceOrder`, in that order, exactly mirroring today's single-`PermitRequest`-row creation, save/send/Comm-logging logic otherwise untouched.
- `update(id, dto)` — `id` is a `ServiceCase.id`. Status/clearanceNumber/validFrom/validTo update `ServiceCase` as today; a new optional `dto.responsibility` updates the linked `Requirement`.
- `findByLeg(legId)` — finds `Requirement`s by `legId`, joins each to its `ServiceCase`/`ServiceOrder` in application code (this codebase's established style — no TypeORM relation decorators anywhere in the app; every existing join is a manual per-row lookup, e.g. `findAllWithUrgency`'s current leg lookup loop).
- `findAllWithUrgency()` — same manual-join pattern, now three tables instead of one, urgency still computed from `Requirement.requiredByZ`.
- `reconcileForLeg(legId, currentArrDateZ)` and `ReconfirmSweepService.sweep()` — both currently read `{status, requiredByZ, validFrom, validTo}` off one `PermitRequest` row to call the untouched pure function `evaluateReconfirm`. They now assemble that same shape from `ServiceCase` (status/validFrom/validTo) joined to its `Requirement` (requiredByZ) before calling it, and write `status` back to `ServiceCase`. `evaluateReconfirm` itself does not change.
- `addManualComm(serviceCaseId, input)` — same logic, renamed parameter, writes `Comm.serviceCaseId` instead of `Comm.permitRequestId`.

## Frontend

- `frontend/src/lib/api-client.ts`'s `PermitRequest` interface gains `responsibility: Responsibility`.
- `frontend/src/app/legs/[id]/permit-requests.tsx` gets one small addition: a `responsibility` select/badge per row, wired to the existing `updatePermitRequest` call (now also accepting `responsibility` in its input type).
- No other frontend file changes — Action Board, Notifications, and every other page are unaffected.

## Explicitly out of scope (this spec)

- The compatibility/grouping engine (same-country/same-type merging; landing vs. overflight separation) — B2.
- Real permit-type awareness in `CountryRequirement`/`FormTemplate` — B2.
- Multi-leg `Requirement`s (a `requirement_legs` join table) — B2, when grouping needs it.
- A "create a bare Requirement, no ServiceCase yet" flow — real, deferred follow-up, not part of B1.
- Multiple `ServiceOrder`s per `ServiceCase` (retry-to-a-different-vendor tracking) — B1 keeps the current 1:1 shape; Sub-project C or a later B-series spec can add it when there's a real need.
- The ground-services module itself — Sub-project C.
