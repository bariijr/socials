# VIQ Vendor Assignment Engine — Sub-Project 2: Live Wiring + Coordinator UX

**Source:** [2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md](2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md)
(§17-24 selection algorithm/UX, §25 capturing selection on Service, §33
Why This Vendor, §63-64 resolver response shape)

**Depends on:** [2026-09-08-viq-vendor-assignment-resolver-design.md](2026-09-08-viq-vendor-assignment-resolver-design.md)
(sub-project 1 — `VendorAssignment` model + `VendorResolverService`,
shipped and reviewed). This spec covers exactly what sub-project 1's §5
excluded: wiring the resolver into live generation, persisting the
outcome, and the coordinator-facing UX for ties/no-eligible-vendor.

## 1. Scope

Replaces `services.service.ts`'s `resolveProvider()` (a simple ICAO→
Country→Global fallback with no rank/preferred/client-override/
prohibition support, and no tie detection — `findFirst` with no
`orderBy` silently picks an arbitrary row on a tie) with
`VendorResolverService.resolve()` at both call sites
(`createOverflightService`, `generateArrivalServices`'s `make()`).

Adds:
- Three new fields on `Service` capturing the resolution outcome.
- A coordinator-facing tie-resolution dialog, invoked identically from
  all 3 places generation is triggered (`TripDetail.tsx`,
  `AdminTrips.tsx`, `NewTripWizard.tsx`).
- A 4th auto-generation trigger on Phase 8's existing, isolated
  `task-sync.service.ts` for services with no eligible vendor.
- A "Why this vendor?" panel in the existing Service editor.

**Explicitly out of scope** (checked against the codebase, not assumed):
- Multi-vendor RFQ workflow (source §44-48) — sub-project 4.
- Post-submission "Change Vendor" workflow (source §28-29, §57-59) —
  sub-project 3. This spec only affects vendor assignment BEFORE a
  service is submitted; a submitted service's provider is untouched by
  anything here.
- Central Vendor Assignments admin workspace / Client Profile Vendor
  Preferences UI (source §34-41) — sub-project 3.
- Bulk client assignments (source §51), vendor questionnaire
  integration (source §49), vendor performance analytics (source
  §42-43) — all explicitly deferred by sub-project 1's own design spec
  and unaffected by this one.

## 2. Data model

Three new nullable fields on `Service`:

```prisma
model Service {
  // ...existing fields...
  vendorSelectionSource String?   @map("vendor_selection_source")
  vendorAssignmentId    String?   @map("vendor_assignment_id")
  vendorSelectedAtZ     DateTime? @map("vendor_selected_at_z")

  vendorAssignment VendorAssignment? @relation(fields: [vendorAssignmentId], references: [id], onDelete: SetNull)
}
```

Prisma requires a matching back-reference on the other side of this new
relation — `VendorAssignment` gains `services Service[]` (sub-project 1's
own ledger already hit this exact gap once for `Country`; naming it here
explicitly so the implementation plan doesn't have to rediscover it).

`vendorSelectionSource` deliberately serves two purposes with one
field: for a resolved service it holds the real selection source
string (e.g. `'COUNTRY_DEFAULT'`, `'CLIENT_AIRPORT_OVERRIDE'`,
`'USER_SELECTED'` — see §3); for an unresolved one it holds the literal
marker `'CHOICE_REQUIRED'` or `'NO_ELIGIBLE_VENDOR'`. The client's only
check for "does this service need the tie dialog" is
`vendorSelectionSource === 'CHOICE_REQUIRED'` — no second boolean/enum
needed.

`vendorAssignmentId` uses `onDelete: SetNull` (not `Cascade`) — deleting
the `VendorAssignment` row that once justified a selection should not
delete the `Service` it's attached to; the service just loses its
explanatory link (§6's "Why this vendor" panel degrades gracefully to
showing just the source string with no linked rule).

## 3. Server-side generation swap

Both `createOverflightService` and `generateArrivalServices`'s `make()`
replace:
```typescript
const providerId = await this.resolveProvider(serviceType, icao, iso2);
```
with a call to the injected `VendorResolverService.resolve({ countryIso2: iso2, icao, serviceType, clientId })` (the trip's `Client.clientId`,
already loaded via the existing `trip` lookup at each call site — no
new query). `permitType` is omitted (`undefined`) since neither call
site currently tracks a permit-type dimension on the service being
generated — this mirrors sub-project 1's own decision to keep
`permitType` a plain optional string with no dedicated model.

Mapping the result onto the `Service.create()` call:

| Resolver status | `providerId` | `vendorSelectionSource` | `vendorAssignmentId` | `vendorSelectedAtZ` |
|---|---|---|---|---|
| `RESOLVED` | `result.selectedVendorId` | `result.selectionSource` | `result.matchedRule.id` | `new Date()` |
| `CHOICE_REQUIRED` | `null` | `'CHOICE_REQUIRED'` | `null` | `null` |
| `NO_ELIGIBLE_VENDOR` | `null` | `'NO_ELIGIBLE_VENDOR'` | `null` | `null` |

`generateOverflightServices`/`generateArrivalServices` keep their
existing return shape (`Service[]`) — the exception state travels as a
field on each returned row, so no client-facing API contract changes.

This is additive to `VendorAssignmentsModule`'s existing exports — the
`ServicesModule` gains a dependency on `VendorResolverService` (already
exported from `VendorAssignmentsModule`), the same way `TasksModule`
already depends on other modules' exported services elsewhere in this
codebase.

**Isolation note carried over from sub-project 1:** `VendorResolverService`
itself is not modified by this spec — this is `services.service.ts`
calling *into* it, not the resolver being changed. Sub-project 1's own
tests remain untouched and continue to pass as-is.

## 4. Manual provider changes get auto-stamped

`ServicesService.update()` gains: when a PATCH's `data.providerId` is
present and differs from the service's current `providerId`, stamp
`vendorSelectionSource: 'USER_SELECTED'`, `vendorSelectedAtZ: new Date()`,
`vendorAssignmentId: null` — regardless of what (if anything) the
client sent for those fields. This mirrors the existing `confirmedBy`/
`confirmedAtZ` auto-stamping pattern in the same file (§19, Phase 6):
never trust a client-supplied provenance field for something the
server can determine authoritatively from the transition itself.

This is also the entire mechanism the tie-resolution dialog (§6) uses
to resolve a choice — no dedicated "resolve vendor" endpoint is needed;
picking a vendor is just a normal `PATCH /services/:svcId` with the
chosen `providerId`.

## 5. Task engine 4th trigger: no eligible vendor

`task-sync.service.ts` gains `generateNoVendorTasks()`, structurally
identical to the three existing generators (`generateReconfirmTasks`,
`generateResubmitTasks`, `generateDeadlineTasks`):

```typescript
private async generateNoVendorTasks(): Promise<number> {
  const services = await this.prisma.service.findMany({
    where: { vendorSelectionSource: 'NO_ELIGIBLE_VENDOR', providerId: null },
    include: { trip: { select: { ownerUserId: true } } },
  });
  // ...sourceKey: `novendor:${svc.svcId}`, same create-if-not-exists pattern
}
```

`isTriggerResolved` gains one more branch:
```typescript
if (sourceKey.startsWith('novendor:')) return svc.providerId !== null;
```

No changes to the BullMQ scheduling, the escalation logic, or any of
Phase 8's already-shipped/reviewed code paths beyond these two additive
pieces — same isolation guarantee Phase 8 established for itself.

## 6. "Resolve Vendor Ties" dialog

New component `src/client/components/VendorTieResolutionDialog.tsx`.
All 3 existing call sites already do:
```typescript
await generateOverflightServices(leg.LegID);
await generateArrivalServices(leg.LegID, ...);
```
Each site's `await` sequence is followed by one addition: collect both
calls' returned arrays, filter for `s.VendorSelectionSource === 'CHOICE_REQUIRED'`,
and if any exist, open `VendorTieResolutionDialog` with that list (no
change to the generation calls themselves — purely a post-await check).

For each listed service, the dialog needs the live tied alternatives.
Rather than persisting them at generation time (risking staleness if
`VendorAssignment` rows change between generation and resolution), it
calls a new endpoint:

```
GET /services/:svcId/vendor-candidates
```

which re-derives the service's resolution context (`countryIso2`/`icao`
from the service row, `serviceType` from the service row, `clientId`
from the trip) and calls `VendorResolverService.resolve()` live,
returning `{ status, alternatives: [{ vendorId, providerName }] }`
(provider names resolved via one `Provider.findMany({ where: { providerId: { in: [...] } } })`
call, not N+1).

Picking a vendor calls the existing `PATCH /services/:svcId` with the
chosen `providerId` (§4 handles the rest). "Skip" simply closes that
service's row in the dialog without calling anything — the service
stays `CHOICE_REQUIRED`/unassigned, resolvable later by reopening its
editor (§7) or regenerating.

The dialog is dismissible without resolving every row (a coordinator
may not have time to decide every tie immediately) — nothing forces
resolution before the Trip/Leg save flow completes.

## 7. "Why this vendor?" panel

A new collapsible section in `AdminTrips.tsx`'s `ServiceEditorDialog`
(alongside where Phase 6 added confirmation history), rendered
whenever `service.ProviderID` is set:

- `Selection Source: {service.VendorSelectionSource}`
- `Selected At: {formatZ(service.VendorSelectedAtZ)}`
- If `service.VendorAssignmentID` is set: fetch that one row via the
  existing `GET /vendor-assignments/:id` and show its
  rank/preferred/validity window.
- If `VendorAssignmentID` is null (e.g. `USER_SELECTED`, or a
  fallback/manual case): show just the source string, no linked rule —
  this is the expected, non-error state for a manually-picked vendor.

This panel shows what actually happened at selection time — it does
not re-run the resolver live (unlike §6's dialog, which needs current
alternatives for a still-open choice).

## 8. Testing

Real `jetflow_test` Postgres, no mocked Prisma (established convention
— Phase 8, sub-project 1, Change Impact Engine, Submission Engine all
follow this rule):

- `services.service.spec.ts` additions:
  - Generation against a `RESOLVED` context stamps all 3 new fields
    correctly, `providerId` set.
  - Generation against a `CHOICE_REQUIRED` context creates the service
    with `providerId: null`, `vendorSelectionSource: 'CHOICE_REQUIRED'`.
  - Generation against a `NO_ELIGIBLE_VENDOR` context: same shape,
    `'NO_ELIGIBLE_VENDOR'`.
  - A manual `PATCH` changing `providerId` auto-stamps
    `vendorSelectionSource: 'USER_SELECTED'` and clears
    `vendorAssignmentId`, regardless of what the client sent for those
    fields.
  - A manual `PATCH` that does NOT change `providerId` leaves all 3
    fields untouched.
- `task-sync.service.spec.ts` additions:
  - A service with `vendorSelectionSource: 'NO_ELIGIBLE_VENDOR'`
    generates a task.
  - The task auto-closes once the service's `providerId` becomes
    non-null (via either a later regeneration resolving it, or a
    manual PATCH).
- New test for `GET /services/:svcId/vendor-candidates`: returns the
  live tied alternatives for a `CHOICE_REQUIRED` service; returns an
  empty/appropriate shape for a service that isn't currently tied.
- Client: no test framework exists (established convention) — verified
  via `npm run build:client` plus a manual dev-server check per call
  site (at minimum: trigger a tie during Trip creation via
  `NewTripWizard`, confirm the dialog appears and resolving it via the
  panel updates the service).
