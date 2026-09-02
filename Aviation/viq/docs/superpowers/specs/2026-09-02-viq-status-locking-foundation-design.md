# VIQ Shared Status/State-Machine + Optimistic Locking — Design

Sub-project selected from
[2026-09-02-viq-phase0-architectural-assessment.md](2026-09-02-viq-phase0-architectural-assessment.md)
as the second implementation slice of the platform-upgrade proposal
(Phase 0's recommended "Phase 2" — folding optimistic locking (§84) in
alongside the shared state-machine foundation (§5), since both are
cross-cutting schema work touching the same models). Builds on
[2026-09-02-viq-test-foundation-leg-stop-correction-design.md](2026-09-02-viq-test-foundation-leg-stop-correction-design.md),
the first slice (test framework, Leg/Stop correction), already merged.

## Scope

In scope:
- A `version` field (optimistic locking) on `Trip`, `Leg`, `Service`.
- Conditional updates on those three models: a stale `version` returns
  `409` with the current record and who/when it was last changed.
- A client conflict dialog (COMPARE/RELOAD) wired into the existing
  `TripInfoEditor`, `ServiceInlineEditor`, and `LegEditor` save flows.
- A formal, server-enforced transition graph for `Trip.status` and
  `Service.status`, using their **existing real values** — no vocabulary
  rename. Invalid transitions are hard-rejected (`400`).
- `statusChangedAt`/`statusChangedBy` fields on `Trip` and `Service`.
- Reusable client components: `StatusBadge`, `StatusTimeline`,
  `TransitionMenu`. The transition graph itself is server-only
  (`src/server/common/statusTransitions.ts`); the client never duplicates
  the business rule — it renders whatever `allowedTransitions` the server
  returns.
- Tests: valid/invalid transitions, and a concurrent-edit simulation
  (two reads of the same version, first update wins, second gets `409`
  with the correct `changedBy`/`changedAt`).

Explicitly out of scope:
- The `CHANGED` status and the Change Impact Engine (§17-18 in the
  Phase 0 assessment) — a future phase. This phase only makes the
  **manual** transition into `Re-confirm Required` work correctly under
  the new transition graph; it does not add automatic triggering from
  route/schedule edits.
- `version` fields on `Stop`, `Person`, `Client`, `Provider`, or any other
  model — locking is scoped to the three entities with real concurrent-edit
  contention today (`TripDetail.tsx`'s leg/service editors).
- Bulk-transition UI — `TransitionMenu` is single-record.
- Any change to `Comm.status` (`Draft`/`Sent`/`Failed`) — unrelated
  lifecycle, not a coordinator-facing state machine.

## Why no vocabulary rename

The Phase 0 assessment flagged Service status as needing a "remap, not
greenfield" against the mega-spec's proposed vocabulary
(`DRAFT`/`REQUESTED`/`ACKNOWLEDGED`/`CONFIRMED`/`CHANGED`/…). Direct
inspection of `TripDetail.tsx`'s `SERVICE_STATUSES` constant shows the
real, already-in-production set:

```
Not Required, Not Started, Requested, Chasing, Confirmed,
Re-confirm Required, Cancelled
```

`Re-confirm Required` already covers most of what the mega-spec's
`CHANGED` state would mean, and `bucketForService()`
(`TripDetail.tsx:1081-1087`) already treats it as its own attention
bucket. Renaming every value would touch every consumer of
`Service.Status`/`Trip.status` across client and server (string
comparisons in `bucketForService`, `AttentionStrip`, `AdminTrips.tsx`,
`PermitSubmissionGroups`, dozens of `Status === '...'` checks) for no
functional gain — this phase formalizes the existing vocabulary into an
enforced graph instead of inventing a new one.

## Trip status graph

Values: `Planning`, `Active`, `Complete`, `Cancelled` (exact casing,
matching `CreateTripDto`'s `TRIP_STATUSES` constant — no new values).

```
Planning  -> Active
Planning  -> Cancelled

Active    -> Complete
Active    -> Cancelled
Active    -> Planning     (revert — e.g. trip postponed before departure)

Complete  (terminal, no outbound transitions)

Cancelled -> Planning     (reactivate a cancelled trip)
```

## Service status graph

Values: `Not Required`, `Not Started`, `Requested`, `Chasing`,
`Confirmed`, `Re-confirm Required`, `Cancelled` (exact casing, matching
`TripDetail.tsx`'s `SERVICE_STATUSES` constant — no new values).

```
Not Started -> Requested
Not Started -> Not Required
Not Started -> Cancelled

Requested   -> Chasing
Chasing     -> Requested
Requested   -> Confirmed
Chasing     -> Confirmed

Requested            -> Cancelled
Chasing               -> Cancelled
Confirmed              -> Cancelled
Re-confirm Required   -> Cancelled

Confirmed -> Re-confirm Required   (manual today; the future Change
                                     Impact Engine will auto-trigger this
                                     transition — out of scope here)
Re-confirm Required -> Confirmed

Not Required -> Not Started        (reactivate, the only way out)
Cancelled    -> Not Started        (reactivate, the only way out)
```

Cancel is deliberately reachable from every non-terminal state (a global
escape hatch) — matching how coordinators actually cancel services today
(the existing bulk-delete/status-change UI in `ServiceInlineEditor`
already allows setting `Cancelled` from any status via the plain
`SERVICE_STATUSES` `<select>`, with no current validation at all).

## Optimistic locking mechanics

- `version Int @default(1)` added to `Trip`, `Leg`, `Service`.
- Every GET response for these three models already returns the row as-is
  (Prisma includes all scalar fields by default), so `version` is visible
  to the client with zero extra plumbing.
- `UpdateTripDto`/`UpdateLegDto`/`UpdateServiceDto` gain a required
  `version: number` field (added directly on the derived DTO class body,
  matching the existing pattern used for `Stop.afterLegId`'s DTO
  addition — not part of the corresponding `Create*Dto`, since a newly
  created record always starts at `version: 1`, never client-supplied).
- Each service's `update()` method changes from a plain
  `prisma.X.update({ where: { id }, data })` to a conditional
  `prisma.X.updateMany({ where: { id, version: dto.version }, data: {
  ...data, version: { increment: 1 } } })`. If the resulting `count` is
  `0`, the record either doesn't exist (existing 404 path, checked first
  via the existing `findOne`) or the version was stale — fetch the
  current row and the most recent matching `AuditEntry`
  (`AuditService.forRecord(table, recordId)`, already exists, ordered
  `desc` by `timestampZ` — take the first entry's `user`/`timestampZ`)
  and throw a `409` carrying `{ current: <fresh record>, changedBy,
  changedAt }`.
- No new "who changed it" tracking is added — `AuditEntry.user`/
  `timestampZ` already has this for every change, since `logDiff` already
  runs on every successful update.

## Status transition mechanics

- `src/server/common/statusTransitions.ts` exports two plain maps
  (`TRIP_TRANSITIONS`, `SERVICE_TRANSITIONS`), each `Record<string,
  string[]>` — current status to its list of legal next statuses, per
  the graphs above.
- `TripsService.update()`/`ServicesService.update()`: if `dto.status` is
  present and differs from the current row's status, validate it against
  the map before attempting the conditional update; throw
  `BadRequestException` (`400`) if the transition isn't listed. On a
  successful status change, also set `statusChangedAt: new Date()` and
  `statusChangedBy: user` in the same `data` object as the version bump
  — one write, no separate round-trip.
- `statusChangedAt DateTime?` / `statusChangedBy String?` added to `Trip`
  and `Service` only (the two models with a `status` field — `Leg` gets
  `version` for locking but has no status graph).
- Each Trip/Service response gains a computed `allowedTransitions:
  string[]` field (looked up from the same map by current status) — the
  client never hardcodes or re-derives the graph. This is a response
  shape addition, not a schema field.
- `StatusTimeline` (client component): fetches the same
  `AuditEntry`-backed endpoint the ACTIVITY tab already uses for a
  record, filters client-side to `field === 'status'`, renders
  chronologically. No new backend endpoint or table.

## Client conflict UX

On a `409`, the entity's existing save flow (`TripInfoEditor`,
`ServiceInlineEditor`, `LegEditor` — all already track an edit-draft
state per ARCHITECTURE.md's "Owning UI surface" section) shows a dialog:

```
THIS RECORD HAS CHANGED

Updated by: {changedBy}
At: {changedAt}

[COMPARE]   [RELOAD]
```

- **RELOAD**: discards the local draft, refetches the record, closes the
  dialog — the coordinator re-enters their edit from the current state.
- **COMPARE**: a simple two-column, field-by-field view (your unsaved
  draft vs. the current server state from the `409` response's
  `current`) — read-only, no merge UI. After reviewing, the coordinator
  closes the dialog and either keeps editing (then RELOAD) or abandons
  their change. Merge-then-save is a manual re-edit, not an automated
  three-way merge — out of scope for this phase.

## Reusable components

- **`StatusBadge`**: color-coded pill, one color-mapping table per entity
  type (Trip vs. Service — different value sets). Reused everywhere a
  status currently renders as a bare `<Badge>{status}</Badge>` (e.g.
  `bucketForService`'s callers, `AdminTrips.tsx`'s status column).
- **`TransitionMenu`**: dropdown populated from the record's
  `allowedTransitions` (not the full `SERVICE_STATUSES`/`TRIP_STATUSES`
  constant) — replaces `TripDetail.tsx`'s current plain `<select>` that
  lists every status unconditionally with no transition validation.
- **`StatusTimeline`**: as described above.
- No client-side `TransitionValidator` component — the validation rule
  lives server-side only (`statusTransitions.ts`); the client's role is
  rendering `allowedTransitions`, never independently deciding what's
  legal.

## Testing

Same pattern as the prior sub-project: Jest against real `jetflow_test`,
no mocking. New coverage:

1. Each edge in both transition graphs succeeds; a representative set of
   non-edges (e.g. `Complete -> Active`, `Not Required -> Confirmed`)
   returns `400`.
2. A version-mismatch update returns `409` with the correct `current`
   record and the correct `changedBy`/`changedAt` (sourced from the
   latest `AuditEntry`).
3. Concurrent-edit simulation: two service instances read the same
   `Trip`/`Service` row (same `version`), the first update succeeds and
   increments `version`, the second (still holding the stale `version`)
   gets `409`.
4. `statusChangedAt`/`statusChangedBy` are set correctly on a successful
   status change and left untouched on a non-status update.
5. `allowedTransitions` in a GET response matches the map for that row's
   current status.

## Migration risk

Adding `version`/`statusChangedAt`/`statusChangedBy` as nullable-with-default
columns is low-risk (additive, no backfill required — `version` defaults
to `1` for all existing rows, `statusChangedAt`/`statusChangedBy` stay
`null` until the next status change). No data-repair script needed, unlike
the prior sub-project's `Stop.afterLegId` migration.

The transition-graph enforcement is the higher-risk part: any existing
code path that currently sets an "illegal" status transition (there is no
current validation, so this is possible) will start failing with `400`
after this ships. Recommend auditing `generateOverflightServices`/
`generateArrivalServices`/`reconcileOverflightServices` and any other
server-side code that sets `Service.status` directly (not just the public
update endpoint) before this ships, to confirm none of them attempt a
transition outside the approved graph — this should be a task in the
implementation plan, not assumed clean.
