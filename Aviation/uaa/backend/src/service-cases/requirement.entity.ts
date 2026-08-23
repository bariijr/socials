import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type Responsibility =
  | 'OUR_ARRANGEMENT'
  | 'CLIENT_ARRANGEMENT'
  | 'OPERATOR_ARRANGEMENT'
  | 'THIRD_PARTY_ARRANGEMENT'
  | 'NOT_REQUIRED'
  | 'WAIVED'
  | 'TBD';

@Entity('requirements')
export class Requirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'leg_id', type: 'uuid' })
  legId: string;

  @Column()
  country: string;

  @Column({ name: 'service_category', type: 'varchar', default: 'PERMIT' })
  serviceCategory: string;

  @Column({ name: 'service_type', type: 'varchar', default: 'PERMIT' })
  serviceType: string;

  @Column({ type: 'varchar', default: 'OUR_ARRANGEMENT' })
  responsibility: Responsibility;

  @Column({ name: 'required_by_z', type: 'timestamptz', nullable: true })
  requiredByZ: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
