import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { User } from '../users/entities/user.entity';
import { EmailProvider } from './providers/email.provider';
import { SmsProvider } from './providers/sms.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { NotificationsProcessor } from './notifications.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationLog, User]),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    EmailProvider,
    SmsProvider,
    WhatsAppProvider,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
