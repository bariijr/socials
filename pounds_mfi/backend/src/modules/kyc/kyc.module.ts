import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycForm } from './entities/kyc-form.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [TypeOrmModule.forFeature([KycForm, KycDocument]), OcrModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
