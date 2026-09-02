import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';

@Injectable()
export class PersonRatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findForPerson(personId: string) {
    return this.prisma.personRating.findMany({ where: { personId } });
  }

  async findOne(id: number) {
    const rating = await this.prisma.personRating.findUnique({ where: { id } });
    if (!rating) throw new NotFoundException(`Rating ${id} not found`);
    return rating;
  }

  async create(dto: CreateRatingDto, user = 'SYSTEM') {
    const { issueDate, expiryDate, ...rest } = dto;
    const rating = await this.prisma.personRating.create({
      data: {
        ...rest,
        issueDate: issueDate ? new Date(issueDate) : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });
    await this.audit.log(user, 'PersonRating', String(rating.id), 'Created', '', rating.ratingType);
    return rating;
  }

  async update(id: number, dto: UpdateRatingDto, user = 'SYSTEM') {
    await this.findOne(id);
    const { issueDate, expiryDate, ...rest } = dto;
    const rating = await this.prisma.personRating.update({
      where: { id },
      data: {
        ...rest,
        issueDate: issueDate ? new Date(issueDate) : undefined,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });
    await this.audit.log(user, 'PersonRating', String(id), 'Updated', '', rating.ratingType);
    return rating;
  }

  async remove(id: number, user = 'SYSTEM') {
    await this.findOne(id);
    await this.prisma.personRating.delete({ where: { id } });
    await this.audit.log(user, 'PersonRating', String(id), 'Deleted', String(id), '');
    return { id, deleted: true };
  }
}
