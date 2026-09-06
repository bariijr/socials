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
