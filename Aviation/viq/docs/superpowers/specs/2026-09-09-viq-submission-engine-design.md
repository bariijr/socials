# VIQ Submission Engine + Fail-Safety — Design

Sub-project selected from
[2026-09-02-viq-phase0-architectural-assessment.md](2026-09-02-viq-phase0-architectural-assessment.md)'s
Phase 5 (§12 "Zero-edit default submission", §88 "Fail safely (no false
REQUESTED)"). Phase 4 (§11 Service Responsibility, §13 Bulk Submission
Compatibility, §14 Permit Authorizations) is complete; this is the next
phase in the assessment's recommended build sequence.

## Problem

`PermitSubmissionGroups` (built in the §13 slice) already groups compatible
services by country + service type and lets a coordinator bulk-select
legs — but "submitting" a group today only flips each selected service's
`status` to `'Requested'` with a shared reference number. No message is
actually sent to any provider or authority; the coordinator still has to
separately open `ComposeDrawer` per service to generate and send the real
request email. This is §12's "bulk group submit exists; message content
still needs `ComposeDrawer` open" gap.

Because the status flip happens with no send attempt at all, there is also
no way for a submission to fail — a service can never legitimately show
`'Requested'` when nothing was actually requested, but there is equally no
mechanism to *prevent* that once real sending is added: if a future send
attempt fails partway through a batch, a naive implementation could still
leave some services marked `'Requested'` with no real message behind them.
This is §88's "fail safely" gap — it doesn't exist as an active bug yet
because nothing sends real messages yet, but it will as soon as this phase
adds that capability.

## Scope

In scope:
- `PermitSubmissionGroups`'s submit action becomes a real per-service send:
  generate the request email (reusing the same template/provider selection
  `ComposeDrawer` already uses for a single service), save and send the
  `Comm`, and only mark the service `'Requested'` once the send is
  confirmed.
- Two new `Service.status` vocabulary values — `'Submission Pending'`
  (a send is in flight) and `'Submission Failed'` (the send did not
  succeed) — with transition-graph edges added to `SERVICE_TRANSITIONS`.
  No schema/migration change: `status` is already a plain string column.
- A service with no `ProviderID` assigned is skipped before any status
  change, with a clear reason reported to the coordinator — the engine
  never guesses who to send an official permit request to.
- `StatusBadge` color entries and `bucketForService` attention-bucket
  classification for both new statuses.
- Tests: server-side transition-graph tests for the two new edges/states;
  no new server business logic beyond the vocabulary/graph extension, since
  the actual send orchestration lives client-side reusing existing
  `saveService`/`generateEmail`/`saveComm`/`sendComm` primitives (same
  layering `PermitRevisionGroups`, built in the §13 follow-up, already
  uses for its own per-service send loop).

Explicitly out of scope:
- Any change to how a *single* service is requested via `ComposeDrawer`
  directly (that flow's `Request`/`Revision` toggle and manual compose
  step are untouched — this phase only changes what the *bulk* group
  action does).
- Retrying a `'Submission Failed'` service automatically (e.g. a
  background job) — retry is a manual action (re-selecting the leg and
  clicking submit again, which is a valid edge from `'Submission Failed'`
  back to `'Submission Pending'`).
- The full Change Impact Engine (§17) — automatic triggering of
  `'Re-confirm Required'` from a route/schedule edit remains a later,
  separate phase (Phase 6 in the assessment's sequence). This phase does
  not touch that.
- A `SUBMISSION_PENDING`-style state for the Revision flow
  (`PermitRevisionGroups`) — revisions are notifications about an
  already-Confirmed service, not a fresh request; a failed revision send
  is reported to the coordinator the same way it already is today (an
  alert listing which legs failed), without a status-vocabulary change,
  since the service's status doesn't need to reflect "a revision email
  is in flight" the way a fresh request's status must reflect "nothing
  has actually been requested yet."

## Status vocabulary and transition graph

`SERVICE_TRANSITIONS` in `src/server/common/statusTransitions.ts` gains:

```ts
export const SERVICE_TRANSITIONS: Record<string, string[]> = {
  'Not Started': ['Requested', 'Submission Pending', 'Not Required', 'Cancelled'],
  'Submission Pending': ['Requested', 'Submission Failed'],
  'Submission Failed': ['Submission Pending', 'Not Started', 'Not Required', 'Cancelled'],
  'Requested': ['Chasing', 'Confirmed', 'Not Required', 'Cancelled'],
  'Chasing': ['Requested', 'Confirmed', 'Not Required', 'Cancelled'],
  'Confirmed': ['Re-confirm Required', 'Cancelled'],
  'Re-confirm Required': ['Confirmed', 'Not Required', 'Cancelled'],
  'Not Required': ['Not Started'],
  'Cancelled': ['Not Started', 'Not Required'],
};
```

(Every existing edge is unchanged; only `'Not Started'` gains one new edge
and two new status rows are added.)

`'Not Started' → 'Submission Pending'` is a normal, generally-available
edge in the graph — no role gate, no dedicated bypass method. This is
different from the permit-authorization work's `serviceAuthorizationLinkAllowed`
special case: that needed a narrow, named exception because the target
edge (`→ 'Confirmed'`) wasn't otherwise reachable from most statuses and a
system shortcut skipping straight to a terminal-feeling state needed
guarding. Here, `'Submission Pending'` is an ordinary mid-sequence state
reachable by the existing generic `update()` endpoint's normal transition
validation — no special-casing needed. A coordinator could in principle
select `'Submission Pending'` manually from `TransitionMenu` (which
renders whatever `AllowedTransitions` the server returns, with no
per-status hiding today) — this is a minor, low-cost UX rough edge (it
would just sit there with no message sent, recoverable by transitioning
back out), not a correctness or safety issue, and is left as a known,
easily-fixed nicety rather than adding new hide-this-one-value logic to
`TransitionMenu`.

`create-service.dto.ts`'s `SERVICE_STATUSES` const gains both new values so
the DTO's `@IsIn` validator accepts them:

```ts
const SERVICE_STATUSES = [
  'Not Required', 'Not Started', 'Requested', 'Chasing', 'Confirmed',
  'Re-confirm Required', 'Cancelled', 'Submission Pending', 'Submission Failed',
] as const;
```

`update-service.dto.ts`'s `UpdateServiceDto extends PartialType(OmitType(CreateServiceDto, ...))` — no separate edit needed there, it inherits the updated `status` validation automatically.

## Bulk-submit flow (client-side rewrite)

`PermitSubmissionGroups.submitGroupRequest` in `src/client/pages/TripDetail.tsx`
changes from:

```ts
// current: pure status flip, no send
await saveService({ ...service, Status: 'Requested', RefNumber: ref, Notes: ... });
```

to a per-service loop mirroring `PermitRevisionGroups.sendGroupRevisions`'s
existing shape (built in the §13 follow-up):

1. If `service.ProviderID` is not set, skip this service and record it
   under a "no provider assigned" reason — no status change at all.
2. `saveService({ ...service, Status: 'Submission Pending' })` — the
   optimistic-locking `Version` already carried on every `Service` object
   makes this a normal conflict-safe write, no different from any other
   status-changing save.
3. Resolve the provider (`service.ProviderID` — already validated present
   in step 1), build recipients from its email channels, resolve the
   default `Request` template via `defaultTemplateFor(service.ServiceType, 'Request')`,
   call `generateEmail(...)` the same way `ComposeDrawer`/`PermitRevisionGroups`
   already do.
4. `saveComm` + `sendComm`.
5. On `sent.Status === 'Sent'`: `saveService({ ...service, Status: 'Requested', RefNumber: ref, Notes: ... })`
   using the group's shared reference, exactly as today.
6. On any failure (non-`'Sent'` result or a thrown exception):
   `saveService({ ...service, Status: 'Submission Failed', Notes: <error/failure reason appended> })`.
7. Report a single summary alert at the end: which services were
   submitted successfully, which were skipped (no provider), and which
   failed to send — three distinct buckets rather than today's single
   "skipped" list.

Each step's `saveService` call carries the service's current `Version`
from the loop's own iteration variable — since steps 2 and 5/6 both
mutate the same service, the second call must use the `Version` returned
by step 2's save (not the original pre-loop value), the same "always use
the freshest returned object" discipline `PermitRevisionGroups` doesn't
currently need (it never re-saves the same object twice in one pass) but
this flow does.

## UI updates

`StatusBadge`'s `SERVICE_STATUS_COLORS` (`src/client/components/StatusBadge.tsx`):

```ts
'Submission Pending': 'bg-amber-100 text-amber-700',
'Submission Failed': 'bg-red-100 text-red-700',
```

`bucketForService` (`src/client/pages/TripDetail.tsx`) gains an explicit
check so a failed submission surfaces as needing attention rather than
falling into the generic `'waiting'` default:

```ts
if (s.Status === 'Submission Failed') return 'action';
```

(`'Submission Pending'` needs no new check — it correctly falls through
the existing logic into the default `'waiting'` bucket, since it isn't
`Urgent`/`Breach`/`Not Started` and isn't a resting state needing
attention while a send is genuinely in flight.)

## Testing

Server: no test file exists yet for `statusTransitions.ts` (confirmed by
direct inspection of `src/server/common/`) — create
`src/server/common/statusTransitions.spec.ts` as a new, plain unit-test
file (pure function, no Postgres needed) covering the two new states:
`'Not Started' → 'Submission Pending'` valid,
`'Submission Pending' → 'Requested'` valid,
`'Submission Pending' → 'Submission Failed'` valid,
`'Submission Failed' → 'Submission Pending'` valid (retry),
`'Submission Failed' → 'Not Started'` valid (abandon),
and confirm a service actually persisted at `'Submission Pending'` or
`'Submission Failed'` round-trips correctly through the existing
`services.service.ts` `update()` path (a real Postgres-backed test, not a
pure unit test of the graph function alone) — this exercises the DTO's
`@IsIn` accepting the new values end-to-end, not just the graph function.

Client: `npm run build:client` only, per project convention (no client
test framework). Manual verification: submit a group with a mix of
provider-assigned and provider-missing services, and confirm one
service's send failing (e.g. temporarily point it at an unreachable
provider) does not mark it `'Requested'`.

## Migration

None. `status` remains an unconstrained string column at the database
level (as it always has been) — only the DTO's `@IsIn` list and the
`SERVICE_TRANSITIONS` map change, both pure application-code constants.
