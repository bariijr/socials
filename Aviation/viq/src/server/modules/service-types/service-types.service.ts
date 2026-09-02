import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';

@Injectable()
export class ServiceTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.serviceTypeDef.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  async findOne(code: string) {
    const def = await this.prisma.serviceTypeDef.findUnique({ where: { code } });
    if (!def) throw new NotFoundException(`Service type ${code} not found`);
    return def;
  }

  async create(dto: CreateServiceTypeDto, user = 'SYSTEM') {
    const def = await this.prisma.serviceTypeDef.create({
      data: {
        code: dto.code,
        label: dto.label,
        category: dto.category,
        variants: (dto.variants as Prisma.InputJsonValue | undefined) ?? undefined,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log(user, 'ServiceTypeDef', def.code, 'Created', '', def.code);
    return def;
  }

  async update(code: string, dto: UpdateServiceTypeDto, user = 'SYSTEM') {
    const before = await this.findOne(code);
    const def = await this.prisma.serviceTypeDef.update({
      where: { code },
      data: {
        ...dto,
        variants: (dto.variants as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    await this.audit.logDiff(user, 'ServiceTypeDef', code, before as unknown as Record<string, unknown>, def as unknown as Record<string, unknown>);
    return def;
  }
}
