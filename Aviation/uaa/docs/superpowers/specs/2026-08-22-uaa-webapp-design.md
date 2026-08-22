# UAA Coordinator Webapp — Design

Status: Approved for implementation planning
Date: 2026-08-22

## Purpose

A standalone web application that replaces `UAA_Coordinator_v5.xlsm`: coordinate
UA/UAA trip legs across countries, request and track permits/clearances by
email with per-country lead-time and validity awareness, notify agents/crew/
team, and export completed legs back into MAYFLY-format Excel for periodic
billing/reporting use.

This is a **separate, standalone project** — not merged into or wired into
`actuator/`'s ad-hoc trip platform, despite that project's `CountryRules`
table and Comms design being reused here as a proven pattern (see Data model
and Comms below). Different project, same good ideas where they fit.

## Scope

- **Full replacement of the Excel workbook is the goal.** The workbook stays
  in use during the build. Once the webapp covers a workflow, coordinators
  stop using that part of the workbook — the whole thing is not swapped over
  in one cutover.
- **The Excel relationship does not end at replacement.** Coordinators need
  an ongoing "Download Completed Missions (Excel)" export in MAYFLY's exact
  column layout, so completed work can still be periodically merged into the
  existing workbook or handed to anyone still working from it (e.g.
  accounting). This is a permanent feature, not a one-time migration script.
- **Full stack from the first commit** — real NestJS backend, real
  PostgreSQL, real email send (not a frontend-only/mock-data phase). Matches
  the stack already used across FlyRaptor, Notify, flyofly, and Actuator:
  NestJS + Next.js, PostgreSQL, Docker Compose on the `web-proxy` network,
  PWA with bottom-nav mobile UI.
- **Full inbound email tracking from the start** — an IMAP worker polling for
  replies and filing them against the right permit request via a correlation
  token, not a send-only v1.
- **Single coordinator role for phase 1.** No RBAC tiers yet — matches how
  the workbook already works (any coordinator can act on any trip); revisit
  once the webapp has real usage to design roles against.

## Data model

Kept at **MAYFLY's actual grain — one row per leg, not per trip** — so the
Excel export stays a direct column mapping instead of a lossy transform. This
is a deliberate divergence from `actuator/`'s Trip→Legs→Stops hierarchy: that
model fits ad-hoc private-flight ops with real multi-stop routing; UAA's
existing data (and every coordinator's mental model) is leg-grained already,
grouped by `Trip No`, exactly as MAYFLY works today.

- **`Legs`** — mirrors MAYFLY's columns: country, region, ref no, client
  name, operator name, client no, agent name, service-report-sent flag,
  returned-in-time flag, agent contacts, trip no, tail, ICAO, arr/dep dates,
  arr-from/dep-to ICAO, activity type, progress, captain name/email, aircraft
  type, MTOW, PGH, TSS team, report/clearance number, TSS-notified flag,
  client-notified flag, agent expenses, ready-to-bill flag, invoice-received
  flag, remarks, supervisor, drive-complete date, invoice number, process-by,
  process date, billing month, leg ID. Grouped by `Trip No`, same as today.
- **`PermitRequests`** — one row per (Leg, Country) that needs a permit.
  Fields: `Status` (lifecycle below), `RequiredByZ` (lead-time deadline),
  `ValidFrom`/`ValidTo` (the *issued* permit's actual validity window —
  distinct from the lead-time deadline; see Permit workflow), clearance
  number, correlation token, and a `SubmissionEmail` snapshot copied from
  `CountryRequirements` at send time (so the record of who a request
  actually went to stays accurate even if the country's on-file address
  changes later).
  - Lifecycle (borrowed as-is from actuator's proven design — one enum,
    no bespoke per-country statuses):
    `Not Started → Requested → Chasing → Confirmed → Re-confirm Required → Cancelled`
- **`CountryRequirements`** — one row per country (or per country+ICAO where
  requirements differ by airport). Merges three existing sources into one
  table: actuator's `CountryRules` (`LeadTimeHours`, `WorkingDaysOnly`), the
  Excel's `GetPermitValidity` rule text (e.g. "date of flight +72 hours"),
  and the INTEL sheet's brief/source/poll-frequency columns. Also carries
  `RequiredDocs` (list), `FormTemplateId`, and `SubmissionEmail` — the
  permit-issuing authority's address for that country (distinct from the
  `Agents`/`Vendors` reference tables, which are ground-handling contacts,
  not permit authorities — mirrors the existing split between AGENTS and
  the hardcoded `missionpermits@univ-wea.com` in the Excel's `PMTNotify`).
- **`FormTemplates`** — per-country uploaded document (Word, for the same
  mail-merge approach the macro already uses) with merge fields. Reuses the
  `#1`/`#2`-style placeholder convention from `mod_Utils.FindReplace` in the
  Excel macro, for continuity with what coordinators already recognize.
- **`Comms`** — outbound + inbound ledger: direction, leg/permit-request ID,
  correlation token, from/to, subject, body, kind (REQUEST/REVISION/CANCEL/
  NOTIFICATION), timestamp. Same shape as actuator's `Comms` table.
- **Reference tables** — `Agents`, `Vendors`, `Teams`, `Tails`, mirroring the
  existing AGENTS/VENDORS/TEAMS/TAILS sheets directly (same lookup keys, so
  data can be seeded straight from the current Excel).
- **`Audit`** — field-level audit trail (leg times, permit status/provider
  changes, trip status), successor to the Excel's hidden LOG sheet.

## Permit workflow

1. Loading/editing a leg computes `RequiredByZ` per country the leg touches,
   from `CountryRequirements` (`ETD − LeadTimeHours`, respecting
   `WorkingDaysOnly`) — same formula actuator already validated.
2. Coordinator opens the composer for a `PermitRequest`: required-docs
   checklist shown, the country's `FormTemplate` auto-filled with trip/
   aircraft/crew data (mail-merge, same pattern as today's service report),
   completed doc attached automatically, request sent with a correlation-
   tagged subject.
3. The IMAP worker polls the shared mailbox, matches the token, files the
   reply onto that `PermitRequest`'s `Comms` thread automatically. A manual
   "file this email" action exists as a fallback for anything the token
   match misses.
4. On confirmation (reply parsed or marked manually), coordinator records
   the clearance number and the issued permit's `ValidFrom`/`ValidTo`. This
   is a **second, independent clock** from `RequiredByZ`: a permit can be
   requested in time and still expire before the flight actually happens, or
   a flight can shift to a date outside an already-issued permit's window.
5. If the leg's ETD later moves such that it falls outside `ValidFrom`/
   `ValidTo`, **or** a permit that was never confirmed passes its
   `RequiredByZ` deadline, the `PermitRequest` automatically flips to
   `Re-confirm Required` and resurfaces on the Action Board. This is the
   concrete mechanism for the "mindful of lead time and validity"
   requirement — flying on a permit that's expired or was never actually
   confirmed in time is the real risk this exists to catch.

## Comms

- Correlation token `[LegID/PR-ID]` embedded in every outbound subject —
  the mechanism inbound matching keys off, independent of mail provider.
- Templates follow the existing telex-style shape already used in the Excel
  macros (reference block, itinerary block, single numbered ask), not a
  generic one-liner — same content coordinators already send, now
  system-composed instead of hand-typed.
- Outbound send is real SMTP via a backend worker (credentials live server-
  side only, never in frontend code or a store the frontend reads).
- Notifications (agent/crew/team — the Excel's Email 1/2/3 and WhatsApp
  equivalents) use the same `Comms` machinery, tagged `NOTIFICATION`, no
  correlation token needed (no reply expected).

## Billing / MAYFLY export

- **"Mark Complete"** action per leg — successor to `ArchivePastOps`, flips
  the leg into a completed state without deleting it from the active view.
- **"Download Completed Missions (Excel)"** — on-demand export, MAYFLY's
  exact column order, for a selected date range. This is the permanent
  bridge back to Excel described in Scope — not a migration tool, a
  recurring feature.
- Deferred to a later phase: a scheduled/automatic nightly export job.
  Phase 1 is on-demand only, to keep the first vertical slice scoped.

## Build sequencing

Vertical slices — each one fully wired (real DB, real send, real auth)
before starting the next, so something usable ships early:

1. Leg intake (MAYFLY-shaped data model) + auth + reference data seeded from
   the current Excel sheets (Agents/Vendors/Teams/Tails) and from actuator's
   `CountryRules` (adapted into `CountryRequirements`).
2. Permit request composer + form auto-fill + send, `CountryRequirements`
   lookups for lead time/docs.
3. `RequiredByZ`/`ValidFrom`/`ValidTo` tracking, re-confirm invalidation,
   Action Board, IMAP inbound worker + correlation matching.
4. Agent/crew/team notifications (Email 1/2/3 + WhatsApp equivalents).
5. "Mark Complete" + MAYFLY-format Excel export.

## Explicitly out of scope for phase 1

- RBAC / multiple roles — single coordinator role only (see Scope).
- Scheduled/automatic Excel export — on-demand only.
- Permit-portal auto-submission for countries that require a login-gated
  web portal rather than email — those stay a manual, checklist-assisted
  flow (generate the filled documents, track the deadline, human does the
  actual portal click-through). Confirmed during this session:
  `travel.state.gov`-style bot-protected sites actively block scripted
  requests, and building around that protection is out of bounds regardless
  of target site.
- Invoice generation, tax handling, or provider-cost linkage — `Legs`
  carries the same flat billing fields the Excel already has
  (expenses/ready-to-bill/invoice-received/invoice-number/billing-month);
  no new billing logic beyond what the workbook already tracks.
- A public-facing/unauthenticated front door (actuator's "Viability IQ"
  concept) — not part of this project.
- Real-time multi-coordinator collaborative editing beyond normal
  request/response — out of scope until there's evidence of concurrent-edit
  conflicts in practice.
