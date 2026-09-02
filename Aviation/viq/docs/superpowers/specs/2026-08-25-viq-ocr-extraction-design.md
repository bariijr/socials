# VIQ OCR Extraction Service (Sub-project 4b of the document-intelligence initiative)

## Context

Sub-project 4a (file storage + upload infrastructure) is complete —
`DocAttachment` now backs a real stored file, generalized to Trip/Person/
Aircraft scope. This slice adds the OCR extraction step items 13/14 asked
for: run OCR on an uploaded document and produce something for a human to
verify. Per explicit user decision during brainstorming: **local/
self-hosted OCR (Tesseract), no external API, nothing leaves this
machine.**

The next slice (4c) builds the actual verify-before-save editable preview
UI on top of whatever this slice produces. This slice's job is only to
produce trustworthy extracted data — not to build the review screen.

Per explicit user instruction (carried over from every prior sub-project in
this session): **do not `git commit` any of this work.**

## Goal

For an already-uploaded image document (JPEG/PNG), a coordinator can
trigger OCR and get back: the raw extracted text always, and — when the
document contains a passport-style machine-readable zone (MRZ), regardless
of what `DocType` it was tagged with — structured, validated fields
(document number, name, nationality, date of birth, sex, expiry date)
parsed from that MRZ, which is far more reliable than guessing fields from
a general photo. Everything else stays raw text for a human to read and
transcribe in 4c's review screen.

## Design decisions (confirmed with user during brainstorming, or decided during this spec with reasoning)

- **Images only in this slice** (`image/jpeg`, `image/png`) — confirmed via
  `tesseract.js`'s own documentation: "Tesseract.js does not support PDF
  files." PDF OCR needs a separate page-rasterization step (Poppler/
  ImageMagick or a canvas-based PDF renderer), each a native-dependency
  risk on Windows dev machines. Out of scope here; a clean fast-follow
  once this path is proven. `POST /docs/:docId/ocr` rejects a PDF doc with
  a clear 400, not a silent no-op.
- **`tesseract.js`, not a native-binary wrapper** (e.g. `node-tesseract-ocr`)
  — pure JS/WASM, no separate system Tesseract install required, meaningfully
  lower setup friction on Windows than a native-binary dependency.
- **Synchronous**, not a background job/queue. `POST /docs/:docId/ocr`
  runs OCR and returns the result in the same HTTP response. Appropriate
  for this app's local, non-high-throughput reality; a single-page image
  typically completes in a few seconds. Revisit only if real usage shows
  this is too slow.
- **A long-lived singleton Tesseract worker**, not one created-and-
  destroyed per request — `OcrService` creates its worker once via
  `OnModuleInit` and reuses it for every OCR call (worker startup/language-
  data loading has real overhead; re-paying it per request would make an
  already-synchronous flow slower for no benefit). Terminated via
  `OnModuleDestroy`.
- **MRZ detection is text-content-based, not `DocType`-based.** Nothing in
  today's `DocType` list is `"Passport"` — adding that classification is
  Person-schema territory (4d), not this slice's concern. Instead, after
  raw OCR text is extracted, the service always scans it for MRZ-shaped
  lines and attempts to parse them via the `mrz` npm package (which
  auto-detects TD1/TD2/TD3 format); if that succeeds, `ocrStructuredFields`
  is populated regardless of what `DocType` was chosen at upload. If it
  fails or no MRZ-shaped lines are found, `ocrStructuredFields` stays
  `null` — this is the expected, normal case for every non-passport
  document, not an error.
- **English only** for this slice — Tesseract needs per-language trained
  data; aviation documents are near-universally in English or carry English
  alongside a local language (passports especially, by ICAO convention).
  Multi-language support is a future enhancement if a real document proves
  to need it.
- **New endpoint, not folded into `POST /docs/upload`.** Keeps 4a's
  already-verified upload path completely untouched; OCR is triggered
  explicitly and separately (`POST /docs/:docId/ocr`), matching 4c's
  described flow of "upload, *then* OCR runs."
- **Minimal UI hook only** — an "EXTRACT TEXT" button on `TripDetail.tsx`'s
  DOCS tab that calls the endpoint and shows the raw result inline. The
  actual editable verify-and-correct screen is 4c's deliverable, not this
  one — this slice proves the extraction pipeline works end-to-end without
  building the UI that consumes it for real.

## Backend

### `DocAttachment` schema changes

```prisma
  ocrStatus           String?   @map("ocr_status")            // 'Complete' | 'Failed'
  ocrText             String?   @map("ocr_text")
  ocrStructuredFields Json?     @map("ocr_structured_fields")   // MRZ-parsed fields when detected; null otherwise
  ocrError            String?   @map("ocr_error")               // populated only when ocrStatus = 'Failed'
  ocrProcessedAt      DateTime? @map("ocr_processed_at")
```

All four nullable — a freshly-uploaded (not-yet-OCR'd) document has all four
`null`, distinguishable from one that was OCR'd and found nothing useful
(`ocrStatus = 'Complete'`, `ocrText` present, `ocrStructuredFields = null`).

Run: `npm run prisma:migrate -- --name add_doc_ocr_fields`

### New dependencies

`npm install tesseract.js mrz`

### `OcrService`

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
          // Not a valid MRZ shape at this window — keep scanning. This is
          // the expected outcome for every non-MRZ line grouping, not a
          // logged error.
        }
      }
    }
    return null;
  }
}
```

(`worker.recognize` accepts a file path directly per `tesseract.js`'s
documented API — no need to read the file into a buffer first.)

### `DocsService` gains `runOcr`

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

(Inject `OcrService` into `DocsService`'s constructor alongside `PrismaService`/
`AuditService`. A failed OCR attempt is recorded on the row, not thrown back
as an HTTP error — the upload itself succeeded; OCR failing is a normal,
expected-to-happen-sometimes outcome the caller needs to see on the record,
same reasoning as `Comm.Status = 'Failed'` for a failed send.)

### `DocsModule`

Add `OcrService` to `providers` and `exports`.

### Controller

Add to `DocsController`:

```typescript
@Post(':docId/ocr')
runOcr(@Param('docId') docId: string) {
  return this.docs.runOcr(docId);
}
```

## Frontend

### `types.ts`

```typescript
  OcrStatus?: 'Complete' | 'Failed';
  OcrText?: string;
  OcrStructuredFields?: Record<string, unknown>;
  OcrError?: string;
  OcrProcessedAt?: string;
```

added to `DocAttachment`, and to `mapDocFromApi` in `dataStore.ts`:

```typescript
    OcrStatus: d.ocrStatus ?? undefined,
    OcrText: d.ocrText ?? undefined,
    OcrStructuredFields: d.ocrStructuredFields ?? undefined,
    OcrError: d.ocrError ?? undefined,
    OcrProcessedAt: d.ocrProcessedAt ?? undefined,
```

### `dataStore.ts`

```typescript
export async function runDocOcr(docId: string): Promise<DocAttachment> {
  const row = await apiJson<any>(`/docs/${docId}/ocr`, { method: 'POST' });
  return mapDocFromApi(row);
}
```

### `TripDetail.tsx` DOCS tab

Add an "EXTRACT TEXT" button next to DOWNLOAD/DELETE on each row (only for
`image/jpeg`/`image/png` docs — hide it for `application/pdf` rows rather
than showing a button that always 400s). Clicking it calls `runDocOcr`,
reloads, and the row shows a small result summary: `ocrStatus` badge, and —
when present — the parsed MRZ fields as a compact key/value list, or a
"View extracted text" disclosure showing `OcrText` verbatim otherwise. No
editing here — this is a raw-result preview only, matching this slice's
scope; 4c replaces this with the real editable verify screen.

## Testing

No test framework in this project — manual verification:

```powershell
npm run build
npm run start:prod
# 1. Upload a clear photo/scan of a passport bio page (or any TD3-format
#    sample MRZ image) as a JPEG. Click EXTRACT TEXT.
#    Confirm ocrStatus = Complete, ocrText is non-empty, and
#    ocrStructuredFields contains parsed passport fields (documentNumber,
#    firstName/lastName, birthDate, sex, expirationDate, nationality).
# 2. Upload a JPEG/PNG of any non-passport document (e.g. a photographed
#    certificate). Click EXTRACT TEXT. Confirm ocrStatus = Complete,
#    ocrText is non-empty, ocrStructuredFields is null — this is success,
#    not a bug.
# 3. Attempt OCR on a PDF doc (upload one via the existing PDF-allowed
#    upload path from 4a) — confirm POST /docs/:docId/ocr returns a clean
#    400, not a crash, and the DOCS tab hides the EXTRACT TEXT button for
#    PDF rows in the first place.
# 4. Upload a corrupted/unreadable image (e.g. a text file renamed to
#    .jpg — this will pass 4a's MIME check based on Content-Type but fail
#    inside Tesseract) — confirm ocrStatus ends up Failed with a non-empty
#    ocrError, not a 500 or a hung request.
```

## Out of scope

- PDF OCR (needs a rasterization step — separate slice).
- The editable verify-before-save UI (4c).
- Any structured extraction beyond MRZ (medical certs, licenses, aircraft
  docs get raw text only — no per-authority layout heuristics, no LLM
  field-guessing).
- Multi-language OCR.
- Async/background job processing — revisit only if synchronous proves too
  slow in practice.
- Assigning/linking extracted data to a Person record (4d) or acting on
  expiry dates found in structured fields (4d).

## Do not

- Do not `git commit`.
- Do not accept PDF in `runOcr` — reject with a clear 400.
- Do not silently swallow an OCR failure — record `ocrStatus: 'Failed'` and
  a real `ocrError` message on the row every time.
- Do not create/destroy a Tesseract worker per request — one long-lived
  worker per server process, per the design decision above.
- Do not attempt structured field extraction for non-MRZ documents in this
  slice, even if it looks easy for one sample document — that's exactly
  the fragile-per-authority-format trap this spec explicitly scoped out.
