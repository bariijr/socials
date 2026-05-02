import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Notification } from './notification.entity';

@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  notificationId: string;

  @ManyToOne(() => Notification, (n) => n.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notificationId' })
  notification: Notification;

  @Column()
  provider: string;

  @Column()
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  requestPayload: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  responsePayload: Record<string, any>;

  @Column({ nullable: true, type: 'text' })
  errorMessage: string;

  @Column({ nullable: true })
  externalId: string;

  @CreateDateColumn()
  createdAt: Date;
}
