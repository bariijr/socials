import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CreateCommDto } from './dto/create-comm.dto';
import { UpdateCommDto } from './dto/update-comm.dto';

@Injectable()
export class CommsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  findAll(tripId?: string) {
    return this.prisma.comm.findMany({
      where: tripId ? { tripId } : undefined,
      orderBy: { timestampZ: 'desc' },
    });
  }

  async failed(limit: number, search?: string) {
    const where: Record<string, unknown> = { status: 'Failed' };
    if (search) {
      const q = search.trim();
      (where as any).OR = [
        { tripId: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { to: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.comm.findMany({
      where,
      orderBy: { timestampZ: 'desc' },
      take: limit,
      include: { trip: { select: { tripId: true, registration: true } } },
    });
  }

  async findOne(commId: string) {
    const comm = await this.prisma.comm.findUnique({ where: { commId } });
    if (!comm) throw new NotFoundException(`Comm ${commId} not found`);
    return comm;
  }

  async create(dto: CreateCommDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const comm = await this.prisma.comm.create({ data });
    await this.audit.log(user, 'Comm', comm.commId, 'Created', '', comm.commId);
    return comm;
  }

  async update(commId: string, dto: UpdateCommDto) {
    const before = await this.findOne(commId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const comm = await this.prisma.comm.update({ where: { commId }, data });
    await this.audit.logDiff(user, 'Comm', commId, before as unknown as Record<string, unknown>, comm as unknown as Record<string, unknown>);
    return comm;
  }

  async remove(commId: string, user = 'SYSTEM') {
    await this.findOne(commId);
    await this.prisma.comm.delete({ where: { commId } });
    await this.audit.log(user, 'Comm', commId, 'Deleted', commId, '');
    return { commId, deleted: true };
  }

  async send(commId: string) {
    const comm = await this.findOne(commId);
    const result = await this.mail.send({ to: comm.to, subject: comm.subject, body: comm.body });
    const updated = await this.prisma.comm.update({
      where: { commId },
      data: {
        status: result.ok ? 'Sent' : 'Failed',
        sentAtZ: result.ok ? new Date() : null,
        errorMessage: result.ok ? null : result.error,
      },
    });
    await this.audit.log(
      'SYSTEM',
      'Comm',
      commId,
      result.ok ? 'Sent' : 'Send failed',
      '',
      result.ok ? 'Sent' : (result.error || ''),
    );
    return updated;
  }
}
