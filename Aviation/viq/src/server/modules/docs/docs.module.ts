import { Module } from '@nestjs/common';
import { DocsService } from './docs.service';
import { DocsController } from './docs.controller';
import { OcrService } from './ocr.service';

@Module({
  controllers: [DocsController],
  providers: [DocsService, OcrService],
  exports: [DocsService],
})
export class DocsModule {}
