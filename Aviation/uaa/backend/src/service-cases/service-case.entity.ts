import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ServiceCaseStatus =
  | 'NOT_STARTED'
  | 'REQUESTED'
  | 'CHASING'
  | 'CONFIRMED'
  | 'RECONFIRM_REQUIRED'
  | 'CANCELLED';

@Entity('service_cases')
export class ServiceCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requirement_id', type: 'uuid' })
  requirementId: string;

  @Column({ type: 'varchar', default: 'NOT_STARTED' })
  status: ServiceCaseStatus;

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ name: 'clearance_number', type: 'varchar', nullable: true })
  clearanceNumber: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
