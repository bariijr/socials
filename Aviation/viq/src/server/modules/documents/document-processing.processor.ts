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
