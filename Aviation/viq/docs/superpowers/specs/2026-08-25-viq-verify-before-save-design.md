# VIQ Verify-Before-Save UX (Sub-project 4c of the document-intelligence initiative)

## Context

4a (file storage) and 4b (OCR extraction) are complete. This slice adds
the human-in-the-loop step items 13/14 asked for: after OCR runs on a
document, a coordinator reviews what was extracted, corrects it, and saves
a verified version — "ask user to verify info accuracy" from item 13,
"preview for info verification/edit then save" from item 14.

**Scoping decision to avoid blocking on 4d**: item 13 describes verified
data ultimately landing in real Person fields (passport number, medical
cert details, instrument ratings — none of which exist as columns yet;
that's sub-project 4d). Rather than make this slice depend on schema that
doesn't exist, verified data lands on the `DocAttachment` itself, in a
flexible field this slice defines. 4d's job, when it lands, is to promote
already-verified doc data into the real Person columns it adds — not to
re-do this slice's UI. One piece of verified data *does* land somewhere
concrete immediately, with zero dependency on 4d: `DocAttachment.validUntil`
already exists (predates even 4a) and is exactly what expiry monitoring
(also 4d, eventually) will need to watch — a verified expiry date is real,
useful output from day one.

Also note: "save/assign to a person and/or trip/aircraft" from item 13 is
**already handled** — 4a's upload flow already requires picking exactly one
scope (`tripId`/`personId`/`aircraftRegistration`) at upload time. This
slice's "save" is about confirming/correcting the *content* of an
already-scoped document, not re-assigning what it belongs to.

Per explicit user instruction (carried over from every prior sub-project in
this session): **do not `git commit` any of this work.**

## Goal

For a document that's had OCR run on it (4b), a coordinator can open a
verify dialog showing the raw OCR text for reference, a set of editable
fields pre-filled from whatever `ocrStructuredFields` MRZ parsing found (or
empty, with the ability to add fields manually, for documents with no MRZ),
and a `Valid Until` date — correct/fill in what's needed, and save. The
document then carries a `verified` status distinguishable from merely
`OCR'd`, with a timestamp and who verified it.

## Design decisions

- **Verified fields are a flexible key/value list, not a fixed schema.**
  MRZ field names vary by format (TD1/TD2/TD3), and non-MRZ documents
  (medical certs, licenses) have no standard field set at all. A `{ label,
  value }[]` editor — pre-filled from `ocrStructuredFields` when present,
  empty otherwise, with add/remove controls — covers both cases without
  inventing a rigid shape 4d would likely have to change anyway once real
  Person columns exist to map onto.
- **`Valid Until` is promoted to a first-class field in the verify dialog**,
  separate from the generic key/value list, because it already has a real
  home (`DocAttachment.validUntil`, pre-existing) and is the one piece of
  verified data every document type can meaningfully have, regardless of
  what other structured fields it does or doesn't carry.
- **New `DocAttachment` fields**: `verifiedFields` (JSON — the `{label,
  value}[]` array), `verifiedBy`, `verifiedAt`. Distinguishing "OCR'd but
  not yet human-verified" (`ocrStatus: 'Complete'`, `verifiedAt: null`)
  from "verified" (`verifiedAt` set) is the whole point of this slice —
  don't conflate the two.
- **One combined save action**, not separate "save fields" / "save expiry"
  steps — a `PATCH /docs/:docId/verify` endpoint takes both `verifiedFields`
  and an optional `validUntil` in one call, since a coordinator reviewing a
  document naturally corrects everything at once before clicking Save.
- **Replaces, not adds to, 4b's inline "VIEW TEXT" row expansion.** A Dialog
  (matching this project's established `ComposeDrawer`/`ReferencePage`
  Service-Types-tab pattern) gives real editing room; the cramped inline
  table row from 4b was only ever meant as a minimal proof that OCR worked,
  explicitly not the final UI (per 4b's own spec).
- **No re-verification history/versioning** in this slice — saving a
  verification overwrites the previous `verifiedFields`/`verifiedAt`. An
  audit trail already exists generically (`AuditService`) and gets a normal
  log entry on save; a dedicated verification-history view is unneeded
  scope for now.

## Backend

### `DocAttachment` schema changes

```prisma
  verifiedFields Json?     @map("verified_fields")   // { label: string; value: string }[]
  verifiedBy     String?   @map("verified_by")
  verifiedAt     DateTime? @map("verified_at")
```

Run: `npm run prisma:migrate -- --name add_doc_verification_fields`

### DTO

`src/server/modules/docs/dto/verify-doc.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

class VerifiedFieldDto {
  @IsString()
  label!: string;

  @IsString()
  value!: string;
}

export class VerifyDocDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerifiedFieldDto)
  verifiedFields!: VerifiedFieldDto[];

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsString()
  verifiedBy!: string;
}
```

### `DocsService.verify`

```typescript
async verify(docId: string, dto: VerifyDocDto) {
  await this.findOne(docId);
  const doc = await this.prisma.docAttachment.update({
    where: { docId },
    data: {
      verifiedFields: dto.verifiedFields as unknown as Prisma.InputJsonValue,
      verifiedBy: dto.verifiedBy,
      verifiedAt: new Date(),
      ...(dto.validUntil ? { validUntil: new Date(dto.validUntil) } : {}),
    },
  });
  await this.audit.log(dto.verifiedBy, 'Doc', docId, 'Verified', '', 'Verified');
  return doc;
}
```

### Controller

```typescript
@Patch(':docId/verify')
verify(@Param('docId') docId: string, @Body() dto: VerifyDocDto) {
  return this.docs.verify(docId, dto);
}
```

(`Patch` needs adding to the existing `@nestjs/common` import list in
`docs.controller.ts`.)

## Frontend

### `types.ts`

```typescript
  VerifiedFields?: { label: string; value: string }[];
  VerifiedBy?: string;
  VerifiedAt?: string;
```

added to `DocAttachment`, and `mapDocFromApi` in `dataStore.ts` gets the
matching three lines.

### `dataStore.ts`

```typescript
export async function verifyDoc(
  docId: string,
  data: { verifiedFields: { label: string; value: string }[]; validUntil?: string; verifiedBy?: string }
): Promise<DocAttachment> {
  const row = await apiJson<any>(`/docs/${docId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ ...data, verifiedBy: data.verifiedBy || 'SYSTEM' }),
  });
  return mapDocFromApi(row);
}
```

### New `DocVerifyDialog` component

`src/client/components/DocVerifyDialog.tsx` — props: `doc: DocAttachment`,
`open: boolean`, `onClose: () => void`, `onSaved: () => void`.

On open, initializes its field-editor state from `doc.VerifiedFields` if
already verified once, else from `doc.OcrStructuredFields` (converting the
object's entries into `{label, value}` pairs), else empty. Shows:

- The raw `doc.OcrText` in a read-only `<pre>` block, for reference while
  correcting fields.
- The `{label, value}[]` editor: each row an editable label input + value
  input + remove button; an "ADD FIELD" button appends an empty row.
- A `Valid Until` date input, defaulting to `doc.ValidUntil` if set.
- Save button calling `verifyDoc(doc.DocID, { verifiedFields, validUntil })`,
  then `onSaved()` (parent reloads) and `onClose()`.

### `TripDetail.tsx` DOCS tab

Replace 4b's inline OCR-result row (the `ocrExpandedDocId`-driven
`<TableRow>` showing raw text/MRZ JSON) with the new dialog. The
"EXTRACT TEXT"/"VIEW TEXT" button becomes:

- "EXTRACT TEXT" when `!doc.OcrStatus` (unchanged from 4b — triggers OCR).
- "VERIFY" when `doc.OcrStatus === 'Complete' && !doc.VerifiedAt` — opens
  `DocVerifyDialog`.
- "RE-VERIFY" when `doc.VerifiedAt` is set — same dialog, pre-filled from
  the existing `VerifiedFields`.
- A small "VERIFIED" badge (with `doc.VerifiedAt` as a tooltip/subtext)
  appears next to the doc type badge once verified.

Remove the `ocrExpandedDocId`/`Fragment`-wrapped conditional row machinery
from 4b's DOCS tab edit entirely — this dialog replaces it, per the design
decision above. `ocrRunningDocId` state and the OCR-triggering branch of
the button's `onClick` stay (still needed for the `!doc.OcrStatus` case).

## Testing

No test framework in this project — manual verification:

```powershell
npm run build
npm run start:prod
# 1. Upload an image doc, EXTRACT TEXT (from 4b). Click VERIFY — confirm
#    the dialog shows raw text, pre-filled fields (if MRZ was detected) or
#    an empty editor, and a Valid Until input.
# 2. Edit/add a field, set a Valid Until date, Save — confirm the dialog
#    closes, the row now shows a VERIFIED badge, and GET /api/docs/:docId
#    shows verifiedFields/verifiedBy/verifiedAt populated and validUntil
#    updated.
# 3. Click RE-VERIFY on an already-verified doc — confirm the dialog
#    pre-fills from the previously saved verifiedFields, not from the
#    original OCR structured fields (i.e. prior corrections aren't lost).
# 4. Confirm the audit trail (GET /api/audit) shows a 'Verified' entry.
```

## Out of scope

- Promoting verified fields into real Person columns (passport number,
  medical cert, ratings) — 4d's job, once those columns exist.
- Expiry-date monitoring/alerting UI that watches `validUntil` — 4d.
- Verification history/versioning — overwrite-on-save only.
- Bulk verification (verifying many docs at once) — out of scope for this
  slice; each doc is verified individually.

## Do not

- Do not `git commit`.
- Do not invent fixed Person-shaped fields (e.g. hardcoded
  `passportNumber`/`dateOfBirth` inputs) in the verify dialog — the
  flexible `{label, value}[]` editor is the deliberate choice until 4d
  defines real columns to map onto.
- Do not remove or weaken the existing OCR-triggering flow from 4b — this
  slice extends the DOCS tab's button, it doesn't replace `runDocOcr`.
