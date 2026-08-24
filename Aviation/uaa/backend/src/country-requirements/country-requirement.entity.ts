import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ServiceType } from '../service-cases/requirement.entity';

@Entity('country_requirements')
export class CountryRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  country: string;

  @Column({ name: 'service_type', type: 'varchar' })
  serviceType: ServiceType;

  @Column({ name: 'lead_time_hours', type: 'int' })
  leadTimeHours: number;

  @Column({ name: 'working_days_only', type: 'boolean', default: false })
  workingDaysOnly: boolean;

  @Column({ name: 'tolerance_hours', type: 'int', default: 4 })
  toleranceHours: number;

  @Column({ name: 'required_docs', type: 'text', array: true, default: '{}' })
  requiredDocs: string[];

  @Column({ name: 'submission_email', type: 'varchar', nullable: true })
  submissionEmail: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
