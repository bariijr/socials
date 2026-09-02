# VIQ Phase 0 — Architectural Assessment

Assessment of the "VIQ Unified Simplification, Operations & Platform Upgrade"
proposal (97 sections) against the actual VIQ codebase as of 2026-09-02.
Produced per the proposal's own Section 1 mandate before any implementation
work begins. This is a decision record, not an implementation plan — see
"Recommended next step" at the end for what to brainstorm/spec next.

## Method

Four parallel research passes against `prisma/schema.prisma`,
`src/server/modules/**`, `src/client/pages/**`, `ARCHITECTURE.md`, and
`README.md`, split by domain cluster. Every verdict below is backed by a
concrete file reference or an explicit grep result, not inference from the
proposal's own framing.

## Headline finding

VIQ is a genuinely working, non-trivial modular monolith — not the empty
shell a 97-section rewrite proposal might imply. Route-derived service
generation, bulk permit submission by country, a real Document Intelligence
pipeline (OCR → verification → structured data, BullMQ-driven), leg-scoped
crew/pax, a working comms engine with country-overridable templates, and
audited atomic ID generation for Trips all exist and work today. The
proposal is right that this is "not a greenfield rewrite" — but three of its
six proposed domain modules (Financials/AP-AR, GIS, Flight Planning) are at
or near 0% built, one (Tasks/Escalation/Attention/Mail) is entirely absent,
and the "shared state-machine" foundation (Section 5) that much of the rest
of the document assumes does not exist yet — `Trip.status` and
`Service.status` are unconstrained strings with no transition validation,
version field, or per-transition history.

## Cross-cutting conflicts discovered (decide before building)

These aren't proposal-vs-codebase gaps — they're places the proposal's own
requirements collide with existing, working behavior. Each needs a explicit
decision, not a default assumption, before the affected phase starts.

1. **Stop deduplication contradiction (§29 vs. `ensureConnectingStops`).**
   The proposal explicitly requires repeated-ICAO stops to remain distinct
   events (demo flights, `FALA → FALA → FBMN`). The existing
   `ensureConnectingStops` (`legs.service.ts:105-117`) auto-fills connecting
   stops and skips creating one at an already-seen ICAO
   (`stopIcaos.has(icao)`). Fixing the stop model per §28-30 without
   resolving this first will either break auto-fill or violate the
   proposal's own test cases (§79.3/79.4). Recommended resolution to bring
   to that spec: auto-fill only ever creates *implicit* connecting stops and
   never touches or dedups against manually-added ones — decide this
   explicitly rather than let it fall out of implementation order.
2. **Idempotent-but-not-dismissal-aware regeneration.** `generateOverflightServices`/
   `generateArrivalServices` regenerate unconditionally on every leg save; a
   user-deleted service silently reappears (confirmed live, per
   ARCHITECTURE.md item 7). Any Change Impact Engine (§17) or CHANGED-status
   logic (§18) built without first adding dismissal-tracking will produce
   phantom revisions on services a coordinator already explicitly removed.
3. **Organization/OrganizationRole unification (§42) should be rejected as
   proposed.** `Client.isOperator` + `linkedOperatorId` already models the
   one case that actually occurs (a client that is also an operator)
   without a generic Organization table. No evidence any entity today needs
   to be Vendor+Client simultaneously. A generic Organization/Role model
   would be a large, destructive migration across Client/Operator/
   Provider/ContactChannel foreign keys to solve a problem the schema
   doesn't have. Keep Client/Operator/Provider distinct; revisit only if a
   real dual-role vendor case shows up.
4. **Doc/reality mismatch on `UrgencyBadge`.** ARCHITECTURE.md calls it "a
   known, still-unfixed hardcoded stub"; direct code inspection shows it's
   real (computed from services with `Urgency IN ('URGENT','BREACH')`).
   Worth a one-line ARCHITECTURE.md correction so the next agent doesn't
   inherit the stale claim — not a functional gap.

## Cluster A — Trip / Route / Service Status / Permit Generation (§5-20, 28-33, 78-82, 94)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 5 | Shared state-machine fields | ADOPT | `Trip.status`/`Service.status` are bare strings — no `allowedTransitions`/`statusHistory`/`version` |
| 6 | Trip status vocabulary | MODIFY | `Trip.status` defaults `"Planning"`, unconstrained |
| 7 | Service status vocabulary | MODIFY | Real values (`Not Started`/`Requested`/`Confirmed`/…) differ from proposal's set — remap, not greenfield |
| 8 | Route-driven candidates, human-reviewable | ALREADY IMPLEMENTED (partial) | `generateOverflightServices`/`generateArrivalServices` + "N REQUIREMENTS SUGGESTED" banner |
| 9 | Automatic service presetting | ALREADY IMPLEMENTED | same generators cover overflight + landing + handling |
| 10 | User may modify route requirements | ALREADY IMPLEMENTED | country add/remove + per-item REVIEW removal (ARCHITECTURE.md) |
| 11 | Service responsibility field | ADOPT | no such field on `Service` |
| 12 | Zero-edit default submission | MODIFY | bulk group submit exists; message content still needs `ComposeDrawer` open |
| 13 | Bulk grouping compatibility rules | MODIFY | `PermitSubmissionGroups` groups by country only — lumps Landing+Overflight together, violating the "never auto-couple" rule |
| 14 | Permit Types (Block/Blanket/Seasonal/…) | ADOPT | `ServiceTypeDef.category` only has `Permit`/`Handling`/`Other`, no permit-type dimension |
| 15 | Admin-configurable auto-submission policy | ADOPT | nothing found |
| 16 | Required-document attachment engine | ADOPT | `DocTemplate.requiredFor` exists as data; no runtime resolver linking it to Document Intelligence |
| 17 | Change Impact Engine | ADOPT | net-new |
| 18 | Revision workflow | ADOPT | no CHANGED semantics or batch-revision UI |
| 19 | Reconfirmation | ADOPT | `Service.confirmedBy`/`confirmedAtZ` is a single snapshot, no reconfirmation history |
| 20 | Confirmation Box (multiline + structure) | MODIFY | `notes` field is already multiline text but lacks structured sub-fields |
| 28 | Stop model fix | ADOPT (foundational, see conflict #1) | display/model gap, not purely cosmetic |
| 29 | Manual stop / no ICAO dedup | CONFLICT — see #1 above | `ensureConnectingStops` dedups by ICAO today |
| 30 | Stop types | ADOPT | no `stopType` field |
| 31 | ICAO/IATA/name autocomplete | DEFER (unverified at UI layer) | data model supports it; input component not confirmed |
| 32 | Route string parsing | ADOPT | `Leg.routing` is free text only |
| 33 | Include/Exclude FIR driving recalculation | MODIFY | fields exist and trigger recompute, but only against centroid approximation |
| 78 | Automated testing foundation | ADOPT — urgent | zero `*.spec.ts` files anywhere in `src/` |
| 79 | Stop test cases | ADOPT | will fail against current dedup behavior — write after resolving conflict #1 |
| 80 | Route parser test | DEFER | depends on §32 existing |
| 81 | "N requirements, M ready" philosophy | ALREADY IMPLEMENTED (foundation) | extend existing banner with richer breakdown |
| 82 | Bulk actions beyond submit | ADOPT | only bulk submit + bulk delete exist |
| 94 | Core acceptance workflow | MODIFY | first half (route→preset→submit) real; CHANGED/revision/reconfirm half missing |

**Sequencing:** §5 (shared state-machine) must land before §7/17/18/19, which
assume richer status semantics. Resolve conflicts #1 and #2 above as
explicit design decisions before scoping the Leg/Stop-correction work —
they're prerequisite decisions, not implementation details.

## Cluster B — Vendor / Financials / AP-AR (§39-54, 89-90)

The least-built cluster, confirmed: exactly one `Invoice` model
(client-facing only), no vendor-invoice model, no AP concept anywhere.

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 39 | Vendor multi-capability | ALREADY IMPLEMENTED | `Provider.serviceTypes String[]`, `scopeType` |
| 40 | Vendor IDs, atomic | MODIFY | `Provider.providerId` is a plain string ID, no counter |
| 41 | Client IDs, atomic | MODIFY — confirmed anti-pattern | `` `CLI-${Date.now()}` `` used client-side in 3 places (TripDetail.tsx:1257, NewTripWizard.tsx:526, AdminAssets.tsx:664) — exactly the race `TripsService.nextTripId()` was already fixed to avoid; Client never got the same fix |
| 42 | Organization/OrganizationRole unification | REJECT | see conflict #3 above |
| 43 | Vendor questionnaires | DEFER | net-new, no portal/approval-lifecycle code exists |
| 44 | Vendor capability sync | DEFER | depends on §43 |
| 45 | AP vs AR separation | DEFER — foundational, blocks 46-54 | no AP concept exists at all |
| 46 | Vendor invoice intake lifecycle | DEFER | net-new |
| 47 | Vendor invoice duplicate prevention | DEFER | `Document`/`DocAttachment` models could host the file+hash side — reuse, don't parallel-build |
| 48 | Vendor invoice line-matching | DEFER | `PriceItem` + `CountryFee` already give an "expected cost" source (`generateInvoiceFromTrip`) — real reusable groundwork |
| 49 | Third-party disbursement lines | DEFER | depends on §46 |
| 50 | Vendor invoice approval / segregation of duties | DEFER | `User.role` is coarse (Admin/Coordinator/Viewer), no per-invoice approver chain |
| 51 | Vendor payment (partial/multiple/credit-note) | DEFER | client-side `Invoice.paidAtZ` is single-shot, not a ledger |
| 52 | Billing/client invoice workbench | MODIFY | `generateInvoiceFromTrip` already does one-trip→one-invoice from Confirmed services pulling both `PriceItem` and `CountryFee` — solid foundation; missing ready/overdue views and multi-trip consolidation |
| 53 | Client invoice lifecycle | MODIFY | `Invoice.status` is an unenforced free string, no PARTIALLY_PAID/OVERDUE/CREDITED — extend existing model, no new table |
| 54 | Cost estimation stages | DEFER | `PriceItem.price`/`CountryFee.amount` are single point values; `Service` has no cost fields |
| 89 | Financial safety | ADOPT as design constraint | nothing to violate yet — bake into §45-51 schema design from day one |
| 90 | Generated business IDs | MODIFY | Trip done right; Client is the confirmed anti-pattern; Vendor/Invoice ID generation unconfirmed |

**Sequencing:** §45 (AP/AR split) is load-bearing for the entire §46-54
chain — do not start vendor-invoice intake, matching, approval, or payment
before it exists. Fix Client ID generation (§41/90) and formalize the
client Invoice status machine (§53) first — both are cheap, isolated,
high-value, and don't block on the AP schema decision. The source
document's own Phase 11 ordering ("don't attempt consolidated billing
before reliable line-item accounting") is correct — follow it literally.

## Cluster C — Comms / Composer / Briefs / Tasks / Mail / UI Shell (§21-27, 55-77, 83, 91)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 21-22 | One Communication Engine, full context | MODIFY | `Comm`+`CommsService` is real (SMTP, audited, Draft/Sent/Failed) but has only `tripId`+`svcId` — no `legId`, no `vendorId` column, no non-email channel |
| 23 | Contextual Composer | ALREADY IMPLEMENTED (service-level) / MODIFY (trip-level entry) | `ComposeDrawer.tsx` already does service-scoped context (provider/template pre-filled) reusing the same `generateEmail()`/Send&Log path as standalone Composer — the real gap is only a trip-level Leg→Service launcher |
| 24 | Email format settings (Courier 11, config) | DEFER | not implemented; `MailService.send()` is plain text only |
| 25-27 | Trip Brief / Handover / Leg Brief | ADOPT (defer to later phase) | zero existing overlap, but every underlying data source already exists — pure aggregation view, not a schema project |
| 55-60 | Tasks / NLT / Escalation | DEFER — wholly new, high value | zero infra; only unrelated hit is a static `Country.escalationContact` string |
| 61,65-66 | Internal Mail Client | DEFER — security-sensitive, sequence separately | no IMAP/inbox/threading; carries real credential-storage risk, shouldn't be bundled with Tasks just because both are "new" |
| 62-64 | Email Message-ID linking/threading/tagging | DEFER | zero threading infra |
| 67 | Collapsible sidebar | MODIFY | mobile/tablet is a slide-in overlay; desktop sidebar is always full-width, never icon-collapsible |
| 68 | Responsive reassessment | ALREADY IMPLEMENTED (foundation) | 2026-08-29 responsive-foundation plan already shipped |
| 69 | Trip workspace tabs | ALREADY IMPLEMENTED | exact tab set (ROUTE/SERVICES/PEOPLE/DOCS/BILLING/ACTIVITY) already matches, Requirement/ServiceCase deliberately hidden |
| 70 | One Service Experience | ALREADY IMPLEMENTED | `ServiceInlineEditor` + Sheet drawer pattern |
| 72-73 | Supersearch / command palette | DEFER | no hits found anywhere in `src/client` |
| 74 | Dynamic top bar | MODIFY | `"Seed data loaded. All times UTC."` literally present — trivial fix |
| 75 | UTC display | ALREADY IMPLEMENTED | zero-conversion invariant, Z-suffixed fields throughout |
| 76 | Admin Settings centralization | DEFER | one thin `AdminSettings.tsx` vs. the large config surface requested |
| 83 | Action Board content | UNVERIFIED | `Dashboard.tsx` not read in this pass — needs a direct follow-up, not a guess |
| 91 | Keep existing Composer | ADOPT (no-op) | `ComposerPage.tsx` untouched and standalone already; no conflict |

**Sequencing:** Tasks/Attention Engine (§55-60) should precede Trip Brief
(§25-27), since Brief wants to summarize Tasks — building Brief first means
a stub or rework. Composer work is smaller than the document implies
(~70% done at service level); don't let it consume a full phase. Mail
Client should be sequenced late and separately from Tasks — different risk
profile (credentials/OAuth) despite both being "communications-adjacent."

## Cluster D — GIS / Flight Planning / Infra / Testing (§1-4, 34-38, 77, 84-88, 92-93, 95-97)

| § | Topic | Verdict | Evidence |
|---|---|---|---|
| 1-4 | Assessment mandate, mental model, six modules, modular monolith | MODIFY overall | genuinely one app (single `package.json`, Nest serves Vite build) — monolith constraint already satisfied; only 2 of 6 domain modules exist in any real form |
| 34 | Aeronautical GIS | DEFER | zero PostGIS/Mapbox/boundary data (`grep -i mapbox\|postgis` → zero hits); real licensing review (OpenAIP terms) must precede ingestion |
| 35 | Flight Planning architecture | DEFER | no Trip-embedded or standalone planning workspace exists |
| 36 | Multiple FP providers | DEFER — flag licensing | no provider abstraction; RocketRoute/ForeFlight need the user's own commercial keys + ToS review before code |
| 37 | Internal routing engine | MODIFY | `geo.util.ts` centroid-approximation engine already exists (explicit header comment says so) — upgrade, not rewrite from scratch |
| 38 | Route provider fallback strategy | DEFER | no providers exist yet to have a hierarchy between |
| 77 | Document Intelligence | ALREADY IMPLEMENTED | Extraction→Verification→Structured pipeline live, BullMQ-driven, matches described architecture |
| 84 | Optimistic locking / versioning | ADOPT | no `version` field anywhere; real risk for concurrent multi-coordinator edits |
| 85 | Audit vs Activity | ALREADY IMPLEMENTED | ACTIVITY tab is already a correct client-side hybrid projection (Comm history + audit slice), not a duplicate table |
| 86 | Performance/pagination | MODIFY | opt-in envelope pattern exists (Stage 2a/2b) on 3-4 endpoints; extend, don't invent |
| 87 | Background jobs | MODIFY | BullMQ/Redis real but minimal — exactly one queue (`document-processing`); add queues per new capability, not a big-bang rewrite |
| 88 | Fail safely (no false REQUESTED) | ADOPT | no `SUBMISSION_PENDING`-style state yet; real gap once Submission Engine (§12) is built |
| 92 | Over-automation guardrail | ADOPT | free design principle, gate every later phase's acceptance criteria on it |
| 93 | Recommended implementation order | MODIFY | directionally right, confirmed by evidence below |
| 95-97 | Final test / principles / assignment | ADOPT | fine as written — use as Definition of Done for the later phases |

**Sequencing:** GIS/Flight Planning (§34-38) is correctly last among the
technical phases — zero existing surface, heaviest external-licensing risk,
nothing else in the roadmap depends on it landing early. Fold optimistic
locking (§84) into the Phase 2 shared-status-foundation work rather than
its own phase — cross-cutting schema concern, cheapest to add once, early.

## Recommended build sequence (reconciling all four clusters)

The source document's own Phase 0-14 ordering holds up well against the
evidence, with three adjustments:

1. **Phase 1 — Test foundation** (§78-79): write tests now, including the
   stop-dedup tests, which will immediately surface conflict #1 as a
   failing test rather than a design debate.
2. **Phase 2 — Shared status/state-machine + optimistic locking** (§5, §84):
   bundle these — both are cross-cutting schema work touching Trip/Service
   simultaneously, cheaper to do once.
3. **Phase 3 — Leg/Stop correction**: resolve conflict #1 explicitly first
   (auto-fill vs. manual stops) before any schema change.
4. **Phase 4 — Route/service generation refinements** (§11, 13-16): smaller
   than the document implies, since generation itself already works —
   this phase is really "add responsibility field, fix bulk-grouping
   rules, add permit-type dimension, add document-attachment resolver."
5. **Phase 5 — Submission engine + fail-safety** (§12, §88): zero-edit
   submit is partially real; close the gap and add `SUBMISSION_PENDING`.
6. **Phase 6 — Change Impact + Revision + Reconfirmation** (§17-19):
   resolve conflict #2 (dismissal-tracking) before this phase starts.
7. **Phase 8 — Tasks/NLT/Escalation before Phase 13 Briefs** (reordered
   from source doc, which had Tasks at Phase 8 and Briefs at Phase 13 —
   confirmed correct as-is; flagging only that Brief must not start early).
8. **Financials AP/AR** (§45 first, cheap Client-ID/Invoice-status fixes
   even earlier, opportunistically) — the source document's Phase 11
   ordering is validated and should be followed literally.
9. **GIS/Flight Planning stays last** (Phase 12) — validated, zero
   dependency pressure from earlier phases, heaviest external-licensing
   surface.

## Decisions (resolved 2026-09-02)

1. **Conflict #1 (stop dedup) — RESOLVED: remove auto-dedup entirely.**
   `ensureConnectingStops` will no longer skip creating a connecting stop
   because the same ICAO already appears elsewhere on the trip — every leg
   transition gets its own stop record, implicit or manual, regardless of
   repeated ICAOs. This is broader than the originally-proposed "only
   dedup implicit-vs-implicit" compromise; it fully honors §29's "no
   deduplication by ICAO, ever" requirement, including for auto-generated
   connecting stops. To be carried into the Phase 3 design: audit every
   stop-count/stop-list UI for an assumption that stops are unique per
   ICAO before this lands, since none should exist afterward.
2. **Conflict #3 (Organization/OrganizationRole) — RESOLVED: adopt.**
   Proceed with a generic `Organization` + `OrganizationRole` model
   unifying Client/Vendor/Operator, accepting the migration cost now. This
   is **not** part of the Phase 1+3 sub-project below — it belongs to the
   Vendor Upgrade phase (source doc Phase 10) alongside Vendor IDs and
   questionnaires, and should be brainstormed as its own spec when that
   phase starts, informed by this decision.
3. §83 (Action Board content) still needs a direct read of `Dashboard.tsx`
   this assessment didn't reach — pick up when that phase is spec'd.
4. External licensing (Mapbox, OpenAIP, RocketRoute/ForeFlight) all need
   the user's own accounts/keys and ToS review before Phase 12 starts —
   flagged, not yet actioned.

## Next step (in progress)

Per the brainstorming process, this assessment is not itself an
implementation plan. **Phase 1 (test foundation) + Phase 3 (Leg/Stop
correction)** was selected as the first sub-project — it's the one every
later phase depends on, and the stop-dedup decision above makes it more
than pure UI cleanup. That work gets its own brainstorm → spec → plan
cycle, starting now.
