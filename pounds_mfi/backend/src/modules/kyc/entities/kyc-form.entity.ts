import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { KycDocument } from './kyc-document.entity';

export enum KycStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('kyc_forms')
export class KycForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.DRAFT })
  status: KycStatus;

  @Column({ default: 1 })
  currentStep: number;

  @Column({ type: 'int', default: 4 })
  totalSteps: number;

  // Step 1 - Personal Info
  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  gender: string;

  // Step 2 - ID
  @Column({ nullable: true })
  idType: string;

  @Index()
  @Column({ nullable: true })
  idNumber: string;

  @Column({ nullable: true })
  idIssuedDate: Date;

  @Column({ nullable: true })
  idExpiryDate: Date;

  // Step 3 - Address
  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  county: string;

  @Column({ nullable: true })
  postalCode: string;

  // Step 4 - Employment
  @Column({ nullable: true })
  occupation: string;

  @Column({ nullable: true })
  employer: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  monthlyIncome: number;

  // OCR extracted data
  @Column({ type: 'jsonb', nullable: true })
  ocrData: Record<string, any>;

  // Notes
  @Column({ nullable: true, type: 'text' })
  reviewNotes: string;

  @Column({ nullable: true })
  reviewedById: string;

  @Column({ nullable: true })
  reviewedAt: Date;

  // Lead tracking
  @Column({ default: false })
  isLead: boolean;

  @Column({ nullable: true })
  leadSource: string;

  @OneToMany(() => KycDocument, (doc) => doc.kycForm, { cascade: true })
  documents: KycDocument[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
