import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Leg } from '../legs/leg.entity';
import { Team } from './team.entity';
import { Comm } from '../permits/comm.entity';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { parseContact } from './parse-contact';
import {
  buildCrewNotificationEmail,
  buildTeamNotificationEmail,
  buildAgentServiceReportEmail,
  buildAgentWhatsAppMessage,
  buildWhatsAppLink,
} from './notification-templates';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    @InjectRepository(Team) private readonly teamRepo: Repository<Team>,
    @InjectRepository(Comm) private readonly commRepo: Repository<Comm>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  private async loadContext(legId: string, userId: string): Promise<{ leg: Leg; user: User }> {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return { leg, user };
  }

  private logComm(legId: string, fromAddress: string, toAddress: string, subject: string, body: string): Promise<Comm> {
    return this.commRepo.save(
      this.commRepo.create({
        direction: 'OUTBOUND',
        legId,
        serviceCaseId: null,
        correlationToken: null,
        fromAddress,
        toAddress,
        subject,
        body,
        kind: 'NOTIFICATION',
        sentAt: new Date(),
      }),
    );
  }

  async sendCrewNotification(legId: string, userId: string): Promise<Comm> {
    const { leg, user } = await this.loadContext(legId, userId);
    const { email: agentEmail, phone: agentPhone } = parseContact(leg.agentContacts);
    const { subject, body } = buildCrewNotificationEmail(leg, user, agentEmail, agentPhone);

    await this.mailService.send({ to: leg.captEmail ?? '', cc: agentEmail, subject, body });
    return this.logComm(legId, user.fromEmail, leg.captEmail ?? '', subject, body);
  }

  async sendTeamNotification(legId: string, userId: string): Promise<Comm> {
    const { leg, user } = await this.loadContext(legId, userId);
    if (!leg.tssTeam) throw new NotFoundException(`Leg ${legId} has no TSS team set`);
    const team = await this.teamRepo.findOne({ where: { name: ILike(leg.tssTeam.trim()) } });
    if (!team) throw new NotFoundException(`No Team found named "${leg.tssTeam}"`);
    const { email: agentEmail, phone: agentPhone } = parseContact(leg.agentContacts);
    const { subject, body } = buildTeamNotificationEmail(leg, team, user, agentEmail, agentPhone);

    await this.mailService.send({ to: team.teamEmail, bcc: user.fromEmail, subject, body });
    return this.logComm(legId, user.fromEmail, team.teamEmail, subject, body);
  }

  async sendAgentServiceReport(legId: string, userId: string): Promise<Comm> {
    const { leg, user } = await this.loadContext(legId, userId);
    const { email: agentEmail } = parseContact(leg.agentContacts);
    if (!agentEmail) throw new NotFoundException(`Leg ${legId} has no agent email on file`);
    const { subject, body } = buildAgentServiceReportEmail(leg, user);

    await this.mailService.send({ to: agentEmail, cc: user.fromEmail, subject, body });
    return this.logComm(legId, user.fromEmail, agentEmail, subject, body);
  }

  async buildAgentWhatsApp(legId: string, userId: string): Promise<{ url: string; phone: string }> {
    const { leg, user } = await this.loadContext(legId, userId);
    const { phone: agentPhone } = parseContact(leg.agentContacts);
    const message = buildAgentWhatsAppMessage(leg, user);
    const url = buildWhatsAppLink(agentPhone, message);
    if (!url) throw new NotFoundException(`Leg ${legId} has no agent phone number on file`);

    await this.logComm(legId, user.fromEmail, agentPhone, 'WhatsApp — Agent', message);
    return { url, phone: agentPhone };
  }

  listForLeg(legId: string): Promise<Comm[]> {
    return this.commRepo.find({ where: { legId, kind: 'NOTIFICATION' }, order: { sentAt: 'DESC' } });
  }
}
