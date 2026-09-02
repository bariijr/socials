# VIQ Trip Core Rewire (Trips/Legs/Stops/Services) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire Trips, Legs, Stops, and Services in VIQ's React frontend from `src/client/lib/dataStore.ts`'s localStorage-only functions to real `fetch()` calls against the existing NestJS API, adding two small Prisma schema fields the frontend needs that the backend doesn't have yet.

**Architecture:** `dataStore.ts` keeps its existing exported function names (so the 13 consuming pages don't need new import names) but every Trips/Legs/Stops/Services function becomes `async` and calls the API via the existing `apiFetch()` helper (bearer-token attachment from sub-project 1) instead of localStorage. A thin mapper layer in `dataStore.ts` converts between the API's camelCase JSON and the frontend's PascalCase `Trip`/`Leg`/`Stop`/`Service` types. Pages that called these functions synchronously at render time move to `useEffect`-driven fetch + local `useState`.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL 16 (backend, already running); React 18 + Vite, no new frontend dependency (plain `useEffect`/`useState`, no react-query/SWR).

**Spec:** `docs/superpowers/specs/2026-08-23-viq-trip-core-rewire-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction carried over from sub-project 1 (auth). Every task's "commit" step below is replaced with a filesystem snapshot note in the ledger, per the pattern already established in `.sdd/2026-08-22-viq-auth-minimal/progress.md`.
- No new frontend data-fetching library. Plain `useEffect` + `useState`.
- `dataStore.ts` and every page file in this plan already has `// @ts-nocheck` at the top — the TypeScript compiler will NOT catch a missed `await` or a wrong argument. Manual/browser verification is the only safety net; each task's verification step is not optional.
- Do not touch reference-data loading (`refAirports`/`refCountries`/`refOperators`/etc.) — stays bundled JSON, out of scope.
- Do not touch Persons, Comms, Docs, Invoices, Audit-reading, Settings, or Backup/Restore functions in `dataStore.ts` — out of scope, later slices.
- Drop the client-side `addAuditEntry(...)` calls inside every function this plan touches (Trip/Leg/Stop/Service CRUD) — the backend already writes an audit entry on each mutation via the `user` field. `addAuditEntry` itself and `getAudit()` stay defined and untouched (other resources still use them).
- API base path is `/api` (via `apiFetch`'s `API_BASE` constant) — pass paths to `apiFetch`/the mapper helpers WITHOUT the `/api` prefix (e.g. `/trips`, not `/api/trips`).
- Postgres for this project runs in the `jetflow_api_postgres` container on host port 5442 (already running — confirm with `docker ps` before starting work, don't start a second one).

---

### Task 1: Backend — add the missing Trip/Leg fields (Prisma migration + DTOs)

**Files:**
- Modify: `prisma/schema.prisma` (`Trip` model, `Leg` model)
- Modify: `src/server/modules/trips/dto/create-trip.dto.ts`
- Modify: `src/server/modules/legs/dto/create-leg.dto.ts`
- Create: a new Prisma migration (via `npm run prisma:migrate`, do not hand-write the SQL)

**Interfaces:**
- Produces: `Trip` rows carry `aircraftIcaoType: string | null`, `aircraftMtowKg: number | null`, `aircraftSerialNumber: string | null`. `Leg` rows carry `purpose: string | null`, `avoidFirs: string[]`, `includeFirs: string[]`, `routing: string | null`. All four already flow through `UpdateTripDto`/`UpdateLegDto` automatically (`PartialType(OmitType(CreateXDto, [...]))`), no separate edit needed there.

- [ ] **Step 1: Add the three Trip fields to the Prisma schema**

In `prisma/schema.prisma`, find the `Trip` model (starts `model Trip {`, currently ends with `notes         String?` then a blank line before `legs     Leg[]`). Add these three lines immediately after the `notes` field:

```prisma
  aircraftIcaoType    String?  @map("aircraft_icao_type")
  aircraftMtowKg      Float?   @map("aircraft_mtow_kg")
  aircraftSerialNumber String? @map("aircraft_serial_number")
```

- [ ] **Step 2: Add the four Leg fields to the Prisma schema**

In the same file, find the `Leg` model (starts `model Leg {`, currently ends with `callSign           String?  @map("call_sign")` then a blank line before `trip Trip @relation(...)`). Add these four lines immediately after the `callSign` field:

```prisma
  purpose            String?
  avoidFirs          String[] @map("avoid_firs")
  includeFirs        String[] @map("include_firs")
  routing            String?
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npm run prisma:migrate -- --name add_trip_aircraft_and_leg_routing_fields`

When prompted for a migration name (if the `--name` flag doesn't suppress the prompt on this Prisma version), type `add_trip_aircraft_and_leg_routing_fields`.

Expected: a new directory under `prisma/migrations/` containing a `migration.sql` that adds the 7 columns via `ALTER TABLE "trips" ADD COLUMN ...` / `ALTER TABLE "legs" ADD COLUMN ...`, and the command exits 0 with "Your database is now in sync with your schema."

- [ ] **Step 4: Add the fields to CreateTripDto**

In `src/server/modules/trips/dto/create-trip.dto.ts`, add after the existing `notes` field (before the closing `user?: string;` audit field):

```typescript
  @IsOptional()
  @IsString()
  aircraftIcaoType?: string;

  @IsOptional()
  aircraftMtowKg?: number;

  @IsOptional()
  @IsString()
  aircraftSerialNumber?: string;
```

- [ ] **Step 5: Add the fields to CreateLegDto**

In `src/server/modules/legs/dto/create-leg.dto.ts`, add after the existing `callSign` field (before the `user?: string;` audit field):

```typescript
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidFirs?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeFirs?: string[];

  @IsOptional()
  @IsString()
  routing?: string;
```

- [ ] **Step 6: Verify the build and the new fields round-trip**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

Run (with the server started per `npm run start:prod` in a separate terminal, and a valid bearer token from `POST /api/auth/login` as `admin`/`Admin123!`):

```powershell
$token = (Invoke-RestMethod -Method POST http://localhost:4001/api/auth/login -Body (@{username='admin';password='Admin123!'} | ConvertTo-Json) -ContentType 'application/json').accessToken
Invoke-RestMethod -Method PATCH "http://localhost:4001/api/trips/<any existing tripId from GET /api/trips>" -Headers @{Authorization="Bearer $token"} -Body (@{aircraftIcaoType='B738'; aircraftMtowKg=79000; aircraftSerialNumber='SN-TEST-1'} | ConvertTo-Json) -ContentType 'application/json'
```

Expected: `200`, response body includes `"aircraftIcaoType":"B738","aircraftMtowKg":79000,"aircraftSerialNumber":"SN-TEST-1"`. Re-fetch the same trip with `GET /api/trips/<tripId>` and confirm the three fields persisted.

- [ ] **Step 7: Snapshot (no git commit)**

Per the Global Constraints, do not `git commit`. Note in your report file that `prisma/schema.prisma`, the new migration directory, `create-trip.dto.ts`, and `create-leg.dto.ts` are the files changed by this task.

---

### Task 2: Frontend — rewire `dataStore.ts`'s Trip/Leg/Stop/Service functions to the API

**Files:**
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Consumes: `apiFetch(path, options)` from `src/client/lib/apiClient.ts` — `path` excludes the `/api` prefix, returns a `Promise<Response>`, already attaches the bearer token.
- Produces (all now `async`, replacing the current sync signatures — every later task in this plan calls these exact names/signatures):
  - `getTrips(): Promise<Trip[]>`
  - `getTrip(tripId: string): Promise<Trip | undefined>`
  - `nextTripId(): Promise<string>`
  - `saveTrip(trip: Trip, user?: string): Promise<Trip>`
  - `deleteTrip(tripId: string, user?: string): Promise<void>`
  - `getLegs(): Promise<Leg[]>`
  - `getLegsForTrip(tripId: string): Promise<Leg[]>`
  - `saveLeg(leg: Leg, user?: string): Promise<Leg>`
  - `deleteLeg(legId: string, user?: string): Promise<void>`
  - `getStops(): Promise<Stop[]>`
  - `getStopsForTrip(tripId: string): Promise<Stop[]>`
  - `saveStop(stop: Stop, user?: string): Promise<Stop>`
  - `deleteStop(stopId: string, user?: string): Promise<void>`
  - `getServices(): Promise<Service[]>`
  - `getServicesForTrip(tripId: string): Promise<Service[]>`
  - `saveService(service: Service, user?: string): Promise<Service>`
  - `deleteService(svcId: string, user?: string): Promise<void>`
  - `computeCountriesOverflown(depICAO: string, arrICAO: string): Promise<string[]>`
  - `generateOverflightServices(legId: string, user?: string): Promise<Service[]>` — **signature change: takes `legId: string`, not the whole `Leg` object.**
  - `generateArrivalServices(legId: string, opts?: { departureGroundHandling?: boolean }, user?: string): Promise<Service[]>` — **same signature change.**
  - `getTripSheet(tripId: string): Promise<TripSheet | null>` — unchanged name/shape, now async internally.

- [ ] **Step 1: Add the `apiFetch` import**

At the top of `src/client/lib/dataStore.ts`, after the existing `import { computeOverflightCountries, computeUrgency } from './geo';` line (line 30), add:

```typescript
import { apiFetch } from './apiClient';
```

- [ ] **Step 2: Add the mapper helpers and the `apiJson` request helper**

Immediately before the `// ─── Trip CRUD ────` comment (currently line 230), insert:

```typescript
// ─── API <-> Frontend field mappers ────────────────────────────────────────
// Trip/Leg/Stop/Service only — the four resources this rewire covers. API
// responses are camelCase (Prisma/NestJS convention); frontend types in
// data/types.ts are PascalCase. These are mechanical field renames, no logic.

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function mapTripFromApi(t: any): Trip {
  return {
    TripID: t.tripId,
    Client: t.client,
    Operator: t.operator ?? '',
    Registration: t.registration ?? '',
    Status: t.status,
    Owner: t.owner ?? '',
    CreatedZ: t.createdZ,
    SupportRef: t.supportRef ?? undefined,
    OperationType: t.operationType ?? undefined,
    MissionType: t.missionType ?? undefined,
    AircraftICAOType: t.aircraftIcaoType ?? undefined,
    AircraftMTOWKg: t.aircraftMtowKg ?? undefined,
    AircraftSerialNumber: t.aircraftSerialNumber ?? undefined,
    Notes: t.notes ?? undefined,
  };
}

function mapTripToApi(trip: Trip): Record<string, unknown> {
  return {
    tripId: trip.TripID,
    client: trip.Client,
    operator: trip.Operator,
    registration: trip.Registration,
    status: trip.Status,
    owner: trip.Owner,
    supportRef: trip.SupportRef,
    operationType: trip.OperationType,
    missionType: trip.MissionType,
    aircraftIcaoType: trip.AircraftICAOType,
    aircraftMtowKg: trip.AircraftMTOWKg,
    aircraftSerialNumber: trip.AircraftSerialNumber,
    notes: trip.Notes,
  };
}

function mapLegFromApi(l: any): Leg {
  return {
    LegID: l.legId,
    TripID: l.tripId,
    Seq: l.seq,
    DepICAO: l.depIcao,
    ArrICAO: l.arrIcao,
    ETDZ: l.etdZ,
    ETAZ: l.etaZ,
    BlockHours: l.blockHours,
    PaxCount: l.paxCount,
    CrewCount: l.crewCount,
    CountriesOverflown: l.countriesOverflown ?? [],
    Revision: l.revision,
    CallSign: l.callSign ?? undefined,
    Purpose: l.purpose ?? undefined,
    AvoidFIRs: l.avoidFirs ?? undefined,
    IncludeFIRs: l.includeFirs ?? undefined,
    Routing: l.routing ?? undefined,
  };
}

function mapLegToApi(leg: Leg): Record<string, unknown> {
  return {
    legId: leg.LegID,
    tripId: leg.TripID,
    seq: leg.Seq,
    depIcao: leg.DepICAO,
    arrIcao: leg.ArrICAO,
    etdZ: leg.ETDZ,
    etaZ: leg.ETAZ,
    blockHours: leg.BlockHours,
    paxCount: leg.PaxCount,
    crewCount: leg.CrewCount,
    countriesOverflown: leg.CountriesOverflown,
    revision: leg.Revision,
    callSign: leg.CallSign,
    purpose: leg.Purpose,
    avoidFirs: leg.AvoidFIRs,
    includeFirs: leg.IncludeFIRs,
    routing: leg.Routing,
  };
}

function mapStopFromApi(s: any): Stop {
  return {
    StopID: s.stopId,
    TripID: s.tripId,
    ICAO: s.icao,
    ArrZ: s.arrZ,
    DepZ: s.depZ,
    GroundTimeHours: s.groundTimeHours,
    Purpose: s.purpose,
  };
}

function mapStopToApi(stop: Stop): Record<string, unknown> {
  return {
    stopId: stop.StopID,
    tripId: stop.TripID,
    icao: stop.ICAO,
    arrZ: stop.ArrZ,
    depZ: stop.DepZ,
    groundTimeHours: stop.GroundTimeHours,
    purpose: stop.Purpose,
  };
}

function mapServiceFromApi(s: any): Service {
  return {
    SVCID: s.svcId,
    TripID: s.tripId,
    ScopeType: s.scopeType,
    ScopeID: s.scopeId,
    ServiceType: s.serviceType,
    ProviderID: s.providerId ?? null,
    Status: s.status,
    RefNumber: s.refNumber,
    BasedOnETDZ: s.basedOnEtdZ,
    RequiredByZ: s.requiredByZ,
    Urgency: s.urgency,
    AssignedTo: s.assignedTo,
    Notes: s.notes,
    SubItems: s.subItems ?? undefined,
    ConfirmedBy: s.confirmedBy ?? undefined,
    ConfirmedAtZ: s.confirmedAtZ ?? undefined,
    ValidityZ: s.validityZ ?? undefined,
    SentToCaptain: s.sentToCaptain ?? undefined,
    Attachments: s.attachments ?? undefined,
    CountryISO2: s.countryIso2 ?? undefined,
  };
}

function mapServiceToApi(service: Service): Record<string, unknown> {
  return {
    svcId: service.SVCID,
    tripId: service.TripID,
    scopeType: service.ScopeType,
    scopeId: service.ScopeID,
    serviceType: service.ServiceType,
    providerId: service.ProviderID,
    status: service.Status,
    refNumber: service.RefNumber,
    basedOnEtdZ: service.BasedOnETDZ,
    requiredByZ: service.RequiredByZ,
    urgency: service.Urgency,
    assignedTo: service.AssignedTo,
    notes: service.Notes,
    subItems: service.SubItems,
    confirmedBy: service.ConfirmedBy,
    confirmedAtZ: service.ConfirmedAtZ,
    validityZ: service.ValidityZ,
    sentToCaptain: service.SentToCaptain,
    attachments: service.Attachments,
    countryIso2: service.CountryISO2,
  };
}
```

- [ ] **Step 3: Replace Trip CRUD (lines 230-272, from `// ─── Trip CRUD ───` through the closing brace of `deleteTrip`)**

Replace the entire block (the comment line plus all five functions `getTrips`/`getTrip`/`nextTripId`/`saveTrip`/`deleteTrip`) with:

```typescript
// ─── Trip CRUD ────────────────────────────────────────────────────────────────

export async function getTrips(): Promise<Trip[]> {
  const rows = await apiJson<any[]>('/trips');
  return rows.map(mapTripFromApi);
}

export async function getTrip(tripId: string): Promise<Trip | undefined> {
  try {
    const row = await apiJson<any>(`/trips/${tripId}`);
    return mapTripFromApi(row);
  } catch {
    return undefined;
  }
}

export async function nextTripId(): Promise<string> {
  const { tripId } = await apiJson<{ tripId: string }>('/trips/next-id');
  return tripId;
}

export async function saveTrip(trip: Trip, user = 'SYSTEM'): Promise<Trip> {
  const existing = await getTrip(trip.TripID);
  const body = JSON.stringify({ ...mapTripToApi(trip), user });
  const row = existing
    ? await apiJson<any>(`/trips/${trip.TripID}`, { method: 'PATCH', body })
    : await apiJson<any>('/trips', { method: 'POST', body });
  return mapTripFromApi(row);
}

export async function deleteTrip(tripId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/trips/${tripId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Replace Leg CRUD (the `// ─── Leg CRUD ───` block through the closing brace of `deleteLeg`)**

```typescript
// ─── Leg CRUD ─────────────────────────────────────────────────────────────────

export async function getLegs(): Promise<Leg[]> {
  const rows = await apiJson<any[]>('/legs');
  return rows.map(mapLegFromApi);
}

export async function getLegsForTrip(tripId: string): Promise<Leg[]> {
  const legs = await getLegs();
  return legs.filter((l) => l.TripID === tripId).sort((a, b) => a.Seq - b.Seq);
}

export async function saveLeg(leg: Leg, user = 'SYSTEM'): Promise<Leg> {
  const legs = await getLegsForTrip(leg.TripID);
  const exists = legs.some((l) => l.LegID === leg.LegID);
  const body = JSON.stringify({ ...mapLegToApi(leg), user });
  const row = exists
    ? await apiJson<any>(`/legs/${leg.LegID}`, { method: 'PATCH', body })
    : await apiJson<any>('/legs', { method: 'POST', body });
  return mapLegFromApi(row);
}

export async function deleteLeg(legId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/legs/${legId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}
```

- [ ] **Step 5: Replace Stop CRUD (the `// ─── Stop CRUD ───` block through the closing brace of `deleteStop`)**

```typescript
// ─── Stop CRUD ────────────────────────────────────────────────────────────────

export async function getStops(): Promise<Stop[]> {
  const rows = await apiJson<any[]>('/stops');
  return rows.map(mapStopFromApi);
}

export async function getStopsForTrip(tripId: string): Promise<Stop[]> {
  const stops = await getStops();
  return stops.filter((s) => s.TripID === tripId);
}

export async function saveStop(stop: Stop, user = 'SYSTEM'): Promise<Stop> {
  const stops = await getStopsForTrip(stop.TripID);
  const exists = stops.some((s) => s.StopID === stop.StopID);
  const body = JSON.stringify({ ...mapStopToApi(stop), user });
  const row = exists
    ? await apiJson<any>(`/stops/${stop.StopID}`, { method: 'PATCH', body })
    : await apiJson<any>('/stops', { method: 'POST', body });
  return mapStopFromApi(row);
}

export async function deleteStop(stopId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/stops/${stopId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}
```

- [ ] **Step 6: Replace Service CRUD + compute/generate (the `// ─── Service CRUD ───` block through the closing brace of `generateArrivalServices`, i.e. through the original line ~483)**

This removes `getServices`, `getServicesForTrip`, `saveService`, `deleteService`, `computeCountriesOverflown`, `generateOverflightServices`, `generateArrivalServices` and replaces them with:

```typescript
// ─── Service CRUD ─────────────────────────────────────────────────────────────

export async function getServices(): Promise<Service[]> {
  const rows = await apiJson<any[]>('/services');
  return rows.map(mapServiceFromApi);
}

export async function getServicesForTrip(tripId: string): Promise<Service[]> {
  const rows = await apiJson<any[]>(`/services?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapServiceFromApi);
}

export async function saveService(service: Service, user = 'SYSTEM'): Promise<Service> {
  const services = await getServicesForTrip(service.TripID);
  const exists = services.some((s) => s.SVCID === service.SVCID);
  const body = JSON.stringify({ ...mapServiceToApi(service), user });
  const row = exists
    ? await apiJson<any>(`/services/${service.SVCID}`, { method: 'PATCH', body })
    : await apiJson<any>('/services', { method: 'POST', body });
  return mapServiceFromApi(row);
}

export async function deleteService(svcId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/services/${svcId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}

// Server-side great-circle route computation (see backend src/common/geo.util.ts).
export async function computeCountriesOverflown(depICAO: string, arrICAO: string): Promise<string[]> {
  const { countriesOverflown } = await apiJson<{ countriesOverflown: string[] }>(
    `/legs/compute-overflight?dep=${encodeURIComponent(depICAO)}&arr=${encodeURIComponent(arrICAO)}`
  );
  return countriesOverflown;
}

// Thin wrappers around the backend's idempotent service-generation endpoints.
// Takes legId (not a Leg object) — callers that had a Leg object pass leg.LegID.
export async function generateOverflightServices(legId: string, user = 'SYSTEM'): Promise<Service[]> {
  const rows = await apiJson<any[]>(
    `/services/legs/${legId}/generate-overflight?user=${encodeURIComponent(user)}`,
    { method: 'POST' }
  );
  return rows.map(mapServiceFromApi);
}

export async function generateArrivalServices(
  legId: string,
  opts: { departureGroundHandling?: boolean } = {},
  user = 'SYSTEM'
): Promise<Service[]> {
  const params = new URLSearchParams({ user });
  if (opts.departureGroundHandling) params.set('departureGroundHandling', 'true');
  const rows = await apiJson<any[]>(`/services/legs/${legId}/generate-arrival?${params}`, { method: 'POST' });
  return rows.map(mapServiceFromApi);
}
```

- [ ] **Step 7: Update `getTripSheet`**

Find `export function getTripSheet(tripId: string): TripSheet | null {` near the end of the file (originally around line 1048). Replace the whole function body with:

```typescript
export async function getTripSheet(tripId: string): Promise<TripSheet | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;
  const [legs, stops, services] = await Promise.all([
    getLegsForTrip(tripId),
    getStopsForTrip(tripId),
    getServicesForTrip(tripId),
  ]);
  return {
    trip,
    legs,
    stops,
    services,
    comms: getCommsForTrip(tripId),
    persons: getPersonsForTrip(tripId),
    docs: getDocsForTrip(tripId),
  };
}
```

Also update the `TripSheet` interface declaration immediately above it — no field changes needed, just leave it as-is (it already matches this shape).

- [ ] **Step 8: Clean up now-dead localStorage seeding for these four resources**

In `initDataStore()` (originally lines 190-204), remove these four lines:

```typescript
  setTx(LS_KEYS.trips, seedTrips);
  setTx(LS_KEYS.legs, seedLegs);
  setTx(LS_KEYS.stops, seedStops);
  setTx(LS_KEYS.services, seedServices);
```

Leave `setTx(LS_KEYS.comms, ...)`, `setTx(LS_KEYS.audit, ...)`, `setTx(LS_KEYS.persons, ...)`, `setTx(LS_KEYS.docs, ...)`, `setTx(LS_KEYS.invoices, [])`, and `saveLS(LS_KEYS.initialized, true)` untouched.

In the `import { trips as seedTrips, legs as seedLegs, stops as seedStops, services as seedServices, comms as seedComms, audit as seedAudit, persons as seedPersons, docs as seedDocs } from './seed-data';` line (originally lines 24-28), remove `trips as seedTrips, legs as seedLegs, stops as seedStops, services as seedServices,` — keep `comms as seedComms, audit as seedAudit, persons as seedPersons, docs as seedDocs`.

Run: `grep -n "computeOverflightCountries\|computeUrgency" src/client/lib/dataStore.ts`

The old `computeCountriesOverflown`/`generateOverflightServices`/`generateArrivalServices` bodies were the only callers of `computeOverflightCountries` and `computeUrgency` (both imported from `./geo` at the top of the file) — Task 2's rewrite removed those call sites. If the grep above shows the import line as the ONLY remaining match for each name, remove that name from the `import { computeOverflightCountries, computeUrgency } from './geo';` line (delete the whole line if both are now unused). If either name still shows a match elsewhere in the file (e.g. inside `generateInvoiceFromTrip`, which is out of scope for this plan and untouched), leave the import as-is — don't remove a name that's still used by code this plan doesn't touch.

- [ ] **Step 9: Verify the build**

Run: `npm run build:client`
Expected: exits 0. (TypeScript errors are suppressed by `// @ts-nocheck` in this file, so a clean exit here mainly confirms no syntax errors — Vite/esbuild still parses the file.)

- [ ] **Step 10: Manual verification against the live API**

With the backend running (`npm run start:prod`, Postgres up) and a bearer token from login, open a Node REPL or a short throwaway script importing nothing from the app (this file uses `@/` path aliases that only resolve inside the Vite build) — instead verify via the browser: this task's real verification happens in Task 8's end-to-end pass, since `dataStore.ts` has no standalone entry point. For this task, confirm only that `npm run build:client` succeeds and grep the file to confirm no remaining sync `localStorage` references for trips/legs/stops/services:

Run: `grep -n "LS_KEYS.trips\|LS_KEYS.legs\|LS_KEYS.stops\|LS_KEYS.services" src/client/lib/dataStore.ts`
Expected: no output (all four now come from the API, not localStorage).

- [ ] **Step 11: Snapshot (no git commit)**

Note in your report file that `src/client/lib/dataStore.ts` is the only file changed by this task.

---

### Task 3: Frontend — rewire `TripsPage.tsx`

**Files:**
- Modify: `src/client/pages/TripsPage.tsx`

**Interfaces:**
- Consumes: `getTrips()`, `getLegsForTrip(tripId)`, `getStopsForTrip(tripId)`, `getServicesForTrip(tripId)` (all `Promise`-returning per Task 2). `getCommsForTrip(tripId)` and `getAircraft(reg)`/`formatDate(iso)` stay synchronous (out of scope) — do not change those call sites.

- [ ] **Step 1: Read the full file first**

`src/client/pages/TripsPage.tsx` is 130 lines. Read it completely before editing — the two `getTrips().map(...)` blocks (around lines 27 and 99) render two different views (e.g. a card view and a table view) of the same trip list; both need the same data-loading treatment.

- [ ] **Step 2: Convert the component to fetch on mount**

At the top of the component function, add state for the trip list and its derived per-trip legs/stops/services, plus loading/error:

```tsx
const [trips, setTrips] = useState<Trip[]>([]);
const [legsByTrip, setLegsByTrip] = useState<Record<string, Leg[]>>({});
const [stopsByTrip, setStopsByTrip] = useState<Record<string, Stop[]>>({});
const [servicesByTrip, setServicesByTrip] = useState<Record<string, Service[]>>({});
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  getTrips()
    .then(async (list) => {
      const [legsEntries, stopsEntries, servicesEntries] = await Promise.all([
        Promise.all(list.map(async (t) => [t.TripID, await getLegsForTrip(t.TripID)] as const)),
        Promise.all(list.map(async (t) => [t.TripID, await getStopsForTrip(t.TripID)] as const)),
        Promise.all(list.map(async (t) => [t.TripID, await getServicesForTrip(t.TripID)] as const)),
      ]);
      if (cancelled) return;
      setTrips(list);
      setLegsByTrip(Object.fromEntries(legsEntries));
      setStopsByTrip(Object.fromEntries(stopsEntries));
      setServicesByTrip(Object.fromEntries(servicesEntries));
      setLoading(false);
    })
    .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
  return () => { cancelled = true; };
}, []);

if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;
```

Add `import { useEffect, useState } from 'react';` if not already present, and `import type { Leg, Stop, Service } from '@/data/types';` if `Trip`/`Leg`/`Stop`/`Service` aren't already imported as types.

- [ ] **Step 3: Replace both render-time lookups**

Both `{getTrips().map((trip) => { const legs = getLegsForTrip(trip.TripID); const stops = getStopsForTrip(trip.TripID); ...` blocks (originally around lines 27-30 and 99-101) become:

```tsx
{trips.map((trip) => {
  const legs = legsByTrip[trip.TripID] ?? [];
  const stops = stopsByTrip[trip.TripID] ?? [];
  const services = servicesByTrip[trip.TripID] ?? [];
```

(the second occurrence uses whichever of `legs`/`svcs` variable names the original code used at that spot — keep the same variable names as the surrounding code, just swap the source from a function call to the corresponding `*ByTrip[trip.TripID] ?? []` lookup).

- [ ] **Step 4: Verify — build**

Run: `npm run build:client`
Expected: exits 0.

- [ ] **Step 5: Verify — manual browser check**

With the full stack running (`npm run start:prod`), log in at `http://localhost:4001/login` (`admin`/`Admin123!`), navigate to `/trips`. Expected: the trip list renders (not stuck on "Loading…"), showing the same trips visible via `GET /api/trips`. Stop the backend process, refresh `/trips` — expected: the page shows the error state, not stale cached data (proves it's not silently falling back to localStorage).

- [ ] **Step 6: Snapshot (no git commit)**

---

### Task 4: Frontend — rewire `AdminDashboard.tsx`

**Files:**
- Modify: `src/client/pages/admin/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `getTrips()`, `getServices()`, `getLegs()` (all `Promise`-returning per Task 2).

- [ ] **Step 1: Read the full file first**

163 lines — read completely. It's read-only (a stats dashboard: total/active/planning trip counts, open/urgent/chasing service counts, next-72h legs, and two lists rendering trips/services).

- [ ] **Step 2: Convert to fetch-on-mount**

Add near the top of the component:

```tsx
const [trips, setTrips] = useState<Trip[]>([]);
const [services, setServices] = useState<Service[]>([]);
const [legs, setLegs] = useState<Leg[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  Promise.all([getTrips(), getServices(), getLegs()])
    .then(([t, s, l]) => { if (!cancelled) { setTrips(t); setServices(s); setLegs(l); setLoading(false); } })
    .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
  return () => { cancelled = true; };
}, []);

if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;
```

Add `useEffect`/`useState` to the React import if missing, and `import type { Trip, Leg, Service } from '@/data/types';` if not already present.

- [ ] **Step 3: Replace every `getTrips()`/`getServices()`/`getLegs()` call site with the state variable**

Every occurrence of `getTrips()` (lines ~14, 15, 16, 82, 117 in the original) becomes `trips`; every `getServices()` (lines ~18, 21, 22, 72, 79, 118) becomes `services`; every `getLegs()` (line ~24) becomes `legs`. These were pure computed expressions like `getTrips().filter(...)` — they become `trips.filter(...)` with no other change, since `trips`/`services`/`legs` are already the resolved arrays.

- [ ] **Step 4: Verify — build**

Run: `npm run build:client`
Expected: exits 0.

- [ ] **Step 5: Verify — manual browser check**

Navigate to `/admin/dashboard` (or wherever this page is routed — check `src/client/App.tsx` for the exact path if unsure). Expected: the four stat tiles (Total Trips, Active, Open Services, Urgent) show real counts matching `GET /api/trips` and `GET /api/services`, and the "Upcoming Departures"/"Open Services" lists render.

- [ ] **Step 6: Snapshot (no git commit)**

---

### Task 5: Frontend — rewire `NewTripWizard.tsx`

**Files:**
- Modify: `src/client/pages/admin/NewTripWizard.tsx`

**Interfaces:**
- Consumes: `nextTripId()`, `saveTrip()`, `saveLeg()`, `saveStop()`, `computeCountriesOverflown()`, `generateOverflightServices(legId)`, `generateArrivalServices(legId, opts)` (all `Promise`-returning per Task 2). `savePerson`, `saveAircraft`, `getAircraftList`, `refOperators`, `refAircraftTypes`, `getAircraftType`, `getAirport`, `getCountry` stay synchronous (Persons/reference-data, out of scope) — do not change those call sites.

- [ ] **Step 1: Read the full file first**

751 lines, has `// @ts-nocheck`. Read it completely — pay particular attention to line ~309 (`const [tripId] = useState(nextTripId());`) and the submit handler around lines 450-465.

- [ ] **Step 2: Fix the `nextTripId()` useState initializer — this is the one call site that cannot just add `await`**

`const [tripId] = useState(nextTripId());` (line ~309) seeds React state directly with a function call — but `nextTripId()` now returns a `Promise<string>`, not a `string`, so this would set `tripId` to a Promise object. Replace with:

```tsx
const [tripId, setTripId] = useState('');
useEffect(() => {
  nextTripId().then(setTripId);
}, []);
```

Every other reference to `tripId` in the file continues to work unchanged (it's still a plain `string` once resolved — it just starts as `''` for one render instead of being populated synchronously on mount). If the wizard displays `tripId` in its header/UI immediately, that display will briefly show blank/empty and then populate — acceptable, matches the loading-state pattern used elsewhere in this plan.

- [ ] **Step 3: Update the route-computation call site**

Around line 375, `merged.CountriesOverflown = computeCountriesOverflown(merged.DepICAO, merged.ArrICAO);` is inside some handler — find that handler's declaration and add `async` to it if not already async, then change the line to:

```tsx
merged.CountriesOverflown = await computeCountriesOverflown(merged.DepICAO, merged.ArrICAO);
```

- [ ] **Step 4: Update the submit handler (around lines 450-465)**

The handler containing `saveTrip(trip); ... saveLeg(l as Leg); generateOverflightServices(l as Leg); generateArrivalServices(l as Leg, { departureGroundHandling: depGHRequested[idx] }); ... saveStop(s as Stop);` must be `async` (add `async` to its declaration if not already), and every one of those calls needs `await`, with the two `generate*` calls passing `.LegID` instead of the leg object:

```tsx
await saveTrip(trip);
// ... existing loop structure unchanged, but per-leg:
await saveLeg(l as Leg);
await generateOverflightServices((l as Leg).LegID);
await generateArrivalServices((l as Leg).LegID, { departureGroundHandling: depGHRequested[idx] });
// ... and per-stop:
await saveStop(s as Stop);
```

Preserve the existing loop structure (`forEach`/`for...of`/whatever the original uses) — if it's currently a `.forEach(...)` with these calls inside, convert it to a `for...of` loop so `await` works correctly inside it (an `async` callback passed to `.forEach` does not get awaited by `.forEach` itself, which would let the wizard navigate away before saves complete).

- [ ] **Step 5: Verify — build**

Run: `npm run build:client`
Expected: exits 0.

- [ ] **Step 6: Verify — manual browser check**

Navigate to the New Trip Wizard (check `App.tsx` for its route), confirm a Trip ID auto-populates within the wizard header shortly after the page loads (not immediately, per Step 2's change). Complete the wizard for a test trip with at least one leg, submit, then navigate to `/trips` (Task 3) and confirm the new trip appears with its leg and any auto-generated services.

- [ ] **Step 7: Snapshot (no git commit)**

---

### Task 6: Frontend — rewire `AdminTrips.tsx`

**Files:**
- Modify: `src/client/pages/admin/AdminTrips.tsx`

**Interfaces:**
- Consumes: `getTrips()`, `getLegsForTrip(tripId)`, `getStops()`, `saveService()`, `saveLeg()`, `computeCountriesOverflown()`, `generateOverflightServices(legId)`, `generateArrivalServices(legId, opts)` (all `Promise`-returning per Task 2).

- [ ] **Step 1: Read the full file first**

1102 lines, has `// @ts-nocheck`. This page already keeps `localServices`/`localLegs` as React state seeded from `getServices()`/`getLegs()` at mount — that pattern is *most* of the way there already. It's missing equivalent state for `trips` and `stops`, which are currently called fresh inline on every render/memo.

- [ ] **Step 2: Add `trips` and `stops` state, load everything on mount**

Replace:

```tsx
const [localServices, setLocalServices] = useState<Service[]>([...getServices()]);
const [localLegs, setLocalLegs] = useState<Leg[]>([...getLegs()]);
```

with:

```tsx
const [trips, setTrips] = useState<Trip[]>([]);
const [localServices, setLocalServices] = useState<Service[]>([]);
const [localLegs, setLocalLegs] = useState<Leg[]>([]);
const [stops, setStops] = useState<Stop[]>([]);
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  Promise.all([getTrips(), getServices(), getLegs(), getStops()])
    .then(([t, s, l, st]) => {
      if (cancelled) return;
      setTrips(t); setLocalServices(s); setLocalLegs(l); setStops(st); setLoading(false);
    })
    .catch((e) => { if (!cancelled) { setLoadError(e.message); setLoading(false); } });
  return () => { cancelled = true; };
}, []);
```

Add a `reload()` helper right after, used by every mutation handler in Step 4 to re-sync all four collections after a write (simplest correct approach — this page has several interdependent derived views, and a full reload avoids partial-state bugs):

```tsx
const reload = async () => {
  const [t, s, l, st] = await Promise.all([getTrips(), getServices(), getLegs(), getStops()]);
  setTrips(t); setLocalServices(s); setLocalLegs(l); setStops(st);
};
```

Add an early return after the hooks that use `trips`/`localServices`/`localLegs`/`stops` are declared but before the component's main render:

```tsx
if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
if (loadError) return <p className="p-4 text-sm text-destructive">Error: {loadError}</p>;
```

(Place this after the `useMemo`/`useState` hook declarations, not before — React hooks must run unconditionally on every render, so don't return early above existing hooks; only above the JSX return.)

Import `Trip`, `Stop` as types if not already imported from `@/data/types`, and `getTrips`, `getStops` if not already in the `dataStore` import list (grep the existing import line — `getStops` is likely already imported since `getStops().find(...)` is used at lines 703 and 768).

- [ ] **Step 3: Replace direct `getTrips()`/`getStops()` calls with the state**

- Line ~655, 658, 665 (`getTrips()`, inside `filteredTrips` useMemo): replace with `trips` (the memo's dependency array already needs `trips` added alongside `search`/`localServices`).
- Line ~659, 666, 681, 682, 804, 820 (`getLegsForTrip(t.TripID)` / `getLegsForTrip(trip.TripID)`): these read from ALL legs filtered by trip — replace each with a local helper defined once near the top of the component (after the `reload` helper):

```tsx
const legsForTrip = (tripId: string) =>
  localLegs.filter((l) => l.TripID === tripId).sort((a, b) => a.Seq - b.Seq);
```

  then replace every `getLegsForTrip(X)` call site in this file with `legsForTrip(X)`.
- Line ~687 (`getTrips().find(...)` for `selectedTrip`): replace with `trips.find((t) => t.TripID === selectedTripId) || null`.
- Line ~703, 768 (`getStops().find(...)`): replace with `stops.find(...)` (same predicate, just swap the source).

- [ ] **Step 4: Convert the five mutation handlers to `async` + `await`, and call `reload()` after each**

`handleSaveService` (line ~710), `handleAddService` (line ~719), `handleRecalculateRoute` (line ~725), `handleAddDepartureGroundHandling` (line ~739), `handleAddLeg` (line ~746) all currently call `saveService`/`saveLeg`/`computeCountriesOverflown`/`generateOverflightServices`/`generateArrivalServices` synchronously and update local state by hand from the input object. Since these functions now return the persisted row from the server, simplify each handler to await the call(s) then `await reload()` instead of manually patching `localServices`/`localLegs` — this is more correct (reflects actual server state, including anything the server computed like `Urgency`) and removes the need to hand-thread new items into arrays. Worked example — `handleRecalculateRoute`:

```tsx
const handleRecalculateRoute = async (leg: Leg) => {
  const countries = await computeCountriesOverflown(leg.DepICAO, leg.ArrICAO);
  const updated = { ...leg, CountriesOverflown: countries };
  await saveLeg(updated);
  await generateOverflightServices(updated.LegID);
  await generateArrivalServices(updated.LegID);
  await reload();
};
```

Apply the same shape to the other four handlers:

```tsx
const handleSaveService = async (updated: Service) => {
  await saveService(updated);
  await reload();
  setEditorOpen(false);
  setEditingService(null);
};

const handleAddService = async (svc: Service) => {
  await saveService(svc);
  await reload();
  setAddServiceOpen(false);
};

const handleAddDepartureGroundHandling = async (leg: Leg) => {
  await generateArrivalServices(leg.LegID, { departureGroundHandling: true });
  await reload();
};

const handleAddLeg = async (leg: Leg) => {
  await saveLeg(leg);
  await generateOverflightServices(leg.LegID);
  await generateArrivalServices(leg.LegID);
  await reload();
  setAddLegOpen(false);
  setSelectedLegId(leg.LegID);
};
```

Every JSX call site that invokes one of these five handlers (e.g. `onClick={() => handleSaveService(draft)}`) keeps working unchanged — calling an `async` function without awaiting it from an `onClick` is valid, React doesn't need the click handler itself to be awaited.

- [ ] **Step 5: Verify — build**

Run: `npm run build:client`
Expected: exits 0.

- [ ] **Step 6: Verify — manual browser check**

Navigate to the admin trips page (check `App.tsx` for its route). Select a trip, select a leg, click whatever UI action maps to "Recalculate Route" — confirm the countries-overflown list updates and any newly generated services appear in the leg's service list without a manual page refresh. Add a new leg via this page's add-leg flow, confirm it appears in the leg list and its auto-generated arrival services show up.

- [ ] **Step 7: Snapshot (no git commit)**

---

### Task 7: Frontend — rewire `TripDetail.tsx`

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: `getTripSheet(tripId)` (new primary data source, per Task 2 — returns `{ trip, legs, stops, services, comms, persons, docs }`), `saveTrip()`, `saveLeg()`, `saveService()`, `deleteService()`, `computeCountriesOverflown()`, `generateOverflightServices(legId)`, `generateArrivalServices(legId, opts)` (all `Promise`-returning per Task 2). `getAircraft`, `getAircraftType`, `getOperator`, `getCountryList`, `refICaoRules`, `getCallSign`, `formatZ`, `urgencyColor`, `statusColor`, `getAudit`, `getInvoices` stay synchronous (reference-data/other-resource, out of scope) — do not change those call sites.

- [ ] **Step 1: Read the full file first**

1264 lines, has `// @ts-nocheck`. This is the largest file in this plan — it has multiple nested components (a leg editor, a service card, a country-permit-request group, a trip header editor) plus one main `TripDetail` component that currently re-derives everything from `dataStore.ts` on every render via a `dataRevision` counter trick (see line ~670: `const [dataRevision, setDataRevision] = useState(0);` and `void dataRevision;` at line ~687, which exists only to make the surrounding calls re-run when `dataRevision` changes).

- [ ] **Step 2: Replace the main component's data loading with one `getTripSheet` call**

The main component (`export default function TripDetail()`, starting ~line 667) currently does:

```tsx
const [expandedLegId, setExpandedLegId] = useState<string | null>(null);
const [dataRevision, setDataRevision] = useState(0);
const trip = getTrip(tripId || '');
// ...
void dataRevision;
const legs = getLegsForTrip(trip.TripID);
const stops = getStopsForTrip(trip.TripID);
const services = getServicesForTrip(trip.TripID);
const comms = getCommsForTrip(trip.TripID);
const persons = getPersonsForTrip(trip.TripID);
const docs = getDocsForTrip(trip.TripID);
```

Replace the whole data-loading portion (from `const [expandedLegId, ...]` through the `getDocsForTrip` line, but keep the `if (!trip) return (...)` "TRIP NOT FOUND" block's JSX — just change what feeds it) with:

```tsx
const [expandedLegId, setExpandedLegId] = useState<string | null>(null);
const [sheet, setSheet] = useState<TripSheet | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const reload = async () => {
  if (!tripId) return;
  const s = await getTripSheet(tripId);
  setSheet(s);
};

useEffect(() => {
  let cancelled = false;
  if (!tripId) { setLoading(false); return; }
  setLoading(true);
  getTripSheet(tripId)
    .then((s) => { if (!cancelled) { setSheet(s); setLoading(false); } })
    .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
  return () => { cancelled = true; };
}, [tripId]);

const toggleLeg = (legId: string) => {
  setExpandedLegId((currentLegId) => currentLegId === legId ? null : legId);
};

if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

if (!sheet) {
  return (
    <div className="py-12 text-center">
      <h2 className="text-xl font-bold">TRIP NOT FOUND</h2>
      <p className="text-muted-foreground">{tripId} DOES NOT EXIST IN THE SYSTEM.</p>
      <Link to="/trips" className="mt-4 inline-block text-primary hover:underline">← BACK TO TRIPS</Link>
    </div>
  );
}

const { trip, legs, stops, services, comms, persons, docs } = sheet;
const ac = getAircraft(trip.Registration);
```

Import `TripSheet` as a type from `@/lib/dataStore` (it's exported from there per Task 2 Step 7) if not already imported, and `useEffect` from `react` if not already in the import.

- [ ] **Step 3: Update `addLeg` (originally lines 698-719) to await and reload**

```tsx
const addLeg = async () => {
  const seq = legs.reduce((highest, leg) => Math.max(highest, leg.Seq), 0) + 1;
  const newLeg: Leg = {
    LegID: `${trip.TripID}-L${seq}-${Date.now()}`,
    TripID: trip.TripID,
    Seq: seq,
    DepICAO: legs[legs.length - 1]?.ArrICAO || '',
    ArrICAO: '',
    ETDZ: new Date().toISOString(),
    ETAZ: new Date().toISOString(),
    BlockHours: 0,
    PaxCount: 0,
    CrewCount: 0,
    CountriesOverflown: [],
    Revision: 1,
    Purpose: '',
    Routing: '',
  };
  await saveLeg(newLeg);
  await reload();
  setExpandedLegId(newLeg.LegID);
};
```

(Note: `setDataRevision` is gone — `reload()` replaces it everywhere in this file. Every other place in the file that called `setDataRevision((r) => r + 1)` or was passed an `onSaved` callback which did so must now call `reload()` instead — see Step 5.)

- [ ] **Step 4: Update the nested leg-editor's `save()` (originally lines ~152-163)**

```tsx
const save = async () => {
  const updated: Leg = {
    // ...existing field spread from draft, unchanged...
    IncludeFIRs: (draft.IncludeFIRs || []).map(normalizeFIR),
  };
  await saveLeg(updated);
  await generateOverflightServices(updated.LegID);
  await generateArrivalServices(updated.LegID);
  setDraft(updated);
  setEditing(false);
  await onSaved();
};
```

Keep every line of the existing field-construction logic for `updated` (the `...` above stands for whatever fields the original object-literal already builds from `draft` — do not drop any of them, only the three call lines and the `save` function's own `async`/`await` keywords change). Also update this component's route-preview line (originally ~line 97): `const routeCountries = draft.DepICAO && draft.ArrICAO ? computeCountriesOverflown(draft.DepICAO, draft.ArrICAO) : [];` — since this is a render-time (not event-handler) call, it needs its own `useEffect` + state instead of a plain `const`:

```tsx
const [routeCountries, setRouteCountries] = useState<string[]>([]);
useEffect(() => {
  if (draft.DepICAO && draft.ArrICAO) {
    computeCountriesOverflown(draft.DepICAO, draft.ArrICAO).then(setRouteCountries);
  } else {
    setRouteCountries([]);
  }
}, [draft.DepICAO, draft.ArrICAO]);
```

Also update the aircraft-type lookup at line ~80 — `getAircraftType(getAircraft(getTrip(leg.TripID)?.Registration || '')?.ICAOType || '')` calls `getTrip`, which is now async and this is inline in render. This component already receives `trip` as a prop from its parent in most such nested-component patterns — check whether this leg-editor component receives `trip` as a prop already (likely, since the parent has it via `sheet.trip`); if so, replace `getTrip(leg.TripID)?.Registration` with the prop directly (e.g. `trip.Registration`). If it does not currently receive a `trip` prop, add one — the parent (`TripDetail`) passes `trip={trip}` when rendering this component, since it already has `trip` from `sheet`.

- [ ] **Step 5: Update every other `onSaved`/mutation call site to `await` + call `reload`**

The following originally-synchronous call sites (from the grep inventory below) each need the same treatment: the enclosing function becomes `async`, each `dataStore` call gets `await`, and any `onSaved()` invocation or `setDataRevision(...)` call becomes `await onSaved()` where `onSaved` is the `reload` function threaded down as a prop from the main component (replace every prop wiring of `onSaved={...}` at the call sites where `TripDetail` renders its child components, pointing it at `reload`):

- Line ~132: `saveService(service);` → `await saveService(service);` (enclosing handler → `async`)
- Line ~141: `selectedServiceIds.forEach((serviceId) => deleteService(serviceId));` → convert to a `for...of` loop with `await deleteService(serviceId);` inside (a `.forEach` won't wait for async callbacks — same reasoning as Task 5 Step 4), then `await onSaved();` after the loop, followed by `setSelectedServiceIds([]);`
- Line ~285: `onDelete={() => { deleteService(service.SVCID); onSaved(); }}` → `onDelete={async () => { await deleteService(service.SVCID); await onSaved(); }}`
- Line ~307: same pattern as line 285
- Line ~370: `const save = () => { saveService(draft); setSavedDraft(draft); onSaved(); };` → `const save = async () => { await saveService(draft); setSavedDraft(draft); await onSaved(); };`
- Line ~416: `saveService({ ...service, Status: 'Requested', RefNumber: ref, Notes: ... });` → wrap the enclosing handler in `async`, add `await`
- Line ~588: `saveTrip(draft);` → enclosing handler → `async`, `await saveTrip(draft); await onSaved();` (check whether this handler already calls something equivalent to `onSaved`/reload after `saveTrip` — if not, add `await reload();` since a trip-header edit needs to refresh `sheet.trip`)

- [ ] **Step 6: Verify — build**

Run: `npm run build:client`
Expected: exits 0.

- [ ] **Step 7: Verify — manual browser check**

Open a trip's detail page. Expected: page loads (not stuck on "Loading…"), leg register renders. Expand a leg, edit its route/ETD, save — confirm the leg updates in place and any regenerated services appear in the services list without a manual page refresh. Add a new leg via the page's "add leg" control — confirm it appears in the register. Delete a service — confirm it disappears. Edit the trip header (client/operator/aircraft override fields) and save — confirm the header reflects the change after save.

- [ ] **Step 8: Snapshot (no git commit)**

---

### Task 8: Frontend — rewire the 3 files Task 2 missed (`LandingPage.tsx`, `ComposerPage.tsx`, `admin/AdminAssets.tsx`)

**Plan-defect note:** the original scope mapping (Tasks 3-7) covered every page that primarily deals with trip/leg CRUD, but missed 3 files that call a handful of the now-async Trip/Leg/Service functions incidentally. Task 2's build check surfaced this via real `tsc` errors (these 3 files, unlike most pages in this plan, do NOT have `// @ts-nocheck` — they're normally type-checked, which is how the gap was caught instead of silently shipping broken code). Confirmed via `npm run build:client`: `LandingPage.tsx` (6 errors), `ComposerPage.tsx` (14 errors), `admin/AdminAssets.tsx` (3 errors).

**Files:**
- Modify: `src/client/pages/LandingPage.tsx`
- Modify: `src/client/pages/ComposerPage.tsx`
- Modify: `src/client/pages/admin/AdminAssets.tsx`

**Interfaces:**
- Consumes: `computeCountriesOverflown`, `getTrips`, `getLegsForTrip`, `getServices` (all `Promise`-returning per Task 2), plus `apiFetch` from `src/client/lib/apiClient.ts` (the bearer-token-attaching fetch wrapper from sub-project 1 — used here for its unauthenticated case too, since it simply omits the `Authorization` header when no token is in `localStorage`). Every other dataStore function these 3 files use (`getAirport`, `getCountry`, `getAircraftType`, `normalizeRegistration`, `getAircraft`, `getPersonsForTrip`, `saveComm`, `getAircraftList`/`saveAircraft`/etc.) stays synchronous — out of scope, do not change those call sites.
- **`LandingPage.tsx`'s `submitQuote` no longer calls `saveTrip`/`saveLeg`/`saveService`/`nextTripId` at all** — per an explicit user decision, it now POSTs the whole enquiry to the already-built, already-`@Public()` `POST /api/quotes` endpoint in one atomic call instead of three sequential per-resource writes (which would otherwise 401, since `saveTrip`/`saveLeg`/`saveService` sit behind the auth guard sub-project 1 added, and this page has no logged-in session). Remove `nextTripId, saveTrip, saveLeg, saveService` from this file's `dataStore` import — only `computeCountriesOverflown` (plus the already-imported reference-data reads) is still needed from there.

- [ ] **Step 1: `LandingPage.tsx` — read the full file first**

This is the public "Request a Quote" page (no login required — `POST /api/quotes` and this page's own trip-creation flow are the only unauthenticated paths in the app). It has two render-time call sites and one event-handler call site for the in-scope functions.

- [ ] **Step 2: `LandingPage.tsx` — fix the render-time preview at line ~553-558 (inside `legs.map((leg, idx) => {...})` in the "STEP 2 — BUILD ROUTE" card)**

Add state near the top of the component (alongside its other `useState` calls):

```tsx
const [overflownByLeg, setOverflownByLeg] = useState<Record<string, string[]>>({});

useEffect(() => {
  legs.forEach((leg) => {
    if (leg.dep.length === 4 && leg.arr.length === 4) {
      computeCountriesOverflown(leg.dep, leg.arr).then((result) => {
        setOverflownByLeg((prev) => ({ ...prev, [leg.id]: result }));
      });
    }
  });
}, [legs.map((l) => `${l.id}:${l.dep}:${l.arr}`).join('|')]);
```

Add `useEffect` to the `react` import if not already present. Then change the render-time block:

```tsx
const baseOverflown = leg.dep.length === 4 && leg.arr.length === 4
  ? computeCountriesOverflown(leg.dep, leg.arr)
  : [];
```

to:

```tsx
const baseOverflown = leg.dep.length === 4 && leg.arr.length === 4
  ? (overflownByLeg[leg.id] ?? [])
  : [];
```

- [ ] **Step 3: `LandingPage.tsx` — fix `analyzeRoute` (the event handler starting `const analyzeRoute = () => {`, around line 188)**

Add `async` to its declaration. Inside it, the `validLegs.forEach((leg) => { ... const baseOverflown = computeCountriesOverflown(leg.dep, leg.arr); ... })` loop (around line 213-245) needs converting to a `for...of` loop so `await` works (a `.forEach` callback's `await` is not waited on by `.forEach` itself):

```tsx
for (const leg of validLegs) {
  const dist = roughDistanceNm(leg.dep, leg.arr);
  totalDist += dist;

  const depAp = getAirport(leg.dep);
  const arrAp = getAirport(leg.arr);

  if (depAp?.CountryISO2) countrySet.add(depAp.CountryISO2);
  if (arrAp?.CountryISO2) countrySet.add(arrAp.CountryISO2);

  const baseOverflown = await computeCountriesOverflown(leg.dep, leg.arr);
  const overflown = Array.from(new Set([...baseOverflown, ...leg.addFirs])).filter(
    (iso2) => !leg.avoidFirs.includes(iso2)
  );
  overflown.forEach((iso2) => {
    countrySet.add(iso2);
    const country = getCountry(iso2);
    if (country?.OverflightPermitRequired) {
      pushLine(leg.id, iso2, 'Overflight', true, true);
    }
  });

  if (arrAp) {
    const arrCountry = getCountry(arrAp.CountryISO2);
    if (arrCountry?.LandingPermitRequired) pushLine(leg.id, arrAp.CountryISO2, 'Permit', true, true);
    pushLine(leg.id, arrAp.CountryISO2, 'GroundHandling', true, true);
  }
  if (depAp) pushLine(leg.id, depAp.CountryISO2, 'GroundHandling', false, false);
}
```

Keep every line after this loop (the `totalEet`/`rangeNm`/`verdict`/`result` construction and the three `set...` calls at the end) exactly as it already is — only the loop body changes shape (from `.forEach(...)` to `for...of` with `await`), the rest of the function is unaffected. Every call site that invokes `analyzeRoute()` (its button's `onClick`) keeps working unchanged — an unawaited call to an `async` function from `onClick` is valid.

- [ ] **Step 4: `LandingPage.tsx` — replace `submitQuote` (around line 303) with a single atomic `POST /api/quotes` call**

The backend already has an atomic, `@Public()` endpoint (`QuotesController.submit`, backed by `QuotesService.submit`, in `src/server/modules/quotes/`) that does exactly what this function does today (create Trip + Legs + Services + Persons) but server-side in one transaction — built specifically to replace this function. Its request DTO (`CreateQuoteDto` in `src/server/modules/quotes/dto/create-quote.dto.ts`) shape:

```typescript
{
  client: string;
  contactEmail?: string;       // must be a valid email or omitted — do not send ''
  registration?: string;
  operationType?: string;
  missionType?: string;
  notes?: string;
  legs: Array<{
    clientLegId: string;       // any client-side id used to correlate services/persons to this leg — reuse enquiry's own leg.id
    seq: number;
    depIcao: string;
    arrIcao: string;
    etdZ: string;               // ISO datetime
    etaZ: string;                // ISO datetime
    blockHours?: number;
    countriesOverflown?: string[];
    callSign?: string;
  }>;
  services?: Array<{
    clientLegId: string;        // matches a legs[].clientLegId
    serviceType: 'Permit' | 'Overflight' | 'GroundHandling';
    countryIso2: string;
    leadTimeHours: number;
    auto?: boolean;
    notes?: string;
  }>;
  persons?: Array<{
    name: string;
    role: 'PIC' | 'SIC' | 'FA' | 'Mechanic' | 'Engineer' | 'Medical Staff' | 'Other' | 'Pax' | 'VIP' | 'Principal';
    passportNationality?: string;
  }>;
}
```

The response body is `{ trip, legs, services, persons }` where `trip.tripId` (camelCase) is the new trip's ID — use that for `setSubmittedTripId`.

Replace the entire `submitQuote` function body with:

```tsx
const submitQuote = async () => {
  if (!enquiry || !clientName.trim()) return;

  const legEtdMap: Record<string, string> = {};
  const crewCount = persons.filter((p) => ['PIC', 'SIC', 'FA'].includes(p.role)).length;
  const paxCount = persons.filter((p) => !['PIC', 'SIC', 'FA'].includes(p.role)).length;

  const legsPayload = enquiry.legs.map((leg, i) => {
    const dist = roughDistanceNm(leg.dep, leg.arr);
    const blockHours = estimateEetHours(dist);
    const etdIso = leg.etdDate && leg.etdTime
      ? new Date(`${leg.etdDate}T${leg.etdTime}:00Z`).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const etaIso = new Date(new Date(etdIso).getTime() + blockHours * 60 * 60 * 1000).toISOString();
    legEtdMap[leg.id] = etdIso;

    const legOverflown = serviceLines
      .filter((l) => l.legId === leg.id && l.type === 'Overflight' && l.included)
      .map((l) => l.countryIso2);

    return {
      clientLegId: leg.id,
      seq: i + 1,
      depIcao: leg.dep,
      arrIcao: leg.arr,
      etdZ: etdIso,
      etaZ: etaIso,
      blockHours,
      countriesOverflown: legOverflown,
      callSign: leg.callSign || undefined,
    };
  });

  const servicesPayload = serviceLines.filter((l) => l.included).map((l) => ({
    clientLegId: l.legId,
    serviceType: l.type,
    countryIso2: l.countryIso2,
    leadTimeHours: l.leadTimeHours,
    auto: l.auto,
    notes: `Web enquiry — ${l.auto ? 'auto-derived' : 'manually added'} ${SERVICE_TYPE_LABEL[l.type]} for ${l.countryName}.`,
  }));

  const personsPayload = persons
    .filter((p) => p.name.trim())
    .map((p) => ({
      name: p.name,
      role: p.role as PersonRole,
      passportNationality: p.nationality || undefined,
    }));

  const res = await apiFetch('/quotes', {
    method: 'POST',
    body: JSON.stringify({
      client: clientName.trim(),
      contactEmail: contactEmail.trim() || undefined,
      registration: registration || enquiry.aircraftType,
      operationType: operationType || undefined,
      missionType: missionType || undefined,
      notes: notes || undefined,
      legs: legsPayload,
      services: servicesPayload,
      persons: personsPayload,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Quote submission failed: ${res.status} ${body}`);
  }

  const result = await res.json();
  setSubmittedTripId(result.trip.tripId);
};
```

`crewCount`/`paxCount` computed above are dead in this version (the old code never actually used them either — check the original function again: they were computed but not referenced anywhere in the `saveLeg`/`saveService` payloads, only `PaxCount`/`CrewCount` were set directly on the Leg object from these two locals in the OLD code's `saveLeg` call, which this rewrite drops since the backend's `CreateQuoteDto`'s leg shape has no `paxCount`/`crewCount` fields — persons are tracked separately via the `persons` array instead). If you find `crewCount`/`paxCount` become unused locals after this rewrite, remove those two lines entirely rather than leaving dead code.

Add `import { apiFetch } from '@/lib/apiClient';` to this file's imports. Remove `nextTripId, saveTrip, saveLeg, saveService` from the existing `@/lib/dataStore` import line (keep `computeCountriesOverflown` and everything else there).

- [ ] **Step 5: `ComposerPage.tsx` — read the full file first**

This is the internal email-composer page (behind login). `generateEmail` (a plain function, not a component, defined outside `ComposerPage`) currently calls `getLegsForTrip(tripId)` internally to look up leg data for templating — since that's now async and `generateEmail` is a synchronous formatter called mid-render-handler, the cleanest fix is to have the caller pass the already-loaded `legs` array in, rather than making `generateEmail` itself async.

- [ ] **Step 6: `ComposerPage.tsx` — change `generateEmail`'s signature**

Find `function generateEmail(` (around line 39). Add a `legs: Leg[]` parameter (place it right after the `svcId: string | null,` parameter), and delete the line `const legs = getLegsForTrip(tripId);` (around line 53) from inside the function body — the function now uses the `legs` parameter directly instead of fetching it. Add `import type { Leg } from '@/data/types';` if `Leg` isn't already imported as a type in this file (check the existing imports first — it may already be imported alongside `Comm`).

- [ ] **Step 7: `ComposerPage.tsx` — add component-level state for `trips`, `legs`, `tripServices`**

In `export default function ComposerPage()` (around line 126), replace:

```tsx
const trip = getTrips().find(t => t.TripID === tripId);
const ac = trip ? getAircraft(trip.Registration) : null;
const legs = getLegsForTrip(tripId);
const tripServices = getServices().filter(s => s.TripID === tripId);
```

with:

```tsx
const [trips, setTrips] = useState<Trip[]>([]);
const [legs, setLegs] = useState<Leg[]>([]);
const [tripServices, setTripServices] = useState<Service[]>([]);

useEffect(() => {
  getTrips().then(setTrips);
}, []);

useEffect(() => {
  let cancelled = false;
  if (!tripId) { setLegs([]); setTripServices([]); return; }
  Promise.all([getLegsForTrip(tripId), getServices()]).then(([l, s]) => {
    if (!cancelled) { setLegs(l); setTripServices(s.filter((svc) => svc.TripID === tripId)); }
  });
  return () => { cancelled = true; };
}, [tripId]);

const trip = trips.find(t => t.TripID === tripId);
const ac = trip ? getAircraft(trip.Registration) : null;
```

Add `useEffect` to the `react` import, and `import type { Trip, Leg, Service } from '@/data/types';` (merge with any existing type import from `@/data/types` in this file — check first).

- [ ] **Step 8: `ComposerPage.tsx` — update the `generateEmail` call site and the trips dropdown**

In `handleCompose` (around line 142), the call to `generateEmail(...)` needs the new `legs` argument added in the matching position (right after the `svcId` argument):

```tsx
const email = generateEmail(
  template,
  tripId,
  legId,
  svcId,
  legs,
  notes,
  trip.Registration,
  ac?.ICAOType || 'TBD',
  ac?.MTOW_kg || 0,
  trip.Client,
  trip.Operator,
  trip.SupportRef || ''
);
```

And the trips dropdown (around line 211), `{getTrips().map(t => <SelectItem key={t.TripID} value={t.TripID}>{t.TripID} — {t.Client}</SelectItem>)}` becomes `{trips.map(t => <SelectItem key={t.TripID} value={t.TripID}>{t.TripID} — {t.Client}</SelectItem>)}`.

- [ ] **Step 9: `admin/AdminAssets.tsx` — fix `PersonDialog`**

Find `function PersonDialog({ person, open, onClose, onSaved }: {...}) {` (around line 392). Replace:

```tsx
const isNew = !person;
const trips = getTrips();
const [tripId, setTripId] = useState(person?.TripID || trips[0]?.TripID || '');
```

with:

```tsx
const isNew = !person;
const [trips, setTrips] = useState<Trip[]>([]);
const [tripId, setTripId] = useState(person?.TripID || '');

useEffect(() => {
  getTrips().then((list) => {
    setTrips(list);
    if (!person?.TripID && list[0]) setTripId((current) => current || list[0].TripID);
  });
}, []);
```

Add `useEffect` to the `react` import and `import type { Trip } from '@/data/types';` if `Trip` isn't already imported as a type in this file (check first — `Person` is already imported per this component's props, `Trip` may or may not be alongside it).

The JSX at (originally) line 431, `{trips.map((t) => (...`, is unchanged — it already reads from the `trips` variable, which now resolves to the state array instead of a direct function-call result.

- [ ] **Step 10: Verify — build**

Run: `npm run build:client`
Expected: zero `error TS` lines attributable to `LandingPage.tsx`, `ComposerPage.tsx`, or `admin/AdminAssets.tsx`. (Other files not yet covered by this plan's earlier tasks may still show errors at this point if this task runs before Tasks 3-7 — that's expected; Task 9's full-build gate covers the combined state once every task is done.)

- [ ] **Step 11: Verify — manual browser check**

Open `/` (the public landing/quote page) in a fresh/incognito browser context specifically WITHOUT logging in first — this is the point of Step 4's rewrite: the public quote flow must work with zero session/token. Build a 2-leg route (Step 2/3's live route preview should populate as you type), fill in a client name, submit the quote. Expected: submission succeeds (no 401 — confirms `POST /api/quotes` really is reachable unauthenticated and the payload shape matches `CreateQuoteDto`), and the resulting trip ID displays. Then log in as `admin`/`Admin123!` in a separate tab, open `/trips`, and confirm the new trip appears with its legs and services intact — proves the atomic backend write actually persisted everything the old sequential-localStorage-write version did. Separately, still logged in, open `/composer` (or wherever `ComposerPage` is routed) — select a trip, select a leg, compose an email, confirm the generated subject/body populates correctly using the selected leg's real data. Open the admin assets/persons page, add a person, confirm the trip dropdown populates.

- [ ] **Step 12: Snapshot (no git commit)**

---

### Task 10: Fix `dataStore.ts` internal cross-calls and `BillingPage.tsx` (second plan-defect closure)

**Plan-defect note:** the final whole-branch review (in progress) surfaced a deeper gap than Task 8's: three functions *inside* `dataStore.ts` itself, explicitly declared out-of-scope/"untouched" for this plan (`generateInvoiceFromTrip`, `exportBackup`, `getCallSign`), turned out to have undocumented internal dependencies on the Trip/Leg/Stop/Service functions Task 2 made async — so they broke silently as a side effect, with no `tsc` error to catch it (the two page-level consumers, `BillingPage.tsx` and the two already-shipped `TripDetail.tsx`/`AdminTrips.tsx`, either have `// @ts-nocheck` or call these `dataStore.ts` functions in a way that still type-checks against a signature that lies about being synchronous). Concretely, right now: `generateInvoiceFromTrip` throws a runtime `TypeError` (`.filter is not a function` on a Promise) any time a user tries to generate an invoice; `exportBackup`/`downloadBackup` silently produce a backup file missing all trip/leg/stop/service data; `getCallSign` silently falls back to `'N/A'` instead of the trip's registration for any leg without an explicit `CallSign` set (this is live right now on trip 2608001's Leg 5, edited during Task 9's own verification).

**Files:**
- Modify: `src/client/lib/dataStore.ts`
- Modify: `src/client/pages/admin/BillingPage.tsx`
- Modify: `src/client/pages/TripDetail.tsx` (only the `getCallSign` call sites — 3 of them)
- Modify: `src/client/pages/admin/AdminTrips.tsx` (only the `getCallSign` call sites — 2 of them)

**Interfaces:**
- Consumes: `getTrip`, `getServicesForTrip`, `getTrips`, `getLegs`, `getStops`, `getServices` (all `Promise`-returning per Task 2).
- Produces: `generateInvoiceFromTrip(tripId: string, user?: string): Promise<Invoice | null>` (signature change: now async). `exportBackup(): Promise<BackupData>` (signature change: now async). `downloadBackup(): Promise<void>` (signature change: now async, since it awaits `exportBackup`). `getCallSign(leg: Leg, registration: string): string` (signature change: second parameter is now the trip's `Registration` string directly, not a `tripId` to look up — stays synchronous, no async needed at all with this approach).

- [ ] **Step 1: Fix `generateInvoiceFromTrip` in `dataStore.ts`**

Find `export function generateInvoiceFromTrip(tripId: string, user = 'SYSTEM'): Invoice | null {` (currently around line 912). Change the signature to:

```typescript
export async function generateInvoiceFromTrip(tripId: string, user = 'SYSTEM'): Promise<Invoice | null> {
```

Change the first two body lines from:

```typescript
  const trip = getTrip(tripId);
  if (!trip) return null;

  const services = getServicesForTrip(tripId).filter((s) => s.Status === 'Confirmed');
```

to:

```typescript
  const trip = await getTrip(tripId);
  if (!trip) return null;

  const allServices = await getServicesForTrip(tripId);
  const services = allServices.filter((s) => s.Status === 'Confirmed');
```

Every other line in this function (the line-items loop, `getPrice` calls, the final `invoice` object construction) stays exactly as-is — `getPrice` is reference-data, unaffected.

- [ ] **Step 2: Fix `exportBackup` and `downloadBackup` in `dataStore.ts`**

Find `export function exportBackup(): BackupData {` (currently around line 710). Replace the whole function with:

```typescript
export async function exportBackup(): Promise<BackupData> {
  const [trips, legs, stops, services] = await Promise.all([getTrips(), getLegs(), getStops(), getServices()]);
  return {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    transactions: {
      trips,
      legs,
      stops,
      services,
      comms: getComms(),
      audit: getAudit(),
      persons: getPersons(),
      docs: getDocs(),
      invoices: getInvoices(),
      settings: getSettings(),
    },
    referenceMeta: {
      airportsCount: refAirports.length,
      countriesCount: refCountries.length,
      citiesCount: refCities.length,
      aircraftTypesCount: refAircraftTypes.length,
      aircraftCount: refAircraft.length,
      operatorsCount: refOperators.length,
      providersCount: refProviders.length,
      countryRulesCount: refCountryRules.length,
      icaoRulesCount: refICaoRules.length,
      docTemplatesCount: refDocTemplates.length,
      pricelistCount: refPricelist.length,
    },
  };
}
```

Find `export function downloadBackup(): void {` immediately below `importBackup` (currently around line 757). Replace with:

```typescript
export async function downloadBackup(): Promise<void> {
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `viq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Do not touch `importBackup` — it takes already-resolved data as a parameter, no async needed there.

- [ ] **Step 3: Fix `getCallSign` in `dataStore.ts`**

Find `export function getCallSign(leg: Leg, tripId: string): string {` (currently around line 896). Replace with:

```typescript
export function getCallSign(leg: Leg, registration: string): string {
  if (leg.CallSign && leg.CallSign.trim()) return leg.CallSign;
  return registration || 'N/A';
}
```

This stays synchronous — the fix is that callers now pass the trip's `Registration` directly (which they already have loaded) instead of a `tripId` this function used to look up internally via the now-async `getTrip`.

- [ ] **Step 4: Update `getCallSign` call sites in `TripDetail.tsx`**

Read the file first to find current exact context around each site (line numbers may have shifted slightly from Task 7's edits). Three call sites:

- `{getCallSign(leg, leg.TripID)}` (originally line 559) → `{getCallSign(leg, trip.Registration)}` — this is inside a component that has `trip` in scope (from the `sheet` destructure per Task 7); if the specific nested component here receives `trip` as a prop already, use that; if not, check whether it receives the leg's parent trip some other way — since `leg.TripID` was already available, `trip.Registration` should be equally reachable given Task 7's `getTripSheet` centralization put `trip` in scope at the top of the main component. If this exact spot is a deeply nested component that does NOT already receive `trip`, thread it down as a new prop from the nearest ancestor that has it, matching how other Task 7 components already receive `trip`.
- `{getCallSign(leg, trip.TripID) && (` (originally line 874) → `{getCallSign(leg, trip.Registration) && (` — `trip` is already in scope here per the original code shown (uses `trip.TripID` directly).
- `{getCallSign(leg, trip.TripID)}` (originally line 877) → `{getCallSign(leg, trip.Registration)}` — same component, same `trip` already in scope.

- [ ] **Step 5: Update `getCallSign` call sites in `AdminTrips.tsx`**

Two call sites, both already have `selectedTrip` in scope (per Task 6's rewrite):

- `` {` (CS: ${getCallSign(l, selectedTrip?.TripID || '')})`} `` (originally line 949) → `` {` (CS: ${getCallSign(l, selectedTrip?.Registration || '')})`} ``
- `Call Sign: {getCallSign(selectedLeg, selectedTrip?.TripID || '')}` (originally line 975) → `Call Sign: {getCallSign(selectedLeg, selectedTrip?.Registration || '')}`

- [ ] **Step 6: Fix `BillingPage.tsx`'s `InvoiceDetailDialog`**

Read the file first. In `InvoiceDetailDialog` (the component containing `const trip = getTrip(invoice.TripID);` around original line 98), replace that line and the surrounding `useEffect` with a fetched-state pattern:

```tsx
const [trip, setTrip] = useState<Trip | null>(null);

useEffect(() => {
  if (invoice && open) {
    setStatus(invoice.Status);
    setQrDataUrl(generateQRCode(invoice.InvoiceID));
    getTrip(invoice.TripID).then((t) => setTrip(t ?? null));
  }
}, [invoice, open]);

if (!invoice) return null;
```

(This merges the new trip-fetch into the SAME existing `useEffect` that already runs on `[invoice, open]` — don't add a second effect.) Remove the old standalone `const trip = getTrip(invoice.TripID);` line. Add `import type { Trip } from '@/data/types';` if not already imported (check the existing `import type { Invoice, InvoiceChange } from '@/lib/dataStore';` line — `Trip` may need adding there instead, from `@/data/types`).

The one render usage, `{trip.Client} — {trip.Registration}` (originally line 152), needs a null-guard now that `trip` starts as `null` before the fetch resolves — wrap it: `{trip && <>{trip.Client} — {trip.Registration}</>}` (adjust to match the exact surrounding JSX structure at that line — read it first).

- [ ] **Step 7: Fix `BillingPage.tsx`'s `GenerateDialog`**

In `GenerateDialog` (containing the `eligibleTrips` `useMemo` around original line 294 and `handleGenerate` around line 303), replace:

```tsx
const [selectedTripId, setSelectedTripId] = useState('');

const eligibleTrips = useMemo(() => {
  return getTrips().filter((t) => {
    const svcs = getServicesForTrip(t.TripID);
    const hasConfirmed = svcs.some((s) => s.Status === 'Confirmed');
    const hasInvoice = getInvoices().some((i) => i.TripID === t.TripID);
    return hasConfirmed && !hasInvoice;
  });
}, []);
```

with:

```tsx
const [selectedTripId, setSelectedTripId] = useState('');
const [eligibleTrips, setEligibleTrips] = useState<Trip[]>([]);

useEffect(() => {
  if (!open) return;
  let cancelled = false;
  getTrips().then(async (trips) => {
    const withServices = await Promise.all(
      trips.map(async (t) => [t, await getServicesForTrip(t.TripID)] as const)
    );
    if (cancelled) return;
    const filtered = withServices
      .filter(([, svcs]) => svcs.some((s) => s.Status === 'Confirmed'))
      .filter(([t]) => !getInvoices().some((i) => i.TripID === t.TripID))
      .map(([t]) => t);
    setEligibleTrips(filtered);
  });
  return () => { cancelled = true; };
}, [open]);
```

(Fetches when the dialog opens, matching the existing `[invoice, open]`-gated pattern used elsewhere in this file — `useEffect`/`useState` should already be imported per the top-of-file import list; add `useEffect` if it's missing.)

Replace `handleGenerate`:

```tsx
const handleGenerate = () => {
  if (!selectedTripId) return;
  const invoice = generateInvoiceFromTrip(selectedTripId);
  if (invoice) {
    onClose();
  } else {
    alert('No confirmed services found for this trip.');
  }
};
```

with:

```tsx
const handleGenerate = async () => {
  if (!selectedTripId) return;
  const invoice = await generateInvoiceFromTrip(selectedTripId);
  if (invoice) {
    onClose();
  } else {
    alert('No confirmed services found for this trip.');
  }
};
```

- [ ] **Step 8: Verify — build**

Run: `npm run build:client`
Expected: exits 0, no new errors (this is the first task in the plan where every file it touches should already have been clean before, and should remain clean after — `TripDetail.tsx`/`AdminTrips.tsx` only get 5 one-line call-site edits, `BillingPage.tsx` has `// @ts-nocheck` so won't error either way, `dataStore.ts` has `// @ts-nocheck` too).

- [ ] **Step 9: Verify — manual browser check**

Log in as `admin`/`Admin123!`. Open the trip detail page for a trip with a leg that has no `CallSign` set (or clear one via the leg editor) — confirm the call sign display now shows the trip's registration instead of "N/A". Open the admin trips page, select a trip/leg, confirm the call-sign displays correctly there too. Navigate to the Billing page — open `GenerateDialog` (whatever button triggers it), confirm eligible trips populate (a trip needs a Confirmed service and no existing invoice — check `/trips` or the API to find/create one that qualifies if none currently do), generate an invoice, confirm it succeeds without a console error and the new invoice appears. Open an existing invoice's detail dialog, confirm the trip's client/registration display correctly instead of crashing or showing blank.

- [ ] **Step 10: Snapshot (no git commit)**

---

### Task 11: Final-review fix wave (missed 4th file, write-path error handling, error masking, asset-path bug)

**Plan-defect note:** the final whole-branch review (fresh, complete pass, after Tasks 9/10) found one more scope gap and two real correctness issues, all confirmed by independently re-deriving them (not just trusting a claim). This is the fix wave for that review's Important findings, plus two small explicitly-approved extras (a cheap Task 1 validator gap, and the long-flagged `vite.config.ts` asset-path bug, which the user explicitly asked to fold in here even though it predates this plan).

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/client/lib/dataStore.ts`
- Modify: `src/server/modules/trips/dto/create-trip.dto.ts`
- Modify: `src/client/pages/Dashboard.tsx`
- Modify: `src/client/pages/LandingPage.tsx`
- Modify: `src/client/pages/admin/NewTripWizard.tsx`

**Interfaces:**
- No signature changes to any `dataStore.ts` exported function — `apiJson`'s internal error-throwing changes shape (now throws an `ApiError` with a `.status` property instead of a plain `Error`), and `getTrip` only swallows a 404 into `undefined`, rethrowing anything else — callers that already have a `.catch(...)` (every page from Tasks 3-8 does) get real errors surfaced instead of a false "not found," with no call-site changes required.

- [ ] **Step 1: Fix the asset-path bug in `vite.config.ts`**

Change:
```typescript
  base: './',
```
to:
```typescript
  base: '/',
```

This is the only change to this file. (Root cause: a relative base makes built asset URLs resolve against the current URL segment, so any 2+ segment route — `/trips/:tripId`, `/admin/trips`, `/admin/trips/new`, `/admin/billing` — 404s its own JS/CSS on direct navigation, refresh, or a bookmarked/shared link. In-app client-side navigation was never affected, which is why this only ever showed up as an inconvenience during manual testing, never as a functional bug in the app itself.)

- [ ] **Step 2: Add an `ApiError` class and fix `apiJson`/`getTrip` in `dataStore.ts`**

Find `async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {` (currently around line 230). Immediately before it, add:

```typescript
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
```

Then change `apiJson`'s body from:
```typescript
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${body}`);
  }
```
to:
```typescript
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${body}`, res.status);
  }
```

Find `export async function getTrip(tripId: string): Promise<Trip | undefined> {` (currently around line 402). Change:
```typescript
  try {
    const row = await apiJson<any>(`/trips/${tripId}`);
    return mapTripFromApi(row);
  } catch {
    return undefined;
  }
```
to:
```typescript
  try {
    const row = await apiJson<any>(`/trips/${tripId}`);
    return mapTripFromApi(row);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
```

(Why this matters: before this fix, `getTrip` turned every failure — a real 500, a dropped connection, an expired token — into the same "trip not found" result as an honest 404. `TripDetail.tsx`'s `getTripSheet` call already has a `.catch` that sets a real error state per Task 7 — this fix is what lets a genuine backend failure actually reach it, instead of being silently reported as "TRIP NOT FOUND" first.)

- [ ] **Step 3: Add `@IsNumber()` to `aircraftMtowKg` in `create-trip.dto.ts`**

Find the `aircraftMtowKg?: number;` field (added by Task 1). Add the missing decorator so it reads:
```typescript
  @IsOptional()
  @IsNumber()
  aircraftMtowKg?: number;
```
Add `IsNumber` to the existing `import { ... } from 'class-validator';` line if not already imported.

- [ ] **Step 4: Rewire `Dashboard.tsx` off the frozen seed fixture**

This file currently imports `trips, services, legs` (the raw, frozen arrays from `@/lib/seed-data`, re-exported through the `@/data/seed` barrel) instead of the live `getTrips`/`getServices`/`getLegs` functions the SAME barrel also re-exports from `dataStore.ts` — an easy name collision to fall into (`trips` vs `getTrips` both exist in that one barrel). This is the app's post-login landing page, so it's the first thing every user sees, and it currently shows different numbers than `/admin` (`AdminDashboard.tsx`, already correctly live).

Replace the whole file with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { getTrips, getServices, getLegs, formatZ, urgencyColor, statusColor } from '@/lib/dataStore';
import type { Trip, Service, Leg } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router';
import { Plane, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrips(), getServices(), getLegs()])
      .then(([t, s, l]) => { if (!cancelled) { setTrips(t); setServices(s); setLegs(l); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const activeTrips = trips.filter(t => t.Status === 'Active').length;
    const openServices = services.filter(s => s.Status !== 'Confirmed' && s.Status !== 'Not Required');
    const urgent = openServices.filter(s => s.Urgency === 'URGENT' || s.Urgency === 'BREACH');
    return { totalTrips, activeTrips, openServices: openServices.length, urgent: urgent.length };
  }, [trips, services]);

  const upcomingLegs = useMemo(() => {
    const now = Date.now();
    return legs
      .filter(l => new Date(l.ETDZ).getTime() >= now)
      .sort((a, b) => new Date(a.ETDZ).getTime() - new Date(b.ETDZ).getTime())
      .slice(0, 5);
  }, [legs]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ACTION BOARD</h1>
        <p className="text-muted-foreground">OPERATIONS OVERVIEW</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">TOTAL TRIPS</p><p className="text-2xl font-bold">{stats.totalTrips}</p></div><Plane className="h-6 w-6 text-blue-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">ACTIVE</p><p className="text-2xl font-bold">{stats.activeTrips}</p></div><TrendingUp className="h-6 w-6 text-emerald-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">OPEN SERVICES</p><p className="text-2xl font-bold">{stats.openServices}</p></div><Clock className="h-6 w-6 text-amber-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">URGENT</p><p className="text-2xl font-bold">{stats.urgent}</p></div><AlertTriangle className="h-6 w-6 text-red-600" /></div></CardContent></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">UPCOMING DEPARTURES</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {upcomingLegs.map(leg => {
              const trip = trips.find(t => t.TripID === leg.TripID);
              return (
                <Link key={leg.LegID} to={`/trips/${trip?.TripID}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                  <div>
                    <div className="font-bold text-sm">{trip?.TripID} — {trip?.Registration}</div>
                    <div className="text-xs text-muted-foreground">{leg.DepICAO} → {leg.ArrICAO}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatZ(leg.ETDZ)}</div>
                    <Badge variant="outline" className="text-[9px]">{trip?.Status}</Badge>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">OPEN SERVICES</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {services
              .filter(s => s.Status !== 'Confirmed' && s.Status !== 'Not Required')
              .slice(0, 8)
              .map(svc => {
                const trip = trips.find(t => t.TripID === svc.TripID);
                return (
                  <div key={svc.SVCID} className="flex items-center justify-between rounded-md border p-2 text-xs">
                    <div>
                      <span className="font-medium">{svc.ServiceType}</span>
                      <span className="text-muted-foreground ml-2">{trip?.TripID}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] ${urgencyColor(svc.Urgency)}`}>{svc.Urgency}</Badge>
                      <Badge variant="secondary" className={`text-[9px] ${statusColor(svc.Status)}`}>{svc.Status}</Badge>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

(Two intentional changes beyond the mechanical async swap: imports now go directly to `@/lib/dataStore` instead of through the `@/data/seed` barrel — avoids the exact name-collision trap that caused this bug — and `upcomingLegs`'s hardcoded `new Date('2026-08-15T12:00:00Z')` seed-era reference date becomes `Date.now()`, since "upcoming" needs to mean "upcoming right now" once the data is real, not frozen relative to a fixture's authoring date.)

- [ ] **Step 5: Add error handling to `LandingPage.tsx`'s `submitQuote`**

Add a new state near the existing `const [submittedTripId, setSubmittedTripId] = useState<string | null>(null);` (currently line 136):
```tsx
const [submitError, setSubmitError] = useState<string | null>(null);
const [submitting, setSubmitting] = useState(false);
```

Wrap `submitQuote`'s body (currently starting at line 322, `const submitQuote = async () => { if (!enquiry || !clientName.trim()) return; ...`) in a try/catch/finally. The function becomes:

```tsx
const submitQuote = async () => {
  if (!enquiry || !clientName.trim()) return;
  setSubmitError(null);
  setSubmitting(true);
  try {
    // ...every existing line of the function body, unchanged, from `const legEtdMap`
    // through `setSubmittedTripId(result.trip.tripId);` ...
  } catch (e) {
    setSubmitError(e instanceof Error ? e.message : 'Quote submission failed. Please try again.');
  } finally {
    setSubmitting(false);
  }
};
```

Do not change a single line inside the try block — only add the `try { ... } catch (e) { ... } finally { ... }` wrapper around the function's existing body, plus the two `setSubmitError(null)`/`setSubmitting(true)` lines before it.

At the submit button (currently line 894, `<Button className="w-full" size="lg" variant="default" onClick={submitQuote} disabled={!clientName.trim()}>`), change `disabled={!clientName.trim()}` to `disabled={!clientName.trim() || submitting}`, and change the button label to show submitting state:
```tsx
<Button className="w-full" size="lg" variant="default" onClick={submitQuote} disabled={!clientName.trim() || submitting}>
  <Send className="mr-2 h-4 w-4" />
  {submitting ? 'SUBMITTING…' : 'REQUEST QUOTE'}
</Button>
{submitError && (
  <p className="text-xs text-destructive text-center">{submitError}</p>
)}
```

- [ ] **Step 6: Add error handling to `NewTripWizard.tsx`'s `handleSave`**

Add a new state near the existing `const [confirmOpen, setConfirmOpen] = useState(false);` (currently line 344):
```tsx
const [saveError, setSaveError] = useState<string | null>(null);
const [saving, setSaving] = useState(false);
```

Wrap `handleSave`'s body (currently starting at line 437) the same way:

```tsx
const handleSave = async () => {
  setSaveError(null);
  setSaving(true);
  try {
    // ...every existing line of the function body, unchanged, from the
    // `if (!getAircraftList().some(...))` aircraft-registration check
    // through `setConfirmOpen(true);` ...
  } catch (e) {
    setSaveError(e instanceof Error ? e.message : 'Failed to save trip. Please try again.');
  } finally {
    setSaving(false);
  }
};
```

Do not change a single line inside the try block. At the save button (currently line 720, `<Button className="w-full" onClick={handleSave}>`), add a disabled state and error display:
```tsx
<Button className="w-full" onClick={handleSave} disabled={saving}>
  {saving ? 'SAVING…' : /* keep whatever the button's existing label/children were */}
</Button>
{saveError && (
  <p className="text-xs text-destructive text-center mt-2">{saveError}</p>
)}
```
(Read the actual current button JSX first — it may have children/an icon rather than a plain string label; preserve whatever's there for the non-saving case, only add the `saving` conditional and `disabled` prop.)

- [ ] **Step 7: Verify — build**

Run: `npm run build:client`
Expected: exits 0, no new errors in any of the 6 touched files.

- [ ] **Step 8: Verify — manual browser check**

Rebuild and restart the full stack (`npm run build`, `npm run start:prod` — confirm Postgres is up first). Test the asset-path fix: navigate directly to a nested URL by typing it (e.g. `http://localhost:4001/admin/trips`) rather than clicking through — confirm the page actually loads instead of blank-paging. Log in, land on `/dashboard` (the post-login redirect) — confirm its stat tiles now match `/admin`'s stat tiles (same Total Trips count, etc.), proving it's reading live data. Test the error-masking fix: stop the backend process, then navigate to a trip detail page — confirm you see a real error message, not "TRIP NOT FOUND". Restart the backend. Test the public quote page's new error handling: submit a quote with the backend stopped — confirm a visible error message appears (not silence) and the button re-enables; restart the backend and confirm a real submission still succeeds normally. Test the wizard's new error handling similarly if practical (or at minimum confirm a normal successful save still works end-to-end).

- [ ] **Step 9: Snapshot (no git commit)**

---

### Task 9: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in `.sdd/2026-08-22-viq-auth-minimal/progress.md` Task 3: this task produces no diff of its own (it's verification across everything Tasks 1-7 changed), so it's performed directly by the controller rather than dispatched to an implementer, and has no task review of its own — only the controller's own check.

- [ ] **Step 1: Clean build**

Run: `npm run build` (server + client)
Expected: exits 0.

- [ ] **Step 2: Start the stack, confirm Postgres has the new columns**

Confirm `jetflow_api_postgres` is running (`docker ps`), start `npm run start:prod`, log in via `/api/auth/login`, and run `GET /api/trips/:tripId` on an existing trip — confirm the response includes `aircraftIcaoType`, `aircraftMtowKg`, `aircraftSerialNumber` (even if `null`).

- [ ] **Step 3: Browser walkthrough covering every page this plan touched**

In order: `/trips` (Task 3) → a trip's detail page (Task 7): edit a leg, confirm services regenerate and display → `/admin/dashboard` (Task 4): confirm stats match `/trips`/`/services` → the admin trips page (Task 6): recalculate a route, add a leg → the new-trip wizard (Task 5): create a full new trip end to end, confirm it lands correctly in `/trips` and the admin trips page.

- [ ] **Step 4: Confirm localStorage is no longer the source of truth for these four resources**

In the browser devtools console (or via the Chrome extension's JS execution), run:

```js
localStorage.getItem('viq_trips')
```

This key should either be absent or stale/unused — since Task 2 Step 8 removed the seeding, a fresh browser profile would show `null`; an existing profile from before this rewire may still have a stale value sitting there, which is harmless (nothing reads it anymore). Confirm by editing a trip in the UI and checking that `localStorage.getItem('viq_trips')` does NOT reflect the edit (proves the UI isn't reading/writing it).

- [ ] **Step 5: Report**

Summarize: build status, which of the 8 verification checklists passed, any deviations from the plan and why (ledger these as rulings, same pattern as the auth-minimal plan's ledger).
