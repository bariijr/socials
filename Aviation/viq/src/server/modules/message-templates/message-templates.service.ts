import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.messageTemplate.findMany({ orderBy: [{ countryIso2: 'asc' }, { templateType: 'asc' }] });
  }

  findOne(countryIso2: string, templateType: string) {
    return this.prisma.messageTemplate.findUnique({
      where: { countryIso2_templateType: { countryIso2, templateType } },
    });
  }

  async create(dto: CreateMessageTemplateDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    try {
      const template = await this.prisma.messageTemplate.create({
        data: { ...rest, updatedBy: user, updatedAtZ: new Date() },
      });
      await this.audit.log(user, 'MessageTemplate', String(template.id), 'Created', '', `${template.countryIso2}/${template.templateType}`);
      return template;
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        throw new BadRequestException(`A template override for ${dto.countryIso2}/${dto.templateType} already exists.`);
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateMessageTemplateDto) {
    const before = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Message template ${id} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const template = await this.prisma.messageTemplate.update({
      where: { id },
      data: { ...rest, updatedBy: user, updatedAtZ: new Date() },
    });
    await this.audit.logDiff(user, 'MessageTemplate', String(id), before as unknown as Record<string, unknown>, template as unknown as Record<string, unknown>);
    return template;
  }

  async remove(id: number, user = 'SYSTEM') {
    const existing = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Message template ${id} not found`);
    await this.prisma.messageTemplate.delete({ where: { id } });
    await this.audit.log(user, 'MessageTemplate', String(id), 'Deleted', `${existing.countryIso2}/${existing.templateType}`, '');
    return { id, deleted: true };
  }
}
