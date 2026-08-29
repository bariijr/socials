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
