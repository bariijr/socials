# VIQ Verify-Before-Save UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coordinator review and correct what OCR extracted from a document, then save a verified version — a flexible `{label, value}` field editor pre-filled from any MRZ data found, plus a `Valid Until` date, distinguishing "OCR'd" from "human-verified."

**Architecture:** `DocAttachment` gains `verifiedFields`/`verifiedBy`/`verifiedAt`. New `PATCH /docs/:docId/verify` endpoint. New `DocVerifyDialog` component (Dialog, matching `ComposeDrawer`'s established pattern) replaces 4b's inline OCR-result table row in `TripDetail.tsx`'s DOCS tab — its button becomes EXTRACT TEXT → VERIFY → RE-VERIFY depending on the doc's OCR/verification state.

**Tech Stack:** No new dependencies — reuses `class-transformer`'s nested-DTO-array pattern already established in 3a's `ServiceTypeVariantDto`.

**Spec:** `docs/superpowers/specs/2026-08-25-viq-verify-before-save-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project in this session.
- Verified fields are a flexible `{label, value}[]` array — do not hardcode Person-shaped fields (passport number, DOB, etc.) as fixed inputs. That's 4d's job once real columns exist.
- `Valid Until` is promoted to a first-class dialog field (maps to the pre-existing `DocAttachment.validUntil`) — separate from the generic field editor.
- One combined save (`PATCH /docs/:docId/verify` takes both `verifiedFields` and optional `validUntil` in one call) — not separate save actions.
- No verification history/versioning — saving overwrites the previous `verifiedFields`/`verifiedAt`.
- `dataStore.ts` has `// @ts-nocheck`. `TripDetail.tsx` and the new `DocVerifyDialog.tsx` do NOT — real type-checking applies.

---

### Task 1: Backend — `DocAttachment` verification fields, migration, `verify` endpoint

**Files:**
- Modify: `prisma/schema.prisma` (`DocAttachment` model)
- Create: a new Prisma migration (via `npm run prisma:migrate`)
- Create: `src/server/modules/docs/dto/verify-doc.dto.ts`
- Modify: `src/server/modules/docs/docs.service.ts`
- Modify: `src/server/modules/docs/docs.controller.ts`

**Interfaces:**
- Produces: `DocAttachment.verifiedFields: Json?`, `.verifiedBy: String?`, `.verifiedAt: DateTime?`. `PATCH /docs/:docId/verify`. `DocsService.verify(docId, dto): Promise<DocAttachment>`.

- [x] **Step 1: Add verification fields to `DocAttachment`**

In `prisma/schema.prisma`'s `DocAttachment` model, add these lines
immediately after the existing `ocrProcessedAt` field:

```prisma
  verifiedFields Json?     @map("verified_fields")
  verifiedBy     String?   @map("verified_by")
  verifiedAt     DateTime? @map("verified_at")
```

- [x] **Step 2: Generate and apply the migration**

Run: `npm run prisma:migrate -- --name add_doc_verification_fields`
Expected: exits 0 — all three new columns are nullable, no data-backfill
handling needed.

- [x] **Step 3: Create the verify DTO**

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

(Same nested-array-DTO pattern already used by 3a's
`CreateServiceTypeDto.variants`/`ServiceTypeVariantDto` — `transform: true`
is already set globally in `main.ts`'s `ValidationPipe`, so `@Type(() =>
VerifiedFieldDto)` works without further config.)

- [x] **Step 4: Add `verify` to `DocsService`**

Read the current file first (last touched in the 4b plan — confirm its
exact imports/constructor before editing). Add this method (anywhere after
`findOne`):

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

Add the import: `import { VerifyDocDto } from './dto/verify-doc.dto';`
(`Prisma` type is already imported from the 4b work.)

- [x] **Step 5: Add the controller route**

In `src/server/modules/docs/docs.controller.ts`, add `Patch` to the
existing `@nestjs/common` import line, add
`import { VerifyDocDto } from './dto/verify-doc.dto';`, and add:

```typescript
  @Patch(':docId/verify')
  verify(@Param('docId') docId: string, @Body() dto: VerifyDocDto) {
    return this.docs.verify(docId, dto);
  }
```

- [x] **Step 6: Verify — build**

Run: `npx nest build`. Expect 0 exit.

- [x] **Step 7: Snapshot (no git commit)**

---

### Task 2: Frontend — `types.ts`, `dataStore.ts`, `DocVerifyDialog`

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`
- Create: `src/client/components/DocVerifyDialog.tsx`

**Interfaces:**
- Produces: `verifyDoc(docId, data): Promise<DocAttachment>`. `<DocVerifyDialog doc trip? open onClose onSaved />`.

- [x] **Step 1: Extend `DocAttachment`**

In `src/client/data/types.ts`, add to the `DocAttachment` interface,
immediately after `OcrProcessedAt?: string;`:

```typescript
  VerifiedFields?: { label: string; value: string }[];
  VerifiedBy?: string;
  VerifiedAt?: string;
```

- [x] **Step 2: Extend `mapDocFromApi` and add `verifyDoc`**

In `src/client/lib/dataStore.ts`, add to `mapDocFromApi`'s return object,
after `OcrProcessedAt: d.ocrProcessedAt ?? undefined,`:

```typescript
    VerifiedFields: d.verifiedFields ?? undefined,
    VerifiedBy: d.verifiedBy ?? undefined,
    VerifiedAt: d.verifiedAt ?? undefined,
```

Add a new function near `runDocOcr`:

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

- [x] **Step 3: Create `DocVerifyDialog`**

`src/client/components/DocVerifyDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { verifyDoc } from '@/lib/dataStore';
import type { DocAttachment } from '@/data/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

interface FieldRow {
  label: string;
  value: string;
}

export function DocVerifyDialog({ doc, open, onClose, onSaved }: {
  doc: DocAttachment;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (doc.VerifiedFields?.length) {
      setFields(doc.VerifiedFields);
    } else if (doc.OcrStructuredFields) {
      setFields(Object.entries(doc.OcrStructuredFields).map(([label, value]) => ({ label, value: String(value ?? '') })));
    } else {
      setFields([]);
    }
    setValidUntil(doc.ValidUntil ? doc.ValidUntil.slice(0, 10) : '');
  }, [open, doc]);

  const updateField = (index: number, key: keyof FieldRow, value: string) => {
    setFields((current) => current.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
  };

  const removeField = (index: number) => {
    setFields((current) => current.filter((_, i) => i !== index));
  };

  const addField = () => {
    setFields((current) => [...current, { label: '', value: '' }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await verifyDoc(doc.DocID, {
        verifiedFields: fields.filter((f) => f.label.trim()),
        validUntil: validUntil || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Verify — {doc.FileName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {doc.OcrText && (
            <div>
              <Label className="text-xs text-muted-foreground">Raw extracted text (reference)</Label>
              <pre className="mt-1 max-h-32 overflow-y-auto rounded border bg-muted/20 p-2 text-xs whitespace-pre-wrap">{doc.OcrText}</pre>
            </div>
          )}
          <div>
            <Label>Valid Until</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Verified fields</Label>
            {fields.map((field, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input placeholder="Field" value={field.label} onChange={(e) => updateField(index, 'label', e.target.value)} className="w-1/3" />
                <Input placeholder="Value" value={field.value} onChange={(e) => updateField(index, 'value', e.target.value)} className="flex-1" />
                <Button size="icon-sm" variant="ghost" onClick={() => removeField(index)} title="Remove field"><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addField}><Plus className="h-4 w-4" /> ADD FIELD</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 4: Verify**

Run: `npx tsc -p tsconfig.client.json`. Expect 0 exit (this file isn't wired
into any page yet — Task 3 does that — so this step only confirms it
compiles standalone).

- [x] **Step 5: Snapshot (no git commit)**

---

### Task 3: Frontend — wire `DocVerifyDialog` into `TripDetail.tsx`'s DOCS tab

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: `DocVerifyDialog` from `@/components/DocVerifyDialog`.

- [x] **Step 1: Read the current DOCS tab section first**

Find `{/* ─── DOCS TAB ─────` — confirm the exact current markup (the
`ocrExpandedDocId`-driven conditional row and the EXTRACT TEXT/VIEW TEXT
button from the 4b plan) before editing; line numbers have shifted.

- [x] **Step 2: Add dialog state, import, and remove the 4b inline-row machinery**

Add `import { DocVerifyDialog } from '@/components/DocVerifyDialog';` and
`import { verifyDoc } from '@/lib/dataStore';` is not needed directly here
(the dialog owns that call) — only import `DocVerifyDialog`.

Replace the existing `ocrExpandedDocId`/`ocrRunningDocId` state pair:

```typescript
  const [ocrExpandedDocId, setOcrExpandedDocId] = useState<string | null>(null);
  const [ocrRunningDocId, setOcrRunningDocId] = useState<string | null>(null);
```

with:

```typescript
  const [verifyDocId, setVerifyDocId] = useState<string | null>(null);
  const [ocrRunningDocId, setOcrRunningDocId] = useState<string | null>(null);
```

Update `handleRunOcr` (it previously set `ocrExpandedDocId` after a
successful extraction to auto-open the inline row — that inline row is
gone now, so it should do nothing further after `reload()`, letting the
coordinator click VERIFY themselves once they see the result):

```typescript
  const handleRunOcr = async (docId: string) => {
    setOcrRunningDocId(docId);
    try {
      await runDocOcr(docId);
      await reload();
    } finally {
      setOcrRunningDocId(null);
    }
  };
```

- [x] **Step 3: Replace the action button and remove the inline OCR-result row**

Replace the per-row action cell (from the 4b plan):

```tsx
                          <TableCell className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => downloadDocFile(doc.DocID, doc.FileName)}>DOWNLOAD</Button>
                            {(doc.MimeType === 'image/jpeg' || doc.MimeType === 'image/png') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => (doc.OcrStatus ? setOcrExpandedDocId(ocrExpandedDocId === doc.DocID ? null : doc.DocID) : handleRunOcr(doc.DocID))}
                                disabled={ocrRunningDocId === doc.DocID}
                              >
                                {ocrRunningDocId === doc.DocID ? 'EXTRACTING…' : doc.OcrStatus ? (ocrExpandedDocId === doc.DocID ? 'HIDE TEXT' : 'VIEW TEXT') : 'EXTRACT TEXT'}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={async () => { await deleteDoc(doc.DocID); await reload(); }}>DELETE</Button>
                          </TableCell>
```

with:

```tsx
                          <TableCell className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => downloadDocFile(doc.DocID, doc.FileName)}>DOWNLOAD</Button>
                            {(doc.MimeType === 'image/jpeg' || doc.MimeType === 'image/png') && (
                              doc.OcrStatus === 'Complete' ? (
                                <Button size="sm" variant="outline" onClick={() => setVerifyDocId(doc.DocID)}>
                                  {doc.VerifiedAt ? 'RE-VERIFY' : 'VERIFY'}
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => handleRunOcr(doc.DocID)} disabled={ocrRunningDocId === doc.DocID}>
                                  {ocrRunningDocId === doc.DocID ? 'EXTRACTING…' : 'EXTRACT TEXT'}
                                </Button>
                              )
                            )}
                            {doc.VerifiedAt && <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[9px]">VERIFIED</Badge>}
                            <Button size="sm" variant="outline" onClick={async () => { await deleteDoc(doc.DocID); await reload(); }}>DELETE</Button>
                          </TableCell>
```

(Deliberate behavior change from 4b: `doc.OcrStatus === 'Complete'` is the
only condition that shows VERIFY/RE-VERIFY. A `'Failed'` OCR status falls
through to EXTRACT TEXT again, letting the coordinator retry — this is a
small improvement over 4b's original condition, which showed a "VIEW TEXT"
toggle for a failed OCR even though `ocrText` would be `null` in that case,
i.e. a button that opened nothing useful. 4b never specified retry
behavior at all, so this isn't a contradiction of that plan, just a gap it
left that this slice closes sensibly.)

Remove the entire conditional OCR-result `<TableRow>` block that followed
each row in the 4b markup (the one with `{ocrExpandedDocId === doc.DocID &&
doc.OcrStatus && (...)}`) — the `DocVerifyDialog` replaces it. Since that
row's removal means each `docs.map(doc => (...))` iteration now renders
only a single `<TableRow>`, the `Fragment key={doc.DocID}` wrapper added in
the 4b plan is no longer structurally necessary (a single element per
iteration doesn't need a Fragment) — you may simplify back to `<TableRow
key={doc.DocID}>` directly, or leave the `Fragment` wrapper in place if
simpler to edit incrementally; either is correct, prefer the simplification
if the diff stays small.

- [x] **Step 4: Render the dialog**

At the end of the DOCS tab's `<TabsContent>` (as a sibling to the existing
cards, not nested inside the table), add:

```tsx
          {verifyDocId && (
            <DocVerifyDialog
              doc={docs.find((d) => d.DocID === verifyDocId)!}
              open={!!verifyDocId}
              onClose={() => setVerifyDocId(null)}
              onSaved={reload}
            />
          )}
```

- [x] **Step 5: Verify — build**

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [x] **Step 6: Verify — manual browser check**

Log in, open a trip's DOCS tab, upload an image, EXTRACT TEXT, then VERIFY
— confirm the dialog opens with the raw text, pre-filled fields (if any),
and a Valid Until input. Edit a field, set a date, Save — confirm the
VERIFIED badge appears and the button becomes RE-VERIFY. Click RE-VERIFY —
confirm the dialog pre-fills from the saved `VerifiedFields`, not the
original OCR guess.

- [x] **Step 7: Snapshot (no git commit)**

---

### Task 4: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in every prior plan in this repo: this task
produces no diff of its own, so it's performed directly by the controller
rather than dispatched to an implementer, and has no task review of its own.

- [x] **Step 1:** `npm run build` — exits 0 (verify `nest build` and
  `build:client` separately if the Windows Prisma-EPERM file-lock issue
  recurs, same as every prior slice).
- [x] **Step 2:** Start the stack. Confirm the OCR worker still boots
  cleanly (log line from 4b) — this slice doesn't touch `OcrService`, so
  this just confirms nothing regressed.
- [x] **Step 3:** Live walkthrough via the API (curl/Invoke-RestMethod with
  a locally-minted bearer token, same fallback used for every prior slice
  if browser login credentials aren't available): upload an image, OCR it,
  `PATCH .../verify` with a field list and a validUntil date, confirm the
  response shows `verifiedFields`/`verifiedBy`/`verifiedAt` populated and
  `validUntil` updated; confirm a second verify call overwrites the first
  correctly (no accumulation/duplication); confirm the audit log shows a
  `Verified` entry. And, if possible, the browser flow from Task 3 Step 6.
- [x] **Step 4:** Report: build status, which checks passed, any deviations
  ledgered as rulings.

---

## Completion notes (2026-08-25)

**Execution approach**: executed directly by the controller (this
session), same as every prior slice, task by task, verified via build
after each.

**One ruling during Task 3**: the plan's Step 3 offered a choice — keep
the `Fragment key={doc.DocID}` wrapper from 4b or simplify back to a plain
`<TableRow key={doc.DocID}>` now that each row iteration renders a single
element again. Took the simplification (per the plan's own "prefer the
simplification if the diff stays small" guidance), which left the
`Fragment` import unused — caught immediately by `tsc` (`noUnusedLocals`)
and removed from the import line. Not a deviation from the plan, just
resolving the choice it explicitly left open.

**Verified (Tasks 1–4)**:
- `npx nest build` and `npm run build:client` both clean.
- Server boots correctly with all routes registered, including
  `PATCH /api/docs/:docId/verify`; OCR worker still initializes cleanly
  (unaffected by this slice, as expected — it doesn't touch `OcrService`).
- Live API walkthrough: uploaded a synthetic "MEDICAL CERTIFICATE / CLASS
  ONE - VALID" test image (generated via PowerShell `System.Drawing`, same
  approach as 4b), ran OCR (extracted the text perfectly — no MRZ, so
  `ocrStructuredFields` was `null` as expected for a non-passport doc),
  then `PATCH .../verify` with two manually-entered fields and a
  `validUntil` date — confirmed the response showed
  `verifiedFields`/`verifiedBy`/`verifiedAt` populated and `validUntil`
  updated to the submitted date.
  - Ran a **second** verify call with a different field set, different
    `verifiedBy`, and a different date — confirmed the record fully
    replaced the previous values (3 fields instead of 2, new `verifiedBy`,
    new `validUntil`) rather than accumulating or merging, matching the
    "no versioning, overwrite on save" design decision.
  - Confirmed via `GET /api/audit/Doc/:docId` that both verify calls each
    logged a distinct `Verified` audit entry (alongside the original
    `Uploaded` entry), in correct chronological order.
- Test document and local scratch PNG file cleaned up after verification;
  `uploads/` confirmed empty again.
- Browser-based manual verification (Task 3 Step 6) was **not**
  performed — no login credentials available to this session, same
  limitation as every prior slice.

**No rulings beyond the one noted above were needed.**
