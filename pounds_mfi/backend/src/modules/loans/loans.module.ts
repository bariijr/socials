import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { Loan } from './entities/loan.entity';
import { LoanPackage } from './entities/loan-package.entity';
import { Repayment } from './entities/repayment.entity';
import { Penalty } from './entities/penalty.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Loan, LoanPackage, Repayment, Penalty]),
    ScheduleModule.forRoot(),
  ],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
