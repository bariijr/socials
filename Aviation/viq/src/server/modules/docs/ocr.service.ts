import { Injectable, OnModuleInit, OnModuleDestroy, Logger, BadRequestException } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';
import { parse } from 'mrz';
import * as fs from 'fs';
import * as mammoth from 'mammoth';

export interface OcrResult {
  text: string;
  structuredFields: Record<string, unknown> | null;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/bmp']);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT_MIME = 'text/plain';
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

  // Dispatches by mime type. `password` is only consulted for PDF — it is
  // never persisted (not part of UploadDocDto or any Prisma model), only
  // passed through in-memory for this one decrypt-and-read pass.
  async extract(filePath: string, mimeType: string, password?: string): Promise<OcrResult> {
    if (mimeType === PDF_MIME) return this.extractPdf(filePath, password);
    if (mimeType === DOCX_MIME) return this.extractDocx(filePath);
    if (mimeType === TEXT_MIME) return this.extractPlainText(filePath);
    if (IMAGE_MIME_TYPES.has(mimeType)) return this.extractImage(filePath);
    throw new BadRequestException(`OCR is not supported for ${mimeType}.`);
  }

  private async extractImage(filePathOrBuffer: string | Buffer): Promise<OcrResult> {
    if (!this.worker) throw new Error('OCR worker not initialized');
    const { data } = await this.worker.recognize(filePathOrBuffer);
    return { text: data.text, structuredFields: this.tryExtractMrz(data.text) };
  }

  private async extractPlainText(filePath: string): Promise<OcrResult> {
    const text = await fs.promises.readFile(filePath, 'utf-8');
    return { text, structuredFields: this.tryExtractMrz(text) };
  }

  private async extractDocx(filePath: string): Promise<OcrResult> {
    const buffer = await fs.promises.readFile(filePath);
    const { value: text } = await mammoth.extractRawText({ buffer });
    return { text, structuredFields: this.tryExtractMrz(text) };
  }

  private async extractPdf(filePath: string, password?: string): Promise<OcrResult> {
    const pdfjs = await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(await fs.promises.readFile(filePath));

    let doc;
    try {
      doc = await pdfjs.getDocument({ data, password, isEvalSupported: false }).promise;
    } catch (e: any) {
      if (e?.name === 'PasswordException') {
        throw new BadRequestException(
          e.code === pdfjs.PasswordResponses.NEED_PASSWORD
            ? 'This PDF is password protected. Provide the password and try again.'
            : 'Incorrect password for this PDF.'
        );
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
      return { text: textLayer.trim(), structuredFields: this.tryExtractMrz(textLayer) };
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
    return { text: ocrText.trim(), structuredFields: this.tryExtractMrz(ocrText) };
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
