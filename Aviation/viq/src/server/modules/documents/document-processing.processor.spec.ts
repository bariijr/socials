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
  }, 30000);

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
