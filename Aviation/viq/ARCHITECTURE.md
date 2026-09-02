# VIQ Architecture Plan v2

## Data Architecture: JSON (Static) + localStorage (Transactional)

### Layer 1: Static Reference Data (JSON files)
Stored as `.json` files in `src/data/json/`. Loaded at build time. Backed up as files.

| File | Contents | Notes |
|------|----------|-------|
| `aircraft-types.json` | ICAO types + performance data (range, MTOW, fuel burn, ceiling, pax capacity) | Base templates |
| `aircraft.json` | Actual aircraft in fleet — references type, adds registration, owner, custom perf edits | Can change hands |
| `operators.json` | Operator/client companies, their fleet references | |
| `providers.json` | Vendors with service types, scope, contacts | |
| `airports.json` | ICAO, IATA, name, country, TZ, coords, elevation | |
| `countries.json` | ISO2, region, permit requirements, escalation contacts | |
| `cities.json` | City name, country ISO2, timezone | For UI lookups |
| `country-rules.json` | Lead times, tolerances, working days by country+service type | |
| `icao-rules.json` | Airport-specific rules, exceptions to country rules | Inherited + override |
| `doc-templates.json` | Required docs by country/ICAO for permit requests | |

**Update (4e):** `aircraft.json`/`providers.json`/`airports.json`/
`countries.json` above are still the *baseline seed*, but are no longer the
runtime source of truth for reads once the app has loaded — `Aircraft`,
`Provider`, `Airport`, `Country` are now database-backed (Prisma models
already existed; 4e added the write endpoints) with an in-memory cache
populated once at app boot (`Layout.tsx` → `preloadReferenceData()`) rather
than an async rewrite of every consumer. See README.md's "Reference data
durability (4e)" section for the full mechanism and its three field-mapping
gaps (Aircraft override resolution, Provider Contacts, Country partial
update). `aircraft-types.json`/`cities.json`/`icao-rules.json`/
`doc-templates.json` remain genuinely static — no admin CRUD UI exists for
them yet. `operators.json` joined `Operator` to the same database-backed/
cached pattern in the Aircraft/Operator sub-project below — it is no
longer purely static either. `country-rules.json` followed the same path
later (see "Reference Data search/filter/Excel" update below) — `CountryRule`
gained write endpoints and is no longer read-only.

**Update (Reference Data search/filter/Excel):** `ReferencePage.tsx` (the
`/reference` catalog browser — distinct from `/admin/assets`, which is
resource *management*) had its remaining static-JSON tabs
(Airports/Countries/Aircraft/Providers) switched onto the same
`getXList()` cache getters 4e established, and every one of its seven
tabs gained client-side search (`src/client/hooks/useTextFilter.ts`) and
Excel export/import (`src/client/lib/excelIO.ts`, new `xlsx` dependency).
`CountryRule` gained full CRUD (`POST/PATCH/DELETE
/reference/country-rules(/:id)`, `@Roles('Admin')`) and an Add/Edit/Delete
dialog — it was the last Layer-1 resource still read-only. **If you add
an eighth tab to this page, follow the established shape exactly:** a
`getXList()`/`saveX`/`deleteX` cache-backed data source, a `useTextFilter`
call with a tab-specific searchable-text function, and Download/Upload
buttons wired through `exportToExcel`/`parseExcelFile` — don't invent a
second search or import/export mechanism. `exportToExcel<T extends
object>` is generic on purpose (it was reworked mid-implementation from
type-specific casts to one generic signature) — call it directly, never
recreate the `as unknown as Record<string, unknown>[]` cast pattern it
replaced. Full mechanism in README.md's "Reference Data
search/filter/Excel" section.

**Update (Aircraft/Operator expansion):** `Operator` gained its first CRUD
UI (`AdminAssets.tsx`'s new Operators tab) and `Aircraft.currentOperatorId`
became a required, real Prisma relation. `Operator.fleet` is deliberately
never written from any UI — it stays server-derived/read-only, since
`Aircraft.currentOperatorId` is now the single source of truth for which
aircraft belong to which operator; a hand-editable `fleet` array would be
a second, driftable copy of the same fact. `Trip.billToAddress` (new,
optional) plus `resolveBillToAddress()` in `dataStore.ts` is the first
"bill to" concept anywhere in this app — full mechanism in README.md's
"Aircraft/Operator expansion & bill-to resolution" section.

**Update (Item 16 — country fees):** new `CountryFee` model, database-backed
from day one (no JSON seed, unlike every other Layer-1 resource above —
there was no pre-existing static fee data to migrate off of). Same
in-memory-cache-at-boot pattern as the rest of this layer
(`preloadReferenceData()`'s 7th parallel fetch), same
`AuditService`-backed CRUD as `Operator`/`Country`/etc. Conceptually it
sits next to `PriceItem` (Layer 2, `viq_pricelist` — a *provider's* price
list) rather than replacing it: `PriceItem` is what a vendor charges,
`CountryFee` is what a government/regulator charges, and
`generateInvoiceFromTrip` (see "Owning UI surface" below) now reads both
for the same confirmed service and emits a line item for each. Full
mechanism in README.md's "Country billing/fee schedule (Item 16)"
section.

**Update (OCR format expansion):** `DocAttachment` upload/OCR broadened from
image-only (JPEG/PNG) to PDF, GIF, TIFF, BMP, plain text, and DOCX.
Worth knowing if you touch `OcrService` again: `pdfjs-dist` v6 is ESM-only
and this project compiles to CommonJS, so it's loaded via
`new Function('specifier', 'return import(specifier)')` rather than a
normal `import` — TypeScript's commonjs dynamic-import transform would
otherwise rewrite a plain `await import(...)` into a `require()` call that
throws `ERR_REQUIRE_ESM`. PDF page rasterization (for scanned documents
with no text layer) uses `@napi-rs/canvas`, chosen over the older `canvas`
package specifically because it ships prebuilt native binaries — no C++
build toolchain needed on this Windows box. Full mechanism, including the
password-protected-PDF handling, in README.md's "OCR extraction" section.

**Update (Multi-user auth with roles):** the single hardcoded `.env` admin
is gone — a `User` Prisma model backs real login, with three enforced
roles (Admin/Coordinator/Viewer) via a global `RolesGuard` alongside the
existing `JwtAuthGuard`. A new `/admin/users` page manages accounts. Full
mechanism, design decisions, and the complete list of gated
controls/routes in `docs/superpowers/specs/2026-08-26-viq-auth-roles-design.md`
and README.md's "What's not done yet" section. This slice also fixed a
real pre-existing bug: every mutation's audit trail used to record the
literal string `"SYSTEM"` regardless of who was logged in — `dataStore.ts`
now defaults to the real session's username.

### Layer 2: Transactional Data (formerly localStorage, now API-backed)
Originally simulated a database in browser localStorage; every resource
listed below has since been rewired to the real NestJS/Postgres API (see
README.md's "What's not done yet" for the rewire's completion note). This
section is kept for its description of *what* each resource is, not *where*
it lives.

| Key | Contents |
|-----|----------|
| `viq_trips` | Trip records |
| `viq_legs` | Leg records |
| `viq_stops` | Stop records |
| `viq_services` | Service records |
| `viq_persons` | Crew & pax |
| `viq_comms` | Communications |
| `viq_audit` | Audit trail |
| `viq_docs` | Document metadata |
| `viq_invoices` | Billing invoices |
| `viq_pricelist` | Service pricing by provider/type |

### Layer 3: Data Service (`src/lib/dataStore.ts`)
Unified API for all data operations:
- `getReferenceData(type)` — reads JSON
- `getTransactions(key)` — reads localStorage
- `saveTransactions(key, data)` — writes localStorage
- `addAuditEntry(...)` — logs every mutation
- `exportBackup()` — dumps all localStorage + JSON metadata
- `importBackup(data)` — restores from dump

## Implementation Phases

### Phase 1: Foundation
- [x] Create JSON reference files
- [x] Create dataStore service layer
- [x] Remove stale code (Home.tsx, App.css)
- [x] Migrate seed.ts to load from JSON + localStorage

### Phase 2: Reference Data CRUD
- [ ] AdminAssets → full CRUD for aircraft, operators, providers, airports, countries, cities
- [ ] AdminSettings → persist settings to localStorage
- [ ] Rules editor (country + ICAO rules with inheritance)

### Phase 3: Creation Workflows
- [ ] New Trip wizard (client, operator, aircraft selection, leg builder)
- [ ] Add/edit stops
- [ ] Add/edit crew & pax
- [ ] Document upload (metadata + file reference)
- [ ] Edit trip metadata

### Phase 4: Billing
- [ ] Price list management
- [ ] Auto-populate invoice from confirmed services
- [ ] Invoice lifecycle (draft → sent → paid)
- [ ] E-signature placeholder + QR code generation
- [ ] Audit trail for invoice changes

### Phase 5: Operational Features
- [ ] Search/filter on all list pages
- [ ] Dark mode toggle
- [ ] Calendar/Gantt view
- [ ] Route map visualization
- [ ] PDF export

### Phase 6: Auth
- [ ] Login page
- [ ] Role-based access (admin, ops, readonly)

## AI Chatbot Fuel
The JSON reference data is structured for RAG:
- Each entity has a `description` field for natural language context
- Rules have `notes` and `exceptions` arrays
- Cross-references are explicit (e.g., aircraft-type → performance data)

## AI Pickup and Editing Contract

This is the canonical continuation note for an AI agent working on VIQ.

### Single application rule

The repository must remain one application in the `viq` folder:

```text
viq/
  src/client/     React/Vite UI
  src/server/     NestJS API
  prisma/         schema, migrations, seed data
  package.json    one dependency/build manifest
```

The production build is one command. Nest compiles to `dist`, Vite compiles
the browser bundle to `dist/public`, and Nest serves both the UI at `/` and
the API under `/api`. Do not recreate a second `viq` or `jetflow-api` source
tree.

### Owning UI surface

`src/client/pages/TripDetail.tsx` owns the operational trip screen. Keep these
behaviors intact when editing it:

1. An `AttentionStrip` appears before Trip Information — a Level-1 "what
	needs my attention" line (leg/PAX/crew counts plus ACTION/WAITING/
	RECONFIRM/CONFIRMED badges, computed by `bucketForService()` from each
	service's `Status`/`Urgency`, "ALL CLEAR" when nothing's outstanding).
	It replaced a bare 4-stat grid — don't reintroduce a stats-only summary
	above it; the strip's whole purpose is status, not counts.
2. Trip Information has an inline far-right Edit/Save control. Aircraft
	registry selection derives operator, ICAO type, MTOW, and serial number,
	but those derived values may be overridden for that mission.
3. The ROUTE tab's leg navigation is a single `<select>` (`selectedLegId`
	state, one ID or `null`) — there is no separate register table and no
	expand-in-place card list; that dual navigation was removed as clutter
	(see "Leg/services UI redesign" below). When `selectedLegId` is `null`,
	a grid of read-only preview cards (one per leg, click anywhere to select)
	renders instead of the detail panel. When a leg is selected, one `Card`
	shows its header (dep/arr/ETD/ETA/pax/crew/overflight) plus the full
	`LegEditor` below it, with a "CHANGE LEG" button to go back to the
	preview grid.
4. The expanded leg editor includes route, ETD/ETA, PAX, crew, purpose,
	callsign, routing, include/avoid FIRs, route countries, a PERMITS section
	(country services) and a HANDLING section (leg-level services grouped by
	ICAO), crew/PAX manifest, messages, audit trail, and billing. Each
	service inside PERMITS/HANDLING is a `ServiceInlineEditor` — a compact
	Level-1 status row (type, status/urgency badges, ref#, assigned-to) that
	is always visible, with OPEN/MESSAGE actions; OPEN launches the full
	editable form (type/variant/provider/status/notes/ref/assigned) in a
	`Sheet` "Service Case drawer" (`components/ui/sheet.tsx`, `side="right"`
	default) rather than showing every field inline for every service at
	once. The row's `editing`/`selected`/save/provider-eligibility logic is
	unchanged from before the drawer split — only the render shape changed.
	Don't revert to always-inline full forms; that's the exact clutter this
	replaced.
5. New legs are created through `saveLeg()` and should seed their departure
	from the previous leg's arrival when possible. After endpoints are known,
	route-country suggestions can be reviewed, added, or removed.
6. The trip-level tabs are ROUTE / SERVICES / PEOPLE / DOCS / BILLING /
	ACTIVITY — down from 7 (PERMITS was merged into SERVICES: the
	`PermitSubmissionGroups` batch-submission UI and the permit-specific
	table now render at the top of the SERVICES tab, shown only when
	`permitServices.length > 0`, rather than needing a separate tab switch
	to see the exact same underlying `Service` rows). ACTIVITY (was
	MESSAGES) merges `Comm` history with a trip-scoped slice of the audit
	log into one chronological feed — full detail for messages, a compact
	one-line row for each audit entry. Don't reintroduce a standalone
	PERMITS or MESSAGES-only tab; extend SERVICES/ACTIVITY instead.
7. `LegEditor.save()`'s call to `generateOverflightServices`/
	`generateArrivalServices` is followed by a "N REQUIREMENTS SUGGESTED"
	review banner (ACCEPT ALL / REVIEW-with-per-item-removal) built on the
	fact that both generator functions are idempotent and return exactly
	what they just created. This is a real, verified limitation, not a
	guess: a service removed via REVIEW is not marked dismissed anywhere,
	so it silently reappears if the leg is saved again later (confirmed
	live against the API — generate → delete → generate recreates the same
	row). Don't present REVIEW's removal as permanent in copy or design
	until a real dismissal-tracking field exists.
8. `addService()` takes the `ServiceType` as a required parameter (was
	hardcoded to `'FlightPlanning'`) — every add-service entry point
	(per-country in PERMITS, per-airport-group and new-airport-group in
	HANDLING) renders through the one shared `renderAddServiceControl()`
	helper, a category-grouped type-select. Don't add a new bespoke "Add
	X" button for a service type; extend the shared control's grouping
	instead — that's the whole point of consolidating to one command.

### Leg-scoped crew & pax manifest (supersedes trip-level assignment)

Assignment is per-**leg**, not per-trip: `LegPersonAssignment` (unique on
`legId, personId`) replaced a same-day `TripPersonAssignment` design once
it became clear a trip's legs can carry different people (a positioning
leg with just pilots, a later leg that adds passengers). Keep these
intact:

1. `PersonsService.assign(personId, dto)`/`unassign(personId, legId)` take
	a `legId`, never a `tripId`. Don't add a trip-level assign path back —
	use `POST /persons/:personId/assign-all-legs` (upserts across every leg
	of a trip in one transaction) for the "same person, every leg" case
	instead of looping individual `assign` calls client-side.
2. `GET /persons?legId=X` returns one row per person for that leg.
	`GET /persons?tripId=X` returns **one row per (leg, person) pair** —
	not deduplicated across legs — each carrying `legId`/`legSeq`/
	`legDepIcao`/`legArrIcao`. A consumer that wants "everyone on this
	trip, once" must dedup client-side (see `ComposerPage.tsx`'s fallback);
	don't push dedup logic into the endpoint itself, since the per-leg
	shape is what `TripDetail.tsx`'s leg-scoped manifest actually needs.
3. `TripDetail.tsx`'s crew/pax manifest add/remove acts on the leg
	currently selected in ROUTE (`selectedLegId`), not the trip as a whole.
	Don't collapse it back to a trip-wide list — that's the exact
	limitation this rework fixed.
4. `TripDetail.sheet()` and `QuotesController POST /quotes` both work in
	terms of per-leg assignment rows (the quotes endpoint fans a submitted
	person out to every leg of the new trip in one transaction). Any new
	code that creates a Trip+Legs+Persons together should follow that same
	fan-out pattern, not a single trip-level assignment.

Full design in `docs/superpowers/specs/2026-08-26-viq-leg-scoped-crew-pax-design.md`.

### Person detail owning surface

`src/client/pages/admin/PersonDetail.tsx` (route `/admin/persons/:personId`)
owns full roster-record management. Keep these intact when editing it:

1. Trip assignment (`assignPersonToTrip`/`unassignPersonFromTrip`, backed
	by the leg-scoped endpoints above) lives
	only here (Assigned Trips card), not in `AdminAssets.tsx`'s
	`PersonDialog` — that dialog is identity-only (name/role/phone/email).
	Don't re-add a trip picker to `PersonDialog`; it would create two
	inconsistent places to assign the same relationship.
2. Biodata and Medical are separate cards with independent edit-toggle
	state (each mirrors `TripDetail.tsx`'s `TripInfoEditor` pattern), not
	one shared form — a user editing a passport number shouldn't have to
	touch medical fields to save it, and vice versa.
3. Docs on this page reuse `uploadDoc`/`runDocOcr`/`DocVerifyDialog`
	unmodified, scoped via `personId` instead of `tripId`. Don't fork a
	person-specific copy of that flow — extend the shared one if it needs
	new capability.
4. Expiry badges (`ExpiryBadge.tsx` / `src/client/lib/expiry.ts`) are
	computed client-side from `Date.now()` at render time — there is no
	server-side "days until expiry" field to keep in sync. `personExpiryStatus`
	(added in 4d-3) is the only place per-person severity — including the
	crew-only "missing data" check — is decided; every badge (this page's
	header, `AdminAssets.tsx`'s roster rows and Expiry tab, the
	`AdminDashboard.tsx` Roster Attention card) calls it rather than
	re-deriving its own notion of "worst." Don't duplicate that logic
	elsewhere; extend `personExpiryStatus` instead.

### Leg/services UI redesign

Replaces the old register-table-plus-cards navigation and the old flat,
undifferentiated service list with a leg-selector dropdown and a
PERMITS/HANDLING split, per explicit user request (the old layout required
clicking a leg in one place then scrolling to see it expand elsewhere, and
handling services from every airport on a leg were dumped into one
unlabeled bucket).

- **PERMITS** — unchanged data model from before (services with
  `CountryISO2` set, one group per country in `Leg.CountriesOverflown`);
  only the row layout changed (see below). Country add/remove and
  `addSuggestedCountries()` (route-country suggestions) are unchanged.
- **HANDLING** — services with no `CountryISO2` (leg-level), grouped by
  `Service.ICAO` (falling back to the leg's arrival ICAO for older rows
  saved before that field existed, read-time only — never write-normalized).
  Each ICAO group is collapsed by default; clicking its header
  (`{ICAO} / {AIRPORT NAME}`) expands it. `addService(iso?, icao?)` — a new
  parameter beyond the pre-3b signature — creates a service pre-tagged to a
  specific ICAO group and auto-expands that group so the new row is
  immediately visible.
- **`ServiceInlineEditor` row layout**: type/variant selects (unchanged from
  3a) in the header, then Provider (new — previously only reachable inside
  the Compose drawer, never displayed or editable on the card itself) and
  Status side by side, then the Notes field (relabeled "Confirmatory note"
  in its placeholder — same field, no schema change), then Ref
  Number/Assigned To as smaller secondary inputs beneath (still fully
  editable, just visually de-emphasized per explicit user direction — never
  drop them to read-only or remove them). Provider's eligible-options list
  uses the same `ServiceType`/ICAO/country matching heuristic already
  established in `ComposeDrawer.tsx` — always keep the service's already-
  assigned provider selectable even if it falls outside that heuristic,
  same reasoning as `ComposeDrawer`.
- Country full names, uppercase, everywhere — never render a bare ISO2 or
  ICAO-derived country code where a `getCountry(iso)?.Name` lookup is
  available.

### Service editing contract

`ServiceType` is not a compile-time enum — it's a plain string whose valid
set lives in the admin-editable `ServiceTypeDef` catalog (`code`, `label`,
`category`: `Permit`/`Handling`/`Other`, optional `variants`, `active`,
`sortOrder`; `GET/POST /service-types`, `PATCH /service-types/:code`; admin
UI on `ReferencePage.tsx`'s "Service Types" tab). The stored service value
`Permit` is seeded with `label: "Landing Permit"`, which is what lets
`serviceLabel(type, defs)` reproduce the old hardcoded "Permit → Landing
Permit" special case as a plain catalog lookup — use `serviceLabel()` rather
than hardcoding that mapping again, and never rename or remove the `Permit`
code (only its `label` is editable). `TripDetail.tsx` fetches the catalog
once (trip-independent) via `getServiceTypes()` and threads it down through
`LegEditor` → `ServiceInlineEditor` as a `serviceTypes` prop — the type
`<select>` groups active defs by `category`, sorted by `sortOrder`, into
`<optgroup>`s; a second `<select>` for `Variant` appears only when the
selected type has `variants` (e.g. Visa: "Visa Required Prior to Arrival" /
"Visa on Arrival"), and picking a new type clears any previously-selected
`Variant`. `Service.ICAO` records which airport within the leg (dep/arr/stop)
a service is for — `generateArrivalServices` sets it automatically to match
its own `direction` (`ARR`/`DEP`); new leg-level services created via the
leg editor's "ADD SERVICE"/"ADD LEG SERVICE" buttons default `ICAO` to the
leg's arrival ICAO (country-scoped permit services leave it unset, since
they're keyed by country, not airport).

Individual and bulk deletion must go through the data store:

```ts
deleteService(service.SVCID);

selectedServiceIds.forEach((id) => deleteService(id));
setSelectedServiceIds([]);
onSaved();
```

The expanded editor must expose both services with `CountryISO2` and services
at leg scope without a country. A service card has:

- a checkbox for bulk selection;
- an individual trash button;
- editable type (grouped by category, from the live catalog), variant (when
  applicable), status, reference, assignee, and notes;
- a Save button disabled when the draft is equal to the saved snapshot.

The leg Save button is likewise disabled unless a leg field changed. Saving a
leg increments `Revision`, normalizes country-name FIR entries to ISO2 where
possible, persists through `saveLeg()`, and regenerates idempotent derived
services.

### Permit request example

Country permit groups allow one request to cover multiple legs:

```text
GB LANDING PERMIT REQUEST
  [x] LEG 1: EGLL -> LFPG | 6 PAX | 3 CREW | BUSINESS
  [x] LEG 3: LFPB -> EGLL | 4 PAX | 2 CREW | POSITIONING
  Request reference: CLIENT-GB-001
  SUBMIT GB REQUEST
```

The action updates the selected services to `Requested` and assigns the same
reference. It is a local workflow record, not an external authority submission.

### FIR and route rules

Include/avoid FIR fields accept an actual known ICAO rule code, an ISO2 code,
or a country name. Validate against `refICaoRules` and `getCountryList()`.
Show an inline warning for unknown input. On Save, normalize country names to
ISO2 but preserve ICAO codes. Route-country detection uses the existing
great-circle/centroid approximation in `src/client/lib/geo.ts`; never describe
it as a true FIR-boundary calculation.

When ETD changes, ETA may be estimated from airport great-circle distance and
the selected aircraft type cruise speed. ETA remains manually editable. A user
entered ETA must not be overwritten by later endpoint or ETD edits until the
user elects to recalculate it.

**Zero-conversion invariant for time entry.** Every clock time in this app
(ETD/ETA, permit confirmation validity, etc.) is Zulu/UTC — inputs are
labeled "Z/UTC" and stored as such. `<input type="datetime-local">` values
carry no timezone, so converting them with `new Date(value).toISOString()`
is a bug: JS interprets the typed digits as the *browser's local* time
before converting to UTC, silently shifting the stored value by the
browser's UTC offset (e.g. a typed `07:00` becomes `10:00Z` in a UTC+3
browser). The typed digits ARE the UTC clock time, so conversion must be a
plain string operation: append the time/offset directly
(`` `${value}:00.000Z` ``) rather than round-tripping through `new Date()`.
The reverse direction (ISO → datetime-local display value) is safe as a
plain `.slice(0, 16)`, since it never constructs a `Date` object. See
`fromInputDate`/`toInputDate` in `TripDetail.tsx` and
`isoLocalToZ`/`zToLocalInput` in `NewTripWizard.tsx` for the canonical
implementation.

### Service request templates and admin history

`src/client/lib/emailTemplates.ts` is the single source of truth for message
subjects/bodies (`generateEmail`) — both the standalone
`src/client/pages/ComposerPage.tsx` (manual/ad-hoc composing) and
`src/client/components/ComposeDrawer.tsx` (opened from a service card in
`TripDetail.tsx`, vendor/template pre-filled from that service) call the same
function, so there is one format per message type regardless of entry point.
A request can be generated, edited, copied, opened in a mail client, or sent
via `Send & Log`, which creates an outbound `Comm` as `Status: 'Draft'`, then
calls `POST /comms/:commId/send` (real SMTP via `MailModule`/Nodemailer,
configured through `SMTP_*` env vars) and reflects the real `Sent`/`Failed`
outcome — never a hardcoded success. `src/client/pages/CommsPage.tsx` is the
admin-side history and must remain able to display the exact body that was
logged, including `ErrorMessage` on a failed send.

**Subject format for Overfly Permit / Landing Permit / Ground Handling.**
These three service types always use `TemplateType` values named
`VIQ_{Overfly,Landing,GroundHandling}{Request,Revision}` (six total,
renamed from `UW_*` — never actually tied to one specific handling
vendor). Subject and body both live in `DEFAULT_TEMPLATES`
(`emailTemplates.ts`), written in `{{PLACEHOLDER}}` format and rendered
through `renderTemplate()` — the default subject is:

```
{LABEL} {REQUEST|REVISION} - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}
```

all uppercase, e.g. `OVERFLY PERMIT REQUEST - 2608003 - N80TE - MOZAMBIQUE`.
`LABEL` is `OVERFLY PERMIT` / `LANDING PERMIT` / `GROUND HANDLING`.
`{{COUNTRY_NAME}}` is always the full country name (never an ISO2 code) —
for Overfly it's `countryISO2` (the linked service's own country); for
Landing/Ground Handling it's `arrCountryISO2`, the leg's arrival airport's
country (`getAirport(leg.ArrICAO)?.CountryISO2`). Bodies for all six are
the ALL-CAPS format (ATTN/REF block, itemized confirmation checklist or
PREVIOUS/NEW itinerary block on revision, sender signature block, `/END`
marker) — there is no plainer "Standard" template for these three service
types any more.

**Country overrides.** Any of the 6 can be overridden per country via the
`MessageTemplate` table and the `/admin/message-templates` admin page —
`generateEmail()` checks `getMessageTemplateOverride(lookupCountry,
template)` (a synchronous, cache-backed read — no async conversion) and
falls back to `DEFAULT_TEMPLATES[template]` when no override exists for
that country. Both paths render through the same `renderTemplate()` call;
there is only ever one rendering mechanism. Full design in
`docs/superpowers/specs/2026-08-25-viq-message-templates-design.md`.

**Request vs. Revision.** `hasRequestRevisionToggle(serviceType)` says
whether a service type carries this pair. When a `ComposeDrawer`/Composer
selection is linked to a service, the default action is auto-detected —
`Revision` if a prior `OUTBOUND`/`Sent` `Comm` already exists for that
`SVCID`, else `Request` — via `defaultTemplateFor(serviceType, action)`, and
is always shown as an overridable REQUEST/REVISION toggle next to the
template dropdown, never applied silently. `toggleTemplateAction()` flips
between the pair; `isRevisionTemplate()`/`isActionTemplate()` classify a
`TemplateType` for that toggle's display state.

### Public landing page owning surface

`src/client/pages/LandingPage.tsx` (routes `/` and `/landing`) is gated by
a `mode: LandingMode | null` state — `null` renders `LandingHero.tsx`
(the "CHARTER / PRIVATE FLIGHT" vs. "PERMIT & GROUND HANDLING ONLY"
chooser), either mode value renders the existing quote-request form with
that mode's sections shown/hidden. Both modes submit through the same
`POST /api/quotes`; mode is presentational only. Keep intact:

1. Don't fork a second form or a second submit path per mode — add a new
	mode by extending the existing form's conditional sections, the way
	the Crew & Pax section is hidden for `'permit'`.
2. The public/internal branding is unified as "VIQ" on this page and its
	footer — don't reintroduce a different public-facing name.
3. This page has no auth guard by design (it's the public quote intake) —
	don't add one, and don't put anything here that shouldn't be visible
	to an unauthenticated visitor.

Full design: this was a Bounded-scope change (no spec/plan doc) approved
directly in chat.

### Admin enquiry-triage owning surface

`src/client/pages/admin/AdminTrips.tsx` (`/admin/trips`) recognizes a
public-quote submission needing triage as `Owner === 'Web Enquiry' &&
Status === 'Planning'` — this is a derived condition, not a stored flag.
If either of those two fields' semantics change, update this condition
rather than adding a new schema field for "is this an enquiry" (there
was deliberately no new column added for this feature). The "New
Enquiries (N)" toggle and `Layout.tsx`'s `NavCountBadge` on the Manage
Trips nav item both derive their count the same way — from
`getTrips()`, filtered by that same condition — so don't let a second,
differently-computed count drift in alongside it. `Layout.tsx`'s
pre-existing `UrgencyBadge` ("3 urgent" on Action Board) is a known,
still-unfixed hardcoded stub — unrelated to this feature and explicitly
left alone, not an oversight of this change.

### `TripsService.nextTripId()` — now a database-level atomic counter (fixed)

Was a time-of-check-to-time-of-use race (`count()` then `format(count+1)`,
no lock, no retry) — discovered 2026-08-27 during Phase 1-3's own rate-
limiter load test, fixed the same day in Stage 1 of the post-audit
roadmap. Now backed by a new `TripIdCounter` model (`prisma/schema.prisma`,
table `trip_id_counters`, one row per `YYMM` prefix) and a single atomic
SQL statement:

```ts
const rows = await this.prisma.$queryRaw<{ count: number }[]>`
  INSERT INTO trip_id_counters (prefix, count)
  VALUES (${prefix}, 1)
  ON CONFLICT (prefix) DO UPDATE SET count = trip_id_counters.count + 1
  RETURNING count
`;
```

Postgres's row-level locking on the `ON CONFLICT DO UPDATE` path serializes
concurrent callers targeting the same prefix — correct under concurrent
requests *and* concurrent server processes, which a process-local mutex or
retry loop would not have been. The migration
(`prisma/migrations/20260827103956_add_trip_id_counter/`) backfills each
existing prefix's counter from `MAX(suffix)` (not `COUNT(*)` — this
project's real trip IDs already have gaps from earlier deletions, so a
count-based backfill would have silently reintroduced the same collision
risk this fix closes). Verified live under 20-way true parallelism
(`Promise.all` direct calls to the exact production SQL) with zero
duplicate IDs. Full plan:
`docs/superpowers/plans/2026-08-27-viq-upgrade-stage1-security-foundation.md`.

### Two ESM-only-package import traps (read before adding a third)

Two npm packages added during the 2026-08-27 hardening pass turned out to
ship a materially different API than what a plan/brief assumed, both for
the same underlying reason (an ESM-only rewrite) but requiring two
different workarounds — know both before reaching for a third:

- **`pdfjs-dist` v6** (OCR, `ocr.service.ts`): ESM-only, and this
  project's CommonJS build's dynamic-`import()` transform rewrites
  `await import(...)` into `require()`, which throws `ERR_REQUIRE_ESM`.
  Worked around with `new Function('specifier', 'return
  import(specifier)')` to reach Node's real dynamic import, bypassing
  TypeScript's transform. See README.md's "OCR extraction" section.
- **`content-disposition` v3** (`docs.controller.ts`): also ESM-only, but
  a plain `import` still works fine, since the problem isn't the module
  system — it's that v3 **dropped the default export entirely**. The
  classic pre-3.0 API (`import contentDisposition from
  'content-disposition'`) doesn't exist on this version; use the named
  `create` export instead: `import { create as contentDisposition } from
  'content-disposition'`. No dynamic-import workaround needed here, unlike
  `pdfjs-dist` — a normal `import { create }` compiles and runs fine.
- **`file-type`** (`docs.service.ts`, upload verification) sidesteps this
  entirely by being **pinned to `16.5.4`**, the last plain-CommonJS
  release, specifically to avoid needing either workaround above. Don't
  bump this package's version without re-checking its export shape and
  module type first.

### Pagination convention — opt-in, additive, one shared envelope shape

`GET /trips`, `/services`, `/persons` (full-roster case only), and
`/audit` all follow the same pattern, established 2026-08-27: a request
with no `page` query param gets the exact legacy response (a plain
array); a request with `?page=&limit=` gets
`{ data, page, limit, total, totalPages }` instead. If you add pagination
to another list endpoint, follow this exact shape — don't invent a
different envelope or a cursor-based scheme without a real, measured
reason to (offset pagination was chosen deliberately over cursor-based:
VIQ's current data volume doesn't justify cursor pagination's added
complexity — stable sort keys, opaque cursor encoding — revisit only if
offset-scan cost is ever actually measured as a problem, not
speculatively). Each endpoint clamps its own `limit` server-side
regardless of whether `page` is passed — Trips/Services/Persons cap at
200, Audit caps at 1000 (matching its own real pre-existing usage, not an
arbitrary smaller number that would have silently truncated legitimate
existing behavior). Full mechanism in README.md's "Stage 2a" section.

As of Stage 2b (2026-08-28), `GET /trips`'s paginated branch also adds
`search` (case-insensitive `OR` across `tripId`/`client`/`registration`,
shared between the `findMany` `where` and the `count` `where` — never
construct these independently, or `total` will silently stop reflecting
the actual filtered result set) and bulk-includes each row's `legs`
(ordered by `seq`, a fixed field subset) and `_count` of
`stops`/`services`/`comms`. This only affects the paginated branch — the
legacy unpaginated `findAll()` response is untouched. Full mechanism in
README.md's "Stage 2b" section.

### Purpose-built widget endpoints — not the pagination envelope

`GET /legs/upcoming` and `GET /services/open` (added Stage 2b) intentionally
do **not** follow the pagination envelope above — they always return a
plain array, take `?limit=&search=` only (no `page`), and encode a fixed
business filter rather than an arbitrary one (`etdZ >= now` ascending;
`status NOT IN ('Confirmed','Not Required')`). These exist because
Dashboard's "Upcoming Departures"/"Open Services" cards need exactly one
fixed slice, not general list browsing — don't retrofit them onto the
`{data,page,...}` shape, and don't add more of these without a similarly
fixed, single-purpose filter driving the need.

**Route-ordering constraint (load-bearing, verified repeatedly):** any
literal-path route like `@Get('upcoming')` or `@Get('open')` MUST be
declared before that controller's parameterized route (`@Get(':legId')`,
`@Get(':svcId')`) — NestJS matches routes in declaration order, so a
param route declared first will swallow the literal segment as a param
value and make the literal route permanently unreachable. Confirm new
literal routes both by reading the source order and by checking Nest's
own startup `RouterExplorer` log.

### Safe implementation sequence

For any future request:

1. Search for the owning component and its data-store helper.
2. State one local hypothesis and one cheap validation check.
3. Make the smallest edit with existing types/helpers.
4. Run `npm run build:client` immediately after client changes.
5. Run `npm run build` before handing off.
6. Start `npm run start:prod` and verify `/` and a representative `/api`
	endpoint return HTTP 200.

Avoid direct localStorage writes in UI components, duplicate type definitions,
global refactors, or destructive git operations. Preserve unrelated worktree
changes. This project has no auth yet and is intended for localhost preview;
flag that limitation before recommending production deployment.
