import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationsService } from './notifications.service';

@Processor('notifications')
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private notificationsService: NotificationsService) {}

  @Process('send')
  async handleSend(job: Job<{ notificationId: string; user: any }>) {
    const { notificationId, user } = job.data;
    this.logger.log(`Dispatching notification ${notificationId}`);
    await this.notificationsService.dispatch(notificationId, user);
  }
}
