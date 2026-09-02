import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(user: string, table: string, recordId: string, field: string, oldValue: string, newValue: string) {
    await this.prisma.auditEntry.create({
      data: { user, table, recordId, field, oldValue, newValue },
    });
  }

  // Diffs two flat records and logs one entry per changed field, batched
  // into a single INSERT rather than one sequential round-trip per field.
  async logDiff(user: string, table: string, recordId: string, before: Record<string, unknown> | null, after: Record<string, unknown>) {
    if (!before) {
      await this.log(user, table, recordId, 'Created', '', recordId);
      return;
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changes: { user: string; table: string; recordId: string; field: string; oldValue: string; newValue: string }[] = [];
    for (const key of keys) {
      const oldVal = before[key];
      const newVal = after[key];
      const oldStr = oldVal === undefined || oldVal === null ? '' : String(oldVal);
      const newStr = newVal === undefined || newVal === null ? '' : String(newVal);
      if (oldStr !== newStr) {
        changes.push({ user, table, recordId, field: key, oldValue: oldStr, newValue: newStr });
      }
    }
    if (changes.length === 0) return;
    await this.prisma.auditEntry.createMany({ data: changes });
  }

  async forRecord(table: string, recordId: string) {
    return this.prisma.auditEntry.findMany({
      where: { table, recordId },
      orderBy: { timestampZ: 'desc' },
    });
  }

  async recent(limit = 100) {
    const clampedLimit = Math.min(1000, Math.max(1, limit));
    return this.prisma.auditEntry.findMany({
      orderBy: { timestampZ: 'desc' },
      take: clampedLimit,
    });
  }

  async recentPaginated(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.auditEntry.findMany({ orderBy: { timestampZ: 'desc' }, skip, take: limit }),
      this.prisma.auditEntry.count(),
    ]);
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }
}
