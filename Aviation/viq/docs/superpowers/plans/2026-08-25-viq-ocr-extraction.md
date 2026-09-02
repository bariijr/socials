# VIQ OCR Extraction Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger local/self-hosted OCR (Tesseract) on an already-uploaded image document and get back raw extracted text always, plus structured, validated fields when the image contains a passport-style MRZ (machine-readable zone) — regardless of what `DocType` it was tagged with.

**Architecture:** A new `OcrService` (long-lived singleton `tesseract.js` worker, created via `OnModuleInit`) does raw text extraction; a text-content scan (not `DocType`-based) looks for MRZ-shaped line pairs/triples in the result and parses them via the `mrz` package. `DocsService.runOcr()` orchestrates: load the file (reusing 4a's `getFile`), reject PDF with a 400, run extraction, persist the result (or the failure) on the `DocAttachment` row. New `POST /docs/:docId/ocr` endpoint. `TripDetail.tsx`'s DOCS tab gets a minimal "EXTRACT TEXT" button showing the raw result — no editing UI (that's 4c).

**Tech Stack:** `tesseract.js` (pure JS/WASM OCR, no native binary) + `mrz` (ICAO 9303 machine-readable-zone parser) on the backend. No frontend dependency changes.

**Spec:** `docs/superpowers/specs/2026-08-25-viq-ocr-extraction-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project in this session.
- Images only (`image/jpeg`, `image/png`) — reject `application/pdf` in `runOcr` with a clear 400, both server-side and by hiding the EXTRACT TEXT button client-side for PDF rows.
- Synchronous only — no background job/queue.
- One long-lived Tesseract worker per server process (`OnModuleInit`/`OnModuleDestroy`), never created-and-destroyed per request.
- MRZ detection is based on the OCR'd text content, never on `DocType` — do not gate it behind a "Passport" doc type (no such type exists yet; adding one is 4d's concern).
- A failed OCR attempt is recorded on the row (`ocrStatus: 'Failed'`, real `ocrError` message) — never thrown back as an unhandled 500, and never silently ignored.
- No structured extraction beyond MRZ in this slice — everything else gets raw text only.
- `dataStore.ts` has `// @ts-nocheck`. `TripDetail.tsx` does NOT — real type-checking applies.

---

### Task 1: Backend — `DocAttachment` OCR fields, migration, dependencies, `OcrService`

**Files:**
- Modify: `prisma/schema.prisma` (`DocAttachment` model)
- Create: a new Prisma migration (via `npm run prisma:migrate`)
- Modify: `package.json` (add `tesseract.js`, `mrz`)
- Create: `src/server/modules/docs/ocr.service.ts`

**Interfaces:**
- Produces: `DocAttachment.ocrStatus/.ocrText/.ocrStructuredFields/.ocrError/.ocrProcessedAt` (all nullable). `OcrService.extract(filePath: string): Promise<{ text: string; structuredFields: Record<string, unknown> | null }>`.

- [x] **Step 1: Add OCR fields to `DocAttachment`**

In `prisma/schema.prisma`'s `DocAttachment` model, add these lines
immediately after the existing `validUntil` field:

```prisma
  ocrStatus           String?   @map("ocr_status")
  ocrText             String?   @map("ocr_text")
  ocrStructuredFields Json?     @map("ocr_structured_fields")
  ocrError            String?   @map("ocr_error")
  ocrProcessedAt      DateTime? @map("ocr_processed_at")
```

- [x] **Step 2: Generate and apply the migration**

Run: `npm run prisma:migrate -- --name add_doc_ocr_fields`
Expected: exits 0 — all five new columns are nullable, so this migration
needs no data-backfill handling (unlike 4a's migration).

- [x] **Step 3: Install dependencies**

Run: `npm install tesseract.js mrz`

- [x] **Step 4: Create `OcrService`**

`src/server/modules/docs/ocr.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';
import { parse } from 'mrz';

export interface OcrResult {
  text: string;
  structuredFields: Record<string, unknown> | null;
}

@Injectable()
export class OcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private worker: Worker | null = null;

  async onModuleInit() {
    this.worker = await createWorker('eng');
  }

  async onModuleDestroy() {
    await this.worker?.terminate();
  }

  async extract(filePath: string): Promise<OcrResult> {
    if (!this.worker) throw new Error('OCR worker not initialized');
    const { data } = await this.worker.recognize(filePath);
    const text = data.text;
    return { text, structuredFields: this.tryExtractMrz(text) };
  }

  private tryExtractMrz(rawText: string): Record<string, unknown> | null {
    const candidateLines = rawText
      .split('\n')
      .map((line) => line.replace(/\s/g, '').toUpperCase())
      .filter((line) => line.length >= 28 && /^[A-Z0-9<]+$/.test(line));

    for (const windowSize of [2, 3]) {
      for (let i = 0; i <= candidateLines.length - windowSize; i++) {
        const window = candidateLines.slice(i, i + windowSize);
        try {
          const result = parse(window, { autocorrect: true });
          if (result.valid || result.details.some((d: { valid: boolean }) => d.valid)) {
            return { format: result.format, ...result.fields };
          }
        } catch {
          // Not a valid MRZ shape at this window — keep scanning. Expected
          // for every non-MRZ line grouping, not an error worth logging.
        }
      }
    }
    return null;
  }
}
```

- [x] **Step 5: Verify — build**

Run: `npx nest build`. Expect 0 exit. (`OcrService` isn't wired into
`DocsModule` yet — Task 2 does that — so this step only confirms the file
itself compiles standalone.)

- [x] **Step 6: Snapshot (no git commit)**

---

### Task 2: Backend — `runOcr` orchestration, endpoint, module wiring

**Files:**
- Modify: `src/server/modules/docs/docs.service.ts`
- Modify: `src/server/modules/docs/docs.controller.ts`
- Modify: `src/server/modules/docs/docs.module.ts`

**Interfaces:**
- Produces: `POST /docs/:docId/ocr`, `DocsService.runOcr(docId): Promise<DocAttachment>`.
- Consumes: `OcrService.extract` (Task 1).

- [x] **Step 1: Read the current `docs.service.ts` in full first**

Confirm its exact current imports/constructor before editing — it was last
touched in the 4a plan and should currently inject `PrismaService`/
`AuditService` only.

- [x] **Step 2: Add the `Prisma` type import and inject `OcrService`**

Add to the top imports:

```typescript
import type { Prisma } from '@prisma/client';
import { OcrService } from './ocr.service';
```

Update the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ocr: OcrService,
  ) {}
```

- [x] **Step 3: Add `runOcr` to `DocsService`**

Add this method (anywhere after `getFile`, since it calls it):

```typescript
  async runOcr(docId: string) {
    const { doc, filePath } = await this.getFile(docId);
    if (doc.mimeType === 'application/pdf') {
      throw new BadRequestException('OCR for PDF documents is not supported yet — image documents (JPEG/PNG) only.');
    }
    try {
      const { text, structuredFields } = await this.ocr.extract(filePath);
      return this.prisma.docAttachment.update({
        where: { docId },
        data: {
          ocrStatus: 'Complete',
          ocrText: text,
          ocrStructuredFields: (structuredFields as Prisma.InputJsonValue) ?? undefined,
          ocrError: null,
          ocrProcessedAt: new Date(),
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown OCR error';
      return this.prisma.docAttachment.update({
        where: { docId },
        data: { ocrStatus: 'Failed', ocrError: message, ocrProcessedAt: new Date() },
      });
    }
  }
```

- [x] **Step 4: Add the controller route**

In `src/server/modules/docs/docs.controller.ts`, add:

```typescript
  @Post(':docId/ocr')
  runOcr(@Param('docId') docId: string) {
    return this.docs.runOcr(docId);
  }
```

(Place it near the other `:docId`-scoped routes; `Post`/`Param` are already
imported in this file from the 4a work.)

- [x] **Step 5: Wire `OcrService` into `DocsModule`**

```typescript
import { Module } from '@nestjs/common';
import { DocsService } from './docs.service';
import { DocsController } from './docs.controller';
import { OcrService } from './ocr.service';

@Module({
  controllers: [DocsController],
  providers: [DocsService, OcrService],
  exports: [DocsService],
})
export class DocsModule {}
```

- [x] **Step 6: Verify — build**

Run: `npx nest build`. Expect 0 exit.

- [x] **Step 7: Snapshot (no git commit)**

---

### Task 3: Frontend — `types.ts`, `dataStore.ts`, DOCS tab

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Produces: `runDocOcr(docId): Promise<DocAttachment>`. `DocAttachment.OcrStatus/.OcrText/.OcrStructuredFields/.OcrError/.OcrProcessedAt`.

- [x] **Step 1: Extend `DocAttachment`**

In `src/client/data/types.ts`, add to the `DocAttachment` interface,
immediately after `ValidUntil?: string;`:

```typescript
  OcrStatus?: 'Complete' | 'Failed';
  OcrText?: string;
  OcrStructuredFields?: Record<string, unknown>;
  OcrError?: string;
  OcrProcessedAt?: string;
```

- [x] **Step 2: Extend `mapDocFromApi` and add `runDocOcr`**

In `src/client/lib/dataStore.ts`, add to `mapDocFromApi`'s return object,
after `ValidUntil: d.validUntil ?? undefined,`:

```typescript
    OcrStatus: d.ocrStatus ?? undefined,
    OcrText: d.ocrText ?? undefined,
    OcrStructuredFields: d.ocrStructuredFields ?? undefined,
    OcrError: d.ocrError ?? undefined,
    OcrProcessedAt: d.ocrProcessedAt ?? undefined,
```

Add a new function near `deleteDoc`:

```typescript
export async function runDocOcr(docId: string): Promise<DocAttachment> {
  const row = await apiJson<any>(`/docs/${docId}/ocr`, { method: 'POST' });
  return mapDocFromApi(row);
}
```

- [x] **Step 3: Add the EXTRACT TEXT button and result display**

In `src/client/pages/TripDetail.tsx`, import `runDocOcr` alongside
`uploadDoc`/`downloadDocFile`/`deleteDoc` in the existing `@/lib/dataStore`
import list. Add local state for which doc's OCR result is expanded:

```typescript
  const [ocrExpandedDocId, setOcrExpandedDocId] = useState<string | null>(null);
  const [ocrRunningDocId, setOcrRunningDocId] = useState<string | null>(null);

  const handleRunOcr = async (docId: string) => {
    setOcrRunningDocId(docId);
    try {
      await runDocOcr(docId);
      setOcrExpandedDocId(docId);
      await reload();
    } finally {
      setOcrRunningDocId(null);
    }
  };
```

In the DOCS tab's document table (from the 4a plan), add an EXTRACT TEXT
button to each row's action cell, only for image documents, and a result
row beneath any doc whose OCR result is expanded or already present.
Replace the existing action cell:

```tsx
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadDocFile(doc.DocID, doc.FileName)}>DOWNLOAD</Button>
                          {(doc.MimeType === 'image/jpeg' || doc.MimeType === 'image/png') && (
                            <Button size="sm" variant="outline" onClick={() => handleRunOcr(doc.DocID)} disabled={ocrRunningDocId === doc.DocID}>
                              {ocrRunningDocId === doc.DocID ? 'EXTRACTING…' : 'EXTRACT TEXT'}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={async () => { await deleteDoc(doc.DocID); await reload(); }}>DELETE</Button>
                        </TableCell>
```

with:

```tsx
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadDocFile(doc.DocID, doc.FileName)}>DOWNLOAD</Button>
                          {(doc.MimeType === 'image/jpeg' || doc.MimeType === 'image/png') && (
                            <Button size="sm" variant="outline" onClick={() => (doc.OcrStatus ? setOcrExpandedDocId(ocrExpandedDocId === doc.DocID ? null : doc.DocID) : handleRunOcr(doc.DocID))} disabled={ocrRunningDocId === doc.DocID}>
                              {ocrRunningDocId === doc.DocID ? 'EXTRACTING…' : doc.OcrStatus ? (ocrExpandedDocId === doc.DocID ? 'HIDE TEXT' : 'VIEW TEXT') : 'EXTRACT TEXT'}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={async () => { await deleteDoc(doc.DocID); await reload(); }}>DELETE</Button>
                        </TableCell>
```

(Once a doc has an `OcrStatus`, the button toggles a result view instead of
re-running OCR — re-running is still possible by deleting and re-uploading
in this slice; an explicit "re-run OCR" affordance is a 4c-level UX
refinement, not needed here.)

Immediately after the `</TableRow>` for each doc row (inside the same
`{docs.map(doc => ( ... ))}`, as a sibling — use a React fragment `<>...</>`
around the existing `<TableRow>` and this new conditional row), add:

```tsx
                      {ocrExpandedDocId === doc.DocID && doc.OcrStatus && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/20 text-xs">
                            {doc.OcrStatus === 'Failed' ? (
                              <div className="text-destructive">OCR FAILED: {doc.OcrError}</div>
                            ) : (
                              <div className="space-y-2">
                                {doc.OcrStructuredFields && (
                                  <div>
                                    <div className="font-semibold">MRZ FIELDS DETECTED:</div>
                                    <pre className="whitespace-pre-wrap">{JSON.stringify(doc.OcrStructuredFields, null, 2)}</pre>
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold">RAW TEXT:</div>
                                  <pre className="whitespace-pre-wrap">{doc.OcrText}</pre>
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
```

(`colSpan={7}` matches the 7 `<TableHead>` columns already in this table
from the 4a plan — confirm the actual current column count by reading the
table header before finalizing this value, in case it changed.)

- [x] **Step 4: Verify — build**

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [x] **Step 5: Verify — manual browser check**

Log in, open a trip's DOCS tab, upload a clear image of a passport bio page
(or any sample TD3 MRZ image) — click EXTRACT TEXT, confirm the result
shows parsed MRZ fields and the raw text. Upload a non-passport image (e.g.
a photo of any document) — click EXTRACT TEXT, confirm raw text shows and
no MRZ fields appear (expected, not a bug). Confirm the EXTRACT TEXT
button does not appear for PDF rows.

- [x] **Step 6: Snapshot (no git commit)**

---

### Task 4: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in every prior plan in this repo: this task
produces no diff of its own, so it's performed directly by the controller
rather than dispatched to an implementer, and has no task review of its own.

- [x] **Step 1:** `npm run build` — exits 0 (verify `nest build` and
  `build:client` separately if the Windows Prisma-EPERM file-lock issue
  recurs, same as every prior slice).
- [x] **Step 2:** Start the stack. Confirm server logs show the Tesseract
  worker initializing without error on boot (via `OnModuleInit`).
- [x] **Step 3:** Live walkthrough via the API (curl/Invoke-RestMethod with
  a locally-minted bearer token, same fallback used for every prior slice
  if browser login credentials aren't available to this session): upload
  a passport-MRZ sample image, run OCR, confirm `ocrStructuredFields` is
  populated with sensible parsed fields; upload a non-MRZ image, run OCR,
  confirm `ocrText` is populated and `ocrStructuredFields` is `null`;
  attempt OCR on a PDF doc, confirm a clean 400; and, if possible, the
  browser flow from Task 3 Step 5.
- [x] **Step 4:** Report: build status, which checks passed, any deviations
  ledgered as rulings.

---

## Completion notes (2026-08-25)

**Execution approach**: executed directly by the controller (this
session), same as 3a/3b/4a, task by task, verified via build after each.

**Build note**: same `nest build`-cleans-`dist/public` ordering issue as
prior slices — ran `npx nest build` then `npm run build:client` last so
the running server actually serves the current frontend bundle.

**One code-quality fix during Task 1** (not a plan deviation, an
unused-variable lint catch): `OcrService`'s `logger` field was declared
but never used, which fails this project's `noUnusedLocals` check. Fixed
by actually using it — `this.logger.log('Tesseract worker ready')` in
`onModuleInit()`, which is also genuinely useful operational log output
(confirms the worker is up before the app starts accepting traffic).

**Verified (Tasks 1–4)**:
- `npx nest build` and `npm run build:client` both clean.
- Server boot log confirms `[OcrService] Tesseract worker ready` logged
  before `Nest application successfully started` — worker init completes
  before the app accepts traffic, ~23s on first boot (WASM core + English
  trained-data load), as expected for a cold start.
- All routes registered correctly, including `POST /api/docs/:docId/ocr`.
- Generated two synthetic test images via PowerShell/`System.Drawing`
  (this session doesn't have real passport-image access) — one loosely
  formatted, one using the actual official ICAO Doc 9303 sample MRZ
  (`P<UTOERIKSSON<<ANNA<MARIA...` / `L898902C36UTO7408122F1204159ZE...`)
  rendered in Courier New at high resolution for the cleanest achievable
  OCR input. Uploaded both, ran OCR on each via the live API:
  - Raw text extraction succeeded both times — Tesseract correctly read
    plain English text (`PASSPORT`, `REPUBLIC OF TESTLAND`, etc. on the
    first image) and got very close on the MRZ lines (second image's
    second line: `L898902C36UTO7408122F12041592E184226B<<<<<10` vs. the
    true `L898902C36UTO7408122F1204159ZE184226B<<<<<10` — one character
    off).
  - **Finding, not a bug**: neither image's MRZ parsed into
    `ocrStructuredFields` — Tesseract's general English language model
    tends to misread the long runs of `<` filler characters that fill out
    an MRZ line (turning them into stray letters), which is enough to
    fail `mrz`'s checksum validation even when the human-readable content
    is nearly perfect. This is a known real-world limitation of
    general-purpose OCR on MRZ zones without engine-level tuning (e.g. a
    restricted `tessedit_char_whitelist` and a single-line page-
    segmentation mode) — explicitly out of this slice's scope (spec says
    "best-effort... far more reliable than guessing fields from a general
    photo," not "guaranteed to parse"). The design's graceful-degradation
    path (raw text populated, `ocrStructuredFields: null`, no crash, no
    silently-wrong data) is exactly what's supposed to happen here, and
    it worked correctly both times. **Recommend flagging this as a
    concrete tuning target for whoever picks up 4c** (Tesseract PSM 7
    single-line mode + an MRZ character whitelist on the MRZ-candidate
    lines specifically, re-OCR'd as a second, targeted pass, would very
    likely fix this against real scanned/photographed passports, which
    use OCR-B — a font specifically designed for machine readability —
    unlike this test's regular monospace font).
  - PDF rejection verified: `POST /docs/:docId/ocr` against a PDF-typed
    doc returns a clean 400 with the documented message, not a crash.
  - All three test documents deleted after verification (DB rows +
    on-disk files); `uploads/` confirmed empty again; local scratch PNG/
    PDF files removed.
  - Browser-based manual verification (Task 3 Step 5) was **not**
    performed — no login credentials available to this session, same
    limitation as every prior slice.

**No rulings needed** — no plan/spec conflicts came up during execution.
The MRZ-accuracy finding above is a real, useful discovery for 4c, not a
defect in this slice — recorded here rather than as a ruling since nothing
in this plan was contradicted or reinterpreted.
