# VIQ Visual Walkthrough & UX Critique — 2026-08-26/27

Full logged-in tour of every major route as an Admin user (fresh locally-minted JWT, no password typed anywhere), running the production build (`npm run build` + `node dist/main.js`). 18 screenshots saved to:
`C:\Users\bminja\AppData\Local\Temp\claude\C--Backups-InsiderTechSol-Aviation-viq\0f941388-d549-492c-a6a0-851fefaf6230\scratchpad\preview\01-dashboard.jpg` through `18-audit-trail.jpg`.

---

## Landing / Public flow

**Screens:** `09-landing-hero.jpg`, `10-landing-charter-form.jpg`, `11-landing-permit-form.jpg`

**Good:**
- Hero page reads clean and on-brand — same teal accent, plane icon, and typography weight as the internal app's sidebar, so the rebrand from the earlier session lands well. Doesn't look bolted-on.
- "Same form, pre-selected mode" design works as intended: Charter path pre-fills Operation Type to Charter, Permit path leaves it open, headline changes per mode ("PLAN YOUR PRIVATE FLIGHT" vs "REQUEST PERMITS & GROUND HANDLING"), and "← BACK TO OPTIONS" correctly returns to the hero.
- No-registration-required framing is reinforced consistently (hero subhead + form subhead repeat it) — good for a first-time external visitor who might otherwise expect a signup wall.

**Weak / worth revisiting:**
- Both cards on the hero are visually identical in weight (same size, same icon treatment) even though "Charter/Private" is very likely the majority use case and "Permit only" a narrower one. There's no visual hierarchy nudging a first-time visitor toward the common path — a subtle default/recommended treatment on the Charter card would reduce decision friction.
- The `Combobox` (aircraft type selector) worked fine when driven by a real mouse click at its exact rendered position — the failure noted earlier in this session was almost certainly an imprecise click coordinate, not a genuine component defect. Not a bug to fix, but worth knowing it's not actually broken.

---

## Core ops pages

**Screens:** `01-dashboard.jpg`, `02-trips-list.jpg`, `05-trip-detail-overview.jpg`, `06-trip-detail-people.jpg`, `16-comms.jpg`, `17-composer.jpg`, `18-audit-trail.jpg`

**Good:**
- Composer is a standout — sparse, single-column, clearly labeled optional vs required fields. Best-organized page in the app.
- Leg-scoped Crew & Pax manifest (People tab on Trip Detail) renders exactly as designed: per-leg roster with a role-summary panel alongside it. This session's leg-scoping rework is confirmed working end-to-end in the live UI, not just via API.
- Audit Trail is genuinely useful — 379 field-level entries, searchable, shows before/after values with strike-through/highlight styling.

**Weak / broken / inconsistent:**
1. **The sidebar "3 urgent" badge on Action Board directly contradicts the page it's next to.** The Action Board's own "URGENT" stat card shows 42 (and 43 minutes later on the Admin Dashboard) — a live, correct count — while the sidebar badge is a hardcoded stub (`UrgencyBadge` in `Layout.tsx`) that always reads "3 urgent" regardless of real data. This is visible on literally every authenticated page since it's in the persistent sidebar, and it's the single most jarring inconsistency in the whole app: a real coordinator would notice within seconds that "3 urgent" never changes and never matches the real count. **Still unfixed from when it was flagged earlier this session — recommend wiring it to the same `Urgent` count already computed for the dashboard stat card, the same way the new `NavCountBadge`/`enquiryCount` pattern was just built for Manage Trips.**
2. **Raw internal record IDs are shown directly to users** in multiple places — e.g. Trip Detail's "Open Deadlines" cards show strings like `LEG-0001-1-GROUNDHANDLING-ARR-AE` and `2608001-L03-PERMIT-ARR-KE`, and the Admin Dashboard's "Urgent & Breached Services" list shows `LEG-0004-1-FLIGHTPLANNING-ET-1787670722795` (an epoch-timestamp-suffixed generated ID). These are clearly internal correlation keys leaking into a human-facing list. Recommend replacing with a human label ("Ground Handling — UAE", "Overflight — Ethiopia") and moving the raw ID to a tooltip or a monospace secondary line if it needs to stay visible for support purposes.
3. **Manage Trips' default filter produces an empty, unexplained state.** Landing on `/admin/trips` by default shows "Showing next 72hrs — type to search all" with "No trips match" — even though there are 9 real trips in the system, none happen to depart in the next 72 hours from "now." A first-time admin would reasonably read this as broken, not filtered. Recommend either a visible "0 of 9 trips match — showing next 72h only" phrasing, or defaulting to "all trips" with the 72h view as an opt-in filter chip instead of the default.
4. **Comms log is dominated by "Failed" sends** (7 of the 10 visible messages), including one to `test@example.com`. This is expected in a dev environment with no real SMTP relay configured, not a code bug — but if this screen is ever shown to a real client-facing user, a wall of red "Failed" badges reads as the system being broken. Worth a passing thought before go-live, not an action item now.
5. **Leftover test/QA data is live throughout the seeded dataset**, not just cosmetically but including a full second Admin account:
   - Trips list shows `TASK11 WIZARD QA CLIENT`, `TASK11 QA TEST CLIENT`, `TASK8 QUOTE FINAL`, `TEST QA CLIENT LTD` as real trip rows with owners `TASK11 QA TESTER` / `QA TESTER`.
   - Trip 2608001's Mission Type field literally reads `Task7 Mission Verify` — a stray dev-testing string sitting in a real form field.
   - **Users page lists a second, live Admin-role account named `sdd_test_admin`** (created 2026-08-26, Active), plus `test_viewer_123` (Deactivated Coordinator) — see Admin section below, this is a security-relevant finding, not just cosmetic.
   - Audit Trail shows change entries attributed to users `sdd-cleanup`, `sdd-test`, and `test` — confirming this is genuine leftover automation/test activity baked into the working dataset, not display artifacts.
   
   None of this is a code defect — it's dev-environment data hygiene — but if this database is ever the one that goes live (rather than being reseeded), every item above needs cleanup before a real client or real coordinator sees it.

---

## Reference Data

**Screens:** `07-reference-airports.jpg`, `08-reference-country-rules.jpg`

**Good:**
- This session's Search/Filter/Excel feature holds up well live: search box, Download, Upload sit compactly to the right of each tab's title without crowding the table, and are consistent across tabs (verified Airports and Country Rules directly; both match the spec's template).
- Country Rules' new full CRUD (Add Rule / Edit / Delete per row) reads clearly — Working Days shown as a colored Yes/No pill is a nice touch that's easy to scan down a column.

**Weak / worth revisiting:**
- There are now **two separate places an admin can manage Airports and Countries**: the Reference Data page (`/reference` — Airports, Countries tabs) and the Admin Assets page (`/admin/assets` — also has Airports and Countries tabs, alongside Aircraft/Vendors/Persons/Expiry/Operators/Fees). Nothing in either page's copy indicates which is canonical or how they relate (do edits in one show up in the other?). This predates this session's work but is worth surfacing since Reference Data just grew significant new capability (search, Excel, Country Rules) that Assets' Airports/Countries tabs don't have — an admin could reasonably use the wrong one and wonder why Excel export isn't there.

---

## Admin

**Screens:** `03-admin-trips-default.jpg`, `04-admin-trips-new-enquiries.jpg`, `12-admin-dashboard.jpg`, `13-admin-assets.jpg`, `14-admin-billing.jpg`, `15-admin-users.jpg`

**Good:**
- The New Enquiries filter chip built this session works correctly and clearly: clicking it swaps the subheading to "Showing unreviewed web enquiries only" and the sidebar's live badge count (2) matches exactly what's shown. This is a clean, verified feature.
- Billing's empty state ("No invoices yet" + a prominent "Generate Invoice" button) is a good example of a non-dead-end empty state — it tells you what's missing and gives you the one action that fixes it. Worth using as the template if other empty states (e.g. Manage Trips' "No trips match," above) get revisited.

**Weak / broken / inconsistent:**
- **Security-relevant, not just cosmetic:** the Users page shows a live, Active, Admin-role account named `sdd_test_admin` alongside a Deactivated `test_viewer_123` account. A full-privilege test account left active in a shared/persistent database is a real access-control loose end — whatever password it holds should be assumed known/weak and either the account should be deactivated or its password rotated before this stops being a pure local dev instance. Flagged in the parallel security review too.
- Same `UrgencyBadge`/real-count mismatch from the Core Ops section repeats here since it's sidebar-wide, but the Admin Dashboard makes it worse by putting the *correct* number (43) directly above the *wrong* number (3) is visually adjacent whenever the sidebar is in view — the contradiction is unavoidable to notice on this specific page.

---

## Top 5 — if you fix nothing else, fix these

1. **Wire `UrgencyBadge` to real data (or remove it).** It's a hardcoded "3 urgent" stub sitting in the persistent sidebar, contradicting the real Urgent count shown on both Action Board and Admin Dashboard on every single page load. Highest-visibility inconsistency in the app; also the cheapest fix — the real count is already computed for the dashboard stat card.
2. **Deactivate or rotate `sdd_test_admin`.** A live, Active, full-Admin test account in the Users list is a real access-control gap, however low the current stakes — clean it up before this data set is anything but a disposable local dev DB.
3. **Stop surfacing raw internal IDs** (`LEG-0004-1-FLIGHTPLANNING-ET-1787670722795` etc.) in user-facing lists on Trip Detail and the Admin Dashboard's breach list — replace with a human label, keep the ID as a tooltip/secondary line if needed.
4. **Fix Manage Trips' misleading empty default state** — "No trips match" on first load (because of the invisible 72h filter) reads as broken to a new admin even though the system has real data.
5. **Purge leftover QA/test trips and field values** (`TASK11 WIZARD QA CLIENT`, `Task7 Mission Verify`, etc.) from whichever dataset ends up being the one real users see — not a code fix, a data cleanup pass before go-live.
