import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStopDto } from './dto/create-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';

@Injectable()
export class StopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(tripId?: string) {
    return this.prisma.stop.findMany({ where: tripId ? { tripId } : undefined });
  }

  async findOne(stopId: string) {
    const stop = await this.prisma.stop.findUnique({ where: { stopId } });
    if (!stop) throw new NotFoundException(`Stop ${stopId} not found`);
    return stop;
  }

  async create(dto: CreateStopDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const stop = await this.prisma.stop.create({ data: { ...data, groundTimeHours: data.groundTimeHours ?? 0 } });
    await this.audit.log(user, 'Stop', stop.stopId, 'Created', '', stop.stopId);
    return stop;
  }

  async update(stopId: string, dto: UpdateStopDto) {
    const before = await this.findOne(stopId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const stop = await this.prisma.stop.update({ where: { stopId }, data });
    await this.audit.logDiff(user, 'Stop', stopId, before as unknown as Record<string, unknown>, stop as unknown as Record<string, unknown>);
    return stop;
  }

  async remove(stopId: string, user = 'SYSTEM') {
    await this.findOne(stopId);
    await this.prisma.stop.delete({ where: { stopId } });
    await this.audit.log(user, 'Stop', stopId, 'Deleted', stopId, '');
    return { stopId, deleted: true };
  }
}
