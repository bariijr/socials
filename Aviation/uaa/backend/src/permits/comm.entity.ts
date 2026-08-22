import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('comms')
export class Comm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  direction: 'OUTBOUND' | 'INBOUND';

  @Column({ name: 'leg_id', type: 'uuid', nullable: true })
  legId: string | null;

  @Column({ name: 'permit_request_id', type: 'uuid', nullable: true })
  permitRequestId: string | null;

  @Column({ name: 'correlation_token', type: 'varchar', nullable: true })
  correlationToken: string | null;

  @Column({ name: 'from_address', type: 'varchar' })
  fromAddress: string;

  @Column({ name: 'to_address', type: 'varchar' })
  toAddress: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar' })
  kind: 'REQUEST' | 'REVISION' | 'CANCEL' | 'NOTIFICATION';

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
