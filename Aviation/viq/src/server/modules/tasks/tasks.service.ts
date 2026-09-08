import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { isValidTaskTransition, withTaskTransitions } from '../../common/taskStatusTransitions';

export interface TaskListFilter {
  scope?: 'mine' | 'team' | 'unassigned' | 'escalated';
  tripId?: string;
  currentUserId?: string;
  currentUserTeam?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filter: TaskListFilter) {
    const where: Record<string, unknown> = {};
    if (filter.tripId) where.tripId = filter.tripId;

    if (filter.scope === 'mine') {
      if (!filter.currentUserId) return [];
      where.ownerUserId = filter.currentUserId;
    } else if (filter.scope === 'team') {
      if (!filter.currentUserTeam) return [];
      where.owner = { team: filter.currentUserTeam };
      where.ownerUserId = { not: filter.currentUserId };
    } else if (filter.scope === 'unassigned') {
      where.ownerUserId = null;
    } else if (filter.scope === 'escalated') {
      where.escalationTier = { not: null };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: [{ noLaterThanZ: 'asc' }, { createdAtZ: 'desc' }],
    });
    return tasks.map(withTaskTransitions);
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return withTaskTransitions(task);
  }

  async create(dto: CreateTaskDto, currentUsername?: string) {
    const { noLaterThanZ, ...rest } = dto;
    const task = await this.prisma.task.create({
      data: {
        ...rest,
        noLaterThanZ: noLaterThanZ ? new Date(noLaterThanZ) : undefined,
        source: 'Manual',
        createdBy: currentUsername ?? 'SYSTEM',
        statusChangedAt: new Date(),
        statusChangedBy: currentUsername ?? 'SYSTEM',
      },
    });
    await this.audit.log(currentUsername ?? 'SYSTEM', 'Task', task.id, 'Created', '', task.title);
    return withTaskTransitions(task);
  }

  async update(id: string, dto: UpdateTaskDto, currentUsername?: string) {
    const before = await this.prisma.task.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Task ${id} not found`);
    const user = currentUsername ?? 'SYSTEM';
    const { version, noLaterThanZ, ...data } = dto;

    if (data.status && data.status !== before.status && !isValidTaskTransition(before.status, data.status)) {
      throw new BadRequestException(`Cannot transition Task from "${before.status}" to "${data.status}"`);
    }

    const statusChanging = data.status !== undefined && data.status !== before.status;
    const becomingComplete = statusChanging && data.status === 'Complete';

    const result = await this.prisma.task.updateMany({
      where: { id, version },
      data: {
        ...data,
        ...(noLaterThanZ !== undefined ? { noLaterThanZ: noLaterThanZ ? new Date(noLaterThanZ) : null } : {}),
        version: { increment: 1 },
        ...(statusChanging ? { statusChangedAt: new Date(), statusChangedBy: user } : {}),
        ...(becomingComplete ? { completedAtZ: new Date() } : {}),
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.task.findUnique({ where: { id } });
      const history = await this.audit.forRecord('Task', id);
      const latest = history[0];
      throw new ConflictException({
        message: `Task ${id} was modified by someone else`,
        current: current ? withTaskTransitions(current) : null,
        changedBy: latest?.user,
        changedAt: latest?.timestampZ,
      });
    }

    const task = await this.prisma.task.findUnique({ where: { id } });
    await this.audit.logDiff(user, 'Task', id, before as unknown as Record<string, unknown>, task as unknown as Record<string, unknown>);
    return withTaskTransitions(task!);
  }

  async resolveUserTeam(userId: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { team: true } });
    return user?.team ?? undefined;
  }
}
