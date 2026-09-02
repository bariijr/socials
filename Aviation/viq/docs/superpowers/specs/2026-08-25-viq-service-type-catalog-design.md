# VIQ Admin-Configurable Service Type Catalog (Sub-project 3a, precedes the leg/services UI redesign)

## Context

Following the per-service compose work (sub-project 2b, `docs/superpowers/specs/2026-08-25-viq-compose-per-service-design.md`) and the message-template subject/body rewrite (implemented directly, no spec — see `ARCHITECTURE.md`'s "Service request templates and admin history"), the user asked for a redesign of how a leg's permits/handling services are displayed and edited in `TripDetail.tsx` (dropdown leg selector, a PERMITS list, a HANDLING list grouped by ICAO). While specifying that redesign, two of the user's example service types — **VIP Lounge** and **Crew Swap** — turned out not to exist in the current hardcoded `ServiceType` union (`Permit | Overflight | GroundHandling | Fuel | Catering | CrewTransport | Customs | Hotel | Slot | PPR | Visa | FlightPlanning`, duplicated as the `SERVICE_TYPES` array in `TripDetail.tsx`). The user's explicit instruction: add both as new types, **and** give an admin a way to add further categories through the app rather than hardcoding them — including per-type sub-variants (their example: Visa should support "Visa Required Prior to Arrival" vs "Visa on Arrival").

This is a real subsystem (new table, new CRUD API, new admin UI, and a ripple-through of every place that currently treats `ServiceType` as a fixed compile-time union), so it gets its own spec and plan, ahead of the leg/services UI redesign (**sub-project 3b**, to be spec'd separately once this lands — 3b will consume the `category`/`icao`/`variant` fields this spec adds).

Per explicit user instruction (carried over from every prior sub-project in this session): **do not `git commit` any of this work** — stage it for local preview only.

## Goal

An admin can, from the app (no code change, no redeploy), add a new service type (e.g. a future "Slot Coordination" category), give it a display label and a panel category (Permit / Handling / Other), optionally attach a small list of variants (sub-options a coordinator picks when assigning that service to a leg), and deactivate a type without deleting history that already uses it. Every place in the app that currently offers a fixed list of service types (the leg service-type dropdown in `TripDetail.tsx`, the email-template default lookup in `emailTemplates.ts`) reads from this catalog instead of a hardcoded array — with the three types that have real message templates (Permit, Overflight, GroundHandling) continuing to work exactly as they do today, and every other type (existing or newly admin-added) falling back to the existing `Generic` template, same as today's untemplated types.

## Design decisions (confirmed with user during brainstorming)

- **New reference table, not an extension of an existing one.** `ServiceTypeDef` is its own Prisma model, separate from `Provider`/`CountryRule`/etc. — it has no natural parent among the existing reference tables.
- **`Service.serviceType` stays a plain `String` column** (confirmed already true today — no Prisma enum exists on it), so adding rows to `ServiceTypeDef` and referencing new codes from `Service` is not itself a migration-breaking change. The only `Service` migration is two new nullable columns: `icao` and `variant` (both added now since sub-project 3b needs them, and adding them alongside this catalog work avoids a second migration back-to-back).
- **`icao`** — which airport within a leg a service belongs to (a leg has a departure and an arrival, and stops add more). Nullable, defaults to the leg's arrival ICAO at creation time (matches the existing implicit behavior: `generateArrivalServices` already always creates arrival-side Ground Handling and only creates departure-side Ground Handling "on request"; this field just makes that explicit and editable instead of unrecorded). Only meaningful for `LEG`/`STOP`-scoped services; `TRIP`-scoped services leave it null.
- **`variant`** — the selected variant `code` from that service's type's `variants` list (e.g. Visa → `ON_ARRIVAL`). Nullable; most types have no variants and this stays null for them.
- **`category`** on `ServiceTypeDef` is a plain string, not a Prisma enum, matching this project's established "string column, app-level constraint" pattern (`scopeType`, `status`, `urgency`, etc. all follow this already) — values `'Permit' | 'Handling' | 'Other'`, enforced in the DTO/service layer, not the database.
- **`variants` is `Json?`** — an array of `{ code: string; label: string }`. Kept denormalized on the type row (not a separate table) since variants are small, type-owned, and never queried independently of their parent type.
- **Soft delete only.** `active: Boolean @default(true)`. Deactivating a type removes it from the "add a new service" dropdown but never touches existing `Service` rows that already reference its code — their `ServiceType` string keeps rendering (falling back to the raw code as its own label if the def is inactive/missing, same defensive pattern `getCountry(iso)?.Name || iso` already uses elsewhere in this codebase).
- **Real CRUD API, not the bundled-JSON reference pattern.** Every other `/api/reference/*` endpoint (countries, airports, providers, etc.) reads static JSON seeded once (per the trip-core-rewire's explicit "reference-data reads stay bundled JSON" decision) — deliberately not runtime-editable. This catalog is the first reference data that must be editable by an admin without a redeploy, so it gets its own small module with real write endpoints, following the same DTO/service/controller shape as `TripsModule`/`ServicesModule` rather than the read-only `ReferenceModule` pattern.
- **No special auth handling needed.** `JwtAuthGuard` is already registered globally (`APP_GUARD` in `auth.module.ts`) and protects every route by default unless explicitly marked `@Public()` — confirmed neither `StopsController` nor `ReferenceController` carries that decorator, so both are already bearer-token-protected today, and the frontend's `apiFetch` already attaches the stored token to every call. `ServiceTypesController` follows the exact same (undecorated) pattern as `StopsController` — no `@Public()` on any route, including `GET /service-types`.
- **Admin UI lives on the existing `ReferencePage.tsx`** as a new tab, not a new page — that page is already the "browse all reference data" home (Airports/Countries/Country Rules/Aircraft/Providers tabs); Service Types is one more tab there, the only one with add/edit/deactivate controls instead of read-only tables.
- **Seed data**: the 12 existing hardcoded types become the initial rows (`category: 'Permit'` for Permit/Overflight; `'Handling'` for GroundHandling/Fuel/Catering/CrewTransport/Customs/Hotel/Visa; `'Other'` for Slot/PPR/FlightPlanning — Hotel is arguably borderline but grouped under Handling since it's arranged per-arrival-station like the rest of that group), plus the two new ones: `VIP_LOUNGE` (label "VIP Lounge", category Handling) and `CREW_SWAP` (label "Crew Swap", category Handling, distinct from the existing `CrewTransport` — confirmed by the user as a separate concept, not a rename). Visa's seed row gets `variants: [{code: "PRIOR", label: "Visa Required Prior to Arrival"}, {code: "ON_ARRIVAL", label: "Visa on Arrival"}]`. Every seeded `code` is the existing `ServiceType` string used verbatim today (`Permit`, `Overflight`, `GroundHandling`, `Fuel`, `Catering`, `CrewTransport`, `Customs`, `Hotel`, `Slot`, `PPR`, `Visa`, `FlightPlanning`) so existing `Service.serviceType` values keep resolving — the two new codes (`VIP_LOUNGE`, `CREW_SWAP`) are the only ones in the new snake-case style, since nothing existing needs to match them. **`label` for the `Permit` row is seeded as `"Landing Permit"`** (not "Permit") — this is what lets `TripDetail.tsx`'s label lookup (below) replace today's hardcoded `type === 'Permit' ? 'Landing Permit' : type` special case with a plain def lookup. Every other seeded row's `label` is its code with normal word-spacing (e.g. `GroundHandling` → "Ground Handling", `CrewTransport` → "Crew Transport", `FlightPlanning` → "Flight Planning").
- **`emailTemplates.ts` is not restructured by this slice.** `SERVICE_TYPE_TO_TEMPLATE`, `ACTION_TEMPLATE_PAIRS`, `hasRequestRevisionToggle`, `defaultTemplateFor` etc. (already shipped) stay keyed by the three core codes (`Permit`, `Overflight`, `GroundHandling`) plus the existing named fallbacks (`Fuel`, `Catering`, `CrewTransport`, `Customs`, `Hotel`) — any type not in that map (every admin-added type, including `VIP_LOUNGE`/`CREW_SWAP`) resolves to `'Generic'`, exactly like today's untemplated `Slot`/`PPR`/`Visa`/`FlightPlanning` already do. Writing real message templates for arbitrary future admin-added types isn't possible ahead of time and is out of scope.

## Backend

### `ServiceTypeDef` Prisma model

```prisma
model ServiceTypeDef {
  code      String   @id
  label     String
  category  String                    // 'Permit' | 'Handling' | 'Other'
  variants  Json?                     // Array<{ code: string; label: string }>
  active    Boolean  @default(true)
  sortOrder Int      @default(0) @map("sort_order")

  @@map("service_type_defs")
}
```

### `Service` gains two nullable columns

In the existing `Service` model, immediately after `countryIso2`:

```prisma
  icao    String?
  variant String?
```

Both migrations (`ServiceTypeDef` creation + the two `Service` columns) ship as one Prisma migration.

### Seed

`prisma/seed-data/service-type-defs.json` (new file, same directory as the other seed JSON) — one entry per type as listed above. `prisma/seed.ts` gets a new upsert loop over this file, following the exact pattern already used there for the other reference tables.

### New `ServiceTypesModule`

`src/server/modules/service-types/` — `service-types.module.ts`, `service-types.controller.ts`, `service-types.service.ts`, `dto/create-service-type.dto.ts`, `dto/update-service-type.dto.ts`. Routes:

- `GET /service-types` — all rows, `active` ones first then inactive, ordered by `sortOrder`. No auth guard (matches the rest of `/api/reference/*`).
- `POST /service-types` — create (admin). Body: `code, label, category, variants?, sortOrder?`.
- `PATCH /service-types/:code` — update any field including `active` (this is how deactivation works — no `DELETE` route, since existing `Service` rows must keep referencing the code).
- Registered in `app.module.ts` alongside the other feature modules; DTOs validate `category` is one of the three allowed strings via `class-validator`'s `@IsIn`.

### `Service` DTOs

`create-service.dto.ts`/`update-service.dto.ts` gain optional `icao`/`variant` string fields, same shape as the existing optional `countryIso2`.

## Frontend

### `dataStore.ts`

New functions, same async/API-backed shape as every other resource converted in the trip-core-rewire and per-service-compose slices:

```typescript
export async function getServiceTypes(): Promise<ServiceTypeDef[]> {
  return apiJson<ServiceTypeDef[]>('/service-types');
}
export async function saveServiceType(def: ServiceTypeDef): Promise<ServiceTypeDef> {
  const exists = (await getServiceTypes()).some((d) => d.code === def.code);
  const body = JSON.stringify(def);
  return exists
    ? apiJson<ServiceTypeDef>(`/service-types/${def.code}`, { method: 'PATCH', body })
    : apiJson<ServiceTypeDef>('/service-types', { method: 'POST', body });
}
```

### `src/client/data/types.ts`

New interface:

```typescript
export interface ServiceTypeDef {
  code: string;
  label: string;
  category: 'Permit' | 'Handling' | 'Other';
  variants?: { code: string; label: string }[];
  active: boolean;
  sortOrder: number;
}
```

`Service` gains `ICAO?: string; Variant?: string;` (matches the existing `CountryISO2?: string` optional-field style).

`ServiceType` stops being a closed union — it becomes `string` (the value now comes from `ServiceTypeDef.code` at runtime, not a compile-time-checked set). Every place that currently does `ServiceType | string` compatibility juggling (there's already some, e.g. `serviceLabel(type: ServiceType | string)` in `TripDetail.tsx`) simplifies since both sides of the union collapse to the same type. `SERVICE_TYPE_TO_TEMPLATE`'s `Record<ServiceType, TemplateType>` in `emailTemplates.ts` becomes `Partial<Record<string, TemplateType>>` with a `?? 'Generic'` fallback at every lookup site (there are three: `SERVICE_TYPE_TO_TEMPLATE[service.ServiceType]`, `defaultTemplateFor`'s fallback branch, and `hasRequestRevisionToggle`'s three-way check, which stays a plain string comparison and needs no change).

### `TripDetail.tsx`

- Fetch `serviceTypes` once via `getServiceTypes()` in the main `TripDetail` component's load effect (alongside `getTripSheet`), pass down to `LegEditor`/`ServiceInlineEditor` as a prop — same threading pattern already used for `comms` (per the just-shipped per-service-compose work).
- Delete the hardcoded `SERVICE_TYPES` array; the service-type `<select>` in `ServiceInlineEditor` renders `<optgroup>`-style groups by `category` (Permit / Handling / Other) from the fetched, active-only list, sorted by `sortOrder`.
- Replace `serviceLabel()`'s hardcoded `type === 'Permit' ? 'Landing Permit' : type` with a lookup against the fetched defs (`defs.find(d => d.code === type)?.label ?? type`), preserving the existing `Permit` → `Landing Permit` display rule as that type's seeded `label`.
- When the selected type has `variants`, `ServiceInlineEditor` shows a second `<select>` for `draft.Variant`, populated from that type's `variants` list; hidden otherwise.
- New services created via `addService()` (in `LegEditor`) get `ICAO: iso ? undefined : leg.ArrICAO` — country-scoped services (permits) leave `ICAO` unset (they're keyed by country, not airport); leg-level services default to the leg's arrival ICAO, editable afterward like every other service field.

### `ReferencePage.tsx`

New "Service Types" tab. Table view (code, label, category, variant count, active toggle) plus an add/edit form (inline row or a small dialog — implementer's call, matching whatever this page's existing edit affordances look like, though today the page has none; use the same `Dialog` primitive `ComposeDrawer.tsx` already uses for consistency) for code/label/category/variants/sortOrder. `active` toggles via the `PATCH` endpoint; no delete UI, matching the "soft delete only" decision above.

## Testing

No test framework in this project — manual verification, same pattern as every prior slice:

```powershell
npm run build
npm run start:prod
# 1. GET /api/reference/service-types — confirm the 14 seeded rows (12 existing + VIP_LOUNGE + CREW_SWAP), Visa has 2 variants.
# 2. POST a new type via the admin UI, confirm it appears in TripDetail's service-type dropdown under the right category.
# 3. Add a service of the new type to a leg, save, confirm ICAO defaults to the leg's arrival ICAO and is editable.
# 4. Pick Visa on a service, confirm the Variant dropdown appears with the two seeded options; save and reload, confirm it persists.
# 5. Deactivate a type via PATCH active=false, confirm it drops out of the "add service" dropdown but a leg that already has a service of that type still renders its label correctly.
# 6. Confirm ComposeDrawer/ComposerPage still work unchanged for Permit/Overflight/GroundHandling, and show 'Generic' for VIP_LOUNGE/CREW_SWAP (no template exists for them yet, matching Slot/PPR/Visa/FlightPlanning today).
```

## Out of scope

- The leg/services UI redesign itself (dropdown leg selector, PERMITS list, HANDLING-by-ICAO grouping) — sub-project 3b, spec'd separately once this lands.
- Writing real UW-style message templates for `VIP_LOUNGE`/`CREW_SWAP` or any future admin-added type — they use `Generic` until someone explicitly extends `emailTemplates.ts` for them, same as today's untemplated types.
- A delete (hard-remove) UI for service types — soft-deactivate only, to protect history.
- Reordering the `Permit`/`Overflight`/`GroundHandling` types' behavior in any way — their `emailTemplates.ts` wiring, `ACTION_TEMPLATE_PAIRS`, and Request/Revision toggle are untouched by this slice.
- Migrating any other bundled-JSON reference data (countries, airports, providers, etc.) to real CRUD — this pattern is deliberately introduced only for service types, per the explicit user request; it does not imply the others should follow.

## Do not

- Do not `git commit`.
- Do not make `category` or `variants` a Prisma enum/typed column — both stay app-level-constrained strings/JSON, matching this project's established pattern for every comparable field.
- Do not remove or rename the `CrewTransport` service type — `CrewSwap` is confirmed as a separate, new type, not a replacement.
- Do not restructure `emailTemplates.ts`'s existing Request/Revision logic — only its lookup fallback typing changes (`Record<ServiceType,...>` → `Partial<Record<string,...>>` with a `?? 'Generic'` default).
