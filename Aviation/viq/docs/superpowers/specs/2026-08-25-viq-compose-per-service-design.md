# VIQ Per-Service Compose + Real Email Sending (Sub-project 2b of 6, folds Comms migration in)

## Context

Sub-project 2a (Trip core rewire — Trips/Legs/Stops/Services off
localStorage) is complete. Per the original 6-part plan, Comms/Persons/
Docs/Invoices reference-CRUD were deferred to later slices. This spec
covers the next slice: moving Comms to the real API, adding actual SMTP
sending (currently `saveComm` just logs a message locally with no
delivery), and — per explicit user request — moving message composition
from being a standalone page-only action to also being triggerable
directly from a leg's service card, with vendor and template
auto-population.

Per explicit user instruction (carried over from prior sub-projects): **do
not `git commit` any of this work.**

## Goal

From `TripDetail.tsx`'s leg service list, a coordinator can click
"Compose" on a specific service, get a pre-filled message (template
chosen by service type, vendor and recipient addresses chosen by the
service's assigned provider), edit it, and send it — with the send
actually delivering email via SMTP and the resulting `Comm` record
reflecting real delivery status (`Sent`/`Failed`), not an unconditional
`Sent`. The existing standalone `/composer` page stays as-is, for
manual/ad-hoc composing without a specific service in context; both share
the same underlying template logic so there's one source of truth for
message formats.

## Design decisions (confirmed with user during brainstorming)

- **Default vendor** = the service's already-assigned `ProviderID` (set
  automatically when the service was generated, via the existing
  ICAO→Country→Global precedence in `ServicesService`) — not fresh
  compose-time matching logic. Override via a dropdown scoped to
  providers eligible for that service's type + ICAO/country.
- **Standalone Composer page stays** alongside the new per-service entry
  point; both call the same extracted template function.
- **Compose opens as a drawer/modal inline on `TripDetail.tsx`**, not a
  page navigation.
- **Entry point is `TripDetail.tsx` only** for now, not `AdminTrips.tsx`.
- **Real SMTP sending**, via a generic SMTP relay (Nodemailer), credentials
  supplied later by the user directly in `.env` — never typed into chat,
  same pattern as `JWT_SECRET`/`ADMIN_PASSWORD_HASH`.
- **Sender identity** (coordinator name, team, phone/fax/SITA/ARINC) is a
  fixed org-wide constant for now, not a per-user profile — matches the
  single-admin-user reality today. Coordinator name in the signature
  defaults to the logged-in username.
- **Provider gains multiple contacts** (a list, not one `Email` string) —
  matches the real multi-recipient pattern in the user's reference
  message examples.
- **`Comm.Status`** (already `'Draft' | 'Queued' | 'Sent' | 'Failed' |
  'Received'` in both the Prisma model and frontend type — no schema
  change needed) starts actually reflecting what happened, instead of
  every comm being hardcoded to `'Sent'` regardless of outcome.

## Backend

### Provider gets multiple contacts

`prisma/schema.prisma`'s `Provider` model: add

```prisma
model Provider {
  // ...existing fields...
  contacts Json @default("[]") @map("contacts") // { label: string; email: string }[]
}
```

Keep the existing `email String?` field as-is for backward compatibility
with any code still reading it (none currently writes/reads it beyond the
reference GET, per investigation — `AdminAssets.tsx`'s provider
create/edit stays localStorage-only, out of scope for this slice, same
boundary as the trip-core-rewire's declared scope). Seed data
(`prisma/seed-data/providers.json` and its `.ts` counterpart) gets a
`contacts` array added per provider, backfilled from the existing
`email` field as a single `{label: "Primary", email: <existing email>}`
entry so nothing regresses.

No new Providers CRUD module needed — `GET /api/reference/providers`
(already built, already authenticated) will include the new field
automatically once it's on the Prisma model; this slice is read-only
for Providers.

### New Mail module

`src/server/modules/mail/mail.module.ts` + `mail.service.ts` — a thin
Nodemailer wrapper. Config via `.env`:

```
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="VIQ Operations <ops@example.com>"
```

`.env.example` gets these keys with placeholder/empty values. `MailService.send({ to, subject, body }): Promise<{ ok: true } | { ok: false; error: string }>`
— never throws; callers get a result object, since a failed send is a
normal, expected outcome (bad address, SMTP auth failure, etc.), not an
exceptional one.

### `CommsController` gains one endpoint

`POST /comms/:commId/send` — loads the `Comm` (must already exist,
created via the existing `POST /comms` as `Status: 'Draft'`), calls
`MailService.send({ to: comm.to, subject: comm.subject, body: comm.body })`,
updates `Status` to `'Sent'` or `'Failed'` based on the result, records
`sentAtZ`/`errorMessage` (two new nullable `Comm` fields — add
`sentAtZ DateTime? @map("sent_at_z")` and `errorMessage String? @map("error_message")`
to the Prisma model), returns the updated `Comm`. No new DTO needed (no
request body — the endpoint acts on the already-created draft).

### Sender identity config

New `.env` keys, read directly where the message is generated (frontend
template function, not backend — see below):

```
VITE_SENDER_NAME="Operations Desk"
VITE_SENDER_TEAM="Operations"
VITE_SENDER_PHONE=
VITE_SENDER_FAX=
VITE_SENDER_SITA=
VITE_SENDER_ARINC=
```

(`VITE_`-prefixed since these are read client-side by the template
generator, not sensitive — unlike SMTP credentials, which stay
server-only.)

## Frontend

### Comms migration in `dataStore.ts` (same pattern as the trip-core rewire)

- `getComms(): Promise<Comm[]>`, `getCommsForTrip(tripId): Promise<Comm[]>`
  — API-backed, same mapper-function pattern as Trips/Legs/Stops/Services.
- `saveComm(comm, user?): Promise<Comm>` — POST if new (existence-checked
  via `getCommsForTrip`), PATCH if existing. Drop the client-side
  `addAuditEntry` call inside it (server already logs, same reasoning as
  the trip-core rewire).
- New `sendComm(commId): Promise<Comm>` — thin wrapper around
  `POST /comms/:commId/send`.
- `ComposerPage.tsx`'s `sendAndLog` (currently: build a `Comm` with
  `Status: 'Sent'` hardcoded, call `saveComm`) becomes: build the `Comm`
  with `Status: 'Draft'`, `await saveComm(comm)`, then
  `await sendComm(comm.CommID)`, then reflect the real returned status in
  the UI (a "Sent ✓" / "Failed — <error>" indicator instead of always
  showing success).

### Shared template extraction

Move `generateEmail` (currently defined inline at the top of
`ComposerPage.tsx`, ~85 lines, template-per-`TemplateType` switch) into
`src/client/lib/emailTemplates.ts`, unchanged in behavior. Both
`ComposerPage.tsx` and the new `ComposeDrawer` import it from there.
Extend it with the sender-identity block (phone/fax/SITA/ARINC/team, from
the `VITE_SENDER_*` env vars) and a `REQUEST SENT TO:` line (the
resolved recipient list) in the `UW_*` template bodies, per the user's
reference examples — these two additions apply to all `UW_*` templates
uniformly, not just new ones.

### `SERVICE_TYPE_TO_TEMPLATE` mapping

New small constant in `emailTemplates.ts`:

```typescript
const SERVICE_TYPE_TO_TEMPLATE: Record<ServiceType, TemplateType> = {
  Permit: 'Permit', Overflight: 'Overflight', GroundHandling: 'GroundHandling',
  Fuel: 'Fuel', Catering: 'Catering', CrewTransport: 'CrewTransport',
  Customs: 'Customs', Hotel: 'Hotel',
  Slot: 'Generic', PPR: 'Generic', Visa: 'Generic', FlightPlanning: 'Generic',
};
```

(8 of 12 `ServiceType` values already share an exact name with an
existing `TemplateType` — the remaining 4 fall back to `Generic` until
templates are written for them, out of scope here.)

### New `ComposeDrawer` component

New file `src/client/components/ComposeDrawer.tsx`. Props: `service:
Service`, `leg: Leg`, `trip: Trip`, `open: boolean`, `onClose: () =>
void`, `onSent: () => void` (the last one wired to `TripDetail.tsx`'s
existing `reload()`, so the Comms list/history refreshes after a send).

On open: resolve the default vendor from `refProviders.find(p =>
p.ProviderID === service.ProviderID)`, default template from
`SERVICE_TYPE_TO_TEMPLATE[service.ServiceType]`, generate the initial
subject/body via the shared `generateEmail`, default recipients from the
resolved vendor's `Contacts`. All three (vendor, template, recipients)
stay editable — vendor via a dropdown filtered to providers whose
`ServiceTypes` includes `service.ServiceType` and whose `ScopeType`/
`Scope` matches the leg's arrival/departure ICAO or country (same
eligibility logic already used server-side, ported client-side for the
dropdown's option list — this is filtering only, not new matching
logic, since the actual assignment already happened when the service was
created).

Preview → Edit → Send, matching the existing Composer page's UX shape.
Send button: `await saveComm(draft)` then `await sendComm(commId)`,
show the real result, call `onSent()`.

### `TripDetail.tsx` integration

Add a "Compose" button to each service card in the "LEG SERVICES &
ROUTING" section (the existing service-card component — exact insertion
point confirmed at plan-writing time by reading the current file, since
Task 11 may have touched this area). Clicking it opens `ComposeDrawer`
with that service/leg/trip. No other change to `TripDetail.tsx`'s
existing behavior.

## Testing

No test framework in this project — manual verification, same pattern as
prior slices:

```powershell
npm run build
npm run start:prod
# 1. Login, open a trip, click Compose on a service — confirm vendor/template/recipients pre-fill correctly
# 2. Edit the message, send — with real (or intentionally invalid, for the Failed-path test) SMTP creds in .env
# 3. Confirm the Comm's Status reflects the real outcome:
Invoke-RestMethod http://localhost:4001/api/comms?tripId=<tripId> -Headers @{Authorization="Bearer <token>"}
# 4. Confirm ComposerPage.tsx (standalone) still works identically to before, using the same extracted template function
```

Browser check: Compose from a service card, send with valid creds,
confirm `Sent` and the email actually arrives at the test recipient;
repeat with invalid creds, confirm `Failed` displays with a real error
message, not a silent/false success.

## Out of scope

- `AdminTrips.tsx` Compose entry point (TripDetail only, per user
  decision — may become a future slice).
- Provider contacts editing UI (AdminAssets.tsx's provider CRUD stays
  localStorage-only; the new `Contacts` field is populated via seed data
  and read-only through this slice).
- Templates for Slot/PPR/Visa/FlightPlanning service types (fall back to
  `Generic`).
- Per-coordinator/team sender identity (fixed constant only).
- Delivery receipts / read tracking beyond `Sent`/`Failed` (no
  `Delivered`/`Read` status wiring — SMTP send success is the only signal
  tracked).
- Persons/Docs/Invoices/reference-CRUD (still future slices per the
  original 6-part roadmap).

## Do not

- Do not `git commit`.
- Do not put SMTP credentials in any `VITE_`-prefixed env var (those are
  bundled into client-side JS) — only `SMTP_*` (server-only) carries
  secrets; `VITE_SENDER_*` is non-sensitive signature-block text only.
- Do not add a Providers CRUD API as part of this slice — reference reads
  already exist and are sufficient for Compose's needs.
- Do not build the Compose entry point into `AdminTrips.tsx` in this
  slice — explicitly deferred.
