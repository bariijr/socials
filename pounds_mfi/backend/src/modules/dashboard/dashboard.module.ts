import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Loan } from '../loans/entities/loan.entity';
import { Repayment } from '../loans/entities/repayment.entity';
import { Penalty } from '../loans/entities/penalty.entity';
import { User } from '../users/entities/user.entity';
import { KycForm } from '../kyc/entities/kyc-form.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Repayment, Penalty, User, KycForm])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
