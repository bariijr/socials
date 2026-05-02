import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  Notification, NotificationChannel, NotificationStatus, NotificationType,
} from './entities/notification.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { User } from '../users/entities/user.entity';
import { EmailProvider } from './providers/email.provider';
import { SmsProvider } from './providers/sms.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

export interface SendNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  channels?: NotificationChannel[];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(NotificationLog) private logRepo: Repository<NotificationLog>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectQueue('notifications') private notifQueue: Queue,
    private emailProvider: EmailProvider,
    private smsProvider: SmsProvider,
    private whatsappProvider: WhatsAppProvider,
  ) {}

  async send(dto: SendNotificationDto) {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) return;

    const prefs = user.notificationPreferences || {
      email: true, sms: true, whatsapp: false, push: true,
    };

    const channels = dto.channels || [
      ...(prefs.email ? [NotificationChannel.EMAIL] : []),
      ...(prefs.sms ? [NotificationChannel.SMS] : []),
      ...(prefs.whatsapp ? [NotificationChannel.WHATSAPP] : []),
      NotificationChannel.PUSH,
    ];

    for (const channel of channels) {
      const notif = await this.notifRepo.save({
        userId: dto.userId,
        type: dto.type,
        channel,
        title: dto.title,
        message: dto.message,
        entityType: dto.entityType,
        entityId: dto.entityId,
        metadata: dto.metadata,
        status: NotificationStatus.PENDING,
      });

      await this.notifQueue.add('send', { notificationId: notif.id, user }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }
  }

  async dispatch(notificationId: string, user: User) {
    const notif = await this.notifRepo.findOne({ where: { id: notificationId } });
    if (!notif) return;

    let externalId: string;
    let error: string;

    try {
      switch (notif.channel) {
        case NotificationChannel.EMAIL:
          if (user.email) {
            externalId = await this.emailProvider.send(
              user.email, notif.title,
              `<p>${notif.message}</p>`,
            );
          }
          break;
        case NotificationChannel.SMS:
          if (user.phone) {
            externalId = await this.smsProvider.send(user.phone, notif.message);
          }
          break;
        case NotificationChannel.WHATSAPP:
          if (user.phone) {
            externalId = await this.whatsappProvider.send(user.phone, notif.message);
          }
          break;
        case NotificationChannel.PUSH:
          // In-app push — just mark as delivered (SSE/WebSocket handled separately)
          externalId = 'push-delivered';
          break;
      }

      await this.notifRepo.update(notificationId, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      await this.logRepo.save({
        notificationId,
        provider: notif.channel,
        status: 'success',
        externalId,
      });
    } catch (err) {
      error = err.message;
      await this.notifRepo.update(notificationId, {
        status: NotificationStatus.FAILED,
        errorMessage: error,
        retryCount: () => `"retryCount" + 1` as any,
      });
      await this.logRepo.save({
        notificationId,
        provider: notif.channel,
        status: 'failed',
        errorMessage: error,
      });
      throw err;
    }
  }

  async findForUser(userId: string, query: any) {
    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');

    if (query.channel) qb.andWhere('n.channel = :c', { c: query.channel });
    if (query.unread) qb.andWhere('n.isRead = false');

    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async markRead(id: string, userId: string) {
    await this.notifRepo.update({ id, userId }, { isRead: true, readAt: new Date() });
  }

  async markAllRead(userId: string) {
    await this.notifRepo.update({ userId, isRead: false }, { isRead: true, readAt: new Date() });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({ where: { userId, isRead: false } });
  }
}
