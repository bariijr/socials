import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Loan } from './loan.entity';
import { User } from '../../users/entities/user.entity';

export enum RepaymentStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity('repayments')
export class Repayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  loanId: string;

  @ManyToOne(() => Loan, (loan) => loan.repayments)
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @Column({ nullable: true })
  receiptId: string;

  @Column({ nullable: true })
  recordedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recordedById' })
  recordedBy: User;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  principalPortion: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  interestPortion: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  penaltyPortion: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balanceAfter: number;

  @Column({ type: 'enum', enum: RepaymentStatus, default: RepaymentStatus.PENDING })
  status: RepaymentStatus;

  @Column({ nullable: true })
  paymentDate: Date;

  @Column({ nullable: true })
  paymentMethod: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
