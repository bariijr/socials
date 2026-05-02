import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { NotificationLog } from './notification-log.entity';

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PUSH = 'push',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  READ = 'read',
}

export enum NotificationType {
  LOAN_SUBMITTED = 'loan_submitted',
  LOAN_APPROVED = 'loan_approved',
  LOAN_REJECTED = 'loan_rejected',
  LOAN_DISBURSED = 'loan_disbursed',
  LOAN_OVERDUE = 'loan_overdue',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_DUE = 'payment_due',
  KYC_SUBMITTED = 'kyc_submitted',
  KYC_APPROVED = 'kyc_approved',
  KYC_REJECTED = 'kyc_rejected',
  ACCOUNT_CREATED = 'account_created',
  PASSWORD_RESET = 'password_reset',
  SYSTEM_ALERT = 'system_alert',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status: NotificationStatus;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ nullable: true })
  entityType: string;

  @Column({ nullable: true })
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ default: false })
  isRead: boolean;

  @Column({ nullable: true })
  readAt: Date;

  @Column({ nullable: true })
  sentAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  nextRetryAt: Date;

  @Column({ nullable: true, type: 'text' })
  errorMessage: string;

  @OneToMany(() => NotificationLog, (log) => log.notification, { cascade: true })
  logs: NotificationLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
