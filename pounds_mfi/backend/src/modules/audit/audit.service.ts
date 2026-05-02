import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async findAll(query: any) {
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC');

    if (query.userId) qb.where('a.userId = :userId', { userId: query.userId });
    if (query.entity) qb.andWhere('a.entity = :entity', { entity: query.entity });
    if (query.entityId) qb.andWhere('a.entityId = :entityId', { entityId: query.entityId });
    if (query.action) qb.andWhere('a.action ILIKE :action', { action: `%${query.action}%` });

    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
