import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('requirement_legs')
export class RequirementLeg {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requirement_id', type: 'uuid' })
  requirementId: string;

  @Column({ name: 'leg_id', type: 'uuid' })
  legId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
