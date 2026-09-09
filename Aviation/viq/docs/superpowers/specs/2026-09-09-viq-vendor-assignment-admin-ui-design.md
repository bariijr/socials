# VIQ Vendor Assignment Engine — Sub-Project 3a: Admin Management UI

**Source:** [2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md](2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md)
(§34-41: central Vendor Assignment workspace, Client Profile Vendor
Preferences, "one source of truth" mandate — same underlying records,
multiple entry points, no duplication)

**Depends on:** sub-project 1 (`VendorAssignment` model + CRUD API +
resolver, shipped) and sub-project 2 (live wiring, shipped). This spec
adds **zero server changes** — `POST/GET/PATCH /vendor-assignments` and
`GET /vendor-assignments/:id` already exist, are tested, and are
sufficient for everything below.

## 0. Scope correction from the original sub-project 3 decomposition

The design spec that first decomposed sub-project 3 (in
[2026-09-08-viq-vendor-assignment-resolver-design.md](2026-09-08-viq-vendor-assignment-resolver-design.md)
§1) assumed a dedicated "Client Profile" page would need to be built as
a prerequisite for a "Vendor Preferences" tab. That assumption was
wrong: `AdminAssets.tsx` already has a "Clients" tab with a `ClientPanel`
detail editor (and a "Vendors" tab with `ProviderPanel`) — these already
serve as the Client/Vendor profile entry points the source document
wants. No new page is needed; this sub-project is smaller than
originally scoped.

Sub-project 3 was also split at brainstorming time into 3a (this spec —
the management UI) and 3b (the Change Vendor workflow, source §28-29,
§57-59 — not designed yet, queued next).

## 1. New "Vendor Assignments" tab

Added to `AdminAssets.tsx`'s existing `<Tabs>` alongside `authorizations`
(the closest existing precedent — `AuthorizationsTab` in
`AdminAuthorizations.tsx`). Follows that exact structure:

- A `VendorAssignmentsTab` component (new file
  `src/client/pages/admin/AdminVendorAssignments.tsx`, mirroring
  `AdminAuthorizations.tsx`'s file-per-tab convention) using
  `MasterDetailShell`/`MasterDetailList`/`EntityListCard`/`DetailPanel`
  — the same shared UI grammar every other tab in this file already
  uses.
- List filters: Client, Country, Service Type — the three dimensions
  `GET /vendor-assignments` already accepts as query params
  (`clientId`, `countryIso2`, `serviceType`) per sub-project 1's
  `VendorAssignmentsController`. No new server-side filter support
  needed.
- `EntityListCard` per row shows: Provider name, context summary
  (Country/ICAO/Client, whichever are set), and badges for
  Preferred/Rank/Prohibited/inactive-if-`active:false`.
- Create/edit form fields, with the same disabled-state logic the
  server's `validate()` already enforces (source of truth stays
  server-side; the form just avoids submitting requests guaranteed to
  fail):
  - Provider (`<Select>`, required, options from `getProviderList()` —
    the same cached getter `ProviderPanel` itself already populates from)
  - Service Type (text input, required — matches `Service.serviceType`
    being a plain string throughout this codebase, not a dedicated enum)
  - Country (optional `<Select>`, options from `getCountryList()` —
    same getter `AuthorizationPanel` already uses)
  - Airport ICAO (optional text input, uppercased on change — matches
    `ProviderPanel`'s existing `Scope` field convention)
  - Permit Type (optional text input)
  - Client (optional `<Select>`, options from `getClientList()` — same
    cached getter `AdminAssets.tsx`'s own Clients tab already populates
    from — omitted means "general rule", per source §7)
  - Preferred (checkbox)
  - Rank (number input, **disabled when Prohibited is checked** —
    mirrors the server's "rank required unless prohibited" rule)
  - Prohibited (checkbox, **disabled when Preferred is checked and
    vice versa** — mirrors the server's mutual-exclusion rule)
  - Active (checkbox, default true)
  - Effective From / Effective Until (optional dates)
  - Notes (text input)
- Save calls the existing `POST`/`PATCH /vendor-assignments` endpoints
  (new `dataStore.ts` functions `getVendorAssignmentList`,
  `saveVendorAssignment`, mirroring `getPermitAuthorizationList`/
  `savePermitAuthorization`'s exact shape).
- A duplicate/self-contradiction rejection from the server (e.g. two
  identical rows, or preferred+prohibited both true) surfaces as a
  visible inline error in the form — the server already returns a
  `BadRequestException` with a message; display it, don't swallow it.

## 2. Client Profile "Vendor Preferences" section

A new read-only section added to `ClientPanel` (in `AdminAssets.tsx`),
rendered below the client's existing fields whenever a client is
selected (not shown in "Add Client" mode, since a brand-new client has
no `clientId` yet to filter by):

- Fetches `GET /vendor-assignments?clientId=<selected client's ID>` on
  mount / whenever the selected client changes.
- Renders each row as: Provider name — context (Country/ICAO/Service
  Type) — Preferred/Rank or "DO NOT USE" if prohibited.
- Empty state: "No client-specific vendor overrides — this client uses
  the general rules."
- No inline editing here in this pass (source §50 describes an
  "Add Override" shortcut from this view; deferred — see §4).

## 3. Data layer additions

`src/client/lib/dataStore.ts`:

```typescript
export interface VendorAssignment {
  ID: string;
  ProviderID: string;
  CountryISO2?: string;
  ICAO?: string;
  ServiceType: string;
  PermitType?: string;
  ClientID?: string;
  Preferred: boolean;
  Rank: number | null;
  Prohibited: boolean;
  Active: boolean;
  EffectiveFrom?: string;
  EffectiveUntil?: string;
  Notes?: string;
}

export async function getVendorAssignmentList(filters: { clientId?: string; countryIso2?: string; serviceType?: string } = {}): Promise<VendorAssignment[]>;
export async function saveVendorAssignment(a: Omit<VendorAssignment, 'ID'> & { ID?: string }, user?: string): Promise<VendorAssignment>;
```

Unlike `getPermitAuthorizationList`/`getCountryList`/`getOperatorList`
(which read from a preloaded synchronous cache populated once at app
boot), `getVendorAssignmentList` is a plain async fetch each time it's
called — `VendorAssignment` rows change more often relative to page
visits than the largely-static reference data those caches serve, and
this tab's own list/filter re-fetch is the natural refresh point. This
matches how `getServicesForTrip`/`getTasks` etc. already work elsewhere
in this codebase (plain per-call fetch, no cache), rather than
introducing a new caching pattern for one tab.

## 4. Explicitly out of scope for this pass

- Change Vendor workflow (sub-project 3b, separate design).
- Multi-vendor RFQ workflow (sub-project 4).
- Bulk client assignments (source §51 — explicitly optional in the
  source doc itself).
- "Add Override" shortcut directly from the Client Profile section
  (source §50) — the section is read-only for this pass; adding one
  requires either cross-tab state plumbing or a local dialog, neither
  of which is needed for the section to be useful as a viewer.
- "View Assignments" section on `ProviderPanel` (source §38's other
  mentioned entry point) — the Client Profile section covers the more
  commonly-needed direction (an operator asking "what does this client
  get"); a vendor-side view is a small, separable follow-up if it turns
  out to matter.
- Conflict/duplicate validation UI beyond surfacing the server's
  existing error message (source §52-53's fuller "warn on unusual
  configurations before submit" UX) — the server-side rejection already
  prevents bad data; a friendlier pre-submit warning is a polish item.

## 5. Testing

No client test framework exists in this project (established
convention). Verification is `npm run build:client` plus a manual
dev-server check: create a Vendor Assignment row through the new tab,
confirm it appears in the list and filters correctly, confirm the
Client Profile section shows it for the right client, confirm the
server's validation errors (e.g. submitting both Preferred and
Prohibited) surface visibly rather than failing silently.
