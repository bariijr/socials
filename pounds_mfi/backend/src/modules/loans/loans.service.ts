import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { Loan, LoanStatus } from './entities/loan.entity';
import { LoanPackage } from './entities/loan-package.entity';
import { Repayment } from './entities/repayment.entity';
import { Penalty } from './entities/penalty.entity';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
    @InjectRepository(LoanPackage) private packageRepo: Repository<LoanPackage>,
    @InjectRepository(Repayment) private repaymentRepo: Repository<Repayment>,
    @InjectRepository(Penalty) private penaltyRepo: Repository<Penalty>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async createLoan(dto: any, currentUser: any) {
    const pkg = await this.packageRepo.findOne({ where: { id: dto.packageId, isActive: true } });
    if (!pkg) throw new NotFoundException('Loan package not found');

    if (dto.principalAmount < pkg.minAmount || dto.principalAmount > pkg.maxAmount) {
      throw new BadRequestException(
        `Amount must be between ${pkg.minAmount} and ${pkg.maxAmount}`,
      );
    }

    const processingFee = (dto.principalAmount * pkg.processingFeePercent) / 100;
    const interestAmount =
      (dto.principalAmount * pkg.interestRate * dto.durationDays) /
      (this.daysInFrequency(pkg.interestFrequency) * 100);
    const totalRepayable = dto.principalAmount + interestAmount;

    const loan = this.loanRepo.create({
      loanNumber: await this.generateLoanNumber(),
      borrowerId: dto.borrowerId || currentUser.id,
      createdById: currentUser.id,
      packageId: dto.packageId,
      principalAmount: dto.principalAmount,
      interestRate: pkg.interestRate,
      durationDays: dto.durationDays,
      processingFeeAmount: processingFee,
      disbursedAmount: dto.principalAmount - processingFee,
      totalRepayable,
      outstandingBalance: totalRepayable,
      purpose: dto.purpose,
      notes: dto.notes,
      status: LoanStatus.DRAFT,
    });

    return this.loanRepo.save(loan);
  }

  async submitLoan(id: string, currentUser: any) {
    const loan = await this.findLoanOrFail(id);
    if (loan.createdById !== currentUser.id && currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only creator can submit this loan');
    }
    if (loan.status !== LoanStatus.DRAFT) {
      throw new BadRequestException('Only draft loans can be submitted');
    }
    return this.loanRepo.save({ ...loan, status: LoanStatus.SUBMITTED, submittedAt: new Date() });
  }

  async approveLoan(id: string, currentUser: any) {
    const loan = await this.findLoanOrFail(id);

    if (loan.createdById === currentUser.id) {
      throw new ForbiddenException('Approver cannot be the creator of the loan');
    }
    if (loan.status !== LoanStatus.SUBMITTED) {
      throw new BadRequestException('Only submitted loans can be approved');
    }
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(currentUser.role)) {
      throw new ForbiddenException('Insufficient permissions to approve loans');
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + loan.durationDays);

    return this.loanRepo.save({
      ...loan,
      status: LoanStatus.APPROVED,
      approvedById: currentUser.id,
      approvedAt: new Date(),
      dueDate,
      isLocked: true,
    });
  }

  async rejectLoan(id: string, reason: string, currentUser: any) {
    const loan = await this.findLoanOrFail(id);
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(currentUser.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    if (!['submitted', 'approved'].includes(loan.status)) {
      throw new BadRequestException('Cannot reject loan in current state');
    }
    return this.loanRepo.save({
      ...loan,
      status: LoanStatus.REJECTED,
      rejectionReason: reason,
    });
  }

  async recordRepayment(loanId: string, dto: any, currentUser: any) {
    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOne(Loan, {
        where: { id: loanId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!loan) throw new NotFoundException('Loan not found');
      if (![LoanStatus.DISBURSED, LoanStatus.OVERDUE].includes(loan.status)) {
        throw new BadRequestException('Loan is not active for repayments');
      }

      const amount = parseFloat(dto.amount);
      if (amount <= 0) throw new BadRequestException('Amount must be positive');
      if (amount > loan.outstandingBalance) {
        throw new BadRequestException('Amount exceeds outstanding balance');
      }

      const newBalance = parseFloat(loan.outstandingBalance as any) - amount;
      const repayment = manager.create(Repayment, {
        loanId,
        receiptId: dto.receiptId,
        recordedById: currentUser.id,
        amount,
        balanceAfter: newBalance,
        paymentDate: dto.paymentDate || new Date(),
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        status: 'verified',
      });

      await manager.save(repayment);
      await manager.update(Loan, loanId, {
        outstandingBalance: newBalance,
        totalRepaid: parseFloat(loan.totalRepaid as any) + amount,
        status: newBalance <= 0 ? LoanStatus.CLOSED : loan.status,
        closedAt: newBalance <= 0 ? new Date() : undefined,
      });

      return repayment;
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async applyPenalties() {
    const overdueLoans = await this.loanRepo.find({
      where: { status: LoanStatus.DISBURSED, dueDate: LessThan(new Date()) },
    });

    for (const loan of overdueLoans) {
      await this.dataSource.transaction(async (manager) => {
        const penaltyAmount =
          (parseFloat(loan.outstandingBalance as any) *
            5) /
          100;

        await manager.save(Penalty, {
          loanId: loan.id,
          amount: penaltyAmount,
          ratePercent: 5,
          balanceAtTime: loan.outstandingBalance,
        });

        await manager.update(Loan, loan.id, {
          status: LoanStatus.OVERDUE,
          outstandingBalance:
            parseFloat(loan.outstandingBalance as any) + penaltyAmount,
          totalPenalties:
            parseFloat(loan.totalPenalties as any) + penaltyAmount,
        });
      });
    }
  }

  async findAll(query: any, currentUser: any) {
    const qb = this.loanRepo
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .leftJoinAndSelect('loan.createdBy', 'createdBy')
      .leftJoinAndSelect('loan.approvedBy', 'approvedBy')
      .leftJoinAndSelect('loan.package', 'package')
      .orderBy('loan.createdAt', 'DESC');

    if (currentUser.role === UserRole.USER) {
      qb.where('loan.borrowerId = :id', { id: currentUser.id });
    }
    if (query.status) qb.andWhere('loan.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('loan.loanNumber ILIKE :s', { s: `%${query.search}%` });
    }

    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, currentUser: any) {
    const loan = await this.loanRepo.findOne({
      where: { id },
      relations: ['borrower', 'createdBy', 'approvedBy', 'package', 'repayments', 'penalties'],
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (currentUser.role === UserRole.USER && loan.borrowerId !== currentUser.id) {
      throw new ForbiddenException('Access denied');
    }
    return loan;
  }

  async acquireLock(id: string, userId: string) {
    const loan = await this.findLoanOrFail(id);
    if (loan.isLocked && loan.lockedById !== userId && loan.lockedUntil > new Date()) {
      throw new ConflictException('Record is being edited by another user');
    }
    await this.loanRepo.update(id, {
      isLocked: true,
      lockedById: userId,
      lockedAt: new Date(),
      lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
    });
    return { locked: true };
  }

  async releaseLock(id: string, userId: string) {
    await this.loanRepo.update({ id, lockedById: userId }, { isLocked: false, lockedById: null } as any);
    return { locked: false };
  }

  async getPackages() {
    return this.packageRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async createPackage(dto: any) {
    const pkg = this.packageRepo.create(dto);
    return this.packageRepo.save(pkg);
  }

  async updatePackage(id: string, dto: any) {
    await this.packageRepo.update(id, dto);
    return this.packageRepo.findOne({ where: { id } });
  }

  private async findLoanOrFail(id: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({ where: { id } });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }

  private async generateLoanNumber(): Promise<string> {
    const date = new Date();
    const prefix = `LN${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.loanRepo.count();
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  private daysInFrequency(freq: string): number {
    const map: Record<string, number> = {
      daily: 1, weekly: 7, monthly: 30, yearly: 365,
    };
    return map[freq] || 30;
  }
}
