# VIQ — Aircraft/Operator Expansion & Bill-To Resolution

Status: Approved, ready for implementation plan.
Date: 2026-08-25

## Problem

`AdminAssets.tsx`'s `AircraftDialog` (made API-backed in 4e) collects only
5 fields (registration, ICAO type, manufacturer, MTOW, noise cert).
`Aircraft.currentOperatorId` is a loose nullable string with no real
relation and no UI to manage operators at all — `Operator` has no CRUD
anywhere in the app. There is also no "bill to" concept anywhere: `Trip`
has only a plain `client` name string, `Invoice` has no address field,
and `BillingPage.tsx` never displays one.

This sub-project:
1. Makes the Aircraft → Operator link a real, required Prisma relation.
2. Expands aircraft registration to collect operation type, colors,
   serial number, and the performance-override fields that already exist
   in the schema (from 4e) but aren't in the dialog yet.
3. Gives `Operator` its first CRUD UI.
4. Adds a bill-to-address resolution chain: an explicit per-trip override,
   falling back to the aircraft's linked operator's billing address.

Explicitly out of scope (deferred to the next sub-project, per user
decision): expanded document upload/OCR (DOCX, TIFF, protected-PDF,
PDF OCR) and new `AircraftDetail.tsx`/`OperatorDetail.tsx` pages to host
that document collection. This sub-project stays within the existing
`AdminAssets.tsx` dialog pattern.

## Discovery

Checked before designing (`prisma/schema.prisma`, live API via curl):
- All 6 currently-seeded aircraft already have a valid `currentOperatorId`
  pointing at a real `Operator` row — making the relation required and
  NOT NULL needs no backfill.
- All 7 seeded operators already have both `address` and `billingAddress`
  populated — the bill-to fallback chain has real data to resolve against
  from day one.
- `Aircraft.serialNumber`, `maxRangeOverrideNm`, `fuelBurnOverrideKgPerHour`
  already exist as columns (added in earlier sessions / 4e) but are not
  exposed in `AircraftDialog`'s form — no new columns needed for those,
  just surfacing.
- No Operator CRUD exists anywhere (`AdminAssets.tsx` has no Operator
  tab/dialog) — this is new, not an extension of existing UI.
- No bill-to-address concept exists anywhere in the app today (`Invoice`
  has no address field; `BillingPage.tsx` shows only `trip.Client` a name
  string) — this sub-project is the first thing to store or display it.

## Schema changes

```prisma
model Aircraft {
  // ...existing fields...
  currentOperatorId String  @map("current_operator_id")   // was String?
  colors            String?
  operationType     String? @map("operation_type")

  operator Operator @relation(fields: [currentOperatorId], references: [operatorId])
  // ...existing `type` relation, `@@map("aircraft")`...
}

model Operator {
  // ...existing fields, unchanged...
  aircraft Aircraft[]   // new reverse relation
}

model Trip {
  // ...existing fields...
  billToAddress String? @map("bill_to_address")
  // ...
}
```

`operationType` is a plain optional string (e.g. "Part 91", "Part 135",
"Charter", "Private", "Cargo") — not an enum, matching how `Aircraft.status`
and `Trip.operationType` already work as free text in this codebase. No
new `Operator` field for a "default bill-to address" — `billingAddress`
(existing) already serves that role, falling back to `address` (existing)
if ever blank; both are populated on every seeded operator today.

Migration: `--create-only` (not a purely-additive migration like 4e's — this
one changes nullability and adds a relation on `Aircraft.currentOperatorId`).
Confirmed safe to apply directly, no hand-editing needed: every one of the
6 seeded aircraft rows already carries a `currentOperatorId` matching a
real row in the 7 seeded operators (`OP-001` through `OP-007`, cross-checked
directly against both live lists during discovery) — so `ALTER COLUMN
current_operator_id SET NOT NULL` and `ADD CONSTRAINT ... FOREIGN KEY
(current_operator_id) REFERENCES operators(operator_id)` both succeed
against current data with nothing to backfill or reorder. Still read the
actual generated SQL before running `prisma migrate deploy`, as a final
sanity check — but no data-preserving reordering is expected to be needed,
unlike 4d-1's Person migration.

## Backend

**New `Operator` CRUD** (`src/server/modules/reference/`, same module as
the other four resource types, since `GET /reference/operators` already
lives there): `CreateOperatorDto`/`UpdateOperatorDto` (name, type, address,
email, phone, primaryContact, billingAddress, paymentTerms, status, notes
— `fleet` stays server-derived/read-only, never client-writable, since
it's redundant with the new `Aircraft.currentOperatorId` relation and
keeping both in sync would be two sources of truth for the same fact).
`POST/PATCH/DELETE /reference/operators(/:operatorId)`. Delete guards
against an operator that still has aircraft assigned — same `P2003`
catch-and-rethrow-as-400 pattern 4e established for `Country`, since the
new `Aircraft.currentOperatorId` relation has no `onDelete: Cascade`.

**Aircraft**: `CreateAircraftDto.currentOperatorId` changes from optional
to required. New optional `colors`/`operationType` fields. `aircraft()`/
`aircraftByRegistration()`/`resolveAircraft()` in `reference.service.ts`
gain `include: { operator: true }` alongside the existing `include: {
type: true }`, so operator name/billing address travel with every fetch
without a second round-trip.

**Trip**: `CreateTripDto`/`UpdateTripDto` gain optional `billToAddress`,
following the exact pattern already used for `supportRef` (plain optional
string, no special handling).

## Frontend

**New Operators tab** in `AdminAssets.tsx` (sibling to Aircraft/Vendors/
Airports/Countries/Persons/Expiry) — `OperatorDialog` follows the same
add/edit/delete pattern as `CountryDialog`/`AirportDialog`. `dataStore.ts`
gains `getOperatorList()`/`saveOperator()`/`deleteOperator()` plus a
`mapOperatorFromApi`, joining the in-memory-cache pattern 4e established
(cached at app boot via `preloadReferenceData()`, which gains a 5th
parallel fetch).

**`AircraftDialog`** gains: a required Operator `<Select>` (sourced from
`getOperatorList()`, blocks Save while unset — enforces "every aircraft
needs an operator" at the UI layer, matching how the DTO enforces it at
the API layer), Colors (text), Operation Type (text), Serial Number
(text — field already existed on the model, just missing from this form),
Max Range Override / Fuel Burn Override (number — same story). `saveAircraft`
in `dataStore.ts` gains these fields to its existing payload construction.
`mapAircraftFromApi` gains `Colors`/`OperationType`/an `Operator` object
(from the now-included relation) to the client `Aircraft` type.

**Bill-to resolution**: `resolveBillToAddress(trip: Trip): string | undefined`
in `dataStore.ts` — `trip.BillToAddress ?? operatorFor(trip)?.BillingAddress
?? operatorFor(trip)?.Address`, where `operatorFor(trip)` looks up the
aircraft by `trip.Registration` (via the now-cached `getAircraftList()`)
and then the operator by that aircraft's linked operator id (via the now-
cached `getOperatorList()`) — both synchronous cache reads, no new fetch.
`NewTripWizard.tsx` gains an optional "Bill To Address" text field
(defaults empty — empty means "use the fallback", following the same
`supportRef` pattern). `TripDetail.tsx`'s `TripInfoEditor` gains the same
field so it's editable after creation, not just at creation time.
`BillingPage.tsx`'s invoice detail view gains a "Bill To" block (in the
header area, next to the existing Trip/Client line) showing the resolved
address — the first place this concept is ever displayed in the app.

## Testing / verification plan

Same rhythm as every prior sub-project:
1. Read the actual Prisma-generated migration SQL for the
   `currentOperatorId` nullability + relation change before applying it —
   confirm it's non-destructive given all 6 rows already have valid values.
2. `npx tsc --noEmit` (both configs), `npx nest build`,
   `npm run build:client` — all clean.
3. Live API verification via curl + JWT: full Operator CRUD lifecycle;
   create an aircraft requiring `currentOperatorId` (confirm a request
   omitting it is rejected by validation); confirm `GET
   /reference/aircraft` now includes the `operator` object; attempt to
   delete an operator with aircraft assigned (expect 400, same shape as
   4e's country guard); create a trip with an explicit `billToAddress`
   and one without, confirm the client-side resolution helper picks the
   right value for each.
4. Clean up all throwaway rows, confirm counts return to baseline.

## Explicitly out of scope

- Expanded document upload/OCR (DOCX/TIFF/protected-PDF/PDF-OCR) — next
  sub-project.
- `AircraftDetail.tsx`/`OperatorDetail.tsx` pages — deferred to that same
  next sub-project, since that's what actually needs them (a docs-hosting
  surface). This sub-project's new fields stay in the existing dialog.
- `Operator.fleet` stays read-only/server-derived — no UI to hand-edit it,
  avoiding a second source of truth against the new `Aircraft.currentOperatorId`
  relation.
- A real invoice PDF/print template — `BillingPage.tsx`'s in-app "Bill To"
  block is the only display surface built here.
