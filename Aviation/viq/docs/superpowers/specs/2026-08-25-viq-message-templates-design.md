# VIQ — Country-Specific Message Templates (Item 11)

Status: Approved, ready for implementation plan.
Date: 2026-08-25

## Problem

`src/client/lib/emailTemplates.ts`'s `generateEmail()` is a single ~180-line
switch statement with 12 template bodies baked directly into TypeScript
string literals. Country only ever affects the subject line and airport
names inside a body — the wording, structure, and required-confirmation
checklists are identical for every country, even though real permit
requests to different Civil Aviation Authorities often require different
formats, different confirmation checklists, or different attachment lists.

Separately, the six country-facing templates (`Overfly`/`Landing`/
`GroundHandling` × `Request`/`Revision`) are named and worded as if
hardcoded to one specific handling vendor (Universal Weather) —
`UW_OverflyRequest` etc., with body text referencing "UNIVERSAL REFERENCE
NBR", "SENT TO UNIVERSAL MISSION SUPPORT COMPANY", and a hardcoded
`thirdparty@universalweather.com` billing address. This needs cleaning up
before it becomes the shipped-with-the-app default content.

## Scope

1. Rename the `TemplateType` union's 7 `UW_*` values to `VIQ_*`
   (`UW_OverflyRequest` → `VIQ_OverflyRequest`, etc. — all 6 country-aware
   types plus `UW_MultiLegPermit` → `VIQ_MultiLegPermit`), updated
   everywhere referenced.
2. Strip Universal-Weather-specific text from the 6 country-aware
   template bodies (the ones affected by this feature) — generic
   "REFERENCE NBR" instead of "UNIVERSAL REFERENCE NBR", generic
   invoice-submission phrasing instead of "SENT TO UNIVERSAL MISSION
   SUPPORT COMPANY... THIRDPARTY@UNIVERSALWEATHER.COM". Cosmetic "UW:"/
   "UW REF:" UI labels (`TripsPage.tsx`, `TripDetail.tsx`,
   `AdminTrips.tsx`) become neutral "REF:" wording.
3. New country-override system for the 6 country-aware template types
   only (`VIQ_OverflyRequest`/`Revision`, `VIQ_LandingRequest`/`Revision`,
   `VIQ_GroundHandlingRequest`/`Revision`) — `Fuel`/`Catering`/
   `CrewTransport`/`Hotel`/`Generic`/`VIQ_MultiLegPermit` stay
   hardcoded, unaffected by country.

Explicitly out of scope: seed/demo data referencing "Universal Weather"
as a fictional vendor name (`providers.json`, `operators.json`,
`seed-data.ts`) and `AdminSettings.tsx`'s SMTP placeholder value — these
are example content, not templates, and renaming them is not part of
this feature.

## Architecture

**One rendering mechanism for both default and override content.** The
6 country-aware templates' current hardcoded bodies become the *default*
content, re-expressed in the same `{{PLACEHOLDER}}` syntax a country
override uses, stored as code constants (`DEFAULT_TEMPLATES` in
`emailTemplates.ts`). A single `renderTemplate(str, vars)` substitution
function handles both — there is never a second rendering code path for
"the built-in one." This is deliberate: an admin creating their first
override for a country can start from the literal default text (fetched
via a "reset to default" action) with placeholders intact, rather than
staring at a blank box or a JS-template-literal dump.

**`generateEmail()` stays synchronous — no async conversion.** Country
overrides join the in-memory-cache-at-boot pattern 4e established for
reference data: fetched once in `preloadReferenceData()` (one more
parallel call), cached in memory keyed by `` `${countryIso2}:${templateType}` ``.
`generateEmail`'s only 2 call sites (`ComposeDrawer.tsx`, `ComposerPage.tsx`)
need zero signature changes. Lookup: DB override for
`(relevantCountryIso2, templateType)` if present, else
`DEFAULT_TEMPLATES[templateType]` — both rendered through the same
`renderTemplate()` call.

**Placeholder set** — every variable `generateEmail` already computes for
these 6 templates, available to both default and override text:
`{{OPERATOR}}`, `{{REG}}`, `{{ACTYPE}}`, `{{MTOW}}`, `{{DEP}}`,
`{{DEP_NAME}}`, `{{ARR}}`, `{{ARR_NAME}}`, `{{ETD}}`, `{{ETA}}`,
`{{PREV_ETD}}`, `{{PREV_ETA}}` (revision templates only — empty string on
request templates), `{{CLIENT}}`, `{{SUPPORT_REF}}`, `{{PIC}}`,
`{{CREW_COUNT}}`, `{{PAX_COUNT}}`, `{{TRIP_ID}}`, `{{TOKEN}}`,
`{{SENDER_NAME}}`, `{{SENDER_BLOCK}}`, `{{RECIPIENTS}}`,
`{{COUNTRY_NAME}}`. `renderTemplate` does a single-pass literal
`{{KEY}}` → value replacement (no conditionals, no loops) — deliberately
minimal, since these are one-shot outbound request texts, not a general
templating language.

## Schema

```prisma
model MessageTemplate {
  id           Int      @id @default(autoincrement())
  countryIso2  String   @map("country_iso2")
  templateType String   @map("template_type")
  subject      String
  body         String
  updatedBy    String?  @map("updated_by")
  updatedAtZ   DateTime @default(now()) @map("updated_at_z")

  country Country @relation(fields: [countryIso2], references: [iso2])

  @@unique([countryIso2, templateType])
  @@index([countryIso2])
  @@map("message_templates")
}
```

`Country` gains a reverse relation (`messageTemplates MessageTemplate[]`).
No FK validation on `templateType` beyond the 6-value allowlist enforced
at the DTO layer — matches how every other free-text-ish classification
column in this schema (e.g. `Service.status`) is validated at the
application layer, not the database layer. `updatedAtZ` is set manually
in the service layer (`new Date()` on both create and update) rather than
via Prisma's `@updatedAt` — this schema has never used that decorator
anywhere else; every other model manages its timestamps by hand in
service code (e.g. `DocAttachment.verifiedAt`), so this stays consistent
with that rather than introducing a second mechanism.

## Backend

New module `src/server/modules/message-templates/` (own module — this is
admin-editable content with its own lifecycle, not reference lookup data,
so it doesn't belong in the `reference` module despite depending on
`Country`):

- `GET /message-templates` — full list, for the app-boot cache.
- `GET /message-templates/:countryIso2/:templateType` — single lookup
  (not used by the cache path, but useful for direct verification/testing).
- `POST /message-templates` — create an override. `countryIso2` +
  `templateType` (validated against the 6-value allowlist) + `subject` +
  `body`, `@@unique` constraint prevents a duplicate pair (caught and
  rethrown as 400, same `P2002`-catch pattern used elsewhere in this
  codebase for unique-constraint violations).
- `PATCH /message-templates/:id` — edit an existing override.
- `DELETE /message-templates/:id` — remove an override (reverts that
  country/type pair to the default).

`AuditService` logging on create/update/delete, same pattern as every
other module this session.

## Frontend

**`renderTemplate`/`DEFAULT_TEMPLATES`/cache** live in `emailTemplates.ts`
itself (not `dataStore.ts`) since they're specific to this one module's
concern, not general reference data — `dataStore.ts` gains only the thin
CRUD functions (`getMessageTemplateList`/`saveMessageTemplate`/
`deleteMessageTemplate`, matching the established mapper/cache-array
pattern) that `emailTemplates.ts` calls. `preloadReferenceData()` in
`dataStore.ts` gains a 6th parallel fetch for this list.

**New admin page** `src/client/pages/admin/MessageTemplatesPage.tsx`,
route `/admin/message-templates`, linked from `Layout.tsx`'s admin nav
section (sibling to Manage Trips/Assets/Billing/Settings). Not a modal —
bodies run 800+ characters, need real editing room:
- Country `<Select>` + template-type `<Select>` (6 options) at the top.
- Subject + Body `<textarea>` fields, pre-filled with the existing
  override if one exists for that pair, else the default template text
  (fetched via `DEFAULT_TEMPLATES[templateType]`, not the DB).
- "Save Override" button (disabled if the text is unchanged from what's
  already saved/default — avoids saving a no-op override that's byte-identical
  to the default). "Reset to Default" button, shown only when an override
  exists for the current pair — deletes it.
- A live preview pane below the editor, rendering the current textarea
  content through `renderTemplate()` against a fixed set of sample
  placeholder values (not a real trip — no trip-selection UI needed for
  this page), so an admin can see the substituted output before saving.
- A left-hand list of which countries currently have an override for the
  selected template type (small — most countries won't), each row
  clickable to load that country/type pair into the editor.

## Testing / verification plan

1. Migration: additive-only (`CREATE TABLE message_templates`, one new FK
   to `Country`) — no existing data affected, safe to apply directly, no
   `--create-only` hand-editing expected to be needed (still read the
   generated SQL before applying, per this session's standing practice).
2. `npx tsc --noEmit` (both configs), `npx nest build`,
   `npm run build:client` — all clean.
3. Live verification via curl + JWT: create a country override for one
   of the 6 template types on a real seeded country, confirm
   `generateEmail()`'s cache-driven lookup picks it up over the default
   (verified the same way 4d-3's `personExpiryStatus` and the
   Aircraft/Operator sub-project's `resolveBillToAddress` were —
   replicating the lookup+render logic in a `node -e` script against
   live API data, since these are pure client-side functions with no
   server endpoint to curl directly); confirm a country with no override
   falls back to `DEFAULT_TEMPLATES` correctly; delete the override,
   confirm the fallback resumes. Confirm the duplicate-pair rejection
   (second `POST` for the same `countryIso2`+`templateType` returns 400).
   Clean up all throwaway rows, confirm count returns to baseline (0).
4. Confirm the `UW_` → `VIQ_` rename left no stray references — grep
   `src/client` for `UW_` after the rename, expect zero matches outside
   this spec/plan/README's own historical prose.

## Explicitly out of scope

- Converting `Fuel`/`Catering`/`CrewTransport`/`Hotel`/`Generic`/
  `VIQ_MultiLegPermit` to be country-overridable — per the approved
  scoping decision, only the 6 CAA-facing templates get this system.
- A general-purpose templating language (conditionals, loops, nested
  placeholders) — single-pass literal substitution only.
- Renaming "Universal Weather" out of seed/demo JSON data or the
  `AdminSettings.tsx` SMTP placeholder — explicitly confirmed as out of
  scope during brainstorming.
- Per-provider (as opposed to per-country) template overrides — not
  requested; country is the only override axis.
