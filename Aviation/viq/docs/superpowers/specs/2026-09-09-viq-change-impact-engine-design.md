# VIQ Automatic Change Impact Triggering — Design

Sub-project selected from
[2026-09-02-viq-phase0-architectural-assessment.md](2026-09-02-viq-phase0-architectural-assessment.md)'s
Phase 6 (§17 "Change Impact Engine", §18 "Revision workflow", §19
"Reconfirmation"). Phase 5 (Submission Engine + fail-safety) is complete;
this is the next phase in the assessment's recommended build sequence.

## Scope note: what Phase 6 actually needs, vs. what's already done

The assessment's one-line entries for §17-19 read: "Change Impact Engine
— ADOPT, net-new"; "Revision workflow — ADOPT, no CHANGED semantics or
batch-revision UI"; "Reconfirmation — ADOPT, `Service.confirmedBy`/
`confirmedAtZ` is a single snapshot, no reconfirmation history." Two of
these three are already substantially addressed by earlier work this
session, narrowing this slice considerably:

- **§18's "batch-revision UI"** is done — `PermitRevisionGroups` (built
  as a §13 follow-up) already lets a coordinator select multiple
  `'Re-confirm Required'` legs and send one revision email per leg.
- **§18's "CHANGED semantics"** is deliberately NOT being added. The
  original status/locking design phase already made this call: "`Re-confirm
  Required` already covers most of what the mega-spec's `CHANGED` state
  would mean... this phase formalizes the existing vocabulary into an
  enforced graph instead of inventing a new one." This phase does not
  reopen that decision — no new status value.
- **§19's "reconfirmation history"** (replacing the single
  `confirmedBy`/`confirmedAtZ` snapshot with a real history of every
  confirm/reconfirm cycle) is a genuine data-modeling gap, but a
  separate, later slice — not addressed here.

What remains, and what this spec covers, is **§17 alone**: nothing in
this codebase automatically transitions a `'Confirmed'` service to
`'Re-confirm Required'` when the leg or trip it depends on changes. Today
that transition is manual-only (a coordinator clicking it via
`TransitionMenu`). `legs.service.ts`'s `update()` already recomputes
`countriesOverflown` and calls `reconcileOverflightServices` on a
route/FIR change — but that only adds/removes **not-yet-confirmed**
Overflight services; it never looks at whether an already-`Confirmed`
service (Overflight, Permit, or GroundHandling) needs re-confirmation.
`trips.service.ts`'s `update()` has no change-impact logic of any kind.

## Trigger categories

Three independent triggers, decided during brainstorming:

1. **ETD/ETA change beyond country-specific tolerance** (leg-scoped).
2. **Route change, no tolerance** (leg-scoped): dep/arr ICAO, or the
   effective route (`countriesOverflown` after Avoid/Include FIR
   adjustments) differs from before.
3. **Trip identity change, no tolerance** (trip-scoped): `operator` or
   `registration` changes.

All three only ever flag services currently at `'Confirmed'` — a
service still at `'Requested'`/`'Chasing'`/etc. hasn't locked anything in
yet that needs invalidating, and is left untouched (it simply proceeds
with whatever the leg/trip now says).

## Tolerance lookup (trigger 1)

Reuses `CountryRule.toleranceHours` — a field that already exists in the
schema (`prisma/schema.prisma`) and is currently written by nothing and
read by nothing anywhere in the codebase (confirmed by a direct search).
For each `'Confirmed'` service scoped to the leg, look it up by
`(countryIso2, serviceType)` — the exact same key `ServicesService`'s
private `leadTimeHours()` already uses for `CountryRule.leadTimeHours`.
If no matching `CountryRule` row exists, the tolerance defaults to `0`
hours (strictest — any ETD/ETA change flags it), matching this session's
established "flag rather than silently miss it" bias
(`reconcileOverflightServices`'s flag-don't-delete pattern for the same
reason).

## Mechanics

Each trigger, once it identifies a service that needs flagging, applies
the exact same transition an existing manual `TransitionMenu` click
already performs — `'Confirmed' → 'Re-confirm Required'` is already a
legal edge in `SERVICE_TRANSITIONS` (`src/server/common/statusTransitions.ts`),
so **no transition-graph change is needed**, only a new automatic caller
of the existing update path. Each auto-flag:

- Sets `status: 'Re-confirm Required'`.
- Appends an explanatory sentence to `notes` describing exactly what
  changed and why it crossed the threshold, e.g.:
  - `"Auto-flagged: ETD moved 3.5h (exceeds 2h tolerance for KE Overflight)."`
  - `"Auto-flagged: route changed HTDA → HTKJ."`
  - `"Auto-flagged: trip operator changed from OP-1 to OP-2."`
- Logs an audit entry: `audit.log('SYSTEM', 'Service', svcId, 'AutoReconfirm', before.status, 'Re-confirm Required')`.

This mirrors the same pattern `reconcileOverflightServices` already uses
for its own `'FlaggedStale'` audit entries — a system-driven state change
gets its own distinct audit `field` value so it's visually distinguishable
from a coordinator-driven change in the audit trail / `StatusTimeline`.

## Where this hooks in

`legs.service.ts`'s `update()` (triggers 1 and 2) — both need the
pre-update `before` leg record (already fetched) and the post-update
`leg` record (already fetched, for the existing `audit.logDiff` call) to
compute deltas. Both triggers run **after** the existing
`reconcileOverflightServices` call (if any), operating on whatever
services still exist post-reconcile, and **before** the function returns.

`trips.service.ts`'s `update()` (trigger 3) — needs the pre-update
`before` trip record (already fetched) and the `data.operator`/
`data.registration` fields from the incoming DTO, compared against
`before.operator`/`before.registration`.

## Explicitly out of scope

- Any change to `SERVICE_TRANSITIONS` — the `'Confirmed' → 'Re-confirm
  Required'` edge already exists.
- Any new `Service` or `Trip` status value ("CHANGED" or otherwise) —
  rejected per the original status-locking design decision, not reopened
  here.
- Reconfirmation history (§19) — `Service.confirmedBy`/`confirmedAtZ`
  remain a single snapshot; a reconfirmation still just moves the service
  back to `'Confirmed'` manually via the existing `TransitionMenu`, same
  as today. A later slice could add a `ServiceConfirmation[]` history
  table if this becomes a real operational need.
- Any change to the `PermitRevisionGroups` bulk-revision UI itself — it
  already surfaces every `'Re-confirm Required'` service, however that
  status was reached (manual click or, after this phase, an automatic
  trigger); nothing about how it's populated needs to change since it
  already queries by `status === 'Re-confirm Required'`.
- Retroactively flagging a `'Requested'`/`'Chasing'` service whose
  underlying leg/trip changed — deliberately deferred (see Trigger
  categories above).
- Extending `reconcileOverflightServices`'s add/remove behavior to
  Permit/GroundHandling (airport-scoped) services on a dep/arr ICAO
  change — a real pre-existing gap (only Overflight/country-scoped
  services get reconciled today), but a separate concern from this
  phase's job (flagging already-*Confirmed* services), not addressed
  here.

## Testing

Server, real-Postgres-backed (this project's established convention):
- ETD change within a country's tolerance does NOT flag a Confirmed
  service.
- ETD change beyond a country's tolerance DOES flag it, with the correct
  note text and audit entry.
- No `CountryRule` row for the service's country/type → tolerance
  defaults to 0 → any ETD change flags it.
- A route change (dep/arr ICAO) flags every Confirmed service on the leg
  regardless of country, even a 1-minute ETD change alongside it.
- An avoid/include-FIR-only change that alters the effective
  `countriesOverflown` flags Confirmed services on the leg.
- A trip `operator` or `registration` change flags every Confirmed
  service across every leg of the trip, not just one leg.
- A service NOT at `'Confirmed'` (e.g. `'Requested'`) is untouched by
  any of the three triggers.
- A Not Started/Cancelled/Not Required service is untouched (same
  reasoning).
- Existing `service-regeneration.spec.ts`/`service-status-locking.spec.ts`
  tests continue to pass unchanged — no behavior change for services this
  phase's triggers don't touch.

Client: `npm run build:client` only (no server-facing API shape changes
this phase — the client already renders whatever `status`/`notes` the
server returns, and `PermitRevisionGroups` already queries by
`status === 'Re-confirm Required'`).

## Migration

None. `CountryRule.toleranceHours` already exists; no schema change.
