import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Disbursement } from './entities/disbursement.entity';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';

@Injectable()
export class DisbursementsService {
  constructor(
    @InjectRepository(Disbursement) private disbursementRepo: Repository<Disbursement>,
    @InjectRepository(Loan) private loanRepo: Repository<Loan>,
  ) {}

  async disburse(loanId: string, dto: any, file: Express.Multer.File, currentUser: any) {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.APPROVED) {
      throw new BadRequestException('Loan must be approved before disbursement');
    }
    if (!file) throw new BadRequestException('Proof of disbursement is required');

    const disbursement = this.disbursementRepo.create({
      loanId,
      disbursedById: currentUser.id,
      amount: dto.amount || loan.disbursedAmount,
      disbursementDate: dto.disbursementDate ? new Date(dto.disbursementDate) : new Date(),
      paymentMethod: dto.paymentMethod,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      transactionReference: dto.transactionReference,
      proofFileName: file.originalname,
      proofFilePath: file.path,
      proofMimeType: file.mimetype,
      notes: dto.notes,
    });

    const saved = await this.disbursementRepo.save(disbursement);

    await this.loanRepo.update(loanId, {
      status: LoanStatus.DISBURSED,
      disbursedAt: new Date(),
      dueDate: new Date(Date.now() + loan.durationDays * 86400000),
    });

    return saved;
  }

  async findByLoan(loanId: string) {
    return this.disbursementRepo.find({
      where: { loanId },
      relations: ['disbursedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const d = await this.disbursementRepo.findOne({
      where: { id },
      relations: ['disbursedBy', 'loan'],
    });
    if (!d) throw new NotFoundException('Disbursement not found');
    return d;
  }

  async verify(id: string, currentUser: any) {
    await this.disbursementRepo.update(id, {
      isVerified: true,
      verifiedById: currentUser.id,
      verifiedAt: new Date(),
    });
    return this.findOne(id);
  }
}
