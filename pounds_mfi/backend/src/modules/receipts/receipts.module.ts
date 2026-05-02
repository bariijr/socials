import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { Receipt } from './entities/receipt.entity';
import { ReceiptFile } from './entities/receipt-file.entity';
import { OcrModule } from '../ocr/ocr.module';
import { OcrProcessor } from './ocr.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receipt, ReceiptFile]),
    BullModule.registerQueue({ name: 'ocr' }),
    OcrModule,
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, OcrProcessor],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
