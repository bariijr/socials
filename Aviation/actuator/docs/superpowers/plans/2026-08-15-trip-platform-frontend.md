# Trip Platform Frontend (HTML Page-Flow + Seed Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the page flow for the ad-hoc trip management platform — Action Board, Trips, Trip Sheet (Itinerary/Services/Comms/History), trip-creation wizard, and Reference Data — as plain HTML pages + vanilla JS (ES modules), running entirely against hardcoded/seeded mock data, no backend, no build step.

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
  css/
    styles.css
  js/
    lib/
      core-logic.js                     — RequiredByZ / Urgency / re-confirm math (Task 2)
      scope.js                          — service-type -> scope-type filtering (Task 5)
      stops.js                          — stop derivation + rebuild diffing (Task 6)
      templates.js                      — Composer email draft generation (Task 13)
      trips-filter.js                   — Trips-list search/status filter (Task 10)
      store.js                          — in-memory state + mutation actions (Task 7)
      mock-data/
        airports.js, countries.js, countryRules.js, aircraft.js, providers.js   (Task 3)
        trips.js                        — seeded trips/legs/stops/services/comms/audit (Task 4)
    pages/
      nav.js                            — shared nav bar (Task 8)
      ui-helpers.js                     — escapeHtml, urgencyBadgeHtml (Task 8)
      action-board.js                   (Task 9)
      trips-list.js                     (Task 10)
      trip-sheet.js                     — shell: header, tabs, routes to per-tab renderers (Task 11)
      trip-sheet-itinerary.js           (Task 11)
      trip-sheet-services.js            (Task 12)
      trip-sheet-comms.js               (Task 13)
      trip-sheet-history.js             (Task 14)
      trip-wizard.js                    (Task 15)
      reference.js                      — generic renderer reused by all 4 reference pages (Task 16)
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
- Produces: `computeRequiredByZ(basedOnEtdZ, rule)`, `computeUrgency(requiredByZ, nowZ)`, `needsReconfirm(basedOnEtdZ, currentEtdZ, toleranceHours)`. `rule` is `{ leadTimeHours: number, workingDaysOnly: boolean }` (a country-rule object — see Task 3's shape). Consumed by `store.js` (Task 7), `action-board.js` (Task 9), `trip-sheet-services.js` (Task 12).

Domain shapes used across this plan (documented once here, not re-declared per file — plain JS, no compile-time enforcement, but every mock-data and store file below conforms to these):

```
Airport      { icao, iata, name, country, iso2, tz }
Country      { name, iso2, region, overflightPermitRequired, landingPermitRequired, aocDocsRequired, defaultEscalationContact }
CountryRule  { id, countryIso2, serviceType, leadTimeHours, workingDaysOnly, toleranceHours, docsRequired: string[], escalationContact, notes? }
Aircraft     { registration, icaoType, manufacturer, series, mtowKg, noiseCert }
Provider     { id, name, serviceType, scopeIso2?, scopeIcao?, email, aogContact, workingHoursZ }
Trip         { id, tripCode, clientOperator, registration, ownerName, status, notifyRecipients: string[], createdAtZ }
Leg          { id, tripId, sequence, depIcao, arrIcao, etdZ, etaZ, pax, crew, overflightCountries: string[], revision }
Stop         { id, tripId, icao, arrZ, depZ, groundTimeHours, purpose }   // purpose: 'TURNAROUND' | 'TECH_STOP' | 'NIGHT_STOP'
Service      { id, tripId, scopeType, scopeId, serviceType, providerId, status, refNumber, basedOnEtdZ, assignedTo }
             // scopeType: 'LEG' | 'STOP' | 'SEGMENT'; scopeId for SEGMENT is "<legId>:<countryIso2>"
             // status: 'NOT_REQUIRED' | 'NOT_STARTED' | 'REQUESTED' | 'CHASING' | 'CONFIRMED' | 'RECONFIRM_REQUIRED' | 'CANCELLED'
Comm         { id, tripId, serviceId, direction, kind, token, from, to: string[], subject, body, timestampZ }
             // direction: 'IN' | 'OUT'; kind: 'REQUEST' | 'NOTIFICATION'
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
    // ETD Monday 2026-08-24T10:00Z; 48 working hours back, skipping Sat 22 / Sun 23, lands Wed 2026-08-19T10:00Z.
    expect(computeRequiredByZ('2026-08-24T10:00:00.000Z', rule48hWorkingDays)).toBe('2026-08-19T10:00:00.000Z');
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
- Create: `actuator/frontend/js/lib/mock-data/airports.js`, `countries.js`, `countryRules.js`, `aircraft.js`, `providers.js`
- Test: `actuator/frontend/js/lib/mock-data/reference.test.js`

**Interfaces:**
- Produces: `export const airports = [...]`, `export const countries = [...]`, `export const countryRules = [...]`, `export const aircraft = [...]`, `export const providers = [...]` — shapes per Task 2's domain-shapes block. Consumed by `store.js` (Task 7).

- [ ] **Step 1: Write the failing integrity tests**

`actuator/frontend/js/lib/mock-data/reference.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { airports } from './airports.js';
import { countries } from './countries.js';
import { countryRules } from './countryRules.js';
import { aircraft } from './aircraft.js';
import { providers } from './providers.js';

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
  { registration: '5H-ABC', icaoType: 'GLF6', manufacturer: 'Gulfstream', series: 'G650', mtowKg: 45178, noiseCert: 'Chapter 4' },
  { registration: '5Y-XYZ', icaoType: 'C56X', manufacturer: 'Cessna', series: 'Citation Excel', mtowKg: 9163, noiseCert: 'Chapter 4' },
  { registration: 'A6-DEF', icaoType: 'GLEX', manufacturer: 'Bombardier', series: 'Global 6000', mtowKg: 45132, noiseCert: 'Chapter 4' },
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

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- reference`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/mock-data/airports.js frontend/js/lib/mock-data/countries.js frontend/js/lib/mock-data/countryRules.js frontend/js/lib/mock-data/aircraft.js frontend/js/lib/mock-data/providers.js frontend/js/lib/mock-data/reference.test.js
git commit -m "Seed reference mock data for East Africa / Middle East corridor"
```

---

### Task 4: Transactional seed data

**Files:**
- Create: `actuator/frontend/js/lib/mock-data/trips.js`
- Test: `actuator/frontend/js/lib/mock-data/trips.test.js`

**Interfaces:**
- Consumes: nothing (self-contained fixture).
- Produces: `export const trips`, `legs`, `stops`, `services`, `comms`, `auditEntries` (shapes per Task 2). Consumed by `store.js` (Task 7).

- [ ] **Step 1: Write the failing integrity tests**

`actuator/frontend/js/lib/mock-data/trips.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { trips, legs, stops, services, comms, auditEntries } from './trips.js';

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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- trips` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `trips.js`**

Two trips: **T26-0041** (Dar → Nairobi → Addis → Dar, exercising a confirmed handling+fuel stop, a requested overflight-permit segment, and a landing permit deliberately stale relative to its leg's current ETD to demonstrate `RECONFIRM_REQUIRED`), and **T26-0052** (Johannesburg → Dubai, exercising a `CHASING` Saudi overflight permit and a not-started catering service).

```js
export const trips = [
  {
    id: 'TRIP-0041', tripCode: 'T26-0041', clientOperator: 'Acacia Charters', registration: '5H-ABC',
    ownerName: 'B. Minja', status: 'CONFIRMED',
    notifyRecipients: ['crew.5habc@example.com', 'flightdept@acaciacharters.example'],
    createdAtZ: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 'TRIP-0052', tripCode: 'T26-0052', clientOperator: 'Kilimanjaro Air', registration: 'A6-DEF',
    ownerName: 'B. Minja', status: 'DRAFT', notifyRecipients: ['crew.a6def@example.com'],
    createdAtZ: '2026-08-10T11:00:00.000Z',
  },
];

export const legs = [
  { id: 'LEG-0041-1', tripId: 'TRIP-0041', sequence: 1, depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', pax: 6, crew: 2, overflightCountries: [], revision: 0 },
  { id: 'LEG-0041-2', tripId: 'TRIP-0041', sequence: 2, depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', pax: 6, crew: 2, overflightCountries: ['ET'], revision: 1 },
  { id: 'LEG-0041-3', tripId: 'TRIP-0041', sequence: 3, depIcao: 'HAAB', arrIcao: 'HTDA', etdZ: '2026-08-21T07:00:00.000Z', etaZ: '2026-08-21T09:30:00.000Z', pax: 6, crew: 2, overflightCountries: ['KE'], revision: 0 },
  { id: 'LEG-0052-1', tripId: 'TRIP-0052', sequence: 1, depIcao: 'FAOR', arrIcao: 'OMDB', etdZ: '2026-08-16T18:00:00.000Z', etaZ: '2026-08-17T04:30:00.000Z', pax: 4, crew: 2, overflightCountries: ['SA'], revision: 0 },
];

export const stops = [
  { id: 'STOP-0041-HTDA-1', tripId: 'TRIP-0041', icao: 'HTDA', arrZ: null, depZ: '2026-08-20T05:00:00.000Z', groundTimeHours: null, purpose: 'TURNAROUND' },
  { id: 'STOP-0041-HKJK', tripId: 'TRIP-0041', icao: 'HKJK', arrZ: '2026-08-20T06:15:00.000Z', depZ: '2026-08-20T09:00:00.000Z', groundTimeHours: 2.75, purpose: 'TECH_STOP' },
  { id: 'STOP-0041-HAAB', tripId: 'TRIP-0041', icao: 'HAAB', arrZ: '2026-08-20T10:45:00.000Z', depZ: '2026-08-21T07:00:00.000Z', groundTimeHours: 20.25, purpose: 'NIGHT_STOP' },
  { id: 'STOP-0041-HTDA-2', tripId: 'TRIP-0041', icao: 'HTDA', arrZ: '2026-08-21T09:30:00.000Z', depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' },
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
  { id: 'COMM-0041-01', tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'OUT', kind: 'REQUEST', token: '[T26-0041/SVC-0041-01]', from: 'ops@insider.co.tz', to: ['ops@nbohandling.example'], subject: 'Handling request — 5H-ABC [T26-0041/SVC-0041-01]', body: 'Requesting handling for 5H-ABC arriving HKJK 2026-08-20T06:15Z, departing 2026-08-20T09:00Z. 6 pax, 2 crew.', timestampZ: '2026-08-02T08:00:00.000Z' },
  { id: 'COMM-0041-02', tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'IN', kind: 'REQUEST', token: '[T26-0041/SVC-0041-01]', from: 'ops@nbohandling.example', to: ['ops@insider.co.tz'], subject: 'RE: Handling request — 5H-ABC [T26-0041/SVC-0041-01]', body: 'Confirmed, ref HKJK-HDL-8823.', timestampZ: '2026-08-02T10:30:00.000Z' },
  { id: 'COMM-0041-03', tripId: 'TRIP-0041', serviceId: null, direction: 'OUT', kind: 'NOTIFICATION', token: null, from: 'ops@insider.co.tz', to: ['crew.5habc@example.com', 'flightdept@acaciacharters.example'], subject: 'Trip T26-0041 confirmed', body: 'Trip T26-0041 (HTDA-HKJK-HAAB-HTDA) is now confirmed.', timestampZ: '2026-08-05T12:00:00.000Z' },
];

export const auditEntries = [
  { id: 'AUD-0041-01', timestampZ: '2026-08-02T08:00:00.000Z', user: 'B. Minja', table: 'Service', recordId: 'SVC-0041-01', field: 'status', oldValue: 'NOT_STARTED', newValue: 'REQUESTED' },
  { id: 'AUD-0041-02', timestampZ: '2026-08-02T10:30:00.000Z', user: 'B. Minja', table: 'Service', recordId: 'SVC-0041-01', field: 'status', oldValue: 'REQUESTED', newValue: 'CONFIRMED' },
  { id: 'AUD-0041-03', timestampZ: '2026-08-14T06:00:00.000Z', user: 'B. Minja', table: 'Leg', recordId: 'LEG-0041-2', field: 'etdZ', oldValue: '2026-08-20T01:00:00.000Z', newValue: '2026-08-20T09:00:00.000Z' },
  { id: 'AUD-0041-04', timestampZ: '2026-08-14T06:00:01.000Z', user: 'system', table: 'Service', recordId: 'SVC-0041-04', field: 'status', oldValue: 'CONFIRMED', newValue: 'RECONFIRM_REQUIRED' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- trips`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/mock-data/trips.js frontend/js/lib/mock-data/trips.test.js
git commit -m "Add seeded trips/legs/stops/services/comms/audit fixtures"
```

---

### Task 5: Scope-type filtering logic

**Files:**
- Create: `actuator/frontend/js/lib/scope.js`
- Test: `actuator/frontend/js/lib/scope.test.js`

**Interfaces:**
- Produces: `scopeTypeForServiceType(serviceType)`, `getScopeCandidates(serviceType, legs, stops)` returning `{ scopeId, label }[]`. Consumed by `store.js`, `trip-sheet-services.js` (Task 12).

- [ ] **Step 1: Write the failing tests**

`actuator/frontend/js/lib/scope.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { scopeTypeForServiceType, getScopeCandidates } from './scope.js';

const legs = [
  { id: 'L1', tripId: 'T1', sequence: 1, depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', pax: 1, crew: 1, overflightCountries: [], revision: 0 },
  { id: 'L2', tripId: 'T1', sequence: 2, depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', pax: 1, crew: 1, overflightCountries: ['ET'], revision: 0 },
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
- Produces: `deriveStopsFromLegs(tripId, legs)`, `diffStopsForRebuild(tripId, legs, existingStops, hasAttachedServices)` returning `{ kept, added, orphaned }`. Consumed by `store.js` (Task 7), `trip-wizard.js` (Task 15).

- [ ] **Step 1: Write the failing tests**

`actuator/frontend/js/lib/stops.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { deriveStopsFromLegs, diffStopsForRebuild } from './stops.js';

const legs = [
  { id: 'L1', tripId: 'T1', sequence: 1, depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', pax: 1, crew: 1, overflightCountries: [], revision: 0 },
  { id: 'L2', tripId: 'T1', sequence: 2, depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', pax: 1, crew: 1, overflightCountries: ['ET'], revision: 0 },
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
      const groundTimeHours = (new Date(nextLeg.etdZ).getTime() - new Date(leg.etaZ).getTime()) / 3_600_000;
      const purpose = groundTimeHours > 8 ? 'NIGHT_STOP' : 'TECH_STOP';
      result.push({ tripId, icao: leg.arrIcao, arrZ: leg.etaZ, depZ: nextLeg.etdZ, groundTimeHours, purpose });
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
Expected: PASS (6 tests).

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
- Consumes: all Task 3/4 mock-data modules, `needsReconfirm` (Task 2), `diffStopsForRebuild` (Task 6).
- Produces: `createStore()` factory (used directly by tests to avoid singleton cross-test pollution) and `export const store = createStore()` (the singleton every page module imports). Shape:

```
store.state = { airports, countries, countryRules, aircraft, providers, trips, legs, stops, services, comms, audit }
store.subscribe(listener) -> unsubscribe function
store.addTrip(trip) -> Trip                       // trip without id/createdAtZ
store.addLeg(leg) -> Leg                          // leg without id/revision
store.updateLegEtd(legId, newEtdZ, user)          // mutates leg, bumps revision, audits, flips affected CONFIRMED services to RECONFIRM_REQUIRED
store.addStops(newStops) -> Stop[]                // stops without id
store.rebuildStops(tripId, user) -> { kept, added, orphaned }
store.addService(service) -> Service              // service without id
store.updateServiceStatus(serviceId, status, user)
store.addComm(comm) -> Comm                       // comm without id/timestampZ
store.addAuditEntry(entry)                        // entry without id/timestampZ
```

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
    store.addTrip({ tripCode: 'T26-9999', clientOperator: 'Test Op', registration: '5H-ABC', ownerName: 'Tester', status: 'DRAFT', notifyRecipients: [] });
    expect(store.state.trips.length).toBe(before + 1);
    const created = store.state.trips.find((t) => t.tripCode === 'T26-9999');
    expect(created.id).toBeTruthy();
    expect(created.createdAtZ).toBeTruthy();
  });

  it('updateLegEtd changes the leg, bumps revision, and records an audit entry', () => {
    const store = createStore();
    const leg = store.state.legs.find((l) => l.id === 'LEG-0041-1');
    const before = store.state.audit.length;
    store.updateLegEtd('LEG-0041-1', '2026-09-01T00:00:00.000Z', 'Tester');
    const updated = store.state.legs.find((l) => l.id === 'LEG-0041-1');
    expect(updated.etdZ).toBe('2026-09-01T00:00:00.000Z');
    expect(updated.revision).toBe(leg.revision + 1);
    expect(store.state.audit.length).toBe(before + 1);
  });

  it('updateLegEtd flips affected CONFIRMED services to RECONFIRM_REQUIRED when the shift exceeds tolerance', () => {
    const store = createStore();
    store.updateLegEtd('LEG-0041-2', '2026-08-20T20:00:00.000Z', 'Tester');
    const svc = store.state.services.find((s) => s.id === 'SVC-0041-01');
    expect(svc.status).toBe('RECONFIRM_REQUIRED');
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
    store.addComm({ tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'OUT', kind: 'REQUEST', token: '[T26-0041/SVC-0041-01]', from: 'ops@insider.co.tz', to: ['x@example.com'], subject: 'Test', body: 'Body' });
    expect(store.state.comms.length).toBe(before + 1);
  });

  it('rebuildStops updates stops for a trip and returns the diff result', () => {
    const store = createStore();
    const diff = store.rebuildStops('TRIP-0041', 'Tester');
    expect(diff.kept).toBeDefined();
    expect(diff.added).toBeDefined();
    expect(diff.orphaned).toBeDefined();
  });

  it('notifies subscribers on every mutation', () => {
    const store = createStore();
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    store.addTrip({ tripCode: 'T26-8888', clientOperator: 'X', registration: '5H-ABC', ownerName: 'X', status: 'DRAFT', notifyRecipients: [] });
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
import { trips as seedTrips, legs as seedLegs, stops as seedStops, services as seedServices, comms as seedComms, auditEntries as seedAudit } from './mock-data/trips.js';
import { needsReconfirm } from './core-logic.js';
import { diffStopsForRebuild } from './stops.js';

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function createStore() {
  const state = {
    airports, countries, countryRules, aircraft, providers,
    trips: seedTrips.map((t) => ({ ...t })),
    legs: seedLegs.map((l) => ({ ...l })),
    stops: seedStops.map((s) => ({ ...s })),
    services: seedServices.map((s) => ({ ...s })),
    comms: seedComms.map((c) => ({ ...c })),
    audit: seedAudit.map((a) => ({ ...a })),
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

  function addLeg(leg) {
    const created = { ...leg, id: nextId('LEG'), revision: 0 };
    state.legs.push(created);
    notify();
    return created;
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

  return { state, subscribe, addTrip, addLeg, updateLegEtd, addStops, rebuildStops, addService, updateServiceStatus, addComm, addAuditEntry };
}

export const store = createStore();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- store`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/store.js frontend/js/lib/store.test.js
git commit -m "Add in-memory store with re-confirm invalidation and rebuild-stops"
```

---

### Task 8: Shared page chrome — nav, UI helpers

**Files:**
- Create: `actuator/frontend/js/pages/nav.js`
- Create: `actuator/frontend/js/pages/ui-helpers.js`

**Interfaces:**
- Produces: `mountNav()` — finds `#app-nav` in the current document and fills it with the nav bar; `escapeHtml(value)` — HTML-escapes any value before `innerHTML` interpolation; `urgencyBadgeHtml(urgency)` — returns a `<span>` badge for a given urgency string. Every page module from Task 9 onward imports these.

No automated test for this task (pure DOM-manipulation helpers, no logic to unit test without a DOM — verified visually once wired into a real page in Task 9).

- [ ] **Step 1: Implement `nav.js`**

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

- [ ] **Step 2: Implement `ui-helpers.js`**

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

- [ ] **Step 3: Commit**

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

With the static server from Task 9 still running, visit `http://localhost:8080/trips.html`. Expected: both seeded trips listed; typing "acacia" in search narrows to T26-0041; selecting "Confirmed" in the status dropdown also narrows to T26-0041.

- [ ] **Step 8: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/trips-filter.js frontend/js/lib/trips-filter.test.js frontend/trips.html frontend/js/pages/trips-list.js
git commit -m "Add Trips list page with search/status filtering"
```

---

### Task 11: Trip Sheet shell + Itinerary tab

**Files:**
- Create: `actuator/frontend/trip-sheet.html`
- Create: `actuator/frontend/js/pages/trip-sheet.js`
- Create: `actuator/frontend/js/pages/trip-sheet-itinerary.js`

**Interfaces:**
- Consumes: `store` (Task 7), `mountNav`/`escapeHtml` (Task 8).
- Produces: `trip-sheet.js` reads `?id=` from `window.location.search`, renders the header + 4-tab strip into `#trip-header`/`#trip-tabs`, and delegates active-tab content to `#trip-tab-content` via `renderItineraryTab(container, tripId)` (this task) and placeholder text for the other three tabs (wired in Tasks 12-14).

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

- [ ] **Step 2: Implement `trip-sheet-itinerary.js`**

```js
import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';

let lastRebuildResult = null;

export function renderItineraryTab(container, tripId) {
  const tripLegs = store.state.legs.filter((l) => l.tripId === tripId).sort((a, b) => a.sequence - b.sequence);
  const tripStops = store.state.stops.filter((s) => s.tripId === tripId);
  const reconfirmServices = store.state.services.filter((s) => s.tripId === tripId && s.status === 'RECONFIRM_REQUIRED');

  container.innerHTML = `
    <h2>Legs</h2>
    <table>
      <thead><tr><th>Route</th><th>ETD (Z)</th><th>ETA (Z)</th><th></th></tr></thead>
      <tbody>
        ${tripLegs.map((leg) => `
          <tr data-leg-id="${leg.id}">
            <td>${escapeHtml(leg.depIcao)} → ${escapeHtml(leg.arrIcao)}</td>
            <td><input type="datetime-local" class="etd-input" value="${leg.etdZ.slice(0, 16)}" aria-label="ETD ${leg.id}" /></td>
            <td>${escapeHtml(leg.etaZ)}</td>
            <td><button class="btn save-etd-btn">Save</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${reconfirmServices.length > 0 ? `<p class="banner-warning">Re-confirm Required: ${reconfirmServices.map((s) => escapeHtml(s.id)).join(', ')}</p>` : ''}
    <h2>Stops</h2>
    <table>
      <thead><tr><th>ICAO</th><th>Purpose</th><th>Ground Time (h)</th></tr></thead>
      <tbody>
        ${tripStops.map((s) => `<tr><td>${escapeHtml(s.icao)}</td><td>${escapeHtml(s.purpose)}</td><td>${s.groundTimeHours ?? '—'}</td></tr>`).join('')}
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

  document.getElementById('rebuild-stops-btn').addEventListener('click', () => {
    // rebuildStops() notifies subscribers (re-rendering this tab) before returning, so the
    // result is cached at module scope and read back on the next render per the store
    // re-render ordering convention — see Global Constraints.
    lastRebuildResult = store.rebuildStops(tripId, 'Current User');
  });
}
```

- [ ] **Step 3: Implement `trip-sheet.js`**

```js
import { store } from '../lib/store.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';
import { renderItineraryTab } from './trip-sheet-itinerary.js';

const tripId = new URLSearchParams(window.location.search).get('id');
let activeTab = 'itinerary';

const TABS = [
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'services', label: 'Services' },
  { key: 'comms', label: 'Comms' },
  { key: 'history', label: 'History' },
];

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
  `;
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
  if (activeTab === 'itinerary') {
    renderItineraryTab(container, tripId);
  } else {
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

(Tasks 12-14 add `services`/`comms`/`history` branches to `renderTabContent` and their own imports.)

- [ ] **Step 4: Manually verify**

Visit `http://localhost:8080/trip-sheet.html?id=TRIP-0041`. Expected: header shows T26-0041; Itinerary tab lists 3 legs and 4 stops. Change LEG-0041-2's ETD input to a time more than 4 hours later than its current value and click Save — expected: `SVC-0041-01`'s tolerance (2h) is exceeded, so the Re-confirm Required banner appears listing `SVC-0041-01`. Click Rebuild Stops — expected: a "Rebuild complete" summary appears below the button.

- [ ] **Step 5: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/trip-sheet.html frontend/js/pages/trip-sheet.js frontend/js/pages/trip-sheet-itinerary.js
git commit -m "Add Trip Sheet shell with Itinerary tab, leg-edit re-confirm, and Rebuild Stops"
```

---

### Task 12: Services tab + Add Service form

**Files:**
- Create: `actuator/frontend/js/pages/trip-sheet-services.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Consumes: `store` (Task 7), `getScopeCandidates`/`scopeTypeForServiceType` (Task 5), `computeRequiredByZ`/`computeUrgency` (Task 2).
- Produces: `renderServicesTab(container, tripId)`.

- [ ] **Step 1: Implement `trip-sheet-services.js`**

```js
import { store } from '../lib/store.js';
import { getScopeCandidates, scopeTypeForServiceType } from '../lib/scope.js';
import { computeRequiredByZ, computeUrgency } from '../lib/core-logic.js';
import { escapeHtml } from './ui-helpers.js';

const SERVICE_TYPES = ['OVERFLIGHT_PERMIT', 'LANDING_PERMIT', 'FUEL', 'HANDLING', 'CATERING', 'CREW_TRANSPORT', 'CUSTOMS'];

let drawerOpen = false;
let drawerServiceType = 'FUEL';
let drawerScopeId = '';

export function renderServicesTab(container, tripId) {
  const tripServices = store.state.services.filter((s) => s.tripId === tripId);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>Services</h2>
      <button id="add-service-btn" class="btn">Add Service</button>
    </div>
    <table>
      <thead><tr><th>Service</th><th>Type</th><th>Scope</th><th>Status</th></tr></thead>
      <tbody>
        ${tripServices.map((s) => `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.serviceType)}</td><td>${escapeHtml(s.scopeType)} ${escapeHtml(s.scopeId)}</td><td>${escapeHtml(s.status)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div id="service-drawer"></div>
  `;

  document.getElementById('add-service-btn').addEventListener('click', () => {
    drawerOpen = true;
    renderDrawer(tripId);
  });

  if (drawerOpen) renderDrawer(tripId);
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

function renderDrawer(tripId) {
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
          ${SERVICE_TYPES.map((st) => `<option value="${st}" ${st === drawerServiceType ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="scope-select">Scope</label>
        <select id="scope-select">
          <option value="">Select…</option>
          ${candidates.map((c) => `<option value="${c.scopeId}" ${c.scopeId === drawerScopeId ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      ${preview ? `<p data-testid="required-by-preview">Required by ${escapeHtml(preview.requiredByZ)} — <strong>${preview.urgency}</strong></p>` : ''}
      <button id="confirm-add-service-btn" class="btn btn-primary" ${drawerScopeId ? '' : 'disabled'}>Add Service</button>
      <button id="cancel-add-service-btn" class="btn">Cancel</button>
    </div>
  `;

  document.getElementById('service-type-select').addEventListener('change', (e) => {
    drawerServiceType = e.target.value;
    drawerScopeId = '';
    renderDrawer(tripId);
  });
  document.getElementById('scope-select').addEventListener('change', (e) => {
    drawerScopeId = e.target.value;
    renderDrawer(tripId);
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

- [ ] **Step 2: Wire into `trip-sheet.js`**

Add the import and a new branch in `renderTabContent`:

```js
import { renderServicesTab } from './trip-sheet-services.js';
```

```js
  } else if (activeTab === 'services') {
    renderServicesTab(container, tripId);
```

- [ ] **Step 3: Manually verify**

Visit `http://localhost:8080/trip-sheet.html?id=TRIP-0041`, click the Services tab, click Add Service, select Service Type "FUEL" — expected: the Scope dropdown only offers `STOP-0041-HKJK` (not any leg or segment options). Select it — expected: a Required By / Urgency preview appears. Click Add Service — expected: the drawer closes and the new service row appears in the table above with status `NOT_STARTED`.

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/trip-sheet-services.js frontend/js/pages/trip-sheet.js
git commit -m "Add Services tab and type-driven Add Service drawer"
```

---

### Task 13: Composer drawer + Comms tab

**Files:**
- Create: `actuator/frontend/js/lib/templates.js`
- Test: `actuator/frontend/js/lib/templates.test.js`
- Create: `actuator/frontend/js/pages/trip-sheet-comms.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Produces: `buildEmailDraft(service, trip, scopeLabel, provider)` returning `{ subject, body, token }` (tested); `renderCommsTab(container, tripId)`.

- [ ] **Step 1: Write the failing template tests**

`actuator/frontend/js/lib/templates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildEmailDraft } from './templates.js';

const trip = { id: 'T1', tripCode: 'T26-0041', clientOperator: 'Acacia', registration: '5H-ABC', ownerName: 'X', status: 'DRAFT', notifyRecipients: [], createdAtZ: '2026-01-01T00:00:00.000Z' };
const provider = { id: 'P1', name: 'EA Fuel', serviceType: 'FUEL', scopeIcao: 'HKJK', email: 'fuel@example.com', aogContact: '+1', workingHoursZ: '00:00-23:59' };

describe('buildEmailDraft', () => {
  it('embeds the correlation token in the subject', () => {
    const svc = { id: 'SVC-1', tripId: 'T1', scopeType: 'STOP', scopeId: 'S1', serviceType: 'FUEL', providerId: 'P1', status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: null };
    const draft = buildEmailDraft(svc, trip, 'HKJK', provider);
    expect(draft.token).toBe('[T26-0041/SVC-1]');
    expect(draft.subject).toContain('[T26-0041/SVC-1]');
  });

  it('produces a fuel-specific body mentioning uplift and registration', () => {
    const svc = { id: 'SVC-1', tripId: 'T1', scopeType: 'STOP', scopeId: 'S1', serviceType: 'FUEL', providerId: 'P1', status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: null };
    const draft = buildEmailDraft(svc, trip, 'HKJK', provider);
    expect(draft.body).toContain('5H-ABC');
    expect(draft.body).toContain('uplift');
  });

  it('produces a permit-specific body mentioning route and required documents', () => {
    const svc = { id: 'SVC-2', tripId: 'T1', scopeType: 'LEG', scopeId: 'L1', serviceType: 'LANDING_PERMIT', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: null };
    const draft = buildEmailDraft(svc, trip, 'HTDA → HKJK', undefined);
    expect(draft.body).toContain('HTDA → HKJK');
    expect(draft.body.toLowerCase()).toContain('documents');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- templates` (from `actuator/frontend`)
Expected: FAIL.

- [ ] **Step 3: Implement `templates.js`**

```js
const SERVICE_TYPE_LABEL = {
  OVERFLIGHT_PERMIT: 'Overflight permit',
  LANDING_PERMIT: 'Landing permit',
  FUEL: 'Fuel',
  HANDLING: 'Handling',
  CATERING: 'Catering',
  CREW_TRANSPORT: 'Crew transport',
  CUSTOMS: 'Customs',
};

function buildBody(service, trip, scopeLabel) {
  switch (service.serviceType) {
    case 'OVERFLIGHT_PERMIT':
    case 'LANDING_PERMIT':
      return `Requesting ${SERVICE_TYPE_LABEL[service.serviceType].toLowerCase()} for registration ${trip.registration}, route ${scopeLabel}, ETD ${service.basedOnEtdZ}. Please advise required documents.`;
    case 'FUEL':
      return `Requesting fuel uplift for ${trip.registration} at ${scopeLabel}, ETD ${service.basedOnEtdZ}. Please confirm into-plane agent and uplift quantity.`;
    case 'HANDLING':
      return `Requesting handling for ${trip.registration} at ${scopeLabel}, ETD ${service.basedOnEtdZ}. Please confirm PPR and pax/crew count on file.`;
    case 'CATERING':
      return `Requesting catering for ${trip.registration} at ${scopeLabel}, ETD ${service.basedOnEtdZ}.`;
    case 'CREW_TRANSPORT':
      return `Requesting crew transport for ${trip.registration} at ${scopeLabel}, ETD ${service.basedOnEtdZ}.`;
    case 'CUSTOMS':
      return `Requesting customs clearance for ${trip.registration} at ${scopeLabel}, ETD ${service.basedOnEtdZ}.`;
    default:
      return '';
  }
}

export function buildEmailDraft(service, trip, scopeLabel, provider) {
  const token = `[${trip.tripCode}/${service.id}]`;
  const subject = `${SERVICE_TYPE_LABEL[service.serviceType]} request — ${trip.registration} ${token}`;
  const body = buildBody(service, trip, scopeLabel);
  return { subject, body, token };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- templates`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `trip-sheet-comms.js`**

```js
import { store } from '../lib/store.js';
import { buildEmailDraft } from '../lib/templates.js';
import { escapeHtml } from './ui-helpers.js';

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

export function renderCommsTab(container, tripId) {
  const tripComms = store.state.comms.filter((c) => c.tripId === tripId).sort((a, b) => a.timestampZ.localeCompare(b.timestampZ));
  const tripServices = store.state.services.filter((s) => s.tripId === tripId);

  container.innerHTML = `
    <h2>Comms</h2>
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
      ${tripServices.map((s) => `<button class="btn compose-btn" data-service-id="${s.id}">Compose for ${escapeHtml(s.id)}</button>`).join('')}
    </div>
    <ul style="list-style:none; padding:0;">
      ${tripComms.map((c) => `
        <li class="drawer">
          <p><strong>${escapeHtml(c.subject)}</strong></p>
          <p style="font-size:0.75rem; color:#64748b;">${escapeHtml(c.direction)} · ${escapeHtml(c.kind)} · ${escapeHtml(c.timestampZ)}</p>
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

function openComposer(serviceId, tripId) {
  const service = store.state.services.find((s) => s.id === serviceId);
  const trip = store.state.trips.find((t) => t.id === tripId);
  const provider = store.state.providers.find((p) => p.id === service.providerId);
  const draft = buildEmailDraft(service, trip, scopeLabelFor(service.scopeType, service.scopeId), provider);
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
      <button id="cancel-composer-btn" class="btn">Cancel</button>
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

- [ ] **Step 6: Wire into `trip-sheet.js`**

Add the import and branch:

```js
import { renderCommsTab } from './trip-sheet-comms.js';
```

```js
  } else if (activeTab === 'comms') {
    renderCommsTab(container, tripId);
```

- [ ] **Step 7: Manually verify**

On the Comms tab for TRIP-0041, click "Compose for SVC-0041-05" — expected: subject pre-fills with `[T26-0041/SVC-0041-05]`. Click Send — expected: the composer closes, a new outbound entry appears in the comms list, and switching to the Services tab shows `SVC-0041-05` now `REQUESTED`.

- [ ] **Step 8: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/lib/templates.js frontend/js/lib/templates.test.js frontend/js/pages/trip-sheet-comms.js frontend/js/pages/trip-sheet.js
git commit -m "Add Composer drawer with per-type templates and correlation token, plus Comms tab"
```

---

### Task 14: History tab

**Files:**
- Create: `actuator/frontend/js/pages/trip-sheet-history.js`
- Modify: `actuator/frontend/js/pages/trip-sheet.js`

**Interfaces:**
- Produces: `renderHistoryTab(container, tripId)`.

- [ ] **Step 1: Implement `trip-sheet-history.js`**

```js
import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';

export function renderHistoryTab(container, tripId) {
  const tripRecordIds = new Set([
    tripId,
    ...store.state.legs.filter((l) => l.tripId === tripId).map((l) => l.id),
    ...store.state.stops.filter((s) => s.tripId === tripId).map((s) => s.id),
    ...store.state.services.filter((s) => s.tripId === tripId).map((s) => s.id),
  ]);
  const entries = store.state.audit.filter((a) => tripRecordIds.has(a.recordId)).sort((a, b) => b.timestampZ.localeCompare(a.timestampZ));

  container.innerHTML = `
    <h2>History</h2>
    <table>
      <thead><tr><th>When</th><th>Who</th><th>Record</th><th>Field</th><th>Change</th></tr></thead>
      <tbody>
        ${entries.map((a) => `
          <tr>
            <td>${escapeHtml(a.timestampZ)}</td><td>${escapeHtml(a.user)}</td>
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

Since every branch in `renderTabContent` is now handled explicitly, replace the final `else` fallback (the "implemented in a later task" placeholder from Task 11) — there should be no remaining unhandled tab.

- [ ] **Step 3: Manually verify**

On the History tab for TRIP-0041, expected: entries for `LEG-0041-2`'s ETD change and `SVC-0041-04`'s flip to `RECONFIRM_REQUIRED` from the seed data, plus any new entries created by Tasks 12/13's manual verification (the added service, the sent comm/status change), newest first.

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/trip-sheet-history.js frontend/js/pages/trip-sheet.js
git commit -m "Add History tab showing field-level audit trail per trip"
```

---

### Task 15: Trip creation wizard

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
const header = { tripCode: '', clientOperator: '', registration: '', ownerName: '' };
let draftLegs = [{ depIcao: '', arrIcao: '', etdZ: '', etaZ: '', pax: 0, crew: 0, overflightCountries: [] }];

function render() {
  const container = document.getElementById('wizard-container');

  if (step === 1) {
    container.innerHTML = `
      <div class="field"><label for="tripCode">Trip Code</label><input id="tripCode" value="${escapeHtml(header.tripCode)}" /></div>
      <div class="field"><label for="clientOperator">Client/Operator</label><input id="clientOperator" value="${escapeHtml(header.clientOperator)}" /></div>
      <div class="field"><label for="registration">Registration</label><input id="registration" value="${escapeHtml(header.registration)}" /></div>
      <div class="field"><label for="ownerName">Owner</label><input id="ownerName" value="${escapeHtml(header.ownerName)}" /></div>
      <button id="next-to-legs" class="btn btn-primary">Next: Legs</button>
    `;
    for (const field of ['tripCode', 'clientOperator', 'registration', 'ownerName']) {
      document.getElementById(field).addEventListener('input', (e) => { header[field] = e.target.value; });
    }
    document.getElementById('next-to-legs').addEventListener('click', () => { step = 2; render(); });
    return;
  }

  if (step === 2) {
    container.innerHTML = `
      ${draftLegs.map((leg, i) => `
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:0.5rem;">
          <div class="field"><label for="dep-${i}">Dep ICAO</label><input id="dep-${i}" value="${escapeHtml(leg.depIcao)}" /></div>
          <div class="field"><label for="arr-${i}">Arr ICAO</label><input id="arr-${i}" value="${escapeHtml(leg.arrIcao)}" /></div>
          <div class="field"><label for="overflight-${i}">Overflight Countries (ISO2, comma-separated)</label><input id="overflight-${i}" value="${escapeHtml(leg.overflightCountries.join(', '))}" placeholder="e.g. ET, KE" /></div>
          <div class="field"><label for="etd-${i}">ETD (Z)</label><input id="etd-${i}" type="datetime-local" value="${leg.etdZ}" /></div>
          <div class="field"><label for="eta-${i}">ETA (Z)</label><input id="eta-${i}" type="datetime-local" value="${leg.etaZ}" /></div>
          <div class="field"><label for="pax-${i}">Pax</label><input id="pax-${i}" type="number" min="0" value="${leg.pax}" /></div>
          <div class="field"><label for="crew-${i}">Crew</label><input id="crew-${i}" type="number" min="0" value="${leg.crew}" /></div>
        </div>
      `).join('')}
      <button id="add-leg-row" class="btn">Add another leg</button>
      <div><button id="review-stops-btn" class="btn btn-primary">Review Stops</button></div>
    `;
    draftLegs.forEach((_, i) => {
      document.getElementById(`dep-${i}`).addEventListener('input', (e) => { draftLegs[i].depIcao = e.target.value.toUpperCase(); });
      document.getElementById(`arr-${i}`).addEventListener('input', (e) => { draftLegs[i].arrIcao = e.target.value.toUpperCase(); });
      document.getElementById(`overflight-${i}`).addEventListener('input', (e) => {
        draftLegs[i].overflightCountries = e.target.value.split(',').map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0);
      });
      document.getElementById(`etd-${i}`).addEventListener('input', (e) => { draftLegs[i].etdZ = e.target.value; });
      document.getElementById(`eta-${i}`).addEventListener('input', (e) => { draftLegs[i].etaZ = e.target.value; });
      document.getElementById(`pax-${i}`).addEventListener('input', (e) => { draftLegs[i].pax = Number(e.target.value) || 0; });
      document.getElementById(`crew-${i}`).addEventListener('input', (e) => { draftLegs[i].crew = Number(e.target.value) || 0; });
    });
    document.getElementById('add-leg-row').addEventListener('click', () => {
      draftLegs.push({ depIcao: '', arrIcao: '', etdZ: '', etaZ: '', pax: 0, crew: 0, overflightCountries: [] });
      render();
    });
    document.getElementById('review-stops-btn').addEventListener('click', () => { step = 3; render(); });
    return;
  }

  const previewLegs = draftLegs
    .filter((l) => l.depIcao && l.arrIcao && l.etdZ && l.etaZ)
    .map((l, i) => ({ ...l, id: `preview-${i}`, tripId: 'preview', sequence: i + 1, revision: 0, etdZ: new Date(l.etdZ).toISOString(), etaZ: new Date(l.etaZ).toISOString() }));
  const previewStops = deriveStopsFromLegs('preview', previewLegs);

  container.innerHTML = `
    <h3>Derived Stops</h3>
    <ul>${previewStops.map((s) => `<li>${escapeHtml(s.icao)} — ${escapeHtml(s.purpose)}</li>`).join('')}</ul>
    <button id="confirm-trip-btn" class="btn btn-primary">Confirm Trip</button>
  `;
  document.getElementById('confirm-trip-btn').addEventListener('click', () => {
    const trip = store.addTrip({ ...header, status: 'DRAFT', notifyRecipients: [] });
    const createdLegs = draftLegs.map((l, i) => store.addLeg({
      tripId: trip.id, sequence: i + 1, depIcao: l.depIcao, arrIcao: l.arrIcao,
      etdZ: new Date(l.etdZ).toISOString(), etaZ: new Date(l.etaZ).toISOString(),
      pax: l.pax, crew: l.crew, overflightCountries: l.overflightCountries,
    }));
    store.addStops(deriveStopsFromLegs(trip.id, createdLegs));
    window.location.href = `trip-sheet.html?id=${encodeURIComponent(trip.id)}`;
  });
}

render();
```

- [ ] **Step 3: Manually verify**

Visit `http://localhost:8080/trip-new.html`. Fill in header fields, click Next: Legs, enter `HTDA` → `HKJK` with an ETD/ETA a few hours apart, click Review Stops — expected: derived stops list shows `HTDA — TURNAROUND` and `HKJK — TURNAROUND`. Click Confirm Trip — expected: the browser navigates to the new trip's Trip Sheet, and its Itinerary tab shows the entered leg.

- [ ] **Step 4: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/trip-new.html frontend/js/pages/trip-wizard.js
git commit -m "Add trip creation wizard (header, legs, derived-stops review)"
```

---

### Task 16: Reference Data pages

**Files:**
- Create: `actuator/frontend/js/pages/reference.js`
- Create: `actuator/frontend/reference-airports.html`, `reference-aircraft.html`, `reference-providers.html`, `reference-country-rules.html`

**Interfaces:**
- Produces: `renderReferencePage({ title, columns, rowsSelector })` where `columns` is `{ key, label }[]` and `rowsSelector` is `(state) => row[]`. Each of the 4 HTML pages calls this with its own config via an inline `<script type="module">`.

- [ ] **Step 1: Implement `reference.js`**

```js
import { store } from '../lib/store.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';

export function renderReferencePage({ title, columns, rowsSelector }) {
  function render() {
    mountNav();
    document.getElementById('reference-title').textContent = title;
    const rows = rowsSelector(store.state);
    document.getElementById('reference-table').innerHTML = `
      <table>
        <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}
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
    <div id="reference-table"></div>
  </main>
  <script type="module">
    import { renderReferencePage } from './js/pages/reference.js';
    renderReferencePage({
      title: 'Providers',
      columns: [
        { key: 'name', label: 'Name' }, { key: 'serviceType', label: 'Service Type' },
        { key: 'scopeIcao', label: 'ICAO Scope' }, { key: 'scopeIso2', label: 'Country Scope' }, { key: 'email', label: 'Email' },
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
    <div id="reference-table"></div>
  </main>
  <script type="module">
    import { renderReferencePage } from './js/pages/reference.js';
    renderReferencePage({
      title: 'Country Rules',
      columns: [
        { key: 'countryIso2', label: 'Country' }, { key: 'serviceType', label: 'Service Type' },
        { key: 'leadTimeHours', label: 'Lead Time (h)' }, { key: 'workingDaysOnly', label: 'Working Days Only' },
        { key: 'toleranceHours', label: 'Tolerance (h)' }, { key: 'escalationContact', label: 'Escalation Contact' },
      ],
      rowsSelector: (state) => state.countryRules,
    });
  </script>
</body>
</html>
```

- [ ] **Step 6: Run the full logic-layer test suite**

Run: `npm test` (from `actuator/frontend`)
Expected: PASS across every suite from Tasks 2-10, 13 (core-logic, reference, trips, scope, stops, store, trips-filter, templates).

- [ ] **Step 7: Commit**

```bash
cd "C:/Backups/InsiderTechSol/Aviation/actuator"
git add frontend/js/pages/reference.js frontend/reference-airports.html frontend/reference-aircraft.html frontend/reference-providers.html frontend/reference-country-rules.html
git commit -m "Add Reference Data pages for Airports, Aircraft, Providers, Country Rules"
```

---

## Post-plan verification

After Task 16, with the static server still running (`npx http-server actuator/frontend -p 8080` from Task 9), walk the full golden path:

1. `http://localhost:8080/index.html` — Action Board shows unconfirmed seeded services, sorted by urgency, excluding the two `CONFIRMED` ones.
2. `http://localhost:8080/trips.html` — both seeded trips listed; search and status filter both work; "New Trip" link present.
3. `http://localhost:8080/trip-sheet.html?id=TRIP-0041` — all 4 tabs render; editing LEG-0041-2's ETD by more than its tightest attached service's tolerance flips that service to Re-confirm Required and it reappears on the Action Board; Rebuild Stops runs without error; Add Service on the Services tab only offers valid scope candidates per selected type; Composer pre-fills the correlation token and Send logs a Comm and flips the service to Requested; History tab shows all of the above as audit entries, newest first.
4. `http://localhost:8080/trip-new.html` — wizard completes header → legs → derived-stops review → Confirm Trip, and lands on the new trip's Trip Sheet with the entered leg visible.
5. All four `reference-*.html` pages render their seeded rows with the shared nav present.

## Follow-up: Next.js conversion

Once this page flow is validated, converting to Next.js means: keep every file under `js/lib/` unchanged (rename `.js` to `.ts` and add type annotations if desired — the logic and its tests carry over as-is), replace `store.js`'s subscribe/notify pattern with a React Context following the same method signatures, and rewrite each `js/pages/*.js` module as a React component that calls the equivalent `store.*` methods instead of manipulating `innerHTML` directly. The HTML page structure (one route per file) maps directly onto the Next.js App Router file-per-route convention.
