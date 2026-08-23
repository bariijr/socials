import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

interface AuthedRequest extends Request {
  user: { userId: string; username: string };
}

@Controller('legs/:legId/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Param('legId') legId: string) {
    return this.notificationsService.listForLeg(legId);
  }

  @Post('crew')
  sendCrew(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.sendCrewNotification(legId, req.user.userId);
  }

  @Post('team')
  sendTeam(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.sendTeamNotification(legId, req.user.userId);
  }

  @Post('agent-service-report')
  sendAgentServiceReport(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.sendAgentServiceReport(legId, req.user.userId);
  }

  @Post('agent-whatsapp')
  agentWhatsApp(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.buildAgentWhatsApp(legId, req.user.userId);
  }
}
