import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
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
          // Prisma requires the `Prisma.JsonNull` sentinel (not a literal
          // `null`) to write SQL NULL into a nullable Json column.
          ocrStructuredFields: structuredFields === null ? Prisma.JsonNull : (structuredFields as Prisma.InputJsonValue),
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
