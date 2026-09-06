# VIQ Document Intelligence — OCR/Extraction (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Phase 1's stub `DocumentProcessingProcessor` into a real pipeline that virus-scans every uploaded document (ClamAV) and, if clean, runs OCR/extraction on it (ported from the proven old `docs` module's `OcrService`, images+PDF only), writing results onto the `DocumentVersion` row Phase 1 already created columns for.

**Architecture:** A new `clamav` Docker service (matching the existing postgres/redis pattern) backs a new `AvScanService`. A new `OcrService` (a trimmed port of `src/server/modules/docs/ocr.service.ts`) handles image+PDF extraction. `DocumentProcessingProcessor` is rewritten to call both in sequence and write real results instead of its Phase 1 stub's fixed status walk. No schema changes, no new endpoint, no changes to the old `docs` module.

**Tech Stack:** NestJS 10, BullMQ (already wired), `tesseract.js`/`pdfjs-dist`/`@napi-rs/canvas`/`mrz` (already dependencies, currently only used by the old `docs` module), `clamscan` (new dependency) talking to a ClamAV daemon over TCP, Jest against the real `jetflow_test` Postgres database (established convention).

**Spec:** `docs/superpowers/specs/2026-09-06-viq-documents-ocr-extraction-design.md`

## Global Constraints

- Scope is **images + PDF only** this phase — no DOCX, no plain text.
- Encrypted PDFs **fail cleanly** (`PROCESSING_FAILED` with a clear message) — no password field, no new UI.
- **No schema changes** — every column/status value this phase uses already exists from Phase 1 (`DocumentVersion.ocrText`/`ocrStructuredFields`, `Document.status` values `SECURITY_SCAN`/`SECURITY_REJECTED`/`QUEUED`/`PROCESSING_FAILED`/`READY_FOR_REVIEW`).
- **No new REST endpoint** — `GET /api/documents/:id` already returns `versions: true`.
- The old `docs` module, `DocAttachment` model, and `DocVerifyDialog.tsx` are **untouched** — do not modify them.
- The ClamAV scan step must be **fake-able in tests** — `npm test` must never require a running ClamAV daemon.
- Server tests run against the real `jetflow_test` Postgres database — never a mocked Prisma client.
- An infected file is a terminal, correct outcome, not a transient failure — it must **not** trigger BullMQ's retry/backoff (no `throw` on that path), unlike a genuine processing error.

---

## Task 1: ClamAV infrastructure (Docker + env)

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env`, `.env.example`

**Interfaces:**
- Produces: a reachable ClamAV daemon at `localhost:3320` (host) once `docker compose up -d` is run, and `CLAMAV_HOST`/`CLAMAV_PORT` env vars. Task 2's `AvScanService` consumes both.

This task is infrastructure-only — no code, no tests. Verification is starting the container and confirming it becomes healthy.

- [ ] **Step 1: Add the `clamav` service to `docker-compose.yml`**

Add a new top-level service (alongside the existing `postgres`/`redis` services) and a new top-level volume:

```yaml
  clamav:
    image: clamav/clamav:1.3
    container_name: jetflow_api_clamav
    restart: unless-stopped
    ports:
      - "3320:3310"
    volumes:
      - jetflow_clamav_data:/var/lib/clamav
    healthcheck:
      test: ["CMD", "clamdcheck.sh"]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 180s
```

Add `jetflow_clamav_data:` to the `volumes:` section at the bottom of the file, alongside the existing `jetflow_pg_data`/`jetflow_redis_data` entries.

`3320:3310` follows this repo's existing convention of offsetting host ports from their defaults (`5442:5432` for Postgres, `6389:6379` for Redis) — `3310` is ClamAV's standard `clamd` port.

`start_period: 180s` matters: this image downloads virus definitions on first boot (via `freshclam`), which can take several minutes the very first time. Do not treat a `starting`/unhealthy status as broken in the first few minutes — this is expected on the very first run only; the definitions persist in `jetflow_clamav_data` afterward, so subsequent starts are fast.

- [ ] **Step 2: Add `CLAMAV_HOST`/`CLAMAV_PORT` to `.env` and `.env.example`**

In `.env`, add near the existing `REDIS_URL` line:
```
CLAMAV_HOST=localhost
CLAMAV_PORT=3320
```

In `.env.example`, add the same two lines in the same relative location (values are non-secret defaults, safe to commit as-is).

- [ ] **Step 3: Start the container and verify it becomes healthy**

Run:
```bash
docker compose up -d clamav
```

Then poll until healthy (this can take several minutes on first run while virus definitions download):
```bash
docker compose ps clamav
```
Expected: `STATUS` eventually reads `Up ... (healthy)`. If it's still `(health: starting)` after 5+ minutes, check `docker logs jetflow_api_clamav` for `freshclam` download progress before assuming something is wrong.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env .env.example
git commit -m "feat: add ClamAV service for document security scanning

New Docker service backing Phase 2's real SECURITY_SCAN step, following
the same pattern as the existing postgres/redis services (offset host
port, named volume, healthcheck). No application code yet -- this task
only stands up the infrastructure Task 2's AvScanService will connect to.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: AvScanService (ClamAV client wrapper)

**Files:**
- Create: `src/server/modules/documents/av-scan.service.ts`
- Test: `src/server/modules/documents/av-scan.service.spec.ts`

**Interfaces:**
- Consumes: `CLAMAV_HOST`/`CLAMAV_PORT` env vars (Task 1).
- Produces: `export interface ScanResult { clean: boolean; signature?: string }`, `export class AvScanService implements OnModuleInit { async scan(filePath: string): Promise<ScanResult> }`. Task 4 injects this into `DocumentProcessingProcessor` and also uses a test double of it (matching this exact `scan()` signature) in its own tests.

- [ ] **Step 1: Install the `clamscan` package**

Run:
```bash
npm install clamscan
```

After installing, check `node_modules/clamscan`'s own type definitions (`node_modules/clamscan/index.d.ts` or similar — check what's actually shipped) for the exact shape of `NodeClam`'s `.init()` options and `.isInfected()`'s return type. The code below is written from the commonly-documented API shape; if the installed version's actual types differ in field names, adjust Step 2's code to match what's actually installed — trust the installed package's types over this plan's text.

- [ ] **Step 2: Write `AvScanService`**

Create `src/server/modules/documents/av-scan.service.ts`:

```ts
// src/server/modules/documents/av-scan.service.ts
//
// Thin wrapper around a ClamAV daemon reached over TCP (no local clamscan/
// clamdscan binary needed -- clamd's network protocol is used directly).
// Deliberately a single narrow method so it's trivial to substitute a fake
// in tests -- npm test must never require a running ClamAV daemon.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import NodeClam from 'clamscan';

export interface ScanResult {
  clean: boolean;
  signature?: string;
}

@Injectable()
export class AvScanService implements OnModuleInit {
  private readonly logger = new Logger(AvScanService.name);
  private clamscan!: NodeClam;

  async onModuleInit() {
    this.clamscan = await new NodeClam().init({
      removeInfected: false,
      clamdscan: {
        host: process.env.CLAMAV_HOST || 'localhost',
        port: process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : 3320,
        timeout: 60000,
      },
      preference: 'clamdscan',
    });
    this.logger.log('ClamAV client ready');
  }

  async scan(filePath: string): Promise<ScanResult> {
    const { isInfected, viruses } = await this.clamscan.isInfected(filePath);
    return isInfected ? { clean: false, signature: viruses?.[0] } : { clean: true };
  }
}
```

- [ ] **Step 3: Write the unit tests**

Create `src/server/modules/documents/av-scan.service.spec.ts`:

```ts
// src/server/modules/documents/av-scan.service.spec.ts
//
// Mocks the clamscan package entirely -- these tests verify AvScanService's
// own clean/infected mapping logic, not a real ClamAV daemon. The real
// daemon is exercised only by live/manual verification (see the plan's
// Task 4 final step), never by `npm test`.
import { AvScanService } from './av-scan.service';

const mockIsInfected = jest.fn();

jest.mock('clamscan', () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue({ isInfected: mockIsInfected }),
  }));
});

describe('AvScanService', () => {
  let service: AvScanService;

  beforeEach(async () => {
    mockIsInfected.mockReset();
    service = new AvScanService();
    await service.onModuleInit();
  });

  it('reports a clean file as clean', async () => {
    mockIsInfected.mockResolvedValue({ isInfected: false, viruses: [] });
    const result = await service.scan('/tmp/clean-file.png');
    expect(result).toEqual({ clean: true });
  });

  it('reports an infected file with its signature', async () => {
    mockIsInfected.mockResolvedValue({ isInfected: true, viruses: ['Test.Signature'] });
    const result = await service.scan('/tmp/infected-file.png');
    expect(result).toEqual({ clean: false, signature: 'Test.Signature' });
  });
});
```

If `jest.mock('clamscan', ...)` doesn't intercept the import cleanly (CJS/ESM default-export interop can be finicky under `ts-jest`), inspect the actual error and adjust the mock factory's shape — the goal is simply that `new NodeClam().init(...)` resolves to an object with a controllable `isInfected` function, however that's expressed for the installed package's actual module shape.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm test -- av-scan.service
```
Expected: 2 tests pass. (No Docker/ClamAV daemon needs to be running for this — these tests mock the package entirely.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/server/modules/documents/av-scan.service.ts src/server/modules/documents/av-scan.service.spec.ts
git commit -m "feat: add AvScanService wrapping ClamAV for document security scanning

Thin, narrow wrapper (one method: scan(filePath)) around a ClamAV daemon
reached over TCP -- deliberately easy to substitute a fake for in tests,
since npm test must never require a running ClamAV container. Unit tests
mock the clamscan package entirely; the real daemon (Task 1) is only
exercised by manual/live verification.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: OcrService (ported, images + PDF only) + standalone MRZ extraction

**Files:**
- Create: `src/server/modules/documents/mrz-extraction.ts`
- Create: `src/server/modules/documents/ocr.service.ts`
- Test: `src/server/modules/documents/mrz-extraction.spec.ts`
- Test: `src/server/modules/documents/ocr.service.spec.ts`

**Interfaces:**
- Produces: `export async function extractMrzFields(rawText: string): Promise<Record<string, unknown> | null>` (in `mrz-extraction.ts` — async because it dynamically imports the ESM-only `mrz` package via the same `importEsm` pattern the old service already uses for `pdfjs-dist`); `export interface OcrResult { text: string; structuredFields: Record<string, unknown> | null }`, `export class OcrService implements OnModuleInit, OnModuleDestroy { async extract(filePath: string, mimeType: string): Promise<OcrResult> }` (in `ocr.service.ts`). Task 4 injects `OcrService` into `DocumentProcessingProcessor` and calls `extract()`.

This task ports `src/server/modules/docs/ocr.service.ts` (read it first for context — it is NOT modified by this task, it keeps serving the old `docs` module unchanged) onto the new module, dropping DOCX/plain-text support, and pulls the private `tryExtractMrz` method out into its own standalone, independently-testable function (it never referenced `this`, so this is a pure extraction, not a behavior change).

- [ ] **Step 1: Create `mrz-extraction.ts`**

Create `src/server/modules/documents/mrz-extraction.ts`:

```ts
// src/server/modules/documents/mrz-extraction.ts
//
// Pulled out of the old docs module's OcrService as a standalone, pure
// function -- it never referenced instance state, and isolating it makes
// it independently testable with a real MRZ string instead of needing a
// rendered/OCR'd image to exercise it.
//
// The `mrz` package is ESM-only (package.json declares "type": "module"
// with no CJS export condition). This project compiles to CommonJS, and
// Jest's own CJS module loader rejects a plain `import`/`require` of an
// ESM-only package outright (`createRequireEsmError`) even on a Node
// version whose native `require(esm)` would otherwise handle it -- Jest
// intercepts before Node's loader gets the chance. The same problem (and
// the same fix) already exists in the old docs module's OcrService for
// `pdfjs-dist`: going through `new Function` for the import expression
// bypasses TypeScript's `module: commonjs` transform (which would
// otherwise rewrite `await import(...)` into a `require()` call) and
// reaches Node's native dynamic import directly, which Jest does not
// intercept.
const importEsm = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

export async function extractMrzFields(rawText: string): Promise<Record<string, unknown> | null> {
  const { parse } = await importEsm('mrz');

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
        // Not a valid MRZ shape at this window -- keep scanning. Expected
        // for every non-MRZ line grouping, not an error worth logging.
      }
    }
  }
  return null;
}
```

- [ ] **Step 2: Write the failing MRZ test**

Create `src/server/modules/documents/mrz-extraction.spec.ts`:

```ts
// src/server/modules/documents/mrz-extraction.spec.ts
import { extractMrzFields } from './mrz-extraction';

// Canonical ICAO 9303 TD3 (passport) example MRZ -- two 44-character lines.
const SAMPLE_MRZ_TEXT = [
  'Some OCR preamble text that is not part of the MRZ at all.',
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');

describe('extractMrzFields', () => {
  it('parses a valid passport MRZ embedded in surrounding text', async () => {
    const result = await extractMrzFields(SAMPLE_MRZ_TEXT);
    expect(result).not.toBeNull();
    expect(result?.format).toBe('TD3');
    expect((result as any).firstName).toContain('ANNA');
    expect((result as any).lastName).toBe('ERIKSSON');
  });

  it('returns null when no MRZ-shaped lines are present', async () => {
    const result = await extractMrzFields('Just a regular paragraph of text.\nNothing MRZ-like here.');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npm test -- mrz-extraction
```
Expected: FAIL — `mrz-extraction.ts` doesn't exist yet (or if Step 1 was already done, this should instead already PASS since the implementation is correct; either order is fine here since this is a direct port of already-proven logic, not new behavior — if it passes immediately, that's expected, move to Step 4).

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm test -- mrz-extraction
```
Expected: 2 tests pass.

- [ ] **Step 5: Create `ocr.service.ts`**

Create `src/server/modules/documents/ocr.service.ts`:

```ts
// src/server/modules/documents/ocr.service.ts
//
// Trimmed port of the old docs module's OcrService (src/server/modules/
// docs/ocr.service.ts, untouched, still serving the old model) -- images
// and PDF only this phase (no DOCX/plain-text). PDF password support is
// dropped: an encrypted PDF now fails cleanly with a fixed message instead
// of accepting a password, since this phase's pipeline is an async queued
// job with nobody present to supply one.
import { Injectable, OnModuleInit, OnModuleDestroy, Logger, BadRequestException } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';
import { extractMrzFields } from './mrz-extraction';

export interface OcrResult {
  text: string;
  structuredFields: Record<string, unknown> | null;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/bmp']);
const PDF_MIME = 'application/pdf';

// Below this many characters, a PDF's embedded text layer is treated as
// absent (title-only metadata, stray whitespace) rather than real content —
// the page gets rasterized and OCR'd like a scanned document instead.
const PDF_TEXT_LAYER_MIN_CHARS = 40;

// pdfjs-dist v6 ships ESM-only (.mjs, no CJS entry point). TypeScript
// compiles this project to CommonJS, and its `module: commonjs` dynamic
// `import()` transform rewrites `await import(...)` into a `require()` call
// — which throws ERR_REQUIRE_ESM for a real ESM-only package. Going through
// `new Function` for the import expression bypasses that transform and
// reaches Node's native dynamic import, which loads .mjs correctly.
const importEsm = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

@Injectable()
export class OcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private worker: Worker | null = null;

  async onModuleInit() {
    this.worker = await createWorker('eng');
    this.logger.log('Tesseract worker ready');
  }

  async onModuleDestroy() {
    await this.worker?.terminate();
  }

  async extract(filePath: string, mimeType: string): Promise<OcrResult> {
    if (mimeType === PDF_MIME) return this.extractPdf(filePath);
    if (IMAGE_MIME_TYPES.has(mimeType)) return this.extractImage(filePath);
    throw new BadRequestException(`OCR is not supported for ${mimeType} in this phase.`);
  }

  private async extractImage(filePathOrBuffer: string | Buffer): Promise<OcrResult> {
    if (!this.worker) throw new Error('OCR worker not initialized');
    const { data } = await this.worker.recognize(filePathOrBuffer);
    return { text: data.text, structuredFields: await extractMrzFields(data.text) };
  }

  private async extractPdf(filePath: string): Promise<OcrResult> {
    const pdfjs = await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(await fs.promises.readFile(filePath));

    let doc;
    try {
      doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    } catch (e: any) {
      if (e?.name === 'PasswordException') {
        throw new BadRequestException('This PDF is password-protected and cannot be processed automatically; it needs manual OCR.');
      }
      throw e;
    }

    let textLayer = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      textLayer += content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ') + '\n';
    }

    if (textLayer.trim().length >= PDF_TEXT_LAYER_MIN_CHARS) {
      return { text: textLayer.trim(), structuredFields: await extractMrzFields(textLayer) };
    }

    // No usable text layer (scanned/faxed document) — rasterize each page
    // and run it through the same OCR pass as a standalone image upload.
    let ocrText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d') as any, viewport }).promise;
      const { text: pageText } = await this.extractImage(canvas.toBuffer('image/png'));
      ocrText += pageText + '\n';
    }
    return { text: ocrText.trim(), structuredFields: await extractMrzFields(ocrText) };
  }
}
```

- [ ] **Step 6: Write the OCR dispatch and image-extraction tests**

Create `src/server/modules/documents/ocr.service.spec.ts`:

```ts
// src/server/modules/documents/ocr.service.spec.ts
//
// Covers dispatch-by-mimetype and real image OCR (rendered via
// @napi-rs/canvas, already a project dependency -- no external fixture
// files needed). PDF-specific extraction (text-layer vs. rasterize
// fallback, password handling) is NOT covered here: hand-authoring a
// reliably-parseable minimal PDF fixture is fragile, and this exact PDF
// logic was ported unmodified from code that itself was only ever
// live/manually verified, never unit-tested (see the plan's Task 4 final
// step for the live verification that covers the PDF path).
import { createCanvas } from '@napi-rs/canvas';
import { OcrService } from './ocr.service';

function makeTestImageBuffer(text: string): Buffer {
  const canvas = createCanvas(400, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 400, 100);
  ctx.fillStyle = 'black';
  ctx.font = '32px sans-serif';
  ctx.fillText(text, 10, 60);
  return canvas.toBuffer('image/png');
}

describe('OcrService', () => {
  let service: OcrService;

  beforeAll(async () => {
    service = new OcrService();
    await service.onModuleInit();
  }, 30000);

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('rejects an unsupported mime type', async () => {
    await expect(service.extract('/tmp/whatever.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )).rejects.toThrow('OCR is not supported for');
  });

  it('extracts text from a real rendered image', async () => {
    const buffer = makeTestImageBuffer('HELLO OCR TEST');
    const tmpPath = require('path').join(require('os').tmpdir(), `ocr-test-${Date.now()}.png`);
    await require('fs').promises.writeFile(tmpPath, buffer);
    try {
      const result = await service.extract(tmpPath, 'image/png');
      expect(result.text.toUpperCase()).toContain('HELLO');
      expect(result.text.toUpperCase()).toContain('OCR');
    } finally {
      await require('fs').promises.unlink(tmpPath);
    }
  }, 30000);
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:
```bash
npm test -- ocr.service
```
Expected: 2 tests pass. (First run may be slower — Tesseract downloads/initializes its English language data.)

- [ ] **Step 8: Run the full suite to confirm no regressions**

Run:
```bash
npm test
```
Expected: every existing suite still passes, plus the new ones from this task.

- [ ] **Step 9: Commit**

```bash
git add src/server/modules/documents/mrz-extraction.ts src/server/modules/documents/ocr.service.ts src/server/modules/documents/mrz-extraction.spec.ts src/server/modules/documents/ocr.service.spec.ts
git commit -m "feat: add OcrService (images+PDF) and standalone MRZ extraction for the new documents module

Ports the old docs module's proven Tesseract/pdfjs OCR logic onto the new
documents module, trimmed to images+PDF (no DOCX/plain-text this phase)
and with PDF password support dropped (an encrypted PDF now fails
cleanly with a fixed message -- this phase's pipeline is an async queued
job with nobody present to supply a password). MRZ parsing is pulled out
into a standalone extractMrzFields() function so it's testable with a
real MRZ string directly, without needing a rendered/OCR'd image.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Real DocumentProcessingProcessor pipeline

**Files:**
- Modify: `src/server/modules/documents/document-processing.processor.ts`
- Modify: `src/server/modules/documents/documents.module.ts`
- Test: `src/server/modules/documents/document-processing.processor.spec.ts`

**Interfaces:**
- Consumes: `AvScanService.scan(filePath)` (Task 2), `OcrService.extract(filePath, mimeType)` (Task 3), `DocumentsService.upload()` (existing, Phase 1).
- Produces: nothing new for later tasks — this is the integration point for this sub-project.

- [ ] **Step 1: Write the failing tests**

Create `src/server/modules/documents/document-processing.processor.spec.ts`:

```ts
// src/server/modules/documents/document-processing.processor.spec.ts
import { createCanvas } from '@napi-rs/canvas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from './documents.service';
import { DocumentProcessingProcessor } from './document-processing.processor';
import { OcrService } from './ocr.service';
import { AvScanService, ScanResult } from './av-scan.service';
import { truncateAll } from '../../test/db-test-utils';

// A fake AvScanService -- npm test must never require a running ClamAV
// daemon. Cast through `unknown` since this doesn't extend the real class,
// it only needs to satisfy the one method DocumentProcessingProcessor
// actually calls.
class FakeAvScanService {
  constructor(private readonly result: ScanResult) {}
  async scan(): Promise<ScanResult> {
    return this.result;
  }
}

function makeTestImageBuffer(text: string): Buffer {
  const canvas = createCanvas(400, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 400, 100);
  ctx.fillStyle = 'black';
  ctx.font = '32px sans-serif';
  ctx.fillText(text, 10, 60);
  return canvas.toBuffer('image/png');
}

function makeUploadFile(buffer: Buffer): Express.Multer.File {
  return { buffer, mimetype: 'image/png', originalname: 'test.png', size: buffer.length } as Express.Multer.File;
}

const fakeQueue = { add: async () => ({ id: 'test-job-id' }) } as any;

describe('DocumentProcessingProcessor', () => {
  let prisma: PrismaService;
  let documents: DocumentsService;
  let ocr: OcrService;

  beforeAll(async () => {
    prisma = new PrismaService();
    ocr = new OcrService();
    await ocr.onModuleInit();
  }, 30000);

  afterAll(async () => {
    await ocr.onModuleDestroy();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    documents = new DocumentsService(prisma, audit, fakeQueue);
  });

  it('processes a clean image through to READY_FOR_REVIEW with OCR text populated', async () => {
    const buffer = makeTestImageBuffer('CLEAN FILE');
    const created = await documents.upload(makeUploadFile(buffer), {
      entityLinks: JSON.stringify([{ entityType: 'Trip', entityId: 'TEST-TRIP-1' }]),
      uploadedBy: 'test-user',
    });

    const processor = new DocumentProcessingProcessor(prisma, ocr, new FakeAvScanService({ clean: true }) as unknown as AvScanService);
    await processor.process({ data: { documentId: created.documentId, jobId: created.processingJobs[0].id } } as any);

    const result = await prisma.document.findUniqueOrThrow({
      where: { documentId: created.documentId },
      include: { versions: true },
    });
    expect(result.status).toBe('READY_FOR_REVIEW');
    expect(result.versions[0].ocrText?.toUpperCase()).toContain('CLEAN FILE');
  }, 30000);

  it('rejects an infected file before OCR runs, leaving ocrText null and not retrying', async () => {
    const buffer = makeTestImageBuffer('INFECTED FILE');
    const created = await documents.upload(makeUploadFile(buffer), {
      entityLinks: JSON.stringify([{ entityType: 'Trip', entityId: 'TEST-TRIP-2' }]),
      uploadedBy: 'test-user',
    });

    const processor = new DocumentProcessingProcessor(
      prisma, ocr,
      new FakeAvScanService({ clean: false, signature: 'Test.Signature' }) as unknown as AvScanService,
    );
    await expect(
      processor.process({ data: { documentId: created.documentId, jobId: created.processingJobs[0].id } } as any),
    ).resolves.toBeUndefined(); // must NOT throw -- an infected file is terminal, not a retry-worthy error

    const result = await prisma.document.findUniqueOrThrow({
      where: { documentId: created.documentId },
      include: { versions: true },
    });
    expect(result.status).toBe('SECURITY_REJECTED');
    expect(result.versions[0].ocrText).toBeNull();

    const job = await prisma.documentProcessingJob.findUniqueOrThrow({ where: { id: created.processingJobs[0].id } });
    expect(job.status).toBe('FAILED');
    expect(job.errorMessage).toContain('Test.Signature');
  }, 30000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npm test -- document-processing.processor
```
Expected: FAIL — `DocumentProcessingProcessor`'s constructor doesn't accept `ocr`/`avScan` yet, and its `process()` method still runs the Phase 1 stub's fixed status walk instead of a real scan+extract pipeline.

- [ ] **Step 3: Rewrite `DocumentProcessingProcessor`**

Replace the full content of `src/server/modules/documents/document-processing.processor.ts`:

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OcrService } from './ocr.service';
import { AvScanService } from './av-scan.service';

// Phase 2: real security scan + OCR/extraction, replacing Phase 1's stub
// (which walked every job straight to READY_FOR_REVIEW). An infected file
// is a terminal, correct outcome -- it returns normally (no throw) so
// BullMQ does not retry it; a genuine processing error still throws so
// the existing retry/backoff configuration (documents.service.ts's
// queue.add call) applies.
@Injectable()
@Processor('document-processing')
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocr: OcrService,
    private readonly avScan: AvScanService,
  ) {
    super();
  }

  async process(job: Job<{ documentId: string; jobId: number }>): Promise<void> {
    const { documentId, jobId } = job.data;
    try {
      await this.prisma.document.update({ where: { documentId }, data: { status: 'SECURITY_SCAN' } });

      const version = await this.prisma.documentVersion.findFirstOrThrow({
        where: { documentId },
        orderBy: { versionNumber: 'desc' },
      });

      const scanResult = await this.avScan.scan(version.storagePath);
      if (!scanResult.clean) {
        await this.prisma.document.update({ where: { documentId }, data: { status: 'SECURITY_REJECTED' } });
        await this.prisma.documentProcessingJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            errorMessage: `File rejected by security scan${scanResult.signature ? `: ${scanResult.signature}` : ''}`,
            completedAtZ: new Date(),
          },
        });
        return;
      }

      await this.prisma.document.update({ where: { documentId }, data: { status: 'QUEUED' } });

      const document = await this.prisma.document.findUniqueOrThrow({ where: { documentId } });
      const { text, structuredFields } = await this.ocr.extract(version.storagePath, document.mimeType);

      await this.prisma.documentVersion.update({
        where: { id: version.id },
        data: {
          ocrText: text,
          ocrStructuredFields: structuredFields as Prisma.InputJsonValue | null,
        },
      });

      await this.prisma.document.update({ where: { documentId }, data: { status: 'READY_FOR_REVIEW' } });
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

- [ ] **Step 4: Register the new providers in `documents.module.ts`**

Replace the full content of `src/server/modules/documents/documents.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentProcessingProcessor } from './document-processing.processor';
import { OcrService } from './ocr.service';
import { AvScanService } from './av-scan.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'document-processing' })],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentProcessingProcessor, OcrService, AvScanService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
npm test -- document-processing.processor
```
Expected: both tests pass.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run:
```bash
npm test
```
Expected: every suite passes, including Task 2's and Task 3's new tests.

- [ ] **Step 7: `npm run build:server` and `npm run build:client`**

Run:
```bash
npm run build:server
npm run build:client
```
Expected: both build cleanly with zero TypeScript errors. (This project's `tsconfig.json` and `tsconfig.client.json` both have `noUnusedLocals: true` — a prior sub-project's unused import passed Jest but failed `nest build`; confirm this doesn't happen here.)

- [ ] **Step 8: Live verification (manual, not part of the automated suite)**

With Docker running (`docker compose up -d`, including the new `clamav` service from Task 1, which must be healthy):

1. Start the server: `npm run start:dev`.
2. Upload a real small image through `POST /api/documents/upload` (multipart form: a file field, `entityLinks` = `[{"entityType":"Trip","entityId":"TEST-1"}]`, `uploadedBy` = your name).
3. Poll `GET /api/documents/:id` (the `documentId` from the upload response) — within a few seconds, `versions[0].ocrText` should be populated and `status` should be `READY_FOR_REVIEW`.
4. Upload a real PDF (this is the one thing not covered by the automated suite — see Task 3's test file comment for why) — confirm the same result, and if you have a scanned/image-only PDF available, confirm its `ocrText` is still populated via the rasterize-fallback path.
5. If you have a password-protected PDF available, upload it and confirm the job reaches `PROCESSING_FAILED` with the "password-protected... needs manual OCR" message, rather than hanging or crashing the worker.
6. Confirm the old `/api/docs` endpoints are completely unaffected — upload a file there too, confirm it still lands in `DocAttachment` exactly as before.

This step has no pass/fail automation — note the outcome in your task report, including whether ClamAV was actually reachable (if the container wasn't healthy yet per Task 1's note about first-boot definition downloads, retry after it is).

- [ ] **Step 9: Commit**

```bash
git add src/server/modules/documents/document-processing.processor.ts src/server/modules/documents/documents.module.ts src/server/modules/documents/document-processing.processor.spec.ts
git commit -m "feat: wire real security scan + OCR into DocumentProcessingProcessor

Replaces Phase 1's stub (fixed status walk, no real work) with a real
pipeline: SECURITY_SCAN via AvScanService, then OCR/extraction via
OcrService on a clean file, writing ocrText/ocrStructuredFields onto the
DocumentVersion row. An infected file is a terminal outcome (returns
normally, no throw) so BullMQ does not retry it; a genuine processing
error still throws so the existing retry/backoff config applies.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-plan reminder

This plan does not touch the old `docs` module, `DocAttachment`, or
`DocVerifyDialog.tsx` — they keep working exactly as today. Page-level
`DocumentSection` splitting, family/type-driven structured extraction
schemas, and any AI-based classification remain Phase 3. The verification
UI, entity matching, and field-confidence display remain Phase 4.
DOCX/plain-text support for the new module, if ever needed, is an
explicitly deferred fast-follow, not forgotten.
