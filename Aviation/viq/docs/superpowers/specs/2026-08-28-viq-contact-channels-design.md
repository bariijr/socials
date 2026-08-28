# VIQ Multi-Channel Contacts (Provider/Operator/Client/Person)

## Context

This is sub-project 1 of a larger request: wire up the 3 dead AdminSettings
tabs (SMTP/IMAP, Messaging, Notifications) with multi-provider support
including ARINC/SITA/AFTN, plus an in-app mail client. That work is deferred
to sub-projects 2 and 3 — this spec covers only the contact-data foundation
they'll both depend on.

**Current state**: `Provider`, `Operator`, and `Client` each have a single
`email`/`phone` (or `contactEmail`/`contactPhone`) column. `Client` also has
a separate `billingEmails: String[]` used only for invoice delivery.
`Person` has its own single `phone`/`email` columns, unrelated to the other
three. There is no real multi-contact storage anywhere: `ComposeDrawer.tsx`
computes recipients from `Provider.Contacts`, a client-side array that looks
multi-entry but is synthesized from the single `email` column on every read
(`dataStore.ts:1295`, `Contacts: [{ Label: 'Primary', Email: p.email ?? '' }]`)
— it has never actually stored more than one contact.

Confirmed with the user during brainstorming:

- **Four entities get this**: Provider (Vendors tab), Operator, Client,
  and Person — added to the original three mid-brainstorm.
- **Four fixed channel types**: Email, Phone, SMS, WhatsApp. No open-ended
  "Other" type, no ARINC/SITA/AFTN entries here (those stay scoped to the
  settings-tab provider registry in sub-project 2, as a data-model
  placeholder with no live send/receive — confirmed separately).
- **`preferred` is per-entry, not a single enum** — an entity can have
  more than one preferred channel at once (e.g. prefer both an email and a
  WhatsApp number).
- **Billing designation is also per-entry, on any entity** — superseding an
  earlier answer to keep `Client.billingEmails` separate. Any Email-type
  `ContactChannel` row, on any of the four entities, can be flagged
  `forBilling`. `Client.billingEmails` is removed; its values migrate in
  as `forBilling: true` Email entries.
- **Legacy fields are replaced, not kept alongside** — the old singular
  columns are dropped after migrating their values in as the first
  (`preferred: true`) entry, and every call site that reads them is
  updated to read `ContactChannel` instead.

## Goal

Every Provider, Operator, Client, and Person can carry zero or more typed
contact entries (Email/Phone/SMS/WhatsApp), each independently markable as
preferred and/or (for Email) for-billing use — replacing today's
single-value fields everywhere they're read.

## Design decisions

- **One shared `ContactChannel` table, not four.** Four optional owner
  FKs — `providerId?`, `operatorId?`, `clientId?`, `personId?` — with the
  app enforcing exactly one is set per row. This mirrors the existing
  `DocAttachment` pattern already in this codebase (`docs.service.ts`'s
  `upload()` already enforces "exactly one of tripId/personId/
  aircraftRegistration" the same way), so it's a consistent convention
  rather than a new one, and it gives real DB referential integrity
  (`onDelete: Cascade` per relation) without four near-identical tables,
  DTOs, and services.
- **Fields**: `id` (autoincrement), `channelType` (`Email`|`Phone`|`SMS`|
  `WhatsApp`), `value` (string), `label` (optional string — "Ops desk",
  "AOG line"), `preferred` (bool, default false), `forBilling` (bool,
  default false — only meaningful on Email rows, but stored generically
  rather than adding a type-conditional column), `sortOrder` (int, for
  stable display order).
- **Whole-list replace on save, not incremental CRUD endpoints.** Every
  entity's existing save flow already replaces the full record
  (`saveProvider`/`saveOperator`/`saveClient`/`savePerson` are upsert-style,
  matching how `Provider.ServiceTypes` and `Operator.Fleet` scalar arrays
  are already handled). Contacts follow the same shape: the save payload
  includes the full `channels` array, and the service does
  delete-all-existing-for-this-owner + insert-the-new-set inside the same
  transaction. No separate `/contacts` CRUD routes — these lists are small
  (a handful of entries per entity) and always edited as a unit in the UI,
  so a dedicated incremental API would be unused complexity.
- **Migration** (one Prisma migration, applied via `migrate deploy` per
  this project's established non-interactive workflow): for each of
  `Provider.email`, `Provider.aogContact`, `Operator.email`,
  `Operator.phone`, `Client.contactEmail`, `Client.contactPhone`, and
  `Person.phone`/`Person.email`, a non-null value becomes one
  `ContactChannel` row (`preferred: true`, correct `channelType`). Every
  entry in `Client.billingEmails[]` becomes an Email row with
  `forBilling: true` (and `preferred: false` unless it happens to also be
  the contact email). The seven legacy columns and `billingEmails` are
  then dropped.

## UI changes

- **`AdminAssets.tsx`'s four detail panels** (Vendor/Operator/Client/
  Person — all already inline edit panels from this session's earlier
  master-detail restructure) each gain a repeating contact-entry editor:
  per row, a channel-type select, a value input, an optional label input,
  Preferred and (Email-only) For Billing checkboxes, and a remove button;
  an "Add Contact" button appends a blank row. This replaces each panel's
  existing single Email/Phone fields.
- **`ComposeDrawer.tsx`** — recipient computation changes from unwrapping
  the fake single-entry `Contacts` array to filtering the provider's real
  `channels` for `channelType === 'Email'`.
- **`ReferencePage.tsx`'s Providers card** — the `Email`/`AOGContact` line
  in tile/large views becomes a rendered summary of the provider's
  channels (preferred entries first).
- **`NewTripWizard.tsx` / `TripDetail.tsx`** — wherever these read
  `Operator.email`/`.phone` or `Client.contactEmail`/`.contactPhone` for
  autofill or display, switch to the entity's preferred Email/Phone
  channel (falling back to the first entry of that type if none is
  marked preferred).
- **`dataStore.ts`** — the `mapProviderFromApi`/`mapOperatorFromApi`/
  `mapClientFromApi`/(person mapper) functions gain a `channels` field
  from the API response; the `Provider.Contacts` synthetic field is
  removed outright (not kept as a compatibility shim) now that
  `ComposeDrawer.tsx` reads `channels` directly.

## Out of scope for this sub-project

- Any live send/receive integration (SMTP/IMAP/WhatsApp/SMS/ARINC/SITA/
  AFTN provider wiring) — sub-projects 2 and 3.
- Notification routing logic that picks a channel automatically — this
  spec only stores and displays the data correctly.
- Any change to `AppUser`'s own `Email` field (different entity, not
  named in the original request).

## Testing / verification

- `npx tsc -p tsconfig.client.json --noEmit` and a full client build after
  the UI changes, per this project's established workflow.
- Prisma migration applied via `migrate deploy` + `prisma generate`
  (this environment's `prisma migrate dev` doesn't work non-interactively).
- Live verification in the browser: add multiple Email/Phone/WhatsApp
  entries to a Vendor, Operator, Client, and Person via the new panel
  editors; confirm they persist across a page reload; confirm
  `ComposeDrawer` recipients reflect the new channels; confirm a Client's
  migrated `billingEmails` show up as `forBilling` Email entries after the
  migration runs against real seed data.
