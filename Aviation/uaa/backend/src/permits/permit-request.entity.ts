import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PermitRequestStatus =
  | 'NOT_STARTED'
  | 'REQUESTED'
  | 'CHASING'
  | 'CONFIRMED'
  | 'RECONFIRM_REQUIRED'
  | 'CANCELLED';

@Entity('permit_requests')
export class PermitRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'leg_id', type: 'uuid' })
  legId: string;

  @Column()
  country: string;

  @Column({ type: 'varchar', default: 'NOT_STARTED' })
  status: PermitRequestStatus;

  @Column({ name: 'required_by_z', type: 'timestamptz', nullable: true })
  requiredByZ: Date | null;

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ name: 'clearance_number', type: 'varchar', nullable: true })
  clearanceNumber: string | null;

  @Column({ name: 'correlation_token', type: 'varchar', unique: true })
  correlationToken: string;

  @Column({ name: 'submission_email', type: 'varchar', nullable: true })
  submissionEmail: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
