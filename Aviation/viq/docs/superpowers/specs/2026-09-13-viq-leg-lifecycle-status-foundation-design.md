# VIQ Leg Lifecycle & Status Foundation — Design

Sub-project selected from
[2026-09-13-viq-leg-lifecycle-cancellation-cloning-conversational-briefing-phase0-assessment.md](2026-09-13-viq-leg-lifecycle-cancellation-cloning-conversational-briefing-phase0-assessment.md)'s
Cluster A — the first sub-project in that assessment's recommended
15-step build sequence. Every later cluster in the mega-spec (single/
multi-leg/whole-trip cancellation, financial disposition, reinstatement,
cloning, briefs, readiness, closeout) assumes Leg has a status; today it
does not.

## Scope

This phase ships the pure status/transition/history foundation only —
mirroring how the Change Impact Engine design scoped itself to just its
own §17 and explicitly deferred adjacent work. **Not** in this phase:
cancellation reason/remarks capture, impact-preview UI, per-service
cascade, vendor notifications, or reinstatement business logic
(revision increment, Change Impact triggering on reinstate). Those
belong to Clusters B and D and will be spec'd separately once this
foundation exists.

## Current state (evidence)

- `Leg` (`prisma/schema.prisma:530-558`): `legId, tripId, seq, depIcao,
  arrIcao, etdZ, etaZ, blockHours, paxCount, crewCount,
  countriesOverflown, revision, callSign, purpose, avoidFirs,
  includeFirs, routing, version`. No `status`, `statusChangedAt`, or
  `statusChangedBy` field.
- `statusTransitions.ts` governs `Trip`/`Service` only — no `Leg` entry.
- `legs.service.ts update()` (line 225+) already does optimistic-lock
  `updateMany({ where: { legId, version }, data: { ...data, version:
  { increment: 1 } } })` and already calls `audit.logDiff(user, 'Leg',
  legId, before, leg)` generically — any new field on `Leg`, including
  `status`, is automatically diffed into `AuditEntry` with zero new
  audit code.
- `trips.service.ts update()` (line 123-146) is the exact template to
  mirror: inline transition validation before the update, conditional
  `statusChangedAt`/`statusChangedBy`, optimistic lock via `version` in
  the `where` clause.

## Design

### 1. Schema

Add to `Leg`:
```prisma
status          String    @default("Planned")
statusChangedAt DateTime?
statusChangedBy String?
```
`version` already exists (added in the 2026-09-02 status-locking
phase) — no change needed there.

### 2. Transition graph

New `LEG_TRANSITIONS` in `src/server/common/statusTransitions.ts`,
shaped like `TRIP_TRANSITIONS` (proven, already live) rather than the
mega-spec's simpler one-way sketch:

```ts
export const LEG_TRANSITIONS: Record<string, string[]> = {
  'Planned':   ['Active', 'Cancelled'],
  'Active':    ['Completed', 'Cancelled', 'Planned'],
  'Completed': ['Active'],
  'Cancelled': ['Planned'],
};
```

`Completed → Active` is role-gated the same way `Complete → Active` is
for Trip today — reuse the same `role` parameter pattern
(`legReopenAllowed`, mirroring `tripReopenAllowed`), Admin-only.

`Cancelled → Planned` is **not** role-gated at this layer, matching
Trip's current `Cancelled → Planning` edge, which also carries no role
restriction today. This is the eventual reinstatement edge — see note
below.

**Note on shipping this edge before Cluster D exists:** Trip already
has this exact same exposure today (`Cancelled → Planning`, no
Change-Impact-on-reopen hook). Shipping the equivalent Leg edge now is
not a new risk class, and it means Cluster D only has to add *behavior*
(revision increment, Change Impact triggering) keyed on the
`Cancelled → Planned` transition inside the same `update()` call — no
later graph change required.

Add matching helpers, same shape as the Trip equivalents:
- `isValidLegTransition(from, to): boolean`
- `legAllowedTransitions(status, role?): string[]`
- `legReopenAllowed(from, role): boolean`
- `withLegTransitions(leg, role?)` — attaches `allowedTransitions` the
  same way `withTripTransitions`/`withServiceTransitions` do, for the
  client to render as-is.

### 3. Wiring — `legs.service.ts update()`

Insert a validation branch before the existing `updateMany` call,
mirroring `trips.service.ts:129-135`:

```ts
if (data.status && data.status !== before.status) {
  if (!isValidLegTransition(before.status, data.status)) {
    throw new BadRequestException(`Cannot transition Leg from "${before.status}" to "${data.status}"`);
  }
  if (!legReopenAllowed(before.status, role)) {
    throw new ForbiddenException(`Only Admins may reopen a Completed Leg`);
  }
}
```

Set `statusChangedAt`/`statusChangedBy` in the `updateMany` data block
only when `status` is actually changing, same conditional pattern Trip
uses. `update()` will need a `role` parameter added (Trip's already
has one) — threaded from the controller's `CurrentUser()`, never
client-supplied.

`audit.logDiff` needs no changes — it already diffs `before`/`after`
generically, so a `status` change on `Leg` produces an `AuditEntry` row
the same way it already does for Trip/Service, which is what backs
`StatusTimeline` today. `withLegTransitions()` gets applied at every
read path that returns a Leg (`findOne`, list, post-update response),
mirroring `withTripTransitions`/`withServiceTransitions`.

### 4. Backfill migration

New Prisma migration; one-time data backfill for every existing `Leg`
row (the column arrives with a default, but existing rows need a
*meaningful* status, not just the default):

- Trip `status === 'Complete'` → Leg `'Completed'`
- Trip `status === 'Cancelled'` → Leg `'Cancelled'`
- Otherwise: `'Planned'` if `etdZ` is in the future, else `'Active'`

No synthetic `AuditEntry` rows are written for the backfill — this
phase doesn't invent a "reason" concept (see Explicitly out of scope),
and an unexplained first row is consistent with how every other
backfilled field in this codebase already behaves (no precedent for
synthetic audit rows on migration).

### 5. Explicitly out of scope

- Cancellation reason/remarks capture — no field exists to hold free
  text tied to a specific transition (`AuditEntry` has no such column);
  Cluster B decides where this lives.
- Impact-preview UI, per-service cascade, vendor notifications —
  Cluster B.
- Reinstatement business logic (revision increment, Change Impact
  Engine triggering on `Cancelled → Planned`) — Cluster D. The graph
  edge exists after this phase; the behavior does not yet.
- Any UI change beyond the generic `allowedTransitions` the client
  already knows how to render for Trip/Service — a dedicated "Cancel
  Leg" button/flow is Cluster B's job.

## Testing

Server, real-Postgres-backed (this project's established convention):
- Every legal `LEG_TRANSITIONS` edge succeeds; every illegal pair
  throws `BadRequestException`.
- `Completed → Active` succeeds for Admin role, is rejected
  (`ForbiddenException`) for non-Admin.
- `Cancelled → Planned` succeeds for any role (no gate).
- A `Leg` status change writes a correct `AuditEntry` row (via the
  existing generic `audit.logDiff` path) and sets
  `statusChangedAt`/`statusChangedBy`.
- Optimistic lock: a stale `version` on a status-changing update fails
  the same way it already does for non-status field edits today.
- Backfill migration: seed Legs under Trips in each of
  `Planning`/`Active`/`Complete`/`Cancelled`, with `etdZ` both past and
  future, run the migration, assert the resulting Leg statuses match
  the heuristic above exactly.
- Existing `legs.service.spec.ts`-equivalent tests continue to pass
  unchanged — no behavior change for updates that don't touch `status`.

Client: `npm run build:client` only — no UI work ships in this phase
beyond whatever generically renders `allowedTransitions` already (if
any Leg detail view surfaces a status badge/menu, it should use the new
field, but building that UI is not blocked on this being its own task
if the existing Trip/Service status-menu component can be pointed at
Leg directly; confirm during implementation, not a spec-time decision).

## Migration

One new Prisma migration: add `status`/`statusChangedAt`/
`statusChangedBy` columns to `Leg`, plus the one-time backfill data
migration described above.
