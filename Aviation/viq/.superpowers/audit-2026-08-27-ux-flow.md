# VIQ Visual Walkthrough, Regression Check & UX/Flow Upgrade Proposals — 2026-08-27

Fresh logged-in tour of VIQ as an Admin user (locally-minted JWT, no password ever typed anywhere), running the production build (`npm run build` + `node dist/main.js`). This is a follow-up to the 2026-08-26 audit (`.superpowers/audit-2026-08-26-ux-preview.md`) after a batch of 11 fixes landed — this pass verifies those fixes are actually live, looks for anything new, and (new this round) proposes concrete UX/flow upgrades aimed at the app eventually supporting many more concurrent users across several internal divisions of one organization (confirmed scope: single shared instance, not a multi-tenant product — this is an infra/UX scaling question, not a data-isolation one).

12 screenshots saved to:
`C:\Users\bminja\AppData\Local\Temp\claude\C--Backups-InsiderTechSol-Aviation-viq\0f941388-d549-492c-a6a0-851fefaf6230\scratchpad\preview2\01-dashboard.jpg` through `12-landing-hero.jpg`.

---

## 1. Confirming the 2026-08-26 fixes are actually live

All five UI-visible fixes from the prior batch were checked directly against the running app, not just re-read from a report:

| Fix | Status | Evidence |
|---|---|---|
| Deactivate `sdd_test_admin` | ✅ Live | `/admin/users` shows a red "Deactivated" badge on `sdd_test_admin` (`11-users.jpg`) |
| Sidebar "urgent" badge shows a real count | ✅ Live | Sidebar reads "34 urgent" — a number that moves with the data, not the old hardcoded "3" (`01-dashboard.jpg`, present on every screen) |
| Admin Dashboard's urgent list: raw ID moved off the visible line | ✅ Live | The "Urgent & Breached Services" list on `/admin` no longer shows a raw `SVCID` string inline next to the service type (`04-admin-dashboard.jpg`) |
| Manage Trips' empty state explains the 72h filter | ✅ Live | `/admin/trips` on a day with nothing due shows "0 of 6 trips have a leg departing in the next 72h — type to search all trips" instead of a bare "No trips match" (`03-admin-trips-empty-state.jpg`) |
| Billing gated to Admin | ✅ Live (partial check) | Admin can reach `/admin/billing` normally (`10-billing.jpg`); the Coordinator-denied side of this was already independently verified live during the fix itself (documented in that session's ledger) and wasn't re-tested here since nothing about it could have regressed without a code change to `invoices.controller.ts` or `App.tsx`, neither of which happened since |

No regressions found in any of the five.

---

## 2. New or still-open findings this pass

### 2a. A live, visible urgent-count mismatch between two pages (new evidence, previously only a theoretical risk)

The Action Board (`/dashboard`) shows **"URGENT: 33"** in its own stat card. The Admin Dashboard (`/admin`) and the sidebar badge (now wired to match Admin Dashboard's definition) both show **"34"**. Same moment in time, same underlying data, two different numbers a coordinator could be looking at side by side.

**Root cause:** `Dashboard.tsx`'s stat is computed from services that are first filtered to "open" (`Status !== 'Confirmed' && Status !== 'Not Required'`) and *then* checked for `Urgency === 'URGENT' || 'BREACH'`. `AdminDashboard.tsx`'s stat (and now the sidebar, which intentionally mirrors it) skips the "open" pre-filter and checks `Urgency` directly against the full service list. A service that's somehow `Urgency: 'BREACH'` while already `Status: 'Confirmed'` counts in one and not the other.

This was flagged as a known, pre-existing inconsistency during the 2026-08-26 fix batch (the sidebar-badge fix deliberately picked one of the two existing definitions to mirror, rather than inventing a third), but that batch's scope was "wire the badge to *a* real count," not "reconcile the two counts" — so this is the first time the actual live 33-vs-34 discrepancy has been captured with real numbers rather than described abstractly.

**Fix scope:** small — pick one canonical definition (probably "open services" is the more meaningful one, since a `Confirmed` service is that service's issue is resolved regardless of what its stale `Urgency` field says) and have `Dashboard.tsx`, `AdminDashboard.tsx`, and the sidebar all call the same shared function, the same way `personExpiryStatus()` was centralized for expiry-severity logic. Not fixed here — flagged for the next hardening pass.

### 2b. Screenshot-capture friction on two pages — likely a testing-tool artifact, not confirmed as an app defect

Full-page screenshot capture (via Chrome DevTools Protocol) timed out twice during this tour: once on the Audit Trail page (387 rows rendered) and once on Trip Detail after clicking the People tab (only 2 table rows on screen). In both cases, the underlying app had actually rendered correctly and completely — confirmed via direct DOM inspection (`document.querySelectorAll('tr').length` returned the expected counts) and, for the Audit Trail, a partial-region screenshot succeeded immediately afterward and showed correct data (`06-audit-trail.png`).

Because the timeout hit both a data-heavy page (387 rows) and a near-empty one (2 rows), DOM size doesn't cleanly explain it — this reads more like intermittent flakiness in the browser-automation tooling itself than a real client-side rendering problem. **Not claiming this is an app bug.** It's noted here only because "does the UI stay responsive as row counts grow" is exactly the kind of question that matters at the scale target this report is written for (see 3c below), so it's worth someone re-checking with real load/profiling tools rather than manual screenshotting, rather than either dismissing it or overclaiming it as a confirmed defect.

### 2c. Audit Trail fetches everything, unpaginated, in one call

`GET /api/audit?limit=1000` returns up to 1000 rows in a single response, and the client renders every row into the DOM at once (confirmed: 387 `<tr>` elements for 387 audit entries, all present simultaneously, no virtualization or pagination). This works fine at today's data volume. It is a real, concrete instance of a pattern that shows up more than once in this app (see 3c) and is worth calling out with a specific number attached: 387 rows today, growing without bound as more divisions generate more activity, with a hard cap of 1000 that will eventually just silently truncate history rather than degrade gracefully.

### 2d. Nothing else new

Everything else checked this pass — Reference Data's 7 tabs, Admin Assets, Trip Detail's header/deadlines/route sections, Composer, the public Landing hero — rendered exactly as the 2026-08-26 report described, with no new defects spotted. The Reference-Data-vs-Admin-Assets duplication flagged in that report is still present and unchanged (both pages still separately manage Airports/Countries) — this is already scoped as its own future consolidation phase, not repeated here as a new finding.

---

## 3. UX/flow upgrade proposals — reasoned against "many more users, many divisions"

Each proposal states what changes, why it matters specifically at the stated scale target (not just "would be nice"), a rough effort/risk read, and what it explicitly does **not** require touching — this is meant to be an upgrade path, not a rebuild.

### 3a. Give a coordinator a signal when someone else already touched a shared trip

**What:** A small "Last updated by {user} at {time}" line at the top of Trip Detail, sourced from the trip's own most recent audit entry (data that already exists — `AuditEntry` already records who changed what and when for every mutation).

**Why it matters at scale:** Today, the only way to know if a colleague already acted on a trip you're both working is to open the Activity tab and read through the merged Comm/audit feed. That's a reasonable design for a handful of coordinators who mostly work their own trips. At "many divisions, thousands of users, shared trips," the odds of two people acting on the same trip within minutes of each other rise sharply, and there is currently zero passive signal — a coordinator has to think to go check. This isn't a request for real-time push notifications or WebSockets; it's surfacing data the app is already recording, one banner, at the point where it's most useful (the moment someone opens a trip to act on it).

**Effort/risk:** Small. One new read (most-recent audit entry for this trip, already queryable via the existing `GET /audit/:table/:recordId` pattern) and one banner component. No schema change, no new write path, no change to how audit entries are created.

**Does not require:** a notification system, WebSockets, email/push infrastructure, or any change to the Audit/Comm data model.

### 3b. Bulk actions on the New Enquiries queue

**What:** Checkbox-select multiple rows in the "New Enquiries" filtered view (`/admin/trips`) with a bulk "Assign to me" / "Mark reviewed" action, reusing the exact checkbox-plus-batch-action UI pattern this app already has in two other places: `TripDetail.tsx`'s service cards (checkbox + "REMOVE SELECTED") and the country-permit request groups (`PermitSubmissionGroups`, which already batches multiple legs under one submission).

**Why it matters at scale:** Today's New Enquiries filter is a genuine, working improvement over the old "spot it in the general list" flow — but it's still a one-at-a-time triage loop. At today's volume (the seed data shows 1 open enquiry) that's fine. At "many divisions" volume, a coordinator opening dozens of enquiries per shift one click at a time is exactly the kind of workflow that becomes the bottleneck once volume grows, even though nothing about the *individual* action is slow.

**Effort/risk:** Small-to-medium. The interaction pattern (checkbox state + selected-set + batch button) is copy-adjacent to code that already exists in this codebase, not a new pattern to invent. The actual "assign"/"mark reviewed" semantics need a small decision (does "reviewed" need a new boolean, or does changing `Status` away from `Planning` already cover it? — worth a quick look at what `Owner`/`Status` transitions already mean before building this).

**Does not require:** any change to how a trip is created or scored as an enquiry (`Owner === 'Web Enquiry' && Status === 'Planning'`, unchanged).

### 3c. Server-side pagination and search on the endpoints that currently return "everything"

**What:** `GET /trips`, `GET /persons` (no filter), and `GET /audit` all currently return their entire table (or, for audit, up to a fixed 1000-row cap) in one response, with all filtering/searching done client-side over the fully-fetched list. Add standard `?page=`/`?limit=` (or cursor-based) pagination plus server-side search params, defaulting to today's "return everything" behavior so nothing breaks immediately.

**Why it matters at scale:** This is the single most concrete "this specific pattern will not survive the stated scale target" finding in this report. Every one of these endpoints was clearly designed and is entirely reasonable for the current data volume (a handful of trips, a few hundred audit rows) — the client-side `useTextFilter`/array-filter pattern that Reference Data's recent search feature established is a genuinely good, simple choice *for small lists*, and was explicitly justified that way at the time. It stops being a good choice once "many divisions, thousands of users" means thousands of trips and tens of thousands of audit entries: every list page load becomes a full-table fetch, every keystroke in a search box re-filters an ever-growing in-memory array, and the audit trail's `limit=1000` cap means history beyond the most recent 1000 entries silently becomes unreachable through the UI at all.

**Effort/risk:** Medium — this is a real, if mechanical, backend + frontend change across a few endpoints, not a one-line fix. It's additive (new optional query params) rather than a breaking rewrite, so it can land incrementally, endpoint by endpoint, starting with whichever is closest to becoming a real problem (Audit, given its 1000-row hard cap, is the most urgent of the three).

**Does not require:** any change to the underlying data model, to how trips/persons/audit entries are created, or to the search *experience* from a user's point of view (the search box stays a search box — only what's behind it changes, from an in-memory filter to a query parameter).

### 3d. A default, division-scoped view of Trips — without adding tenancy

**What:** An optional, plain `division` (or `team`) tag on `Trip` (a simple string/lookup field, not a tenant-isolation boundary), plus a default "my division" filter on the Trips/Manage Trips list views, with an explicit toggle to see everything. `Admin`/`Coordinator`/`Viewer` role enforcement stays exactly as-is — this is a view-default and filter, not a permissions change.

**Why it matters at scale — and why this is a question, not a recommendation:** Today, RBAC is purely role-based with no scoping at all: any Coordinator can see and act on any trip in the system, which is a documented, deliberate design choice for the current single-team scale (confirmed in the 2026-08-26 security audit's M5 finding — flagged there as intentional, not an oversight). At "many internal divisions sharing one instance," it's genuinely unclear whether that flat visibility is still the right default: if divisions are meant to operate independently day-to-day, a Coordinator drowning in every other division's trips in their default list view is a real usability problem even if the underlying permission model (anyone *can* see anything) stays exactly as it is today. This proposal is deliberately scoped to *not* touch permissions — it only changes what shows up by default in a list — precisely because whether real per-division access restriction is wanted is a policy question for the organization, not something to assume while writing a UX report. If the answer turns out to be "no, shared visibility across divisions is exactly what we want," this whole proposal can be skipped with zero cost, since nothing else in this report depends on it.

**Effort/risk:** Small for the view-default version described here (one nullable column, one default filter). Would become Medium-to-Large if the follow-up decision is "no, we actually do want enforced per-division access control" — that's a real RBAC change and deserves its own design pass, not a bullet in this report.

**Does not require:** multi-tenancy, separate databases/schemas per division, or any change to the existing Admin/Coordinator/Viewer role model.

### 3e. Mobile/field use — already correctly scheduled, not a new gap

`Layout.tsx`'s sidebar already has a working responsive treatment (a hamburger toggle that slides the sidebar in/out below the `md` breakpoint) — this is a "shrink the desktop layout" responsive pattern, not a mobile-first one. The already-agreed Phase 6 of this project's roadmap (PWA manifest + bottom-nav mobile layout) is the correct, already-planned answer to "will this hold up for field use on a phone at scale" — nothing new to add here; this section exists only to confirm the gap was already correctly identified and scheduled, not missed.

### 3f. What's already good and shouldn't change

Worth stating explicitly, since this report is otherwise all proposals: the leg-scoped Crew & Pax manifest, the unified `generateEmail()`/template system shared between Composer and ComposeDrawer, the country-permit batch-submission grouping, and the New Enquiries filter are all patterns that already scale reasonably well in *design* (even where the specific implementation — like unpaginated fetches — will need the work described above). None of the proposals above ask for these to be redesigned; several of them (3a, 3b) explicitly reuse these exact patterns rather than inventing new ones.
