# VIQ Reusable Permit Authorizations — Design

Sub-project selected from
[2026-09-02-viq-phase0-architectural-assessment.md](2026-09-02-viq-phase0-architectural-assessment.md)'s
Phase 4 (§11, §13, §14, §16). This is the third slice of Phase 4, following
§11 Service Responsibility (shipped) and preceding §13 Bulk Submission
Compatibility (deferred until this ships — §13's grouping rules depend on
knowing which services are authorization-covered vs. requiring a fresh
application). §16 Required Document Attachment Engine remains deferred
pending doc-intel's own verification UI, per the earlier scoping decision.

Scope chosen by the user: the **full reusable-across-trips model**, not the
smaller trip-scoped `PermitType` field alternative that was also on the
table.

## Problem

Every Permit-type and Overflight-type `Service` is currently trip-scoped:
`generateOverflightServices`/`generateArrivalServices`
(`src/server/modules/services/services.service.ts`) always create a fresh
row starting at `Not Started`, even when the operator already holds a
verified Blanket, Block, or Seasonal permit that covers that country and
service type for the whole validity window. Coordinators currently have no
way to record "this operator is already cleared here" — every trip
re-requests from scratch.

## Scope

In scope:
- A new `PermitAuthorization` entity: a verifiable, reusable authorization
  scoped to an **Operator** (not a trip or a single aircraft), covering one
  country and one service type (`Permit` | `Overflight`) for a validity
  window, with a Blanket/Block/Seasonal type.
- Automatic matching at service-generation time: when
  `generateOverflightServices`, `reconcileOverflightServices`, or
  `generateArrivalServices` creates a new service, it checks for a Verified
  authorization covering (operator, country, service type, leg date) and,
  if found, creates the service already `Confirmed` and linked to the
  authorization instead of `Not Started`.
- A manual "link authorization" action on any existing service, for the
  (common) case where the authorization is verified after the service
  already exists.
- CRUD + verify/revoke API and an Admin management page for authorizations.
- Service-level display of authorization coverage.
- Tests for matching logic and the authorization CRUD/verify/revoke module.

Explicitly out of scope:
- Any change to `ServiceType` itself — `Permit`/`Overflight`/`GroundHandling`
  are unaffected. "Permit Type" (Blanket/Block/Seasonal) describes the
  *authorization*, not the service.
- Aircraft/callsign-level matching — authorizations match at the Operator
  level only (see "Coverage matching" below for why).
- Any change to the wizard/trip-creation flow. Matching happens purely at
  generation time on the server; no new UI step in `NewTripWizard`.
- §13 Bulk Submission Compatibility grouping rules — a separate, later slice.
- §16 Required Document Attachment Engine, and any change to the new
  `documents` module's still-unfinished verification UI — an authorization's
  optional supporting document links to the existing, working `DocAttachment`
  model instead (see "Document linkage" below).
- Auto-expiring authorizations via a cron job, and any stored `'Expired'`
  status value. `status` has exactly three stored values: `'Draft'`,
  `'Verified'`, `'Revoked'`. Whether an authorization has run past its
  `validUntil` is computed at read time for display only (an "Expired"
  badge shown alongside `Verified` in the Admin UI) — it never changes
  the stored `status`, and it doesn't need to: `resolveAuthorization`'s
  date-range check already excludes a past-`validUntil` authorization from
  matching regardless of its `status` value, so there is no separate
  "expire" action to build.

## Coverage matching

An authorization matches a service-generation candidate when:
`operatorId` (resolved from `Trip.registration` → `Aircraft.currentOperatorId`
→ `Operator`) + `countryIso2` + `serviceType` all match, `status = 'Verified'`,
and the leg's `etdZ` falls within `[validFrom, validUntil]`.

Matching is deliberately **Operator-level, not Aircraft/callsign-level**:
a Blanket/Block/Seasonal permit in practice authorizes the operator to fly
any of its aircraft into a country, not one specific tail. Per-aircraft
tracking would require keeping an aircraft/callsign list in sync on every
authorization for no real benefit in this codebase — YAGNI until a concrete
case demands it.

`Trip.registration` and `Trip.operator` are both plain strings today (no
hard FK). Resolution goes through `Aircraft.currentOperatorId`, which *is*
a real relation to `Operator` — this is the only reliable path from a trip
to an operator identity, and it's already read elsewhere (`services.service.ts`
already loads `trip.registration`). If a trip's registration doesn't match
any known `Aircraft` row, matching is skipped and generation falls back to
today's normal `Not Started` behavior — never an error.

## Data model

```prisma
model PermitAuthorization {
  id                String    @id @default(cuid())
  operatorId        String    @map("operator_id")
  countryIso2       String    @map("country_iso2")
  serviceType       String    @map("service_type")       // 'Permit' | 'Overflight'
  authorizationType String    @map("authorization_type") // 'Blanket' | 'Block' | 'Seasonal'
  referenceNumber   String    @map("reference_number")
  validFrom         DateTime  @map("valid_from")
  validUntil        DateTime  @map("valid_until")
  status            String    @default("Draft")          // 'Draft' | 'Verified' | 'Revoked'
  docId             String?   @map("doc_id")
  notes             String?
  createdAt         DateTime  @default(now()) @map("created_at")
  createdBy         String    @map("created_by")
  verifiedBy        String?   @map("verified_by")
  verifiedAt        DateTime? @map("verified_at")

  operator Operator  @relation(fields: [operatorId], references: [operatorId])
  country  Country   @relation(fields: [countryIso2], references: [iso2])
  services Service[]

  @@index([operatorId, countryIso2, serviceType, status])
  @@map("permit_authorizations")
}
```

Both `Operator` and `Country` need the corresponding back-relation array
added (`permitAuthorizations PermitAuthorization[]`) — Prisma requires
explicit relations declared on both sides, matching the existing
`CountryRule`/`Country.countryRules` precedent in the same schema file.

`Service` gains:
```prisma
authorizationId String?               @map("authorization_id")
authorization   PermitAuthorization?  @relation(fields: [authorizationId], references: [id])
```

`authorizationType` and `status` are modeled as small fixed string unions
(validated with `@IsIn` in the DTO), matching the `ServiceResponsibility`
precedent from §11 — not an admin-editable catalog like `ServiceTypeDef`.
There are only three known authorization types and four known statuses;
an editable catalog would be premature generality for a closed, small
vocabulary (same reasoning the Phase 0 assessment already applied
elsewhere: "smaller than the document implies").

### Document linkage

`docId` optionally points at an existing `DocAttachment` row (the old,
working `docs` module — real OCR + MRZ + a functioning verify-before-save
UI already exists there). The new `documents` module (doc-intel Phase
1/2) is intentionally *not* used here: it has no verification UI yet, and
wiring an authorization's verified status to a still-unverifiable document
pipeline would create a dependency this slice doesn't need. This mirrors
the earlier decision to defer §16 until doc-intel's verification UI
exists.

## Matching logic

New private helper in `services.service.ts`:

```ts
private async resolveAuthorization(
  registration: string | null,
  countryIso2: string,
  serviceType: ServiceType,
  atDate: Date,
): Promise<PermitAuthorization | null> {
  if (!registration) return null;
  const aircraft = await this.prisma.aircraft.findUnique({ where: { registration } });
  if (!aircraft) return null;
  return this.prisma.permitAuthorization.findFirst({
    where: {
      operatorId: aircraft.currentOperatorId,
      countryIso2,
      serviceType,
      status: 'Verified',
      validFrom: { lte: atDate },
      validUntil: { gte: atDate },
    },
  });
}
```

`createOverflightService` (used by `generateOverflightServices` and
`reconcileOverflightServices`) and `generateArrivalServices`'s `make()`
helper both call this before `prisma.service.create()`, keyed on
`leg.etdZ`. When a match is found, the created service uses:

- `status: 'Confirmed'` instead of `'Not Started'`
- `refNumber: auth.referenceNumber`
- `validityZ: auth.validUntil`
- `authorizationId: auth.id`
- notes appended: `` `Auto-confirmed via ${auth.authorizationType} permit ${auth.referenceNumber}.` ``

This only affects **new** service creation — no existing service is ever
retroactively modified by generation running again (matches the existing
idempotency guarantee of these functions).

## Manual retroactive link

New endpoint: `PATCH /services/:svcId/link-authorization`, body
`{ authorizationId: string, user?: string }`.

Validates the named authorization actually matches the service (same
operator/country/serviceType, and the service's `requiredByZ`/leg date
falls in its validity window) before applying — a `400` if not, to prevent
linking an unrelated authorization by mistake. On success, applies the same
status/ref/validity update `resolveAuthorization` would have applied at
generation time, and audit-logs the link.

Supporting read endpoint: `GET /services/:svcId/authorization-candidates`
resolves operator/country/serviceType server-side from the service and its
trip (same resolution `resolveAuthorization` uses) and returns matching
authorizations of any status — the UI shows non-Verified ones as
disabled/greyed with a reason (e.g. "Draft — not yet verified"). Resolving
server-side avoids duplicating the Trip.registration → Aircraft → Operator
lookup on the client, which has no existing Aircraft/Operator data loaded
in `TripDetail.tsx` today.

## API surface

New `PermitAuthorizationsModule` (controller + service), following the
existing `ServicesController`/`ServicesService` pattern:

- `GET /permit-authorizations` — list, filterable by `operatorId`,
  `countryIso2`, `serviceType`, `status`
- `GET /permit-authorizations/:id`
- `POST /permit-authorizations` — create (`status: 'Draft'` always on
  create; cannot be created pre-Verified)
- `PATCH /permit-authorizations/:id` — edit (blocked once `Verified`
  except by `/revoke`, mirroring the Draft-only invoice line-item editing
  precedent already in this codebase)
- `POST /permit-authorizations/:id/verify` — Admin-only (role check via
  `@CurrentUser()`, same pattern as the reopen-Complete-trip Admin gate),
  sets `status: 'Verified'`, `verifiedBy`, `verifiedAt`
- `POST /permit-authorizations/:id/revoke` — Admin-only, sets
  `status: 'Revoked'`; does **not** retroactively un-confirm services
  already linked to it (mirrors `reconcileOverflightServices`'s existing
  caution around never silently destroying a coordinator's confirmed
  work) — revoking flags linked services via an audit log entry instead,
  for manual review.
- `PATCH /services/:svcId/link-authorization` (on the existing
  `ServicesController`, not a new controller — it's a services-side action)

## UI

**Admin authorization management** — new `AdminAuthorizations.tsx`, added
to the Admin nav alongside the existing Operator/Provider/Country
management pages, following `AdminTrips.tsx`'s existing table + dialog
conventions: a filterable table (by operator, country, status, expiry),
a create/edit dialog, and Verify/Revoke actions gated to Admin role
(button hidden/disabled for non-Admins, same as other Admin-only actions
in that file).

**Service-level display** — in `TripDetail.tsx`'s `ServiceInlineEditor`
and `AdminTrips.tsx`'s `ServiceEditorDialog`, when `Service.AuthorizationId`
is set, render a badge above the normal status controls:
"Covered by {AuthorizationType} permit {RefNumber} (valid until
{ValidityZ})". The normal `TransitionMenu`/status controls remain visible
and usable — a coordinator can still override — this is informational,
not a lock.

**Manual link action** — for services with no `AuthorizationId`, a "Link
existing permit" button/select in `ServiceInlineEditor`, populated from
`GET /services/:svcId/authorization-candidates` (see "Manual retroactive
link" above).

## Client types

`PermitAuthorization` is reference data managed only via Admin > Assets,
like `Operator`/`CountryFee` — so, matching that existing precedent, its
type is defined in `src/client/lib/dataStore.ts` (not `data/types.ts`,
which is reserved for the core Trip/Leg/Stop/Service transactional spine):

```ts
export type AuthorizationType = 'Blanket' | 'Block' | 'Seasonal';
export type AuthorizationStatus = 'Draft' | 'Verified' | 'Revoked';

export interface PermitAuthorization {
  ID: string;
  OperatorID: string;
  CountryISO2: string;
  ServiceType: string;
  AuthorizationType: AuthorizationType;
  ReferenceNumber: string;
  ValidFrom: string;
  ValidUntil: string;
  Status: AuthorizationStatus;
  DocID?: string;
  Notes?: string;
  CreatedAt: string;
  CreatedBy: string;
  VerifiedBy?: string;
  VerifiedAt?: string;
}
```

`Service` (in `data/types.ts`, the core spine) gains
`AuthorizationID?: string;` — read-only from the client's perspective via
normal service edits; only the link-authorization endpoint sets it.

## Testing

Server:
- `permit-authorization-matching.spec.ts` — generation pre-confirms a
  service when a Verified authorization covers (operator, country,
  serviceType, date); does NOT match a Draft/Expired/Revoked authorization,
  a different operator's authorization, a different country, a different
  service type, or a date outside the validity window; falls back to
  normal `Not Started` generation when the trip's registration has no
  matching `Aircraft` row.
- `permit-authorizations.spec.ts` — CRUD, verify (Admin-only, 403 for
  non-Admin), revoke (Admin-only), create always starts `Draft` regardless
  of what the request body claims.
- `link-authorization.spec.ts` — manual link validates operator/country/
  serviceType/date match before applying (400 on mismatch), applies the
  same status/ref/validity update generation would have on success.

Client: `npm run build:client` only, per project convention (no client
test framework).

## Migration

New table `permit_authorizations`, new nullable column
`services.authorization_id` (FK, nullable — no backfill needed, existing
services simply have no authorization). No changes to any existing
column. Purely additive.
