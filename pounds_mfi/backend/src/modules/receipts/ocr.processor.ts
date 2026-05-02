import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptFile } from './entities/receipt-file.entity';
import { OcrService } from '../ocr/ocr.service';

@Processor('ocr')
export class OcrProcessor {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    @InjectRepository(ReceiptFile) private fileRepo: Repository<ReceiptFile>,
    private ocrService: OcrService,
  ) {}

  @Process('process-receipt')
  async processReceipt(job: Job<{ receiptId: string; filePath: string; mimeType: string }>) {
    const { receiptId, filePath, mimeType } = job.data;
    this.logger.log(`Processing OCR for receipt ${receiptId}`);

    try {
      const result = await this.ocrService.extractText(filePath, mimeType);

      await this.receiptRepo.update(receiptId, {
        ocrRawData: result,
        ocrProcessed: true,
        // Pre-fill from OCR if not already set
        ...(result.extracted.amount && { amount: result.extracted.amount }),
        ...(result.extracted.receiptNumber && { receiptNumber: result.extracted.receiptNumber }),
        ...(result.extracted.payerName && { payerName: result.extracted.payerName }),
        ...(result.extracted.bankName && { bankName: result.extracted.bankName }),
      });

      await this.fileRepo.update(
        { receiptId, isPrimary: true },
        { ocrResult: result, ocrProcessed: true, ocrProcessedAt: new Date() },
      );

      this.logger.log(`OCR complete for receipt ${receiptId}, confidence: ${result.confidence}`);
    } catch (error) {
      this.logger.error(`OCR failed for receipt ${receiptId}: ${error.message}`);
      throw error;
    }
  }
}
