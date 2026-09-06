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
