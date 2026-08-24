# Compatibility / Grouping Engine — Design (B2)

Status: Approved for implementation planning
Date: 2026-08-24

## Purpose

Let a coordinator merge permit requests that are compatible across legs of the same trip — same country, same permit type (Overflight vs. Landing) — into a single Requirement, so one clearance email and one clearance number can cover multiple legs instead of sending duplicate requests. This is the second half of Sub-project B, built on B1's `Requirement → ServiceCase → ServiceOrder` schema.

## Relationship to the larger request

Decomposition so far:
- **Sub-project A (done)** — `Trip` entity + workspace view.
- **Sub-project B1 (done)** — `Requirement`/`ServiceCase`/`ServiceOrder` schema, migration off `PermitRequest`, API/behavior unchanged.
- **Sub-project B2 (this spec)** — compatibility/grouping engine; real Overflight/Landing awareness in `CountryRequirement`/`FormTemplate`; multi-leg `Requirement`s.
- **Sub-project C (future)** — the ground-services module (fuel, catering, GPU, handling, etc.), built as new `ServiceCategory`/`ServiceType` values on this same model.

## Scope decisions (confirmed during brainstorming)

- **Merging is coordinator-confirmed, never silent or automatic.** When a coordinator requests a permit and a compatible existing request is found, the system surfaces it and the coordinator explicitly chooses "merge" or "create separate." No merge happens without that choice.
- **Permit type is chosen by the coordinator, not inferred.** The "Request Permit" action gains a required Overflight/Landing choice. Compatibility matching is exact on this value — an Overflight request never merges with a Landing request for the same country.
- **Merging is offered only pre-confirmation.** A candidate Requirement is eligible only while its `ServiceCase.status` is `REQUESTED`, `CHASING`, or `RECONFIRM_REQUIRED`. Once a request is `CONFIRMED`, a new leg always gets its own separate request — merging into an already-cleared permit is out of scope, avoiding ambiguity about whether one clearance number covers legs it was never actually cleared for. (`NOT_STARTED` is excluded too: `PermitsService.create()` always sends immediately today, so no request is ever actually left in `NOT_STARTED` in practice.)
- **Compatibility is scoped to one trip.** The candidate search looks only at other legs of the same `Trip` (via the existing `Leg.tripId` from Sub-project A) — never across different trips, even for the same aircraft.
- **`CountryRequirement`/`FormTemplate` split into per-type rows now**, not deferred further. Each becomes keyed by `(country, serviceType)` instead of `country` alone. The 15 existing seeded countries get duplicated into an Overflight row and a Landing row with identical starting values — real per-type lead times/templates remain a coordinator follow-up, exactly as the existing seed data's placeholder values already are today (see the comment at the top of `seed-country-requirements.ts`).
- **The API's `legId: string` becomes `legIds: string[]` on every permit-request response.** This is a deliberate, real break from B1's byte-stable contract — multi-leg merging makes a single `legId` field meaningless once a request can span more than one leg. Every internal and frontend consumer of the old field is updated as part of this work (see "Blast radius" below).
- **Merging is a data-model change only — no new communication.** Adding a leg to an existing Requirement does not send a new email to the permitting authority. If the coordinator needs to tell the authority about the additional leg, they use the existing manual-comm/notes flow. Automating that notification is a real, deferred follow-up.

## Data model

### `Requirement` — modified

```typescript
export type ServiceType = 'OVERFLIGHT' | 'LANDING';

@Entity('requirements')
export class Requirement {
  id: string;
  // legId column REMOVED — replaced by the requirement_legs join table
  country: string;
  serviceCategory: string;       // still 'PERMIT'
  serviceType: ServiceType;      // NEW — was a generic 'PERMIT' placeholder in B1
  responsibility: Responsibility;
  requiredByZ: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### `RequirementLeg` — new join table

```typescript
@Entity('requirement_legs')
export class RequirementLeg {
  id: string;
  requirementId: string;
  legId: string;
  createdAt: Date;
}
```

No unique constraint pairing `(requirementId, legId)` at the DB level — matches this codebase's established convention of application-level referential integrity in this area (no FK constraints anywhere in `permits`/`service-cases`).

### `CountryRequirement` — modified

Adds `serviceType: ServiceType`. The existing `@Column({ unique: true }) country` becomes a plain (non-unique) column; uniqueness moves to the application layer as "one row per (country, serviceType)" (matching this area's no-DB-constraint convention rather than a composite unique index, for consistency with the rest of the schema).

### `FormTemplate` — modified

Adds `serviceType: ServiceType`. Same non-unique-at-DB-level treatment as `CountryRequirement`.

### `ServiceCase` / `ServiceOrder`

Unchanged. A merged Requirement still has exactly one `ServiceCase` and one `ServiceOrder` — the 1:1 shape B1 established stays as-is; the merge only ever adds rows to `requirement_legs`.

## Migration

1. Create `requirement_legs`.
2. Backfill: `INSERT INTO requirement_legs (id, requirement_id, leg_id, created_at) SELECT gen_random_uuid(), id, leg_id, now() FROM requirements` — one row per existing Requirement, preserving today's single-leg data exactly.
3. `ALTER TABLE requirements DROP COLUMN leg_id`.
4. `ALTER TABLE requirements ADD COLUMN service_type varchar NOT NULL DEFAULT 'OVERFLIGHT'` (arbitrary default for pre-existing rows, which predate type-awareness entirely — coordinators can correct any that were actually Landing after the fact via the existing update endpoint, which B2 extends to accept `serviceType`).
5. `ALTER TABLE country_requirements ADD COLUMN service_type varchar NOT NULL DEFAULT 'OVERFLIGHT'`, then duplicate every existing row into a second row with `service_type = 'LANDING'` (same values otherwise) so both types are represented before the seed script's idempotent `findOne` guards start skipping rows that already exist.
6. Same duplication for `form_templates`.

`down()` reverses all of the above: drop the duplicated `LANDING` rows, drop the `service_type` columns, re-add `requirements.leg_id`, backfill it from `requirement_legs` (taking the first/only leg — this is a real, acknowledged data-loss point in `down()` for any Requirement that had actually been merged before rolling back; acceptable for a `down()` path, which this project's migrations have never needed to run in practice), then drop `requirement_legs`.

## Service layer

### Compatibility check — new

```typescript
async findCompatible(legId: string, country: string, serviceType: ServiceType): Promise<{
  requirementId: string; legIds: string[]; status: ServiceCaseStatus; correlationToken: string;
} | null>
```

Looks up the leg's `tripId`, finds all other legs on that trip, finds any `Requirement` whose `requirement_legs` includes one of those legs with matching `country`/`serviceType`, and whose `ServiceCase.status` is `REQUESTED`/`CHASING`/`RECONFIRM_REQUIRED`. Returns the first match (in practice there should only ever be zero or one, since a second compatible request would itself have been offered for merging when it was created) or `null`.

### `create(legId, country, serviceType)` — modified

Same as B1's `create()`, plus: writes `serviceType` onto the new `Requirement`, and inserts one `requirement_legs` row (`requirementId`, `legId`) instead of the old `legId` column. `CountryRequirement`/`FormTemplate` lookups become `findOne({ where: { country, serviceType } })`.

### `merge(legId, requirementId)` — new

Validates the target `Requirement` exists, its `ServiceCase.status` is still pre-confirmation (re-checked server-side, not trusted from the earlier compatibility-check response — the status could have changed in between), and the leg isn't already in its `requirement_legs`. Inserts the new `requirement_legs` row. Returns the same flattened shape as `create()`/`update()`, now with the expanded `legIds`.

### `toFlat()` — modified

```typescript
{ id, legIds, country, serviceType, status, requiredByZ, validFrom, validTo, clearanceNumber,
  correlationToken, submissionEmail, responsibility, createdAt, updatedAt }
```

`legIds` is built from a `requirementLegRepo.find({ where: { requirementId } })` lookup, mapped to leg ids — this codebase's established manual-join style, same pattern `findAllWithUrgency` already uses for its leg lookup.

### `findByLeg(legId)` — modified

Was `requirementRepo.find({ where: { legId } })`; becomes: find all `requirement_legs` rows for this `legId`, then load each referenced `Requirement` (and its `ServiceCase`/`ServiceOrder` as before).

### `reconcileForLeg` / `ReconfirmSweepService.sweep()` — modified

For a merged Requirement, the reconfirm check must consider every leg in `requirement_legs`, not just one — the confirmed validity window needs to cover all of them. `evaluateReconfirm()` itself (the pure function, single `currentArrDateZ` parameter) is untouched. Both callers change only in how they pick which leg's `arrDate` to pass it: look up every leg on the Requirement and pick the first one (by `arrDate`) that falls outside `validFrom`/`validTo`, if any; call `evaluateReconfirm` with that leg's `arrDate` (correctly producing `RECONFIRM_REQUIRED`). If every leg is still within the window, call it with any one leg's `arrDate` — e.g. the earliest, chosen deterministically — which correctly leaves the status unchanged, since all legs being in-window is exactly the case where nothing should flip.

## API

- `POST /legs/:legId/permit-requests` — body gains a required `serviceType: 'OVERFLIGHT' | 'LANDING'`. Otherwise unchanged route/verb.
- `GET /legs/:legId/permit-requests/compatible?country=X&serviceType=Y` — new. Returns the compatibility-check result (candidate or `null`).
- `POST /legs/:legId/permit-requests/merge` — new. Body: `{ requirementId: string }`.
- `PATCH /permit-requests/:id` — gains an optional `serviceType` field (for correcting a pre-B2-migration row's arbitrary default, per the migration note above).
- Every other route unchanged.

## Frontend

- `PermitRequests` (`frontend/src/app/legs/[id]/permit-requests.tsx`): the single "Request Permit — {country}" button becomes a small form — a required Overflight/Landing select plus the button. On submit: call the new compatibility-check endpoint first; if a candidate comes back, show an inline confirm ("An Overflight request for Egypt already exists for this trip — Merge into it, or create a separate request?") with two actions wired to `merge()` and the existing `create()` (now passing `serviceType`) respectively. If no candidate, call `create()` directly as today.
- The permit list row's `Country`/`Status`/`Responsibility`/`Clearance No` columns are unchanged; a merged request additionally shows which legs it covers (e.g. a small "covers legs 44, 61" note) when `legIds.length > 1`.
- `frontend/src/lib/api-client.ts`: `PermitRequest.legId: string` → `legIds: string[]`; adds `serviceType`; `createPermitRequest` gains a `serviceType` parameter; new `checkCompatiblePermitRequest()` and `mergePermitRequest()` functions.
- `frontend/src/app/action-board/page.tsx`: the leg link (`r.legId`) switches to `r.legIds[0]` (the anchor/first leg — a merged request still needs exactly one link target for the Action Board row).

## Blast radius (files touched)

Backend: `requirement.entity.ts`, new `requirement-leg.entity.ts`, `country-requirement.entity.ts`, `form-template.entity.ts`, new migration, `permits.service.ts`, `permits.controller.ts`, `permits.module.ts`, `reconfirm-sweep.service.ts`, `dto/create-permit-request.dto.ts`, `dto/update-permit-request.dto.ts`, `data-source.ts`, `seed-country-requirements.ts`, plus their test files.

Frontend: `api-client.ts`, `permit-requests.tsx`, `action-board/page.tsx`, plus their test files.

## Explicitly out of scope (this spec)

- Un-merging a leg once merged.
- Sending a follow-up email/notification when a leg is added to an existing request.
- Real, coordinator-vetted per-type lead times/templates/submission emails — B2 only duplicates today's placeholder values into both types.
- Merging into an already-`CONFIRMED` request.
- Cross-trip compatibility.
- The ground-services module — Sub-project C.
