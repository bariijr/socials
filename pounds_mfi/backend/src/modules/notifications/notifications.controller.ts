import {
  Controller, Get, Patch, Param, Query, UseGuards, Sse, MessageEvent,
} from '@nestjs/common';
import { Observable, interval, map } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.svc.findForUser(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.markRead(id, user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.svc.markAllRead(user.id);
  }

  @Sse('stream')
  stream(@CurrentUser() user: any): Observable<MessageEvent> {
    return interval(5000).pipe(
      map(async () => {
        const count = await this.svc.getUnreadCount(user.id);
        return { data: JSON.stringify({ unreadCount: count }) } as MessageEvent;
      }),
      map((p) => p as any),
    );
  }
}
