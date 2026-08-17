# Trip Platform Frontend (HTML Page-Flow + Seed Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the page flow for the ad-hoc trip management platform — Action Board, Trips, Trip Sheet (Itinerary/Roster/Services/Comms/History), trip-creation wizard, and Reference Data — as plain HTML pages + vanilla JS (ES modules), running entirely against hardcoded/seeded mock data, no backend, no build step.

**Architecture:** One static HTML file per page/route (`index.html`, `trips.html`, `trip-sheet.html?id=...`, `trip-new.html`, four `reference-*.html`), each loading a small `<script type="module">` from `js/pages/`. All domain logic with real behavior (urgency/lead-time math, schedule-change re-confirm invalidation, scope-type filtering, stop derivation/rebuild diffing, email template generation) lives in framework-free plain-JS modules under `js/lib/`, unit-tested directly with Vitest (`node` environment, no DOM). A single in-memory `store` (`js/lib/store.js`) holds all seeded state and exposes mutation methods plus a `subscribe`/`notify` mechanism; every page module calls `store.subscribe(render)` and re-renders its own DOM on any change. No persistence beyond the browser session — intentional for this phase. This is a deliberate intermediate step: the `js/lib/` logic layer is written framework-free specifically so a later Next.js conversion can reuse it unchanged, converting only the page layer.

**Tech Stack:** Plain HTML5, vanilla JavaScript (ES modules, no bundler, no framework), plain CSS. Vitest (`node` environment) for the `js/lib/` logic layer only — no DOM testing library, no jsdom, per explicit scope decision (page-level behavior is verified manually per the Post-plan verification checklist, not automated).

**Spec:** `docs/superpowers/specs/2026-08-15-adhoc-trip-platform-design.md`

## Global Constraints

- No backend calls anywhere in this phase — SMTP/IMAP, real persistence, and RBAC are explicitly out of scope (per spec's "Explicitly out of scope for this phase").
- Single flat role — no auth, no permission checks anywhere in the UI.
- All timestamps are ISO 8601 UTC strings (suffix `Z`), matching the spec's "All times UTC with a Z suffix" convention.
- `Services.scopeType` is one of `LEG | STOP | SEGMENT` only (no `TRIP`).
- One `services` array/shape serves every service type — no per-service-type variants in code.
- Reference data is seeded with real data for the operator's East Africa / Middle East corridor.
- Urgency thresholds (an implementation decision this plan makes explicit, since the spec left exact numeric boundaries unspecified): `BREACH` = past `RequiredByZ`, `URGENT` = due within 24h, `DUE` = due within 72h, `OK` = beyond 72h.
- **Store re-render ordering convention** (every page module must follow this — it is the single most important implementation detail in this plan): every `store.*` mutator method calls `notify()` synchronously before returning, which re-runs every subscribed page's `render()` immediately, replacing that page's DOM. Two consequences, both used throughout this plan:
  1. **Local UI-only state that does NOT depend on the mutator's return value** (e.g. "is this drawer open," "which service is the composer open for") must be updated *before* calling the store mutator, so the synchronous re-render already reflects the new UI state.
  2. **Local UI-only state that DOES depend on the mutator's return value** (e.g. a stop-rebuild summary) must be cached in a module-level variable *after* the call returns, and the render function must read that cached variable on every render — never write into DOM nodes captured before the call, since they've already been replaced by the synchronous re-render.
- `js/lib/` modules must have zero DOM dependency (no `document`, no `window`) so they run under Vitest's `node` environment unmodified.
- All page modules interpolating any string that could contain user-entered or seeded text into `innerHTML` must pass it through `escapeHtml()` (Task 8) first.
- Every logic-layer task's tests must actually run and pass before its commit step. Page/DOM tasks have no automated test step (per explicit scope decision) — they're implemented directly and verified via the Post-plan verification checklist.
- **Display/input conventions** (per the spec's "Display and input conventions"): every displayed timestamp goes through `formatDateTimeZ`/`formatDateOnlyZ` (Task 8), never a raw ISO string; every displayed country goes through `countryNameFor` (Task 8), never a raw ISO2 code; every free-text input a person types (trip/person/provider names, reference numbers, document/billing descriptions) is upper-cased at the point it's captured (`e.target.value.toUpperCase()`), matching the real telex convention already used for Composer bodies; aircraft registrations never contain a dash; trip codes are numeric-only, format `YYMMNNN`.

---

## File Structure

```
actuator/frontend/
  package.json                          — vitest only
  vitest.config.js
  index.html                            — Action Board (default route)
  trips.html                            — Trips list
  trip-new.html                         — Trip creation wizard
  trip-sheet.html                       — Trip Sheet (reads ?id=<tripId>)
  reference-airports.html
  reference-aircraft.html
  reference-providers.html
  reference-country-rules.html
  reference-person-roles.html
  css/
    styles.css
  js/
    lib/
      core-logic.js                     — RequiredByZ / Urgency / re-confirm math (Task 2)
      format.js                         — date/time/country display conventions (Task 8)
      scope.js                          — service-type -> scope-type filtering (Task 5)
      stops.js                          — stop derivation + rebuild diffing (Task 6)
      templates.js                      — Composer email draft generation, REQUEST/REVISION/CANCEL modes (Task 13)
      trips-filter.js                   — Trips-list search/status filter (Task 10)
      store.js                          — in-memory state + mutation actions (Task 7)
      mock-data/
        airports.js, countries.js, countryRules.js, aircraft.js, providers.js, personRoles.js   (Task 3)
        trips.js                        — seeded trips/legs/stops/services/comms/audit (Task 4)
        persons.js                      — seeded trip roster (Task 4)
        documents.js                    — seeded trip documents (Task 18)
        billing.js                      — seeded trip billing line items (Task 19)
    pages/
      nav.js                            — shared nav bar (Task 8)
      ui-helpers.js                     — escapeHtml, urgencyBadgeHtml (Task 8)
      action-board.js                   (Task 9)
      trips-list.js                     (Task 10)
      trip-sheet.js                     — shell: header, deadline rail, all 8 tabs defined upfront, routes to per-tab renderers (Task 11)
      trip-sheet-route.js               — was "Itinerary" (Task 11)
      trip-sheet-crew-pax.js            — was "Roster" (Task 12)
      trip-sheet-service-group.js       — shared by the Permits and Services tabs, parameterized by which ServiceTypes to show (Task 13)
      trip-sheet-messages.js            — was "Comms" (Task 14)
      trip-sheet-history.js             (Task 15)
      trip-wizard.js                    (Task 16)
      reference.js                      — generic renderer reused by all 5 reference pages (Task 17)
      trip-sheet-documents.js           (Task 18)
      trip-sheet-billing.js             (Task 19)
```

---

### Task 1: Project scaffold + Vitest tooling

**Files:**
- Create: `actuator/frontend/package.json`, `actuator/frontend/vitest.config.js`
- Create: `actuator/frontend/css/styles.css`
- Create: `actuator/frontend/index.html` (placeholder)

**Interfaces:**
- Produces: a working `npm test` command running Vitest in `node` environment against `actuator/frontend/js/**/*.test.js`. No exported code — this is pure scaffolding, folded into one task per the "fold setup into the task whose deliverable needs it" rule, since there's no testable logic yet.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "trip-platform-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['js/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Install dependencies**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator/frontend"
npm install
```

- [ ] **Step 4: Create the base stylesheet**

`actuator/frontend/css/styles.css`:

```css
body { font-family: system-ui, sans-serif; margin: 0; color: #0f172a; background: #fff; }
.app-nav { display: flex; gap: 1.5rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid #e2e8f0; font-weight: 500; }
.app-nav a { color: #0f172a; text-decoration: none; }
.page { padding: 1.5rem; max-width: 900px; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem; }
th, td { padding: 0.4rem 0.5rem; border-bottom: 1px solid #e2e8f0; }
.badge { border-radius: 4px; padding: 0.1rem 0.5rem; font-size: 0.75rem; }
.badge-ok { background: #d1fae5; color: #065f46; }
.badge-due { background: #fef3c7; color: #92400e; }
.badge-urgent { background: #ffedd5; color: #9a3412; }
.badge-breach { background: #fee2e2; color: #991b1b; }
.banner-warning { background: #ffedd5; color: #9a3412; padding: 0.5rem 0.75rem; border-radius: 4px; }
.btn { border-radius: 4px; padding: 0.35rem 0.75rem; font-size: 0.875rem; border: 1px solid #cbd5e1; background: white; cursor: pointer; }
.btn-primary { background: #0f172a; color: white; border-color: #0f172a; }
.drawer { border: 1px solid #cbd5e1; border-radius: 6px; padding: 1rem; margin-top: 1rem; background: #f8fafc; }
label { display: block; font-size: 0.75rem; font-weight: 500; margin-bottom: 0.2rem; }
.field { margin-bottom: 0.75rem; }
input, select, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0.3rem 0.5rem; font: inherit; box-sizing: border-box; }
.tab-btn { border: none; background: none; padding: 0 0 0.5rem 0; margin-right: 1.5rem; font-size: 0.875rem; color: #64748b; border-bottom: 2px solid transparent; cursor: pointer; }
.tab-btn-active { color: #0f172a; font-weight: 500; border-bottom-color: #0f172a; }
```

- [ ] **Step 5: Create the placeholder `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trip Platform — Action Board</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1>Trip Platform — scaffold placeholder</h1>
  </main>
</body>
</html>
```

- [ ] **Step 6: Verify the test harness runs**

Run: `npx vitest --version` (from `actuator/frontend`)
Expected: prints a version number with no errors.

- [ ] **Step 7: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/package.json frontend/vitest.config.js frontend/css/styles.css frontend/index.html
git commit -m "Scaffold static HTML frontend with Vitest tooling for the logic layer"
```

---

### Task 2: Core domain logic — urgency, lead-time, re-confirm math

**Files:**
- Create: `actuator/frontend/js/lib/core-logic.js`
- Test: `actuator/frontend/js/lib/core-logic.test.js`

**Interfaces:**
- Produces: `computeRequiredByZ(basedOnEtdZ, rule)`, `computeUrgency(requiredByZ, nowZ)`, `needsReconfirm(basedOnEtdZ, currentEtdZ, toleranceHours)`. `rule` is `{ leadTimeHours: number, workingDaysOnly: boolean }` (a country-rule object — see Task 3's shape). Consumed by `store.js` (Task 7), `action-board.js` (Task 9), `trip-sheet-service-group.js` (Task 13).

Domain shapes used across this plan (documented once here, not re-declared per file — plain JS, no compile-time enforcement, but every mock-data and store file below conforms to these):

```
Airport      { icao, iata, name, country, iso2, tz }
Country      { name, iso2, region, overflightPermitRequired, landingPermitRequired, aocDocsRequired, defaultEscalationContact }
CountryRule  { id, countryIso2, serviceType, leadTimeHours, workingDaysOnly, toleranceHours, docsRequired: string[], escalationContact, notes? }
Aircraft     { registration, icaoType, manufacturer, series, mtowKg, noiseCert }
Provider     { id, name, serviceType, scopeIso2?, scopeIcao?, email, aogContact, workingHoursZ }
PersonRole   { id, label }
Trip         { id, tripCode, clientOperator, registration, ownerName, status, notifyRecipients: string[], createdAtZ }
Person       { id, tripId, name, roleId, notes?, removed? }   // trip-level roster, not per-leg; `removed` is a
             // soft-delete flag — kept (not spliced out) so a removed person's audit trail
             // stays reachable from the trip's History tab via recordId.
Leg          { id, tripId, sequence, callSign, depIcao, arrIcao, etdZ, etaZ, overflightCountries: string[], revision }
             // etdZ is always a known ISO string; etaZ is `string | null` — null means "TBD" (a real, common state
             // for a return leg whose arrival time isn't known yet). No pax/crew fields — see Person/roster instead.
Stop         { id, tripId, icao, arrZ, depZ, groundTimeHours, purpose }   // purpose: 'TURNAROUND' | 'TECH_STOP' | 'NIGHT_STOP'
             // arrZ/groundTimeHours are null when the feeding leg's etaZ is null — the stop still exists, its time just isn't known yet.
Service      { id, tripId, scopeType, scopeId, serviceType, providerId, status, refNumber, basedOnEtdZ, assignedTo }
             // scopeType: 'LEG' | 'STOP' | 'SEGMENT'; scopeId for SEGMENT is "<legId>:<countryIso2>"
             // status: 'NOT_REQUIRED' | 'NOT_STARTED' | 'REQUESTED' | 'CHASING' | 'CONFIRMED' | 'RECONFIRM_REQUIRED' | 'CANCELLED'
Comm         { id, tripId, serviceId, direction, kind, token, from, to: string[], subject, body, timestampZ }
             // direction: 'IN' | 'OUT'; kind: 'REQUEST' | 'NOTIFICATION' | 'CANCEL'
AuditEntry   { id, timestampZ, user, table, recordId, field, oldValue, newValue }
```

- [ ] **Step 1: Write the failing tests**

`actuator/frontend/js/lib/core-logic.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computeRequiredByZ, computeUrgency, needsReconfirm } from './core-logic.js';

const rule24h = { id: 'r1', countryIso2: 'KE', serviceType: 'HANDLING', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, docsRequired: [], escalationContact: 'ops@example.com' };

describe('computeRequiredByZ', () => {
  it('subtracts lead time directly when workingDaysOnly is false', () => {
    expect(computeRequiredByZ('2026-08-20T12:00:00.000Z', rule24h)).toBe('2026-08-19T12:00:00.000Z');
  });

  it('skips weekends when workingDaysOnly is true', () => {
    const rule48hWorkingDays = { ...rule24h, leadTimeHours: 48, workingDaysOnly: true };
    // ETD Monday 2026-08-24T10:00Z; walking back 48 working hours skips all of Sat 22 / Sun 23
    // (0 working hours consumed there), then counts every hour of Fri 21 (24) and Thu 20 (24) =
    // 48, landing exactly on Thu 2026-08-20T10:00Z.
    expect(computeRequiredByZ('2026-08-24T10:00:00.000Z', rule48hWorkingDays)).toBe('2026-08-20T10:00:00.000Z');
  });
});

describe('computeUrgency', () => {
  it('returns BREACH when RequiredByZ is in the past', () => {
    expect(computeUrgency('2026-08-10T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('BREACH');
  });
  it('returns URGENT when due within 24 hours', () => {
    expect(computeUrgency('2026-08-15T20:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('URGENT');
  });
  it('returns DUE when due within 72 hours but beyond 24', () => {
    expect(computeUrgency('2026-08-17T12:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('DUE');
  });
  it('returns OK when beyond 72 hours out', () => {
    expect(computeUrgency('2026-08-25T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('OK');
  });
});

describe('needsReconfirm', () => {
  it('is false when the ETD shift is within tolerance', () => {
    expect(needsReconfirm('2026-08-20T12:00:00.000Z', '2026-08-20T13:00:00.000Z', 2)).toBe(false);
  });
  it('is true when the ETD shift exceeds tolerance', () => {
    expect(needsReconfirm('2026-08-20T12:00:00.000Z', '2026-08-20T15:30:00.000Z', 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- core-logic` (from `actuator/frontend`)
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `core-logic.js`**

```js
export function computeRequiredByZ(basedOnEtdZ, rule) {
  const etd = new Date(basedOnEtdZ);
  if (!rule.workingDaysOnly) {
    return new Date(etd.getTime() - rule.leadTimeHours * 3_600_000).toISOString();
  }
  let remainingHours = rule.leadTimeHours;
  let cursor = new Date(etd);
  while (remainingHours > 0) {
    cursor = new Date(cursor.getTime() - 3_600_000);
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      remainingHours -= 1;
    }
  }
  return cursor.toISOString();
}

const URGENT_THRESHOLD_HOURS = 24;
const DUE_THRESHOLD_HOURS = 72;

export function computeUrgency(requiredByZ, nowZ) {
  const hoursRemaining = (new Date(requiredByZ).getTime() - new Date(nowZ).getTime()) / 3_600_000;
  if (hoursRemaining < 0) return 'BREACH';
  if (hoursRemaining <= URGENT_THRESHOLD_HOURS) return 'URGENT';
  if (hoursRemaining <= DUE_THRESHOLD_HOURS) return 'DUE';
  return 'OK';
}

export function needsReconfirm(basedOnEtdZ, currentEtdZ, toleranceHours) {
  const diffHours = Math.abs(new Date(currentEtdZ).getTime() - new Date(basedOnEtdZ).getTime()) / 3_600_000;
  return diffHours > toleranceHours;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- core-logic`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/core-logic.js frontend/js/lib/core-logic.test.js
git commit -m "Add urgency/lead-time/re-confirm pure logic"
```

---

### Task 3: Reference mock data

**Files:**
- Create: `actuator/frontend/js/lib/mock-data/airports.js`, `countries.js`, `countryRules.js`, `aircraft.js`, `providers.js`, `personRoles.js`
- Test: `actuator/frontend/js/lib/mock-data/reference.test.js`

**Interfaces:**
- Produces: `export const airports = [...]`, `export const countries = [...]`, `export const countryRules = [...]`, `export const aircraft = [...]`, `export const providers = [...]`, `export const personRoles = [...]` — shapes per Task 2's domain-shapes block (`personRoles` is `PersonRole[]`). Consumed by `store.js` (Task 7).

- [ ] **Step 1: Write the failing integrity tests**

`actuator/frontend/js/lib/mock-data/reference.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { airports } from './airports.js';
import { countries } from './countries.js';
import { countryRules } from './countryRules.js';
import { aircraft } from './aircraft.js';
import { providers } from './providers.js';
import { personRoles } from './personRoles.js';

describe('reference data integrity', () => {
  const countryIso2s = new Set(countries.map((c) => c.iso2));

  it('every airport references a country present in countries[]', () => {
    for (const a of airports) expect(countryIso2s.has(a.iso2)).toBe(true);
  });

  it('every countryRule references a country present in countries[]', () => {
    for (const r of countryRules) expect(countryIso2s.has(r.countryIso2)).toBe(true);
  });

  it('every provider scope (icao or iso2) resolves against real reference data', () => {
    const icaos = new Set(airports.map((a) => a.icao));
    for (const p of providers) {
      if (p.scopeIcao) expect(icaos.has(p.scopeIcao)).toBe(true);
      if (p.scopeIso2) expect(countryIso2s.has(p.scopeIso2)).toBe(true);
    }
  });

  it('has at least 10 airports across at least 3 countries', () => {
    expect(airports.length).toBeGreaterThanOrEqual(10);
    expect(new Set(airports.map((a) => a.iso2)).size).toBeGreaterThanOrEqual(3);
  });

  it('has at least one aircraft and at least one provider per service type used in country rules', () => {
    expect(aircraft.length).toBeGreaterThan(0);
    const ruleServiceTypes = new Set(countryRules.map((r) => r.serviceType));
    const providerServiceTypes = new Set(providers.map((p) => p.serviceType));
    for (const st of ruleServiceTypes) expect(providerServiceTypes.has(st)).toBe(true);
  });

  it('has at least 8 person roles including PIC, Pax, and VIP', () => {
    expect(personRoles.length).toBeGreaterThanOrEqual(8);
    const labels = new Set(personRoles.map((r) => r.label));
    for (const required of ['PIC', 'Pax', 'VIP']) expect(labels.has(required)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- reference` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `countries.js`**

```js
export const countries = [
  { name: 'Tanzania', iso2: 'TZ', region: 'East Africa', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: true, defaultEscalationContact: 'ops.tz@example.com' },
  { name: 'Kenya', iso2: 'KE', region: 'East Africa', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: true, defaultEscalationContact: 'ops.ke@example.com' },
  { name: 'Uganda', iso2: 'UG', region: 'East Africa', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: false, defaultEscalationContact: 'ops.ug@example.com' },
  { name: 'Ethiopia', iso2: 'ET', region: 'East Africa', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: true, defaultEscalationContact: 'ops.et@example.com' },
  { name: 'Egypt', iso2: 'EG', region: 'North Africa', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: true, defaultEscalationContact: 'ops.eg@example.com' },
  { name: 'South Africa', iso2: 'ZA', region: 'Southern Africa', overflightPermitRequired: false, landingPermitRequired: true, aocDocsRequired: false, defaultEscalationContact: 'ops.za@example.com' },
  { name: 'United Arab Emirates', iso2: 'AE', region: 'Middle East', overflightPermitRequired: false, landingPermitRequired: true, aocDocsRequired: false, defaultEscalationContact: 'ops.ae@example.com' },
  { name: 'Saudi Arabia', iso2: 'SA', region: 'Middle East', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: true, defaultEscalationContact: 'ops.sa@example.com' },
];
```

- [ ] **Step 4: Implement `airports.js`**

```js
export const airports = [
  { icao: 'HTDA', iata: 'DAR', name: 'Julius Nyerere Intl', country: 'Tanzania', iso2: 'TZ', tz: 'Africa/Dar_es_Salaam' },
  { icao: 'HTZA', iata: 'ZNZ', name: 'Abeid Amani Karume Intl', country: 'Tanzania', iso2: 'TZ', tz: 'Africa/Dar_es_Salaam' },
  { icao: 'HKJK', iata: 'NBO', name: 'Jomo Kenyatta Intl', country: 'Kenya', iso2: 'KE', tz: 'Africa/Nairobi' },
  { icao: 'HKMO', iata: 'MBA', name: 'Moi Intl', country: 'Kenya', iso2: 'KE', tz: 'Africa/Nairobi' },
  { icao: 'HUEN', iata: 'EBB', name: 'Entebbe Intl', country: 'Uganda', iso2: 'UG', tz: 'Africa/Kampala' },
  { icao: 'HAAB', iata: 'ADD', name: 'Bole Intl', country: 'Ethiopia', iso2: 'ET', tz: 'Africa/Addis_Ababa' },
  { icao: 'HECA', iata: 'CAI', name: 'Cairo Intl', country: 'Egypt', iso2: 'EG', tz: 'Africa/Cairo' },
  { icao: 'FAOR', iata: 'JNB', name: 'O.R. Tambo Intl', country: 'South Africa', iso2: 'ZA', tz: 'Africa/Johannesburg' },
  { icao: 'FACT', iata: 'CPT', name: 'Cape Town Intl', country: 'South Africa', iso2: 'ZA', tz: 'Africa/Johannesburg' },
  { icao: 'OMDB', iata: 'DXB', name: 'Dubai Intl', country: 'United Arab Emirates', iso2: 'AE', tz: 'Asia/Dubai' },
  { icao: 'OMAA', iata: 'AUH', name: 'Abu Dhabi Intl', country: 'United Arab Emirates', iso2: 'AE', tz: 'Asia/Dubai' },
  { icao: 'OEJN', iata: 'JED', name: 'King Abdulaziz Intl', country: 'Saudi Arabia', iso2: 'SA', tz: 'Asia/Riyadh' },
];
```

- [ ] **Step 5: Implement `countryRules.js`**

```js
export const countryRules = [
  { id: 'CR-TZ-LAND', countryIso2: 'TZ', serviceType: 'LANDING_PERMIT', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, docsRequired: ['AOC', 'Insurance'], escalationContact: 'ops.tz@example.com' },
  { id: 'CR-TZ-OVERFLIGHT', countryIso2: 'TZ', serviceType: 'OVERFLIGHT_PERMIT', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 4, docsRequired: ['AOC'], escalationContact: 'ops.tz@example.com' },
  { id: 'CR-KE-HANDLING', countryIso2: 'KE', serviceType: 'HANDLING', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, docsRequired: ['GenDec'], escalationContact: 'ops.ke@example.com' },
  { id: 'CR-KE-FUEL', countryIso2: 'KE', serviceType: 'FUEL', leadTimeHours: 12, workingDaysOnly: false, toleranceHours: 2, docsRequired: [], escalationContact: 'ops.ke@example.com' },
  { id: 'CR-ET-OVERFLIGHT', countryIso2: 'ET', serviceType: 'OVERFLIGHT_PERMIT', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 6, docsRequired: ['AOC', 'Insurance'], escalationContact: 'ops.et@example.com' },
  { id: 'CR-EG-OVERFLIGHT', countryIso2: 'EG', serviceType: 'OVERFLIGHT_PERMIT', leadTimeHours: 96, workingDaysOnly: true, toleranceHours: 6, docsRequired: ['AOC', 'Insurance', 'Crew List'], escalationContact: 'ops.eg@example.com' },
  { id: 'CR-EG-LAND', countryIso2: 'EG', serviceType: 'LANDING_PERMIT', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, docsRequired: ['AOC', 'Insurance'], escalationContact: 'ops.eg@example.com' },
  { id: 'CR-ZA-HANDLING', countryIso2: 'ZA', serviceType: 'HANDLING', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, docsRequired: [], escalationContact: 'ops.za@example.com' },
  { id: 'CR-AE-FUEL', countryIso2: 'AE', serviceType: 'FUEL', leadTimeHours: 12, workingDaysOnly: false, toleranceHours: 1, docsRequired: [], escalationContact: 'ops.ae@example.com' },
  { id: 'CR-AE-CATERING', countryIso2: 'AE', serviceType: 'CATERING', leadTimeHours: 18, workingDaysOnly: false, toleranceHours: 3, docsRequired: [], escalationContact: 'ops.ae@example.com' },
  { id: 'CR-SA-LAND', countryIso2: 'SA', serviceType: 'LANDING_PERMIT', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 2, docsRequired: ['AOC', 'Insurance', 'Overflight Clearance'], escalationContact: 'ops.sa@example.com' },
  { id: 'CR-SA-OVERFLIGHT', countryIso2: 'SA', serviceType: 'OVERFLIGHT_PERMIT', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 2, docsRequired: ['AOC'], escalationContact: 'ops.sa@example.com' },
  { id: 'CR-UG-CUSTOMS', countryIso2: 'UG', serviceType: 'CUSTOMS', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 4, docsRequired: ['GenDec', 'Cargo Manifest'], escalationContact: 'ops.ug@example.com' },
  { id: 'CR-KE-CREW', countryIso2: 'KE', serviceType: 'CREW_TRANSPORT', leadTimeHours: 6, workingDaysOnly: false, toleranceHours: 2, docsRequired: [], escalationContact: 'ops.ke@example.com' },
];
```

- [ ] **Step 6: Implement `aircraft.js`**

```js
export const aircraft = [
  { registration: '5HABC', icaoType: 'GLF6', manufacturer: 'Gulfstream', series: 'G650', mtowKg: 45178, noiseCert: 'Chapter 4' },
  { registration: '5YXYZ', icaoType: 'C56X', manufacturer: 'Cessna', series: 'Citation Excel', mtowKg: 9163, noiseCert: 'Chapter 4' },
  { registration: 'A6DEF', icaoType: 'GLEX', manufacturer: 'Bombardier', series: 'Global 6000', mtowKg: 45132, noiseCert: 'Chapter 4' },
];
```

- [ ] **Step 7: Implement `providers.js`**

```js
export const providers = [
  { id: 'PRV-TZ-HANDLE', name: 'Dar Ground Services', serviceType: 'HANDLING', scopeIcao: 'HTDA', email: 'ops@dargroundservices.example', aogContact: '+255700000001', workingHoursZ: '04:00-18:00' },
  { id: 'PRV-KE-HANDLE', name: 'Nairobi Executive Handling', serviceType: 'HANDLING', scopeIcao: 'HKJK', email: 'ops@nbohandling.example', aogContact: '+254700000002', workingHoursZ: '00:00-23:59' },
  { id: 'PRV-KE-FUEL', name: 'EA Fuel Services', serviceType: 'FUEL', scopeIcao: 'HKJK', email: 'fuel@eafuel.example', aogContact: '+254700000003', workingHoursZ: '05:00-20:00' },
  { id: 'PRV-ET-PERMIT', name: 'Addis Permit Bureau', serviceType: 'OVERFLIGHT_PERMIT', scopeIso2: 'ET', email: 'permits@addispermits.example', aogContact: '+251700000004', workingHoursZ: '06:00-15:00' },
  { id: 'PRV-EG-PERMIT', name: 'Cairo Overflight Desk', serviceType: 'OVERFLIGHT_PERMIT', scopeIso2: 'EG', email: 'permits@cairodesk.example', aogContact: '+201000000005', workingHoursZ: '08:00-16:00' },
  { id: 'PRV-EG-LAND', name: 'Cairo Landing Permits', serviceType: 'LANDING_PERMIT', scopeIcao: 'HECA', email: 'landing@cairodesk.example', aogContact: '+201000000006', workingHoursZ: '08:00-16:00' },
  { id: 'PRV-ZA-HANDLE', name: 'Johannesburg Jet Centre', serviceType: 'HANDLING', scopeIcao: 'FAOR', email: 'ops@jhbjetcentre.example', aogContact: '+27700000007', workingHoursZ: '00:00-23:59' },
  { id: 'PRV-AE-FUEL', name: 'Dubai Into-Plane', serviceType: 'FUEL', scopeIcao: 'OMDB', email: 'fuel@dxbintoplane.example', aogContact: '+971500000008', workingHoursZ: '00:00-23:59' },
  { id: 'PRV-AE-CATER', name: 'Emirates Flight Catering', serviceType: 'CATERING', scopeIcao: 'OMDB', email: 'orders@efc.example', aogContact: '+971500000009', workingHoursZ: '00:00-23:59' },
  { id: 'PRV-SA-LAND', name: 'GACA Landing Desk', serviceType: 'LANDING_PERMIT', scopeIso2: 'SA', email: 'landing@gaca.example', aogContact: '+966500000010', workingHoursZ: '07:00-15:00' },
  { id: 'PRV-SA-OVERFLIGHT', name: 'GACA Overflight Desk', serviceType: 'OVERFLIGHT_PERMIT', scopeIso2: 'SA', email: 'overflight@gaca.example', aogContact: '+966500000011', workingHoursZ: '07:00-15:00' },
  { id: 'PRV-TZ-OVERFLIGHT', name: 'TCAA Overflight Desk', serviceType: 'OVERFLIGHT_PERMIT', scopeIso2: 'TZ', email: 'overflight@tcaa.example', aogContact: '+255700000012', workingHoursZ: '07:30-16:00' },
  { id: 'PRV-TZ-LAND', name: 'TCAA Landing Desk', serviceType: 'LANDING_PERMIT', scopeIso2: 'TZ', email: 'landing@tcaa.example', aogContact: '+255700000013', workingHoursZ: '07:30-16:00' },
  { id: 'PRV-UG-CUSTOMS', name: 'Entebbe Customs Agent', serviceType: 'CUSTOMS', scopeIcao: 'HUEN', email: 'customs@entebbeagent.example', aogContact: '+256700000014', workingHoursZ: '06:00-20:00' },
  { id: 'PRV-KE-CREW', name: 'Nairobi Crew Cars', serviceType: 'CREW_TRANSPORT', scopeIcao: 'HKJK', email: 'dispatch@nbocrewcars.example', aogContact: '+254700000015', workingHoursZ: '00:00-23:59' },
];
```

- [ ] **Step 8: Implement `personRoles.js`**

```js
export const personRoles = [
  { id: 'ROLE-PIC', label: 'PIC' },
  { id: 'ROLE-SIC', label: 'SIC' },
  { id: 'ROLE-FA', label: 'FA' },
  { id: 'ROLE-MECHANIC', label: 'Mechanic' },
  { id: 'ROLE-ENGINEER', label: 'Engineer' },
  { id: 'ROLE-MEDICAL', label: 'Medical Staff' },
  { id: 'ROLE-OTHER', label: 'Other' },
  { id: 'ROLE-PAX', label: 'Pax' },
  { id: 'ROLE-VIP', label: 'VIP' },
  { id: 'ROLE-PRINCIPAL', label: 'Principal' },
];
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- reference`
Expected: PASS (6 tests).

- [ ] **Step 10: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/mock-data/airports.js frontend/js/lib/mock-data/countries.js frontend/js/lib/mock-data/countryRules.js frontend/js/lib/mock-data/aircraft.js frontend/js/lib/mock-data/providers.js frontend/js/lib/mock-data/personRoles.js frontend/js/lib/mock-data/reference.test.js
git commit -m "Seed reference mock data for East Africa / Middle East corridor"
```

---

### Task 4: Transactional seed data

**Files:**
- Create: `actuator/frontend/js/lib/mock-data/trips.js`
- Create: `actuator/frontend/js/lib/mock-data/persons.js`
- Test: `actuator/frontend/js/lib/mock-data/trips.test.js`

**Interfaces:**
- Consumes: `personRoles` (Task 3, for role IDs used in seeded `persons`).
- Produces: `export const trips`, `legs`, `stops`, `services`, `comms`, `auditEntries` from `trips.js`; `export const persons` from `persons.js` (shapes per Task 2). Consumed by `store.js` (Task 7).

- [ ] **Step 1: Write the failing integrity tests**

`actuator/frontend/js/lib/mock-data/trips.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { trips, legs, stops, services, comms, auditEntries } from './trips.js';
import { persons } from './persons.js';
import { personRoles } from './personRoles.js';

describe('transactional seed data integrity', () => {
  const tripIds = new Set(trips.map((t) => t.id));
  const legIds = new Set(legs.map((l) => l.id));
  const stopIds = new Set(stops.map((s) => s.id));

  it('every leg references a real trip', () => {
    for (const l of legs) expect(tripIds.has(l.tripId)).toBe(true);
  });

  it('every stop references a real trip', () => {
    for (const s of stops) expect(tripIds.has(s.tripId)).toBe(true);
  });

  it('every service scopeId resolves against its scopeType', () => {
    for (const svc of services) {
      expect(tripIds.has(svc.tripId)).toBe(true);
      if (svc.scopeType === 'LEG') {
        expect(legIds.has(svc.scopeId)).toBe(true);
      } else if (svc.scopeType === 'STOP') {
        expect(stopIds.has(svc.scopeId)).toBe(true);
      } else {
        const [legId] = svc.scopeId.split(':');
        expect(legIds.has(legId)).toBe(true);
      }
    }
  });

  it('every comm references a real trip', () => {
    for (const c of comms) expect(tripIds.has(c.tripId)).toBe(true);
  });

  it('seed data covers Confirmed, Requested, and Re-confirm Required statuses', () => {
    const statuses = new Set(services.map((s) => s.status));
    expect(statuses.has('RECONFIRM_REQUIRED')).toBe(true);
    expect(statuses.has('CONFIRMED')).toBe(true);
    expect(statuses.has('REQUESTED')).toBe(true);
  });

  it('has at least 2 trips with at least 1 leg each', () => {
    expect(trips.length).toBeGreaterThanOrEqual(2);
    for (const t of trips) expect(legs.filter((l) => l.tripId === t.id).length).toBeGreaterThanOrEqual(1);
  });

  it('audit entries reference real record ids', () => {
    for (const a of auditEntries) {
      expect(typeof a.recordId).toBe('string');
      expect(a.recordId.length).toBeGreaterThan(0);
    }
  });

  it('every leg has a callSign and a real ETD, and at least one leg has a null (TBD) ETA', () => {
    for (const l of legs) {
      expect(typeof l.callSign).toBe('string');
      expect(l.callSign.length).toBeGreaterThan(0);
      expect(typeof l.etdZ).toBe('string');
    }
    expect(legs.some((l) => l.etaZ === null)).toBe(true);
  });

  it('every person references a real trip and a real role', () => {
    const roleIds = new Set(personRoles.map((r) => r.id));
    for (const p of persons) {
      expect(tripIds.has(p.tripId)).toBe(true);
      expect(roleIds.has(p.roleId)).toBe(true);
    }
    expect(persons.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- trips` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `trips.js`**

Two trips: **2608001** (Dar → Nairobi → Addis → Dar, exercising a confirmed handling+fuel stop, a requested overflight-permit segment, and a landing permit deliberately stale relative to its leg's current ETD to demonstrate `RECONFIRM_REQUIRED`), and **2608002** (Johannesburg → Dubai, exercising a `CHASING` Saudi overflight permit and a not-started catering service).

```js
export const trips = [
  {
    id: 'TRIP-0041', tripCode: '2608001', clientOperator: 'Acacia Charters', registration: '5HABC',
    ownerName: 'B. Minja', status: 'CONFIRMED',
    notifyRecipients: ['crew.5habc@example.com', 'flightdept@acaciacharters.example'],
    createdAtZ: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 'TRIP-0052', tripCode: '2608002', clientOperator: 'Kilimanjaro Air', registration: 'A6DEF',
    ownerName: 'B. Minja', status: 'DRAFT', notifyRecipients: ['crew.a6def@example.com'],
    createdAtZ: '2026-08-10T11:00:00.000Z',
  },
];
```

Leg 3's `etaZ` is deliberately `null` ("TBD") — the trip's final arrival back into HTDA isn't confirmed yet, matching the real-world case where a return leg's arrival time is still open. Each leg carries its own Call Sign (real operators reuse the registration but assign a distinct call sign per rotation, as in the multi-leg overflight example).

```js
export const legs = [
  { id: 'LEG-0041-1', tripId: 'TRIP-0041', sequence: 1, callSign: 'ACJ041A', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', overflightCountries: [], revision: 0 },
  { id: 'LEG-0041-2', tripId: 'TRIP-0041', sequence: 2, callSign: 'ACJ041B', depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', overflightCountries: ['ET'], revision: 1 },
  { id: 'LEG-0041-3', tripId: 'TRIP-0041', sequence: 3, callSign: 'ACJ041C', depIcao: 'HAAB', arrIcao: 'HTDA', etdZ: '2026-08-21T07:00:00.000Z', etaZ: null, overflightCountries: ['KE'], revision: 0 },
  { id: 'LEG-0052-1', tripId: 'TRIP-0052', sequence: 1, callSign: 'KLA052A', depIcao: 'FAOR', arrIcao: 'OMDB', etdZ: '2026-08-16T18:00:00.000Z', etaZ: '2026-08-17T04:30:00.000Z', overflightCountries: ['SA'], revision: 0 },
];

export const stops = [
  { id: 'STOP-0041-HTDA-1', tripId: 'TRIP-0041', icao: 'HTDA', arrZ: null, depZ: '2026-08-20T05:00:00.000Z', groundTimeHours: null, purpose: 'TURNAROUND' },
  { id: 'STOP-0041-HKJK', tripId: 'TRIP-0041', icao: 'HKJK', arrZ: '2026-08-20T06:15:00.000Z', depZ: '2026-08-20T09:00:00.000Z', groundTimeHours: 2.75, purpose: 'TECH_STOP' },
  { id: 'STOP-0041-HAAB', tripId: 'TRIP-0041', icao: 'HAAB', arrZ: '2026-08-20T10:45:00.000Z', depZ: '2026-08-21T07:00:00.000Z', groundTimeHours: 20.25, purpose: 'NIGHT_STOP' },
  { id: 'STOP-0041-HTDA-2', tripId: 'TRIP-0041', icao: 'HTDA', arrZ: null, depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' },
  { id: 'STOP-0052-FAOR', tripId: 'TRIP-0052', icao: 'FAOR', arrZ: null, depZ: '2026-08-16T18:00:00.000Z', groundTimeHours: null, purpose: 'TURNAROUND' },
  { id: 'STOP-0052-OMDB', tripId: 'TRIP-0052', icao: 'OMDB', arrZ: '2026-08-17T04:30:00.000Z', depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' },
];

export const services = [
  { id: 'SVC-0041-01', tripId: 'TRIP-0041', scopeType: 'STOP', scopeId: 'STOP-0041-HKJK', serviceType: 'HANDLING', providerId: 'PRV-KE-HANDLE', status: 'CONFIRMED', refNumber: 'HKJK-HDL-8823', basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-02', tripId: 'TRIP-0041', scopeType: 'STOP', scopeId: 'STOP-0041-HKJK', serviceType: 'FUEL', providerId: 'PRV-KE-FUEL', status: 'CONFIRMED', refNumber: 'FUEL-KE-4471', basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-03', tripId: 'TRIP-0041', scopeType: 'SEGMENT', scopeId: 'LEG-0041-2:ET', serviceType: 'OVERFLIGHT_PERMIT', providerId: 'PRV-ET-PERMIT', status: 'REQUESTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-04', tripId: 'TRIP-0041', scopeType: 'LEG', scopeId: 'LEG-0041-2', serviceType: 'LANDING_PERMIT', providerId: null, status: 'RECONFIRM_REQUIRED', refNumber: 'ET-LAND-2201', basedOnEtdZ: '2026-08-20T01:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-05', tripId: 'TRIP-0041', scopeType: 'SEGMENT', scopeId: 'LEG-0041-3:KE', serviceType: 'OVERFLIGHT_PERMIT', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-21T07:00:00.000Z', assignedTo: null },
  { id: 'SVC-0052-01', tripId: 'TRIP-0052', scopeType: 'SEGMENT', scopeId: 'LEG-0052-1:SA', serviceType: 'OVERFLIGHT_PERMIT', providerId: 'PRV-SA-OVERFLIGHT', status: 'CHASING', refNumber: null, basedOnEtdZ: '2026-08-16T18:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0052-02', tripId: 'TRIP-0052', scopeType: 'STOP', scopeId: 'STOP-0052-OMDB', serviceType: 'CATERING', providerId: 'PRV-AE-CATER', status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-17T04:30:00.000Z', assignedTo: null },
];

export const comms = [
  { id: 'COMM-0041-01', tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'OUT', kind: 'REQUEST', token: '[2608001/SVC-0041-01]', from: 'ops@insider.co.tz', to: ['ops@nbohandling.example'], subject: 'Handling request — 5HABC [2608001/SVC-0041-01]', body: 'Requesting handling for 5HABC arriving HKJK 2026-08-20T06:15Z, departing 2026-08-20T09:00Z. Full crew and pax per manifest.', timestampZ: '2026-08-02T08:00:00.000Z' },
  { id: 'COMM-0041-02', tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'IN', kind: 'REQUEST', token: '[2608001/SVC-0041-01]', from: 'ops@nbohandling.example', to: ['ops@insider.co.tz'], subject: 'RE: Handling request — 5HABC [2608001/SVC-0041-01]', body: 'Confirmed, ref HKJK-HDL-8823.', timestampZ: '2026-08-02T10:30:00.000Z' },
  { id: 'COMM-0041-03', tripId: 'TRIP-0041', serviceId: null, direction: 'OUT', kind: 'NOTIFICATION', token: null, from: 'ops@insider.co.tz', to: ['crew.5habc@example.com', 'flightdept@acaciacharters.example'], subject: 'Trip 2608001 confirmed', body: 'Trip 2608001 (HTDA-HKJK-HAAB-HTDA) is now confirmed.', timestampZ: '2026-08-05T12:00:00.000Z' },
];

export const auditEntries = [
  { id: 'AUD-0041-01', timestampZ: '2026-08-02T08:00:00.000Z', user: 'B. Minja', table: 'Service', recordId: 'SVC-0041-01', field: 'status', oldValue: 'NOT_STARTED', newValue: 'REQUESTED' },
  { id: 'AUD-0041-02', timestampZ: '2026-08-02T10:30:00.000Z', user: 'B. Minja', table: 'Service', recordId: 'SVC-0041-01', field: 'status', oldValue: 'REQUESTED', newValue: 'CONFIRMED' },
  { id: 'AUD-0041-03', timestampZ: '2026-08-14T06:00:00.000Z', user: 'B. Minja', table: 'Leg', recordId: 'LEG-0041-2', field: 'etdZ', oldValue: '2026-08-20T01:00:00.000Z', newValue: '2026-08-20T09:00:00.000Z' },
  { id: 'AUD-0041-04', timestampZ: '2026-08-14T06:00:01.000Z', user: 'system', table: 'Service', recordId: 'SVC-0041-04', field: 'status', oldValue: 'CONFIRMED', newValue: 'RECONFIRM_REQUIRED' },
];
```

- [ ] **Step 4: Implement `persons.js`**

A five-person roster for 2608001 (crew + a principal + a pax) and a three-person roster for 2608002 — including a named crew-transport contact, matching how real handling telexes name a specific individual rather than just a headcount.

```js
export const persons = [
  { id: 'PER-0041-01', tripId: 'TRIP-0041', name: 'Capt. B. Mwangi', roleId: 'ROLE-PIC' },
  { id: 'PER-0041-02', tripId: 'TRIP-0041', name: 'F/O A. Ngugi', roleId: 'ROLE-SIC' },
  { id: 'PER-0041-03', tripId: 'TRIP-0041', name: 'J. Kileo', roleId: 'ROLE-FA' },
  { id: 'PER-0041-04', tripId: 'TRIP-0041', name: 'D. Massawe', roleId: 'ROLE-PRINCIPAL' },
  { id: 'PER-0041-05', tripId: 'TRIP-0041', name: 'R. Chami', roleId: 'ROLE-PAX' },
  { id: 'PER-0052-01', tripId: 'TRIP-0052', name: 'Capt. T. Swanson', roleId: 'ROLE-PIC' },
  { id: 'PER-0052-02', tripId: 'TRIP-0052', name: 'E. Grabman', roleId: 'ROLE-OTHER', notes: 'Crew transport contact' },
  { id: 'PER-0052-03', tripId: 'TRIP-0052', name: 'M. Achieng', roleId: 'ROLE-VIP' },
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- trips`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/mock-data/trips.js frontend/js/lib/mock-data/persons.js frontend/js/lib/mock-data/trips.test.js
git commit -m "Add seeded trips/legs/stops/services/comms/audit/persons fixtures"
```

---

### Task 5: Scope-type filtering logic

**Files:**
- Create: `actuator/frontend/js/lib/scope.js`
- Test: `actuator/frontend/js/lib/scope.test.js`

**Interfaces:**
- Produces: `scopeTypeForServiceType(serviceType)`, `getScopeCandidates(serviceType, legs, stops)` returning `{ scopeId, label }[]`. Consumed by `store.js`, `trip-sheet-service-group.js` (Task 13).

- [ ] **Step 1: Write the failing tests**

`actuator/frontend/js/lib/scope.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { scopeTypeForServiceType, getScopeCandidates } from './scope.js';

const legs = [
  { id: 'L1', tripId: 'T1', sequence: 1, callSign: 'ACW169', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', overflightCountries: [], revision: 0 },
  { id: 'L2', tripId: 'T1', sequence: 2, callSign: 'ACW170', depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', overflightCountries: ['ET'], revision: 0 },
];
const stops = [
  { id: 'S1', tripId: 'T1', icao: 'HKJK', arrZ: '2026-08-20T06:15:00.000Z', depZ: '2026-08-20T09:00:00.000Z', groundTimeHours: 2.75, purpose: 'TECH_STOP' },
];

describe('scopeTypeForServiceType', () => {
  it('maps overflight permit to SEGMENT', () => expect(scopeTypeForServiceType('OVERFLIGHT_PERMIT')).toBe('SEGMENT'));
  it('maps landing permit to LEG', () => expect(scopeTypeForServiceType('LANDING_PERMIT')).toBe('LEG'));
  it('maps fuel/handling/catering/crew transport/customs to STOP', () => {
    for (const st of ['FUEL', 'HANDLING', 'CATERING', 'CREW_TRANSPORT', 'CUSTOMS']) {
      expect(scopeTypeForServiceType(st)).toBe('STOP');
    }
  });
});

describe('getScopeCandidates', () => {
  it('returns legs for LANDING_PERMIT', () => {
    expect(getScopeCandidates('LANDING_PERMIT', legs, stops).map((c) => c.scopeId)).toEqual(['L1', 'L2']);
  });
  it('returns stops for FUEL', () => {
    expect(getScopeCandidates('FUEL', legs, stops).map((c) => c.scopeId)).toEqual(['S1']);
  });
  it('returns one candidate per (leg, overflown country) for OVERFLIGHT_PERMIT', () => {
    expect(getScopeCandidates('OVERFLIGHT_PERMIT', legs, stops)).toEqual([{ scopeId: 'L2:ET', label: 'HKJK → HAAB: overflying ET' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- scope` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `scope.js`**

```js
const SERVICE_TYPE_SCOPE = {
  OVERFLIGHT_PERMIT: 'SEGMENT',
  LANDING_PERMIT: 'LEG',
  FUEL: 'STOP',
  HANDLING: 'STOP',
  CATERING: 'STOP',
  CREW_TRANSPORT: 'STOP',
  CUSTOMS: 'STOP',
};

export function scopeTypeForServiceType(serviceType) {
  return SERVICE_TYPE_SCOPE[serviceType];
}

export function getScopeCandidates(serviceType, legs, stops) {
  const scopeType = scopeTypeForServiceType(serviceType);
  if (scopeType === 'LEG') {
    return legs.map((l) => ({ scopeId: l.id, label: `${l.depIcao} → ${l.arrIcao} (ETD ${l.etdZ})` }));
  }
  if (scopeType === 'STOP') {
    return stops.map((s) => ({ scopeId: s.id, label: `${s.icao} (${s.purpose})` }));
  }
  const candidates = [];
  for (const leg of legs) {
    for (const iso2 of leg.overflightCountries) {
      candidates.push({ scopeId: `${leg.id}:${iso2}`, label: `${leg.depIcao} → ${leg.arrIcao}: overflying ${iso2}` });
    }
  }
  return candidates;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- scope`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/scope.js frontend/js/lib/scope.test.js
git commit -m "Add service-type to scope-type filtering logic"
```

---

### Task 6: Stop derivation + rebuild diffing logic

**Files:**
- Create: `actuator/frontend/js/lib/stops.js`
- Test: `actuator/frontend/js/lib/stops.test.js`

**Interfaces:**
- Produces: `deriveStopsFromLegs(tripId, legs)`, `diffStopsForRebuild(tripId, legs, existingStops, hasAttachedServices)` returning `{ kept, added, orphaned }`. Consumed by `store.js` (Task 7), `trip-wizard.js` (Task 16).

- [ ] **Step 1: Write the failing tests**

`actuator/frontend/js/lib/stops.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { deriveStopsFromLegs, diffStopsForRebuild } from './stops.js';

const legs = [
  { id: 'L1', tripId: 'T1', sequence: 1, callSign: 'ACW169', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', overflightCountries: [], revision: 0 },
  { id: 'L2', tripId: 'T1', sequence: 2, callSign: 'ACW170', depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', overflightCountries: ['ET'], revision: 0 },
];

describe('deriveStopsFromLegs', () => {
  it('produces an origin turnaround, a tech stop between legs, and a destination turnaround', () => {
    const result = deriveStopsFromLegs('T1', legs);
    expect(result.map((s) => s.icao)).toEqual(['HTDA', 'HKJK', 'HAAB']);
    expect(result[0].purpose).toBe('TURNAROUND');
    expect(result[1].purpose).toBe('TECH_STOP');
    expect(result[1].groundTimeHours).toBeCloseTo(2.75, 2);
    expect(result[2].purpose).toBe('TURNAROUND');
  });

  it('marks a stop NIGHT_STOP when ground time exceeds 8 hours', () => {
    const longLegs = [legs[0], { ...legs[1], etdZ: '2026-08-21T07:00:00.000Z' }];
    expect(deriveStopsFromLegs('T1', longLegs)[1].purpose).toBe('NIGHT_STOP');
  });

  it('leaves arrZ and groundTimeHours null for a mid-route stop when the feeding leg has no ETA yet (TBD)', () => {
    // legs[0] (HTDA -> HKJK) feeds the mid-route HKJK stop (result[1]) — nulling ITS etaZ, not
    // legs[1]'s, is what actually exercises the mid-route null-guard branch, not the final-stop one.
    const tbdLegs = [{ ...legs[0], etaZ: null }, legs[1]];
    const result = deriveStopsFromLegs('T1', tbdLegs);
    expect(result[1].arrZ).toBeNull();
    expect(result[1].groundTimeHours).toBeNull();
  });

  it('leaves the final stop\'s arrZ null when the last leg has no ETA yet (TBD)', () => {
    const tbdLegs = [{ ...legs[0], etaZ: null }];
    const result = deriveStopsFromLegs('T1', tbdLegs);
    expect(result[result.length - 1].arrZ).toBeNull();
  });
});

describe('diffStopsForRebuild', () => {
  const existingStops = [
    { id: 'S-HTDA', tripId: 'T1', icao: 'HTDA', arrZ: null, depZ: legs[0].etdZ, groundTimeHours: null, purpose: 'TURNAROUND' },
    { id: 'S-HKJK', tripId: 'T1', icao: 'HKJK', arrZ: legs[0].etaZ, depZ: legs[1].etdZ, groundTimeHours: 2.75, purpose: 'TECH_STOP' },
    { id: 'S-STALE', tripId: 'T1', icao: 'HUEN', arrZ: null, depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' },
  ];

  it('keeps stops whose ICAO still appears in the derived list', () => {
    expect(diffStopsForRebuild('T1', legs, existingStops, () => false).kept.map((s) => s.id)).toEqual(['S-HTDA', 'S-HKJK']);
  });

  it('flags stops no longer on the route as orphaned when nothing is attached', () => {
    expect(diffStopsForRebuild('T1', legs, existingStops, () => false).orphaned.map((s) => s.id)).toEqual(['S-STALE']);
  });

  it('preserves an orphaned stop instead of dropping it when a service is attached', () => {
    const result = diffStopsForRebuild('T1', legs, existingStops, (stopId) => stopId === 'S-STALE');
    expect(result.orphaned).toEqual([]);
    expect(result.kept.map((s) => s.id)).toContain('S-STALE');
  });

  it('adds newly-derived stops missing from the existing list', () => {
    expect(diffStopsForRebuild('T1', legs, [existingStops[0]], () => false).added.map((s) => s.icao)).toEqual(['HKJK', 'HAAB']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- stops` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `stops.js`**

```js
export function deriveStopsFromLegs(tripId, legs) {
  const sorted = [...legs].sort((a, b) => a.sequence - b.sequence);
  const result = [];

  sorted.forEach((leg, index) => {
    const isFirst = index === 0;
    const isLast = index === sorted.length - 1;

    if (isFirst) {
      result.push({ tripId, icao: leg.depIcao, arrZ: null, depZ: leg.etdZ, groundTimeHours: null, purpose: 'TURNAROUND' });
    }

    if (isLast) {
      result.push({ tripId, icao: leg.arrIcao, arrZ: leg.etaZ, depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' });
    } else {
      const nextLeg = sorted[index + 1];
      if (leg.etaZ === null) {
        // ETA not known yet (TBD) — the stop exists so staff can attach a handler, but ground
        // time and a TECH_STOP/NIGHT_STOP call can't be made until the leg's ETA is filled in.
        result.push({ tripId, icao: leg.arrIcao, arrZ: null, depZ: nextLeg.etdZ, groundTimeHours: null, purpose: 'TECH_STOP' });
      } else {
        const groundTimeHours = (new Date(nextLeg.etdZ).getTime() - new Date(leg.etaZ).getTime()) / 3_600_000;
        const purpose = groundTimeHours > 8 ? 'NIGHT_STOP' : 'TECH_STOP';
        result.push({ tripId, icao: leg.arrIcao, arrZ: leg.etaZ, depZ: nextLeg.etdZ, groundTimeHours, purpose });
      }
    }
  });

  return result;
}

export function diffStopsForRebuild(tripId, legs, existingStops, hasAttachedServices) {
  const derived = deriveStopsFromLegs(tripId, legs);
  const derivedIcaos = new Set(derived.map((d) => d.icao));
  const existingIcaos = new Set(existingStops.map((s) => s.icao));

  const stillOnRoute = existingStops.filter((s) => derivedIcaos.has(s.icao));
  const offRoute = existingStops.filter((s) => !derivedIcaos.has(s.icao));
  const offRouteWithServices = offRoute.filter((s) => hasAttachedServices(s.id));
  const offRouteWithoutServices = offRoute.filter((s) => !hasAttachedServices(s.id));

  return {
    kept: [...stillOnRoute, ...offRouteWithServices],
    added: derived.filter((d) => !existingIcaos.has(d.icao)),
    orphaned: offRouteWithoutServices,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- stops`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/stops.js frontend/js/lib/stops.test.js
git commit -m "Add stop derivation and rebuild-diff logic"
```

---

### Task 7: In-memory store

**Files:**
- Create: `actuator/frontend/js/lib/store.js`
- Test: `actuator/frontend/js/lib/store.test.js`

**Interfaces:**
- Consumes: all Task 3/4 mock-data modules (including `personRoles`, Task 3, and `persons`, Task 4), `needsReconfirm` (Task 2), `diffStopsForRebuild` (Task 6).
- Produces: `createStore()` factory (used directly by tests to avoid singleton cross-test pollution) and `export const store = createStore()` (the singleton every page module imports). Shape:

```
store.state = { airports, countries, countryRules, aircraft, providers, personRoles, trips, persons, legs, stops, services, comms, audit, documents, billing }
store.subscribe(listener) -> unsubscribe function
store.addTrip(trip) -> Trip                       // trip without id/createdAtZ
store.addPerson(person) -> Person                 // person without id
store.removePerson(personId, user)                // soft-delete (sets removed: true, not spliced out — see Person shape), audits
store.addLeg(leg) -> Leg                          // leg without id/revision
store.updateLegEtd(legId, newEtdZ, user)          // mutates leg, bumps revision, audits, flips affected CONFIRMED services to RECONFIRM_REQUIRED
store.updateLegEta(legId, newEtaZ, user)          // mutates leg, bumps revision, audits — no re-confirm cascade (services key off ETD, not ETA)
store.addStops(newStops) -> Stop[]                // stops without id
store.rebuildStops(tripId, user) -> { kept, added, orphaned }
store.addService(service) -> Service              // service without id
store.updateServiceStatus(serviceId, status, user)
store.addComm(comm) -> Comm                       // comm without id/timestampZ
store.addAuditEntry(entry)                        // entry without id/timestampZ
store.addDocument(doc) -> Document                // doc without id/uploadedAtZ
store.removeDocument(documentId, user)            // soft-delete (sets removed: true), audits
store.addBillingLineItem(item) -> BillingLineItem // item without id
store.removeBillingLineItem(lineItemId, user)     // soft-delete (sets removed: true), audits
store.updateBillingLineItemStatus(lineItemId, status, user)
```

`documents`/`billing` start as **empty arrays** in this task — no `mock-data/documents.js`/`billing.js` seed files exist yet (they're created in Tasks 18-19, which run after this one). Tasks 18-19 each do a small, separate modification to this file: add an import line and swap the empty-array initializer for a seeded one — they do NOT add new mutator functions, all of those (`addDocument`, `removeDocument`, `addBillingLineItem`, `removeBillingLineItem`, `updateBillingLineItemStatus`) are built here, in this task, against the empty arrays, so the store's full action surface is defined in one place from the start.

Every mutator calls `notify()` synchronously before returning — see the Global Constraints "store re-render ordering convention."

- [ ] **Step 1: Write the failing tests**

`actuator/frontend/js/lib/store.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createStore } from './store.js';

describe('store', () => {
  it('seeds state from the mock-data fixtures', () => {
    const store = createStore();
    expect(store.state.trips.length).toBeGreaterThan(0);
    expect(store.state.airports.length).toBeGreaterThan(0);
  });

  it('addTrip appends a new trip with a generated id and createdAtZ', () => {
    const store = createStore();
    const before = store.state.trips.length;
    store.addTrip({ tripCode: '2608999', clientOperator: 'Test Op', registration: '5HABC', ownerName: 'Tester', status: 'DRAFT', notifyRecipients: [] });
    expect(store.state.trips.length).toBe(before + 1);
    const created = store.state.trips.find((t) => t.tripCode === '2608999');
    expect(created.id).toBeTruthy();
    expect(created.createdAtZ).toBeTruthy();
  });

  it('updateLegEtd changes the leg, bumps revision, and records an audit entry', () => {
    const store = createStore();
    const leg = store.state.legs.find((l) => l.id === 'LEG-0041-1');
    // Snapshot as a primitive, not a live reference — updateLegEtd mutates the found leg object
    // in place (same pattern as updateServiceStatus/removePerson elsewhere in this store), so
    // `leg` and `updated` below end up being the SAME object; comparing `leg.revision` after the
    // call would compare the post-mutation value against itself.
    const revisionBefore = leg.revision;
    const before = store.state.audit.length;
    store.updateLegEtd('LEG-0041-1', '2026-09-01T00:00:00.000Z', 'Tester');
    const updated = store.state.legs.find((l) => l.id === 'LEG-0041-1');
    expect(updated.etdZ).toBe('2026-09-01T00:00:00.000Z');
    expect(updated.revision).toBe(revisionBefore + 1);
    expect(store.state.audit.length).toBe(before + 1);
  });

  it('updateLegEtd flips affected CONFIRMED services to RECONFIRM_REQUIRED when the shift exceeds tolerance', () => {
    const store = createStore();
    store.updateLegEtd('LEG-0041-2', '2026-08-20T20:00:00.000Z', 'Tester');
    const svc = store.state.services.find((s) => s.id === 'SVC-0041-01');
    expect(svc.status).toBe('RECONFIRM_REQUIRED');
  });

  it('updateLegEta fills in a TBD ETA, bumps revision, and audits, without touching any service status', () => {
    const store = createStore();
    const leg = store.state.legs.find((l) => l.id === 'LEG-0041-3');
    expect(leg.etaZ).toBeNull();
    const revisionBefore = leg.revision; // primitive snapshot — see the comment on the updateLegEtd test above.
    const confirmedBefore = store.state.services.filter((s) => s.status === 'CONFIRMED').map((s) => s.id);
    store.updateLegEta('LEG-0041-3', '2026-08-21T09:30:00.000Z', 'Tester');
    const updated = store.state.legs.find((l) => l.id === 'LEG-0041-3');
    expect(updated.etaZ).toBe('2026-08-21T09:30:00.000Z');
    expect(updated.revision).toBe(revisionBefore + 1);
    const confirmedAfter = store.state.services.filter((s) => s.status === 'CONFIRMED').map((s) => s.id);
    expect(confirmedAfter).toEqual(confirmedBefore);
  });

  it('addPerson appends a person to state; removePerson soft-deletes it (kept, flagged) and audits', () => {
    const store = createStore();
    const before = store.state.persons.length;
    const created = store.addPerson({ tripId: 'TRIP-0041', name: 'Test Person', roleId: 'ROLE-PAX' });
    expect(store.state.persons.length).toBe(before + 1);
    expect(created.id).toBeTruthy();
    const auditBefore = store.state.audit.length;
    store.removePerson(created.id, 'Tester');
    // Still present (soft delete) so its audit trail stays reachable from the trip's History tab.
    expect(store.state.persons.length).toBe(before + 1);
    expect(store.state.persons.find((p) => p.id === created.id).removed).toBe(true);
    expect(store.state.audit.length).toBe(auditBefore + 1);
  });

  it('addService appends a service to state', () => {
    const store = createStore();
    const before = store.state.services.length;
    store.addService({ tripId: 'TRIP-0041', scopeType: 'STOP', scopeId: 'STOP-0041-HKJK', serviceType: 'CATERING', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: null });
    expect(store.state.services.length).toBe(before + 1);
  });

  it('addComm appends a comm with a generated id and timestamp', () => {
    const store = createStore();
    const before = store.state.comms.length;
    store.addComm({ tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'OUT', kind: 'REQUEST', token: '[2608001/SVC-0041-01]', from: 'ops@insider.co.tz', to: ['x@example.com'], subject: 'Test', body: 'Body' });
    expect(store.state.comms.length).toBe(before + 1);
  });

  it('rebuildStops updates stops for a trip and returns the diff result', () => {
    const store = createStore();
    const diff = store.rebuildStops('TRIP-0041', 'Tester');
    expect(diff.kept).toBeDefined();
    expect(diff.added).toBeDefined();
    expect(diff.orphaned).toBeDefined();
  });

  it('starts with empty documents/billing arrays (no seed data exists until Tasks 18-19)', () => {
    const store = createStore();
    expect(store.state.documents).toEqual([]);
    expect(store.state.billing).toEqual([]);
  });

  it('addDocument appends a document; removeDocument soft-deletes it (kept, flagged) and audits', () => {
    const store = createStore();
    const created = store.addDocument({ tripId: 'TRIP-0041', name: 'AOC Certificate', docType: 'AOC' });
    expect(store.state.documents.length).toBe(1);
    expect(created.id).toBeTruthy();
    expect(created.uploadedAtZ).toBeTruthy();
    const auditBefore = store.state.audit.length;
    store.removeDocument(created.id, 'Tester');
    expect(store.state.documents.length).toBe(1);
    expect(store.state.documents.find((d) => d.id === created.id).removed).toBe(true);
    expect(store.state.audit.length).toBe(auditBefore + 1);
  });

  it('addBillingLineItem appends a line item; removeBillingLineItem soft-deletes it; updateBillingLineItemStatus changes status and audits', () => {
    const store = createStore();
    const created = store.addBillingLineItem({ tripId: 'TRIP-0041', description: 'Handling fee', amount: 500, currency: 'USD', status: 'PENDING' });
    expect(store.state.billing.length).toBe(1);
    expect(created.id).toBeTruthy();
    store.updateBillingLineItemStatus(created.id, 'INVOICED', 'Tester');
    expect(store.state.billing.find((b) => b.id === created.id).status).toBe('INVOICED');
    const auditBefore = store.state.audit.length;
    store.removeBillingLineItem(created.id, 'Tester');
    expect(store.state.billing.length).toBe(1);
    expect(store.state.billing.find((b) => b.id === created.id).removed).toBe(true);
    expect(store.state.audit.length).toBe(auditBefore + 1);
  });

  it('notifies subscribers on every mutation', () => {
    const store = createStore();
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    store.addTrip({ tripCode: '2608888', clientOperator: 'X', registration: '5HABC', ownerName: 'X', status: 'DRAFT', notifyRecipients: [] });
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- store` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `store.js`**

```js
import { airports } from './mock-data/airports.js';
import { countries } from './mock-data/countries.js';
import { countryRules } from './mock-data/countryRules.js';
import { aircraft } from './mock-data/aircraft.js';
import { providers } from './mock-data/providers.js';
import { personRoles } from './mock-data/personRoles.js';
import { trips as seedTrips, legs as seedLegs, stops as seedStops, services as seedServices, comms as seedComms, auditEntries as seedAudit } from './mock-data/trips.js';
import { persons as seedPersons } from './mock-data/persons.js';
import { needsReconfirm } from './core-logic.js';
import { diffStopsForRebuild } from './stops.js';

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function createStore() {
  const state = {
    airports, countries, countryRules, aircraft, providers, personRoles,
    trips: seedTrips.map((t) => ({ ...t })),
    persons: seedPersons.map((p) => ({ ...p })),
    legs: seedLegs.map((l) => ({ ...l })),
    stops: seedStops.map((s) => ({ ...s })),
    services: seedServices.map((s) => ({ ...s })),
    comms: seedComms.map((c) => ({ ...c })),
    audit: seedAudit.map((a) => ({ ...a })),
    documents: [],
    billing: [],
  };
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function addAuditEntry(entry) {
    state.audit.push({ ...entry, id: nextId('AUD'), timestampZ: new Date().toISOString() });
  }

  function addTrip(trip) {
    const created = { ...trip, id: nextId('TRIP'), createdAtZ: new Date().toISOString() };
    state.trips.push(created);
    notify();
    return created;
  }

  function addPerson(person) {
    const created = { ...person, id: nextId('PER') };
    state.persons.push(created);
    notify();
    return created;
  }

  function removePerson(personId, user) {
    const person = state.persons.find((p) => p.id === personId);
    if (!person) return;
    // Soft delete — kept in state (not spliced out) so this audit entry stays reachable from
    // the trip's History tab, which finds entries by joining recordId back to a live record.
    addAuditEntry({ user, table: 'Person', recordId: personId, field: 'removed', oldValue: 'false', newValue: 'true' });
    person.removed = true;
    notify();
  }

  function addLeg(leg) {
    const created = { ...leg, id: nextId('LEG'), revision: 0 };
    state.legs.push(created);
    notify();
    return created;
  }

  function updateLegEta(legId, newEtaZ, user) {
    const leg = state.legs.find((l) => l.id === legId);
    if (!leg) return;
    addAuditEntry({ user, table: 'Leg', recordId: legId, field: 'etaZ', oldValue: leg.etaZ === null ? 'TBD' : leg.etaZ, newValue: newEtaZ });
    leg.etaZ = newEtaZ;
    leg.revision += 1;
    notify();
  }

  function updateLegEtd(legId, newEtdZ, user) {
    const leg = state.legs.find((l) => l.id === legId);
    if (!leg) return;
    const oldEtdZ = leg.etdZ;
    addAuditEntry({ user, table: 'Leg', recordId: legId, field: 'etdZ', oldValue: oldEtdZ, newValue: newEtdZ });

    for (const svc of state.services) {
      if (svc.status !== 'CONFIRMED') continue;
      const rule = state.countryRules.find((r) => r.serviceType === svc.serviceType);
      const tolerance = rule ? rule.toleranceHours : 0;
      const affects =
        (svc.scopeType === 'LEG' && svc.scopeId === legId) ||
        (svc.scopeType === 'SEGMENT' && svc.scopeId.startsWith(`${legId}:`)) ||
        (svc.scopeType === 'STOP' && state.stops.some((s) => s.id === svc.scopeId && (s.arrZ === oldEtdZ || s.depZ === oldEtdZ)));
      if (affects && needsReconfirm(svc.basedOnEtdZ, newEtdZ, tolerance)) {
        addAuditEntry({ user: 'system', table: 'Service', recordId: svc.id, field: 'status', oldValue: svc.status, newValue: 'RECONFIRM_REQUIRED' });
        svc.status = 'RECONFIRM_REQUIRED';
      }
    }

    leg.etdZ = newEtdZ;
    leg.revision += 1;
    notify();
  }

  function addStops(newStops) {
    const created = newStops.map((s) => ({ ...s, id: nextId('STOP') }));
    state.stops.push(...created);
    notify();
    return created;
  }

  function rebuildStops(tripId, user) {
    const tripLegs = state.legs.filter((l) => l.tripId === tripId);
    const tripStops = state.stops.filter((s) => s.tripId === tripId);
    const hasAttachedServices = (stopId) => state.services.some((svc) => svc.scopeType === 'STOP' && svc.scopeId === stopId);
    const result = diffStopsForRebuild(tripId, tripLegs, tripStops, hasAttachedServices);
    const addedWithIds = result.added.map((s) => ({ ...s, id: nextId('STOP') }));

    state.stops = [
      ...state.stops.filter((s) => s.tripId !== tripId || result.kept.some((k) => k.id === s.id)),
      ...addedWithIds,
    ];
    addAuditEntry({ user, table: 'Trip', recordId: tripId, field: 'stops', oldValue: `${tripStops.length} stops`, newValue: `${result.kept.length + addedWithIds.length} stops` });
    notify();
    return { ...result, added: addedWithIds };
  }

  function addService(service) {
    const created = { ...service, id: nextId('SVC') };
    state.services.push(created);
    notify();
    return created;
  }

  function updateServiceStatus(serviceId, status, user) {
    const svc = state.services.find((s) => s.id === serviceId);
    if (!svc) return;
    addAuditEntry({ user, table: 'Service', recordId: serviceId, field: 'status', oldValue: svc.status, newValue: status });
    svc.status = status;
    notify();
  }

  function addComm(comm) {
    const created = { ...comm, id: nextId('COMM'), timestampZ: new Date().toISOString() };
    state.comms.push(created);
    notify();
    return created;
  }

  function addDocument(doc) {
    const created = { ...doc, id: nextId('DOC'), uploadedAtZ: new Date().toISOString() };
    state.documents.push(created);
    notify();
    return created;
  }

  function removeDocument(documentId, user) {
    const doc = state.documents.find((d) => d.id === documentId);
    if (!doc) return;
    addAuditEntry({ user, table: 'Document', recordId: documentId, field: 'removed', oldValue: 'false', newValue: 'true' });
    doc.removed = true;
    notify();
  }

  function addBillingLineItem(item) {
    const created = { ...item, id: nextId('BILL') };
    state.billing.push(created);
    notify();
    return created;
  }

  function removeBillingLineItem(lineItemId, user) {
    const item = state.billing.find((b) => b.id === lineItemId);
    if (!item) return;
    addAuditEntry({ user, table: 'Billing', recordId: lineItemId, field: 'removed', oldValue: 'false', newValue: 'true' });
    item.removed = true;
    notify();
  }

  function updateBillingLineItemStatus(lineItemId, status, user) {
    const item = state.billing.find((b) => b.id === lineItemId);
    if (!item) return;
    addAuditEntry({ user, table: 'Billing', recordId: lineItemId, field: 'status', oldValue: item.status, newValue: status });
    item.status = status;
    notify();
  }

  return {
    state, subscribe, addTrip, addPerson, removePerson, addLeg, updateLegEtd, updateLegEta, addStops, rebuildStops,
    addService, updateServiceStatus, addComm, addAuditEntry,
    addDocument, removeDocument, addBillingLineItem, removeBillingLineItem, updateBillingLineItemStatus,
  };
}

export const store = createStore();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- store`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/store.js frontend/js/lib/store.test.js
git commit -m "Add in-memory store with re-confirm invalidation and rebuild-stops"
```

---

### Task 8: Shared page chrome — nav, UI helpers, display-format conventions

**Files:**
- Create: `actuator/frontend/js/lib/format.js`
- Test: `actuator/frontend/js/lib/format.test.js`
- Create: `actuator/frontend/js/pages/nav.js`
- Create: `actuator/frontend/js/pages/ui-helpers.js`

**Interfaces:**
- Produces (`format.js`, pure logic, tested): `formatDateTimeZ(iso)` — `null`/`undefined` → `'TBD'`, otherwise ISO string → `'DD-Mon-YYYY HH:MM'Z'` (e.g. `'18-Aug-2026 06:00Z'`); `formatDateOnlyZ(iso)` — same but date only (`'18-Aug-2026'`), `null` → `'TBD'`; `countryNameFor(iso2, countries)` — looks up `countries` (Task 3's array) by `iso2` and returns the country's `name`, or the raw `iso2` string if not found (never throws on an unknown code). Consumed by every later page task that displays a timestamp or a country: Action Board (Task 9), Route/Itinerary (Task 11), Services/Permits (Task 13), Composer/Messages (Task 14), History (Task 15), Wizard (Task 16), Country Rules reference page (Task 17).
- Produces (`nav.js`/`ui-helpers.js`, DOM helpers, untested): `mountNav()` — finds `#app-nav` in the current document and fills it with the nav bar; `escapeHtml(value)` — HTML-escapes any value before `innerHTML` interpolation; `urgencyBadgeHtml(urgency)` — returns a `<span>` badge for a given urgency string. Every page module from Task 9 onward imports these.

Per the spec's "Display and input conventions": every place a leg/service/comm/audit timestamp is shown must go through `formatDateTimeZ`/`formatDateOnlyZ` instead of interpolating the raw ISO string directly, and every place a country appears in a label must go through `countryNameFor` instead of showing the raw ISO2 code. This task's two format-logic functions are the single place that convention is implemented — later tasks call them, they don't reimplement date/country formatting themselves.

- [ ] **Step 1: Write the failing tests for `format.js`**

`actuator/frontend/js/lib/format.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { formatDateTimeZ, formatDateOnlyZ, countryNameFor } from './format.js';

describe('formatDateTimeZ', () => {
  it('formats an ISO timestamp as DD-Mon-YYYY HH:MMZ', () => {
    expect(formatDateTimeZ('2026-08-18T06:00:00.000Z')).toBe('18-Aug-2026 06:00Z');
  });
  it('returns TBD for null', () => {
    expect(formatDateTimeZ(null)).toBe('TBD');
  });
});

describe('formatDateOnlyZ', () => {
  it('formats an ISO timestamp as DD-Mon-YYYY', () => {
    expect(formatDateOnlyZ('2026-08-18T06:00:00.000Z')).toBe('18-Aug-2026');
  });
  it('returns TBD for null', () => {
    expect(formatDateOnlyZ(null)).toBe('TBD');
  });
});

describe('countryNameFor', () => {
  const countries = [
    { name: 'Kenya', iso2: 'KE', region: 'East Africa', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: true, defaultEscalationContact: 'x@example.com' },
  ];
  it('resolves a known ISO2 code to its country name', () => {
    expect(countryNameFor('KE', countries)).toBe('Kenya');
  });
  it('falls back to the raw code for an unknown ISO2', () => {
    expect(countryNameFor('ZZ', countries)).toBe('ZZ');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- format` (from `actuator/frontend`)
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `format.js`**

```js
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatDateOnlyZ(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export function formatDateTimeZ(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return `${formatDateOnlyZ(iso)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
}

export function countryNameFor(iso2, countries) {
  const country = countries.find((c) => c.iso2 === iso2);
  return country ? country.name : iso2;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- format`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/format.js frontend/js/lib/format.test.js
git commit -m "Add date/time/country display-format conventions"
```

- [ ] **Step 6: Implement `nav.js`**

```js
export function mountNav() {
  const el = document.getElementById('app-nav');
  if (!el) return;
  el.innerHTML = `
    <nav class="app-nav">
      <a href="index.html">Action Board</a>
      <a href="trips.html">Trips</a>
      <a href="reference-airports.html">Reference Data</a>
    </nav>
  `;
}
```

- [ ] **Step 7: Implement `ui-helpers.js`**

```js
const URGENCY_CLASS = {
  OK: 'badge badge-ok',
  DUE: 'badge badge-due',
  URGENT: 'badge badge-urgent',
  BREACH: 'badge badge-breach',
};

export function urgencyBadgeHtml(urgency) {
  const cls = URGENCY_CLASS[urgency] || 'badge';
  return `<span class="${cls}" data-testid="urgency-badge">${escapeHtml(urgency)}</span>`;
}

export function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value === null || value === undefined ? '' : String(value);
  return div.innerHTML;
}
```

- [ ] **Step 8: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/nav.js frontend/js/pages/ui-helpers.js
git commit -m "Add shared nav bar and escapeHtml/urgencyBadgeHtml page helpers"
```

---

### Task 9: Action Board page

**Files:**
- Modify: `actuator/frontend/index.html` (replace placeholder from Task 1)
- Create: `actuator/frontend/js/pages/action-board.js`

**Interfaces:**
- Consumes: `store` (Task 7), `computeRequiredByZ`/`computeUrgency` (Task 2), `mountNav`/`escapeHtml`/`urgencyBadgeHtml` (Task 8).
- Produces: renders into `#action-board-table` on `index.html`. No exported functions — this is a page entry script.

- [ ] **Step 1: Replace `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trip Platform — Action Board</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1>Action Board</h1>
    <div id="action-board-table"></div>
  </main>
  <script type="module" src="js/pages/action-board.js"></script>
</body>
</html>
```

- [ ] **Step 2: Implement `action-board.js`**

```js
import { store } from '../lib/store.js';
import { computeRequiredByZ, computeUrgency } from '../lib/core-logic.js';
import { mountNav } from './nav.js';
import { urgencyBadgeHtml, escapeHtml } from './ui-helpers.js';

function render() {
  mountNav();
  const now = new Date().toISOString();
  const rows = store.state.services
    .filter((svc) => svc.status !== 'CONFIRMED' && svc.status !== 'CANCELLED' && svc.status !== 'NOT_REQUIRED')
    .map((svc) => {
      const rule = store.state.countryRules.find((r) => r.serviceType === svc.serviceType);
      const requiredByZ = rule ? computeRequiredByZ(svc.basedOnEtdZ, rule) : svc.basedOnEtdZ;
      const urgency = computeUrgency(requiredByZ, now);
      const trip = store.state.trips.find((t) => t.id === svc.tripId);
      return { svc, trip, requiredByZ, urgency };
    })
    .sort((a, b) => new Date(a.requiredByZ).getTime() - new Date(b.requiredByZ).getTime());

  document.getElementById('action-board-table').innerHTML = `
    <table>
      <thead><tr><th>Service</th><th>Trip</th><th>Type</th><th>Status</th><th>Required By (Z)</th><th>Urgency</th></tr></thead>
      <tbody>
        ${rows.map(({ svc, trip, requiredByZ, urgency }) => `
          <tr>
            <td>${escapeHtml(svc.id)}</td>
            <td>${trip ? `<a href="trip-sheet.html?id=${encodeURIComponent(trip.id)}">${escapeHtml(trip.tripCode)}</a>` : escapeHtml(svc.tripId)}</td>
            <td>${escapeHtml(svc.serviceType)}</td>
            <td>${escapeHtml(svc.status)}</td>
            <td>${escapeHtml(requiredByZ)}</td>
            <td>${urgencyBadgeHtml(urgency)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

store.subscribe(render);
render();
```

- [ ] **Step 3: Manually verify in the browser**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator/frontend"
npx http-server . -p 8080
```

Visit `http://localhost:8080/index.html`. Expected: a table listing every seeded service except `SVC-0041-01`/`SVC-0041-02` (both `CONFIRMED`), sorted by Required By, with `SVC-0041-04` showing `RECONFIRM_REQUIRED` and `SVC-0052-01` showing a Saudi overflight permit with `BREACH` or `URGENT` urgency depending on the current date.

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/index.html frontend/js/pages/action-board.js
git commit -m "Add Action Board page listing unconfirmed services by urgency"
```

---

### Task 10: Trips list page + filter logic

**Files:**
- Create: `actuator/frontend/js/lib/trips-filter.js`
- Test: `actuator/frontend/js/lib/trips-filter.test.js`
- Create: `actuator/frontend/trips.html`
- Create: `actuator/frontend/js/pages/trips-list.js`

**Interfaces:**
- Produces: `filterTrips(trips, searchQuery, statusFilter)` (pure, tested). `trips-list.js` renders into `#trips-table` and wires `#search-input`/`#status-filter`.

- [ ] **Step 1: Write the failing filter tests**

`actuator/frontend/js/lib/trips-filter.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { filterTrips } from './trips-filter.js';

const sample = [
  { id: '1', tripCode: 'T26-0001', clientOperator: 'Acacia', registration: '5H-AAA', status: 'DRAFT' },
  { id: '2', tripCode: 'T26-0002', clientOperator: 'Kilimanjaro Air', registration: '5H-BBB', status: 'CONFIRMED' },
];

describe('filterTrips', () => {
  it('matches by trip code, client, or registration, case-insensitively', () => {
    expect(filterTrips(sample, 'acacia', 'ALL').map((t) => t.id)).toEqual(['1']);
    expect(filterTrips(sample, '5H-BBB', 'ALL').map((t) => t.id)).toEqual(['2']);
  });
  it('filters by status', () => {
    expect(filterTrips(sample, '', 'CONFIRMED').map((t) => t.id)).toEqual(['2']);
  });
  it('returns everything for an empty query and ALL status', () => {
    expect(filterTrips(sample, '', 'ALL')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- trips-filter` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `trips-filter.js`**

```js
export function filterTrips(trips, searchQuery, statusFilter) {
  const q = (searchQuery || '').trim().toLowerCase();
  return trips.filter((t) => {
    const matchesQuery =
      q === '' ||
      t.tripCode.toLowerCase().includes(q) ||
      t.clientOperator.toLowerCase().includes(q) ||
      t.registration.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- trips-filter`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `trips.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trip Platform — Trips</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <h1>Trips</h1>
      <a class="btn btn-primary" href="trip-new.html">New Trip</a>
    </div>
    <div style="display:flex; gap:0.75rem; margin-bottom:1rem;">
      <input id="search-input" placeholder="Search by trip code, client, or registration" />
      <select id="status-filter">
        <option value="ALL">All statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="CANCELLED">Cancelled</option>
        <option value="COMPLETED">Completed</option>
      </select>
    </div>
    <div id="trips-table"></div>
  </main>
  <script type="module" src="js/pages/trips-list.js"></script>
</body>
</html>
```

- [ ] **Step 6: Implement `trips-list.js`**

```js
import { store } from '../lib/store.js';
import { filterTrips } from '../lib/trips-filter.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';

let searchQuery = '';
let statusFilter = 'ALL';

function render() {
  mountNav();
  const rows = filterTrips(store.state.trips, searchQuery, statusFilter);
  document.getElementById('trips-table').innerHTML = `
    <table>
      <thead><tr><th>Trip</th><th>Client</th><th>Registration</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map((t) => `
          <tr>
            <td><a href="trip-sheet.html?id=${encodeURIComponent(t.id)}">${escapeHtml(t.tripCode)}</a></td>
            <td>${escapeHtml(t.clientOperator)}</td>
            <td>${escapeHtml(t.registration)}</td>
            <td>${escapeHtml(t.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('search-input').addEventListener('input', (e) => { searchQuery = e.target.value; render(); });
document.getElementById('status-filter').addEventListener('change', (e) => { statusFilter = e.target.value; render(); });

store.subscribe(render);
render();
```

- [ ] **Step 7: Manually verify**

With the static server from Task 9 still running, visit `http://localhost:8080/trips.html`. Expected: both seeded trips listed; typing "acacia" in search narrows to 2608001; selecting "Confirmed" in the status dropdown also narrows to 2608001.

- [ ] **Step 8: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/trips-filter.js frontend/js/lib/trips-filter.test.js frontend/trips.html frontend/js/pages/trips-list.js
git commit -m "Add Trips list page with search/status filtering"
```

---

### Task 11: Trip Sheet shell + Route tab + live deadline rail

**Files:**
- Create: `actuator/frontend/trip-sheet.html`
- Create: `actuator/frontend/js/pages/trip-sheet.js`
- Create: `actuator/frontend/js/pages/trip-sheet-route.js`

**Interfaces:**
- Consumes: `store` (Task 7), `mountNav`/`escapeHtml` (Task 8), `formatDateTimeZ` (Task 8), `computeRequiredByZ`/`computeUrgency` (Task 2).
- Produces: `trip-sheet.js` reads `?id=` from `window.location.search`, renders the header (including the live deadline rail) + full 8-tab strip into `#trip-header`/`#trip-tabs` — **all 8 tab entries are defined here, upfront, in the spec's tab order** (Route, Permits, Services, Crew & Pax, Documents, Billing, Messages, History), not added incrementally one per task the way earlier drafts of this plan did — and delegates active-tab content to `#trip-tab-content` via `renderRouteTab(container, tripId)` (this task) and placeholder text for the other seven tabs until Tasks 12-19 fill in their branches.

- [ ] **Step 1: Create `trip-sheet.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trip Platform — Trip Sheet</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <div id="trip-header"></div>
    <div id="trip-tabs" style="border-bottom:1px solid #e2e8f0; margin-bottom:1rem;"></div>
    <div id="trip-tab-content"></div>
  </main>
  <script type="module" src="js/pages/trip-sheet.js"></script>
</body>
</html>
```

- [ ] **Step 2: Implement `trip-sheet-route.js`**

```js
import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';

let lastRebuildResult = null;

export function renderRouteTab(container, tripId) {
  const tripLegs = store.state.legs.filter((l) => l.tripId === tripId).sort((a, b) => a.sequence - b.sequence);
  const tripStops = store.state.stops.filter((s) => s.tripId === tripId);
  const reconfirmServices = store.state.services.filter((s) => s.tripId === tripId && s.status === 'RECONFIRM_REQUIRED');

  container.innerHTML = `
    <h2>Legs</h2>
    <table>
      <thead><tr><th>Call Sign</th><th>Route</th><th>ETD (Z)</th><th></th><th>ETA (Z)</th><th></th></tr></thead>
      <tbody>
        ${tripLegs.map((leg) => `
          <tr data-leg-id="${leg.id}">
            <td>${escapeHtml(leg.callSign)}</td>
            <td>${escapeHtml(leg.depIcao)} → ${escapeHtml(leg.arrIcao)}</td>
            <td>
              <div>${escapeHtml(formatDateTimeZ(leg.etdZ))}</div>
              <input type="datetime-local" class="etd-input" value="${leg.etdZ.slice(0, 16)}" aria-label="ETD ${leg.id}" />
            </td>
            <td><button class="btn save-etd-btn">Save</button></td>
            <td>
              ${leg.etaZ === null
                ? '<span class="banner-warning" style="padding:0.1rem 0.4rem;">TBD</span>'
                : `<div>${escapeHtml(formatDateTimeZ(leg.etaZ))}</div>`}
              <input type="datetime-local" class="eta-input" value="${leg.etaZ ? leg.etaZ.slice(0, 16) : ''}" aria-label="ETA ${leg.id}" />
            </td>
            <td><button class="btn save-eta-btn">Save</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${reconfirmServices.length > 0 ? `<p class="banner-warning">Re-confirm Required: ${reconfirmServices.map((s) => escapeHtml(s.id)).join(', ')}</p>` : ''}
    <h2>Stops</h2>
    <table>
      <thead><tr><th>ICAO</th><th>Purpose</th><th>Ground Time (h)</th></tr></thead>
      <tbody>
        ${tripStops.map((s) => `<tr><td>${escapeHtml(s.icao)}</td><td>${escapeHtml(s.purpose)}</td><td>${s.groundTimeHours ?? (s.arrZ === null ? 'TBD' : '—')}</td></tr>`).join('')}
      </tbody>
    </table>
    <button id="rebuild-stops-btn" class="btn">Rebuild Stops</button>
    ${lastRebuildResult ? `<p>Rebuild complete: ${lastRebuildResult.kept.length} kept, ${lastRebuildResult.added.length} added, ${lastRebuildResult.orphaned.length} orphaned.</p>` : ''}
  `;

  container.querySelectorAll('.save-etd-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const input = row.querySelector('.etd-input');
      store.updateLegEtd(row.dataset.legId, new Date(input.value).toISOString(), 'Current User');
    });
  });

  container.querySelectorAll('.save-eta-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const input = row.querySelector('.eta-input');
      // Empty input means still TBD — store null rather than an empty string.
      store.updateLegEta(row.dataset.legId, input.value ? new Date(input.value).toISOString() : null, 'Current User');
    });
  });

  document.getElementById('rebuild-stops-btn').addEventListener('click', () => {
    // rebuildStops() notifies subscribers (re-rendering this tab) before returning, so the
    // result is cached at module scope and read back on the next render per the store
    // re-render ordering convention — see Global Constraints.
    lastRebuildResult = store.rebuildStops(tripId, 'Current User');
  });
}
```

- [ ] **Step 3: Implement `trip-sheet.js`**

All 8 tabs are declared here, in order, from this task onward — later tasks (12-19) each replace their own placeholder branch in `renderTabContent`, they never touch the `TABS` array itself.

```js
import { store } from '../lib/store.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';
import { computeRequiredByZ, computeUrgency } from '../lib/core-logic.js';
import { renderRouteTab } from './trip-sheet-route.js';

const tripId = new URLSearchParams(window.location.search).get('id');
let activeTab = 'route';

const TABS = [
  { key: 'route', label: 'Route' },
  { key: 'permits', label: 'Permits' },
  { key: 'services', label: 'Services' },
  { key: 'crew-pax', label: 'Crew & Pax' },
  { key: 'documents', label: 'Documents' },
  { key: 'billing', label: 'Billing' },
  { key: 'messages', label: 'Messages' },
  { key: 'history', label: 'History' },
];

const PLACEHOLDER_TABS = new Set(['permits', 'services', 'crew-pax', 'documents', 'billing', 'messages', 'history']);

function renderHeader() {
  const trip = store.state.trips.find((t) => t.id === tripId);
  const headerEl = document.getElementById('trip-header');
  if (!trip) {
    headerEl.innerHTML = '<p>Trip not found.</p>';
    return;
  }
  headerEl.innerHTML = `
    <h1>${escapeHtml(trip.tripCode)} — ${escapeHtml(trip.clientOperator)}</h1>
    <p>Registration ${escapeHtml(trip.registration)} · Status ${escapeHtml(trip.status)}</p>
    <p>Notify: ${escapeHtml(trip.notifyRecipients.join(', ') || 'none set')}</p>
    <div id="deadline-rail"></div>
  `;
  renderDeadlineRail(trip);
}

function renderDeadlineRail(trip) {
  const rows = store.state.services
    .filter((s) => s.tripId === trip.id && !['CONFIRMED', 'CANCELLED', 'NOT_REQUIRED'].includes(s.status))
    .map((svc) => {
      const rule = store.state.countryRules.find((r) => r.serviceType === svc.serviceType);
      const requiredByZ = rule ? computeRequiredByZ(svc.basedOnEtdZ, rule) : svc.basedOnEtdZ;
      return { svc, requiredByZ, urgency: computeUrgency(requiredByZ, new Date().toISOString()) };
    })
    .sort((a, b) => new Date(a.requiredByZ).getTime() - new Date(b.requiredByZ).getTime());

  document.getElementById('deadline-rail').innerHTML = rows.length === 0
    ? '<p style="font-size:0.8rem; color:#64748b;">No pending deadlines.</p>'
    : `<div style="display:flex; gap:0.5rem; flex-wrap:wrap; font-size:0.75rem;">
        ${rows.map(({ svc, requiredByZ, urgency }) => `<span class="badge badge-${urgency.toLowerCase()}">${escapeHtml(svc.serviceType)} — ${escapeHtml(formatDateTimeZ(requiredByZ))}</span>`).join('')}
      </div>`;
}

function renderTabs() {
  document.getElementById('trip-tabs').innerHTML = TABS.map((t) =>
    `<button class="tab-btn ${activeTab === t.key ? 'tab-btn-active' : ''}" data-tab="${t.key}">${t.label}</button>`
  ).join('');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); });
  });
}

function renderTabContent() {
  const container = document.getElementById('trip-tab-content');
  if (activeTab === 'route') {
    renderRouteTab(container, tripId);
  } else if (PLACEHOLDER_TABS.has(activeTab)) {
    container.innerHTML = `<p>${escapeHtml(activeTab)} tab — implemented in a later task.</p>`;
  }
}

function render() {
  mountNav();
  renderHeader();
  renderTabs();
  renderTabContent();
}

store.subscribe(render);
render();
```

- [ ] **Step 4: Manually verify**

Visit `http://localhost:8080/trip-sheet.html?id=TRIP-0041`. Expected: header shows `2608001`; the deadline rail shows badges for every unconfirmed service on this trip, sorted by urgency; all 8 tab buttons render (Route active by default, the other 7 showing the placeholder text). Route tab lists 3 legs (each with its own Call Sign, and a formatted `18-Aug-2026 06:00Z`-style label next to each editable ETD/ETA input) and 4 stops; `LEG-0041-3`'s ETA column shows a "TBD" badge with an empty input, and the final HTDA stop shows "TBD" for ground time. Fill in `LEG-0041-3`'s ETA and click its Save — expected: the "TBD" badge disappears and the formatted label appears with the entered time (no Re-confirm banner, since services key off ETD, not ETA). Change `LEG-0041-2`'s ETD input to a time more than 4 hours later than its current value and click Save — expected: `SVC-0041-01`'s tolerance (2h) is exceeded, so the Re-confirm Required banner appears listing `SVC-0041-01`, and the deadline rail updates to include it. Click Rebuild Stops — expected: a "Rebuild complete" summary appears below the button.

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/trip-sheet.html frontend/js/pages/trip-sheet.js frontend/js/pages/trip-sheet-route.js
git commit -m "Add Trip Sheet shell (all 8 tabs, live deadline rail) with Route tab, leg-edit re-confirm, and Rebuild Stops"
```

---

### Task 12: Crew & Pax tab

**Files:**
- Create: `actuator/frontend/js/pages/trip-sheet-crew-pax.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Consumes: `store` (Task 7 — `store.state.persons`, `store.state.personRoles`, `store.addPerson`, `store.removePerson`), `escapeHtml` (Task 8).
- Produces: `renderCrewPaxTab(container, tripId)`.

No automated test for this task (DOM-rendering page module, per the plan's scope decision — verified manually).

- [ ] **Step 1: Implement `trip-sheet-crew-pax.js`**

```js
import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';

let addFormOpen = false;

export function renderCrewPaxTab(container, tripId) {
  const tripPersons = store.state.persons.filter((p) => p.tripId === tripId && !p.removed);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>Crew &amp; Pax</h2>
      <button id="add-person-btn" class="btn">Add Person</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Role</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${tripPersons.map((p) => {
          const role = store.state.personRoles.find((r) => r.id === p.roleId);
          return `
            <tr data-person-id="${p.id}">
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(role ? role.label : p.roleId)}</td>
              <td>${escapeHtml(p.notes || '')}</td>
              <td><button class="btn remove-person-btn">Remove</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    <div id="add-person-form"></div>
  `;

  container.querySelectorAll('.remove-person-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      store.removePerson(e.target.closest('tr').dataset.personId, 'Current User');
    });
  });

  document.getElementById('add-person-btn').addEventListener('click', () => {
    addFormOpen = true;
    renderAddForm(tripId);
  });

  if (addFormOpen) renderAddForm(tripId);
}

function renderAddForm(tripId) {
  const formEl = document.getElementById('add-person-form');
  // Deliberately not re-rendered on every keystroke (unlike the Service drawer's <select>-driven
  // re-renders elsewhere in this plan) — re-rendering a free-text <input> on 'input' resets its
  // cursor position on every character typed. Name/role are read directly from the DOM at
  // Add-click time instead.
  formEl.innerHTML = `
    <div class="drawer">
      <div class="field">
        <label for="person-name">Name</label>
        <input id="person-name" />
      </div>
      <div class="field">
        <label for="person-role">Role</label>
        <select id="person-role">
          <option value="">Select…</option>
          ${store.state.personRoles.map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}
        </select>
      </div>
      <button id="confirm-add-person-btn" class="btn btn-primary">Add</button>
      <button id="cancel-add-person-btn" class="btn">Cancel</button>
    </div>
  `;

  document.getElementById('cancel-add-person-btn').addEventListener('click', () => {
    addFormOpen = false;
    formEl.innerHTML = '';
  });
  document.getElementById('confirm-add-person-btn').addEventListener('click', () => {
    // UPPERCASE at capture, per the spec's display/input conventions.
    const name = document.getElementById('person-name').value.trim().toUpperCase();
    const roleId = document.getElementById('person-role').value;
    if (!name || !roleId) return;
    addFormOpen = false;
    store.addPerson({ tripId, name, roleId });
  });
}
```

- [ ] **Step 2: Wire into `trip-sheet.js`**

Add the import, and insert a new `else if` branch in `renderTabContent` (from Task 11) **before** the `PLACEHOLDER_TABS.has(activeTab)` fallback branch — every task from here on follows this same pattern: add one specific branch, leave the fallback in place for tabs not yet built:

```js
import { renderCrewPaxTab } from './trip-sheet-crew-pax.js';
```

```js
  } else if (activeTab === 'crew-pax') {
    renderCrewPaxTab(container, tripId);
```

- [ ] **Step 3: Manually verify**

On the Crew & Pax tab for TRIP-0041, expected: 5 seeded people (PIC, SIC, FA, Principal, Pax) with their role labels. Click Add Person, enter a name, pick "VIP", click Add — expected: the new person appears in the table, name shown UPPERCASE. Click Remove on it — expected: it disappears and a corresponding entry appears on the History tab once Task 15 wires that tab up.

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/trip-sheet-crew-pax.js frontend/js/pages/trip-sheet.js
git commit -m "Add Crew & Pax tab for trip-level Persons with configurable roles"
```

---

### Task 13: Permits tab + Services tab (shared component) + Cancel action

**Files:**
- Create: `actuator/frontend/js/lib/templates.js`
- Test: `actuator/frontend/js/lib/templates.test.js`
- Create: `actuator/frontend/js/pages/trip-sheet-service-group.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Consumes: `store` (Task 7), `getScopeCandidates`/`scopeTypeForServiceType` (Task 5), `computeRequiredByZ`/`computeUrgency` (Task 2), `formatDateTimeZ` (Task 8).
- Produces: `buildEmailDraft(service, trip, scopeLabel, provider, options)` in `templates.js`, returning `{ subject, body, token }` — `options.mode` is `'REQUEST'` (default) / `'REVISION'` / `'CANCEL'`; `options.previousBasedOnEtdZ`/`options.newBasedOnEtdZ` are only used in `'REVISION'` mode. `templates.js` is created here (not in Task 14) so the Cancel action below can use it without Task 13 depending on Task 14's Messages tab. `renderServiceGroupTab(container, tripId, { title, serviceTypes })` in `trip-sheet-service-group.js` — **one component, called twice**: once for the Permits tab (`serviceTypes: ['OVERFLIGHT_PERMIT', 'LANDING_PERMIT']`) and once for the Services tab (`serviceTypes: ['FUEL', 'HANDLING', 'CATERING', 'CREW_TRANSPORT', 'CUSTOMS']`) — per the spec, "Permits and Services share one underlying Services table and one Add-Service/Composer/Cancel mechanism; the tab split is presentation only, a type filter on the same data."

`templates.js` is built first, as pure framework-free logic with its own tests — matching this plan's convention that anything with real behavior lives in `js/lib/` and is unit-tested independent of the DOM.

- [ ] **Step 1: Write the failing template tests**

`actuator/frontend/js/lib/templates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildEmailDraft } from './templates.js';

const trip = { id: 'T1', tripCode: '2608001', clientOperator: 'Acacia', registration: '5HABC', ownerName: 'X', status: 'DRAFT', notifyRecipients: [], createdAtZ: '2026-01-01T00:00:00.000Z' };
const provider = { id: 'P1', name: 'EA Fuel', serviceType: 'FUEL', scopeIcao: 'HKJK', email: 'fuel@example.com', aogContact: '+1', workingHoursZ: '00:00-23:59' };
const fuelSvc = { id: 'SVC-1', tripId: 'T1', scopeType: 'STOP', scopeId: 'S1', serviceType: 'FUEL', providerId: 'P1', status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: null };

describe('buildEmailDraft — REQUEST mode (default)', () => {
  it('embeds the correlation token in the subject', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider);
    expect(draft.token).toBe('[2608001/SVC-1]');
    expect(draft.subject).toContain('[2608001/SVC-1]');
  });

  it('includes a numbered PENDING CONFIRMATION block naming the scope', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider);
    expect(draft.body).toContain('PENDING CONFIRMATION');
    expect(draft.body).toContain('HKJK');
    expect(draft.body).toContain(trip.registration);
  });
});

describe('buildEmailDraft — REVISION mode', () => {
  it('shows PREVIOUS ITINERARY against NEW ITINERARY and keeps the same token', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider, {
      mode: 'REVISION', previousBasedOnEtdZ: '2026-08-20T09:00:00.000Z', newBasedOnEtdZ: '2026-08-20T20:00:00.000Z',
    });
    expect(draft.token).toBe('[2608001/SVC-1]');
    expect(draft.body).toContain('PREVIOUS ITINERARY');
    expect(draft.body).toContain('2026-08-20T09:00:00.000Z');
    expect(draft.body).toContain('NEW ITINERARY');
    expect(draft.body).toContain('2026-08-20T20:00:00.000Z');
  });
});

describe('buildEmailDraft — CANCEL mode', () => {
  it('includes a CANCEL block naming the service and scope', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider, { mode: 'CANCEL' });
    expect(draft.subject).toContain('CANCEL');
    expect(draft.body).toContain('CANCEL');
    expect(draft.body).toContain('HKJK');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- templates` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `templates.js`**

```js
const SERVICE_TYPE_LABEL = {
  OVERFLIGHT_PERMIT: 'Overflight Permit',
  LANDING_PERMIT: 'Landing Permit',
  FUEL: 'Fuel',
  HANDLING: 'Handling',
  CATERING: 'Catering',
  CREW_TRANSPORT: 'Crew Transport',
  CUSTOMS: 'Customs',
};

function pendingConfirmationLine(service, scopeLabel) {
  switch (service.serviceType) {
    case 'OVERFLIGHT_PERMIT':
    case 'LANDING_PERMIT':
      return `PLEASE ASSIST WITH THE ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()} FOR ${scopeLabel}.`;
    case 'FUEL':
      return `PLEASE ARRANGE FUEL UPLIFT AT ${scopeLabel}. CONFIRM INTO-PLANE AGENT AND QUANTITY.`;
    case 'HANDLING':
      return `PLEASE ARRANGE HANDLING AT ${scopeLabel}.`;
    case 'CATERING':
      return `PLEASE ARRANGE CATERING AT ${scopeLabel}.`;
    case 'CREW_TRANSPORT':
      return `PLEASE ARRANGE CREW TRANSPORT AT ${scopeLabel}.`;
    case 'CUSTOMS':
      return `PLEASE ASSIST WITH CUSTOMS AT ${scopeLabel}.`;
    default:
      return `PLEASE CONFIRM ${SERVICE_TYPE_LABEL[service.serviceType]}.`;
  }
}

function referenceBlock(trip) {
  return [`REF: ${trip.tripCode}`, `     REGISTRY ${trip.registration}`].join('\n');
}

function buildRequestBody(service, scopeLabel) {
  return [
    'PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:',
    '',
    'PENDING CONFIRMATION',
    `   1. ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()}:`,
    `      ${pendingConfirmationLine(service, scopeLabel)}`,
    '',
    'PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE.',
  ].join('\n');
}

function buildRevisionBody(service, scopeLabel, previousBasedOnEtdZ, newBasedOnEtdZ) {
  return [
    'PREVIOUS ITINERARY:',
    `   ETD ${previousBasedOnEtdZ}`,
    '',
    'NEW ITINERARY:',
    `   ETD ${newBasedOnEtdZ}`,
    '',
    'PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:',
    '',
    'CHANGES',
    '   1. ITINERARY HAS CHANGED TO THE ABOVE.',
    '',
    'PENDING CONFIRMATION',
    `   1. ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()}:`,
    `      PLEASE RECONFIRM — ${pendingConfirmationLine(service, scopeLabel)}`,
    '',
    'PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE.',
  ].join('\n');
}

function buildCancelBody(service, scopeLabel) {
  return [
    'PLEASE CANCEL THE FOLLOWING:',
    '',
    'CANCEL',
    `   1. ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()} AT ${scopeLabel}.`,
    '',
    'PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE.',
  ].join('\n');
}

export function buildEmailDraft(service, trip, scopeLabel, provider, options = {}) {
  const mode = options.mode || 'REQUEST';
  const token = `[${trip.tripCode}/${service.id}]`;
  const subjectPrefix = mode === 'CANCEL' ? 'CANCEL' : mode === 'REVISION' ? 'REVISION' : SERVICE_TYPE_LABEL[service.serviceType];
  const subject = `${subjectPrefix} — ${trip.registration} ${token}`;

  let body;
  if (mode === 'CANCEL') {
    body = buildCancelBody(service, scopeLabel);
  } else if (mode === 'REVISION') {
    body = buildRevisionBody(service, scopeLabel, options.previousBasedOnEtdZ, options.newBasedOnEtdZ);
  } else {
    body = buildRequestBody(service, scopeLabel);
  }

  return { subject, body: `${referenceBlock(trip)}\n\n${body}`, token };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- templates`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `trip-sheet-service-group.js`**

```js
import { store } from '../lib/store.js';
import { getScopeCandidates, scopeTypeForServiceType } from '../lib/scope.js';
import { computeRequiredByZ, computeUrgency } from '../lib/core-logic.js';
import { buildEmailDraft } from '../lib/templates.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';

let drawerOpen = false;
let drawerServiceType = null;
let drawerScopeId = '';
let cancelServiceId = null;

// Duplicated (in spirit) by trip-sheet-messages.js in Task 14 — each tab resolves scope labels
// independently since there's no shared page-level helpers file in this plan's structure.
function scopeLabelFor(scopeType, scopeId, legs, stops) {
  if (scopeType === 'LEG') {
    const leg = legs.find((l) => l.id === scopeId);
    return leg ? `${leg.depIcao} → ${leg.arrIcao}` : scopeId;
  }
  if (scopeType === 'STOP') {
    const stop = stops.find((s) => s.id === scopeId);
    return stop ? stop.icao : scopeId;
  }
  const [legId, iso2] = scopeId.split(':');
  const leg = legs.find((l) => l.id === legId);
  return leg ? `${leg.depIcao} → ${leg.arrIcao} (${iso2})` : scopeId;
}

export function renderServiceGroupTab(container, tripId, { title, serviceTypes }) {
  // Guard against drawer state left over from the OTHER tab that shares this module (Permits vs
  // Services) — if the open drawer's service type isn't valid for this call's group, reset it.
  if (drawerOpen && !serviceTypes.includes(drawerServiceType)) {
    drawerServiceType = serviceTypes[0];
    drawerScopeId = '';
  }
  if (drawerServiceType === null) drawerServiceType = serviceTypes[0];

  const tripServices = store.state.services.filter((s) => s.tripId === tripId && serviceTypes.includes(s.serviceType));

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>${escapeHtml(title)}</h2>
      <button id="add-service-btn" class="btn">Add ${escapeHtml(title.replace(/s$/, ''))}</button>
    </div>
    <table>
      <thead><tr><th>Service</th><th>Type</th><th>Scope</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${tripServices.map((s) => `
          <tr data-service-id="${s.id}">
            <td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.serviceType)}</td>
            <td>${escapeHtml(s.scopeType)} ${escapeHtml(s.scopeId)}</td><td>${escapeHtml(s.status)}</td>
            <td>${s.status === 'CANCELLED' ? '' : '<button class="btn cancel-service-btn">Cancel</button>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div id="service-drawer"></div>
    <div id="cancel-drawer"></div>
  `;

  document.getElementById('add-service-btn').addEventListener('click', () => {
    drawerOpen = true;
    renderDrawer(tripId, serviceTypes);
  });

  container.querySelectorAll('.cancel-service-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      cancelServiceId = e.target.closest('tr').dataset.serviceId;
      renderCancelDrawer(tripId);
    });
  });

  if (drawerOpen) renderDrawer(tripId, serviceTypes);
  if (cancelServiceId) renderCancelDrawer(tripId);
}

function renderCancelDrawer(tripId) {
  const drawerEl = document.getElementById('cancel-drawer');
  const service = store.state.services.find((s) => s.id === cancelServiceId);
  const trip = store.state.trips.find((t) => t.id === tripId);
  const provider = store.state.providers.find((p) => p.id === service.providerId);
  const tripLegs = store.state.legs.filter((l) => l.tripId === tripId);
  const tripStops = store.state.stops.filter((s) => s.tripId === tripId);
  const scopeLabel = scopeLabelFor(service.scopeType, service.scopeId, tripLegs, tripStops);
  const draft = buildEmailDraft(service, trip, scopeLabel, provider, { mode: 'CANCEL' });

  drawerEl.innerHTML = `
    <div class="drawer">
      <h3>Cancel ${escapeHtml(service.id)}</h3>
      <p style="white-space:pre-wrap; font-size:0.8rem; background:#fff; border:1px solid #e2e8f0; padding:0.5rem;">${escapeHtml(draft.subject)}\n\n${escapeHtml(draft.body)}</p>
      <button id="confirm-cancel-btn" class="btn btn-primary">Send Cancellation</button>
      <button id="dismiss-cancel-btn" class="btn">Back</button>
    </div>
  `;

  document.getElementById('dismiss-cancel-btn').addEventListener('click', () => {
    cancelServiceId = null;
    drawerEl.innerHTML = '';
  });
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    const commPayload = {
      tripId, serviceId: service.id, direction: 'OUT', kind: 'CANCEL', token: draft.token,
      from: 'ops@insider.co.tz', to: provider ? [provider.email] : [], subject: draft.subject, body: draft.body,
    };
    cancelServiceId = null;
    store.addComm(commPayload);
    store.updateServiceStatus(service.id, 'CANCELLED', 'Current User');
  });
}

function resolveBasedOnEtdZ(serviceType, scopeId, legs, stops) {
  if (!scopeId) return null;
  const scopeType = scopeTypeForServiceType(serviceType);
  if (scopeType === 'LEG') {
    const leg = legs.find((l) => l.id === scopeId);
    return leg ? leg.etdZ : null;
  }
  if (scopeType === 'SEGMENT') {
    const [legId] = scopeId.split(':');
    const leg = legs.find((l) => l.id === legId);
    return leg ? leg.etdZ : null;
  }
  const stop = stops.find((s) => s.id === scopeId);
  return stop ? (stop.depZ || stop.arrZ) : null;
}

function renderDrawer(tripId, serviceTypes) {
  const drawerEl = document.getElementById('service-drawer');
  const tripLegs = store.state.legs.filter((l) => l.tripId === tripId);
  const tripStops = store.state.stops.filter((s) => s.tripId === tripId);
  const candidates = getScopeCandidates(drawerServiceType, tripLegs, tripStops);
  const basedOnEtdZ = resolveBasedOnEtdZ(drawerServiceType, drawerScopeId, tripLegs, tripStops);
  const rule = store.state.countryRules.find((r) => r.serviceType === drawerServiceType);

  let preview = null;
  if (basedOnEtdZ && rule) {
    const requiredByZ = computeRequiredByZ(basedOnEtdZ, rule);
    preview = { requiredByZ, urgency: computeUrgency(requiredByZ, new Date().toISOString()) };
  }

  drawerEl.innerHTML = `
    <div class="drawer">
      <h3>Add Service</h3>
      <div class="field">
        <label for="service-type-select">Service Type</label>
        <select id="service-type-select">
          ${serviceTypes.map((st) => `<option value="${st}" ${st === drawerServiceType ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="scope-select">Scope</label>
        <select id="scope-select">
          <option value="">Select…</option>
          ${candidates.map((c) => `<option value="${c.scopeId}" ${c.scopeId === drawerScopeId ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      ${preview ? `<p data-testid="required-by-preview">Required by ${escapeHtml(formatDateTimeZ(preview.requiredByZ))} — <strong>${preview.urgency}</strong></p>` : ''}
      <button id="confirm-add-service-btn" class="btn btn-primary" ${drawerScopeId ? '' : 'disabled'}>Add Service</button>
      <button id="cancel-add-service-btn" class="btn">Close</button>
    </div>
  `;

  document.getElementById('service-type-select').addEventListener('change', (e) => {
    drawerServiceType = e.target.value;
    drawerScopeId = '';
    renderDrawer(tripId, serviceTypes);
  });
  document.getElementById('scope-select').addEventListener('change', (e) => {
    drawerScopeId = e.target.value;
    renderDrawer(tripId, serviceTypes);
  });
  document.getElementById('cancel-add-service-btn').addEventListener('click', () => {
    drawerOpen = false;
    drawerScopeId = '';
    drawerEl.innerHTML = '';
  });
  document.getElementById('confirm-add-service-btn').addEventListener('click', () => {
    if (!drawerScopeId || !basedOnEtdZ) return;
    const defaultProvider = store.state.providers.find((p) => p.serviceType === drawerServiceType);
    const newService = {
      tripId, scopeType: scopeTypeForServiceType(drawerServiceType), scopeId: drawerScopeId,
      serviceType: drawerServiceType, providerId: defaultProvider ? defaultProvider.id : null,
      status: 'NOT_STARTED', refNumber: null, basedOnEtdZ, assignedTo: null,
    };
    // Local drawer state is closed BEFORE calling the store mutator, per the store
    // re-render ordering convention: addService() re-renders this tab synchronously,
    // so drawerOpen must already reflect "closed" by the time that render runs.
    drawerOpen = false;
    drawerScopeId = '';
    store.addService(newService);
  });
}
```

- [ ] **Step 6: Wire into `trip-sheet.js`**

Add the import, and insert the `permits`/`services` branches in `renderTabContent`, both calling the same component with different `serviceTypes`:

```js
import { renderServiceGroupTab } from './trip-sheet-service-group.js';
```

```js
  } else if (activeTab === 'permits') {
    renderServiceGroupTab(container, tripId, { title: 'Permits', serviceTypes: ['OVERFLIGHT_PERMIT', 'LANDING_PERMIT'] });
  } else if (activeTab === 'services') {
    renderServiceGroupTab(container, tripId, { title: 'Services', serviceTypes: ['FUEL', 'HANDLING', 'CATERING', 'CREW_TRANSPORT', 'CUSTOMS'] });
```

- [ ] **Step 7: Manually verify**

Visit `http://localhost:8080/trip-sheet.html?id=TRIP-0041`, click the Permits tab — expected: `SVC-0041-03`, `SVC-0041-04`, `SVC-0041-05` listed (the three permit-type services), none of the STOP-scoped ones. Click the Services tab — expected: `SVC-0041-01`, `SVC-0041-02` listed instead. On Services, click Add Service, select Service Type "FUEL" — expected: the Scope dropdown only offers `STOP-0041-HKJK` (not any leg or segment options, and the Service Type dropdown itself only offers the 5 non-permit types — no Overflight/Landing Permit options here). Select it — expected: a Required By / Urgency preview appears in the formatted `DD-Mon-YYYY HH:MM`Z style. Click Add Service — expected: the drawer closes and the new service row appears in the table above with status `NOT_STARTED`. Switch to Permits, click Add Service — expected: the Service Type dropdown now only offers the 2 permit types (confirms the drawer-state guard resets correctly across tabs). Back on Services, click Cancel on `SVC-0041-05`... — wait, `SVC-0041-05` is a permit type (OVERFLIGHT_PERMIT), so click Cancel on it from the **Permits** tab instead — expected: a cancellation preview appears showing a `CANCEL` block naming the service and its scope; click Send Cancellation — expected: the row's status becomes `CANCELLED` and its Cancel button disappears.

- [ ] **Step 8: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/templates.js frontend/js/lib/templates.test.js frontend/js/pages/trip-sheet-service-group.js frontend/js/pages/trip-sheet.js
git commit -m "Add Permits and Services tabs (shared component), type-driven Add Service drawer, and Cancel action"
```

---

### Task 14: Composer drawer + Messages tab

**Files:**
- Create: `actuator/frontend/js/pages/trip-sheet-messages.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Consumes: `buildEmailDraft` from `templates.js` (already built and tested in Task 13 — not recreated here), `formatDateTimeZ` (Task 8).
- Produces: `renderMessagesTab(container, tripId)`.

- [ ] **Step 1: Implement `trip-sheet-messages.js`**

```js
import { store } from '../lib/store.js';
import { buildEmailDraft } from '../lib/templates.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';

let composerServiceId = null;
let draftSubject = '';
let draftBody = '';

function scopeLabelFor(scopeType, scopeId) {
  if (scopeType === 'LEG') {
    const leg = store.state.legs.find((l) => l.id === scopeId);
    return leg ? `${leg.depIcao} → ${leg.arrIcao}` : scopeId;
  }
  if (scopeType === 'STOP') {
    const stop = store.state.stops.find((s) => s.id === scopeId);
    return stop ? stop.icao : scopeId;
  }
  const [legId, iso2] = scopeId.split(':');
  const leg = store.state.legs.find((l) => l.id === legId);
  return leg ? `${leg.depIcao} → ${leg.arrIcao} (${iso2})` : scopeId;
}

export function renderMessagesTab(container, tripId) {
  const tripComms = store.state.comms.filter((c) => c.tripId === tripId).sort((a, b) => a.timestampZ.localeCompare(b.timestampZ));
  const tripServices = store.state.services.filter((s) => s.tripId === tripId);

  container.innerHTML = `
    <h2>Messages</h2>
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
      ${tripServices.map((s) => `<button class="btn compose-btn" data-service-id="${s.id}">Compose for ${escapeHtml(s.id)}</button>`).join('')}
    </div>
    <ul style="list-style:none; padding:0;">
      ${tripComms.map((c) => `
        <li class="drawer">
          <p><strong>${escapeHtml(c.subject)}</strong></p>
          <p style="font-size:0.75rem; color:#64748b;">${escapeHtml(c.direction)} · ${escapeHtml(c.kind)} · ${escapeHtml(formatDateTimeZ(c.timestampZ))}</p>
          <p>${escapeHtml(c.body)}</p>
        </li>
      `).join('')}
    </ul>
    <div id="composer-drawer"></div>
  `;

  container.querySelectorAll('.compose-btn').forEach((btn) => {
    btn.addEventListener('click', () => openComposer(btn.dataset.serviceId, tripId));
  });

  if (composerServiceId) renderComposer(tripId);
}

function currentEtdZFor(scopeType, scopeId) {
  if (scopeType === 'LEG') {
    const leg = store.state.legs.find((l) => l.id === scopeId);
    return leg ? leg.etdZ : null;
  }
  if (scopeType === 'SEGMENT') {
    const [legId] = scopeId.split(':');
    const leg = store.state.legs.find((l) => l.id === legId);
    return leg ? leg.etdZ : null;
  }
  const stop = store.state.stops.find((s) => s.id === scopeId);
  return stop ? (stop.depZ || stop.arrZ) : null;
}

function openComposer(serviceId, tripId) {
  const service = store.state.services.find((s) => s.id === serviceId);
  const trip = store.state.trips.find((t) => t.id === tripId);
  const provider = store.state.providers.find((p) => p.id === service.providerId);
  const scopeLabel = scopeLabelFor(service.scopeType, service.scopeId);

  // A service that flipped to Re-confirm Required reopens in REVISION mode, showing the
  // provider exactly what moved — same correlation token, threading into the same conversation.
  // (store.js's updateLegEtd cascade can flip LEG/SEGMENT/STOP-scoped services alike, so all
  // three are handled here via currentEtdZFor rather than excluding any one of them.)
  const isRevision = service.status === 'RECONFIRM_REQUIRED';
  const draft = isRevision
    ? buildEmailDraft(service, trip, scopeLabel, provider, {
        mode: 'REVISION',
        previousBasedOnEtdZ: service.basedOnEtdZ,
        newBasedOnEtdZ: currentEtdZFor(service.scopeType, service.scopeId),
      })
    : buildEmailDraft(service, trip, scopeLabel, provider);

  composerServiceId = serviceId;
  draftSubject = draft.subject;
  draftBody = draft.body;
  renderComposer(tripId);
}

function renderComposer(tripId) {
  const drawerEl = document.getElementById('composer-drawer');
  if (!drawerEl) return;
  const service = store.state.services.find((s) => s.id === composerServiceId);

  drawerEl.innerHTML = `
    <div class="drawer">
      <h3>Composer — ${escapeHtml(service.id)}</h3>
      <div class="field"><label for="composer-subject">Subject</label><input id="composer-subject" value="${escapeHtml(draftSubject)}" /></div>
      <div class="field"><label for="composer-body">Body</label><textarea id="composer-body" rows="5">${escapeHtml(draftBody)}</textarea></div>
      <button id="send-btn" class="btn btn-primary">Send</button>
      <button id="cancel-composer-btn" class="btn">Close</button>
    </div>
  `;

  document.getElementById('composer-subject').addEventListener('input', (e) => { draftSubject = e.target.value; });
  document.getElementById('composer-body').addEventListener('input', (e) => { draftBody = e.target.value; });
  document.getElementById('cancel-composer-btn').addEventListener('click', () => {
    composerServiceId = null;
    drawerEl.innerHTML = '';
  });
  document.getElementById('send-btn').addEventListener('click', () => {
    const trip = store.state.trips.find((t) => t.id === tripId);
    const provider = store.state.providers.find((p) => p.id === service.providerId);
    const commPayload = {
      tripId, serviceId: service.id, direction: 'OUT', kind: 'REQUEST', token: `[${trip.tripCode}/${service.id}]`,
      from: 'ops@insider.co.tz', to: provider ? [provider.email] : [], subject: draftSubject, body: draftBody,
    };
    // Close the composer locally BEFORE mutating the store, per the store re-render
    // ordering convention (addComm/updateServiceStatus re-render this tab synchronously).
    composerServiceId = null;
    store.addComm(commPayload);
    store.updateServiceStatus(service.id, 'REQUESTED', 'Current User');
  });
}
```

- [ ] **Step 2: Wire into `trip-sheet.js`**

Add the import and branch (before the `PLACEHOLDER_TABS` fallback):

```js
import { renderMessagesTab } from './trip-sheet-messages.js';
```

```js
  } else if (activeTab === 'messages') {
    renderMessagesTab(container, tripId);
```

- [ ] **Step 3: Manually verify**

On the Messages tab for TRIP-0041, click "Compose for SVC-0041-05" — expected: subject pre-fills with `[2608001/SVC-0041-05]` and a REQUEST-mode body. Click Send — expected: the composer closes, a new outbound entry appears in the message list, and switching to the Permits tab shows `SVC-0041-05` now `REQUESTED`. Now click "Compose for SVC-0041-04" (seeded `RECONFIRM_REQUIRED`, `LEG` scope) — expected: the body shows `PREVIOUS ITINERARY` (`2026-08-20T01:00:00.000Z`, from its `basedOnEtdZ`) against `NEW ITINERARY` (LEG-0041-2's current ETD).

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/trip-sheet-messages.js frontend/js/pages/trip-sheet.js
git commit -m "Add Composer drawer with REQUEST/REVISION modes and correlation token, plus Messages tab"
```

---

### Task 15: History tab

**Files:**
- Create: `actuator/frontend/js/pages/trip-sheet-history.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Consumes: `formatDateTimeZ` (Task 8).
- Produces: `renderHistoryTab(container, tripId)`.

- [ ] **Step 1: Implement `trip-sheet-history.js`**

```js
import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';

export function renderHistoryTab(container, tripId) {
  const tripRecordIds = new Set([
    tripId,
    ...store.state.legs.filter((l) => l.tripId === tripId).map((l) => l.id),
    ...store.state.stops.filter((s) => s.tripId === tripId).map((s) => s.id),
    ...store.state.services.filter((s) => s.tripId === tripId).map((s) => s.id),
    // Includes soft-deleted persons too (not filtered by `removed`) — a removed person's
    // audit entry must stay visible in this trip's history.
    ...store.state.persons.filter((p) => p.tripId === tripId).map((p) => p.id),
    // Documents/Billing (Tasks 18-19) also audit under this trip's recordId set.
    ...store.state.documents.filter((d) => d.tripId === tripId).map((d) => d.id),
    ...store.state.billing.filter((b) => b.tripId === tripId).map((b) => b.id),
  ]);
  const entries = store.state.audit.filter((a) => tripRecordIds.has(a.recordId)).sort((a, b) => b.timestampZ.localeCompare(a.timestampZ));

  container.innerHTML = `
    <h2>History</h2>
    <table>
      <thead><tr><th>When</th><th>Who</th><th>Record</th><th>Field</th><th>Change</th></tr></thead>
      <tbody>
        ${entries.map((a) => `
          <tr>
            <td>${escapeHtml(formatDateTimeZ(a.timestampZ))}</td><td>${escapeHtml(a.user)}</td>
            <td>${escapeHtml(a.table)} ${escapeHtml(a.recordId)}</td><td>${escapeHtml(a.field)}</td>
            <td>${escapeHtml(a.oldValue)} → ${escapeHtml(a.newValue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
```

- [ ] **Step 2: Wire into `trip-sheet.js`**

```js
import { renderHistoryTab } from './trip-sheet-history.js';
```

```js
  } else if (activeTab === 'history') {
    renderHistoryTab(container, tripId);
```

The `PLACEHOLDER_TABS` fallback in `renderTabContent` (from Task 11) stays in place after this — `documents` and `billing` are still unbuilt at this point (Tasks 18-19) and still need it.

- [ ] **Step 3: Manually verify**

On the History tab for TRIP-0041, expected: entries for `LEG-0041-2`'s ETD change and `SVC-0041-04`'s flip to `RECONFIRM_REQUIRED` from the seed data, plus any new entries created by Tasks 12/13's manual verification (the crew/pax add/remove, the added service, the sent message/status change, the Cancel action) — including the removed Crew & Pax person, even though they no longer appear on that tab itself — newest first.

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/trip-sheet-history.js frontend/js/pages/trip-sheet.js
git commit -m "Add History tab showing field-level audit trail per trip"
```

---

### Task 16: Trip creation wizard

**Files:**
- Create: `actuator/frontend/trip-new.html`
- Create: `actuator/frontend/js/pages/trip-wizard.js`

**Interfaces:**
- Consumes: `store` (Task 7), `deriveStopsFromLegs` (Task 6), `escapeHtml` (Task 8).
- Produces: a 3-step page-local wizard that, on confirm, calls `store.addTrip`, `store.addLeg` (repeated), `store.addStops`, then navigates to `trip-sheet.html?id=<newId>`.

This page does not call `store.subscribe` — it's a self-contained form that navigates away immediately after its own store calls, so there's nothing for it to react to.

- [ ] **Step 1: Create `trip-new.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Trip Platform — New Trip</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1>New Trip</h1>
    <div id="wizard-container"></div>
  </main>
  <script type="module" src="js/pages/trip-wizard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Implement `trip-wizard.js`**

```js
import { store } from '../lib/store.js';
import { deriveStopsFromLegs } from '../lib/stops.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';

mountNav();

let step = 1;
const header = { clientOperator: '', registration: '', ownerName: '' };
let draftLegs = [{ callSign: '', depIcao: '', arrIcao: '', etdZ: '', etaZ: '', overflightCountries: [] }];

// Trip codes are auto-generated (numeric YYMMNNN, per the spec's display/input conventions),
// never user-entered — sequence number is 1-based within the current UTC year+month, counted
// against trips already in the store.
function generateTripCode(existingTrips) {
  const now = new Date();
  const prefix = `${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const countThisMonth = existingTrips.filter((t) => t.tripCode.startsWith(prefix)).length;
  return `${prefix}${String(countThisMonth + 1).padStart(3, '0')}`;
}

function render() {
  const container = document.getElementById('wizard-container');

  if (step === 1) {
    container.innerHTML = `
      <div class="field"><label for="clientOperator">Client/Operator</label><input id="clientOperator" value="${escapeHtml(header.clientOperator)}" /></div>
      <div class="field"><label for="registration">Registration (no dashes)</label><input id="registration" value="${escapeHtml(header.registration)}" /></div>
      <div class="field"><label for="ownerName">Owner</label><input id="ownerName" value="${escapeHtml(header.ownerName)}" /></div>
      <button id="next-to-legs" class="btn btn-primary">Next: Legs</button>
    `;
    document.getElementById('clientOperator').addEventListener('input', (e) => { header.clientOperator = e.target.value.toUpperCase(); });
    document.getElementById('ownerName').addEventListener('input', (e) => { header.ownerName = e.target.value.toUpperCase(); });
    // No-dash convention enforced here, not just uppercased — a pasted "5H-ABC" becomes "5HABC".
    document.getElementById('registration').addEventListener('input', (e) => { header.registration = e.target.value.toUpperCase().replace(/-/g, ''); });
    document.getElementById('next-to-legs').addEventListener('click', () => { step = 2; render(); });
    return;
  }

  if (step === 2) {
    container.innerHTML = `
      ${draftLegs.map((leg, i) => `
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:0.5rem;">
          <div class="field"><label for="callsign-${i}">Call Sign</label><input id="callsign-${i}" value="${escapeHtml(leg.callSign)}" /></div>
          <div class="field"><label for="dep-${i}">Dep ICAO</label><input id="dep-${i}" value="${escapeHtml(leg.depIcao)}" /></div>
          <div class="field"><label for="arr-${i}">Arr ICAO</label><input id="arr-${i}" value="${escapeHtml(leg.arrIcao)}" /></div>
          <div class="field"><label for="overflight-${i}">Overflight Countries (ISO2, comma-separated)</label><input id="overflight-${i}" value="${escapeHtml(leg.overflightCountries.join(', '))}" placeholder="e.g. ET, KE" /></div>
          <div class="field"><label for="etd-${i}">ETD (Z)</label><input id="etd-${i}" type="datetime-local" value="${leg.etdZ}" /></div>
          <div class="field"><label for="eta-${i}">ETA (Z) — leave blank for TBD</label><input id="eta-${i}" type="datetime-local" value="${leg.etaZ}" /></div>
        </div>
      `).join('')}
      <button id="add-leg-row" class="btn">Add another leg</button>
      <div><button id="review-stops-btn" class="btn btn-primary">Review Stops</button></div>
    `;
    draftLegs.forEach((_, i) => {
      document.getElementById(`callsign-${i}`).addEventListener('input', (e) => { draftLegs[i].callSign = e.target.value.toUpperCase(); });
      document.getElementById(`dep-${i}`).addEventListener('input', (e) => { draftLegs[i].depIcao = e.target.value.toUpperCase(); });
      document.getElementById(`arr-${i}`).addEventListener('input', (e) => { draftLegs[i].arrIcao = e.target.value.toUpperCase(); });
      document.getElementById(`overflight-${i}`).addEventListener('input', (e) => {
        draftLegs[i].overflightCountries = e.target.value.split(',').map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0);
      });
      document.getElementById(`etd-${i}`).addEventListener('input', (e) => { draftLegs[i].etdZ = e.target.value; });
      document.getElementById(`eta-${i}`).addEventListener('input', (e) => { draftLegs[i].etaZ = e.target.value; });
    });
    document.getElementById('add-leg-row').addEventListener('click', () => {
      draftLegs.push({ callSign: '', depIcao: '', arrIcao: '', etdZ: '', etaZ: '', overflightCountries: [] });
      render();
    });
    document.getElementById('review-stops-btn').addEventListener('click', () => { step = 3; render(); });
    return;
  }

  // ETA is optional at this step (TBD) — only depIcao/arrIcao/etdZ/callSign are required to preview a leg.
  const previewLegs = draftLegs
    .filter((l) => l.callSign && l.depIcao && l.arrIcao && l.etdZ)
    .map((l, i) => ({ ...l, id: `preview-${i}`, tripId: 'preview', sequence: i + 1, revision: 0, etdZ: new Date(l.etdZ).toISOString(), etaZ: l.etaZ ? new Date(l.etaZ).toISOString() : null }));
  const previewStops = deriveStopsFromLegs('preview', previewLegs);

  container.innerHTML = `
    <h3>Derived Stops</h3>
    <ul>${previewStops.map((s) => `<li>${escapeHtml(s.icao)} — ${escapeHtml(s.purpose)}${s.arrZ === null && s.depZ !== null ? ' (arrival TBD)' : ''}</li>`).join('')}</ul>
    <button id="confirm-trip-btn" class="btn btn-primary">Confirm Trip</button>
  `;
  document.getElementById('confirm-trip-btn').addEventListener('click', () => {
    const tripCode = generateTripCode(store.state.trips);
    const trip = store.addTrip({ ...header, tripCode, status: 'DRAFT', notifyRecipients: [] });
    const createdLegs = draftLegs.map((l, i) => store.addLeg({
      tripId: trip.id, sequence: i + 1, callSign: l.callSign, depIcao: l.depIcao, arrIcao: l.arrIcao,
      etdZ: new Date(l.etdZ).toISOString(), etaZ: l.etaZ ? new Date(l.etaZ).toISOString() : null,
      overflightCountries: l.overflightCountries,
    }));
    store.addStops(deriveStopsFromLegs(trip.id, createdLegs));
    window.location.href = `trip-sheet.html?id=${encodeURIComponent(trip.id)}`;
  });
}

render();
```

- [ ] **Step 3: Manually verify**

Visit `http://localhost:8080/trip-new.html`. Fill in header fields (note there's no Trip Code field — it's auto-generated on confirm), type a registration with a dash (e.g. `5H-XYZ`) and confirm it displays back as `5HXYZ`. Click Next: Legs, enter Call Sign `TST001`, `HTDA` → `HKJK` with an ETD a few hours before an ETA, click Review Stops — expected: derived stops list shows `HTDA — TURNAROUND` and `HKJK — TURNAROUND`. Click Confirm Trip — expected: the browser navigates to the new trip's Trip Sheet, its header shows a numeric `YYMMNNN` trip code (the two-digit current year + two-digit current month, e.g. `2608` for August 2026 + a sequence number one higher than however many seeded/created trips already carry that same year-month prefix — `003` if run in the same year-month as the two seed trips, otherwise `001`), and its Route tab shows the entered leg with its Call Sign. Repeat leaving the ETA field blank — expected: the stop-review list shows "(arrival TBD)" and the resulting leg's Route row shows the TBD badge.

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/trip-new.html frontend/js/pages/trip-wizard.js
git commit -m "Add trip creation wizard (header, legs, derived-stops review)"
```

---

### Task 17: Reference Data pages

**Files:**
- Create: `actuator/frontend/js/pages/reference.js`
- Create: `actuator/frontend/reference-airports.html`, `reference-aircraft.html`, `reference-providers.html`, `reference-country-rules.html`

**Interfaces:**
- Consumes: `countryNameFor` (Task 8), for the Country Rules page's country column.
- Produces: `renderReferencePage({ title, columns, rowsSelector })` where `columns` is `{ key, label, format? }[]` (`format(value, row, state)` is optional — when present it computes the displayed cell value instead of the raw `row[c.key]`, used by Country Rules to show a country name instead of its ISO2 code, per the spec's "country names before ISO2 codes" convention) and `rowsSelector` is `(state) => row[]`. Each of the 5 HTML pages calls this with its own config via an inline `<script type="module">`. Also renders a small sub-nav linking across all 5 reference pages — `nav.js`'s top-level "Reference Data" link only reaches `reference-airports.html`, so without this a page like `reference-country-rules.html` would otherwise be reachable only by typing its URL.

- [ ] **Step 1: Implement `reference.js`**

```js
import { store } from '../lib/store.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';

const REFERENCE_PAGES = [
  { href: 'reference-airports.html', label: 'Airports' },
  { href: 'reference-aircraft.html', label: 'Aircraft' },
  { href: 'reference-providers.html', label: 'Providers' },
  { href: 'reference-country-rules.html', label: 'Country Rules' },
  { href: 'reference-person-roles.html', label: 'Person Roles' },
];

export function renderReferencePage({ title, columns, rowsSelector }) {
  function render() {
    mountNav();
    document.getElementById('reference-title').textContent = title;
    document.getElementById('reference-subnav').innerHTML = REFERENCE_PAGES.map((p) =>
      `<a href="${p.href}" style="margin-right:1rem; ${p.label === title ? 'font-weight:600;' : ''}">${escapeHtml(p.label)}</a>`
    ).join('');
    const rows = rowsSelector(store.state);
    document.getElementById('reference-table').innerHTML = `
      <table>
        <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(c.format ? c.format(row[c.key], row, store.state) : (row[c.key] ?? ''))}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `;
  }
  store.subscribe(render);
  render();
}
```

- [ ] **Step 2: Create `reference-airports.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Trip Platform — Airports</title><link rel="stylesheet" href="css/styles.css" /></head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1 id="reference-title">Airports</h1>
    <nav id="reference-subnav" style="margin-bottom:1rem; font-size:0.875rem;"></nav>
    <div id="reference-table"></div>
  </main>
  <script type="module">
    import { renderReferencePage } from './js/pages/reference.js';
    renderReferencePage({
      title: 'Airports',
      columns: [
        { key: 'icao', label: 'ICAO' }, { key: 'iata', label: 'IATA' }, { key: 'name', label: 'Name' },
        { key: 'country', label: 'Country' }, { key: 'tz', label: 'Timezone' },
      ],
      rowsSelector: (state) => state.airports,
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Create `reference-aircraft.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Trip Platform — Aircraft</title><link rel="stylesheet" href="css/styles.css" /></head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1 id="reference-title">Aircraft</h1>
    <nav id="reference-subnav" style="margin-bottom:1rem; font-size:0.875rem;"></nav>
    <div id="reference-table"></div>
  </main>
  <script type="module">
    import { renderReferencePage } from './js/pages/reference.js';
    renderReferencePage({
      title: 'Aircraft',
      columns: [
        { key: 'registration', label: 'Registration' }, { key: 'icaoType', label: 'ICAO Type' },
        { key: 'manufacturer', label: 'Manufacturer' }, { key: 'series', label: 'Series' }, { key: 'mtowKg', label: 'MTOW (kg)' },
      ],
      rowsSelector: (state) => state.aircraft,
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: Create `reference-providers.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Trip Platform — Providers</title><link rel="stylesheet" href="css/styles.css" /></head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1 id="reference-title">Providers</h1>
    <nav id="reference-subnav" style="margin-bottom:1rem; font-size:0.875rem;"></nav>
    <div id="reference-table"></div>
  </main>
  <script type="module">
    import { renderReferencePage } from './js/pages/reference.js';
    import { countryNameFor } from './js/lib/format.js';
    renderReferencePage({
      title: 'Providers',
      columns: [
        { key: 'name', label: 'Name' }, { key: 'serviceType', label: 'Service Type' },
        { key: 'scopeIcao', label: 'ICAO Scope' },
        { key: 'scopeIso2', label: 'Country Scope', format: (iso2, row, state) => (iso2 ? countryNameFor(iso2, state.countries) : '') },
        { key: 'email', label: 'Email' },
      ],
      rowsSelector: (state) => state.providers,
    });
  </script>
</body>
</html>
```

- [ ] **Step 5: Create `reference-country-rules.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Trip Platform — Country Rules</title><link rel="stylesheet" href="css/styles.css" /></head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1 id="reference-title">Country Rules</h1>
    <nav id="reference-subnav" style="margin-bottom:1rem; font-size:0.875rem;"></nav>
    <div id="reference-table"></div>
  </main>
  <script type="module">
    import { renderReferencePage } from './js/pages/reference.js';
    import { countryNameFor } from './js/lib/format.js';
    renderReferencePage({
      title: 'Country Rules',
      columns: [
        // Country name shown, not the raw ISO2 — per the spec's "country names before ISO2 codes"
        // display convention; countryIso2 stays the underlying join key, just not what's rendered.
        { key: 'countryIso2', label: 'Country', format: (iso2, row, state) => countryNameFor(iso2, state.countries) },
        { key: 'serviceType', label: 'Service Type' },
        { key: 'leadTimeHours', label: 'Lead Time (h)' }, { key: 'workingDaysOnly', label: 'Working Days Only' },
        { key: 'toleranceHours', label: 'Tolerance (h)' }, { key: 'escalationContact', label: 'Escalation Contact' },
      ],
      rowsSelector: (state) => state.countryRules,
    });
  </script>
</body>
</html>
```

- [ ] **Step 6: Create `reference-person-roles.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Trip Platform — Person Roles</title><link rel="stylesheet" href="css/styles.css" /></head>
<body>
  <div id="app-nav"></div>
  <main class="page">
    <h1 id="reference-title">Person Roles</h1>
    <nav id="reference-subnav" style="margin-bottom:1rem; font-size:0.875rem;"></nav>
    <div id="reference-table"></div>
  </main>
  <script type="module">
    import { renderReferencePage } from './js/pages/reference.js';
    renderReferencePage({
      title: 'Person Roles',
      columns: [{ key: 'id', label: 'ID' }, { key: 'label', label: 'Label' }],
      rowsSelector: (state) => state.personRoles,
    });
  </script>
</body>
</html>
```

- [ ] **Step 7: Run the full logic-layer test suite**

Run: `npm test` (from `actuator/frontend`)
Expected: PASS across every suite built so far (core-logic, format, reference, trips, scope, stops, store, trips-filter, templates). Tasks 18-19 add two more (documents, billing) after this task.

- [ ] **Step 8: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/reference.js frontend/reference-airports.html frontend/reference-aircraft.html frontend/reference-providers.html frontend/reference-country-rules.html frontend/reference-person-roles.html
git commit -m "Add Reference Data pages for Airports, Aircraft, Providers, Country Rules, Person Roles"
```

---

### Task 18: Documents tab

**Files:**
- Create: `actuator/frontend/js/lib/mock-data/documents.js`
- Test: `actuator/frontend/js/lib/mock-data/documents.test.js`
- Create: `actuator/frontend/js/pages/trip-sheet-documents.js`
- Modify: `actuator/frontend/js/lib/store.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Consumes: `trips` (Task 4, for the seed integrity test), `store.state.documents`/`store.addDocument`/`store.removeDocument` (already built in Task 7), `formatDateTimeZ` (Task 8).
- Produces: `export const documents` (Document shape: `{ id, tripId, name, docType, uploadedAtZ, removed? }` — `docType` is free text, not a fixed enum or a reference table, per YAGNI: a real controlled-vocabulary Document Types reference page is more surface area than this phase needs; a `<datalist>` of common values keeps entry fast without hardcoding a closed set in code). `renderDocumentsTab(container, tripId)`.

- [ ] **Step 1: Write the failing integrity tests**

`actuator/frontend/js/lib/mock-data/documents.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { documents } from './documents.js';
import { trips } from './trips.js';

describe('documents seed data integrity', () => {
  const tripIds = new Set(trips.map((t) => t.id));

  it('every document references a real trip', () => {
    for (const d of documents) expect(tripIds.has(d.tripId)).toBe(true);
  });

  it('every document has a non-empty name, docType, and uploadedAtZ', () => {
    for (const d of documents) {
      expect(typeof d.name).toBe('string');
      expect(d.name.length).toBeGreaterThan(0);
      expect(typeof d.docType).toBe('string');
      expect(d.docType.length).toBeGreaterThan(0);
      expect(typeof d.uploadedAtZ).toBe('string');
    }
  });

  it('has at least 2 seeded documents', () => {
    expect(documents.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- documents` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `documents.js`**

```js
export const documents = [
  { id: 'DOC-0041-01', tripId: 'TRIP-0041', name: 'AOC CERTIFICATE', docType: 'AOC', uploadedAtZ: '2026-08-01T10:00:00.000Z' },
  { id: 'DOC-0041-02', tripId: 'TRIP-0041', name: 'INSURANCE CERTIFICATE', docType: 'Insurance', uploadedAtZ: '2026-08-01T10:05:00.000Z' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- documents`
Expected: PASS (3 tests).

- [ ] **Step 5: Modify `store.js` to seed `documents` from this file**

Add the import alongside the other mock-data imports:

```js
import { documents as seedDocuments } from './mock-data/documents.js';
```

Change the `documents: []` line in `createStore()`'s initial `state` object (from Task 7) to:

```js
documents: seedDocuments.map((d) => ({ ...d })),
```

No other change to `store.js` — `addDocument`/`removeDocument` already exist from Task 7.

- [ ] **Step 6: Implement `trip-sheet-documents.js`**

```js
import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';

let addFormOpen = false;

export function renderDocumentsTab(container, tripId) {
  const tripDocuments = store.state.documents.filter((d) => d.tripId === tripId && !d.removed);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>Documents</h2>
      <button id="add-document-btn" class="btn">Add Document</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Type</th><th>Uploaded</th><th></th></tr></thead>
      <tbody>
        ${tripDocuments.map((d) => `
          <tr data-document-id="${d.id}">
            <td>${escapeHtml(d.name)}</td>
            <td>${escapeHtml(d.docType)}</td>
            <td>${escapeHtml(formatDateTimeZ(d.uploadedAtZ))}</td>
            <td><button class="btn remove-document-btn">Remove</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div id="add-document-form"></div>
  `;

  container.querySelectorAll('.remove-document-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      store.removeDocument(e.target.closest('tr').dataset.documentId, 'Current User');
    });
  });

  document.getElementById('add-document-btn').addEventListener('click', () => {
    addFormOpen = true;
    renderAddForm(tripId);
  });

  if (addFormOpen) renderAddForm(tripId);
}

function renderAddForm(tripId) {
  const formEl = document.getElementById('add-document-form');
  formEl.innerHTML = `
    <div class="drawer">
      <div class="field">
        <label for="document-name">Name</label>
        <input id="document-name" />
      </div>
      <div class="field">
        <label for="document-type">Type</label>
        <input id="document-type" list="document-type-suggestions" placeholder="e.g. AOC, Insurance, Permit Application" />
        <datalist id="document-type-suggestions">
          <option value="AOC"></option>
          <option value="Insurance"></option>
          <option value="Permit Application"></option>
          <option value="Other"></option>
        </datalist>
      </div>
      <button id="confirm-add-document-btn" class="btn btn-primary">Add</button>
      <button id="cancel-add-document-btn" class="btn">Cancel</button>
    </div>
  `;

  document.getElementById('cancel-add-document-btn').addEventListener('click', () => {
    addFormOpen = false;
    formEl.innerHTML = '';
  });
  document.getElementById('confirm-add-document-btn').addEventListener('click', () => {
    // UPPERCASE at capture, per the spec's display/input conventions.
    const name = document.getElementById('document-name').value.trim().toUpperCase();
    const docType = document.getElementById('document-type').value.trim().toUpperCase();
    if (!name || !docType) return;
    addFormOpen = false;
    store.addDocument({ tripId, name, docType });
  });
}
```

- [ ] **Step 7: Wire into `trip-sheet.js`**

Add the import, and insert the branch before the `PLACEHOLDER_TABS` fallback:

```js
import { renderDocumentsTab } from './trip-sheet-documents.js';
```

```js
  } else if (activeTab === 'documents') {
    renderDocumentsTab(container, tripId);
```

- [ ] **Step 8: Manually verify**

On the Documents tab for TRIP-0041, expected: 2 seeded documents (AOC Certificate, Insurance Certificate) with formatted upload dates. Click Add Document, enter a name and type, click Add — expected: the new document appears, name/type shown UPPERCASE. Click Remove on it — expected: it disappears from this tab, and a corresponding entry appears on the History tab.

- [ ] **Step 9: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/mock-data/documents.js frontend/js/lib/mock-data/documents.test.js frontend/js/lib/store.js frontend/js/pages/trip-sheet-documents.js frontend/js/pages/trip-sheet.js
git commit -m "Add Documents tab with seeded metadata rows"
```

---

### Task 19: Billing tab

**Files:**
- Create: `actuator/frontend/js/lib/mock-data/billing.js`
- Test: `actuator/frontend/js/lib/mock-data/billing.test.js`
- Create: `actuator/frontend/js/pages/trip-sheet-billing.js`
- Modify: `actuator/frontend/js/lib/store.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Consumes: `trips` (Task 4, for the seed integrity test), `store.state.billing`/`store.addBillingLineItem`/`store.removeBillingLineItem`/`store.updateBillingLineItemStatus` (already built in Task 7).
- Produces: `export const billing` (BillingLineItem shape: `{ id, tripId, description, amount, currency, status, removed? }`, `status` one of `PENDING`/`INVOICED`/`PAID`). `renderBillingTab(container, tripId)`.

- [ ] **Step 1: Write the failing integrity tests**

`actuator/frontend/js/lib/mock-data/billing.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { billing } from './billing.js';
import { trips } from './trips.js';

describe('billing seed data integrity', () => {
  const tripIds = new Set(trips.map((t) => t.id));

  it('every line item references a real trip', () => {
    for (const b of billing) expect(tripIds.has(b.tripId)).toBe(true);
  });

  it('every line item has a positive amount, a currency, and a valid status', () => {
    for (const b of billing) {
      expect(b.amount).toBeGreaterThan(0);
      expect(typeof b.currency).toBe('string');
      expect(['PENDING', 'INVOICED', 'PAID']).toContain(b.status);
    }
  });

  it('has at least 2 seeded line items', () => {
    expect(billing.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- billing` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `billing.js`**

```js
export const billing = [
  { id: 'BILL-0041-01', tripId: 'TRIP-0041', description: 'HANDLING FEE — HKJK', amount: 850, currency: 'USD', status: 'PENDING' },
  { id: 'BILL-0041-02', tripId: 'TRIP-0041', description: 'FUEL UPLIFT — HKJK', amount: 4200, currency: 'USD', status: 'PENDING' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- billing`
Expected: PASS (3 tests).

- [ ] **Step 5: Modify `store.js` to seed `billing` from this file**

Add the import alongside the other mock-data imports:

```js
import { billing as seedBilling } from './mock-data/billing.js';
```

Change the `billing: []` line in `createStore()`'s initial `state` object (from Task 7) to:

```js
billing: seedBilling.map((b) => ({ ...b })),
```

No other change to `store.js` — `addBillingLineItem`/`removeBillingLineItem`/`updateBillingLineItemStatus` already exist from Task 7.

- [ ] **Step 6: Implement `trip-sheet-billing.js`**

```js
import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';

const STATUSES = ['PENDING', 'INVOICED', 'PAID'];
let addFormOpen = false;

export function renderBillingTab(container, tripId) {
  const tripBilling = store.state.billing.filter((b) => b.tripId === tripId && !b.removed);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>Billing</h2>
      <button id="add-billing-btn" class="btn">Add Line Item</button>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Amount</th><th>Currency</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${tripBilling.map((b) => `
          <tr data-billing-id="${b.id}">
            <td>${escapeHtml(b.description)}</td>
            <td>${escapeHtml(b.amount)}</td>
            <td>${escapeHtml(b.currency)}</td>
            <td>
              <select class="status-select">
                ${STATUSES.map((s) => `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </td>
            <td><button class="btn remove-billing-btn">Remove</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div id="add-billing-form"></div>
  `;

  container.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const lineItemId = e.target.closest('tr').dataset.billingId;
      store.updateBillingLineItemStatus(lineItemId, e.target.value, 'Current User');
    });
  });

  container.querySelectorAll('.remove-billing-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      store.removeBillingLineItem(e.target.closest('tr').dataset.billingId, 'Current User');
    });
  });

  document.getElementById('add-billing-btn').addEventListener('click', () => {
    addFormOpen = true;
    renderAddForm(tripId);
  });

  if (addFormOpen) renderAddForm(tripId);
}

function renderAddForm(tripId) {
  const formEl = document.getElementById('add-billing-form');
  formEl.innerHTML = `
    <div class="drawer">
      <div class="field"><label for="billing-description">Description</label><input id="billing-description" /></div>
      <div class="field"><label for="billing-amount">Amount</label><input id="billing-amount" type="number" min="0" step="0.01" /></div>
      <div class="field"><label for="billing-currency">Currency</label><input id="billing-currency" value="USD" maxlength="3" /></div>
      <button id="confirm-add-billing-btn" class="btn btn-primary">Add</button>
      <button id="cancel-add-billing-btn" class="btn">Cancel</button>
    </div>
  `;

  document.getElementById('cancel-add-billing-btn').addEventListener('click', () => {
    addFormOpen = false;
    formEl.innerHTML = '';
  });
  document.getElementById('confirm-add-billing-btn').addEventListener('click', () => {
    // UPPERCASE at capture, per the spec's display/input conventions (currency/description are text; amount is not).
    const description = document.getElementById('billing-description').value.trim().toUpperCase();
    const amount = Number(document.getElementById('billing-amount').value);
    const currency = document.getElementById('billing-currency').value.trim().toUpperCase();
    if (!description || !(amount > 0) || !currency) return;
    addFormOpen = false;
    store.addBillingLineItem({ tripId, description, amount, currency, status: 'PENDING' });
  });
}
```

- [ ] **Step 7: Wire into `trip-sheet.js`**

Add the import, and insert the branch before the `PLACEHOLDER_TABS` fallback — this is the last of the 8 tab branches, so after this task `renderTabContent` has one `else if` per tab and the fallback is dead code kept only as a defensive default:

```js
import { renderBillingTab } from './trip-sheet-billing.js';
```

```js
  } else if (activeTab === 'billing') {
    renderBillingTab(container, tripId);
```

- [ ] **Step 8: Manually verify**

On the Billing tab for TRIP-0041, expected: 2 seeded line items (Handling fee, Fuel uplift) both `PENDING`. Change one's status to `INVOICED` via the dropdown — expected: it updates immediately (re-render is triggered by `updateBillingLineItemStatus`'s `notify()`). Click Add Line Item, fill in description/amount/currency, click Add — expected: the new row appears with status `PENDING`. Click Remove on it — expected: it disappears from this tab, and a corresponding entry appears on the History tab.

- [ ] **Step 9: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/mock-data/billing.js frontend/js/lib/mock-data/billing.test.js frontend/js/lib/store.js frontend/js/pages/trip-sheet-billing.js frontend/js/pages/trip-sheet.js
git commit -m "Add Billing tab with seeded line items"
```

---

## Post-plan verification

After Task 19, with the static server still running (`npx http-server actuator/frontend -p 8080` from Task 9), walk the full golden path:

1. `http://localhost:8080/index.html` — Action Board shows unconfirmed seeded services, sorted by urgency, excluding the two `CONFIRMED` ones, with formatted `DD-Mon-YYYY HH:MM`Z deadlines.
2. `http://localhost:8080/trips.html` — both seeded trips listed; search and status filter both work; "New Trip" link present.
3. `http://localhost:8080/trip-sheet.html?id=TRIP-0041` — all 8 tabs render, plus the live deadline rail in the header. **Route:** each leg shows its Call Sign and formatted ETD/ETA labels; `LEG-0041-3`'s ETA shows TBD; filling it in clears the badge; editing `LEG-0041-2`'s ETD by more than its tightest attached service's tolerance flips that service to Re-confirm Required, it reappears on the Action Board, and the deadline rail updates. **Permits:** the 3 permit-type services only. **Services:** the 2 non-permit services only; Add Service on either tab only offers scope candidates and service types valid for that tab; Cancel on a service shows a CANCEL-mode preview and sets it to Cancelled on send. **Crew & Pax:** 5 seeded people with role labels; add and remove both work, names shown UPPERCASE. **Documents:** 2 seeded metadata rows; add/remove work. **Billing:** 2 seeded line items; status dropdown and add/remove work. **Messages:** Composer pre-fills the correlation token in REQUEST mode by default, and REVISION mode (previous vs. new itinerary) when opened for the seeded `RECONFIRM_REQUIRED` service; Send logs a message and updates the service's status. **History:** shows all of the above as audit entries, newest first, with formatted timestamps — including the removed Crew & Pax person, Document, and Billing line item, whose entries stay visible even though they're gone from their own tabs.
4. `http://localhost:8080/trip-new.html` — wizard has no Trip Code field (auto-generated numeric `YYMMNNN`); a dash typed into Registration is stripped; wizard completes header → legs (Call Sign, ETA optional) → derived-stops review → Confirm Trip, and lands on the new trip's Trip Sheet with the entered leg visible, TBD badge included if ETA was left blank.
5. All five `reference-*.html` pages render their seeded rows with the shared nav present, each page's sub-nav links to the other four, Country Rules shows country names (not ISO2) in its Country column, and Airports/Providers show ICAO before IATA / country names before ISO2 where applicable.

## Follow-up: Next.js conversion

Once this page flow is validated, converting to Next.js means: keep every file under `js/lib/` unchanged (rename `.js` to `.ts` and add type annotations if desired — the logic and its tests carry over as-is), replace `store.js`'s subscribe/notify pattern with a React Context following the same method signatures, and rewrite each `js/pages/*.js` module as a React component that calls the equivalent `store.*` methods instead of manipulating `innerHTML` directly. The HTML page structure (one route per file) maps directly onto the Next.js App Router file-per-route convention.
