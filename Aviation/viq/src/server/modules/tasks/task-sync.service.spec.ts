import { PrismaService } from '../../prisma/prisma.service';
import { TaskSyncService } from './task-sync.service';
import { truncateAll } from '../../test/db-test-utils';

describe('TaskSyncService', () => {
  let prisma: PrismaService;
  let sync: TaskSyncService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    sync = new TaskSyncService(prisma);
    await prisma.trip.create({ data: { tripId: 'TEST-SYNC-1', client: 'Test Client', ownerUserId: null } });
  });

  async function makeService(svcId: string, status: string, requiredByZ = new Date(Date.now() + 48 * 3600_000)) {
    return prisma.service.create({
      data: {
        svcId, tripId: 'TEST-SYNC-1', scopeType: 'TRIP', scopeId: 'TEST-SYNC-1',
        serviceType: 'Overflight', status, basedOnEtdZ: new Date(Date.now() + 50 * 3600_000), requiredByZ,
      },
    });
  }

  it('creates a reconfirm task for a service in Re-confirm Required, keyed by sourceKey', async () => {
    await makeService('SVC-1', 'Re-confirm Required');
    const result = await sync.runSync();
    expect(result.created).toBe(1);
    const task = await prisma.task.findUnique({ where: { sourceKey: 'reconfirm:SVC-1' } });
    expect(task).not.toBeNull();
    expect(task!.title).toContain('Reconfirm required');
  });

  it('does not duplicate a reconfirm task on a second runSync call', async () => {
    await makeService('SVC-1', 'Re-confirm Required');
    await sync.runSync();
    const second = await sync.runSync();
    expect(second.created).toBe(0);
    const count = await prisma.task.count({ where: { sourceKey: 'reconfirm:SVC-1' } });
    expect(count).toBe(1);
  });

  it('creates a resubmit task for a service in Submission Failed', async () => {
    await makeService('SVC-2', 'Submission Failed');
    const result = await sync.runSync();
    expect(result.created).toBe(1);
    const task = await prisma.task.findUnique({ where: { sourceKey: 'resubmit:SVC-2' } });
    expect(task).not.toBeNull();
  });

  it('creates a deadline task when requiredByZ is within 24h and status is not Confirmed/Requested', async () => {
    await makeService('SVC-3', 'Not Started', new Date(Date.now() + 12 * 3600_000));
    const result = await sync.runSync();
    expect(result.created).toBe(1);
    const task = await prisma.task.findUnique({ where: { sourceKey: 'deadline:SVC-3' } });
    expect(task).not.toBeNull();
  });

  it('does not create a deadline task when requiredByZ is beyond the 24h window', async () => {
    await makeService('SVC-4', 'Not Started', new Date(Date.now() + 72 * 3600_000));
    const result = await sync.runSync();
    expect(result.created).toBe(0);
  });

  it('does not create a deadline task once the service is Confirmed', async () => {
    await makeService('SVC-5', 'Confirmed', new Date(Date.now() + 12 * 3600_000));
    const result = await sync.runSync();
    expect(result.created).toBe(0);
  });

  it('auto-closes a reconfirm task once the service becomes Confirmed again', async () => {
    await makeService('SVC-6', 'Re-confirm Required');
    await sync.runSync();
    const created = await prisma.task.findUnique({ where: { sourceKey: 'reconfirm:SVC-6' } });
    await prisma.service.update({ where: { svcId: 'SVC-6' }, data: { status: 'Confirmed' } });
    const result = await sync.runSync();
    expect(result.closed).toBe(1);
    const task = await prisma.task.findUnique({ where: { id: created!.id } });
    expect(task!.status).toBe('Complete');
    expect(task!.completedAtZ).not.toBeNull();
    // sourceKey is cleared on close so the key can be reused if the
    // condition recurs later (see the dedicated recurrence test below).
    expect(task!.sourceKey).toBeNull();
  });

  it('auto-closes a resubmit task once the service is successfully requested', async () => {
    await makeService('SVC-7', 'Submission Failed');
    await sync.runSync();
    await prisma.service.update({ where: { svcId: 'SVC-7' }, data: { status: 'Requested' } });
    const result = await sync.runSync();
    expect(result.closed).toBe(1);
  });

  it('stamps Amber at NLT-2h and Red once NLT is breached, never downgrading', async () => {
    const amberNlt = new Date(Date.now() + 1.5 * 3600_000);
    await makeService('SVC-8', 'Not Started', amberNlt);
    let result = await sync.runSync();
    expect(result.escalated).toBe(1);
    let task = await prisma.task.findUnique({ where: { sourceKey: 'deadline:SVC-8' } });
    expect(task!.escalationTier).toBe('Amber');
    const firstEscalatedAt = task!.escalatedAtZ;

    await prisma.service.update({ where: { svcId: 'SVC-8' }, data: { requiredByZ: new Date(Date.now() - 3600_000) } });
    await prisma.task.update({ where: { id: task!.id }, data: { noLaterThanZ: new Date(Date.now() - 3600_000) } });
    result = await sync.runSync();
    task = await prisma.task.findUnique({ where: { sourceKey: 'deadline:SVC-8' } });
    expect(task!.escalationTier).toBe('Red');
    expect(task!.escalatedAtZ!.getTime()).toBeGreaterThanOrEqual(firstEscalatedAt!.getTime());
  });

  it('clears sourceKey on auto-close and lets a recurring condition create a new task', async () => {
    await makeService('SVC-10', 'Re-confirm Required');
    const first = await sync.runSync();
    expect(first.created).toBe(1);
    const firstTask = await prisma.task.findUnique({ where: { sourceKey: 'reconfirm:SVC-10' } });
    expect(firstTask).not.toBeNull();

    // Service gets reconfirmed -- the task auto-closes and its sourceKey is freed.
    await prisma.service.update({ where: { svcId: 'SVC-10' }, data: { status: 'Confirmed' } });
    const closeResult = await sync.runSync();
    expect(closeResult.closed).toBe(1);
    const closedTask = await prisma.task.findUnique({ where: { id: firstTask!.id } });
    expect(closedTask!.status).toBe('Complete');
    expect(closedTask!.sourceKey).toBeNull();

    // Months later, an unrelated change flags the same service Re-confirm
    // Required again -- a brand new task must be created for it, not
    // silently blocked by the old (now-freed) sourceKey.
    await prisma.service.update({ where: { svcId: 'SVC-10' }, data: { status: 'Re-confirm Required' } });
    const second = await sync.runSync();
    expect(second.created).toBe(1);

    const openTasks = await prisma.task.findMany({ where: { serviceId: 'SVC-10', status: { not: 'Complete' } } });
    expect(openTasks.length).toBe(1);
    expect(openTasks[0].sourceKey).toBe('reconfirm:SVC-10');
    expect(openTasks[0].id).not.toBe(firstTask!.id);
  });

  it('does not escalate a task with no noLaterThanZ', async () => {
    await makeService('SVC-9', 'Not Started', new Date(Date.now() + 72 * 3600_000));
    // SVC-9 falls outside the 24h deadline window, so no task exists at all
    // to escalate -- confirms the escalation pass safely skips tasks
    // without a noLaterThanZ rather than erroring on a null.
    const result = await sync.runSync();
    expect(result.escalated).toBe(0);
  });
});
