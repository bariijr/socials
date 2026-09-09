import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const AMBER_HOURS_BEFORE_NLT = 2;
const DEADLINE_APPROACHING_WINDOW_HOURS = 24;
// Lower bound for generateDeadlineTasks: without this, any non-terminal
// service with a requiredByZ in the past -- including ones from trips that
// finished months ago -- generates a `deadline:` task that's instantly Red
// and never auto-closes (its status never changes). Bounding the query to
// "requiredByZ within the last 24h" keeps this generator limited to genuine
// near-term/just-breached deadlines.
const DEADLINE_LOOKBACK_GRACE_HOURS = 24;

interface SyncResult {
  created: number;
  closed: number;
  escalated: number;
}

// Isolated from services.service.ts/legs.service.ts/trips.service.ts by
// design (see the Phase 8 spec) -- this reads Service/Trip state and
// writes only to Task, so nothing it does can regress the already-shipped
// Submission Engine or Change Impact Engine. Runs on a 10-minute BullMQ
// repeat (task-sync.processor.ts) and is also callable directly here for
// tests, with no queue or timing dependency either way.
@Injectable()
export class TaskSyncService {
  private readonly logger = new Logger(TaskSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runSync(): Promise<SyncResult> {
    const created =
      (await this.generateReconfirmTasks()) +
      (await this.generateResubmitTasks()) +
      (await this.generateDeadlineTasks()) +
      (await this.generateNoVendorTasks());
    const closed = await this.autoCloseResolvedTasks();
    const escalated = await this.stampEscalations();
    this.logger.log(`task-sync: created=${created} closed=${closed} escalated=${escalated}`);
    return { created, closed, escalated };
  }

  private async generateReconfirmTasks(): Promise<number> {
    const services = await this.prisma.service.findMany({
      where: { status: 'Re-confirm Required' },
      include: { trip: { select: { ownerUserId: true } } },
    });
    let count = 0;
    for (const svc of services) {
      const sourceKey = `reconfirm:${svc.svcId}`;
      const existing = await this.prisma.task.findUnique({ where: { sourceKey } });
      if (existing) continue;
      await this.prisma.task.create({
        data: {
          title: `Reconfirm required: ${svc.serviceType} for ${svc.tripId}`,
          tripId: svc.tripId,
          serviceId: svc.svcId,
          ownerUserId: svc.trip.ownerUserId,
          source: 'System',
          sourceKey,
          priority: 'High',
          noLaterThanZ: svc.requiredByZ,
          createdBy: 'SYSTEM',
          statusChangedAt: new Date(),
          statusChangedBy: 'SYSTEM',
        },
      });
      count++;
    }
    return count;
  }

  private async generateResubmitTasks(): Promise<number> {
    const services = await this.prisma.service.findMany({
      where: { status: 'Submission Failed' },
      include: { trip: { select: { ownerUserId: true } } },
    });
    let count = 0;
    for (const svc of services) {
      const sourceKey = `resubmit:${svc.svcId}`;
      const existing = await this.prisma.task.findUnique({ where: { sourceKey } });
      if (existing) continue;
      await this.prisma.task.create({
        data: {
          title: `Resubmit: ${svc.serviceType} for ${svc.tripId}`,
          tripId: svc.tripId,
          serviceId: svc.svcId,
          ownerUserId: svc.trip.ownerUserId,
          source: 'System',
          sourceKey,
          priority: 'High',
          noLaterThanZ: svc.requiredByZ,
          createdBy: 'SYSTEM',
          statusChangedAt: new Date(),
          statusChangedBy: 'SYSTEM',
        },
      });
      count++;
    }
    return count;
  }

  private async generateDeadlineTasks(): Promise<number> {
    const windowEnd = new Date(Date.now() + DEADLINE_APPROACHING_WINDOW_HOURS * 3600_000);
    const windowStart = new Date(Date.now() - DEADLINE_LOOKBACK_GRACE_HOURS * 3600_000);
    const services = await this.prisma.service.findMany({
      where: {
        requiredByZ: { lte: windowEnd, gte: windowStart },
        status: { notIn: ['Confirmed', 'Requested', 'Not Required', 'Cancelled'] },
        trip: { status: { notIn: ['Complete', 'Cancelled'] } },
      },
      include: { trip: { select: { ownerUserId: true } } },
    });
    let count = 0;
    for (const svc of services) {
      const sourceKey = `deadline:${svc.svcId}`;
      const existing = await this.prisma.task.findUnique({ where: { sourceKey } });
      if (existing) continue;
      await this.prisma.task.create({
        data: {
          title: `Deadline approaching: ${svc.serviceType} for ${svc.tripId}`,
          tripId: svc.tripId,
          serviceId: svc.svcId,
          ownerUserId: svc.trip.ownerUserId,
          source: 'System',
          sourceKey,
          priority: 'Normal',
          noLaterThanZ: svc.requiredByZ,
          createdBy: 'SYSTEM',
          statusChangedAt: new Date(),
          statusChangedBy: 'SYSTEM',
        },
      });
      count++;
    }
    return count;
  }

  private async generateNoVendorTasks(): Promise<number> {
    const services = await this.prisma.service.findMany({
      where: { vendorSelectionSource: 'NO_ELIGIBLE_VENDOR', providerId: null },
      include: { trip: { select: { ownerUserId: true } } },
    });
    let count = 0;
    for (const svc of services) {
      const sourceKey = `novendor:${svc.svcId}`;
      const existing = await this.prisma.task.findUnique({ where: { sourceKey } });
      if (existing) continue;
      await this.prisma.task.create({
        data: {
          title: `No eligible vendor: ${svc.serviceType} for ${svc.tripId}`,
          tripId: svc.tripId,
          serviceId: svc.svcId,
          ownerUserId: svc.trip.ownerUserId,
          source: 'System',
          sourceKey,
          priority: 'Normal',
          noLaterThanZ: svc.requiredByZ,
          createdBy: 'SYSTEM',
          statusChangedAt: new Date(),
          statusChangedBy: 'SYSTEM',
        },
      });
      count++;
    }
    return count;
  }

  private async autoCloseResolvedTasks(): Promise<number> {
    const openSystemTasks = await this.prisma.task.findMany({
      where: { source: 'System', status: { in: ['Open', 'In Progress', 'Waiting'] }, sourceKey: { not: null } },
    });
    let count = 0;
    for (const task of openSystemTasks) {
      const resolved = await this.isTriggerResolved(task.sourceKey!, task.serviceId);
      if (!resolved) continue;
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'Complete',
          version: { increment: 1 },
          statusChangedAt: new Date(),
          statusChangedBy: 'SYSTEM',
          completedAtZ: new Date(),
          // Free the sourceKey (unique) so a future occurrence of the same
          // trigger condition on this service can create a new task. Postgres
          // treats NULL as distinct across rows in a unique constraint, so
          // this row's history (title, tripId, serviceId, audit trail) stays
          // intact -- only the now-unnecessary dedup key is cleared.
          sourceKey: null,
        },
      });
      count++;
    }
    return count;
  }

  private async isTriggerResolved(sourceKey: string, serviceId: string | null): Promise<boolean> {
    if (!serviceId) return true;
    const svc = await this.prisma.service.findUnique({ where: { svcId: serviceId } });
    if (!svc) return true;
    if (sourceKey.startsWith('reconfirm:')) return svc.status !== 'Re-confirm Required';
    if (sourceKey.startsWith('resubmit:')) return svc.status !== 'Submission Failed';
    if (sourceKey.startsWith('deadline:')) {
      return ['Confirmed', 'Requested', 'Not Required', 'Cancelled'].includes(svc.status);
    }
    if (sourceKey.startsWith('novendor:')) return svc.providerId !== null;
    return false;
  }

  private async stampEscalations(): Promise<number> {
    const now = Date.now();
    const openTasks = await this.prisma.task.findMany({
      where: { status: { in: ['Open', 'In Progress', 'Waiting'] }, noLaterThanZ: { not: null } },
    });
    let count = 0;
    for (const task of openTasks) {
      const nlt = task.noLaterThanZ!.getTime();
      const tier = now >= nlt ? 'Red' : now >= nlt - AMBER_HOURS_BEFORE_NLT * 3600_000 ? 'Amber' : null;
      if (!tier) continue;
      // Never downgrade: Amber -> Red is a valid re-stamp, but a task
      // already Red stays Red even if this is somehow re-evaluated as Amber.
      if (task.escalationTier === 'Red') continue;
      if (task.escalationTier === tier) continue;
      await this.prisma.task.update({
        where: { id: task.id },
        data: { escalationTier: tier, escalatedAtZ: task.escalatedAtZ ?? new Date() },
      });
      count++;
    }
    return count;
  }
}
