# VIQ Frontend/API Rewire — Trip Core: Trips, Legs, Stops, Services (Sub-project 2a of 6)

## Context

Sub-project 1 (auth) is complete and verified: the API requires a bearer
token on every route except `POST /api/auth/login` and `POST /api/quotes`,
and `src/client/lib/apiClient.ts` already has an `apiFetch()` helper that
attaches the token.

Sub-project 2 ("Frontend → API rewire") is `dataStore.ts`'s ~70 functions,
100% synchronous localStorage reads/writes, called directly inline at
render time by 13 pages (e.g. `getTrips().map(...)` right in JSX, no
`useEffect`, no loading state — none has ever been needed). Converting any
of these to real `fetch()` calls makes it async, which is a breaking
interface change for every consumer. That's too large for one spec, so
sub-project 2 is being split into slices by resource domain. This is
**slice 2a**, the first one.

**Why Trips + Legs + Stops + Services are one slice, not two:** the
original split considered Services separate from Trips/Legs/Stops. But
`TripDetail.tsx`'s leg editor calls `saveLeg()` immediately followed by
`generateOverflightServices()` and `generateArrivalServices()` on *every*
leg save (create and edit both) — and the same page reads services back
with `getServicesForTrip()` to render them. If Legs move to the API while
Services stay on localStorage, leg saves would silently stop producing
visible services. So this slice covers all four resources together: it's
the complete data spine of `TripDetail.tsx` and `TripsPage.tsx`.
Persons/Comms/Docs/Invoices (separate `TripDetail.tsx` tabs, not entangled
with leg-save) and Audit/Settings/Backup/reference-CRUD remain later
slices.

Per explicit user instruction (carried over from sub-project 1): **do not
`git commit` any of this work.**

## Goal

`TripsPage.tsx` and `TripDetail.tsx` (and the admin pages that touch
trip/leg CRUD) read and write Trips, Legs, Stops, and Services through the
real API instead of localStorage. Same page behavior, same function
call-sites where possible, network is now the source of truth.

## Backend schema gaps found during design

Comparing `prisma/schema.prisma` / the existing DTOs against
`src/client/data/types.ts` turned up two real gaps — fields the frontend
persists today that the API has nowhere to put:

- **`Trip`** is missing `AircraftICAOType`, `AircraftMTOWKg`,
  `AircraftSerialNumber`. Per `README.md`'s documented behavior ("Aircraft
  registry selection populates operator, ICAO type, MTOW, and serial
  metadata, which can be overridden for the current mission before
  saving") these are real per-mission overrides, not derived display
  values — they must be persisted.
- **`Leg`** is missing `Purpose`, `AvoidFIRs`, `IncludeFIRs`, `Routing`.
  All four are active fields in the leg editor per `README.md`'s "AI
  Continuation Guide" section.

This slice adds a Prisma migration for both:

```prisma
model Trip {
  // ...existing fields...
  aircraftIcaoType   String? @map("aircraft_icao_type")
  aircraftMtowKg     Float?  @map("aircraft_mtow_kg")
  aircraftSerialNumber String? @map("aircraft_serial_number")
}

model Leg {
  // ...existing fields...
  purpose     String?  @map("purpose")
  avoidFirs   String[] @map("avoid_firs")
  includeFirs String[] @map("include_firs")
  routing     String?  @map("routing")
}
```

Add the matching optional fields to `CreateTripDto`/`CreateLegDto` (they
flow through `UpdateTripDto`/`UpdateLegDto` automatically via
`PartialType`/`OmitType`). No other backend changes are needed — every
other field lines up 1:1 (case-only difference) and the routes/DTOs/audit
attribution described in `README.md`'s route table already exist.

## Frontend: fetch pattern

No new library (no react-query/SWR — the app doesn't need it yet). Each
page keeps its existing local `useState`, adds a `useEffect` that fetches
on mount (and whenever its key params change, e.g. `tripId`), and a
plain `loading`/`error` pair:

```tsx
const [trip, setTrip] = useState<Trip | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  getTrip(tripId).then((t) => { if (!cancelled) { setTrip(t); setLoading(false); } })
    .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
  return () => { cancelled = true; };
}, [tripId]);
```

`loading`/`error` render as plain inline text ("Loading…" / the error
message), matching the app's existing minimal chrome — no spinners or
skeletons introduced.

Mutations (`saveTrip`, `saveLeg`, etc.) become `async`, `await` the
`apiFetch()` call, then update local state from the response (the API
returns the saved row) rather than re-deriving from a `dataRevision`
bump. Callers that today do:

```ts
saveLeg(updated);
generateOverflightServices(updated);
generateArrivalServices(updated);
setDraft(updated);
```

become:

```ts
await saveLeg(updated);
await generateOverflightServices(updated.LegID);
await generateArrivalServices(updated.LegID, { departureGroundHandling });
setDraft(updated);
await onSaved(); // re-fetches the trip sheet, see below
```

`generateOverflightServices`/`generateArrivalServices` stop being
client-side logic ports — they become thin wrappers around
`POST /api/services/legs/:legId/generate-overflight` and
`POST /api/services/legs/:legId/generate-arrival` (both already exist).
This is called explicitly after every leg save, exactly matching today's
two-call pattern — it does not rely on `CreateLegDto`'s `generateServices`
flag, so create and update stay symmetric.

**Refetch strategy:** `TripDetail.tsx` already centers on one trip. Add
`getTripSheetFromApi(tripId)` calling `GET /api/trips/:tripId/sheet` (which
already returns trip + legs + stops + services + persons + docs + comms in
one response) and use it as the single source for the whole page — every
mutation handler `await`s its own call, then re-`await`s the sheet fetch
once, instead of each resource tracking its own list. This replaces
`getTrip`/`getLegsForTrip`/`getStopsForTrip`/`getServicesForTrip` as
separately-tracked state within `TripDetail.tsx` (they stay as individually
callable `dataStore.ts` exports for `TripsPage.tsx` and the admin pages,
which don't need the full sheet).

`TripsPage.tsx` calls `getTrips()` plus, per row, `getLegsForTrip`/
`getStopsForTrip` for summary display — fetch the trip list once, and
either accept N+1 per-row fetches (simplest, matches today's per-row calls
functionally) or add a `GET /api/trips` list-with-counts variant if the
per-row fetch count becomes a real problem. Start with the simple version;
it's a list of at most a few dozen trips, not a performance-sensitive path.

## Function-by-function mapping

| `dataStore.ts` today (sync) | Becomes (async) | Backend route |
|---|---|---|
| `getTrips()` | `getTrips(): Promise<Trip[]>` | `GET /trips` |
| `getTrip(tripId)` | `getTrip(tripId): Promise<Trip \| undefined>` | `GET /trips/:tripId` |
| `nextTripId()` | `nextTripId(): Promise<string>` | `GET /trips/next-id` |
| `saveTrip(trip)` | `saveTrip(trip): Promise<Trip>` — POST if new, PATCH if existing (check via a preceding `getTrip` or a `isNew` flag threaded from the caller) | `POST/PATCH /trips` |
| `deleteTrip(tripId)` | `deleteTrip(tripId): Promise<void>` | `DELETE /trips/:tripId` |
| `getLegs()`, `getLegsForTrip(tripId)` | same, `Promise<Leg[]>` | `GET /legs` (client-side filter by `tripId` for the `ForTrip` variant, matching today's pattern) |
| `saveLeg(leg)` | `Promise<Leg>`, POST/PATCH | `POST/PATCH /legs` |
| `deleteLeg(legId)` | `Promise<void>` | `DELETE /legs/:legId` |
| `getStops()`, `getStopsForTrip(tripId)` | `Promise<Stop[]>` | `GET /stops` |
| `saveStop(stop)` | `Promise<Stop>`, POST/PATCH | `POST/PATCH /stops` |
| `deleteStop(stopId)` | `Promise<void>` | `DELETE /stops/:stopId` |
| `getServices()`, `getServicesForTrip(tripId)` | `Promise<Service[]>` | `GET /services?tripId=` |
| `saveService(service)` | `Promise<Service>`, POST/PATCH | `POST/PATCH /services` |
| `deleteService(svcId)` | `Promise<void>` | `DELETE /services/:svcId` |
| `computeCountriesOverflown(dep, arr)` | `Promise<string[]>` | `GET /legs/compute-overflight?dep=&arr=` |
| `generateOverflightServices(leg)` | `generateOverflightServices(legId): Promise<Service[]>` | `POST /services/legs/:legId/generate-overflight` |
| `generateArrivalServices(leg, opts)` | `generateArrivalServices(legId, opts): Promise<Service[]>` | `POST /services/legs/:legId/generate-arrival` |
| new: `getTripSheetFromApi(tripId)` | `Promise<TripSheet>` | `GET /trips/:tripId/sheet` |

All response bodies are camelCase; all frontend types are PascalCase. Add
one small mapper per resource (`mapTripFromApi`, `mapLegFromApi`, etc.) in
`dataStore.ts` — mechanical field renames, no logic — rather than changing
`src/client/data/types.ts` or scattering `response.trip_id as any` casts
across pages.

**Audit:** drop every `addAuditEntry(...)` call inside the functions this
slice touches — the backend already writes an audit entry on each mutation
via the `user` field (`AuditService.log`/`logDiff`, confirmed in
`trips.service.ts`). Keeping both would double-log. `addAuditEntry` itself
and `getAudit()` stay in `dataStore.ts` untouched — they're used by other
resources this slice doesn't cover yet.

**localStorage:** retired for trips/legs/stops/services specifically — no
offline fallback, matching the app's move toward a real shared backend now
that auth exists. Other resources' localStorage (persons, comms, docs,
invoices, settings, backup) is untouched by this slice.

## Pages touched

- `TripsPage.tsx` — list view, `getTrips`/`getLegsForTrip`/`getStopsForTrip`
  (services/comms reads for summary counts, if used, also move — check at
  implementation time; `getAircraft`/`formatDate` stay as-is, they're
  reference-data/pure-formatting, out of this slice's scope).
- `TripDetail.tsx` — the heaviest consumer; rewire to the trip-sheet
  pattern above. This is almost certainly its own implementation task by
  size (currently mixes trip header, leg register, leg editor, service
  cards, and country-grouped permit requests in one file).
- `AdminTrips.tsx`, `AdminDashboard.tsx`, `NewTripWizard.tsx` — exact
  functions used get confirmed at plan-writing time by reading each file;
  expected to be `getTrips`, `saveTrip`, `deleteTrip`, `nextTripId`.

## Testing

No existing test framework changes needed. Manual verification per
function, following the auth slice's pattern:

```powershell
npm run build
npm run start:prod
# Login, capture the token, then:
Invoke-WebRequest http://localhost:4001/api/trips -Headers @{Authorization = "Bearer <token>"}
Invoke-WebRequest -Method POST http://localhost:4001/api/legs -Headers @{Authorization = "Bearer <token>"} -Body (...) -ContentType 'application/json'
```

Browser check (Chrome, live): open `/trips`, confirm the list renders from
the API (kill the server, confirm the page shows an error rather than
silently falling back to stale localStorage data); open a trip, edit a leg,
save, confirm the regenerated services appear without a page reload;
delete a leg, confirm it's gone after refresh (proves it persisted
server-side, not just removed from local state).

## Out of scope (later slices)

- Persons, Comms, Docs, Invoices (`TripDetail.tsx`'s other tabs,
  `ComposerPage.tsx`, `CommsPage.tsx`, `BillingPage.tsx`).
- Reference-data CRUD (`AdminAssets.tsx`: aircraft, providers, airports,
  countries) and reference-data *reads* (`refAirports` etc. stay bundled
  JSON).
- Audit trail *reading* (`AuditPage.tsx`, `getAudit()`), Settings, Backup/
  Restore (`exportBackup`/`importBackup`/`resetToSeed`).
- `generateInvoiceFromTrip`, `getDocsRequired`, `getPrice` — invoice/pricing
  logic, untouched.
- True FIR polygon boundaries, real SMTP sending — separate sub-projects
  (4 and 5) per the original 6-part plan, unrelated to this rewire.

## Do not

- Do not `git commit`.
- Do not touch reference-data loading (`refAirports`/`refCountries`/etc.)
  — stays bundled JSON.
- Do not introduce a data-fetching library (react-query/SWR) — plain
  `useEffect` + `useState` is sufficient at this scale.
- Do not add roles/permissions beyond what sub-project 1 already built.
