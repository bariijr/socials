# VIQ

Single-source JetFlow application. NestJS owns the API and production runtime;
React/Vite is compiled into the same `dist` directory and served by Nest.

The source tree is intentionally unified:

- `src/server` — NestJS API, Prisma services, and application modules
- `src/client` — React UI and browser-only components
- `prisma` — PostgreSQL schema, migrations, and seed data

## Stack

- NestJS 10 (modular REST API)
- Prisma 5 + PostgreSQL 16
- class-validator / class-transformer for request validation

## Visual design system

The app's visual identity is a dark "operations HUD" aesthetic — deep
space-navy panels, electric-cyan primary accent, violet secondary,
JetBrains Mono for data/codes (registrations, ICAO codes, trip IDs — the
`font-mono` usage already threaded through most pages), Space Grotesk for
UI text, and a faint ambient cyan glow + technical grid texture on the
dark background. This is a **centralized token change**, not a
per-page rewrite: this codebase uses shadcn/ui, where every component's
colors resolve through CSS custom properties (`src/client/index.css`'s
`:root`/`.dark` blocks) rather than hardcoded Tailwind classes, so
redefining those tokens cascades the look across the entire app. Only 6
files were touched to establish it: `index.css` (palette + background
texture), `tailwind.config.js` (font families, `shadow-glow`/
`shadow-glow-lg` utilities), `index.html` (Google Fonts links),
`lib/theme.ts` (dark is now the default starting theme — only an explicit
stored user choice overrides it, system light-mode preference is no
longer consulted), and `components/ui/card.tsx`/`button.tsx` (default
variant/card gained the glow shadow so panels and primary actions carry
the ambient effect everywhere they're used).

The light theme (`:root`, unprefixed) was kept and re-tinted to the same
cyan hue family rather than left as shadcn's disconnected default gray —
toggling theme shouldn't feel like switching to a different app — but
dark is the design's actual centerpiece; light exists for daylight/
low-glare use.

## Local setup

```bash
npm install
docker compose up -d postgres      # Postgres on localhost:5442
npx prisma migrate dev             # creates schema
npx ts-node prisma/seed.ts         # loads reference + demo data
npm run start:dev                  # API development server
```

For production, build and run one process:

```bash
npm run build
npm run start:prod                # http://localhost:4001
```

The browser application is served at `/`; API routes remain under `/api`.

`.env` (copy from `.env.example`):

```
DATABASE_URL="postgresql://jetflow:jetflow@localhost:5442/jetflow?schema=public"
PORT=4001
CORS_ORIGIN="http://localhost:5173,http://localhost:4173"
```

## Data model

`prisma/schema.prisma` — reference tables (Country, Airport, City,
AircraftType, Aircraft, Operator, Provider, CountryRule, ICAORule,
DocTemplate, PriceItem, ServiceTypeDef) plus the transactional spine (Trip →
Leg/Stop → Service, Person, DocAttachment, Comm, AuditEntry, Invoice). Field
names match the frontend's `src/data/types.ts` 1:1 (camelCase in the DB, same
as the frontend's PascalCase properties minus the casing).

Reference data is seeded from `prisma/seed-data/*.json` — copies of the
frontend's `src/data/json/*.json`. If you edit reference data in one place,
copy it to the other until the frontend is migrated to call this API instead
of its own bundled JSON (see "What's not done yet" below). **`ServiceTypeDef`
is the one exception**: unlike every other reference table, it's meant to be
edited by an admin at runtime (the "Service Types" tab on `/reference`), so it
has real `POST`/`PATCH` write endpoints instead of being read-only bundled
JSON — see "Admin-configurable service types" below.

## Business logic ported from the frontend

- `src/common/geo.util.ts` — great-circle route sampling + nearest-country-
  centroid attribution (`computeOverflightCountries`), and the
  BREACH/URGENT/DUE/OK urgency thresholds (`computeUrgency`). Same
  approximation and same limitations as the frontend's `src/lib/geo.ts` —
  see the comment there on why it isn't a true FIR-boundary intersection.
- `ServicesService.generateOverflightServices(legId)` — one Overflight
  service per country in `leg.countriesOverflown` that requires an overflight
  permit. Idempotent.
- `ServicesService.generateArrivalServices(legId, { departureGroundHandling })`
  — Landing Permit (if required) + Ground Handling for the arrival country,
  always; Ground Handling for the departure country only when explicitly
  requested (mirrors the frontend's "on request" ground-handling pattern).
- `LegsController GET /legs/compute-overflight?dep=..&arr=..` — the server is
  now the source of truth for route geometry; the frontend can call this
  instead of re-running the same algorithm client-side.
- `QuotesController POST /quotes` — atomic Trip + Legs + Services + Persons
  creation in one transaction, for the public quote tool's "Request Quote"
  submission. Mirrors `LandingPage.submitQuote` but server-side and atomic
  (the frontend version does N sequential API/localStorage writes with no
  rollback on partial failure).

## Admin-configurable service types

`ServiceType` (on `Service`) is a plain string, not a Prisma/TS enum — the
valid set lives in the `ServiceTypeDef` table (`code`, `label`, `category`:
`'Permit' | 'Handling' | 'Other'`, optional `variants` — e.g. Visa's "Visa
Required Prior to Arrival" / "Visa on Arrival" — `active`, `sortOrder`),
editable through `ServiceTypesModule` (`GET/POST /service-types`,
`PATCH /service-types/:code`) and the "Service Types" tab on
`ReferencePage.tsx`. Deactivating a type (`active: false`) is the only
removal path — there's no `DELETE`, so existing `Service` rows referencing a
deactivated code keep rendering correctly. `Service` also carries `icao`
(which airport within a leg — dep/arr/stop — a service is for; auto-set by
`generateArrivalServices` to match its `direction`) and `variant` (the
selected variant code, if the type has any). `TripDetail.tsx`'s service-type
dropdown groups active types by `category`, sorted by `sortOrder`, and shows
a second dropdown for `variant` when the selected type has any. Full design
in `docs/superpowers/specs/2026-08-25-viq-service-type-catalog-design.md`.

## Document storage & upload

`DocAttachment` now backs real files, stored on local disk under
`UPLOADS_DIR` (default `./uploads`, git-ignored, created on server boot).
Scope is generalized beyond Trip: exactly one of `tripId`/`personId`/
`aircraftRegistration` must be set per document (enforced in
`DocsService`, not the database). `POST /docs/upload` (multipart, 20MB max)
writes the file and creates the row in one call — allowed types: PDF,
JPEG, PNG, GIF, TIFF, BMP, plain text, and DOCX (`ALLOWED_MIME_TYPES` in
`DocsService`; legacy binary `.doc` is not supported — only the
`.docx` Office Open XML format, via `mammoth`);
`GET /docs/:docId/file` streams it back. Downloads go through the
already-authenticated `apiFetch` → blob → temporary `<a>` click, never a
bare `<a href>` (which can't carry the `Authorization` header
`JwtAuthGuard` requires) and never a loosened guard. `TripDetail.tsx`'s
DOCS tab has a working upload form and working download/delete actions.
Full design in `docs/superpowers/specs/2026-08-25-viq-document-storage-design.md`.

### OCR extraction

`POST /docs/:docId/ocr` (optional JSON body `{ password }`, see below)
extracts text from an already-uploaded document and persists the result on
the `DocAttachment` row: `ocrStatus` (`'Complete'`/`'Failed'`), `ocrText`
(always, when successful), `ocrStructuredFields` (JSON, populated only when
the extracted text contains a parseable passport-style MRZ — detected by
scanning the extracted text itself, never by `DocType`, via the `mrz`
package), `ocrError`, `ocrProcessedAt`. `OcrService.extract(filePath,
mimeType, password?)` dispatches by mime type to one of four extraction
paths:

- **Images** (JPEG/PNG/GIF/TIFF/BMP) — `tesseract.js` (pure JS/WASM, no
  system Tesseract install), unchanged from the original single-format
  version. A single long-lived Tesseract worker is created once per server
  process (`OcrService.onModuleInit`), not per request. Live-verified this
  session for JPEG/PNG (pre-existing) and GIF (new); TIFF/BMP go through the
  identical `worker.recognize()` call — same code path, not independently
  fixture-tested.
- **PDF** — text-layer first: `pdfjs-dist` reads every page's embedded text
  via `getTextContent()`; if the combined length is ≥40 characters
  (`PDF_TEXT_LAYER_MIN_CHARS`), that's used directly — no image OCR needed,
  and it's exact rather than OCR-approximate. Below that threshold (a
  scanned/faxed permit with no real text layer), each page is rasterized to
  a PNG via `@napi-rs/canvas` (prebuilt native binary, no build toolchain
  needed) and run through the same Tesseract path as a standalone image.
  Both branches live-verified this session (a real HTTP upload → OCR round
  trip, not just a standalone script).
  - `pdfjs-dist` v6 ships ESM-only (`.mjs`, no CommonJS entry point) while
    this project compiles to CommonJS; TypeScript's `commonjs` dynamic-`import()`
    transform rewrites `await import(...)` into `require()`, which throws
    `ERR_REQUIRE_ESM` for a real ESM-only package. `ocr.service.ts` routes
    around this with `new Function('specifier', 'return import(specifier)')`
    — bypasses TS's transform, reaches Node's native dynamic import, loads
    the `.mjs` build correctly. Verified live.
  - **Password-protected PDFs**: the password is never persisted (not a
    field on `UploadDocDto` or any Prisma column) — it's supplied per OCR
    attempt as `{ password }` in the `POST /docs/:docId/ocr` body, used only
    in-memory for that one `pdfjs.getDocument({ data, password })` call.
    `TripDetail.tsx`/`PersonDetail.tsx` show an inline password field next
    to EXTRACT TEXT for PDF rows (only while `OcrStatus !== 'Complete'`); a
    wrong/missing password on a protected PDF surfaces as `ocrStatus:
    'Failed'` with a specific `ocrError` message (distinguishing
    "password protected, none given" from "incorrect password" via
    `pdfjs.PasswordResponses`), rendered under the row's action buttons and
    retryable. Structurally verified (the `PasswordException`/
    `PasswordResponses` handling was traced against pdfjs-dist's real
    exports and a real unprotected PDF correctly ignores an incorrect
    password passed alongside it); not tested against a real
    password-encrypted PDF fixture this session — building a validly
    encrypted PDF wasn't practical without adding another dependency.
- **DOCX** (`.docx` only, not legacy binary `.doc`) — `mammoth.extractRawText()`,
  pure JS, no native deps. Live-verified this session.
- **Plain text** — read directly as UTF-8, no OCR pass needed (the file
  already is the "extracted" text). Live-verified this session.

`OcrError`/failed-state UI: both DOCS tabs now show `doc.OcrError` under
the row's action buttons whenever `OcrStatus === 'Failed'`, and always
leave EXTRACT TEXT visible in that state so a retry (e.g. with a corrected
password) doesn't require re-uploading.

**Known limitation** (pre-existing, unchanged by this session's format
expansion — see the OCR plan's completion notes): general-purpose OCR
frequently misreads the long `<` filler runs in an MRZ zone, which is
often enough to fail the MRZ checksum even when the human-readable text came
through almost perfectly — real photographed passports (printed in OCR-B, a
font designed for machine readability) should fare better than this
project's own synthetic test images did, but a future slice should plan to
tune Tesseract specifically for MRZ lines (single-line page segmentation + a
restricted character whitelist) rather than assume this first pass is
production-accurate. Full design in
`docs/superpowers/specs/2026-08-25-viq-ocr-extraction-design.md`.

### Verify-before-save

`PATCH /docs/:docId/verify` lets a human confirm or correct what OCR
extracted. `DocAttachment` gains `verifiedFields` (JSON — a flexible
`{label, value}[]` list, pre-filled from `ocrStructuredFields` when present,
empty otherwise, editable/addable/removable in the UI — deliberately not a
fixed Person-shaped schema, since those columns don't exist yet), plus
`verifiedBy`/`verifiedAt`. `Valid Until` (the pre-existing `validUntil`
column) is a first-class field in the same dialog, since it's the one piece
of verified data every document type can meaningfully carry regardless of
what else it has. `TripDetail.tsx`'s DOCS tab button now reads EXTRACT
TEXT → VERIFY → RE-VERIFY depending on the document's OCR/verification
state, opening `DocVerifyDialog`; a "VERIFIED" badge appears once saved.
Saving overwrites the previous verification — no history/versioning.
Verifying a Person-scoped or Aircraft-scoped document works today (the
scope was already generalized in 4a). Full design in
`docs/superpowers/specs/2026-08-25-viq-verify-before-save-design.md`.

### Person roster

`Person` is a **trip-independent roster record** — identity, licence,
medical (`medicalValidUntil`/`medicalClass`/`medicalExaminer`), and
passport biodata (`passportNumber`/`passportNationality`/
`passportIssuingCountry`/`passportExpiryDate`/`passportDateOfBirth`/
`passportSex`). It no longer has a `tripId` and is no longer deleted when
a trip is deleted. `PersonRating` (new) holds a person's ratings —
one-to-many, since a person can hold several (type ratings, ATPL,
instrument rating). Per-mission specifics (role, hotel, commercial-flight
ETA) are carried on `LegPersonAssignment` — a join table keyed
`(legId, personId)`, **scoped to a single leg, not a whole trip** (see
"Leg-scoped crew & pax manifest" below for why and the full rework; this
superseded an original trip-level `TripPersonAssignment` join table from
the same day). Ratings via `GET /persons/:personId/ratings`,
`POST/PATCH/DELETE /ratings`. `dataStore.ts`'s `generateEmail()` (message
templates) now takes a `persons: TripPersonView[]` parameter instead of
fetching them internally — matches the pattern it already used for
`legs`. Full design in
`docs/superpowers/specs/2026-08-25-viq-person-roster-design.md`.

### Leg-scoped crew & pax manifest

A trip's legs can carry different crew/pax (e.g. a positioning leg with
just the pilots, a charter leg that adds passengers) — the original
`TripPersonAssignment` (one row per person per *trip*) couldn't represent
that, so it was replaced same-day with `LegPersonAssignment` (one row per
person per *leg*, unique on `(legId, personId)`) before any other code
depended on the trip-level shape. `PersonsService.assign`/`unassign` now
take a `legId`, not a `tripId`; `POST /persons/:personId/assign-all-legs`
(new) is the convenience path for the common case of one person on every
leg of a trip — it upserts a `LegPersonAssignment` for every leg in one
transaction rather than requiring N individual assign calls.
`GET /persons?legId=X` returns that leg's manifest; `GET /persons?tripId=X`
now returns **one row per (leg, person) pair** across every leg of the
trip (not deduplicated across legs), each row carrying `legId`/`legSeq`/
`legDepIcao`/`legArrIcao` so a consumer can group by leg — this is a
breaking shape change from the old trip-level endpoint, which returned one
row per person. `GET /persons/:personId/assignments` (a person's own
assignment history, used by `PersonDetail.tsx`'s Assigned Trips card)
likewise now returns one row per leg, each joined with its parent trip's
summary fields, ordered by trip recency then leg sequence.

On the frontend, `TripDetail.tsx`'s crew/pax manifest is now a per-leg
tab/section (add/remove a person for the leg currently selected in
ROUTE, not for the trip as a whole) with an "assign to all legs" shortcut
that calls the new endpoint; `TripDetail.sheet()` embeds each leg's own
person list rather than one trip-wide list; `ComposerPage.tsx`'s
recipient-picking falls back to a trip-wide dedup (union of every leg's
assignees) only where a single leg isn't in scope. `QuotesController
POST /quotes` (the public quote tool's atomic Trip+Legs+Services+Persons
creation) fans a submitted person out to a `LegPersonAssignment` row on
every leg of the new trip in the same transaction, since a fresh charter
enquiry has no leg-specific crew/pax distinction yet. Full design in
`docs/superpowers/specs/2026-08-26-viq-leg-scoped-crew-pax-design.md`.

### Person detail page

`PersonDetail.tsx` (route `/admin/persons/:personId`) is the single place
to manage a roster record end to end: Biodata and Medical are independently
editable cards (same inline edit-toggle pattern as `TripDetail.tsx`'s
`TripInfoEditor`), Ratings is a full add/edit/delete list against
`PersonRating`, Assigned Trips lists/links every `LegPersonAssignment` for
this person (one row per leg, see "Leg-scoped crew & pax manifest" above)
with assign/unassign actions (assignment now lives here, not
in the quick-add dialog — see below), and Docs reuses the exact
upload → OCR → `DocVerifyDialog` verify-before-save flow from
`TripDetail.tsx`'s DOCS tab, scoped to `PersonID` instead of `TripID`.

Two small additive endpoints back this page: `GET /persons/:personId`
(single-record fetch, avoids pulling the whole roster) already existed
from 4d-1 and is now used directly; `GET /persons/:personId/assignments`
(new, since superseded to return per-leg rows — see "Leg-scoped crew &
pax manifest" above) joins a person's assignment rows with trip summary data;
`GET /docs?personId=X` (docs `findAll` extended to accept `personId`
alongside the existing `tripId` filter, same additive pattern).

Per-field expiry badges (`src/client/lib/expiry.ts`'s `expiryTone`,
rendered via `ExpiryBadge.tsx`) — red for expired, amber within 60 days —
appear on individual fields (passport expiry, medical validity, each
rating). `AdminAssets.tsx`'s Person tab rows are clickable links to the
detail page; its `PersonDialog` is simplified to identity-only fields
(name/role/phone/email) — trip assignment moved to the detail page's
Assigned Trips card, since assignment is a roster-level action, not a
person-creation side effect.

### Roster expiry dashboard

`personExpiryStatus(person, ratings)` (`src/client/lib/expiry.ts`) is the
single per-person severity computation every expiry UI now calls —
roster-row badges, the detail-page header badge, and this dashboard all
derive from it, so there's exactly one place "worst status" is decided.
It checks passport expiry, medical validity, and every rating's expiry
(red `expired`/amber `soon`/green `ok`, same 60-day window as before), and
additionally flags **missing** data — no medical cert or passport on file
— but only for `CREW_ROLES` (`PIC`/`SIC`/`FA`/`Mechanic`/`Engineer`); a
Pax/VIP/Principal/Other record with nothing on file isn't a problem, a PIC
record with nothing on file is. `missing` and `expired` are tied at the
top severity tier — both mean "cannot confirm this person is compliant
right now." `dataStore.ts`'s `getRosterExpiryStatuses()` is the one place
that does the roster-wide fetch (roster + each person's ratings) and maps
every record through `personExpiryStatus`; every consumer below calls it
rather than re-fetching.

Three places surface this: `AdminAssets.tsx` gained a new **Expiry** tab
(sibling to Persons) listing every person with an outstanding issue, each
row breaking out the specific issue lines (e.g. "MEDICAL CERT — MISSING",
"TYPE RATING B737 — EXPIRES SOON (2026-10-12)"), with a count badge on the
tab trigger itself; `AdminDashboard.tsx` (`/admin`) gained a "Roster
Attention" card showing the top 5 by severity with a link to Assets; and
roster-row/detail-page badges (built in 4d-2) now also catch missing crew
data instead of only expiring dates. This closes the 4d Person Roster
decomposition (4d-1 backend split → 4d-2 detail page → 4d-3 this
dashboard).

This is foundation-plus-management-UI — no bulk reference-data CRUD yet
(a separate, larger sub-project).

### Reference data durability (4e)

`AdminAssets.tsx`'s Aircraft/Providers/Airports/Countries CRUD (existing
add/edit/delete dialogs) is now database-backed instead of
`localStorage`-only. The Prisma models, seed data, and `GET` endpoints for
all four already existed (`src/server/modules/reference/`) — this
sub-project only added `POST`/`PATCH`/`DELETE` there, plus a frontend
rewire.

Rather than converting `getAircraftList`/`getProviderList`/
`getAirportList`/`getCountryList` to async (the pattern used for
Persons/Docs), which would have touched roughly 10 files calling them
synchronously — several times inline inside JSX — an **in-memory cache
primed by a one-time app-boot preload** was used instead:
`Layout.tsx` (the shared shell for every authenticated route) awaits a new
`preloadReferenceData()` before rendering `<Outlet/>`, fetching all four
lists once and caching them in memory. The four `get*List()` functions
stay synchronous, reading the cache — **zero changes to any consumer file**.
Only `saveAircraft`/`saveProvider`/`saveAirport`/`saveCountry` and their
`delete*` counterparts became `async` (they call the new endpoints, then
splice the result into the cache directly so the UI updates without a
reload). Known, accepted limitation: a second browser tab won't see
edits made in another tab until it reloads — a deliberate trade-off, not
an oversight, given this is a single-admin local tool today.

Three mapping gaps between the client's flat `Aircraft`/`Provider`/
`Country` types and the normalized Prisma schema, found by reading the
actual dialog code rather than assumed from the schema:
- **Aircraft** `Manufacturer`/`MTOW_kg`/`NoiseCert` are edited as plain
  fields in `AircraftDialog`, but Prisma has no such columns — only
  nullable `manufacturerOverride`/`mtowOverrideKg`/`noiseCertOverride`
  resolved against a shared `AircraftType` row when unset.
  `mapAircraftFromApi` resolves `override || type.field`; `saveAircraft`
  writes to the override columns only — it never mutates the shared
  `AircraftType` row, which would otherwise silently change every other
  tail flying that type.
- **Provider** `Contacts` was never real data — `ProviderDialog` always
  synthesized a single-entry array from `Email` at save time, and no
  `contacts` column exists on `Provider`. The API payload drops it
  entirely; `mapProviderFromApi` re-synthesizes the same array on read so
  the dialog's behavior is unchanged.
- **Country** dialog only edits 8 of the Prisma model's fields
  (`ciqRequired`/`subRegion`/`caaWebsite`/`iso3`/`notes` have no UI).
  `PATCH /reference/countries/:iso2` is a true partial update (only
  fields present in the body are written) so saving from this dialog
  never wipes those five back to defaults.

`DELETE /reference/countries/:iso2` guards against deleting a country
that still has `Airport`/`CountryRule` rows pointing at it (Prisma's
default `Restrict` on those relations throws a `P2003` FK error) —
caught and re-thrown as a `400` with a clear message rather than a raw
500. Verified live: attempting to delete a seeded country with real
airports returns 400; a throwaway country with none deletes cleanly.

### Aircraft/Operator expansion & bill-to resolution

`Aircraft.currentOperatorId` is now a required, real Prisma relation
(was a loose nullable string) — every aircraft must be linked to a real
`Operator` row. Safe non-destructive migration: all 6 seeded aircraft
already had a valid operator id pointing at a real operator, so the
`SET NOT NULL` + new foreign key applied with nothing to backfill.
`Operator` gets its first CRUD UI ever — a new **Operators** tab in
`AdminAssets.tsx`, same add/edit/delete pattern as Aircraft/Providers/
Airports/Countries/Persons. `Operator.fleet` stays read-only/server-derived
(never written from the UI) — it would otherwise be a second source of
truth against the new relation.

`AircraftDialog` gained: a required Operator picker (blocks Save while
unset, both client-side and DTO-side — `currentOperatorId` is no longer
optional in `CreateAircraftDto`), Colors and Operation Type (new, plain
freeform text fields — no enum, matching how `Aircraft.status`/
`Trip.operationType` already work), and Serial Number / Max Range
Override / Fuel Burn Override (these columns already existed from
earlier work but weren't in this form yet — just surfaced, no schema
change).

**Bill-to address resolution** (new concept — no address of any kind
existed anywhere in the app before this): `Trip.billToAddress` (new,
optional) is an explicit per-trip override. When unset,
`resolveBillToAddress(trip)` in `dataStore.ts` falls back to the billing
address of the operator linked to the trip's assigned aircraft
(`Operator.billingAddress`, then `Operator.address` if that's blank) —
a pure synchronous function reading two already-cached lists, no extra
fetch. `NewTripWizard.tsx` and `TripDetail.tsx`'s `TripInfoEditor` both
gained an optional "Bill To Address" field (creation and post-creation
editing respectively); `BillingPage.tsx`'s invoice detail view shows the
resolved address in a new "Bill To" line — the first place this concept
is displayed anywhere in the app. Verified live: a trip with no override
correctly resolves to its aircraft's operator's billing address; a trip
with an explicit `billToAddress` correctly overrides it; attempting to
delete an operator with aircraft assigned returns 400 (same guard
pattern 4e established for `Country`).

Explicitly out of scope (deferred to the next sub-project): expanded
document upload/OCR (DOCX, TIFF, protected-PDF with password prompt,
PDF OCR) and new `AircraftDetail.tsx`/`OperatorDetail.tsx` pages to host
that document collection — this sub-project's new fields stayed within
the existing `AdminAssets.tsx` dialog pattern. Full design in
`docs/superpowers/specs/2026-08-25-viq-aircraft-operator-design.md`.

### Country billing/fee schedule (Item 16)

New `CountryFee` model — parallel in shape to `PriceItem` (a provider's
price list: `providerId + serviceType → unit/price/currency/notes`) but
scoped to a `Country` instead of a `Provider`, representing government/
regulatory fees rather than vendor pricing: overfly permit fee, landing
permit fee, VSAT, NAFISAT, ASECNA, navigation fees, CAA fees, or any
other billing-info line a country requires. No unique constraint — same
as `PriceItem`, a country can legitimately carry several fee rows for
the same fee type over time (e.g. a rate change) without one silently
overwriting another. Full CRUD (`reference.service.ts`/
`reference.controller.ts`, same `AuditService.log`/`logDiff` pattern as
every other reference resource) plus a new **Fees** tab in
`AdminAssets.tsx`, grouped by country, alongside the existing Aircraft/
Vendors/Airports/Countries/Persons/Expiry/Operators tabs.

`preloadReferenceData()` in `dataStore.ts` gained a 7th parallel fetch
(`/reference/country-fees`) so `getCountryFeeList()`/
`getCountryFeesForCountry(iso2)` stay synchronous like every other
reference getter.

**Invoice integration** — the whole point of "compliment complete
service billing": `generateInvoiceFromTrip` already built one
`InvoiceLineItem` per confirmed service from `getPrice(providerId,
serviceType)` (the vendor-price line). It now also loops
`getCountryFeesForCountry(svc.CountryISO2)` for every confirmed service
that carries a `CountryISO2` (i.e. every country-specific Permit/
Overflight/GroundHandling service) and appends one additional line item
per configured fee — alongside, not replacing, the vendor-price line.
Verified live: full CRUD (create/list/patch/delete) against the real DB
with audit-trail confirmation (`Created`/field-diff/`Deleted` entries
all present); confirmed the exact live data `generateInvoiceFromTrip`
depends on exists in the shape it expects (a real confirmed service —
`SVC-0004-1` on trip 2608004 — carrying `CountryISO2: "ZA"`, and
`GET /reference/country-fees/by-country/ZA` returning the fee rows for
it). `generateInvoiceFromTrip` itself is a pure client-side/localStorage
function (never migrated to a server endpoint, unlike the DB-backed
reference data it reads) with no server round-trip to curl directly —
end-to-end confirmation that the generated invoice actually renders the
extra line items needs a live browser session, which wasn't available
this session; the data-layer prerequisites and the line-item logic
itself (typechecked, built clean) were verified as far as this session's
curl+JWT-only verification method allows.

## Routes

All routes are prefixed `/api`.

| Resource | Routes |
|---|---|
| Reference | `GET /reference/{countries,airports,cities,aircraft-types,aircraft,operators,providers,country-rules,icao-rules,doc-templates,price-list,country-fees}` (+ `/:id` where applicable); `GET /reference/country-fees/by-country/:countryIso2`; `POST/PATCH/DELETE /reference/{countries,airports,aircraft,providers,operators,country-fees}(/:id)` — the six admin-editable resource types, see "Reference data durability" / "Aircraft/Operator expansion" / "Country billing/fee schedule" above |
| Service Types | `GET/POST /service-types`, `PATCH /service-types/:code` — the one reference resource with real writes (admin-editable), see "Admin-configurable service types" above |
| Trips | `GET/POST /trips`, `GET/PATCH/DELETE /trips/:tripId`, `GET /trips/:tripId/sheet`, `GET /trips/next-id` |
| Legs | `GET/POST /legs`, `GET/PATCH/DELETE /legs/:legId`, `GET /legs/compute-overflight` |
| Stops | `GET/POST /stops`, `GET/PATCH/DELETE /stops/:stopId` |
| Services | `GET/POST /services`, `GET/PATCH/DELETE /services/:svcId`, `GET /services/scope/:scopeType/:scopeId`, `POST /services/legs/:legId/generate-overflight`, `POST /services/legs/:legId/generate-arrival`, `POST /services/refresh-urgency` |
| Persons | `GET /persons` (full roster, or `?legId=X`/`?tripId=X` for a leg's or trip's assignment rows — see "Leg-scoped crew & pax manifest"), `GET/PATCH/DELETE /persons/:personId`, `POST /persons`, `POST /persons/:personId/assign` (body carries `legId`), `DELETE /persons/:personId/assign/:legId`, `POST /persons/:personId/assign-all-legs`, `GET /persons/:personId/assignments` (this person's legs, each joined with its trip summary) |
| Person Ratings | `GET /persons/:personId/ratings`, `POST/PATCH/DELETE /ratings(/:id)` |
| Comms | `GET/POST /comms`, `GET/PATCH/DELETE /comms/:commId` |
| Docs | `GET /docs` (optionally `?tripId=X` or `?personId=X`), `GET /docs/:docId`, `POST /docs/upload` (multipart — PDF/JPEG/PNG/GIF/TIFF/BMP/text/DOCX), `GET /docs/:docId/file` (streams the stored file), `POST /docs/:docId/ocr` (all uploadable types; optional body `{ password }` for protected PDFs), `PATCH /docs/:docId/verify`, `DELETE /docs/:docId` |
| Invoices | `GET/POST /invoices`, `GET/PATCH/DELETE /invoices/:invoiceId` |
| Quotes | `POST /quotes` — atomic public-quote submission |
| Audit | `GET /audit`, `GET /audit/:table/:recordId` |

Every write endpoint accepts an optional `user` field (body) / `?user=`
(query) for audit-log attribution; defaults to `SYSTEM`.

## Trip workspace simplification

Ongoing pass reducing `TripDetail.tsx`'s navigation surface and status
density (fewer tabs, clearer "what needs attention," never dropping
functionality — see `ARCHITECTURE.md`'s "Owning UI surface" section for
the binding contract). Landed so far:

- **`AttentionStrip`** — replaced the trip header's plain 4-stat grid with
  a status line: leg/PAX/crew counts plus ACTION/WAITING/RECONFIRM/
  CONFIRMED badges. Every open service is bucketed into exactly one of
  those four by `bucketForService()` (priority order: Confirmed →
  Re-confirm Required → urgent/Not Started → everything else waiting), so
  the counts never double-count. "ALL CLEAR" renders when nothing's
  outstanding. (A `CLIENT`/responsibility-not-ours bucket was considered
  but skipped — the data model has no responsibility field to derive it
  from yet.)
- **PERMITS merged into SERVICES** — the trip-level PERMITS tab was a
  filtered view of the same `Service` rows SERVICES already showed, just
  with permit-specific columns and the `PermitSubmissionGroups`
  batch-submission UI. Both now render at the top of the SERVICES tab
  (only when `permitServices.length > 0`) — one fewer tab, zero lost
  capability. Tab count: 7 → 6 (ROUTE/SERVICES/PEOPLE/DOCS/BILLING/
  ACTIVITY).
- **`getAudit()` fixed** — found while building the ACTIVITY merge below:
  this function had never been migrated off `localStorage`/static seed
  data, despite every module in the app writing real entries to the
  `audit_log` table all session via `AuditService`. `AuditPage.tsx` (the
  system-wide audit view) and `TripDetail.tsx`'s leg-level audit trail
  were both silently showing stale seed content instead of real history.
  Now async, fetches `GET /audit?limit=1000`, mapped the same way every
  other resource's `mapXFromApi` function works. This is a genuine
  correctness fix, not a UI change — the audit data itself was never
  wrong (every write really was logged), only the read path was.
- **MESSAGES → ACTIVITY** — was a relabel-only change until `getAudit()`
  was fixed made a real merge possible: the tab now interleaves full
  `Comm` cards with a trip-scoped slice of the audit log (filtered to
  entries whose `Table`/`RecordID` match this trip, one of its legs, or
  one of its services), sorted into one chronological feed. Audit entries
  render as a compact one-line "who changed what, old → new" row; message
  detail stays full-size, since that content is what a coordinator
  actually needs to read. `AuditPage.tsx` remains the unfiltered,
  system-wide Level-3 record.

- **Service Case drawer** — `ServiceInlineEditor` (the card rendered for
  every service inside a leg's PERMITS/HANDLING sections) used to show its
  entire editable form — type/variant selects, provider, status, notes,
  ref#, assigned-to — inline and always-expanded, for every service, all
  at once. It's now a compact status row (type, status/urgency badges,
  ref#, assigned-to) with OPEN/MESSAGE actions; OPEN launches the same
  form, byte-for-byte unchanged, inside a `Sheet` side-panel
  (`components/ui/sheet.tsx`) instead of inline. Draft state, save logic,
  and provider-eligibility filtering are untouched — only how the form is
  revealed changed. `ComposeDrawer` (message compose) is unaffected and
  still opens as its own dialog, reachable directly from the row's
  MESSAGE button without needing to open the Service Case drawer first.
- **Requirement-suggestion review** — `generateOverflightServices`/
  `generateArrivalServices` were already being called silently on every
  leg save (route/country changes auto-derive permit and handling
  services); the coordinator never saw what got created. Both functions
  are idempotent — they only create services that don't already exist and
  return exactly what they just created — so `LegEditor.save()` now
  captures that return value and shows it as "N REQUIREMENTS SUGGESTED"
  with ACCEPT ALL (dismiss, keep everything — the default, zero extra
  clicks for the common case) or REVIEW (per-item checkboxes, unchecked
  items get `deleteService`'d on CONFIRM SELECTION).

  **Known limitation, verified live, not silently glossed over:** a
  service removed via REVIEW can reappear on a later save. The
  idempotency check is "does a service already exist for this leg/
  country/type," not "was this previously dismissed by a coordinator" —
  there's no dismissal-tracking field anywhere in the data model. Tested
  directly against the API: generate → delete → generate again on the
  same leg/country recreates the exact same service. Fixing this
  properly needs a real schema change (e.g. a `dismissedAt` marker on
  `Service`, or a separate dismissal-log table) — out of scope for a
  review-UI-only pass; flagged here rather than left as a surprise.
- **Single ADD command** — every "ADD SERVICE" control used to create a
  hardcoded generic `FlightPlanning` stub service, leaving the coordinator
  to open the drawer and manually retype the real type afterward.
  `addService()` now takes the type as a parameter instead of hardcoding
  it; `renderAddServiceControl()` (one shared helper, used at all three
  add points — per-country in PERMITS, per-airport-group and
  new-airport-group in HANDLING) is a single searchable, category-grouped
  type picker — the same Permit/Handling/Other grouping the drawer's own
  type select already used — so the created service has the right type
  from the start. Scope (country vs airport) stays implicit in which
  section's control was used, same as before.

Trip workspace simplification is now complete for everything classified
as directly buildable on the current schema in the original debate.
Remaining items (§7/§8/§9 in the proposal — auto-created Service Cases on
responsibility handoff, multi-vendor Service Orders, smart request-batching
across services) all need new backend concepts and were explicitly held
as a separate future decision, not built speculatively.

## Reference Data search/filter/Excel

`ReferencePage.tsx` (route `/reference`, distinct from `/admin/assets`'s
resource-management CRUD — this page is the read-oriented catalog
browser) had two gaps closed in the same pass: four of its seven tabs
(Airports/Countries/Aircraft/Providers) were still reading the frontend's
static `refX` JSON exports instead of the live, admin-editable database
data those resources already had endpoints for (per "Reference data
durability (4e)"), and none of the seven tabs had search or bulk
import/export. Both gaps are now closed identically across all seven
tabs (Airports, Countries, Country Rules, Aircraft, Providers, Service
Types, Leg Purposes):

- **Live data everywhere.** All seven tabs now read through the same
  `getXList()` cache getters every other admin page uses (populated by
  `preloadReferenceData()` at app boot) — no tab reads a static `refX`
  import any more.
- **Search.** `src/client/hooks/useTextFilter.ts` (new, generic:
  `useTextFilter<T>(rows, getSearchableText)`) does a client-side
  substring filter — deliberately not server-side, since every one of
  these tables is a few dozen rows at most. Each tab builds its own
  searchable-text function (e.g. Airports searches ICAO+IATA+name+city
  in one string).
- **Excel export/import.** `src/client/lib/excelIO.ts` (new, uses the
  `xlsx` npm package) exports `exportToExcel<T extends object>(rows, filename,
  sheetName)` and `parseExcelFile(file): Promise<Record<string,string>[]>`
  (forces every cell to a string via `{raw:false, defval:''}`, so import
  parsing is always string-based regardless of how Excel typed the
  cell) plus `parseBoolCell`/`parseListCell`/`parseNumberCell` coercion
  helpers. Every tab gets a Download button (round-trips through the
  same `saveX`/`getXList` calls the UI itself uses — no separate export
  code path) and an Upload button that re-creates/updates rows from a
  spreadsheet. Two fields are deliberately excluded from the Excel
  round-trip because they're structured sub-data that doesn't flatten to
  a spreadsheet cell: `Provider.Contacts` and `ServiceTypeDef.variants`.
- **Country Rules is now a first-class CRUD resource**, not read-only —
  new `CreateCountryRuleDto`/`UpdateCountryRuleDto`, three
  `@Roles('Admin')`-gated routes on `ReferenceController`
  (`POST/PATCH/DELETE /reference/country-rules(/:id)`, mirroring the
  existing `CountryFee` pattern), and a full Add/Edit/Delete dialog on
  the tab (previously view-only). `CountryRule`'s frontend type gained
  `ID`, `ExceptionAirports?: string[]`, `DocsRequired?: string[]`, and
  made `Notes` optional to match the Prisma model. **Known limitation,
  documented in the UI itself (a title-attribute warning on the Upload
  button):** Country Rules' Excel import always creates new rows rather
  than upserting by ID — re-importing the same exported file duplicates
  every row rather than updating in place. The other six tabs' resources
  all have a natural human-assigned unique key (ICAO code, ISO2, tail
  registration, etc.) that made upsert-by-that-key the obvious import
  behavior; `CountryRule` only has a numeric autoincrement `id`, which
  doesn't round-trip meaningfully through a human-edited spreadsheet, so
  this was accepted as a real gap rather than building ID-based upsert
  for one resource with no natural key. Full design in
  `docs/superpowers/specs/2026-08-26-viq-reference-data-search-excel-design.md`.

## Public landing page: charter vs. permit-only intake

The public, unauthenticated quote/enquiry flow at `/landing` (and `/`)
now opens on `LandingHero.tsx` (new) — a two-option chooser ("CHARTER /
PRIVATE FLIGHT" vs. "PERMIT & GROUND HANDLING ONLY") — instead of going
straight into the full trip-request form. Both options lead to the same
underlying form and the same `POST /api/quotes` submission (no backend
change; this is presentational routing only), pre-selecting which
sections of that form apply: the Charter path shows the full form
including the Crew & Pax manifest section; the Permit-only path hides
that section, for a caller who already has crew/pax sorted and just
needs permits/handling arranged for a known route. `LandingPage.tsx`
gates on a `mode: LandingMode` (`'charter' | 'permit'`) state — `null`
renders the hero, either value renders the existing form with a "← BACK
TO OPTIONS" affordance and a conditional page heading. The internal app's
branding was also unified: the public landing page and its footer now
say "VIQ" (previously mismatched branding between the public and
internal-app names).

## Admin: web-enquiry triage (adhoc-client management)

Trips submitted through the public landing/quote flow are indistinguishable
from internally-created trips once saved — `AdminTrips.tsx` (`/admin/trips`)
now surfaces them explicitly rather than requiring an admin to notice a
new row in the general list. A submitted quote is recognized as an
"enquiry needing triage" by `Owner === 'Web Enquiry' && Status ===
'Planning'` (no new schema — both fields already existed and this
combination is exactly what a fresh, un-actioned public submission looks
like). `AdminTrips.tsx` gained a "New Enquiries (N)" toggle button that
filters the list down to just those trips (with a distinct status badge
so they're visually flagged even when the toggle is off); `Layout.tsx`'s
sidebar gained a live count badge (`NavCountBadge`) on the "Manage Trips"
nav item, refetched on every route change so it clears promptly once an
admin resolves/reassigns an enquiry and navigates back. **Known,
unfixed, pre-existing issue surfaced while building this:** the Action
Board's `UrgencyBadge` ("3 urgent") in the same file is a hardcoded stub
that has never been wired to real data — it was left alone as out of
scope for this feature, not overlooked.

## Security & hygiene hardening pass (2026-08-27)

A combined security-review + live-walkthrough audit
(`.superpowers/audit-2026-08-26-security.md`,
`.superpowers/audit-2026-08-26-ux-preview.md`) surfaced 1 High/5 Medium/
3 Low/2 Info findings plus a handful of UX defects and stale QA data. All
of the fast-fix/hardening/data-hygiene items were resolved in one batch
(`docs/superpowers/plans/2026-08-27-viq-upgrade-phase1-3.md`, executed
task-by-task with an independent reviewer per task — full ledger at
`.sdd/2026-08-27-viq-upgrade-phase1-3/progress.md`):

- **Billing/Invoices is now Admin-gated**, matching Users/Settings/
  Message-Templates — previously any authenticated Coordinator could
  read/write invoices via the API even though the UI implied an admin-only
  surface. `InvoicesController` gained a class-level `@Roles('Admin')`;
  `/admin/billing` is wrapped in `RequireRole` in `App.tsx`; the nav item
  is hidden from non-Admins in `Layout.tsx`, the same way the other three
  admin-only pages already were.
- **The sidebar's "urgent" badge is no longer a hardcoded stub.**
  `Layout.tsx`'s `UrgencyBadge` used to always read "3 urgent" regardless
  of real data — visible on every single page, and a standing source of
  confusion since it never matched the real count shown one scroll away on
  Action Board/Admin Dashboard. It now takes a real `count` prop, fetched
  alongside the existing enquiry-count effect (`Promise.all([getTrips(),
  getServices()])`), and renders nothing at all when the count is 0.
- **The public `/api/quotes` endpoint is hardened** against abuse and
  malformed input: `@nestjs/throttler` limits it to 5 requests/minute/IP,
  scoped to `QuotesModule` only (not a global rate limit); `CreateQuoteDto`
  gained `@ArrayMaxSize(20)` on `legs`/`services`/`persons` and
  `@MaxLength` caps on free-text fields, closing an unbounded-payload-size
  vector.
- **Uploaded files are verified against their actual bytes**, not just
  the client-declared `Content-Type`, for the 6 binary formats with an
  unambiguous magic-byte signature (PDF, JPEG, PNG, GIF, TIFF, BMP) —
  `DocsService.upload()` now runs `fromBuffer()` (the `file-type` package,
  **pinned to `16.5.4`** — later majors are ESM-only in a way this
  project's CommonJS build can't `require()` directly, unlike
  `pdfjs-dist`'s dynamic-`import()` workaround) and rejects a mismatch.
  Plain text (no signature to check) and DOCX (occasional false-negative
  zip-content detection) are deliberately left unverified — this closes
  the realistic MIME-confusion case without risking the already-working
  upload/OCR pipeline for those two formats. **Known accepted edge case**:
  an animated PNG (`acTL` chunk) is detected as `image/apng` by this
  package version, not `image/png`, and would be incorrectly rejected if
  declared as `image/png` — irrelevant in practice for a document/permit
  upload pipeline, not worth complicating the check to cover.
- **Downloaded filenames are RFC 6266/8187-safely encoded** via the
  `content-disposition` package instead of a hand-built template string
  that embedded the filename with no escaping. Note for future work on
  `docs.controller.ts`: `content-disposition@3.0.0` is an ESM-only rewrite
  with **no default export** — import the named `create` function
  (`import { create as contentDisposition } from 'content-disposition'`),
  not a default import; the classic pre-3.0 CJS API this project's plan
  originally assumed no longer exists on npm.
- **CORS no longer silently reflects any origin in production.** An unset
  `CORS_ORIGIN` used to resolve to `origin: true` (reflect whatever
  `Origin` header the caller sent) regardless of environment. It still
  does that in development (unset `NODE_ENV`, today's default local
  workflow) but now defaults to `origin: false` (deny) when
  `NODE_ENV === 'production'` and `CORS_ORIGIN` is unset — closing an
  unbounded-origin-reflection-with-credentials pattern before it could
  matter for a real deployment.
- A leftover live **Admin-role test account (`sdd_test_admin`)** was
  deactivated, and 4 leftover QA/test trips plus one stray test field
  value were purged from the working dataset.

**A real, unrelated bug was discovered as a side effect of load-testing
the new rate limiter**, not fixed in this pass (out of scope — flagged for
a follow-up): `TripsService.nextTripId()` generates the next trip ID via
`count()` then `format(count + 1)` with no transaction lock or
unique-constraint retry — a textbook time-of-check-to-time-of-use race.
`QuotesService.submit()` (the public quote endpoint) calls this directly,
before opening its own `$transaction`, so two near-simultaneous
submissions — not just an abuse scenario, a completely ordinary case of
two visitors submitting close together — can collide on the `tripId`
unique constraint and 500. **Recommended fix, not yet implemented**:
generate the ID inside the same transaction with a retry-on-conflict
loop, or replace count-then-format with a database sequence/atomic
counter.

Two harmless deferred minors, also not fixed in this pass: `package.json`
still lists `@types/content-disposition@^0.5.9` as a devDependency,
describing the old pre-3.0 API shape — dead weight, since TypeScript
prefers the real package's own bundled `dist/index.d.ts` over the stale
DefinitelyTyped stub; and the APNG false-positive noted above.

## Stage 1: correctness & security foundation (2026-08-27)

Following the VIQ Scale Review (a second, broader audit covering security,
UX, architecture, and scalability for the goal of "1,000s of concurrent
users across many internal divisions of one organization" — still a
single-tenant deployment, not multi-tenant) and a peer-review debate over
its recommendations, the highest-priority release-blocking items were
closed in one pass (`docs/superpowers/plans/2026-08-27-viq-upgrade-stage1-security-foundation.md`,
ledger at `.sdd/2026-08-27-viq-upgrade-stage1-security-foundation/progress.md`):

- **The `nextTripId()` race condition is fixed** at the database level — see
  ARCHITECTURE.md for the full mechanism. This was the single most
  concrete correctness bug found across both audit rounds.
- **Redis is now part of the stack** (`docker-compose.yml`'s new `redis`
  service, `jetflow_api_redis`, port 6389) — but scoped narrowly, on
  purpose: it backs shared rate-limiter state only, not general caching or
  sessions. A new global `ThrottlingModule`
  (`src/server/modules/throttling/throttling.module.ts`,
  `@nest-lab/throttler-storage-redis`) replaces the in-memory throttler
  storage Phase 1-3 originally used — that in-memory version worked
  correctly for one process but would have silently allowed N× the
  intended rate once VIQ ever ran as N horizontally-scaled instances,
  since each process would have tracked its own counters. Both `/api/quotes`
  and the newly-throttled `/auth/login` (below) now share this one Redis-
  backed limiter.
- **`POST /auth/login` is now rate-limited** (5 attempts/minute/IP, same
  mechanism as `/api/quotes`) — previously the only endpoint that issues
  credentials had no throttling at all, a brute-force/credential-stuffing
  gap independent of any scaling plans.
- **`helmet` is installed** with `contentSecurityPolicy` explicitly
  disabled — its default CSP would block the Google Fonts `<link>` tags in
  `index.html`, and enabling a correctly-scoped CSP needs real testing
  against the production bundle, which this pass deliberately left as a
  follow-up rather than guessing. Every other header helmet sets
  (`X-Content-Type-Options`, `X-Frame-Options`, etc.) is on unconditionally.
- **An unset `NODE_ENV` now logs a loud startup warning** — Phase 1-3's
  CORS fix only denies-by-default when `NODE_ENV=production` is explicitly
  set, and `.env.example` never documented that requirement, so a real
  deployment that just copied the example would have silently kept the
  permissive dev CORS behavior. `.env.example` now documents this, and
  separately annotates `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` as
  seed-time-only (a stale documentation gap, not a behavior change).
- **`GET /api/health`** (new, public) does a trivial DB round-trip and
  returns `200`/`503` — the minimum needed for a load balancer to know an
  instance is actually serving traffic. Scoped to database reachability
  only for now; Redis-reachability is a reasonable future addition once
  there's a clean way to access the shared Redis client outside
  `ThrottlingModule`.
- **`@MaxLength` validation now covers every write DTO in the app**, not
  just the public `CreateQuoteDto` Phase 1-3 already capped — all 19
  `create-*.dto.ts` files were audited; corresponding `update-*.dto.ts`
  files that extend the create DTO via `PartialType`/`OmitType` inherit
  the caps automatically. Short identifier-shaped fields got
  `@MaxLength(200)`, free-text notes/body-shaped fields got
  `@MaxLength(2000)`; fields already constrained by `@IsIn`/`@IsEmail`/
  `@IsDateString`, or genuinely short lookup codes, were left alone.

**Known, deliberately unaddressed in this pass:** `create-provider.dto.ts`'s
`scope` and `currency` fields were left uncapped (a minor inconsistency
from the batch that did the first 11 of 19 files — flagged, not fixed,
since it's cosmetic and outside this pass's actual scope). Two trips in the
working dataset (`2608006`/`2608007`) weren't created by any of this
session's own testing and were left untouched pending confirmation of
their origin.

## Stage 2a: database & scale foundation (2026-08-27)

Backend-only follow-up to Stage 1, closing the VIQ Scale Review's biggest
cross-cutting finding — nothing in the app paginated, with the Audit
Trail's live 387-row unpaginated render as concrete proof
(`docs/superpowers/plans/2026-08-27-viq-upgrade-stage2a-backend-pagination.md`,
ledger at `.sdd/2026-08-27-viq-upgrade-stage2a-backend-pagination/progress.md`):

- **Four missing indexes added**: `Trip.status`, `Trip.createdZ`,
  `Service.urgency`, `AuditEntry.timestampZ` — all four were hot-path
  sort/filter columns with no index, meaning `GET /trips` and every
  dashboard's urgency filtering did a full table scan on every call.
  Purely additive, zero application-code change needed alongside it.
- **`AuditService.logDiff()` no longer does one write per changed
  field.** It used to issue N sequential `create()` calls for an N-field
  update — now one batched `createMany()`. Every mutating endpoint in the
  app goes through this function, so this fixes the pattern everywhere at
  once, with identical resulting audit rows.
- **`GET /trips`, `/services`, `/persons`, and `/audit` all gained opt-in
  pagination.** This is deliberately, strictly backward compatible: a
  request with no `page` query param returns exactly what it always has
  (a plain array/list) — nothing in the current frontend passes `page`,
  so nothing broke. Add `?page=1&limit=50` and the response becomes
  `{ data, page, limit, total, totalPages }` instead. `limit` is clamped
  server-side on every request (max 200 for Trips/Services/Persons, max
  1000 for Audit — chosen because the existing frontend already
  legitimately requests up to 1000 audit rows today; a lower cap would
  have silently broken that real usage instead of just closing the
  "someone could request 5 million rows" gap). Persons' pagination
  applies only to the unfiltered full-roster call — a `legId`- or
  `tripId`-scoped request stays in its existing small merged-view shape
  regardless of whether `page` is passed.
- **`DATABASE_URL` now sets an explicit `connection_limit=10`** rather
  than relying on Prisma's default (`num_physical_cpus × 2 + 1` per
  process) — that default has no awareness of other instances sharing the
  same Postgres, and could exhaust Postgres's own `max_connections` (100
  by default) well before a realistic multi-instance count. PgBouncer
  itself is not introduced yet — that's real infrastructure worth sizing
  against an actual multi-instance deployment target, not something to
  add speculatively.

**Deliberately not done in this pass** (a separate, not-yet-written
follow-up, referred to as "Stage 2b"): nothing on the frontend was
touched. `dataStore.ts` and every page component still fetch the full
unpaginated response, exactly as before — this pass only built the
backend capability. The frontend work — adding real pagination/search UI
to Trips, Manage Trips, and Dashboard's cards, and consuming the new
`page`/`limit` params — is its own plan, and specifically needs to also
fix `TripsPage.tsx`'s current pattern of doing four separate N-way
parallel fetches per trip (legs, stops, services, comms) on every page
load, which is its own scalability problem beyond "the list isn't paged"
and was discovered while scoping this work.

## Stage 2b: frontend pagination & dashboard widgets (2026-08-28)

The frontend follow-up to Stage 2a — consuming the pagination capability
that stage built, plus fixing `TripsPage.tsx`'s N-way-parallel-fetch-per-trip
anti-pattern
(`docs/superpowers/plans/2026-08-27-viq-upgrade-stage2b-frontend-pagination.md`,
ledger at `.sdd/2026-08-27-viq-upgrade-stage2b-frontend-pagination/progress.md`):

- **`Leg.etdZ` gained an index**, closing the one gap Stage 2a's index pass
  missed — Legs had no pagination/indexing at all going into this stage.
- **Two new purpose-built dashboard endpoints**: `GET /legs/upcoming` and
  `GET /services/open`, each `?limit=&search=`. These are deliberately
  separate from the general list-pagination endpoints — Dashboard's
  "Upcoming Departures" and "Open Services" cards have fixed business-concept
  filters (`etdZ >= now`; `status NOT IN ('Confirmed', 'Not Required')`), not
  arbitrary user filters, so a dedicated endpoint is a cleaner fit than
  another optional query param on the general endpoints. Both return a plain
  array (not the `{data,page,...}` envelope) with the parent trip's
  `tripId`/`registration`/`status` joined in.
- **`GET /trips`'s pagination extended with `search` and bulk per-trip
  relation data.** `findAllPaginated()` now also does `include: { legs:
  {orderBy:{seq:'asc'}, select:{...}}, _count:{select:{stops,services,
  comms}} }` in the same query — replacing what `TripsPage.tsx` used to do
  (one `getTrips()` call followed by four separate `Promise.all(list.map(...))`
  loops fetching legs/stops/services/comms **per trip across every trip on
  the page** — roughly 4,000 near-simultaneous requests at 1,000 trips) with
  one bulk query. `search` does a case-insensitive `OR` across
  `tripId`/`client`/`registration`.
- **`TripsPage.tsx` and `Dashboard.tsx` rewritten to consume all of the
  above.** TripsPage now does one `getTripsPaginated()` call per page/search
  change, with Previous/Next pagination. Dashboard's two cards each gained
  their own independent search box and widget fetch, and "Open Services"
  gained a "Close" button (`closeService()`, a lightweight direct PATCH
  setting `status: 'Not Required'`) — the four stat cards above them
  deliberately kept their existing full `getTrips()`/`getServices()` fetch,
  since those need true aggregate totals the capped widget endpoints can't
  provide.
- **A documented, deliberate simplification**: `TripsPage.tsx`'s old
  per-trip "N open services" badge is gone, replaced by a plain `Counts.
  Services` total — Prisma's bulk `_count` can't filter by status, so an
  open-only count isn't available from one query. Restoring it would need
  a per-page-of-trips follow-up query, the same shape of work already
  deferred for `AdminTrips.tsx` below.

**Deliberately not done in this pass**: `AdminTrips.tsx`'s list panel keeps
its pre-existing full-fetch-then-filter pattern. Its per-trip card needs an
*open-services-only* count (not a total, which is all bulk `_count` can
give) jointly with first/last-leg info — a query design that needs more
care than this pass should risk on a page that also does real editing. This
is the natural next follow-up, not a gap in this plan's own execution.

## Small-fixes bundle: deadlines, vendor contact, user profiles, AdminTrips pagination (2026-08-28)

Closes the follow-up items from the user's post-audit review list (deadline
formatting/grouping, vendor contact on services, user profile fields) plus
the one scale gap Stage 2b explicitly deferred (`AdminTrips.tsx`).

- **`TripDetail.tsx`'s `DeadlineRail` rewritten.** Was a horizontal scroll
  of individual service cards showing raw hours (`Due in 290h`) and a raw
  `SVCID`. Now three grouped tables — Landing Permits / Overfly Permits /
  Ground Handling (plus an "Other Services" bucket for any other open
  service type, so nothing silently disappears) — each row showing
  `Leg | Country | Status | Due`. Duration formats as `12days & 2hrs`
  (`formatDueDuration()`); country resolves to its full name via
  `getCountry()`; leg resolves to `L01`-style labels by matching the
  service's `ScopeID` back to a `Leg.LegID` and reading its `Seq`. The raw
  `SVCID` is now a hover tooltip only, not inline text.
- **Vendor contact card on services.** `ServiceInlineEditor`'s drawer shows
  a new `VendorContactCard` under the Provider/Status row whenever a
  provider is assigned — click-to-call (`tel:`) and WhatsApp (`wa.me`)
  both reuse `Provider.AOGContact` as the phone number (no new schema
  field), click-to-email (`mailto:`) uses `Provider.Email`, and any
  additional named `Provider.Contacts` render as their own mailto links.
- **User profiles (Item 9).** `User` gained `firstName`/`middleName`/
  `lastName`/`email`/`phone`/`team`/`company`/`designation` — all nullable
  at the DB level (existing seeded users predate them, no safe backfill
  value existed), enforced as required (first/last name, valid email) only
  by `CreateUserDto` for new users. `email` is unique with the same
  friendly `ConflictException` pattern the existing `username` check uses.
  `/admin/users` (`UsersPage.tsx`) gained the full field set in its
  add/edit dialog and now shows a real display name instead of just the
  login username.
- **`AdminTrips.tsx` no longer fetches all four tables up front.** The left
  list now calls the same `getTripsPaginated()` Stage 2b already built for
  `TripsPage.tsx`, extended here with two new server-side filters —
  `GET /trips?upcoming=<hours>` (a trip qualifies if any leg's `etdZ` falls
  in that window; matches `GET /legs/upcoming`'s own real-`Date()` "now"
  convention, not the frontend's fixed demo epoch) and
  `GET /trips?enquiriesOnly=true` — so the existing "next 72h" default and
  "New Enquiries" toggle stay server-filtered instead of client-filtering
  a fully-fetched trip list. The right pane (leg/service editing) now
  fetches only the *selected* trip via `getTripSheet()`, not the whole
  table. One deliberate, disclosed trade-off: per-trip urgency-based
  sorting and the "N open services" card badge are gone (finding the max
  urgency or open-only count across every trip on a page isn't available
  from the paginated query without a second per-trip query, the same
  constraint Stage 2b already documented for this exact page) — the list
  now sorts by soonest leg ETD and shows a total services count instead,
  mirroring the trade-off `TripsPage.tsx` already made.
- **Root-cause fix, found while wiring the above: `getTripSheet()` (used by
  every `TripDetail.tsx` page load, not just `AdminTrips.tsx`) was
  secretly doing the same full-table-fetch-then-filter thing for Legs and
  Stops** (`getLegsForTrip()`/`getStopsForTrip()` called `getLegs()`/
  `getStops()` — the whole table — client-side filtered by `TripID`), even
  though the backend has always supported `GET /legs?tripId=` and
  `GET /stops?tripId=` (the same pattern `getServicesForTrip()`/
  `getPersonsForTrip()`/`getCommsForTrip()`/`getDocsForTrip()` already
  used correctly). Both now call the filtered endpoint directly. This was
  a bigger scale risk than `AdminTrips.tsx` alone, since it fired on every
  single trip page view app-wide, and needed no backend change — only the
  two frontend functions were wrong.

## Client entity & New Trip wizard overhaul (2026-08-28)

Closes items 12/13/14/19 from the user's post-audit review list: clients as
real, billable database records; registration-driven aircraft autofill in
the wizard; a structured multi-line bill-to; and Trip Owner/Team fields.

- **New `Client` model** (`clients` table) — name, optional link to an
  `Operator` (`isOperator`/`linkedOperatorId`, Item 19's "a client may or
  may not be an operator, or may act on one's behalf"), contact email/
  phone, a structured billing address (line1/2/city/state/postal/country),
  and multiple billing emails (`billingEmails: String[]`). Full CRUD via a
  new `clients` module (`GET/POST/PATCH/DELETE /clients(/:id)`,
  `GET /clients?search=` for typeahead) — **deliberately not gated to
  Admin**, unlike Operator/Provider/Country: a client is everyday
  operational data a Coordinator creates while booking a trip, the same
  reasoning that already keeps `PersonsController` ungated. Trip.clientId
  is `ON DELETE SET NULL`, so deleting a client never blocks or cascades
  into its trips — they just keep their own free-text `Client` string.
  Admin/Coordinator-editable CRUD UI lives in a new **Clients** tab in
  `AdminAssets.tsx`, mirroring the Operators tab's dialog pattern exactly
  but gated on `canEdit` instead of `isAdmin`.
- **`Trip` gained `clientId`, `ownerUserId`, `team`, and structured
  `billTo*` fields** (`billToAddressLine1/2`, `billToCity`, `billToState`,
  `billToPostalCode`, `billToCountry`, `billToEmails: String[]`), all
  additive/nullable — the existing single-line `billToAddress` stays as a
  legacy/display fallback, kept in sync (comma-joined from the structured
  fields) by the wizard rather than replaced, so `BillingPage.tsx`'s "Bill
  To" line and `resolveBillToAddress()` needed no changes.
- **`GET /users/directory`** — a new minimal endpoint (`id`/`username`/
  `firstName`/`lastName`/`team` only, active users only) that overrides
  `UsersController`'s class-level `@Roles('Admin')` down to any
  authenticated role via a method-level `@Roles('Admin','Coordinator',
  'Viewer')`. Exists solely to power the wizard's Trip Owner typeahead
  without exposing the full Admin-only `/users` (which carries no email/
  phone in the directory's `select` at all, not just a frontend filter).
- **`NewTripWizard.tsx` Step 1 rebuilt**: Registration now leads (Item
  13's "interchange positions"), typed against a new `Typeahead` component
  (free-typed input + filtered suggestion list — the existing shadcn
  `Combobox` only accepts a value already in its option list, which can't
  represent "not in the system yet, create one," so a small local
  component was added instead of forcing every field through Combobox).
  Selecting/matching a Registration autofills Operator, ICAO Type, and the
  new Serial Number field from the matched `Aircraft` row (mirroring
  `TripInfoEditor.selectAircraft`'s existing logic in `TripDetail.tsx`,
  not a new heuristic). Client uses the same `Typeahead` against
  `getClientList()`; matching a client pre-fills the bill-to block, and
  leaving it unmatched creates a new `Client` row on save. Owner uses the
  same pattern against the new user directory, and defaults to the
  logged-in user (still freely overridable) once the directory loads.
- **Also fixed while wiring this**: the wizard's `handleSave` was building
  a `Trip` that never actually set `AircraftICAOType`/`AircraftMTOWKg`/
  `AircraftSerialNumber` — despite those columns existing since the
  Aircraft/Operator expansion phase — so every wizard-created trip
  silently lost that data at creation, only ever gaining it if someone
  later opened `TripInfoEditor` and re-selected the aircraft there. Now
  set at creation time too.
- **Verified live** (API-level, curl+JWT — the Chrome extension wasn't
  connected this session, so the wizard's UI itself is unverified beyond
  a clean `tsc` build): client create/search, `/users/directory`, and a
  full trip create/read/delete round-trip through every new field,
  confirmed once as Admin and once as Coordinator (Item 12's "coordinators
  can also add new trips" — already true before this pass, since
  `/admin/trips/new` was never role-gated; confirmed, not newly built).

**Not done in this pass**: `TripInfoEditor` (post-creation trip editing in
`TripDetail.tsx`) does not yet expose the new Client/Owner/Team/structured
bill-to fields — only the wizard does. A trip created before this migration
has no `clientId`/`ownerUserId`/structured bill-to until someone edits it.

## Invoice rework — editable line items (2026-08-28)

Closes item 10 from the user's post-audit review list ("Invoice is too
congested and I cannot add/remove items, trips, legs, services").

- **Line items are now directly editable.** `Invoice.lineItems` was always
  a `Json` column (an array of `{LineID, Description, Quantity, UnitPrice,
  Total, ...}` objects), not normalized rows, so no schema change was
  needed — `InvoiceDetailDialog` just needed an editable draft state
  around it. Description/Quantity/Unit Price are inline-editable per row,
  Total is derived (never directly editable), rows can be removed, and
  "Add Line Item" appends a blank manual row — subtotal/tax/total
  recompute live from the draft as you edit, matching
  `generateInvoiceFromTrip()`'s own formula (`subtotal = Σ line totals`,
  `tax = subtotal × taxRate`, `total = subtotal + tax`). "Save Changes"
  PATCHes the whole invoice in one call and logs a `LineItems` entry to
  the existing Change History. Verified live end-to-end against a real
  invoice (`INV-2608003-MTBC42TK`): add a line (2950→3050), remove it
  again (3050→2950 — the original value, confirmed byte-for-byte restored).
- **Editing is scoped to `Status: Draft` only** (`canEditLines = canEdit &&
  invoice.Status === 'Draft'`) — amounts shouldn't move once an invoice has
  actually been sent. This is a frontend-only gate, consistent with this
  codebase's existing level of rigor elsewhere (role/edit gating is
  enforced this way throughout, not as a second backend business-rule
  layer) — flagged here rather than silently assumed, in case a real
  backend guard against editing a non-Draft invoice's lineItems is wanted
  later.
- **Decluttered the dialog** ("too congested") by splitting it into three
  tabs — **Line Items** (now the default/first tab), **Details & QR**, and
  **Status & History** — instead of one long scrolling column with the QR
  code, editable table, status-change form, and full change log all
  stacked on top of each other. A compact header (Trip/Client/Status/
  Total) stays visible above the tabs regardless of which one is open.
- **"Trips/legs/services" interpretation**: an Invoice is still tied to
  exactly one Trip (`Invoice.tripId`, required, singular) — this pass did
  not turn invoices into a multi-trip/consolidated-billing concept, since
  that's a materially bigger schema change (`tripId` would need to become
  a list or a join table) and the request's exact intent there was
  ambiguous. Read narrowly as "can't add/remove the services this
  specific trip's invoice bills for" — which line-item editing above
  directly answers, since every auto-generated line item already carries
  its source `SVCID`. Flagged rather than guessed at the larger change.

## App branding (2026-08-28)

Closes item 11: "Admin can brand the app with SEO, Name, logo, favicon,
tagline, domain, subdomains."

- **New `AppSettings` singleton table** (`app_settings`, always exactly one
  row at id `"default"`, upserted on first read/write) — appName, tagline,
  SEO title/description/keywords, domain, subdomains (`String[]`), and the
  logo/favicon's stored file path + mime type.
- **New `settings` module.** `GET /settings` (and the two file-serving
  routes, `GET /settings/logo/file` / `GET /settings/favicon/file`) are
  `@Public()` — deliberately, since the pre-login landing/login pages need
  branding, and a browser's own `<link rel="icon">`/`<img>` request never
  carries an Authorization header at all. `PATCH /settings` and the upload
  routes (`POST /settings/logo`, `POST /settings/favicon`) are
  `@Roles('Admin')`. Logo/favicon storage is a small dedicated path under
  `uploads/branding/` — deliberately **not** routed through the existing
  Docs pipeline, since `DocsService.upload()` requires exactly one of
  tripId/personId/aircraftRegistration to be set, which a global app asset
  has none of. Same magic-byte verification approach as document uploads
  (via `file-type`), scoped to image types only (PNG/JPEG/SVG/ICO, 5MB cap).
- **`App.tsx` applies branding once at boot**, regardless of route or auth
  state (`applyBranding()` in `dataStore.ts`), setting `document.title`,
  meta description/keywords, and the favicon `<link>` from whatever's
  configured — fails silently if the fetch errors, since branding is
  cosmetic and must never block the app from loading.
- **New Branding tab in `/admin/settings`**, first/default tab, with a live
  logo/favicon preview and immediate-upload-on-select — the only tab in
  that page actually wired to a backend. **Flagging directly**: the other
  three tabs there (SMTP/IMAP, Messaging, Notifications) were already, and
  remain, a static mockup with no real state or save handler at all — every
  input uses `defaultValue`, every "Save" button does nothing. That's
  pre-existing, not introduced by this pass, and out of this item's scope,
  but worth knowing before assuming anything typed into those three tabs
  persists. (Real SMTP config already works — it just comes from the
  `SMTP_*` env vars `MailModule` reads directly, not from this UI.)
- **Domain/Subdomains are informational only.** The app cannot actually
  rebind which host/port it's served from based on a database row — these
  fields exist as a reference for whoever manages DNS/deployment, not as a
  live server-binding mechanism. Said explicitly in the tab's own UI copy,
  not left implicit.
- **Verified live**: unauthenticated `GET /settings` succeeds; unauthenticated
  `PATCH /settings` correctly 401s; a Coordinator token correctly gets 403
  on `PATCH`; an Admin `PATCH` round-trips appName/tagline/domain/
  subdomains; a real image upload (201) is immediately fetchable
  unauthenticated at `/settings/logo/file` with the correct content-type
  and byte count. Test values were reset back to clean defaults
  (`appName: "VIQ"`, everything else blank) after verification — a
  placeholder 1×1 test PNG is still set as the logo, since there's no
  "clear logo" endpoint yet (only replace); upload a real one to overwrite it.

## Mobile UX fix — sidebar never closed after navigating (2026-08-28)

Closes item 7: "Mobile UI/UX is not friendly, requires constant touches
after every grid selection."

- **Root cause, found in `Layout.tsx`**: the mobile sidebar (`sidebarOpen`
  state, toggled by the hamburger button below the `md` breakpoint) has a
  dark overlay that closes on tapping the backdrop — but tapping a
  `NavLink` inside the sidebar itself never called `setSidebarOpen(false)`.
  On a phone: tap hamburger → sidebar opens → tap any nav item → the app
  navigates to the new page, but the sidebar overlay stays open on top of
  it, blocking every element until the user taps again just to dismiss it.
  That's a tap needed after *every single navigation*, which matches "constant
  touches" far better than a one-off glitch would. Fixed by passing an
  `onNavigate` callback (`() => setSidebarOpen(false)`) into both
  `NavSection` instances, wired to each `NavLink`'s `onClick`.
- **Secondary fix**: `ServiceInlineEditor`'s multi-select checkbox
  (`TripDetail.tsx`, the "editing" mode used to bulk-remove services) was a
  bare `<input type="checkbox">` with no wrapping label — a native
  checkbox's actual hit target is roughly 16px, a realistic mis-tap risk on
  a touch screen. Wrapped it in a `<label>` with padding + matching negative
  margin, which expands the tap target without shifting any surrounding
  layout (the existing `PermitSubmissionGroups` checkboxes elsewhere in the
  same file already used a full-row `<label>` — this brings the other
  pattern in line with it, not a new one).
- **How this was verified without a real narrow viewport**: the browser
  automation tool's `resize_window` did not work in this session — it
  reported success but the tracked tab's `window.innerWidth` never actually
  changed (tried 390/400/420/800/1900px, and Chrome's own DevTools device
  toolbar shortcut also had no effect), even after the user manually
  un-maximized/resized the Chrome window. Rather than guess at what the
  fix looks like, the mobile-only trigger button was made visible via a
  forced inline `style.display` override (bypassing the `md:hidden` CSS
  rule for that one element only — inline styles win over a stylesheet's
  media-query rule regardless of viewport), then the real click flow was
  driven end-to-end: click hamburger → confirmed the overlay `<div>`
  existed in the DOM (`sidebarOpen: true`) → clicked the "Trips" nav link →
  confirmed the overlay was gone *and* `location.pathname` was `/trips`
  (`sidebarOpen: false`, real navigation happened). That's the actual
  React state/routing logic being exercised, not a visual guess — but the
  CSS layout itself (spacing, wrapping, whether anything overflows at
  actual phone widths) was never visually confirmed this session and is
  still worth a real device/emulator check.

## World reference data import (2026-08-28)

Closes item 17 ("update reference data adding all airports, countries,
country rules, aircraft types, known providers, service types, leg purposes
in the world") and confirms item 18 (operator/fleet live-updates).

- **New script, `prisma/import-world-reference-data.js`** — reads the CSVs
  and Excel file the user placed at
  `C:\Backups\InsiderTechSol\Aviation\resources` (OurAirports' `countries.csv`
  / `airports.csv` / `runways.csv`, plus the FAA's Aircraft Characteristics
  Database in `aircraft_data.xlsx`) and imports **249 countries** (up from
  22 — centroid computed as the average lat/lng of that country's own
  airports, the same "approximate centroid" approach the schema's own
  comment already described, just computed instead of hand-picked), **388
  aircraft types** (up from 6 — from the FAA's `ACD_Data` sheet, which has
  real MTOW/wingspan/length/wake-category data, unlike the bare 7,261-row
  ICAO-designator CSV also in that folder, which has no performance data at
  all and would have produced thousands of unusable rows against this
  schema's required `mtowKg` field — deliberately not imported), and
  **33,908 airports** (up from 19 — every OurAirports row with a usable
  4-character ICAO/GPS code, joined against `runways.csv` for each
  airport's longest runway). Every write is **insert-only**
  (`upsert({ update: {} })` for Countries/AircraftTypes, matching
  `prisma/seed.ts`'s own existing convention; `createMany({ skipDuplicates:
  true })` for Airports) — this business's existing curated rows (permit
  flags, escalation contacts, the real fleet's verified MTOW) are never
  touched. Safe to re-run.
- **Deliberately not imported**: `CountryRule` (permit lead-times/
  tolerances/required-docs per country) and Provider/ServiceType/
  LegPurpose records. These aren't "world data" — there's no public dataset
  of "how many hours' notice does Kenya need for an overfly permit" or
  "which vendors does this company actually use" to import. They're this
  business's own accumulated operational knowledge and vendor relationships,
  entered by hand, same as before. Flagged rather than fabricated.
- **Item 18, confirmed already satisfied, not newly built**: Operators
  already have full live CRUD (`/admin/assets` → Operators tab, built in an
  earlier phase and extended with the Clients tab this session) using
  exactly the reference-data pattern the item asked for — `Operator.fleet`
  is server-derived from the `Aircraft.currentOperatorId` relation, not a
  second hand-maintained list.
- **Found and fixed a real scale problem this import itself triggered**:
  Reference Data's Airports tab used to render every filtered row into the
  DOM with no cap — fine at 19 rows, but a genuine multi-second page freeze
  once there were 33,908 (confirmed live: the browser automation's own
  screenshot tool timed out at 5s against it). The fetch/cache itself
  wasn't the bottleneck — `getAirportList()` still returns the full cached
  array, used as before by `NewTripWizard`/`TripDetail`'s aircraft-registry
  lookups and the tab's own Download/Upload Excel round-trip, both of which
  correctly still need the complete list regardless of what's on screen.
  Only the *render* is now capped, at 200 rows, with a "showing first 200 of
  N — refine your search" message shown above the table. Verified live:
  page load dropped from a 5s+ freeze to ~2s, and searching down to a single
  real match (Heathrow → EGLL, correct country/timezone) still works
  instantly. A `GET /reference/airports?page=&limit=&search=` paginated
  endpoint was also added server-side (same opt-in convention as `GET
  /trips`) for a future proper pagination UI, but the frontend wasn't wired
  to it this pass — the render-cap was the smaller, lower-risk fix for the
  specific freeze actually observed, without touching the Excel-based bulk
  edit workflow this page's Airports tab depends on.

## Route/service automation — stops, Avoid/Include FIRs (2026-08-28)

Closes item 16, the last of the user's post-audit review list: "adding a
trip FALA-HECA / HECA-HAAB should automatically include 2 stops ... plus 2
ground handling services ... Avoid Sudan should automatically remove
service Sudan overfly permit ... Add Eritrea should automatically reroute
and add Eritrea."

- **Prerequisite fix, done first**: newly-imported (Item 17) countries all
  defaulted `overflightPermitRequired`/`landingPermitRequired` to `false` —
  none of this automation can generate a permit service for a country that
  doesn't require one. Per the user's explicit rule ("by default all
  countries in Africa require overfly and landing permits"), both flags are
  now `true` for all 60 African countries (matched on the imported
  `region` code `AF` plus five pre-existing rows using a different
  region-naming convention — `East Africa`/`North Africa`/`West Africa`/
  `Southern Africa`/`Central Africa` — verified zero African countries were
  missed afterward). Every other country keeps whatever was already there.
- **Auto-created Stops for connecting legs** (`LegsService.
  ensureConnectingStops`, called after every leg creation): when one leg's
  arrival ICAO equals another leg's departure ICAO on the same trip, that
  airport now gets a real `Stop` row automatically (ground time computed
  from the gap between the two legs' ETA/ETD) instead of requiring it to be
  added by hand. Ground handling itself never actually depended on this —
  `ServicesService.generateArrivalServices` already fires unconditionally
  per leg arrival — so this specifically fixes the Stops tab/summary being
  silently incomplete for a connecting airport, not a missing service.
  Verified live: FALA→HECA + HECA→HAAB produced a HECA stop (18h ground
  time, correctly computed) and ground handling at both HECA and HAAB.
- **Avoid/Include FIRs now actually do something.** Before this pass, both
  fields existed in the leg editor, saved correctly, and were never read by
  anything server-side — `computeOverflown()` was pure great-circle
  geometry with no FIR-override parameter at all. Now `LegsService.create()`
  /`update()` apply a set adjustment (`geo.util.ts`'s new
  `applyFirAdjustments`: `(geometric ∪ include) − avoid`) whenever
  Avoid/Include FIRs or the route change, and `ServicesService.
  reconcileOverflightServices()` keeps the leg's actual Overflight services
  in sync with the result — creating one for a newly-included country,
  removing one for a newly-avoided country. This is **not** a real
  reroute — there's no airway/FIR-polygon routing engine behind this app
  (`geo.util.ts`'s own header already says so), so avoiding a country
  doesn't bend the great-circle line around it, it only controls which
  Overflight service exists. Called out explicitly rather than
  overclaiming "reroute."
- **A raw country name, an ISO2 code, or a real ICAO FIR code
  (`ICAORule.inheritedCountryIso2`) are all accepted** for Avoid/Include
  entries — not just the ISO2 the frontend's existing `normalizeFIR()`
  usually sends — so the automation is correct for any caller, not
  dependent on one frontend path pre-normalizing first.
- **Removal is deliberately narrow, not automatic-and-total**: an Overflight
  service is only ever auto-deleted while it's still `Not Started`.
  Anything with real progress (`Requested`, `Confirmed`, etc.) is left in
  place and gets a `FlaggedStale` audit log entry instead — the same
  caution this app already applies elsewhere (the Operator delete guard,
  Draft-only invoice editing) rather than silently destroying something a
  coordinator may have already acted on. Verified live: a service manually
  set to `Requested` survived its country being avoided, correctly flagged
  in its audit trail; a `Not Started` one in the same scenario was cleanly
  removed.
- **Verified live**, all against a real running trip via the actual API
  (not unit tests — this repo has no test framework): the exact FALA→HECA→
  HAAB scenario from the request (stop + 2× ground handling); Sudan's
  overflight service auto-removed on Avoid (route HECA→HAAB genuinely
  crosses Sudan); Kenya's overflight service force-created via Include,
  sent as the literal string `"Kenya"` rather than `"KE"`, proving the
  server-side name resolution path (not just a pass-through of an
  already-normalized code); the in-progress-service safety guard.

## TripInfoEditor gains the wizard's Client/Owner/Team/bill-to fields (2026-08-28)

Closes the one gap flagged at the end of the last pass: `NewTripWizard`
had Items 12/13/14's Client typeahead, Owner typeahead, Team, and
structured bill-to fields — the *existing*-trip editor in `TripDetail.tsx`
didn't, so a trip created before that work (or just never touched since)
had no way to ever get them filled in.

- **`Typeahead` extracted to a shared component**
  (`components/ui/typeahead.tsx`) so both the wizard and `TripInfoEditor`
  use the identical free-type-plus-suggestions pattern instead of two
  copies drifting apart.
- **`TripInfoEditor` gained**: a Client typeahead (selecting a match
  pre-fills the bill-to block the same way the wizard's does), an Owner
  typeahead against the user directory, a Team field, and the full
  structured bill-to block (address lines, city/state/postal/country,
  billing emails) — replacing the old single-line `BillToAddress` input.
  The legacy single-line field is kept in sync underneath (joined from the
  structured fields) so nothing else needs to change.
- **Same ad-hoc Client backfill as the wizard**: saving with a typed
  Client name but no linked `ClientID` first checks for an existing Client
  with that exact name (case-insensitive) and links it — only creating a
  new Client row if truly nothing matches — so re-saving an already-linked
  trip never creates a duplicate.
- **Verified live end-to-end**, not just built: opened a real seed trip
  (2608004, "Solairus Aviation" — never previously linked to a Client
  row), typed Team/bill-to values through the actual UI, saved, and
  confirmed via direct DB query that `team`, `bill_to_address_line1`,
  `bill_to_city`, and a newly-backfilled `client_id` all persisted
  correctly, with a real `Client` row auto-created for "Solairus Aviation".
  Test values (Team, bill-to address) were reset back to blank afterward
  to keep the seed trip's demo data clean — the Client link itself was
  left in place since it's genuinely correct data, not a test artifact.

## Doc verification gets a real side-by-side preview (2026-08-28)

The user asked directly: "does OCR work?" — verified live rather than
assumed. Upload → extract → verify already existed from an earlier phase
and is genuinely functional (Tesseract for images, `pdfjs-dist` text-layer
extraction with rasterize-and-OCR fallback for scanned/faxed PDFs plus
password support, `mammoth` for DOCX, MRZ/passport field parsing) — tested
live end-to-end with a real generated PNG: uploaded, OCR'd (`Complete`,
correctly read two of three test lines verbatim, misread one digit as a
letter — normal Tesseract behavior, not a bug), verified fields saved,
file downloadable. One real gap found against what the user described
("share doc and info side by side for verification"): `DocVerifyDialog`
only ever showed the raw OCR **text** dump — never the actual document
image/PDF next to the fields, so a coordinator verifying a passport or
licence couldn't visually check the source while typing.

- **Fixed**: `DocVerifyDialog` is now a real two-column layout — the
  actual uploaded file renders on the left (images via `<img>`, PDFs via
  a native `<iframe>`; DOCX/TIFF/text fall back to a plain "no in-browser
  preview, use Download" notice rather than a broken frame), extracted
  text and the editable verified-fields form stay on the right, exactly
  matching the side-by-side verification flow described.
- **New `getDocPreviewUrl()`** in `dataStore.ts` — `/docs/:id/file`
  requires an Authorization header, which a plain `<img src>`/`<iframe
  src>` can never send, so this fetches via the authenticated `apiFetch`
  and returns a `blob:` URL instead (revoked on dialog close/unmount).
  Separate from the existing `downloadDocFile()`, which triggers a save
  rather than returning a displayable URL.
- **Verified live in the browser**, not just built: uploaded a real
  generated "crew licence" image to a real seed trip, opened Verify, and
  confirmed the actual image renders on the left with the extracted text
  correctly shown on the right. Cleaned up via the real `DELETE /docs/:id`
  endpoint afterward (removes both the DB row and the stored file, not
  just one or the other).

## Trips page: redesigned card + four view modes (2026-08-28)

Direct request: a specific card layout, plus Tile/Details/Large Icons/
Small Icons view switching like a file-explorer, on `/trips`.

- **Card content rebuilt to spec**: `Tripno | Registration`, then
  `Client | Operator` (deduplicated — a trip where the client and operator
  are the same name, e.g. "Solairus Aviation" booking for itself, now
  shows it once instead of "Solairus Aviation | Solairus Aviation"; caught
  live while screenshotting and fixed same pass), the date range, a
  `Legs, Stops · services · comms` count line, and `Owner: … · Origin: …`
  (origin = the trip's first leg's departure ICAO).
- **Four view modes**, an icon toolbar next to the search box: **Tile**
  (the card above, 2-3 per row — new default), **Large Icons** (same card,
  larger, 1-2 per row), **Small Icons** (compact chip — icon, status,
  TripID, Registration/Client — dense grid, 4-6 per row), **Details** (a
  table, extended from the previous fixed one with Operator and a Legs/
  Stops/Dates breakdown). Tile and Large Icons share one `TripCard`
  component (a `size` prop controls spacing/type scale) rather than two
  near-duplicate layouts.
- **View choice persists** in `localStorage` (`viq_trips_view_mode`) —
  reloading the page keeps whatever view was last selected, wrapped in a
  try/catch so a private-browsing/storage-blocked session just doesn't
  persist rather than erroring.
- **Verified live**: clicked through all four modes in the browser against
  real trip data, confirmed the layout matches the requested spec exactly,
  confirmed the dedup fix, and confirmed the view choice survives a full
  page reload.

## AdminTrips card + Invoice A4 sizing, and a real dialog-width bug found along the way (2026-08-28)

- **`AdminTrips.tsx`'s left-pane trip cards** rebuilt to the same
  Tripno|Registration / Client|Operator (deduplicated) / dates / Legs-Stops-
  services-comms / Owner-Origin layout as the Trips page, adapted to the
  narrower 320px sidebar column — same information, same dedup fix, same
  selection/click behavior as before (only the card content changed).
- **Invoice dialog resized toward A4** for the line-items table specifically
  (larger row height, bigger font, wider columns) — item on your list was
  `INV-2608003-MTBC42TK`, tested against that exact invoice.
- **Found and fixed a real, previously-invisible bug while verifying the
  resize live**: `DialogContent`'s own base classes set `sm:max-w-lg`
  (512px). A caller's *unprefixed* `max-w-*` override (e.g. `max-w-4xl`)
  loses to that at desktop widths regardless of `className` order — same
  CSS specificity, and the `sm:` media-query rule sits later in the
  compiled stylesheet, so it wins. This silently capped **every dialog
  this session that tried to go wider than 512px** at 512px anyway,
  including both earlier passes at this exact invoice dialog and the
  `DocVerifyDialog` side-by-side preview built earlier today — neither
  ever actually got wider than the original small size, despite the
  `className` looking correct and the code visually "working" (there was
  just barely enough room in 512px for a cramped 2-column layout, so
  nothing looked obviously broken). Also found the identical pre-existing
  bug in `ComposeDrawer.tsx` (`max-w-2xl`), unrelated to anything built
  this session — fixed while already looking at the pattern. **Fix**: use
  the `sm:`-prefixed form (`sm:max-w-[900px]`, `sm:max-w-4xl`,
  `sm:max-w-2xl`) so tailwind-merge treats it as the same override slot as
  the base component's `sm:max-w-lg` and actually replaces it. Verified
  live by reopening the same invoice: dialog is genuinely ~900px now, full
  line-item descriptions visible, no horizontal scrollbar (there was one
  before the fix — caught mid-verification, not something a screenshot-only
  check would have shown as clearly).

## AdminAssets master-detail restructure — all 9 tabs (2026-08-28)

- **`/admin/assets` rebuilt from Tabs + card-list + per-entity modal
  `Dialog`s to the same select-then-edit-in-place flow as `AdminTrips.tsx`**:
  a left-pane searchable, view-mode-toggleable list of cards driving a
  persistent right-pane detail/edit panel, for all 9 tabs — Aircraft,
  Vendors, Airports, Countries, Persons, Expiry, Operators, Clients, Fees.
  No more click-to-open-modal for editing; clicking a card selects it and
  its form opens inline on the right, same as clicking a trip.
- **Two new shared components** carry this pattern everywhere it's needed
  next (Reference Data, Users): `src/client/components/ui/master-detail-list.tsx`
  exports `MasterDetailList` (search + view-mode toggle + selectable list,
  generic over item type) and `EntityListCard` (one presentational card that
  adapts to all 4 view modes — tile/large/small/details — so every entity
  tab only supplies icon/title/subtitle/meta/badges, not four hand-rolled
  layouts). `view-mode-toggle.tsx` (built earlier the same day for the
  Trips/AdminTrips card work) supplies the Tile/Large/Small/Details toggle
  itself, persisted per-list via a `viq_assets_<tab>_view` localStorage key
  — so each of the 9 tabs remembers its own view choice independently.
- **Add/Edit/Delete** all moved from the old modal dialogs into the
  right-pane panel: "Add X" opens a blank form in the same panel a
  selected item would use; each panel gets a Cancel / Delete / Save action
  bar (Delete only shown when editing an existing item, gated by the same
  `isAdmin`/`canEdit` rules the original dialogs used per tab).
- **Expiry tab** is the one non-editable tab (it's a roster-attention
  dashboard, not a CRUD entity) — kept the same select → detail flow for
  consistency (left list = flagged persons, right pane = their issues,
  read-only, with a "Full Profile" link to `/admin/persons/:id`) but with
  no Add button and no Save/Delete, since there's nothing to create or
  destroy there.
- **Persons tab** keeps a quick inline edit (Name/Role/Phone/Email/Licence)
  in the panel plus a "Full Profile" button linking out to
  `/admin/persons/:id` for passport/medical/ratings/docs — unchanged from
  the original dialog's scope, just relocated.
- **Fees tab** changed from grouped-by-country cards to a flat, searchable
  list (search matches fee type, country name, or ISO2) — simpler to fit
  the shared list-pane pattern; the country name/ISO2 still shows on every
  card.
- Verified live end-to-end: selected an aircraft and confirmed the inline
  edit panel populated correctly; switched Aircraft to Details (list) view;
  visited Persons (Full Profile link present) and Expiry (issue detail +
  link present, correctly no Add button); ran a full add→edit→delete round
  trip on Fees (added a Spain/VSAT/250 USD fee, confirmed it appeared in
  the list and auto-selected into edit mode, deleted it, confirmed the list
  returned to empty) — all against the real API, not a stub.
- **Deliberately out of scope for this pass**: Reference Data's 7 tabs and
  the Users page still use their original list UI — the user's request
  covered Assets' master-detail restructure specifically; the view-mode
  toggle for Reference Data/Assets/Users was a separate, still-open ask.
  `TripsPage.tsx` also still has its own locally-duplicated view-mode logic
  rather than using the new shared `view-mode-toggle.tsx` — not reconciled
  yet.

## View-mode toggle on Reference Data and Users (2026-08-28)

- **Reference Data's 7 tabs** (Airports, Countries, Country Rules, Aircraft,
  Providers, Service Types, Leg Purposes) and **the Users page** all gained
  the same Tile/Large/Small/Details toggle built for Trips/AdminTrips/
  AdminAssets — each list remembers its own view choice independently via
  its own localStorage key (`viq_reference_<tab>_view`, `viq_users_view`).
  None of these pages got the master-detail restructure (that was Assets-
  only) — Add/Edit/Delete/Deactivate stay exactly where they were (modal
  dialogs for Reference Data, the existing modal for Users); only how the
  list itself is displayed changed.
- **"Details" mode reuses each tab's existing `<Table>` verbatim** — no
  behavior change there, and it's still the default for every tab that
  defaulted to a table before (Airports/Countries/Rules/Service
  Types/Leg Purposes). **Aircraft and Providers default to "Large"**,
  which reuses their pre-existing card-grid layout verbatim — so nothing
  about the previous default view changed for any tab; the toggle is
  purely additive.
- Row-level actions (Edit/Delete/Deactivate buttons, Active/Inactive and
  permit-required badges) carry into the new Tile/Large/Small card views
  via the same `EntityListCard` component AdminAssets uses — except
  **"Small" (icon-only) view intentionally shows no action buttons**, on
  the same design call made for AdminAssets: small/icon view is for
  scanning, not editing; switch to another view to act on an item.
- Airports kept its existing 200-row render cap (33,908 real rows from the
  world-airport import) — the cap now applies to card views too, not just
  the table, so switching view modes on Airports can't reintroduce the
  render-freeze bug fixed earlier this session.
- Verified live: Airports Tile view renders the capped 200 rows correctly
  under the real 33,908-row dataset; Aircraft's default Large view is
  pixel-identical to the old hardcoded grid; Aircraft Small view renders;
  Service Types Tile view shows working Edit/Deactivate buttons and Edit
  correctly opens the existing dialog; Users page all 4 modes render with
  role/status badges and the edit pencil intact.

## Responsive foundation — desktop/tablet/mobile (2026-08-29)

Sub-project 1 of an open-ended "give the app a real desktop/tablet/mobile
UI/UX" initiative — Billing, Settings, and other one-off pages are separate,
not-yet-started follow-ups, decided one at a time the same way this one was.

- **New shared components**: `src/client/hooks/useMediaQuery.ts`
  (`useMediaQuery(query): boolean`, the one place in the client that reads
  breakpoint state in JS rather than pure CSS) and
  `src/client/components/ui/master-detail-shell.tsx` (`MasterDetailShell`)
  — desktop/tablet show a master-detail page's list+detail panes side by
  side (tablet just narrows the list pane), mobile (<768px) collapses to a
  bottom Sheet using `src/client/components/ui/sheet.tsx`, a fully-built
  shadcn/Radix component that had been sitting unused in this codebase
  until now.
- **`AdminTrips.tsx` and all 9 of `AdminAssets.tsx`'s tabs** migrated onto
  `MasterDetailShell`, replacing their hand-rolled fixed-width two-pane
  shells.
- **`useViewMode`** (`view-mode-toggle.tsx`) now auto-degrades the
  "Details" view choice to Tile below mobile width — without touching the
  user's actual stored preference, so it reverts to their real choice once
  the window widens again. Every existing caller (Reference Data's 7 tabs,
  AdminAssets' 9 tabs, Users) needed zero changes, since they all just
  branch on whatever the hook returns.
- **`NewTripWizard.tsx`**: a real gap found during planning — 12
  `grid-cols-N` instances had zero responsive prefixes (one was a bare
  `grid-cols-4`, cramming 4 columns onto a phone screen). All 12 now
  collapse sensibly below tablet/desktop width.
- **Action Board** (`Dashboard.tsx`) needed no changes — its `md:`
  breakpoint classes were already correct; this was a verification-only
  pass.
- **A real, load-bearing bug found and fixed during review**:
  `MasterDetailList`'s own root div hardcoded `w-96` (384px, plus
  `shrink-0`) — a leftover from before `MasterDetailShell` existed, when
  callers had no width-constraining wrapper and `MasterDetailList` had to
  self-determine its own width. Once `MasterDetailShell`'s wrapper became
  the width authority, the child's conflicting hardcoded width silently
  defeated the whole point of this work — tablet's narrower list pane
  would get clipped by `overflow-hidden`, and most phones (typically
  375-414px wide) would overflow a 384px-wide list. Fixed to `w-full` so
  the parent wrapper's responsive classes are authoritative.
- **Known environment limitation**: this session's browser automation
  cannot genuinely narrow the browser viewport (`resize_window` doesn't
  work here, and a CSS-zoom-based workaround was tried and confirmed not
  to affect `window.innerWidth` either) — so the actual tablet/mobile
  pixel-width CSS behavior (as opposed to JS-driven logic like the Sheet's
  open/close state, which *was* verified live via a `matchMedia`
  override) couldn't be visually screenshot-confirmed during this session.
  Every responsive class was verified by direct code review against
  Tailwind's well-established `md:`/`lg:` cascade behavior, and the one
  real defect this surfaced (`MasterDetailList`'s `w-96`) was caught and
  fixed specifically because a reviewer traced the mechanism rather than
  requiring a screenshot. **Recommended**: do one manual resize check in
  a real browser to confirm the bottom-sheet and narrowing behavior look
  right at real tablet/phone widths.

## VIQ Document Intelligence — Phase 1: Foundation (2026-08-29)

New, fully parallel `documents` data model and module — the foundation for
a multi-phase document ingestion/OCR/extraction/verification rebuild. This
phase adds no new UI and does not touch the existing `docs` module,
`DocAttachment` model, or `DocVerifyDialog.tsx`, all of which continue
working exactly as before.

- 7 new Prisma models: `Document`, `DocumentVersion`, `DocumentSection`,
  `DocumentEntityLink` (many-to-many owner links, replacing
  `DocAttachment`'s fixed 3-column single-owner shape),
  `DocumentFamily`/`DocumentTypeDefinition` (classification scaffolding,
  seeded with the 7 first-release document types), `DocumentProcessingJob`.
- New `POST /documents/upload` endpoint reusing the legacy module's
  MIME-allowlist + magic-byte validation approach, plus SHA-256 hashing
  for future duplicate detection.
- `bullmq` + `@nestjs/bullmq` job queue on the app's existing Redis
  connection; a stub processor proves the async status lifecycle
  (`UPLOADED → SECURITY_SCAN → QUEUED → READY_FOR_REVIEW`) end-to-end with
  no real OCR/extraction yet — that begins in Phase 2.
- `prisma/migrate-docattachment-to-documents.js` — a read-only,
  re-runnable script that backfilled every existing `DocAttachment` row
  into the new schema without modifying or deleting the originals.

## Multi-channel contacts — `ContactChannel` model (2026-08-30)

Sub-project 1 of 3 in the contact-channels overhaul — a settings
multi-provider backend and an in-app mail client are separate,
not-yet-started follow-ups. Replaces every single-value contact field on
Provider/Operator/Client/Person with a shared `ContactChannel[]` list, so
any entity can carry multiple typed entries (Email/Phone/SMS/WhatsApp)
instead of exactly one email and one phone.

- New `ContactChannel` Prisma model (table `contact_channels`,
  `prisma/schema.prisma`) — `channelType` (`'Email'|'Phone'|'SMS'|'WhatsApp'`),
  `value`, `label`, `preferred`, `forBilling`, `sortOrder`, and exactly one
  of `providerId`/`operatorId`/`clientId`/`personId` set per row (enforced
  in `ContactChannelsService`, not a DB constraint — same convention as
  `DocAttachment`'s owner-exclusivity). A `channels` back-relation was
  added to all four owner models.
- A hand-written migration
  (`prisma/migrations/20260828120000_add_contact_channels/migration.sql`)
  backfilled every pre-existing value into `contact_channels` before
  dropping the legacy columns: `providers.email`/`aog_contact`,
  `operators.email`/`phone`, `clients.contact_email`/`contact_phone`/
  `billing_emails` (an array column — `unnest()` produced one row per
  address, each marked `forBilling: true`), and `persons.phone`/`email` —
  8 scalar columns plus the `billing_emails` array, across the 4 entities.
  Every migrated single value was marked `preferred: true`, since it was
  the only value that entity had.
- A new shared `ContactChannelsService` (`src/server/modules/contacts/`,
  registered as a `@Global()` `ContactsModule` so no entity module needs to
  import it explicitly) does whole-list saves — `.replace(owner, channels)`
  deletes and recreates every row for that owner on each save, no separate
  CRUD routes — and exports `CONTACT_CHANNELS_INCLUDE`, the
  `orderBy: sortOrder` Prisma `include` fragment every entity read now
  attaches. `src/server/modules/reference/reference.service.ts` (Providers,
  Operators), `src/server/modules/clients/clients.service.ts`, and
  `src/server/modules/persons/persons.service.ts` all now read and write
  `channels` instead of the dropped columns.
- Client-side, `src/client/lib/dataStore.ts` gained the `ContactChannel`
  type plus `getPreferredContact(channels, type)` and
  `setPreferredChannelValue(channels, type, value)` helpers; every
  Provider/Operator/Client/Person mapper and save function now round-trips
  `Channels` instead of the old flat fields.
- A new shared `<ContactChannelEditor>` component
  (`src/client/components/ContactChannelEditor.tsx`) — a repeating add/
  remove/edit list (type, value, label, Preferred, and a Billing checkbox
  on Email rows) — replaced the single Email/Phone/AOG Contact/Billing
  Emails inputs in all four of `AdminAssets.tsx`'s detail panels (Vendors,
  Operators, Clients, Persons).
- Every other read/write site was updated to the new shape:
  `TripDetail.tsx`'s `VendorContactCard` now renders one clickable pill per
  channel (`tel:`/`sms:`/`mailto:`/`wa.me`) instead of a hardcoded
  phone+email pair, and its crew/pax register CONTACT column now calls
  `getPreferredContact`; `PersonDetail.tsx`'s biodata Phone/Email fields,
  `ComposeDrawer.tsx`'s Email recipient list, `ReferencePage.tsx`'s
  Providers tile and details views, and `NewTripWizard.tsx`'s quick-add
  person row all now read and write through `Channels` rather than the
  removed flat fields.

## What's not done yet

**The `dataStore.ts` → API rewire is complete.** Every transactional
resource (Trips/Legs/Stops/Services/Persons/Comms/Docs/Invoices/Audit) is
API-backed; only a handful of dead localStorage helpers remained by the end
(`getSettings`/`saveSettings`, `importBackup`, `resetToSeed`) and were
removed outright rather than migrated, since nothing in the app called them
meaningfully — `exportBackup`/`downloadBackup` stay as a read-only JSON
snapshot capability.

**Auth is now real multi-user with roles** (`docs/superpowers/specs/2026-08-26-viq-auth-roles-design.md`,
`docs/superpowers/plans/2026-08-26-viq-auth-roles.md`). A `User` Prisma
model backs login (`AuthService` looks up `prisma.user`, bcrypt-compares,
signs a JWT carrying `{ sub, username, role }`). Three roles — **Admin**
(user accounts, reference data, service-type catalog, message templates),
**Coordinator** (everyday trip/leg/service/comms/roster work), **Viewer**
(read-only everywhere) — enforced by a global `RolesGuard` alongside the
existing `JwtAuthGuard`: any non-`GET` request from a Viewer is rejected,
and routes tagged `@Roles('Admin')` reject anyone else. The former
`ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` env vars are now seed-time-only —
`prisma/seed.ts` inserts them as the first Admin `User` row (same bcrypt
hash, so existing credentials keep working unchanged) — `AuthService` no
longer reads them at runtime. A new `/admin/users` page (Admin-only,
nav-gated and route-guarded via a new `RequireRole` component) manages
accounts; deactivating a user (soft-delete only, no hard delete) blocks
their next login but doesn't revoke an already-issued token before its
12h expiry. `useAuth()` exposes `canEdit`/`isAdmin` booleans consumed
across every page's existing edit-toggle pattern to hide/disable
Edit/Add/Delete/Save controls for Viewer accounts (backend enforcement is
the real gate regardless — this is UX polish on top). Audit attribution
now uses the real logged-in username (`dataStore.ts`'s `currentUser()`
reads it from the stored session) instead of the literal string `"SYSTEM"`
every mutation used to record.

`AuthModule` registers `JwtAuthGuard` and `RolesGuard` globally (`APP_GUARD`
×2), so every route requires a bearer token and passes role checks by
default unless explicitly marked `@Public()` (only `POST /auth/login` is).
Tokens expire after 12h (`signOptions.expiresIn` in `auth.module.ts`). The
frontend's `apiFetch` (`src/client/lib/apiClient.ts`) attaches the stored
token to every call automatically, and dispatches a `viq:auth-expired`
window event on any `401` response (login itself uses a raw `fetch`, not
`apiFetch`, so every `401` seen here genuinely means an expired/invalid
token, never a login-attempt failure). `AuthProvider` (`authContext.tsx`)
listens for that event and calls its own `logout()`, which clears the
stored token — `RequireAuth.tsx`'s existing token-is-null check then
redirects to `/login` on its own, no separate redirect call needed.

Not done: self-service password reset/change (Admin resets via
`/admin/users`); server-derived (JWT-sourced) audit attribution — the
frontend-supplied username is trusted, deliberately, for this single
internal team's threat model; per-request re-validation of a deactivated
user's `active` flag (only checked at login, so an already-issued token
survives until it naturally expires).

## AI Continuation Guide

Use this section as the minimum context when another AI agent continues work.
There is one application folder and one package manifest. The React client is
in `src/client`; the NestJS server is in `src/server`; Prisma and PostgreSQL
live under `prisma`. Do not recreate the former split between `viq` and
`jetflow-api`, and do not add a second frontend package.

### Current product workflows

- `TripDetail.tsx` is the owning surface for trip information, operational
  stats, deadlines, leg selection, leg editing, services (PERMITS +
  HANDLING), messages, audit, billing, and the crew/PAX manifest.
- The ROUTE tab's leg navigation is a single `<select>` (one leg or none
  selected) — there is no register table and no expand-in-place card list
  (removed as duplicate navigation/clutter). Selecting nothing shows a
  read-only preview grid of every leg; selecting one leg shows its full
  detail panel below the selector, with a "CHANGE LEG" button to go back.
- A leg editor supports route endpoints, ETD/ETA, block hours, PAX, crew,
  callsign, purpose, route text, countries, and include/avoid FIR values.
- A service card has a checkbox and individual trash control. Selected cards
  can be removed with `REMOVE SELECTED`. All removals must call
  `deleteService()`; all edits must call `saveService()` so audit/localStorage
  behavior remains consistent.
- Service Save is disabled until the draft differs from its saved snapshot.
  The leg Save button follows the same rule. `Permit` remains the stored
  compatibility value but must display as `Landing Permit`.
- Trip information has a far-right Edit/Save control. Aircraft registry
  selection populates operator, ICAO type, MTOW, and serial metadata, which can
  be overridden for the current mission before saving.
- Country permit services are grouped so multiple legs can be selected and
  submitted under one country request reference. Each selected row shows route,
  PAX, crew, and purpose.
- `emailTemplates.ts` (`generateEmail`) is the one template source for both
  `ComposerPage.tsx` (standalone/manual) and `ComposeDrawer.tsx` (opened from
  a service card, vendor/template pre-filled). Overfly Permit / Landing
  Permit / Ground Handling always render as
  `{LABEL} {REQUEST|REVISION} - {TripID} - {Registration} - {COUNTRY NAME}`
  (full country name, all caps) with an ALL-CAPS body; Request vs. Revision
  is auto-detected from prior `Comm` history but always shown as an
  overridable toggle. These 6 templates (named `VIQ_*`, not vendor-branded —
  see "Country-specific message templates (Item 11)" below) are now
  country-overridable; every other template type stays hardcoded. Full
  contract in `ARCHITECTURE.md` under "Service request templates and admin
  history". The subject and body stay editable before sending. `Send & Log`
  creates an outbound `Comm` as `Status: Draft`, then
  `POST /comms/:commId/send` actually dispatches via SMTP and the `Comm`
  ends up `Sent` or `Failed` (with `ErrorMessage`) to match what really
  happened; `CommsPage.tsx` is the admin-visible sent-message history.

### Country-specific message templates (Item 11)

The 6 CAA-facing template types (`VIQ_OverflyRequest`/`Revision`,
`VIQ_LandingRequest`/`Revision`, `VIQ_GroundHandlingRequest`/`Revision` —
renamed from `UW_*`, since they were never actually tied to one specific
handling vendor) can now be overridden per country. Their default bodies
were also cleaned of vendor-specific text ("UNIVERSAL REFERENCE NBR" →
generic "REFERENCE NBR", the hardcoded `thirdparty@universalweather.com`
billing line → generic "SEE INVOICE INSTRUCTIONS ON FILE").

**One rendering mechanism for both default and override content.** The 6
defaults are expressed as `{{PLACEHOLDER}}`-format strings
(`DEFAULT_TEMPLATES` in `emailTemplates.ts`), the exact same format a
`MessageTemplate` DB override uses. A single `renderTemplate(str, vars)`
does literal `{{KEY}}` substitution for both — there's never a second
rendering path. `generateEmail()` stays fully synchronous: overrides join
the in-memory-cache-at-boot pattern 4e established
(`preloadReferenceData()` fetches `/message-templates` alongside
aircraft/providers/airports/countries/operators), so no async conversion
was needed despite adding a new DB-backed lookup.

New admin page `/admin/message-templates`
(`MessageTemplatesPage.tsx`) — country + template-type pickers, a
subject/body editor pre-filled with the existing override or the default,
a live preview rendered against sample placeholder data, "Reset to
Default" (deletes the override), and a list of which countries already
have an override for the selected type. New endpoints:
`GET/POST /message-templates`, `GET /message-templates/:countryIso2/:templateType`,
`PATCH/DELETE /message-templates/:id`. Full design in
`docs/superpowers/specs/2026-08-25-viq-message-templates-design.md`.

### Example service deletion behavior

```ts
selectedServiceIds.forEach((serviceId) => deleteService(serviceId));
setSelectedServiceIds([]);
onSaved();
```

Do not directly splice the component's `services` prop. The prop is a fresh
view from the data store after `onSaved()` causes a render.

### Validation commands

```powershell
npm run build:client
npm run build
npm run start:prod
Invoke-WebRequest http://localhost:4001/
Invoke-WebRequest http://localhost:4001/api/reference/aircraft
```

The last two requests should return HTTP 200. Prisma generation is part of
`npm run build`; if Windows reports an EPERM lock on the Prisma query engine,
stop stale `node`/`npm` processes and rerun the build. Do not reset the git
worktree or delete user data.

### Known boundaries

- Trips/Legs/Stops/Services/Comms/Service Types are API-backed (Prisma/
  Postgres) through `dataStore.ts`, as are Countries/Airports/Aircraft/
  Operators/Providers/CountryRules (see "Reference data durability (4e)"
  and "Reference Data search/filter/Excel" below — `CountryRule` was the
  last of these to gain write endpoints and an admin UI). Cities/
  ICAORules/DocTemplates/PriceList remain the frontend's bundled JSON
  (`refX` exports) — no admin CRUD UI exists for them yet; see "Data
  model" above for why `ServiceTypeDef` is the one reference resource
  that was never JSON-backed at all.
- Country/FIR suggestions are reference-data driven and route-country logic is
  centroid-based approximation, not true FIR polygon intersection.
- `Send & Log` sends real SMTP via `MailModule`/Nodemailer
  (`POST /comms/:commId/send`) and records the real `Sent`/`Failed` outcome —
  but only once `SMTP_*` env vars are configured with real credentials; with
  them blank (the default), sends correctly report `Failed`, not a false
  success.
- Real multi-user auth with Admin/Coordinator/Viewer roles now exists (see
  "What's not done yet" above) — the preview itself is still localhost-only
  quality.
