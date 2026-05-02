import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { KycForm } from './kyc-form.entity';

export enum DocumentType {
  NATIONAL_ID_FRONT = 'national_id_front',
  NATIONAL_ID_BACK = 'national_id_back',
  PASSPORT = 'passport',
  DRIVING_LICENSE = 'driving_license',
  UTILITY_BILL = 'utility_bill',
  BANK_STATEMENT = 'bank_statement',
  SELFIE = 'selfie',
  OTHER = 'other',
}

@Entity('kyc_documents')
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  kycFormId: string;

  @ManyToOne(() => KycForm, (form) => form.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kycFormId' })
  kycForm: KycForm;

  @Column({ type: 'enum', enum: DocumentType })
  documentType: DocumentType;

  @Column()
  fileName: string;

  @Column()
  filePath: string;

  @Column()
  mimeType: string;

  @Column({ type: 'bigint' })
  fileSize: number;

  @Column({ nullable: true })
  fileHash: string;

  @Column({ type: 'jsonb', nullable: true })
  ocrResult: Record<string, any>;

  @Column({ default: false })
  ocrProcessed: boolean;

  @Column({ nullable: true })
  ocrProcessedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
