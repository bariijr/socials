import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index, Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Loan } from '../../loans/entities/loan.entity';
import { ReceiptFile } from './receipt-file.entity';

export enum ReceiptStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  DUPLICATE = 'duplicate',
}

@Entity('receipts')
@Unique(['receiptNumber'])
@Unique(['fileHash'])
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  receiptNumber: string;

  @Index()
  @Column({ nullable: true })
  loanId: string;

  @ManyToOne(() => Loan, { nullable: true })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @Index()
  @Column()
  submittedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'submittedById' })
  submittedBy: User;

  @Column({ nullable: true })
  verifiedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'verifiedById' })
  verifiedBy: User;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ nullable: true })
  paymentDate: Date;

  @Column({ nullable: true })
  payerName: string;

  @Column({ nullable: true })
  payerPhone: string;

  @Column({ nullable: true })
  paymentMethod: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ type: 'enum', enum: ReceiptStatus, default: ReceiptStatus.PENDING })
  status: ReceiptStatus;

  @Index()
  @Column({ nullable: true })
  fileHash: string;

  @Column({ nullable: true })
  fingerprint: string;

  @Column({ type: 'jsonb', nullable: true })
  ocrRawData: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  ocrConfirmedData: Record<string, any>;

  @Column({ default: false })
  ocrProcessed: boolean;

  @Column({ nullable: true })
  duplicateOfId: string;

  @Column({ default: false })
  isSimilarFlagged: boolean;

  @Column({ type: 'jsonb', nullable: true })
  similarReceiptIds: string[];

  @Column({ nullable: true, type: 'text' })
  rejectionReason: string;

  @Column({ nullable: true })
  verifiedAt: Date;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @OneToMany(() => ReceiptFile, (f) => f.receipt, { cascade: true })
  files: ReceiptFile[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
