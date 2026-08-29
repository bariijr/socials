# VIQ Document Intelligence Foundation (Phase 1)

## Context

The user supplied a 69-section specification for a full rebuild of VIQ's
document ingestion/OCR/extraction/verification pipeline, spanning
document-family classification, page-level section splitting, passport
MRZ handling, structured Operations Specifications, insurance coverage
modeling, field-level confidence/provenance, a human verification UI,
versioning, duplicate detection, expiry integration, RBAC, audit, and a
10-phase rollout. That full document is far too large for one spec — the
user's own phase breakdown (its section 56) already agrees, and confirmed
during brainstorming that this spec covers only **Phase 1: Foundation**,
exactly as scoped there: "new Document model, versioning,
DocumentEntityLink, DocumentFamily, DocumentTypeDefinition, processing
lifecycle, job queue, secure upload, migration. No advanced AI yet."

**What exists today** (confirmed by reading the live code, not assumed):

- `src/server/modules/docs/` — a small, working module: `DocsService`
  (156 lines), `OcrService` (138 lines: Tesseract.js for images,
  pdfjs-dist for PDF text-layer extraction with rasterize+OCR fallback,
  mammoth for DOCX, the `mrz` package for passport parsing), a simple
  controller (upload/file/ocr/verify/findOne/remove).
- `DocAttachment` — one flat Prisma model: exactly-one-of-three owners
  (`tripId`/`personId`/`aircraftRegistration`, enforced in
  `docs.service.ts`'s `upload()`, not a DB constraint), a single
  `docType` string, and `ocrText`/`ocrStructuredFields`/`verifiedFields`/
  `verifiedBy`/`verifiedAt` columns directly on the row — no versioning,
  no sections, no separate extraction/verification tables.
- `docs.service.ts`'s `upload()` already does real security validation:
  a MIME allowlist (`ALLOWED_MIME_TYPES`), magic-byte signature
  verification via the `file-type` package for formats where that's
  reliable (`SIGNATURE_VERIFIABLE_MIME_TYPES`), and a 20MB size cap.
  Phase 1 extends this, it does not reinvent it.
- `DocVerifyDialog.tsx` — a real, working side-by-side document+fields
  verification UI, live-tested earlier this session against the
  existing model.
- `ioredis` is already a dependency (currently only powers
  `@nest-lab/throttler-storage-redis` for rate-limiting) — there is no
  job-queue library yet.

Confirmed during brainstorming: **Phase 1 does not cut the live app
over.** The existing `docs` module, `DocAttachment` model, and
`DocVerifyDialog.tsx` keep working exactly as they do today, untouched.
Phase 1 builds a new, fully parallel `documents` module (new schema, new
upload endpoint, new job queue) alongside it, and migrates existing
`DocAttachment` rows into the new schema read-only (never deletes or
modifies `DocAttachment`). The actual cutover — pointing the live
upload/verify UI at the new schema — is explicitly out of scope here,
deferred to a later phase once Phase 2+ have given the new pipeline real
OCR/extraction capability.

## Goal

A new, versioned, multi-entity-linkable document data model with a
working (but functionally inert) async processing pipeline, seeded with
family/type-definition scaffolding for the 7 first-release document
families, and a one-time migration that copies every existing
`DocAttachment` row into it — proving the foundation is sound before any
later phase builds real extraction on top of it.

## Design decisions

- **Seven new Prisma models**, all under a new `documents` schema area
  (table names below), replacing `DocAttachment`'s role going forward
  without touching `DocAttachment` itself:

  - `Document` — one per uploaded file. Carries the file's own identity
    (`originalFileName`, `mimeType`, `detectedMimeType`, `fileSizeBytes`,
    `sha256` for duplicate detection), a nullable `familyCode`/`typeCode`
    (nullable because classification is Phase 3's job — Phase 1 documents
    can sit in an unclassified `status`), a lifecycle `status` string, and
    a `sourceDocAttachmentId` (nullable, unique) used only by the
    migration script for idempotency/traceability — never set by real
    uploads.
  - `DocumentVersion` — one per Document initially (future re-uploads of
    a superseding document create version 2, 3, etc. — a later phase's
    concern; Phase 1 just needs the table to exist correctly). Carries
    `storagePath`, `ocrText`, `ocrStructuredFields` (JSON), `verifiedFields`
    (JSON), `verifiedBy`, `verifiedAtZ`, `validUntil`, and
    `supersedesVersionId` for the versioning chain.
  - `DocumentSection` — one per logical section within a version (for
    multi-document PDFs like AOC packages). Phase 1 creates the table and
    the "one implicit section spanning the whole document" default row
    per version; real page-range splitting is Phase 3's job.
  - `DocumentEntityLink` — replaces `DocAttachment`'s three nullable
    owner columns with a proper many-to-many: `entityType` (`'Trip'`|
    `'Person'`|`'Aircraft'`|`'Operator'`|`'Client'`|`'Vendor'`|`'Service'`)
    + `entityId`, so one document can link to multiple entities (e.g. one
    insurance certificate, three aircraft) — the exact gap the original
    spec calls out as a hard requirement.
  - `DocumentFamily` — the ~10-20 top-level classification buckets
    (`AIRCRAFT_IDENTITY`, `PERSON_IDENTITY`, `INSURANCE`, etc.).
  - `DocumentTypeDefinition` — one row per concrete document type,
    belonging to a family. `extractionSchema` is a JSON column that
    exists now but stays `null`/unused until Phase 3 — Phase 1 seeds the
    7 first-release types (Passport, Crew Medical, Crew Licence,
    Registration Certificate, Airworthiness Certificate, Insurance,
    AOC/Ops Specs) with just `code`/`label`/`family` filled in.
  - `DocumentProcessingJob` — one row per queued processing attempt,
    tracking `status`/`attempts`/`errorMessage` for observability, backing
    the BullMQ job by ID.

  **Deliberately deferred, not built in Phase 1** (YAGNI): separate
  `document_extractions`/`extracted_fields` tables for field-level
  confidence/provenance. Nothing populates per-field confidence until
  Phase 3, so `DocumentVersion.ocrStructuredFields`/`verifiedFields` and
  `DocumentSection.extractedFields`/`verifiedFields` (JSON columns,
  mirroring `DocAttachment`'s own existing JSON-blob approach) are
  sufficient for now. Normalizing into dedicated tables is a
  straightforward, low-risk addition once real per-field data exists to
  put in them — building it empty now would be speculative.

- **Job queue: `bullmq` + `@nestjs/bullmq`**, the standard NestJS+Redis
  queue library, reusing the Redis container already running for
  rate-limiting rather than provisioning new infrastructure. A stub
  processor (`DocumentProcessingProcessor`) moves a job through
  `UPLOADED → SECURITY_SCAN → QUEUED → READY_FOR_REVIEW` as a no-op
  (no real OCR/extraction — that's Phase 2+), proving the async plumbing
  end-to-end: enqueue on upload, dequeue, status transitions persist,
  errors land in `SECURITY_REJECTED`/`PROCESSING_FAILED` correctly.

- **New module structure**, mirroring this codebase's existing module
  conventions (see `src/server/modules/contacts/` from this session's
  earlier work — a small, focused, `@Global()`-if-shared module):
  `src/server/modules/documents/` with `documents.controller.ts`,
  `documents.service.ts`, `documents.module.ts`,
  `document-processing.processor.ts`, and `dto/upload-document.dto.ts`.
  New endpoints only — `POST /documents/upload`,
  `GET /documents`, `GET /documents/:id`, `GET /documents/:id/jobs` — no
  existing `/docs/*` routes change.

- **Secure upload** reuses `docs.service.ts`'s validation logic rather
  than reimplementing it — the MIME allowlist and magic-byte check move
  into a small shared function both modules can call (or, if extracting
  cleanly proves awkward given the old module's structure, the new
  module gets its own copy sized identically; the design goal is
  behavioral consistency, not necessarily one shared function, and the
  implementation plan will make the call once it's looking at the real
  code). New checks this phase adds beyond what exists today: `sha256`
  computed and stored for duplicate detection (not yet surfaced to
  users — that's Phase 1's data plumbing only, the "possible duplicate"
  UI prompt is a later phase).

- **Migration script**: `prisma/migrate-docattachment-to-documents.js`
  (new, permanent, re-runnable utility — matching the existing
  `prisma/import-world-reference-data.js` convention already in this
  repo). For every `DocAttachment` row without a matching
  `sourceDocAttachmentId` already in `Document` (idempotency check),
  creates one `Document` + one `DocumentVersion` + one `DocumentSection`
  (spanning the whole file) + one `DocumentEntityLink` per non-null owner
  column (a row with both `tripId` and `personId` set, if that ever
  happens, gets two links). `docType` maps to `typeCode` via a lookup
  against the seeded `DocumentTypeDefinition` codes; anything that
  doesn't match falls into a generic `OTHER` type under an `OTHER`
  family (both seeded). Never deletes, updates, or locks `DocAttachment`.

## Out of scope for this sub-project

- Any change to the live `docs` module, `DocAttachment` model, upload
  endpoint, or `DocVerifyDialog.tsx` — all untouched, per the confirmed
  "no cutover" decision.
- Real OCR/extraction on the new model (Phase 2).
- Document/page classification, extraction schemas actually being used,
  AI of any kind (Phase 3).
- The verification UI, entity matching, field confidence display
  (Phase 4).
- Passport MRZ, crew medical/licence, aircraft, insurance, AOC/Ops-Specs
  specialist pipelines (Phases 5-8).
- RBAC beyond what already exists (`@Roles()` on the new controller,
  matching this app's existing pattern — not a new permission system).
- Expiry-engine integration, duplicate-detection UI, versioning UI,
  search, observability dashboards — all later-phase UI/integration work
  with no Phase 1 data-model gap to fill.

## Testing / verification

- `npx tsc -p tsconfig.client.json --noEmit` is not applicable (Phase 1
  is server-only, no client changes) — `npm run build:server` instead.
- Hand-written migration SQL applied via `migrate deploy` + `prisma
  generate`, per this project's established non-interactive workflow.
- Run `prisma/migrate-docattachment-to-documents.js` against the real
  dev database; verify row counts match (`Document` count equals
  `DocAttachment` count), spot-check a handful of migrated rows' JSON
  fields round-tripped correctly, and confirm re-running the script a
  second time creates zero additional rows (idempotency).
- Live verification via a direct API call (curl/Postman-style, no UI
  exists yet): upload a small test file through the new
  `POST /documents/upload` endpoint, confirm a `Document`+
  `DocumentVersion`+`DocumentProcessingJob` row is created, confirm the
  job's status reaches `READY_FOR_REVIEW` within a few seconds (proving
  BullMQ + the stub processor actually run), confirm the old `/docs`
  endpoints are completely unaffected (upload a file there too, confirm
  it still lands in `DocAttachment` exactly as before).
