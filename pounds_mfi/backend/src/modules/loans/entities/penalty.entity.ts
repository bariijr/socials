import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Loan } from './loan.entity';

@Entity('penalties')
export class Penalty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  loanId: string;

  @ManyToOne(() => Loan, (loan) => loan.penalties)
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  ratePercent: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  balanceAtTime: number;

  @Column({ nullable: true })
  weekNumber: number;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ default: false })
  waived: boolean;

  @Column({ nullable: true })
  waivedById: string;

  @Column({ nullable: true })
  waivedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
