import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TasksService } from './tasks.service';
import { truncateAll } from '../../test/db-test-utils';

describe('TasksService', () => {
  let prisma: PrismaService;
  let tasks: TasksService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    tasks = new TasksService(prisma, new AuditService(prisma));
  });

  it('creates a manual task with source SYSTEM defaults', async () => {
    const created = await tasks.create({ title: 'Call client' }, 'coordinator-1');
    expect(created.source).toBe('Manual');
    expect(created.createdBy).toBe('coordinator-1');
    expect(created.status).toBe('Open');
    expect(created.allowedTransitions).toEqual(['In Progress', 'Waiting', 'Complete', 'Cancelled']);
  });

  it('rejects an invalid status transition (Complete is terminal, no edge back to Open)', async () => {
    const created = await tasks.create({ title: 'Chase permit' });
    const completed = await tasks.update(created.id, { status: 'Complete', version: created.version } as any, 'coordinator-1');
    expect(completed.status).toBe('Complete');
    await expect(
      tasks.update(completed.id, { status: 'Open', version: completed.version } as any, 'coordinator-1'),
    ).rejects.toThrow();
  });

  it('stamps completedAtZ on transition to Complete', async () => {
    const created = await tasks.create({ title: 'Send documents' });
    const completed = await tasks.update(created.id, { status: 'Complete', version: created.version } as any, 'coordinator-1');
    expect(completed.completedAtZ).not.toBeNull();
    expect(completed.status).toBe('Complete');
  });

  it('throws ConflictException on a stale version', async () => {
    const created = await tasks.create({ title: 'Approve invoice' });
    await tasks.update(created.id, { status: 'In Progress', version: created.version } as any, 'coordinator-1');
    await expect(
      tasks.update(created.id, { status: 'Waiting', version: created.version } as any, 'coordinator-1'),
    ).rejects.toThrow();
  });

  it('scope=mine returns only the current owner\'s open tasks', async () => {
    const user1 = await prisma.user.create({ data: { username: 'u1', passwordHash: 'x', role: 'Coordinator', firstName: 'A', lastName: 'B', email: 'u1@test.com' } });
    const user2 = await prisma.user.create({ data: { username: 'u2', passwordHash: 'x', role: 'Coordinator', firstName: 'C', lastName: 'D', email: 'u2@test.com' } });
    await tasks.create({ title: 'Mine', ownerUserId: user1.id });
    await tasks.create({ title: 'Not mine', ownerUserId: user2.id });
    const mine = await tasks.findAll({ scope: 'mine', currentUserId: user1.id });
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('Mine');
  });

  it('scope=unassigned returns only tasks with no owner', async () => {
    const user1 = await prisma.user.create({ data: { username: 'u1', passwordHash: 'x', role: 'Coordinator', firstName: 'A', lastName: 'B', email: 'u1@test.com' } });
    await tasks.create({ title: 'Owned', ownerUserId: user1.id });
    await tasks.create({ title: 'Orphan' });
    const unassigned = await tasks.findAll({ scope: 'unassigned' });
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].title).toBe('Orphan');
  });

  it('scope=team returns teammates\' tasks but excludes the current user\'s own', async () => {
    const user1 = await prisma.user.create({ data: { username: 'u1', passwordHash: 'x', role: 'Coordinator', team: 'Ops', firstName: 'A', lastName: 'B', email: 'u1@test.com' } });
    const user2 = await prisma.user.create({ data: { username: 'u2', passwordHash: 'x', role: 'Coordinator', team: 'Ops', firstName: 'C', lastName: 'D', email: 'u2@test.com' } });
    await tasks.create({ title: 'Mine', ownerUserId: user1.id });
    await tasks.create({ title: 'Teammate\'s', ownerUserId: user2.id });
    const team = await tasks.findAll({ scope: 'team', currentUserId: user1.id, currentUserTeam: 'Ops' });
    expect(team).toHaveLength(1);
    expect(team[0].title).toBe('Teammate\'s');
  });

  it('resolveUserTeam reads the team from the User row', async () => {
    const user1 = await prisma.user.create({ data: { username: 'u1', passwordHash: 'x', role: 'Coordinator', team: 'Ops', firstName: 'A', lastName: 'B', email: 'u1@test.com' } });
    expect(await tasks.resolveUserTeam(user1.id)).toBe('Ops');
  });

  it('scope=mine excludes a task the owner already completed', async () => {
    const user1 = await prisma.user.create({ data: { username: 'u1', passwordHash: 'x', role: 'Coordinator', firstName: 'A', lastName: 'B', email: 'u1@test.com' } });
    const created = await tasks.create({ title: 'Done already', ownerUserId: user1.id });
    await tasks.update(created.id, { status: 'Complete', version: created.version } as any, 'coordinator-1');
    const mine = await tasks.findAll({ scope: 'mine', currentUserId: user1.id });
    expect(mine).toHaveLength(0);
  });

  it('scope=escalated excludes a task that was completed after being escalated', async () => {
    const created = await tasks.create({ title: 'Escalated then done' });
    await prisma.task.update({ where: { id: created.id }, data: { escalationTier: 'Red' } });
    const completed = await tasks.update(created.id, { status: 'Complete', version: created.version } as any, 'coordinator-1');
    expect(completed.escalationTier).toBe('Red');
    const escalated = await tasks.findAll({ scope: 'escalated' });
    expect(escalated).toHaveLength(0);
  });

  it('includeClosed:true still returns a completed task', async () => {
    const created = await tasks.create({ title: 'Kept for history' });
    await tasks.update(created.id, { status: 'Complete', version: created.version } as any, 'coordinator-1');
    const all = await tasks.findAll({ includeClosed: true });
    expect(all.map((t) => t.title)).toContain('Kept for history');
  });

  it('clears sourceKey when a System task is manually completed via update()', async () => {
    const task = await prisma.task.create({
      data: {
        title: 'Resubmit: Overflight for TRIP-123',
        source: 'System',
        sourceKey: 'resubmit:SVC-9',
        status: 'Open',
        createdBy: 'SYSTEM',
        statusChangedAt: new Date(),
        statusChangedBy: 'SYSTEM',
      },
    });
    const completed = await tasks.update(task.id, { status: 'Complete', version: task.version } as any, 'coordinator-1');
    expect(completed.status).toBe('Complete');
    expect(completed.sourceKey).toBeNull();
  });

  it('clears sourceKey when a System task is manually cancelled via update()', async () => {
    const task = await prisma.task.create({
      data: {
        title: 'Reconfirm required: Overflight for TRIP-124',
        source: 'System',
        sourceKey: 'reconfirm:SVC-11',
        status: 'Open',
        createdBy: 'SYSTEM',
        statusChangedAt: new Date(),
        statusChangedBy: 'SYSTEM',
      },
    });
    const cancelled = await tasks.update(task.id, { status: 'Cancelled', version: task.version } as any, 'coordinator-1');
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.sourceKey).toBeNull();
  });
});
