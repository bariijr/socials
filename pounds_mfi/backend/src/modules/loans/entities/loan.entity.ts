import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index, Check,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { LoanPackage } from './loan-package.entity';
import { Repayment } from './repayment.entity';
import { Penalty } from './penalty.entity';

export enum LoanStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  DISBURSED = 'disbursed',
  OVERDUE = 'overdue',
  CLOSED = 'closed',
  REJECTED = 'rejected',
}

@Entity('loans')
@Check('"createdById" != "approvedById"')
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  loanNumber: string;

  @Index()
  @Column()
  borrowerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'borrowerId' })
  borrower: User;

  @Index()
  @Column()
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Index()
  @Column({ nullable: true })
  approvedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approvedById' })
  approvedBy: User;

  @Column()
  packageId: string;

  @ManyToOne(() => LoanPackage)
  @JoinColumn({ name: 'packageId' })
  package: LoanPackage;

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.DRAFT })
  status: LoanStatus;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  principalAmount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  interestRate: number;

  @Column({ type: 'int' })
  durationDays: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  processingFeeAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  disbursedAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalRepayable: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalRepaid: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  outstandingBalance: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalPenalties: number;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ nullable: true })
  submittedAt: Date;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column({ nullable: true })
  disbursedAt: Date;

  @Column({ nullable: true })
  closedAt: Date;

  @Column({ nullable: true, type: 'text' })
  purpose: string;

  @Column({ nullable: true, type: 'text' })
  rejectionReason: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ default: false })
  isLocked: boolean;

  @Column({ nullable: true })
  lockedById: string;

  @Column({ nullable: true })
  lockedAt: Date;

  @Column({ nullable: true })
  lockedUntil: Date;

  @OneToMany(() => Repayment, (r) => r.loan, { cascade: true })
  repayments: Repayment[];

  @OneToMany(() => Penalty, (p) => p.loan, { cascade: true })
  penalties: Penalty[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
