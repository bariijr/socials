# VIQ Document Intelligence — OCR/Extraction (Phase 2)

## Context

Phase 1 (Foundation, shipped 2026-08-29) built a new, fully parallel
`documents` module — `Document`/`DocumentVersion`/`DocumentSection`/
`DocumentEntityLink`/`DocumentFamily`/`DocumentTypeDefinition`/
`DocumentProcessingJob` — alongside the untouched legacy `docs` module/
`DocAttachment` model, with a BullMQ+Redis job queue whose processor was
an intentional stub: every job walks straight to `READY_FOR_REVIEW` with
no real OCR, extraction, or security check. Phase 1's own spec named this
exact gap as "Phase 2."

This phase is not starting from zero. Before the `documents` rebuild was
decided, three sub-projects (4a-4c) already shipped real, working
document-intelligence capability against the *old* `DocAttachment` model:
file storage/upload (4a), Tesseract.js OCR with PDF text-layer-or-
rasterize fallback and generic MRZ (machine-readable-zone) passport
detection (4b, `src/server/modules/docs/ocr.service.ts`), and a
verify-before-save UI (4c, `DocVerifyDialog.tsx`). None of that is
touched by this phase — it stays serving the old model exactly as today.
This phase ports 4b's extraction logic onto the new schema; it does not
rebuild OCR from scratch.

Confirmed during brainstorming:
- **Security scanning is real, not a passthrough.** No virus/malware
  scanning exists anywhere in this codebase today (confirmed by grep).
  This phase adds a real ClamAV-backed scan as the pipeline's first real
  step, matching the `SECURITY_SCAN` → `SECURITY_REJECTED` states Phase
  1's stub already reserved but never used.
- **Scope is images + PDF only.** The old `OcrService` also handles DOCX
  and plain text; this phase ports only the image and PDF paths (with
  PDF's existing text-layer-or-rasterize-and-OCR fallback, multi-page,
  intact). DOCX/plain-text support is deferred to a later phase if a real
  document family turns out to need it.
- **Encrypted PDFs fail cleanly, no new UI.** The old flow let a
  synchronous on-demand OCR request carry a password. This phase's
  pipeline is an async queued job with nobody present to supply one — an
  encrypted PDF throws a caught, explicit error (`PROCESSING_FAILED`,
  "password-protected, needs manual OCR") rather than growing a new
  upload-time password field.
- **No new API endpoint.** `GET /api/documents/:id` already returns
  `versions: true`, which will include the newly-populated `ocrText`/
  `ocrStructuredFields` once this phase lands — sufficient for manual QA
  via curl until Phase 4 builds a real verification UI.

## Goal

Turn the Phase 1 stub processor into a real pipeline: every uploaded
document gets scanned for malware, then (if clean) OCR'd/extracted using
the same proven logic sub-project 4b already validated, with results
written to the `DocumentVersion` row Phase 1 already has the columns for.
Nothing in the old `docs` module or its UI is touched.

## Design decisions

- **New `clamav` service in `docker-compose.yml`**, following the exact
  pattern already established for `postgres`/`redis` in this repo — a
  container (`clamav/clamav` or equivalent maintained image) exposing
  `clamd`'s TCP port, healthchecked the same way, `restart:
  unless-stopped`. No native Windows install, no new host dependency.
- **New `AvScanService`** (`src/server/modules/documents/av-scan.service.ts`)
  wrapping a TCP-based ClamAV client (the `clamscan` npm package, pointed
  at the new container via env var, matching how `PrismaService`/Redis
  URLs are already configured from `.env`). One method,
  `scan(filePath: string): Promise<{ clean: boolean; signature?: string }>`.
  Injectable so tests can substitute a fake implementation — the real
  `clamd` daemon is never required for `npm test` to pass.
- **Ported `OcrService`** (`src/server/modules/documents/ocr.service.ts` —
  a new file in the `documents` module, the old
  `src/server/modules/docs/ocr.service.ts` is untouched and keeps serving
  the old module). Carries over `extract()`, `extractImage()`,
  `extractPdf()` (text-layer-or-rasterize fallback, multi-page,
  `PDF_TEXT_LAYER_MIN_CHARS` threshold, the same `pdfjs-dist` ESM-import
  workaround), and `tryExtractMrz()` verbatim from the old service, minus
  `extractDocx()`/`extractPlainText()` and their mime-type branches (out
  of scope this phase). Same `OnModuleInit`/`OnModuleDestroy` Tesseract
  worker lifecycle.
- **`DocumentProcessingProcessor` rewritten** to a real pipeline:
  1. `Document.status = 'SECURITY_SCAN'` → call `AvScanService.scan()` on
     the version's `storagePath`. Infected → `Document.status =
     'SECURITY_REJECTED'`, `DocumentProcessingJob.status = 'FAILED'` with
     an `errorMessage` naming the signature, stop (OCR never runs on a
     flagged file).
  2. Clean → `Document.status = 'QUEUED'` (unchanged from Phase 1's
     vocabulary — this phase does not rename any existing status).
  3. Call the ported `OcrService.extract(storagePath, mimeType)`. A
     mime type outside image/PDF, or a password-protected PDF, throws —
     caught by the existing catch-all path already in the Phase 1 stub
     (`Document.status = 'PROCESSING_FAILED'`, job `FAILED` with
     `errorMessage`, `attempts` incremented) — no new error-handling
     branch needed beyond what Phase 1 already wrote, since that catch
     block is generic.
  4. On success, write `ocrText`/`ocrStructuredFields` onto the
     `DocumentVersion` row (both columns already exist, unused since
     Phase 1), then `Document.status = 'READY_FOR_REVIEW'`,
     `DocumentProcessingJob.status = 'COMPLETE'` — identical final states
     to the Phase 1 stub, just now backed by real work.
- **No schema changes.** Every column this phase writes to
  (`DocumentVersion.ocrText`/`ocrStructuredFields`) and every status
  value it sets (`SECURITY_SCAN`/`SECURITY_REJECTED`/`QUEUED`/
  `PROCESSING_FAILED`/`READY_FOR_REVIEW`) already exists from Phase 1.
- **`documents.module.ts`** registers `AvScanService` and the new
  `OcrService` as providers alongside the existing `DocumentsService`/
  `DocumentProcessingProcessor`.

## Out of scope for this sub-project

- DOCX and plain-text extraction (stays in the old `docs` module only,
  for now).
- Page-level `DocumentSection` splitting — Phase 1 already creates one
  placeholder section per version; real multi-section splitting is
  Phase 3's job.
- Family/type-driven structured extraction schemas, classification logic
  — this phase's output is the same shape as the old service's
  (raw text + opportunistic generic MRZ fields), not family-aware
  extraction (Phase 3).
- The verification UI, entity matching, field-confidence display
  (Phase 4).
- Any change to the live `docs` module, `DocAttachment` model, or
  `DocVerifyDialog.tsx` — untouched, per Phase 1's "no cutover" decision,
  still in force.
- An upload-time password field for encrypted PDFs (see Design decisions
  above — fails cleanly instead).
- Any new REST endpoint — existing `GET /api/documents/:id` already
  surfaces this phase's output.

## Testing / verification

- **OCR extraction unit tests** (no DB): small fixture files (a tiny
  JPEG/PNG with known text, a tiny native-text PDF, a tiny scanned/
  rasterized-only PDF) run through the ported `OcrService.extract()`
  directly, asserting the expected text substring and, for an MRZ
  fixture, the expected parsed fields. Real Tesseract/pdfjs, no mocking —
  matches this project's "never a mocked [core dependency]" convention
  applied to the one piece that's fast and deterministic enough to run
  for real in CI.
- **ClamAV step tested via a fake `AvScanService`** (injected, not a real
  `clamd`) — a test double returning `{ clean: true }` or `{ clean:
  false, signature: 'Test.Signature' }` on demand, so `npm test` never
  depends on a running ClamAV container. Assert the processor correctly
  sets `SECURITY_REJECTED`/stops-before-OCR on an infected result, and
  proceeds to OCR on a clean one.
- **Full-pipeline tests against the real `jetflow_test` Postgres**
  (this project's established convention, never a mocked Prisma client):
  upload a real small image fixture through `DocumentsService.upload()`,
  then invoke `DocumentProcessingProcessor.process()` directly with that
  upload's job data rather than going through the real BullMQ worker —
  this keeps the test deterministic and fast; Phase 1 itself verified the
  actual queue end-to-end only via live manual testing, not an automated
  test, so this phase is establishing that direct-invocation pattern
  fresh rather than following an existing one. Assert `Document.status`
  reaches `READY_FOR_REVIEW` and
  `DocumentVersion.ocrText` is populated; a second test with the fake
  scanner returning infected asserts `SECURITY_REJECTED` and that
  `ocrText` stays null (OCR never ran).
- **Live verification**: `docker compose up -d` (now including the new
  `clamav` service), upload a real small test image through
  `POST /api/documents/upload`, poll `GET /api/documents/:id` and confirm
  `versions[0].ocrText` is populated within a few seconds; upload a
  password-protected PDF fixture and confirm the job reaches
  `PROCESSING_FAILED` with a clear message rather than hanging or
  crashing the worker; confirm the old `/api/docs` endpoints are
  completely unaffected.
- `npm run build:server` and `npm run build:client` both clean (this
  phase is server-only, but the client build should be unaffected).
