import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany,
} from 'typeorm';
import { Loan } from './loan.entity';

export enum InterestFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

@Entity('loan_packages')
export class LoanPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  interestRate: number;

  @Column({ type: 'enum', enum: InterestFrequency, default: InterestFrequency.MONTHLY })
  interestFrequency: InterestFrequency;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  minAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  maxAmount: number;

  @Column({ type: 'int' })
  minDuration: number;

  @Column({ type: 'int' })
  maxDuration: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 5 })
  processingFeePercent: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 5 })
  penaltyPercent: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, type: 'jsonb' })
  eligibilityCriteria: Record<string, any>;

  @OneToMany(() => Loan, (loan) => loan.package)
  loans: Loan[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
