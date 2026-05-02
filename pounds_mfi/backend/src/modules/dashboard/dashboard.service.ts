import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';
import { Repayment } from '../loans/entities/repayment.entity';
import { Penalty } from '../loans/entities/penalty.entity';
import { User } from '../users/entities/user.entity';
import { KycForm, KycStatus } from '../kyc/entities/kyc-form.entity';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(Repayment) private repaymentRepo: Repository<Repayment>,
    @InjectRepository(Penalty) private penaltyRepo: Repository<Penalty>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(KycForm) private kycRepo: Repository<KycForm>,
  ) {}

  async getKpis() {
    const [
      totalLoans,
      activeLoans,
      overdueLoans,
      totalUsers,
      totalPrincipal,
      totalRepaid,
      totalOutstanding,
      totalPenalties,
      pendingKyc,
    ] = await Promise.all([
      this.loanRepo.count(),
      this.loanRepo.count({ where: { status: LoanStatus.DISBURSED } }),
      this.loanRepo.count({ where: { status: LoanStatus.OVERDUE } }),
      this.userRepo.count(),
      this.loanRepo
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.principalAmount), 0)', 'total')
        .where('l.status NOT IN (:...s)', { s: [LoanStatus.DRAFT, LoanStatus.REJECTED] })
        .getRawOne(),
      this.loanRepo
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.totalRepaid), 0)', 'total')
        .getRawOne(),
      this.loanRepo
        .createQueryBuilder('l')
        .select('COALESCE(SUM(l.outstandingBalance), 0)', 'total')
        .where('l.status IN (:...s)', { s: [LoanStatus.DISBURSED, LoanStatus.OVERDUE] })
        .getRawOne(),
      this.penaltyRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.waived = false')
        .getRawOne(),
      this.kycRepo.count({ where: { status: KycStatus.SUBMITTED } }),
    ]);

    return {
      totalLoans,
      activeLoans,
      overdueLoans,
      totalUsers,
      totalIssued: parseFloat(totalPrincipal?.total || 0),
      totalRepaid: parseFloat(totalRepaid?.total || 0),
      totalOutstanding: parseFloat(totalOutstanding?.total || 0),
      totalPenalties: parseFloat(totalPenalties?.total || 0),
      pendingKyc,
      collectionRate:
        totalPrincipal?.total > 0
          ? ((totalRepaid?.total / totalPrincipal?.total) * 100).toFixed(2)
          : '0.00',
    };
  }

  async getLoanTrend(months = 6) {
    const result = [];
    for (let i = months - 1; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      const [issued, repaid] = await Promise.all([
        this.loanRepo
          .createQueryBuilder('l')
          .select('COALESCE(SUM(l.principalAmount), 0)', 'total')
          .where('l.createdAt BETWEEN :start AND :end', { start, end })
          .andWhere('l.status NOT IN (:...s)', { s: [LoanStatus.DRAFT, LoanStatus.REJECTED] })
          .getRawOne(),
        this.repaymentRepo
          .createQueryBuilder('r')
          .select('COALESCE(SUM(r.amount), 0)', 'total')
          .where('r.createdAt BETWEEN :start AND :end', { start, end })
          .getRawOne(),
      ]);

      result.push({
        month: format(date, 'MMM yyyy'),
        issued: parseFloat(issued?.total || 0),
        repaid: parseFloat(repaid?.total || 0),
      });
    }
    return result;
  }

  async getLoanStatusBreakdown() {
    const statuses = Object.values(LoanStatus);
    const result = await Promise.all(
      statuses.map(async (status) => ({
        status,
        count: await this.loanRepo.count({ where: { status } }),
      })),
    );
    return result.filter((r) => r.count > 0);
  }

  async getRecentActivity() {
    const [recentLoans, recentRepayments] = await Promise.all([
      this.loanRepo.find({
        take: 5,
        order: { createdAt: 'DESC' },
        relations: ['borrower', 'package'],
      }),
      this.repaymentRepo.find({
        take: 5,
        order: { createdAt: 'DESC' },
        relations: ['loan'],
      }),
    ]);
    return { recentLoans, recentRepayments };
  }
}
