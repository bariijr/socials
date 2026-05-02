import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Loan } from '../../loans/entities/loan.entity';
import { User } from '../../users/entities/user.entity';

@Entity('disbursements')
export class Disbursement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  loanId: string;

  @ManyToOne(() => Loan)
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @Column()
  disbursedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'disbursedById' })
  disbursedBy: User;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column()
  disbursementDate: Date;

  @Column({ nullable: true })
  paymentMethod: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  transactionReference: string;

  // Proof upload (REQUIRED)
  @Column()
  proofFileName: string;

  @Column()
  proofFilePath: string;

  @Column()
  proofMimeType: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  verifiedById: string;

  @Column({ nullable: true })
  verifiedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
