import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('service_orders')
export class ServiceOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'service_case_id', type: 'uuid' })
  serviceCaseId: string;

  @Column({ name: 'submission_email', type: 'varchar', nullable: true })
  submissionEmail: string | null;

  @Column({ name: 'correlation_token', type: 'varchar', unique: true })
  correlationToken: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
