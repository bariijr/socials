# VIQ Phase 0 — Leg Lifecycle, Cancellation, Cloning, Conversational
# Operations & Briefing Engine — Architectural Assessment

Assessment of the 108-section "VIQ Leg Lifecycle, Cancellation, Cloning,
Conversational Operations & Briefing Engine" proposal against the actual
VIQ codebase as of 2026-09-13. Produced per the proposal's own §108
mandate before any implementation begins. Decision record, not an
implementation plan — see "Recommended next step" at the end.

## Method

Direct reads of `prisma/schema.prisma`, `src/server/common/statusTransitions.ts`,
`src/server/modules/**`, `src/client/pages/Dashboard.tsx`, plus three
research passes split by domain (Leg/Trip/cancellation, Financial/Comms,
Infra/Event/Country/Chatbot), cross-checked against the prior
[2026-09-02 Phase 0 assessment](2026-09-02-viq-phase0-architectural-assessment.md)
and every design doc shipped since. Every verdict below cites a concrete
file reference.

## Headline finding

This proposal lands on a codebase that has already closed much of the
foundational gap the *previous* 97-section proposal identified — Change
Impact triggering, a Tasks/Attention engine with escalation, optimistic
locking, and a normalized Country entity all now exist and work. But
this proposal's own core asks are different in kind from anything built
so far: **Leg has no status at all**, **no cancellation workflow of any
kind exists** (Cancelled is a bare reachable status value with no impact
review, no cascade, no reason capture), **no AP/vendor-payable concept
exists** (only a client-facing `Invoice`), **no internal event mechanism
exists**, **no PDF/QR generation exists**, **no LLM/chatbot integration
exists anywhere in this repo**, and **only Email sending is live** (no
WhatsApp/SMS send capability, despite `ContactChannel` modeling those as
data types). Roughly a third of this proposal (§1-28, cancellation
through cloning) is an extension of proven patterns in this codebase;
the conversational, briefing, QR and AP clusters are genuine new
subsystems on the scale of the original assessment's GIS/Flight-Planning
cluster — external dependencies, real setup lead time, and correctly
last in sequence.

## Cross-cutting conflicts discovered (decide before building)

1. **Event Engine vs. existing inline Change Impact logic.** The live
   Change Impact Engine (`legs.service.ts`/`trips.service.ts` `update()`)
   achieves cross-cutting behavior with zero event infrastructure — it's
   inlined function calls in the same transaction, deliberately. §70-73
   proposes a generic Operational Event Engine. Retrofitting Change
   Impact onto a new event bus would touch working, tested code for no
   functional gain. **Recommended resolution:** add `@nestjs/event-emitter`
   scoped to the *new* workflows this proposal introduces (Leg
   transitions, cancellation, reinstatement, cloning) only. Leave Change
   Impact Engine's existing inline calls untouched. Revisit
   consolidation only if a real duplication problem shows up later.
2. **Cancellation workflow status vs. primary Service status.** §11
   itself warns against overloading `Service.status` with
   `CANCELLATION_PENDING/SENT/ACKNOWLEDGED/REJECTED/FAILED`. This
   codebase already solved an identical shape of problem for the
   *send* side: the Submission Engine added `Submission Pending`/
   `Submission Failed` as pre-states rather than jamming send-tracking
   into the existing status enum. **Recommended resolution:** follow
   that precedent — a parallel `ServiceCancellation` record (one per
   cancellation attempt) tracks the vendor-notification workflow state,
   independent of `Service.status`, which itself just moves to
   `Cancelled` when the operational decision is made.
3. **AP/AR is still a hard blocker, now hit from two directions.** The
   original Phase 0 assessment flagged §45 ("AP vs AR separation") as
   foundational and deferred it — it was never picked up. This proposal's
   §13-16 (cancellation financial disposition) needs *some* AP concept
   to have anywhere to put a `BILL`/`NO_BILL`/`DISCUSS` value. Building
   the full AP ledger (vendor-invoice intake, matching, approval,
   payment — original §46-51) is out of scope for a cancellation
   feature. **Recommended resolution:** scope a **minimal AP/AR
   disposition** — enum fields on the new cancellation/confirmation
   records only (no ledger, no vendor-invoice model) — as part of the
   Financial Cancellation Treatment sub-project here, and leave the full
   AP ledger to the original assessment's still-pending Financials
   phase, which this does not replace.
4. **WhatsApp requires a new external integration with the user's own
   account/credentials** (Business API provider, ToS review, phone
   number provisioning) — nothing here today sends outside Email.
   Same risk category the original assessment used to justify putting
   GIS/Flight-Planning last. **Recommended resolution:** sequence
   WhatsApp (both as a notification channel and as a chatbot channel)
   last, after Web Chat is proven internally on Email/in-app only.
5. **Chatbot/LLM is genuinely absent from this repo** — confirmed zero
   `openai`/`anthropic`/LLM references anywhere in `src/server`,
   `prisma/`, or `package.json`, independent of any LLM work done in
   sibling projects. Real net-new subsystem. Matches the proposal's own
   ordering (Phase 12-14, after the domain-service surface it will call
   already exists and is stable).
6. **Country "migration" (§66-69) doesn't apply as framed.** `Country`
   is already the normalized entity (`schema.prisma:12-27`, keyed by
   `iso2`), and every dependent table already FKs to it — there is no
   scattered raw-ISO-string problem to migrate away from. The real work
   is a UI display audit (swap any surviving raw `iso2`/`iso3` display
   for `Country.name`, likely already available via existing joins).
   **Recommended resolution:** downgrade from a standalone migration
   phase to a checklist item folded into whichever phase first touches
   each affected screen — starting with Leg/Trip/Service selectors and
   the new Crew/Dispatch and Passenger Briefs, since those are new
   surfaces being built anyway.

## Cluster A — Leg Lifecycle & Status Foundation (§1-3)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 1-2 | Leg as first-class stateful entity, lifecycle states | ADOPT | `Leg` (`schema.prisma:530-558`) has `legId, tripId, seq, depIcao, arrIcao, etdZ, etaZ, revision, version` — no `status` field at all. `statusTransitions.ts` governs `Trip`/`Service` only; Leg has no entry. |
| 3 | Leg status history (transition log) | ADOPT | Generic `AuditEntry` (`schema.prisma:948-960`, `table/recordId/field/oldValue/newValue`) already backs `Trip`/`Service` `StatusTimeline` via `AuditService.forRecord()` — same mechanism extends to Leg for free; no new history table needed. |

**Sequencing:** This is the load-bearing sub-project — §4-20 all assume
Leg has a status. Recommend this as sub-project 1, mirroring how the
original assessment made status/locking foundation its Phase 2.

## Cluster B — Cancellation: Single/Multi-Leg, Whole Trip (§4-10)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 4 | Cancel single Leg + impact preview | ADOPT | No dedicated cancel endpoint/workflow exists anywhere; `Cancelled` is reachable from every state via the generic `update()` call, with no impact calculation. |
| 5 | Cancel multiple Legs (one op, individual history preserved) | ADOPT | Net-new; no batch-operation pattern for Legs exists (batch exists for `PermitRevisionGroups` on Services — reusable UI pattern, not backend logic). |
| 6-7 | Cancel entire Trip as orchestration; completed Legs stay completed | ADOPT | No Trip-cancel orchestration exists; today `TripsService.update()` just flips the status string. |
| 8 | Cancellation review screen before send | ADOPT | No impact-preview UI pattern exists for any entity today. |
| 9 | Structured cancellation reasons | ADOPT | No `reason`/`remarks` field exists on any status transition today (Trip/Service `notes` is free text, not structured). |
| 10 | Per-Service cancellation actions/notifications | ADOPT | `Comm`/`CommsService` is real (SMTP, audited) but only keyed by `tripId`/`svcId` — no batch-per-service cancellation flow exists; Change Vendor's cancellation-email pattern (`change-vendor.dto.ts`, `Cancellation` `MessageTemplate` type) is the closest precedent and directly reusable. |

**Sequencing:** Depends entirely on Cluster A. §10's per-service
notification reuses the Change Vendor workflow's cancellation-email
precedent (commit `6e34f26f` added a `Cancellation` template type
already) — don't design a parallel notification path.

## Cluster C — Financial Cancellation Treatment (§11-16)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 11 | Cancellation-sent ≠ cancellation-acknowledged workflow state | ADOPT (parallel record, not Service.status) | See cross-cutting conflict #2. |
| 12 | Vendor cancellation policy | ADOPT | `Provider` (`schema.prisma:186-206`) and `VendorAssignment` (`schema.prisma:217-249`) have no cancellation-policy fields of any kind. |
| 13 | Operational vs. financial status separation | ADOPT | No financial-disposition field exists on `Service` (`schema.prisma:577-612` confirmed clean). |
| 14 | AP/AR disposition, independent | ADOPT (minimal — see conflict #3) | Only `Invoice` (client-facing, AR) exists; zero AP concept. |
| 15-16 | Post-cancellation confirmation, audited | ADOPT | `Service.confirmedBy`/`confirmedAtZ` is a single snapshot (no history); nothing flags a post-cancel confirmation today. |

**Sequencing:** Do the minimal AP/AR disposition described in conflict
#3 here; do not open the full AP ledger project from this sub-project.

## Cluster D — Leg Reinstatement (§17-20)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 17-18 | Reinstate retains Leg ID, increments revision | ADOPT | `Leg.revision`/`version` fields already exist and are exactly fit for this; no schema gap beyond Cluster A's status field. |
| 19 | Reinstatement runs Change Impact | ADOPT — reuse, don't duplicate | Change Impact Engine (`2026-09-09-viq-change-impact-engine-design.md`) already has the ETD/route-delta logic; today it only fires from `legs.service.ts update()`. Reinstatement should route through the same update path so triggers fire naturally, not a parallel re-implementation. |
| 20 | Old confirmations re-evaluated (valid/reconfirm/expired/replace) | ADOPT | Change Impact Engine currently only flips `Confirmed → Re-confirm Required`; it has no `EXPIRED`/`REPLACE` verdict vocabulary — extend, don't rebuild. |

**Sequencing:** Depends on Cluster A (Leg status) and reuses Cluster
C's Change Impact hooks — sequence directly after both.

## Cluster E — Trip Cloning (§21-28)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 21-24 | Clone workflow, selective options, multiple clones, no mandatory Trip Group | ADOPT | Net-new; `TripsService.nextTripId()` already gives atomic, race-free Trip ID generation (fixed per the original assessment's §41/90 finding) — directly reusable for clone IDs. |
| 26 | Schedule shift on clone | ADOPT | No relative-shift utility exists; straightforward given `Leg.etdZ/etaZ` are plain timestamps. |
| 28 | Regenerate services on clone, don't copy confirmations | ADOPT | `generateOverflightServices`/`generateArrivalServices` already exist and are the correct regeneration entry point — confirms this is additive, not new generation logic. |

**Sequencing:** Independent of Clusters B-D (doesn't require
cancellation or reinstatement to exist first) but does depend on
Cluster A only insofar as cloned Legs need a starting status
(`Planned`). Could run in parallel with C/D if desired.

## Cluster F — Operational Event Engine (§70-74)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 70 | Shared event mechanism, modular monolith | ADOPT (scoped) | Confirmed zero `EventEmitter2`/domain-event pattern anywhere in `src/`. See conflict #1 — scope to new workflows only. |
| 71-72 | Event consequences, transactional vs. async | ADOPT | BullMQ (`@nestjs/bullmq`) exists but only for 2 narrow pipelines (`task-sync`, `document-processing`) — precedent for adding a new queue per capability, confirmed by the original assessment's §87 verdict ("add queues per new capability, not a big-bang rewrite"). |
| 73 | Idempotency | ADOPT | `Task.sourceKey` (`schema.prisma:698`, unique) is an existing idempotency-key pattern directly reusable for event-driven job dedup. |

**Sequencing:** Per the proposal's own Phase 1 ordering, build this
*before* Cluster B (cancellation) so cancellation/reinstatement can emit
into it from day one rather than being retrofitted.

## Cluster G — Notification Engine & Preferences (§41-45, 86)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 41-42 | Centralized notification/briefing trigger, recipient groups | ADOPT | No centralized notification-policy layer exists; `Comm`/`CommsService` sends one email at a time, manually triggered. |
| 43 | Person/Client communication preferences (channel/mode/language) | MODIFY | `ContactChannel` (`schema.prisma:474-498`) already has `channelType`/`preferred`/`forBilling` — but no `language` field and no digest/frequency field anywhere. Extend, don't replace. |
| 44-45 | Configurable notification modes, deduplication | ADOPT | No digest/dedup logic exists; every send today is a single manual action. |
| 86 | Client distribution profiles | ADOPT | `Client` (`schema.prisma:446-468`) has a `channels: ContactChannel[]` relation but no per-event routing rules. |

**Sequencing:** Depends on Cluster F (events) for triggering, and
WhatsApp is explicitly out of scope until the last phase (conflict #4) —
this cluster ships Email + in-app only first.

## Cluster H — Crew/Dispatch Brief (§46-55, 61)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 46-52 | Structured live brief (Overview/Attention/Legs/Permits/Ground/Flight Planning) | ADOPT | Every underlying data source already exists (Trip/Leg/Service/Permit/Task models) — this is aggregation, not new schema, same conclusion the original assessment reached for Trip Brief (§25-27, "pure aggregation view"). No PDF/document-generation library exists (`pdfjs-dist` is a reader, not a generator) — a generator dependency is net-new. |
| 48 | Attention section | ADOPT — reuse Tasks/Attention Engine | `Task` model already has `escalationTier`/`priority`/`noLaterThanZ` (`schema.prisma:682-711`) and Dashboard.tsx already renders My/Team/Unassigned/Escalated task lists — the Brief's Attention section should query the same engine, not build a parallel one. |
| 53-54 | NOTAM/weather sections, sourced not fabricated | DEFER | No NOTAM/weather provider integration exists; flag for licensing/provider review same as the original assessment's GIS cluster — don't start until a provider is chosen. |
| 55 | Visa/immigration | MODIFY | `Person` (`schema.prisma:717-738`) has `passportNationality`/`passportIssuingCountry`/expiry — enough to key a visa-rule lookup, but no visa-requirement rule table exists; would need new reference data, not just new code. |
| 61 | Live views + PDF/email/WhatsApp snapshots | ADOPT (PDF generator is net-new dependency; WhatsApp deferred per conflict #4) | |

**Sequencing:** Should follow Tasks/Attention (already done) and
precede Passenger Brief, matching the original assessment's own
"Tasks before Brief" sequencing call.

## Cluster I — Passenger Brief (§56-61)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 56-60 | Separate friendly product, weather/local intel/security | ADOPT | Net-new; no passenger-facing content model exists. |
| 60 | Multilingual (5 languages) | ADOPT | No `language` field exists anywhere (confirmed absent on `Person`/`ContactChannel`/`Client`) — this is the first real consumer forcing that field to be added (ties into Cluster G). |
| 59 | Security information, sourced | DEFER | Same as NOTAM/weather — no provider integrated yet. |

**Sequencing:** After Crew/Dispatch Brief (shares the same underlying
canonical-data-then-localize architecture, cheaper to build second).

## Cluster J — Secure QR Views (§62-65)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 62-65 | Service/Trip QR, secure token, view-only, revocable | ADOPT — strong reuse | No QR library in `package.json`, no PDF/QR generation exists. **But** the exact "secure public token-gated view" pattern this needs was just shipped for the Vendor Capability confirmation form (commits `6d50f8a0`, `d15270a7` — public token-gated submission + read-only public page). Reuse that token/routing pattern rather than designing a new one. |

**Sequencing:** Depends on Crew/Dispatch Brief (Trip QR links to it)
and on at least minimal Service confirmation data (already exists) —
can follow directly after Cluster H.

## Cluster K — Country UI Display (§66-69, downgraded)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 66-69 | Country entity normalization | REJECT as framed / MODIFY to UI audit | `Country` already normalized (`schema.prisma:12-27`), every dependent table already FKs via `countryIso2` (~10+ tables). No migration needed. Real remaining work: audit UI for any raw ISO2/ISO3 display and swap to `Country.name` where a join is already available. |

**Sequencing:** Not a phase — fold into Clusters H/I when building
Brief screens (first new surfaces that will display country names to
non-technical readers).

## Cluster L — Conversational Operations, Web Chat, internal users (§29-36, 38-41)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 29-31 | Shared conversational engine, AI interprets/VIQ decides | ADOPT | Zero AI/LLM/chatbot code anywhere in this repo (`src/server`, `prisma/`, `package.json`) — confirmed independent of any chat work in sibling projects (Jetelio v4, flyofly). Fully net-new; needs an LLM provider decision + user's own API key. |
| 32 | Phase 1 = internal users only | ADOPT | Existing `User.role` (Admin/Coordinator/Viewer, per original assessment §50) gives a real role model to gate on. |
| 34-36, 38-41 | Trip creation/query via chat, confirmation on consequential actions | ADOPT | Depends on Clusters A-F existing first — the chatbot is a new client of domain services that must already be built (status, cancellation, reinstatement, cloning, events). |

**Sequencing:** Correctly last among the "new capability" clusters,
after A-J exist — matches the proposal's own Phase 12 ordering and the
original assessment's logic for deferring anything needing external
provider decisions.

## Cluster M — WhatsApp Channel (§37, §43 WhatsApp-specific, §96)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 37, 96 | WhatsApp confirmation UX, security | DEFER | See conflict #4 — needs a Business API provider decision and the user's own account/credentials before any code. |

**Sequencing:** Dead last, after Web Chat is proven on Email/in-app.

## Cluster N — External Client Chat Access (§33, Phase 14)

DEFER — proposal itself places this last ("only after strong
authorization and information-scope controls"); nothing to build until
Clusters L and G are stable and reviewed. No further evidence needed.

## Cluster O — Operational Enhancements (§74-87)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 74 | Readiness model (explicit rules, not AI score) | ADOPT | No readiness aggregation exists; straightforward once Cluster A/B ship (count services by status). |
| 75 | Departure countdown / critical path | MODIFY | Dashboard.tsx (`src/client/pages/Dashboard.tsx`) already shows upcoming-departures and task widgets — extend with countdown + blocking-item list, don't rebuild the page. |
| 76 | "What changed since last view" | ADOPT | `AuditEntry` already has everything needed (`field/oldValue/newValue/timestampZ`) — this is a query/view over existing data, not a new capability. |
| 77 | Shift handover aggregate | ADOPT | Data sources (Tasks, upcoming Legs, escalations) all already exist on Dashboard.tsx individually — net-new is the cross-trip aggregate view. |
| 78 | Acknowledge critical alert | ADOPT | No acknowledgement field exists on `Task` or anywhere else today. |
| 79 | Follow/watch Trip | ADOPT | No watcher/follower relation exists on `Trip`. |
| 80 | Service dependency rules | DEFER | Net-new modeling concept with real design questions (how dependencies compose with Change Impact) — worth its own brainstorm when Cluster D is further along, not bundled in blind. |
| 81 | Vendor response SLA | ADOPT — reuse | `CountryRule.leadTimeHours`/`toleranceHours` (already used by Change Impact Engine) is directly adjacent; extend rather than invent a parallel SLA concept. |
| 82 | Structured Exception/Attention Engine | ADOPT — reuse Tasks | `Task` already has `priority`/`escalationTier`/`sourceKey` — the proposal's desired `type/severity/entityType/entityId/recommendedAction` shape is an extension of the existing model, not a new one. |
| 83 | Collaboration awareness (presence) | DEFER | No presence/websocket infra exists; optimistic locking (`version` fields) already covers the correctness requirement the proposal itself says is primary. |
| 84 | Operational decision log | ADOPT | Distinct from `AuditEntry` (which is field-diff audit) — no free-text "why we decided X" record exists today. |
| 85 | Trip snapshots | DEFER | Real design question (what "logical snapshot" means against a relational schema) — worth its own brainstorm, not a one-line schema add. |
| 87 | Trip closeout checklist | ADOPT | No closeout-readiness check exists; depends on Clusters B-D (cancellation/reinstatement) and C (financial disposition) being in place first. |

**Sequencing:** Mostly small, additive, and independent of each other —
good candidates to batch into one "Operational Enhancements" sub-project
near the end of the non-chatbot work, after Briefs (since several
reference Brief data) and after the Exception/Attention extension.

## Cluster P — Security (§88-89)

ADOPT as a cross-cutting constraint on every cluster above, not its own
phase — RBAC, optimistic locking, audit, and input validation patterns
already exist and are already the established convention (confirmed
throughout every cluster's evidence above); apply them consistently,
same conclusion as the original assessment's §89 verdict.

## Cluster Q — Tests (§90-99) and Acceptance Scenarios (§101-107)

ADOPT as Definition of Done for every cluster above (matches original
assessment's §95-97 verdict) — this codebase's established convention
is real-Postgres-backed Jest tests per phase (confirmed by the Change
Impact Engine spec's testing section); continue it. Not a standalone
phase; each cluster's own sub-project spec should lift its relevant
scenarios from §90-107 directly into its testing section.

## Recommended build sequence

1. **Leg Lifecycle & Status Foundation** (Cluster A) — everything below
   depends on this.
2. **Operational Event Engine, scoped to new workflows** (Cluster F) —
   cheap, cross-cutting, cheaper to add once before Cancellation than
   retrofit after.
3. **Cancellation: Leg / Multi-Leg / Trip** (Cluster B).
4. **Financial Cancellation Treatment, minimal AP/AR** (Cluster C).
5. **Leg Reinstatement** (Cluster D) — reuses Change Impact Engine.
6. **Trip Cloning** (Cluster E) — independent; could run in parallel
   with 3-5 if resourcing allows, since it only depends on Cluster A.
7. **Notification Engine & Preferences, Email/in-app only** (Cluster G).
8. **Crew/Dispatch Brief** (Cluster H) — reuses Tasks/Attention.
9. **Passenger Brief** (Cluster I) — introduces `language` field.
10. **Secure QR Views** (Cluster J) — reuses the vendor-capability
    token pattern.
11. **Operational Enhancements batch** (Cluster O, minus §80/83/85
    which are individually deferred for their own brainstorm).
12. **Country UI display audit** (Cluster K) — folded opportunistically
    into steps 8-9, not its own numbered phase.
13. **Web Chat, internal users only** (Cluster L).
14. **WhatsApp channel** (Cluster M).
15. **External Client Chat access** (Cluster N) — last, per the
    proposal's own explicit ordering.

## Open decisions for sign-off

The six cross-cutting conflicts above have a recommended resolution
each, but none are unilaterally decided — this doc proposes, the next
message asks for explicit approval before sub-project 1 (Cluster A)
starts its own brainstorm → spec → plan cycle.

## Next step

Per the brainstorming process, this assessment is not itself an
implementation plan. Pending sign-off on the sequence and the six
cross-cutting decisions above, **Cluster A (Leg Lifecycle & Status
Foundation)** is proposed as the first sub-project — every later cluster
in this proposal depends on it, mirroring how the original assessment
made its own status/locking foundation the first sub-project.
