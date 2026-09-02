import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateLegPurposeDto } from './dto/create-leg-purpose.dto';
import { UpdateLegPurposeDto } from './dto/update-leg-purpose.dto';

@Injectable()
export class LegPurposesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.legPurposeDef.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async findOne(code: string) {
    const def = await this.prisma.legPurposeDef.findUnique({ where: { code } });
    if (!def) throw new NotFoundException(`Leg purpose ${code} not found`);
    return def;
  }

  async create(dto: CreateLegPurposeDto, user = 'SYSTEM') {
    const def = await this.prisma.legPurposeDef.create({
      data: {
        code: dto.code,
        label: dto.label,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log(user, 'LegPurposeDef', def.code, 'Created', '', def.code);
    return def;
  }

  async update(code: string, dto: UpdateLegPurposeDto, user = 'SYSTEM') {
    const before = await this.findOne(code);
    const def = await this.prisma.legPurposeDef.update({
      where: { code },
      data: dto,
    });
    await this.audit.logDiff(user, 'LegPurposeDef', code, before as unknown as Record<string, unknown>, def as unknown as Record<string, unknown>);
    return def;
  }
}
