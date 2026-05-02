import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisbursementsController } from './disbursements.controller';
import { DisbursementsService } from './disbursements.service';
import { Disbursement } from './entities/disbursement.entity';
import { Loan } from '../loans/entities/loan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Disbursement, Loan])],
  controllers: [DisbursementsController],
  providers: [DisbursementsService],
  exports: [DisbursementsService],
})
export class DisbursementsModule {}
