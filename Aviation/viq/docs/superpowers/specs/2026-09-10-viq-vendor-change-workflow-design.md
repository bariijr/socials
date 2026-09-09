# VIQ Vendor Assignment Engine — Sub-Project 3b: Change Vendor Workflow

**Source:** [2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md](2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md)
§28-32 (never silently switch, the Change Vendor workflow, reason capture,
manual override), §55-58 (audit, service activity, cancellation
communications, status interaction).

**Depends on:** sub-project 1 (`VendorAssignment` model + resolver, shipped),
sub-project 2 (live wiring, `vendorSelectionSource`/`vendorAssignmentId`,
`GET /services/:svcId/vendor-candidates`, shipped), sub-project 3a (admin
management UI, shipped), and the Submission Engine (Phase 5, shipped) — this
plan reuses its exact "real send before status flip" invariant and its
client-side `generateEmail`/`saveComm`/`sendComm` primitives rather than
building a parallel send path.

## 0. Scope correction from the source document

§30 ("Service Case vs Service Order") describes a two-level backend
hierarchy — a "Service Case" with multiple child "Service Orders," one per
vendor attempt, each with its own status. **This codebase has no such
hierarchy.** `Service` is a single flat row with one `status`, one
`providerId`. Building the literal two-level model would mean restructuring
every existing system that keys off `Service.status`/`Service.providerId`
directly (task-sync triggers, the Submission Engine, the Phase 6
change-impact triggers, the resolver's live-wiring) — a large, high-blast-
radius rewrite the source document's own goal doesn't actually require.

Following this project's established precedent (Phase 6 slice 2's
reconfirmation history needed zero new tables, reusing `AuditEntry`), this
plan keeps `Service` as the single row it already is and adds one small,
purpose-built table (`VendorChangeLog`, §2 below) for the structured data
`AuditEntry`'s generic field-diff format can't hold (a reason code, notes,
which two Comms were the cancellation and the replacement). Everything else
§29's numbered steps ask for — preserving Vendor A's request history,
retaining all previous communications — is already free: `Comm` and
`AuditEntry` are both already scoped per-service and already retained
forever.

## 1. Availability — when Change Vendor applies

The action is available only when the service currently has a real,
previously-sent request to preserve: `status` is `Requested`, `Chasing`,
`Confirmed`, or `Re-confirm Required`. (`Submission Pending`/`Submission
Failed` mean no request ever actually reached a vendor — per the Submission
Engine's own invariant, a service can only reach `Requested` after a
confirmed send — so there is nothing to cancel; the generic Service editor's
provider field remains the right tool for those statuses.)

```typescript
// src/server/common/statusTransitions.ts
export function changeVendorAllowed(status: string): boolean {
  return ['Requested', 'Chasing', 'Confirmed', 'Re-confirm Required'].includes(status);
}
```

Client-side gating (`ServiceEditorDialog`, `TripDetail.tsx`'s inline
service editor): once `changeVendorAllowed(service.Status)` is true, the
raw Provider `<Select>` becomes read-only and a **[CHANGE VENDOR]** button
appears in its place, opening the new dialog (§5). Below that status set,
the Provider field stays freely editable exactly as it is today (sub-project
2's `USER_SELECTED`/`NO_ELIGIBLE_VENDOR` stamping is unchanged for those
statuses).

## 2. Data model — one new table

```prisma
model VendorChangeLog {
  id                 String   @id @default(cuid())
  svcId              String   @map("svc_id")
  fromProviderId     String   @map("from_provider_id")
  toProviderId       String   @map("to_provider_id")
  reason             String
  notes              String?
  cancellationCommId String?  @map("cancellation_comm_id")
  newRequestCommId   String?  @map("new_request_comm_id")
  changedBy          String   @map("changed_by")
  changedAtZ         DateTime @default(now()) @map("changed_at_z")

  service Service @relation(fields: [svcId], references: [svcId], onDelete: Cascade)

  @@index([svcId])
  @@map("vendor_change_logs")
}
```

`reason` is a fixed code from §31's list (`Client Requested`, `Vendor
Unavailable`, `No Response`, `Price`, `Credit Issue`, `Operational
Requirement`, `Capability Issue`, `Schedule Issue`, `Quality Issue`,
`Other`) — always required for this workflow (§29 step 2 asks for it
unconditionally; unlike §31's general "bypass" rule, there is no
conditional case here since replacing an already-submitted vendor is
inherently a deviation worth recording every time). `notes` is optional
free text. `cancellationCommId`/`newRequestCommId` point at the two `Comm`
rows this change produced, so the UI can render "Vendor A request:
`ET-12345`, cancelled via [this email]" and "Vendor B request: [this email]"
without re-deriving them.

One row per change. A service changed vendors twice has two rows, giving a
full chronological history for free — this is also exactly the structured
data source §43 ("track overrides for future analytics") wants, which a
raw `AuditEntry` field-diff string can't hold (no reason code, no notes).

## 3. Resolver extension — full eligible pool

The existing `GET /services/:svcId/vendor-candidates` (sub-project 2) only
returns same-tier siblings of the resolved winner — built for the
generation-time tie dialog, where "other candidates in the winning tier"
is the correct question. Change Vendor's picker needs a different question:
"every vendor eligible for this context, at any tier," since a service
with a single top-tier winner and no ties currently gets an empty
alternatives list from the existing endpoint, which would force every
Change Vendor into the Admin-only override path even when perfectly
eligible lower-tier vendors exist.

New method on the already-isolated `VendorResolverService`:

```typescript
// src/server/modules/vendor-assignments/vendor-resolver.service.ts
async eligiblePool(context: VendorResolutionContext): Promise<{ vendorId: string; rank: number | null }[]>
```

Reuses the exact same candidate-filtering logic `resolve()` already has
(service type + context match + validity window + `active`/
`contractActive`, excluding anything covered by a `prohibited: true` row)
but skips the specificity-tiering/winner-selection step, returning every
surviving candidate across all tiers, sorted by the same specificity tuple
then rank. No change to `resolve()` itself — this is an additive read path
alongside it, matching how `resolve()` was itself deliberately isolated
from the services it's called by.

New endpoint:

```
GET /services/:svcId/change-vendor-candidates
```

on `ServicesController`, mirroring `vendorCandidates()`'s existing shape
(resolves the service's context, calls `eligiblePool`, maps `vendorId` to
`providerName`), used by the Change Vendor dialog's picker. The existing
`vendor-candidates` endpoint is untouched — still used exactly as before
for the generation-time tie dialog.

## 4. New email template type — Cancellation

`src/client/lib/emailTemplates.ts`'s `RequestAction` type is currently
`'Request' | 'Revision'`. Add `'Cancellation'` alongside them, with its own
`TemplateType` entries per applicable service type (Overflight/Permit/
Ground Handling, mirroring the existing per-type template pairs) and a
`DEFAULT_TEMPLATES` entry for each — referencing the original request's
`RefNumber` (§57's example shows `Previous request: ET-12345`) and stating
plainly that the request is withdrawn. `generateEmail()`'s existing
signature already takes a `ref` parameter; the cancellation template uses
it to reference what's being cancelled rather than what's being requested.

## 5. The workflow — client-orchestrated, mirroring the Submission Engine's own architecture

This codebase's submission logic already lives client-side
(`PermitSubmissionGroups`/`PermitRevisionGroups` in `TripDetail.tsx` call
`generateEmail`/`saveComm`/`sendComm` directly, then `saveService()` to
flip status) — there is no server-side "send" orchestrator to hook into.
Change Vendor follows the same shape rather than introducing a new one:

A new `ChangeVendorDialog.tsx` component (opened from the `[CHANGE VENDOR]`
button, §1), given the service, its trip/leg context, and the current
provider. Sequence, run client-side:

1. **Fetch eligible replacements** via `GET /services/:svcId/change-vendor-candidates`
   (§3). Coordinators see only this list; **Admins** additionally see a
   "choose any vendor" escape hatch (§32's "elevated permission" override).
2. **Coordinator picks**: replacement vendor, reason (required, §2's fixed
   list), optional notes.
3. **Send the cancellation** to the *current* provider's email channel(s)
   (same `Provider.Channels` lookup `PermitSubmissionGroups` already uses)
   using the new `Cancellation` template (§4), referencing the service's
   current `RefNumber`. `generateEmail` → `saveComm` → `sendComm`, exactly
   like the existing submission loop.
4. **If the cancellation send fails** (`sent.Status !== 'Sent'`): stop here.
   Show the failure explicitly in the dialog (§57: "do not imply Vendor A
   was successfully cancelled"). Nothing about the Service has changed yet
   — no provider swap, no status change, no `VendorChangeLog` row. The
   coordinator can retry the send or cancel out of the dialog with zero
   side effects.
5. **On cancellation success**: call the new server endpoint (§6) with
   `{toProviderId, reason, notes, cancellationCommId, version}`. This one
   call atomically: writes the `VendorChangeLog` row, flips `Service.providerId`
   to the replacement, stamps `vendorSelectionSource: 'USER_SELECTED'`,
   and resets `status` to `Submission Pending` — the same real-send gate
   every other new request goes through, not a shortcut straight to
   `Requested`.
6. **Send the new request** to the replacement vendor: the exact same
   `generateEmail`(`'Request'` action)/`saveComm`/`sendComm` sequence
   `PermitSubmissionGroups` already runs for a fresh service, using the new
   provider's channels and a new `RefNumber`.
7. **Final status flip**: `saveService({status: 'Requested', refNumber, ...})`
   on send success, or `{status: 'Submission Failed', notes: '...'}` on
   failure — identical to the existing submission loop's own success/failure
   handling. On success, `PATCH` the `VendorChangeLog` row (§2) with the
   `newRequestCommId`.

If step 6/7 fails, the service is left at `Submission Failed` with the
*new* provider already assigned (matching how every other submission
failure in this codebase already works) — the cancellation to Vendor A has
already genuinely happened at that point and must not be un-done or hidden;
the coordinator retries the new request the same way any other
`Submission Failed` service is retried today (no Change-Vendor-specific
retry path needed — it's already just a normal service in a normal
recoverable status).

## 6. New endpoint — atomic provider + log write

```
POST /services/:svcId/change-vendor
Body: { toProviderId: string; reason: string; notes?: string; cancellationCommId: string; version: number }
```

On `ServicesController`/`ServicesService`. No explicit `@Roles()` decorator
— `ServicesController` has none today, and `RolesGuard`'s default behavior
(block `Viewer` from any non-GET request, allow everyone else) already
gives exactly the intended access: Coordinators and Admins, matching the
generic service PATCH this is a guided version of. `@CurrentUser()` still
supplies the server-verified role for the eligibility-override check
below — that check needs the actual role value, not just "passed the
guard." Server-side:

- 400 if `!changeVendorAllowed(current.status)`.
- 403 if `toProviderId` is not in `eligiblePool()`'s result **and** the
  caller's server-verified role (via `@CurrentUser()`, never a client-
  supplied field — same pattern as Trip reopening and confirmation
  stamping) is not `Admin` (§32's eligibility override gate).
- Optimistic locking via `version`, identical semantics to the generic
  `update()` — a stale version 409s with the current record, same
  `ConflictDialog` the rest of the app already uses.
- In one transaction: create the `VendorChangeLog` row, update `Service`
  (`providerId`, `vendorSelectionSource: 'USER_SELECTED'`,
  `vendorAssignmentId: null`, `status: 'Submission Pending'`,
  `statusChangedAt`/`statusChangedBy`, `version: increment`).
- `audit.logDiff` on the Service update, same as every other mutation —
  this still captures the raw before/after field values; `VendorChangeLog`
  is the structured layer on top, not a replacement for the generic trail.
- Returns the updated service (`withServiceTransitions`), matching the
  generic `update()`'s response shape, so the client's existing
  post-save handling needs no special-casing.

A second, small endpoint patches `newRequestCommId` onto the
`VendorChangeLog` row once the replacement request's `Comm` is created
(step 7): `PATCH /vendor-change-logs/:id` accepting just that one field —
kept separate from the main endpoint since the new request's `Comm` doesn't
exist yet at the point the main endpoint runs (§5 step 5 happens before
step 6's send).

## 7. Service Activity timeline

`§56` wants a specific, narrative rendering — not a raw audit-diff line:

```text
13:10Z
VENDOR CHANGED

ABC Aviation → East Africa Flight Support

Reason: No Response

Previous request cancelled. Replacement request created.
```

The existing Service Activity view (built on `getAuditForRecord('Service',
svcId)`, per Phase 6 slice 2) merges in `VendorChangeLog` rows for this
`svcId`, rendered with this fixed template (provider names resolved via
the already-loaded provider list, matching every other provider-name
resolution in this codebase), interleaved chronologically with the
existing audit-derived entries by `changedAtZ`.

## 8. Trip-level change impact

Per §59: a master `VendorAssignment` ranking edit (sub-project 3a's admin
tab) must never mark a Trip/Service `Re-confirm Required` — that pathway is
untouched by this plan. Change Vendor is the opposite case: an *explicit*
coordinator action on an *active* trip service, which is already, by
definition, an operational change being recorded (the `VendorChangeLog`
row itself, plus the status reset through `Submission Pending`) — no
additional Phase 6 change-impact trigger is needed on top of it; §59's
"record operational change" requirement is satisfied by §§2/6-7 above, not
a new trigger.

## 9. Explicitly out of scope for this pass

- Sub-project 4 (multi-vendor RFQ / quote-request workflow, source §44-49)
  — a genuinely different workflow per the source document's own §44
  ("Quote Request Is A Different Workflow").
- A dedicated retry affordance for a failed replacement-vendor send beyond
  the existing generic `Submission Failed` retry path (§5's closing note)
  — it's already just a normal recoverable service status.
- Undo/reverse a completed Change Vendor (source document does not ask for
  this — §28's "never silently switch" is about the forward direction).
- Bulk Change Vendor across multiple services at once — source document's
  examples are all single-service; nothing in §29-32 or §57-58 describes a
  batch variant.

## 10. Testing

Server: real-Postgres Jest tests (this project's non-negotiable
convention, no mocked Prisma) for `changeVendorAllowed`, the new
`POST /services/:svcId/change-vendor` endpoint (status gating, eligibility
gating incl. the Admin-override path, optimistic locking, the
`VendorChangeLog` row's fields), and `VendorResolverService.eligiblePool()`
(full-pool correctness against the same fixtures sub-project 1's `resolve()`
spec already uses, including that a `prohibited: true` row still excludes
a vendor from the pool). Client: no test framework exists (established
convention) — verification is `npm run build:client` plus a manual
dev-server run through the full dialog sequence, including a deliberately
failed cancellation send (to confirm the hard-stop) and a deliberately
failed replacement send (to confirm it lands on `Submission Failed` with
the new provider already recorded, not reverted).
