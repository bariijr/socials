# VIQ Tasks / Attention / Escalation Engine — Design

**Phase:** Phase 0 assessment's Phase 8 (source doc §55-60, §83 Action Board, §93 implementation order).
**Source:** [2026-09-02-viq-unified-simplification-source.md](2026-09-02-viq-unified-simplification-source.md)
**Phase 0 assessment classification:** DEFER-until-sequence — "wholly new, high value — zero infra; only unrelated hit is a static `Country.escalationContact` string." Confirmed by inspection: no `Task` model, no assignment/ownership concept, no escalation logic anywhere in the codebase as of this design.

## 1. Scope

This phase delivers:

- A first-class `Task` entity: title, description, optional links to Trip/Leg/Service/Client, owner, priority, No-Later-Than deadline, status lifecycle, escalation tier.
- **Manual** task creation/editing by coordinators.
- **System-generated** tasks from three signals that already exist in VIQ today:
  1. a Service transitions to `Re-confirm Required` (Change Impact Engine, shipped),
  2. a Service transitions to `Submission Failed` (Submission Engine, shipped),
  3. a Service's `requiredByZ` deadline is approaching while it is still not `Confirmed`/`Requested`.
- Fixed, non-configurable escalation tiers (Amber at NLT − 2h, Red at NLT breached), computed and **persisted** (not purely derived) so an `escalatedAtZ` timestamp survives as a historical record even after the task closes.
- Escalation is **visual only** in this phase — no email/notification side effect. Sending real escalation emails is deferred until the Mail Client (Phase 9) exists to build on.
- A redesigned Action Board (Dashboard) organized around task ownership and escalation, replacing the current 4-stat-card + Open-Services-list layout.

**Explicitly out of scope for this phase** (checked against the codebase, not assumed):
- Task generation from vendor invoice approval, OCR review queues, or billing follow-up (§57) — those upstream systems don't exist yet in VIQ. Building stubs for them just to wire a task source would expand this phase well past its own boundary.
- "Missing required documents" as a task source (§16/§57) — `CountryRule.docsRequired` exists only as unused configuration; nothing in the server resolves it against verified documents. The Document Attachment Engine itself (§16) was never built and is not part of this phase.
- "Vendor Responses Due" as an Action Board bucket (§83) — no SLA/expected-response-window field exists on Service or Comm to compute this from.
- "New Enquiries" as an Action Board bucket (§83) — no Enquiry/Lead model exists in VIQ.
- Admin-configurable escalation rules (§58, §76) — fixed built-in tiers only; a settings UI is a later phase once real usage shows what needs tuning.
- Shared-with / multi-user task assignment (§55's literal "Shared With") — single owner plus team-based visibility (via the existing `User.team` field) covers §59's MY TASKS / TEAM TASKS / UNASSIGNED buckets without a new join table.
- Sending outbound notifications on escalation.

## 2. Data Model

```prisma
model Task {
  id               String    @id @default(cuid())
  title            String
  description      String?
  tripId           String?
  legId            String?
  serviceId        String?
  clientId         String?
  ownerUserId      String?
  priority         String    @default("Normal")   // Low | Normal | High | Urgent
  noLaterThanZ     DateTime?
  status           String    @default("Open")     // Open | In Progress | Waiting | Complete | Cancelled
  statusChangedAt  DateTime?
  statusChangedBy  String?
  version          Int       @default(1)
  source           String    @default("Manual")   // Manual | System
  sourceKey        String?   @unique               // e.g. "reconfirm:<svcId>", "resubmit:<svcId>", "deadline:<svcId>"
  escalationTier   String?                          // null | Amber | Red
  escalatedAtZ     DateTime?
  createdBy        String?
  createdAtZ       DateTime  @default(now())
  completedAtZ     DateTime?

  trip    Trip?    @relation(fields: [tripId], references: [tripId])
  leg     Leg?     @relation(fields: [legId], references: [legId])
  service Service? @relation(fields: [serviceId], references: [svcId])
  client  Client?  @relation(fields: [clientId], references: [clientId])
  owner   User?    @relation(fields: [ownerUserId], references: [id])

  @@index([status])
  @@index([ownerUserId])
  @@index([noLaterThanZ])
  @@map("tasks")
}
```

Follows the same state-machine convention already established for Trip/Service (`status`, `statusChangedAt`, `statusChangedBy`, `version` for optimistic locking) — per the source doc's own §5 mandate that every stateful entity use one consistent mechanism.

`sourceKey` is the idempotency key for system-generated tasks: the sync job (§3) uses it both to avoid double-creating a task for the same trigger and to find-and-close a task once its trigger condition resolves. Manual tasks never set it.

`escalationTier` never downgrades once reached (e.g. an edited-later NLT that pushes a task back below the Amber threshold does not clear an already-stamped tier) — only a manual edit to `escalationTier` itself, or the task completing, clears it. This avoids visual flicker and matches "escalate meaningful exceptions" (§58).

New file `src/server/common/taskStatusTransitions.ts`, alongside the existing `statusTransitions.ts`:

```
TASK_TRANSITIONS = {
  'Open':        ['In Progress', 'Waiting', 'Complete', 'Cancelled'],
  'In Progress': ['Waiting', 'Complete', 'Cancelled'],
  'Waiting':     ['Open', 'In Progress', 'Complete', 'Cancelled'],
  'Complete':    [],
  'Cancelled':   [],
}
```

## 3. System Task Generation & Escalation — one isolated periodic job

Rather than hooking new logic into `ServicesService`/`LegsService`/`TripsService` (already-shipped, tested Change Impact Engine code), all system-task generation, auto-closure, and escalation-stamping lives in a new, fully isolated `TasksModule`. Nothing in this phase modifies `services.service.ts`, `legs.service.ts`, or `trips.service.ts` — the sync job only reads from them and writes to the new `Task` table.

**Module structure:**
```
src/server/modules/tasks/
  tasks.module.ts          — registers BullMQ queue 'task-sync'; schedules a repeatable job (every 10 min) on bootstrap
  tasks.controller.ts      — REST surface (§4)
  tasks.service.ts         — CRUD + status-transition (mirrors services.service.ts's optimistic-lock pattern)
  task-sync.service.ts     — runSync(): the testable core, callable directly with no queue involved
  task-sync.processor.ts   — thin BullMQ @Processor wrapper calling task-sync.service.runSync()
  dto/create-task.dto.ts
  dto/update-task.dto.ts
```

`task-sync.service.ts#runSync()` on each run:

1. **Generate** — for each of the 3 trigger conditions, upsert a Task keyed by `sourceKey` if no open one already exists:
   - Service `status === 'Re-confirm Required'` → `sourceKey: reconfirm:<svcId>`, title "Reconfirm required: `<serviceType>` for `<tripId>`", owner defaults to `Trip.ownerUserId`.
   - Service `status === 'Submission Failed'` → `sourceKey: resubmit:<svcId>`, title "Resubmit: `<serviceType>` for `<tripId>`".
   - Service `requiredByZ` within `leadTimeHours` of now and `status` not in `['Confirmed', 'Requested']` → `sourceKey: deadline:<svcId>`, `noLaterThanZ = requiredByZ`.
2. **Auto-close** — for every existing `source: 'System'` task still `Open`/`In Progress`/`Waiting`, re-check its trigger condition against current Service state; if resolved, transition to `Complete` with `statusChangedBy: 'SYSTEM'`.
3. **Escalate** — for every open task (manual or system) with a `noLaterThanZ`, compute tier (Amber at NLT − 2h, Red at NLT breached) and stamp `escalationTier`/`escalatedAtZ` the first time it crosses a tier it hasn't already reached.

BullMQ is already a dependency and already wired for the document-processing queue (`documents.module.ts`); this phase adds the second queue using the same library, no new infrastructure dependency.

## 4. API Surface

```
POST   /tasks                — create manual task (Coordinator/Admin)
GET    /tasks?scope=mine|team|unassigned|escalated&tripId=...   — list, filtered
GET    /tasks/:id            — detail
PATCH  /tasks/:id            — edit fields / status transition (version required; same optimistic-lock contract as PATCH /services/:svcId)
```

`scope=mine`/`team` resolve against the JWT-verified identity (`@CurrentUser()`), never a client-supplied field — the same RBAC rule already enforced for Trip reopening, permit authorization verify/revoke, and §19 confirmation stamping. `team` resolves via the acting user's own `User.team`, matching tasks whose owner shares that team.

Only Admin/Coordinator may create, edit, or transition tasks. Viewer role is read-only, matching the existing RBAC pattern elsewhere in VIQ.

## 5. Action Board (Dashboard) Redesign

Retired: the current 4 stat cards (Total Trips/Active/Open Services/Urgent) and the flat "Open Services" list. Their function is absorbed by system-generated Tasks, which — unlike the flat list — carry an owner and an NLT.

Kept unchanged: **Upcoming Departures** list.

New layout:

```
[Stat strip: Active Trips · My Open Tasks · Escalated · Upcoming Departures]

MY TASKS          — owner = current user, status in [Open, In Progress, Waiting], sorted by noLaterThanZ
TEAM TASKS        — owner.team = current user's team, excluding mine
UNASSIGNED        — ownerUserId is null
ESCALATED         — any task with escalationTier set (Amber or Red), any owner — cross-cutting sweep view
FAILED MESSAGES   — Comm.status === 'Failed' (existing signal, already populated by the comms engine; not Task-based)
UPCOMING DEPARTURES  — unchanged from current Dashboard.tsx
```

§59's `OVERDUE`/`DUE SOON`/`ESCALATED` collapse into the single `escalationTier` badge (Amber = due soon, Red = overdue) rendered inline on every task row across all buckets, plus the one cross-cutting ESCALATED view above for a team lead sweeping for at-risk items regardless of who owns them. This avoids three separate queries returning overlapping slices of the same underlying data.

§83's `Changed Services` and `Permit Deadlines` buckets are not separate queries either — they are exactly the `reconfirm:`/`deadline:`-sourced System tasks from §3, which already surface in My/Team/Unassigned Tasks through their trip's owner.

## 6. Testing Plan

Per this session's established convention: real `jetflow_test` Postgres via Jest, never mocked Prisma.

- **`tasks.service.spec.ts`** — CRUD, valid/invalid status transitions via `TASK_TRANSITIONS`, optimistic-lock conflict on stale `version`, RBAC (Viewer cannot create/transition/edit).
- **`task-sync.service.spec.ts`** — the core sync logic, called directly (no queue, no timing dependency):
  - Service → `Re-confirm Required` creates exactly one Task with the right `sourceKey`/owner/title; a second `runSync()` call does not duplicate it.
  - Service → `Submission Failed` — same shape of test.
  - Service `requiredByZ` inside lead time and not `Confirmed`/`Requested` creates a `deadline:` task; once `requiredByZ` is outside lead time or status is `Confirmed`, no task is created.
  - Each of the 3 trigger conditions resolving (service reconfirmed / resubmitted successfully / confirmed before deadline) auto-closes its matching open System task.
  - Escalation tier stamps Amber at NLT − 2h and Red at NLT breached; a tier already reached is never downgraded by a later `runSync()` call even if the task's NLT is edited to a later time.
- **Action Board query tests** — My/Team/Unassigned/Escalated bucket filters return correct rows against a fixture set of tasks spanning multiple owners, teams, and escalation tiers.
- **Client** — no test framework exists for the client (established project convention); verify via `npm run build:client` plus a manual dev-server check of the redesigned Dashboard, keeping the local preview current per this session's standing practice.
