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

// Mock the mrz module since it's ESM-only and ts-jest can't load it
jest.mock('mrz', () => ({
  parse: jest.fn(() => ({ valid: false, details: [], fields: {} })),
}), { virtual: true });

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
