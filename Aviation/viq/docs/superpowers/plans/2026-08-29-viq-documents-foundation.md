# VIQ Documents Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new, parallel `documents` data model + module (versioned documents, multi-entity links, family/type classification scaffolding, an async job-queue lifecycle) and migrate every existing `DocAttachment` row into it, without touching the live `docs` module or cutting the app over.

**Architecture:** Seven new Prisma models replace `DocAttachment`'s flat single-owner shape with a versioned, many-entity-linkable one. A new `src/server/modules/documents/` NestJS module exposes an upload endpoint that reuses `docs.service.ts`'s validation approach, enqueues a BullMQ job on the Redis connection this app already runs, and a stub processor walks that job through the status lifecycle as a no-op. A standalone Node script migrates existing `DocAttachment` rows read-only.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL 16, `bullmq` + `@nestjs/bullmq` (new dependencies), Redis (already running), `file-type` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-08-29-viq-documents-foundation-design.md`

## Global Constraints

- Never modify `src/server/modules/docs/**`, the `DocAttachment` Prisma model, or `src/client/components/DocVerifyDialog.tsx`.
- No client-side/UI changes anywhere in this plan.
- No real OCR, extraction, or classification logic — the processor is a no-op stub that only moves status values.
- Redis connection: reuse `process.env.REDIS_URL || 'redis://localhost:6389'` — the exact same env var and default `src/server/modules/throttling/throttling.module.ts:14` already uses. Do not introduce a second Redis env var.
- Legacy uploads live under `process.env.UPLOADS_DIR || './uploads'` (set by `docs.service.ts`). New-module uploads live under `process.env.DOCUMENTS_UPLOADS_DIR || './uploads/documents'` — a distinct directory, never mixed with legacy files.
- `DocumentVersion.storagePath` is always a path relative to the repo root (e.g. `uploads/documents/DOCX-ABC.pdf` or `uploads/DOC-XYZ.pdf`), not relative to either upload dir alone — so a later phase's file-serving endpoint can resolve any version without knowing which module wrote it.
- Allowed MIME types for new uploads: `application/pdf`, `image/jpeg`, `image/png`, `image/tiff`, `image/webp`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx) — a superset of the legacy module's list, adding webp per the spec's initial-format scope. Max size: 20MB (same as legacy).
- No automated test suite exists in this repo (`package.json` has no `test`/`jest` entry) — this plan follows the same manual build+script+live-request verification convention already established this session, not a new one.

---

### Task 1: Prisma schema — 7 new models, migration SQL, seed data

**Files:**
- Modify: `prisma/schema.prisma` (insert after the `DocAttachment` model, which currently ends at line 567 — verify the current line number against the live file, since earlier tasks in other plans may have shifted it)
- Create: `prisma/migrations/20260829120000_add_documents_foundation/migration.sql`

**Interfaces:**
- Produces: `Document`, `DocumentVersion`, `DocumentSection`, `DocumentEntityLink`, `DocumentFamily`, `DocumentTypeDefinition`, `DocumentProcessingJob` Prisma models (field names below are exact — Task 2 and Task 3 consume them verbatim). Seeded `DocumentTypeDefinition.code` values: `PASSPORT`, `CREW_MEDICAL_CERTIFICATE`, `CREW_LICENCE_RATING`, `REGISTRATION_CERTIFICATE`, `AIRWORTHINESS_CERTIFICATE`, `INSURANCE_CERTIFICATE`, `AOC_OPS_SPECS`, `OTHER` — Task 3's migration script's `DOC_TYPE_TO_TYPE_CODE` map must use exactly these codes.

- [ ] **Step 1: Add the 7 models to `prisma/schema.prisma`**

Insert this block immediately after the `DocAttachment` model's closing `}` (before the `model Comm {` block):

```prisma
model DocumentFamily {
  code      String @id
  label     String
  sortOrder Int    @default(0) @map("sort_order")

  types     DocumentTypeDefinition[]
  documents Document[]

  @@map("document_families")
}

model DocumentTypeDefinition {
  code             String  @id
  label            String
  familyCode       String  @map("family_code")
  description      String?
  extractionSchema Json?   @map("extraction_schema")
  expiryRequired   Boolean @default(false) @map("expiry_required")
  active           Boolean @default(true)
  sortOrder        Int     @default(0) @map("sort_order")

  family    DocumentFamily @relation(fields: [familyCode], references: [code])
  documents Document[]

  @@index([familyCode])
  @@map("document_type_definitions")
}

model Document {
  documentId            String    @id @map("document_id")
  familyCode            String?   @map("family_code")
  typeCode              String?   @map("type_code")
  originalFileName      String    @map("original_file_name")
  mimeType               String    @map("mime_type")
  detectedMimeType        String?   @map("detected_mime_type")
  fileSizeBytes             Int       @map("file_size_bytes")
  sha256                     String?   @map("sha256")
  status                      String    @default("UPLOADED")
  uploadedBy                   String    @map("uploaded_by")
  uploadedZ                     DateTime  @default(now()) @map("uploaded_z")
  sourceDocAttachmentId           String?   @unique @map("source_doc_attachment_id")

  family         DocumentFamily?         @relation(fields: [familyCode], references: [code])
  type           DocumentTypeDefinition? @relation(fields: [typeCode], references: [code])
  versions       DocumentVersion[]
  entityLinks    DocumentEntityLink[]
  processingJobs DocumentProcessingJob[]

  @@index([sha256])
  @@index([status])
  @@index([familyCode])
  @@index([typeCode])
  @@map("documents")
}

model DocumentVersion {
  id                   Int       @id @default(autoincrement())
  documentId           String    @map("document_id")
  versionNumber        Int       @default(1) @map("version_number")
  storagePath          String    @map("storage_path")
  ocrText              String?   @map("ocr_text")
  ocrStructuredFields  Json?     @map("ocr_structured_fields")
  verifiedFields       Json?     @map("verified_fields")
  verifiedBy           String?   @map("verified_by")
  verifiedAtZ          DateTime? @map("verified_at_z")
  validUntil           DateTime? @map("valid_until")
  supersedesVersionId  Int?      @map("supersedes_version_id")
  createdAtZ           DateTime  @default(now()) @map("created_at_z")

  document Document          @relation(fields: [documentId], references: [documentId], onDelete: Cascade)
  sections DocumentSection[]

  @@index([documentId])
  @@map("document_versions")
}

model DocumentSection {
  id              Int     @id @default(autoincrement())
  versionId       Int     @map("version_id")
  typeCode        String? @map("type_code")
  startPage       Int     @map("start_page")
  endPage         Int     @map("end_page")
  extractedFields Json?   @map("extracted_fields")
  verifiedFields  Json?   @map("verified_fields")

  version DocumentVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)

  @@index([versionId])
  @@map("document_sections")
}

model DocumentEntityLink {
  id               Int     @id @default(autoincrement())
  documentId       String  @map("document_id")
  entityType       String  @map("entity_type")
  entityId         String  @map("entity_id")
  relationshipType String? @map("relationship_type")
  verified         Boolean @default(false)

  document Document @relation(fields: [documentId], references: [documentId], onDelete: Cascade)

  @@index([documentId])
  @@index([entityType, entityId])
  @@map("document_entity_links")
}

model DocumentProcessingJob {
  id            Int       @id @default(autoincrement())
  documentId    String    @map("document_id")
  queueJobId    String?   @map("queue_job_id")
  status        String    @default("QUEUED")
  errorMessage  String?   @map("error_message")
  attempts      Int       @default(0)
  createdAtZ    DateTime  @default(now()) @map("created_at_z")
  completedAtZ  DateTime? @map("completed_at_z")

  document Document @relation(fields: [documentId], references: [documentId], onDelete: Cascade)

  @@index([documentId])
  @@index([status])
  @@map("document_processing_jobs")
}
```

- [ ] **Step 2: Write the hand-written migration SQL**

This environment's `prisma migrate dev` fails non-interactively — every prior migration this session was hand-written instead (see `prisma/migrations/20260828120000_add_contact_channels/migration.sql` for the exact convention this follows). Create the directory `prisma/migrations/20260829120000_add_documents_foundation/` and write `migration.sql`:

```sql
-- CreateTable
CREATE TABLE "document_families" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_families_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "document_type_definitions" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family_code" TEXT NOT NULL,
    "description" TEXT,
    "extraction_schema" JSONB,
    "expiry_required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_type_definitions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "documents" (
    "document_id" TEXT NOT NULL,
    "family_code" TEXT,
    "type_code" TEXT,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "detected_mime_type" TEXT,
    "file_size_bytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "uploaded_by" TEXT NOT NULL,
    "uploaded_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_doc_attachment_id" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "storage_path" TEXT NOT NULL,
    "ocr_text" TEXT,
    "ocr_structured_fields" JSONB,
    "verified_fields" JSONB,
    "verified_by" TEXT,
    "verified_at_z" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "supersedes_version_id" INTEGER,
    "created_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sections" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "type_code" TEXT,
    "start_page" INTEGER NOT NULL,
    "end_page" INTEGER NOT NULL,
    "extracted_fields" JSONB,
    "verified_fields" JSONB,

    CONSTRAINT "document_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_entity_links" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "relationship_type" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_processing_jobs" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "queue_job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at_z" TIMESTAMP(3),

    CONSTRAINT "document_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_source_doc_attachment_id_key" ON "documents"("source_doc_attachment_id");
CREATE INDEX "documents_sha256_idx" ON "documents"("sha256");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_family_code_idx" ON "documents"("family_code");
CREATE INDEX "documents_type_code_idx" ON "documents"("type_code");
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");
CREATE INDEX "document_sections_version_id_idx" ON "document_sections"("version_id");
CREATE INDEX "document_entity_links_document_id_idx" ON "document_entity_links"("document_id");
CREATE INDEX "document_entity_links_entity_type_entity_id_idx" ON "document_entity_links"("entity_type", "entity_id");
CREATE INDEX "document_type_definitions_family_code_idx" ON "document_type_definitions"("family_code");
CREATE INDEX "document_processing_jobs_document_id_idx" ON "document_processing_jobs"("document_id");
CREATE INDEX "document_processing_jobs_status_idx" ON "document_processing_jobs"("status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_family_code_fkey" FOREIGN KEY ("family_code") REFERENCES "document_families"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "document_type_definitions"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_type_definitions" ADD CONSTRAINT "document_type_definitions_family_code_fkey" FOREIGN KEY ("family_code") REFERENCES "document_families"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_entity_links" ADD CONSTRAINT "document_entity_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_processing_jobs" ADD CONSTRAINT "document_processing_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: document families (the 7 first-release families + a generic fallback)
INSERT INTO "document_families" ("code", "label", "sort_order") VALUES
  ('PERSON_IDENTITY', 'Person Identity', 0),
  ('CREW_MEDICAL', 'Crew Medical', 1),
  ('CREW_LICENCE', 'Crew Licence & Rating', 2),
  ('AIRCRAFT_REGISTRATION', 'Aircraft Registration', 3),
  ('AIRCRAFT_AIRWORTHINESS', 'Aircraft Airworthiness', 4),
  ('INSURANCE', 'Insurance', 5),
  ('OPERATOR_AUTHORIZATION', 'Operator Authorization', 6),
  ('OTHER', 'Other', 7);

-- Seed: document type definitions (7 first-release types + OTHER fallback)
INSERT INTO "document_type_definitions" ("code", "label", "family_code", "expiry_required", "sort_order") VALUES
  ('PASSPORT', 'Passport', 'PERSON_IDENTITY', true, 0),
  ('CREW_MEDICAL_CERTIFICATE', 'Crew Medical Certificate', 'CREW_MEDICAL', true, 1),
  ('CREW_LICENCE_RATING', 'Crew Licence / Rating', 'CREW_LICENCE', true, 2),
  ('REGISTRATION_CERTIFICATE', 'Registration Certificate', 'AIRCRAFT_REGISTRATION', false, 3),
  ('AIRWORTHINESS_CERTIFICATE', 'Airworthiness Certificate', 'AIRCRAFT_AIRWORTHINESS', true, 4),
  ('INSURANCE_CERTIFICATE', 'Insurance Certificate', 'INSURANCE', true, 5),
  ('AOC_OPS_SPECS', 'AOC / Operations Specifications', 'OPERATOR_AUTHORIZATION', true, 6),
  ('OTHER', 'Other', 'OTHER', false, 7);
```

- [ ] **Step 3: Apply the migration and regenerate the client**

If a `node dist/main.js` process is currently running, stop it first — it holds a lock on the Prisma query-engine DLL on Windows and `prisma generate` will fail with `EPERM ... rename ...` while it's alive (this is a known, recurring issue this session; check with the project's usual process-listing approach for the server on port 4001).

Run:
```bash
npx prisma migrate deploy
npx prisma generate
```
Expected: both commands exit 0, and `npx prisma migrate status` reports no pending migrations.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260829120000_add_documents_foundation
git commit -m "Add Document/DocumentVersion/DocumentSection/DocumentEntityLink/DocumentFamily/DocumentTypeDefinition/DocumentProcessingJob models"
```

---

### Task 2: `documents` module — upload endpoint, BullMQ queue, stub processor

**Files:**
- Modify: `package.json` (add `bullmq`, `@nestjs/bullmq` dependencies)
- Modify: `src/server/app.module.ts` (register `BullModule.forRootAsync` and `DocumentsModule`)
- Create: `src/server/modules/documents/dto/upload-document.dto.ts`
- Create: `src/server/modules/documents/documents.service.ts`
- Create: `src/server/modules/documents/documents.controller.ts`
- Create: `src/server/modules/documents/document-processing.processor.ts`
- Create: `src/server/modules/documents/documents.module.ts`

**Interfaces:**
- Consumes: `Document`/`DocumentVersion`/`DocumentSection`/`DocumentEntityLink`/`DocumentTypeDefinition`/`DocumentProcessingJob` Prisma models (Task 1). `AuditService.log(user, entityType, entityId, action, before, after)` — same signature `docs.service.ts` already uses (`src/server/modules/audit/audit.service.ts`), imported the same way: `import { AuditService } from '../audit/audit.service';`.
- Produces: `POST /documents/upload` (multipart, field `file` + body fields `typeCode?`, `entityLinks` (JSON string), `uploadedBy`), `GET /documents`, `GET /documents/:documentId`, `GET /documents/:documentId/jobs` — consumed by Task 4's live verification. BullMQ queue named `'document-processing'` — consumed by Task 3's migration script only insofar as Task 3 must NOT enqueue jobs for migrated rows (migration is a data backfill, not a live upload — see Task 3).

Reuse decision (spec left this to the plan): the legacy `docs.service.ts`'s MIME/signature/size constants are **not** exported or imported — they're duplicated into `documents.service.ts` with the same values. Extracting a shared helper would require editing `src/server/modules/docs/**`, which the Global Constraints forbid touching. Small, intentional duplication is the correct trade-off here, not an oversight.

- [ ] **Step 1: Install the new dependencies**

```bash
npm install bullmq @nestjs/bullmq
```
Expected: `package.json`'s `dependencies` gains `bullmq` and `@nestjs/bullmq` entries; exit code 0.

- [ ] **Step 2: Write the upload DTO**

`src/server/modules/documents/dto/upload-document.dto.ts`:
```ts
import { IsOptional, IsString } from 'class-validator';

// entityLinks arrives as a JSON-encoded string, not a nested array — this
// endpoint is multipart/form-data (file upload), and multipart fields are
// always flat strings; DocumentsService.upload() parses and validates it.
// Example value: '[{"entityType":"Trip","entityId":"TRIP-1AB2C3"}]'
export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  typeCode?: string;

  @IsString()
  entityLinks!: string;

  @IsString()
  uploadedBy!: string;
}
```

- [ ] **Step 3: Write the service**

`src/server/modules/documents/documents.service.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fromBuffer } from 'file-type';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

const UPLOADS_DIR = process.env.DOCUMENTS_UPLOADS_DIR || './uploads/documents';
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
// Formats with an unambiguous magic-byte signature — webp and docx are
// excluded for the same reason docs.service.ts excludes docx: file-type's
// detection has occasional false negatives on otherwise-valid files.
const SIGNATURE_VERIFIABLE_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ENTITY_TYPES = ['Trip', 'Person', 'Aircraft', 'Operator', 'Client', 'Vendor', 'Service'];

interface EntityLinkInput {
  entityType: string;
  entityId: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('document-processing') private readonly queue: Queue,
  ) {}

  findAll() {
    return this.prisma.document.findMany({ orderBy: { uploadedZ: 'desc' } });
  }

  async findOne(documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { documentId },
      include: { versions: true, entityLinks: true, family: true, type: true },
    });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return doc;
  }

  findJobs(documentId: string) {
    return this.prisma.documentProcessingJob.findMany({
      where: { documentId },
      orderBy: { createdAtZ: 'desc' },
    });
  }

  private parseEntityLinks(raw: string): EntityLinkInput[] {
    let links: unknown;
    try {
      links = JSON.parse(raw);
    } catch {
      throw new BadRequestException('entityLinks must be a JSON-encoded array.');
    }
    if (!Array.isArray(links) || links.length === 0) {
      throw new BadRequestException('At least one entity link is required.');
    }
    for (const link of links) {
      const l = link as Partial<EntityLinkInput>;
      if (!l || typeof l.entityId !== 'string' || !l.entityId || !ENTITY_TYPES.includes(l.entityType as string)) {
        throw new BadRequestException(`Invalid entity link: ${JSON.stringify(link)}`);
      }
    }
    return links as EntityLinkInput[];
  }

  async upload(file: Express.Multer.File, dto: UploadDocumentDto) {
    const links = this.parseEntityLinks(dto.entityLinks);

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 20MB limit.');
    }
    if (SIGNATURE_VERIFIABLE_MIME_TYPES.has(file.mimetype)) {
      const detected = await fromBuffer(file.buffer);
      if (!detected || detected.mime !== file.mimetype) {
        throw new BadRequestException(`File content does not match its declared type (${file.mimetype}).`);
      }
    }

    let familyCode: string | null = null;
    if (dto.typeCode) {
      const typeDef = await this.prisma.documentTypeDefinition.findUnique({ where: { code: dto.typeCode } });
      if (!typeDef) throw new BadRequestException(`Unknown typeCode: ${dto.typeCode}`);
      familyCode = typeDef.familyCode;
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const documentId = `DOCX-${Date.now().toString(36).toUpperCase()}`;
    const ext = path.extname(file.originalname);
    const storedName = `${documentId}${ext}`;
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOADS_DIR, storedName), file.buffer);
    const storagePath = path.join(UPLOADS_DIR, storedName).replace(/\\/g, '/');

    const document = await this.prisma.document.create({
      data: {
        documentId,
        familyCode,
        typeCode: dto.typeCode ?? null,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        detectedMimeType: SIGNATURE_VERIFIABLE_MIME_TYPES.has(file.mimetype) ? file.mimetype : null,
        fileSizeBytes: file.size,
        sha256,
        status: 'UPLOADED',
        uploadedBy: dto.uploadedBy,
        versions: {
          create: {
            versionNumber: 1,
            storagePath,
            sections: { create: { startPage: 1, endPage: 1 } },
          },
        },
        entityLinks: { create: links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })) },
        processingJobs: { create: { status: 'QUEUED' } },
      },
      include: { processingJobs: true },
    });

    const job = document.processingJobs[0];
    const queueJob = await this.queue.add(
      'process',
      { documentId, jobId: job.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
    await this.prisma.documentProcessingJob.update({
      where: { id: job.id },
      data: { queueJobId: String(queueJob.id) },
    });

    await this.audit.log(dto.uploadedBy, 'Document', documentId, 'Uploaded', '', file.originalname);
    return document;
  }
}
```

- [ ] **Step 4: Write the processor**

`src/server/modules/documents/document-processing.processor.ts`:
```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Phase 1 stub: proves the async job-queue plumbing works end-to-end without
// doing any real OCR/extraction/classification — that begins in Phase 2.
// Every job walks straight through to READY_FOR_REVIEW. There is no real
// security-scan check yet, so this stub never produces SECURITY_REJECTED —
// that branch is defined as a valid Document.status for later phases, but
// only Phase 2's real scan step will ever set it. PROCESSING_FAILED is the
// one error path this stub can actually reach (e.g. a DB write failing
// mid-job), and it's fully implemented below.
@Injectable()
@Processor('document-processing')
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ documentId: string; jobId: number }>): Promise<void> {
    const { documentId, jobId } = job.data;
    try {
      for (const status of ['SECURITY_SCAN', 'QUEUED', 'READY_FOR_REVIEW']) {
        await this.prisma.document.update({ where: { documentId }, data: { status } });
      }
      await this.prisma.documentProcessingJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETE', completedAtZ: new Date() },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown processing error';
      this.logger.error(`Document ${documentId} processing failed: ${message}`);
      await this.prisma.document.update({ where: { documentId }, data: { status: 'PROCESSING_FAILED' } });
      await this.prisma.documentProcessingJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: message, completedAtZ: new Date(), attempts: { increment: 1 } },
      });
      throw e;
    }
  }
}
```

- [ ] **Step 5: Write the controller**

`src/server/modules/documents/documents.controller.ts`:
```ts
import { Controller, Get, Post, Param, Body, UploadedFile, UseInterceptors, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  findAll() {
    return this.documents.findAll();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadDocumentDto) {
    if (!file) throw new NotFoundException('No file provided.');
    return this.documents.upload(file, dto);
  }

  @Get(':documentId/jobs')
  findJobs(@Param('documentId') documentId: string) {
    return this.documents.findJobs(documentId);
  }

  @Get(':documentId')
  findOne(@Param('documentId') documentId: string) {
    return this.documents.findOne(documentId);
  }
}
```

- [ ] **Step 6: Write the module**

`src/server/modules/documents/documents.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentProcessingProcessor } from './document-processing.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'document-processing' })],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentProcessingProcessor],
  exports: [DocumentsService],
})
export class DocumentsModule {}
```

- [ ] **Step 7: Register `BullModule.forRootAsync` and `DocumentsModule` in `app.module.ts`**

Add these imports near the top of `src/server/app.module.ts` (alongside the existing `ThrottlingModule`/`DocsModule` imports):
```ts
import { BullModule } from '@nestjs/bullmq';
import { DocumentsModule } from './modules/documents/documents.module';
```

Add to the `imports` array (place immediately after `ThrottlingModule` — same Redis connection, same reasoning for being early in the list):
```ts
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { url: process.env.REDIS_URL || 'redis://localhost:6389' },
      }),
    }),
```
And add `DocumentsModule` immediately after `DocsModule` in the same array (untouched `DocsModule` line stays exactly where it is — only add a new line after it).

- [ ] **Step 8: Build**

Stop any running `node dist/main.js` process first (same Windows DLL-lock reason as Task 1 Step 3). Run:
```bash
npm run build:server
```
Expected: exit code 0, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/server/app.module.ts src/server/modules/documents
git commit -m "Add documents module: upload endpoint, BullMQ queue, stub processing lifecycle"
```

---

### Task 3: Migration script — backfill `DocAttachment` into the new schema

**Files:**
- Create: `prisma/migrate-docattachment-to-documents.js`

**Interfaces:**
- Consumes: `Document`/`DocumentVersion`/`DocumentSection`/`DocumentEntityLink`/`DocumentTypeDefinition` Prisma models (Task 1), the 8 seeded `DocumentTypeDefinition.code` values (Task 1 Step 2).
- Produces: nothing consumed by later tasks — Task 4 only reads row counts to verify this script ran correctly.

This script does **not** enqueue BullMQ jobs — it's a one-time data backfill of already-processed historical rows (most have `ocrText`/`verifiedFields` already populated), not a live upload. Enqueueing would send thousands of stub jobs through the queue for no purpose.

- [ ] **Step 1: Write the script**

Follow the same conventions as `prisma/import-world-reference-data.js` (CommonJS, direct `PrismaClient`, console progress logging, safely re-runnable). Create `prisma/migrate-docattachment-to-documents.js`:

```js
// ─────────────────────────────────────────────────────────────────────────────
// One-time (but safely re-runnable) migration of every existing DocAttachment
// row into the new Document/DocumentVersion/DocumentSection/DocumentEntityLink
// schema (VIQ Document Intelligence Phase 1). Read-only against DocAttachment
// — never deletes or updates it. Idempotent via Document.sourceDocAttachmentId
// (unique): rows already migrated are skipped on re-run.
//
// Run with: node prisma/migrate-docattachment-to-documents.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const LEGACY_UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const prisma = new PrismaClient();

const DOC_TYPE_TO_TYPE_CODE = {
  'Registration Certificate': 'REGISTRATION_CERTIFICATE',
  'Airworthiness Certificate': 'AIRWORTHINESS_CERTIFICATE',
  'Insurance Certificate': 'INSURANCE_CERTIFICATE',
  'AOC': 'AOC_OPS_SPECS',
  'Crew Licence': 'CREW_LICENCE_RATING',
  'Medical Certificate': 'CREW_MEDICAL_CERTIFICATE',
  'Permit Application Form': 'OTHER',
  'Noise Certificate': 'OTHER',
  'PAX List': 'OTHER',
  'Other': 'OTHER',
};

function entityLinksFor(doc) {
  const links = [];
  if (doc.tripId) links.push({ entityType: 'Trip', entityId: doc.tripId });
  if (doc.personId) links.push({ entityType: 'Person', entityId: doc.personId });
  if (doc.aircraftRegistration) links.push({ entityType: 'Aircraft', entityId: doc.aircraftRegistration });
  return links;
}

// Best-effort — a source file missing on disk should not abort the whole
// migration run, just leave that one row's sha256 null (matches the
// Document.sha256 column's nullability, which exists for exactly this case).
function hashFile(relativePath) {
  try {
    const buf = fs.readFileSync(path.join(LEGACY_UPLOADS_DIR, relativePath));
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

async function main() {
  const typeDefs = await prisma.documentTypeDefinition.findMany();
  const typeDefByCode = new Map(typeDefs.map((t) => [t.code, t]));

  const attachments = await prisma.docAttachment.findMany();
  console.log(`Found ${attachments.length} DocAttachment rows.`);

  let migrated = 0;
  let skipped = 0;

  for (const doc of attachments) {
    const existing = await prisma.document.findUnique({ where: { sourceDocAttachmentId: doc.docId } });
    if (existing) {
      skipped++;
      continue;
    }

    const typeCode = DOC_TYPE_TO_TYPE_CODE[doc.docType] || 'OTHER';
    const typeDef = typeDefByCode.get(typeCode);
    if (!typeDef) {
      throw new Error(
        `No seeded DocumentTypeDefinition for typeCode "${typeCode}" (docType "${doc.docType}"). Run the Task 1 migration first.`,
      );
    }

    const links = entityLinksFor(doc);
    if (links.length === 0) {
      console.warn(`DocAttachment ${doc.docId} has no tripId/personId/aircraftRegistration — migrating with zero entity links.`);
    }

    await prisma.document.create({
      data: {
        documentId: `DOCX-MIG-${doc.docId}`,
        familyCode: typeDef.familyCode,
        typeCode: typeDef.code,
        originalFileName: doc.fileName,
        mimeType: doc.mimeType,
        detectedMimeType: null,
        fileSizeBytes: doc.fileSizeBytes,
        sha256: hashFile(doc.filePath),
        status: doc.verifiedAt ? 'READY_FOR_REVIEW' : 'UPLOADED',
        uploadedBy: doc.uploadedBy,
        uploadedZ: doc.uploadedZ,
        sourceDocAttachmentId: doc.docId,
        versions: {
          create: {
            versionNumber: 1,
            storagePath: path.join(LEGACY_UPLOADS_DIR, doc.filePath).replace(/\\/g, '/'),
            ocrText: doc.ocrText,
            ocrStructuredFields: doc.ocrStructuredFields ?? undefined,
            verifiedFields: doc.verifiedFields ?? undefined,
            verifiedBy: doc.verifiedBy,
            verifiedAtZ: doc.verifiedAt,
            validUntil: doc.validUntil,
            sections: { create: { startPage: 1, endPage: 1 } },
          },
        },
        entityLinks: { create: links },
      },
    });
    migrated++;
  }

  console.log(`Migrated ${migrated} rows, skipped ${skipped} already-migrated rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run it against the real dev database**

```bash
node prisma/migrate-docattachment-to-documents.js
```
Expected: exits 0, prints `Migrated N rows, skipped 0 already-migrated rows.` where N equals the current `DocAttachment` row count.

- [ ] **Step 3: Verify row counts and idempotency**

Run it a second time immediately:
```bash
node prisma/migrate-docattachment-to-documents.js
```
Expected: `Migrated 0 rows, skipped N already-migrated rows.` — proves the `sourceDocAttachmentId` uniqueness check works.

Then spot-check via `npx prisma studio` or a direct query that `Document` row count equals `DocAttachment` row count, and that a handful of migrated rows' `versions[0].ocrText`/`verifiedFields` match their source `DocAttachment.ocrText`/`verifiedFields` exactly.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrate-docattachment-to-documents.js
git commit -m "Add read-only migration script backfilling DocAttachment rows into the new documents schema"
```

---

### Task 4: Full verification pass, README changelog

**Files:**
- Modify: `README.md` (append changelog section)

**Interfaces:**
- Consumes: everything from Tasks 1-3. Nothing produced for later tasks — this is the plan's final task.

- [ ] **Step 1: Full server build and restart**

Stop any running server process, then:
```bash
npm run build:server
```
Expected: exit 0. Start the server the same way this session has restarted it before (`node dist/main.js` or the project's normal start command), confirm it's listening on port 4001.

- [ ] **Step 2: Live-verify the new upload endpoint**

Using `curl` (or an equivalent HTTP client) against the running server, upload a small test PDF or image through the new endpoint:
```bash
curl -s -X POST http://localhost:4001/documents/upload \
  -F "file=@<path-to-a-small-test-pdf-or-image>" \
  -F 'entityLinks=[{"entityType":"Trip","entityId":"<a-real-tripId-from-the-dev-db>"}]' \
  -F "uploadedBy=SYSTEM-TEST"
```
Expected: HTTP 200/201, JSON body with a `documentId` starting `DOCX-` and `status: "UPLOADED"`.

Then poll the jobs endpoint a few times over a few seconds:
```bash
curl -s http://localhost:4001/documents/<documentId>/jobs
```
Expected: within a few seconds, the job's `status` reaches `"COMPLETE"` and `GET /documents/<documentId>` shows `status: "READY_FOR_REVIEW"` — proving BullMQ + the stub processor genuinely ran, not just that the row was created.

- [ ] **Step 3: Confirm the old `/docs` endpoint is completely unaffected**

Upload a file through the legacy endpoint too:
```bash
curl -s -X POST http://localhost:4001/docs/upload \
  -F "file=@<path-to-a-small-test-pdf-or-image>" \
  -F "docType=Other" \
  -F "tripId=<a-real-tripId-from-the-dev-db>" \
  -F "uploadedBy=SYSTEM-TEST"
```
Expected: behaves exactly as it did before this plan — HTTP 200/201, a normal `DocAttachment` row, no errors, no interaction with the new `documents` tables.

- [ ] **Step 4: Update README changelog**

Add a new dated section to `README.md`, matching the existing `## <Title> (YYYY-MM-DD)` changelog convention already used for the contact-channels and responsive-foundation sections:

```markdown
## VIQ Document Intelligence — Phase 1: Foundation (2026-08-29)

New, fully parallel `documents` data model and module — the foundation for
a multi-phase document ingestion/OCR/extraction/verification rebuild. This
phase adds no new UI and does not touch the existing `docs` module,
`DocAttachment` model, or `DocVerifyDialog.tsx`, all of which continue
working exactly as before.

- 7 new Prisma models: `Document`, `DocumentVersion`, `DocumentSection`,
  `DocumentEntityLink` (many-to-many owner links, replacing
  `DocAttachment`'s fixed 3-column single-owner shape),
  `DocumentFamily`/`DocumentTypeDefinition` (classification scaffolding,
  seeded with the 7 first-release document types), `DocumentProcessingJob`.
- New `POST /documents/upload` endpoint reusing the legacy module's
  MIME-allowlist + magic-byte validation approach, plus SHA-256 hashing
  for future duplicate detection.
- `bullmq` + `@nestjs/bullmq` job queue on the app's existing Redis
  connection; a stub processor proves the async status lifecycle
  (`UPLOADED → SECURITY_SCAN → QUEUED → READY_FOR_REVIEW`) end-to-end with
  no real OCR/extraction yet — that begins in Phase 2.
- `prisma/migrate-docattachment-to-documents.js` — a read-only,
  re-runnable script that backfilled every existing `DocAttachment` row
  into the new schema without modifying or deleting the originals.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document VIQ Document Intelligence Phase 1 (Foundation) in the changelog"
```
