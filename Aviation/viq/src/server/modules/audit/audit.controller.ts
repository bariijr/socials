import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  recent(@Query('limit') limit?: string, @Query('page') page?: string) {
    if (page === undefined) {
      return this.audit.recent(limit ? Number(limit) : undefined);
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(1000, Math.max(1, Number(limit) || 100));
    return this.audit.recentPaginated(pageNum, limitNum);
  }

  @Get(':table/:recordId')
  forRecord(@Param('table') table: string, @Param('recordId') recordId: string) {
    return this.audit.forRecord(table, recordId);
  }
}
