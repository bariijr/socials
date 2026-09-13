# VIQ Operational Event Engine + Leg/Trip Cancellation — Design

**Source:** [2026-09-13-viq-leg-lifecycle-cancellation-cloning-conversational-briefing-phase0-assessment.md](2026-09-13-viq-leg-lifecycle-cancellation-cloning-conversational-briefing-phase0-assessment.md)
(108-section mega-spec's Phase 0 assessment; its six cross-cutting
conflicts and recommended build sequence were approved at the start of
this session. This doc is sub-projects 2-3 of that sequence: **Cluster F
(Operational Event Engine, scoped)** and **Cluster B (Leg/Multi-Leg/Trip
Cancellation)**, built together since Cluster B is the event engine's
first real emitter and listener.)

**Prerequisite, already shipped:** Cluster A — Leg Lifecycle & Status
Foundation ([design](2026-09-13-viq-leg-lifecycle-status-foundation-design.md),
[plan](../plans/2026-09-13-viq-leg-lifecycle-status-foundation.md)).
`Leg.status` (`Planned/Active/Completed/Cancelled`), `LEG_TRANSITIONS`,
`statusChangedAt/By`, and `revision`/`version` all already exist.

## 0. Rulings made in place of clarifying questions

1. **Event mechanism: `@nestjs/event-emitter`, not a centralized BullMQ
   queue.** The Phase 0 assessment's cross-cutting conflict #1 is
   explicit: scope a new, in-process event mechanism to the *new*
   workflows only, and leave the existing Change Impact Engine's inline
   `flagConfirmedServices*` calls (in `legs.service.ts`/`trips.service.ts`)
   untouched. `BullMQ` (`@nestjs/bullmq`, already wired in
   `app.module.ts`) stays reserved for genuinely async, durable,
   retryable work — one dedicated queue per capability, mirroring
   `task-sync`/`document-processing` — not a generic shared event bus.
   Nothing in this build needs a new BullMQ queue: audit logging is
   synchronous and fast, and vendor-cancellation notices (below) are
   sent inline from the client the same way Change Vendor already sends
   them, not queued.
2. **Full event taxonomy defined now; only cancellation's emit call
   sites wired now.** All ~15 event types from the mega-spec's §70 are
   named and typed in one shared file this build. Only the four with a
   real trigger in this build actually fire: `LEG_CANCELLED`,
   `TRIP_CANCELLED`, `SERVICE_CANCELLED`, and `LEG_STATUS_CHANGED`
   (generalizing `LEG_COMPLETED`/future `LEG_REINSTATED` into one typed
   event with an `to`/`from` status, since Cluster A's transition graph
   already treats every status change uniformly). Every other type is
   inert until the phase that owns its workflow adds a real `emit()`
   call — never stubbed.
3. **Only one consequence handler ships in this build: audit.** It's
   the only consequence with a real, already-correct implementation
   (`AuditService.log`) to call. Notification, brief regeneration, task
   creation, and financial review are registered by Clusters G, H, C,
   and O respectively when they're built — this build does not stub
   empty handlers for them.
4. **Vendor cancellation notices: reuse `ChangeVendorDialog`'s pattern
   verbatim, client-orchestrated.** The only existing precedent for
   "compose and send a cancellation email" is entirely client-side
   (`src/client/lib/emailTemplates.ts`'s `generateEmail` +
   `defaultTemplateForCancellation`, then `saveComm`/`sendComm`) — there
   is no server-side template renderer to call instead, and porting one
   is out of scope here. The cancellation UI (new, modeled on
   `ChangeVendorDialog.tsx`) loops this exact flow across every affected
   service with a `ProviderID`, after the server-side cancellation
   commits. No new column is needed to track this — `Comm` already
   carries `tripId`/`svcId`.
5. **Financial disposition is explicitly out of scope.** Per the source
   assessment's Cluster C, AP/AR disposition is its own sub-project,
   sequenced directly after this one. This build's `cancelLeg`/
   `cancelTrip` never write a financial field, and cancellation-sent-vs-
   acknowledged tracking (§11) is also Cluster C's parallel record, not
   built here.
6. **Cancellation reason is a fixed string enum**, matching this
   codebase's existing convention (`ChangeVendorDto`'s
   `VENDOR_CHANGE_REASONS` — a plain `@IsIn` array, no DB enum, no
   reference table) — not a new `CancellationReason` entity.

## 1. Goal

Give coordinators a real cancellation workflow — single Leg, multiple
Legs in one operation, or a whole Trip — with an impact-review step
before anything is committed, full history preservation (a completed Leg
is never touched), and per-service vendor notification. Introduce the
minimal event mechanism this needs, scoped so later phases (reinstatement,
cloning, notifications, briefs) can register their own listeners without
this build anticipating their shape.

## 2. Architecture

```
LegsService.cancelLeg() / cancelLegs() / TripsService.cancelTrip()
        │
        │ 1. $transaction: Leg(s) → Cancelled, Service(s) → Cancelled,
        │    reason/remarks/cancelledBy/cancelledAtZ stamped
        ▼
   commit
        │
        │ 2. emit() — after commit, never inside the transaction
        ▼
OperationalEventsService (EventEmitter2 wrapper)
        │
        ├──► AuditListener            (writes AuditEntry — this build)
        ├──► (unregistered today)     — notification (Cluster G)
        ├──► (unregistered today)     — brief regen  (Cluster H)
        └──► (unregistered today)     — financial review (Cluster C)
```

```
Client (new CancelLegDialog / CancelTripDialog, modeled on
ChangeVendorDialog.tsx)
        │
        │ 1. GET preview → show impact numbers, require reason
        │ 2. POST cancel → server commits + emits events (above)
        │ 3. for each affected service with a ProviderID:
        │      generateEmail(defaultTemplateForCancellation(...))
        │      → saveComm() → sendComm()
        │    (exactly ChangeVendorDialog's existing flow, looped)
        ▼
   done — cancellation review screen shows per-service send result
```

## 3. Data model changes

```prisma
model Leg {
  // ...existing fields unchanged...
  cancellationReason  String?   @map("cancellation_reason")
  cancellationRemarks String?   @map("cancellation_remarks")
  cancelledBy         String?   @map("cancelled_by")
  cancelledAtZ        DateTime? @map("cancelled_at_z")
}

model Service {
  // ...existing fields unchanged...
  cancellationReason  String?   @map("cancellation_reason")
  cancellationRemarks String?   @map("cancellation_remarks")
  cancelledBy         String?   @map("cancelled_by")
  cancelledAtZ        DateTime? @map("cancelled_at_z")
}

model Trip {
  // ...existing fields unchanged...
  cancellationReason  String?   @map("cancellation_reason")
  cancellationRemarks String?   @map("cancellation_remarks")
  cancelledBy         String?   @map("cancelled_by")
  cancelledAtZ        DateTime? @map("cancelled_at_z")
}
```

Reason values (shared const, mirrors `VENDOR_CHANGE_REASONS`):

```ts
export const CANCELLATION_REASONS = [
  'Client Cancelled', 'Aircraft Technical', 'Weather', 'Crew',
  'Schedule Change', 'Permit / Regulatory', 'Operational', 'Commercial',
  'Security', 'Airport Closed', 'Mission Cancelled', 'Duplicate Trip', 'Other',
] as const;
```

No new tables. `statusChangedAt/By` (already on Leg/Trip/Service) keeps
recording *when the status field itself changed*; the four new columns
above record *why*, alongside it — same split `AuditEntry` already makes
between "what changed" (generic) and these fields (cancellation-specific
structured reason).

## 4. Operational Events module

New `src/server/modules/operational-events/`:

- `operational-events.module.ts` — imports `EventEmitterModule.forRoot()`
  (registered once, globally, in `app.module.ts`).
- `event-types.ts` — the full ~15-type taxonomy as a discriminated union:

```ts
export type OperationalEvent =
  | { type: 'TRIP_CREATED'; tripId: string; user: string }
  | { type: 'TRIP_CHANGED'; tripId: string; user: string }
  | { type: 'TRIP_CANCELLED'; tripId: string; reason: string; user: string }
  | { type: 'LEG_STATUS_CHANGED'; legId: string; tripId: string; from: string; to: string; user: string }
  | { type: 'LEG_CANCELLED'; legId: string; tripId: string; reason: string; user: string }
  | { type: 'LEG_REINSTATED'; legId: string; tripId: string; user: string }        // inert — Cluster D
  | { type: 'SERVICE_REQUESTED'; svcId: string; tripId: string; user: string }     // inert
  | { type: 'SERVICE_CONFIRMED'; svcId: string; tripId: string; user: string }     // inert
  | { type: 'SERVICE_CHANGED'; svcId: string; tripId: string; user: string }       // inert
  | { type: 'SERVICE_CANCELLED'; svcId: string; tripId: string; providerId: string | null; reason: string; user: string }
  | { type: 'VENDOR_CHANGED'; svcId: string; user: string }                        // inert
  | { type: 'VENDOR_RESPONDED'; svcId: string; user: string }                      // inert
  | { type: 'DOCUMENT_ADDED'; documentId: string; user: string }                   // inert
  | { type: 'DOCUMENT_VERIFIED'; documentId: string; user: string }                // inert
  | { type: 'DOCUMENT_EXPIRED'; documentId: string }                               // inert
  | { type: 'TASK_OVERDUE'; taskId: string }                                       // inert
  | { type: 'INVOICE_RECEIVED'; invoiceId: string }                                // inert
  | { type: 'PAYMENT_RECORDED'; invoiceId: string };                               // inert
```

  "Inert" = typed and named now, no `emit()` call site exists yet.
  Adding one later is additive (new call site in the owning service),
  never a change to this file's shape.

- `operational-events.service.ts`:

```ts
@Injectable()
export class OperationalEventsService {
  constructor(private readonly emitter: EventEmitter2) {}
  emit(event: OperationalEvent) {
    this.emitter.emit(event.type, event);
  }
}
```

  Thin on purpose — `EventEmitter2`'s own `.emit()` is synchronous
  fan-out to registered listeners; there is no queue, no persistence
  layer, and no retry here. A future phase whose consequence genuinely
  needs durability registers its own BullMQ queue and enqueues from
  inside its own listener (mirroring `documents.service.ts`'s
  `queue.add()` pattern) — this service never does that on a listener's
  behalf.

- `listeners/audit-event.listener.ts`:

```ts
@Injectable()
export class AuditEventListener {
  constructor(private readonly audit: AuditService) {}

  @OnEvent('LEG_CANCELLED')
  async onLegCancelled(e: Extract<OperationalEvent, { type: 'LEG_CANCELLED' }>) {
    await this.audit.log(e.user, 'Leg', e.legId, 'Cancelled', '', e.reason);
  }
  @OnEvent('TRIP_CANCELLED')
  async onTripCancelled(e: Extract<OperationalEvent, { type: 'TRIP_CANCELLED' }>) {
    await this.audit.log(e.user, 'Trip', e.tripId, 'Cancelled', '', e.reason);
  }
  @OnEvent('SERVICE_CANCELLED')
  async onServiceCancelled(e: Extract<OperationalEvent, { type: 'SERVICE_CANCELLED' }>) {
    await this.audit.log(e.user, 'Service', e.svcId, 'Cancelled', '', e.reason);
  }
}
```

  Note: `cancelLeg`/`cancelTrip` (below) *also* call `audit.logDiff`
  directly for the field-level before/after diff, exactly like every
  other mutating method in this codebase — that convention is untouched.
  `AuditEventListener` adds one extra, human-readable "Cancelled: \<reason\>"
  entry per record, which `logDiff`'s generic field-diff doesn't capture
  (it would show `status: Active → Cancelled` but not *why*). This is
  the event engine's first real, visible value: a consequence the
  transactional code path doesn't have to know about.

## 5. Cancellation service methods

New on `LegsService`:

```ts
async previewLegCancellation(legId: string): Promise<LegCancellationPreview>
async cancelLeg(legId: string, dto: CancelLegDto): Promise<Leg>
async cancelLegs(legIds: string[], dto: CancelLegDto): Promise<Leg[]>
```

`LegCancellationPreview`:

```ts
{
  legId: string;
  route: string;                 // "HTDA → FALA"
  servicesAffected: number;
  confirmed: number;
  requested: number;              // Requested + Chasing + Re-confirm Required
  notStarted: number;              // Not Started + Submission Pending/Failed
  vendorNotifications: number;    // distinct providerId among affected services
  crewCount: number;              // Leg.crewCount
  paxCount: number;                // Leg.paxCount
}
```

`cancelLeg` logic:

1. Load the Leg; `isValidLegTransition(leg.status, 'Cancelled')` — reuses
   the existing graph, no new edge needed (`Planned/Active → Cancelled`
   already exist). A `Completed` Leg has no `Cancelled` edge in
   `LEG_TRANSITIONS` today — the transition check itself already
   protects completed history; this build adds no special-case code for
   it (§7's "completed Legs remain completed" falls out of the existing
   graph for free).
2. `$transaction`:
   - `leg.updateMany({ where: { legId, version }, data: { status: 'Cancelled', statusChangedAt, statusChangedBy, cancellationReason, cancellationRemarks, cancelledBy, cancelledAtZ, version: increment } })` — optimistic-lock pattern identical to `LegsService.update()`.
   - Every non-`Cancelled` Service under this Leg's scope (`scopeId: legId`) → `status: 'Cancelled'` with the same four cancellation columns stamped, via `service.updateMany` (no optimistic lock needed per-service here — the Leg's own version lock is the entry point; a concurrent direct edit to one Service mid-cancellation is the same acceptable race the rest of this codebase already accepts for bulk operations like `flagConfirmedServices`).
3. On commit: `audit.logDiff` for the Leg (existing convention), then
   `operationalEvents.emit({ type: 'LEG_CANCELLED', ... })` and one
   `emit({ type: 'SERVICE_CANCELLED', ... })` per affected service.
4. Return the updated Leg with `allowedTransitions` (existing
   `withLegTransitions` helper).

`cancelLegs(legIds, dto)` — same per-Leg transaction, looped; each Leg
gets its own history entry and its own event, never a single bulk status
blast (§5's explicit requirement). Unlike the single-Leg route,
`cancelLegs` takes no caller-supplied `version` per Leg — each iteration
reads that Leg's current `version` immediately before its own
`updateMany`, the same no-caller-pinned-version convention
`flagConfirmedServices`/`flagConfirmedServicesForScheduleChange` already
use for their own multi-row writes. `cancelLeg` (single-Leg route) keeps
taking a caller-supplied `version`, exactly like `LegsService.update()`.

New on `TripsService`:

```ts
async previewTripCancellation(tripId: string): Promise<TripCancellationPreview>
async cancelTrip(tripId: string, dto: CancelTripDto): Promise<Trip>
```

`cancelTrip` calls `legsService.cancelLegs()` for every Leg whose status
is not already `Completed` or `Cancelled`, then transitions the Trip
itself to `Cancelled` once every Leg is terminal, then emits
`TRIP_CANCELLED`. A Trip with zero non-terminal Legs (all already
Completed) still transitions the Trip to Cancelled — the Trip-level
decision is independent of what state its Legs happen to already be in.

## 6. API surface

```
GET  /legs/:legId/cancellation-preview
POST /legs/:legId/cancel                 { reason, remarks?, user }
POST /legs/cancel-batch                  { legIds: string[], reason, remarks?, user }
GET  /trips/:tripId/cancellation-preview
POST /trips/:tripId/cancel               { reason, remarks?, user }
```

`CancelLegDto`/`CancelTripDto`: `reason` (`@IsIn(CANCELLATION_REASONS)`),
`remarks` (`@IsOptional() @IsString() @MaxLength(2000)`), `user`, plus
`version` on the single-Leg/Trip routes for optimistic locking (omitted
on the batch route, matching how `cancelLegs` treats each Leg
independently rather than under one shared lock).

## 7. Client

New `CancelLegDialog.tsx` / `CancelTripDialog.tsx` (in
`src/client/components/`, alongside `ChangeVendorDialog.tsx`):

1. Fetch and render the preview (impact numbers, §5's shape) — no write
   yet.
2. Require a reason (select from `CANCELLATION_REASONS`) and optional
   remarks.
3. `[CANCEL & NOTIFY]` — calls the cancel endpoint, then loops every
   affected service that has a `ProviderID`: build the cancellation
   email via `generateEmail(defaultTemplateForCancellation(svc.ServiceType), ...)`
   exactly as `ChangeVendorDialog` does today, `saveComm` + `sendComm`.
   Each send's result (sent / failed) is shown per service — a failed
   send doesn't roll back or retry the cancellation itself, matching
   this codebase's established "notification failure never corrupts a
   completed business transition" principle (already true of every
   other Comm-sending flow here).
4. Multi-select checkboxes for "cancel these Legs" on the Trip sheet,
   reusing the existing per-Leg row UI, feeding `cancelLegs`.

## 8. Testing

Following this codebase's established convention (`truncateAll` +
`db-test-utils`, real Postgres, `dotenv -e .env.test`):

- `operational-events.service.spec.ts` — `emit()` fans out to every
  registered listener for that type; a listener throwing doesn't stop
  the others (Nest's `EventEmitter2` default; assert the audit write for
  a sibling event still happens if one listener is mocked to throw); an
  inert (unregistered) type is a no-op, not an error.
- `leg-cancellation.spec.ts`:
  - Cancel a `Planned` Leg with 2 Confirmed / 3 Requested / 1 Not Started
    services → all six move to `Cancelled`, each with the same
    `cancellationReason`; Leg moves to `Cancelled`; one `LEG_CANCELLED`
    and six `SERVICE_CANCELLED` events observed (via a test listener).
  - Cancel a `Completed` Leg → rejected (existing `isValidLegTransition`
    already returns false for this edge — this is a regression guard,
    not new logic).
  - `cancelLegs([...])` across 2 Legs → each Leg gets its own
    `cancellationReason`/history; a concurrent edit to one Leg (stale
    `version`, once the batch route accepts per-Leg versions) fails only
    that Leg, not the batch.
  - `previewLegCancellation` numbers match a hand-built fixture exactly
    (confirmed/requested/not-started/vendor-notification counts).
- `trip-cancellation.spec.ts`:
  - Trip with one `Completed`, one `Active`, one `Planned` Leg → cancel
    Trip → Completed Leg untouched (`status` and `cancelledAtZ` both
    still null), other two → `Cancelled`, Trip → `Cancelled`. This is
    the spec's own §7/§101 acceptance scenario verbatim.
  - Trip where every Leg is already `Completed` → Trip still cancels.
- Client: manual smoke test — cancel a Leg with a real Confirmed
  service on a vendor with an email on file, confirm the Comm arrives
  (reusing the same live-verification approach already used for vendor
  capability requests this session).

## 9. Explicitly out of scope (deferred to their own sub-projects)

- AP/AR financial disposition fields, cancellation-sent-vs-acknowledged
  tracking, post-cancellation-confirmation handling — Cluster C.
- `LEG_REINSTATED` real emit call site and Change-Impact-on-reinstatement
  — Cluster D.
- Any BullMQ queue for notification/brief/financial consequences —
  added by the phase that needs one, on its own dedicated queue.
- Server-side email template rendering — the client-side
  `emailTemplates.ts` flow is reused as-is, not ported.
