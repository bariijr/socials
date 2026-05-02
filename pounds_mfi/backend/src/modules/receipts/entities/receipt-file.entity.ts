import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Receipt } from './receipt.entity';

@Entity('receipt_files')
export class ReceiptFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  receiptId: string;

  @ManyToOne(() => Receipt, (r) => r.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receiptId' })
  receipt: Receipt;

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
  isPrimary: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
