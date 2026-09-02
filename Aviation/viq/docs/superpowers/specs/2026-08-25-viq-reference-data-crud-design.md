# VIQ — Reference Data CRUD Durability (4e)

Status: Approved, ready for implementation plan.
Date: 2026-08-25

## Problem

`AdminAssets.tsx` has working add/edit/delete UI for four reference-data
resource types — Aircraft, Providers, Airports, Countries — via
`AircraftDialog`/`ProviderDialog`/`AirportDialog`/`CountryDialog`. But the
data layer backing them (`getAircraftList`/`saveAircraft`/`deleteAircraft`
and the equivalent triples for the other three, all in `dataStore.ts`) is
synchronous and reads/writes `localStorage` only, seeded once from static
bundled JSON (`src/client/data/json/{aircraft,providers,airports,
countries}.json`). Edits made through the admin UI:

- don't survive a browser storage clear
- aren't visible to any other browser/session
- aren't visible to the server at all (permit-country-rule checks, aircraft
  type resolution for MTOW/manufacturer, etc. all read the same static
  JSON on the server side, independently of whatever a user edited in
  their browser)

This sub-project makes these four resource types durable and
server-authoritative, matching how Persons (4d-1) and Docs (4a) were
migrated earlier — but taking a different mechanism, justified below.

## Discovery: the hard part is already done

Before designing this, the actual current backend state was checked
directly (reading `prisma/schema.prisma`, `prisma/seed.ts`, and
`src/server/modules/reference/`, then confirming live via
`curl .../api/reference/{aircraft,providers,airports,countries}` against
the running dev server):

- Prisma models `Country`, `Airport`, `AircraftType`, `Aircraft`,
  `Provider` already exist and are already seeded — `prisma/seed.ts`
  upserts them from the exact same JSON files that `dataStore.ts`
  currently imports for its static baseline.
- `src/server/modules/reference/reference.controller.ts` already exposes
  working `GET` endpoints for all four (`/reference/aircraft`,
  `/reference/providers`, `/reference/airports`, `/reference/countries`),
  confirmed live: 6 aircraft, 13 providers, 19 airports, 22 countries,
  all real DB rows.
- What's missing is only the **write side** (`POST`/`PATCH`/`DELETE`) on
  that same module, and the **frontend switch** from
  JSON-import-plus-localStorage to fetching this already-live API.

This is a materially smaller change than the Persons migration (4d-1),
which required new Prisma models, a hand-written migration, and a full
entity redesign (trip-coupled → roster). No schema change and no
migration are needed here.

## Why not the async-conversion pattern used for Persons/Docs

4d-1 converted `Person`-related `dataStore.ts` functions from sync to
async, and that single-entity change still produced three unplanned
breakages elsewhere in the codebase (`quotes.service.ts`,
`trips.service.ts`, `emailTemplates.ts`) that only surfaced via
`tsc`/`nest build`, because callers assumed synchronous access.

Measuring the blast radius here first (`grep` across `src/client`) found
`getAircraftList`/`getProviderList`/`getAirportList`/`getCountryList`
called synchronously — often inline inside JSX `.map()` calls or as
`.find()` lookups inside other synchronous helper functions — across 10
files: `TripDetail.tsx`, `NewTripWizard.tsx`, `AdminTrips.tsx`,
`ComposerPage.tsx`, `ComposeDrawer.tsx`, `emailTemplates.ts`,
`TripsPage.tsx`, `LandingPage.tsx`, `AdminAssets.tsx`, and `dataStore.ts`
itself (whose own singular lookups — `getAircraft`, `getCountry`,
`getProvider`, `getAirport` — are built on top of the list getters and
are, in turn, called synchronously in even more places, including inside
`emailTemplates.ts`'s country-name resolution).

Converting all of that to async would be roughly 3-4x the surface area
of the Person migration, for data that is read far more often than it's
written (reference lookups happen on nearly every page; edits happen
rarely, from one admin screen). A full async conversion was presented as
an alternative and explicitly rejected by the user in favor of the
approach below.

## Approach: in-memory cache primed by a one-time app-boot preload

Fetch all four lists from the API exactly once, when the authenticated
app shell mounts, and cache them in memory. The synchronous getters stay
synchronous, reading the cache — **zero changes to any of the 10
consumer files**. Only the four `save*`/`delete*` functions become async
(they hit the API, then update the in-memory cache directly so the UI
reflects the change without needing a full reload).

This mirrors the mental model the app already uses for genuinely static
reference data (`aircraft-types.json`, `operators.json`, `cities.json`,
etc., imported once at module load and read synchronously forever after)
— the only change is that the source of the one-time load moves from a
bundled JSON file to a live API call.

### App-boot preload

`src/client/components/Layout.tsx` is the shared shell for every
authenticated route (`<Route element={<RequireAuth><Layout /></RequireAuth>}>`
wraps `/dashboard`, `/trips`, `/admin/*`, etc. via `<Outlet/>`). It gains:

```tsx
const [refDataReady, setRefDataReady] = useState(false);
useEffect(() => { preloadReferenceData().then(() => setRefDataReady(true)); }, []);
if (!refDataReady) return <LoadingScreen />; // brief, local API call
```

`preloadReferenceData()` (new, in `dataStore.ts`) fetches all four lists
in parallel via `Promise.all` and populates four module-level cache
variables. This guarantees every page that renders past `Layout` can
call `getAircraftList()` etc. synchronously and get real data — the same
guarantee bundled JSON gave for free, now backed by one extra network
round-trip at app boot instead of zero.

**Known limitation, accepted deliberately**: the cache is populated once
per page load. A second browser tab open at the same time won't see
edits made in the first tab until it reloads. This is an explicit
trade-off for avoiding the async-conversion blast radius, not an
oversight — call it out in the completion notes, but it does not block
this sub-project, since this is a single-admin local tool today.

### Mapping gaps (the three fields that don't translate 1:1)

The client-side `Aircraft`/`Provider`/`Country` TypeScript interfaces
were designed against the flat JSON shape, not the normalized Prisma
schema. Reading the actual `AircraftDialog`/`ProviderDialog`/
`CountryDialog` code (what fields they truly let a user edit) surfaced
three places where a naive 1:1 field copy would be wrong:

1. **Aircraft manufacturer/MTOW/noise cert are overrides, not plain
   fields.** Prisma's `Aircraft` model has no `manufacturer`/`mtowKg`
   columns — it has nullable `manufacturerOverride`/`mtowOverrideKg`/
   `noiseCertOverride`, resolved against a shared `AircraftType` row
   (`type.manufacturer`/`type.mtowKg`/`type.noiseCert`) at read time
   when the override is unset (per the schema's own comment: "resolve
   from the matching AircraftType at read time unless an override is set
   here"). `mapAircraftFromApi` must resolve `override ?? type.field`;
   `saveAircraft`'s API payload must write to the `*Override` columns
   only. **Writing to the shared `AircraftType` row is out of scope and
   must never happen from this dialog** — that would silently change
   every other tail flying the same aircraft type.
2. **Provider `Contacts` isn't real data today.** `ProviderDialog`
   never exposes a UI for it — `handleSave` synthesizes
   `[{Label:'Primary', Email}]` on every save regardless of what was
   there before. There is no `contacts` column on the Prisma `Provider`
   model. Rather than adding a column to persist a field nothing lets a
   user actually author, the API payload drops `Contacts` entirely;
   `mapProviderFromApi` re-synthesizes the same single-entry array from
   `Email` on read, so the dialog's behavior is observably unchanged.
3. **Country dialog only edits 8 of the Prisma model's fields.**
   `ciqRequired`, `subRegion`, `caaWebsite`, `iso3`, `notes` exist in the
   schema but have no UI. `PATCH /reference/countries/:iso2` must be a
   true partial update (only overwrite fields present in the request
   body — same pattern already used by `UpdatePersonDto`), so saving a
   country from this dialog never wipes those five fields back to
   Prisma defaults. `POST` (create) leaves them at Prisma's column
   defaults (`ciqRequired: false`, others `null`) since there's no data
   to send yet — acceptable since new countries created via this dialog
   don't have that data available and can be filled in via the API
   directly later if ever needed.

Airport maps cleanly field-for-field onto the Prisma `Airport` model —
no gap.

## Backend design

Extend the existing `src/server/modules/reference/` module (no new
module — this data already lives there for reads):

- `reference.service.ts` gains `createAircraft`/`updateAircraft`/
  `deleteAircraft`, and the equivalent triples for `Provider`, `Airport`,
  `Country`. Each follows the exact pattern already used by every other
  service this session (`PersonsService`, `DocsService`, etc.):
  `NotFoundException` on missing id for update/delete, `AuditService.log`
  (create/delete) or `AuditService.logDiff` (update) call, `user` field
  defaulting to `'SYSTEM'`.
- `reference.controller.ts` gains the matching `@Post`/`@Patch`/`@Delete`
  routes, each taking a new `class-validator` DTO
  (`src/server/modules/reference/dto/{create,update}-{aircraft,provider,
  airport,country}.dto.ts` — 8 new DTO files, one per create/update pair,
  matching the granularity already used by `persons`/`docs`).
- Delete semantics: `Aircraft`/`Provider`/`Airport` deletes are plain
  Prisma deletes. `Country` delete needs a guard — confirmed by reading
  `prisma/schema.prisma` that neither `Airport.country` nor
  `CountryRule`'s relation to `Country` declares `onDelete: Cascade`, so
  Prisma's default `Restrict` applies: deleting a `Country` that still
  has `Airport` or `CountryRule` rows pointing at it throws a foreign-key
  constraint error (`P2003`) at the DB level. `deleteCountry` in
  `reference.service.ts` must catch that specific Prisma error code and
  rethrow as a `BadRequestException` ("Cannot delete a country with
  airports or country rules on file") — same shape as every other
  service's guarded-delete error handling — rather than letting the raw
  Prisma error reach the client as an unhandled 500.

## Frontend design

`src/client/lib/dataStore.ts`:

- Four new module-level cache variables (e.g. `let _aircraftCache:
  Aircraft[] | null = null;`), one `preloadReferenceData(): Promise<void>`
  that fetches all four via `Promise.all` and populates them.
- `getAircraftList()`/`getProviderList()`/`getAirportList()`/
  `getCountryList()` rewritten to return the cache (falling back to the
  static JSON import — today's `refAircraft` etc. — only if the cache
  hasn't been populated yet, as a defensive fallback rather than
  throwing; in practice `Layout.tsx`'s gate makes this fallback
  unreachable in normal use).
- `saveAircraft`/`saveProvider`/`saveAirport`/`saveCountry` and their
  `delete*` counterparts become `async`, call the new endpoints via the
  existing `apiJson` helper (same helper every other CRUD function in
  this file already uses), then splice the result into the relevant
  cache array so the UI updates without a full page reload.
- New mapper functions `mapAircraftFromApi`, `mapProviderFromApi`,
  `mapAirportFromApi`, `mapCountryFromApi` (matching the existing
  `mapPersonFromApi`/`mapDocFromApi` naming and shape), implementing the
  three gaps above.
- `AdminAssets.tsx`'s dialogs (`AircraftDialog`/`ProviderDialog`/
  `AirportDialog`/`CountryDialog`) and their `handleSave` call sites need
  no structural changes — they already call `saveAircraft(...)` etc.
  without awaiting or handling a return value in a way that breaks when
  the function becomes `async` (checked: each `handleSave` is already an
  arrow function that can trivially gain `async`/`await` in front of the
  existing call; `onSaved()` already runs synchronously after, and just
  needs to move after the `await`).
- `Layout.tsx` gains the preload gate described above.

## Testing / verification plan

Same rhythm as every other sub-project this session:

1. `npx tsc --noEmit` on both tsconfigs, `npx nest build`,
   `npm run build:client` — all clean.
2. Live API verification via curl + a locally-minted JWT: create/update/
   delete one throwaway row of each of the four types, confirm the
   override-resolution (aircraft), Contacts-synthesis (provider), and
   partial-update (country) behaviors match this spec exactly, then
   clean up and confirm counts return to baseline (6/13/19/22).
3. Since this is the first sub-project this session to change
   `Layout.tsx` (an app-shell file every page depends on), an additional
   check beyond the usual: confirm `/dashboard`, `/trips`, and
   `/admin/assets` all still render correctly after the preload gate is
   added (via curl against the built `index.html`/bundle is not
   sufficient to catch a runtime React error — note this limitation
   explicitly in completion notes, same as every other sub-project's
   "no browser available" caveat).

## Explicitly out of scope

- `AircraftType`, `Operator`, `CountryRule`, `ICAORule`, `DocTemplate`,
  `PriceItem`, `City` — none of these have admin CRUD UI today, so none
  are touched. If a future sub-project wants to edit them, it follows
  this same pattern (the GET endpoints already exist for all of them
  too).
- Cross-tab cache invalidation / live sync — noted above as an accepted
  limitation, not solved here.
- Adding a real `contacts` column to `Provider` — the dialog doesn't
  support authoring multiple contacts today; if that's wanted later it's
  a separate, small follow-up (new column + dialog UI), not bundled in.
