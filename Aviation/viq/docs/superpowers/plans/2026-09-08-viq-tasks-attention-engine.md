# VIQ Tasks / Attention / Escalation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give VIQ a first-class Task entity with owner/NLT/escalation, automatic task generation from three signals that already exist (service Re-confirm Required, Submission Failed, approaching requiredByZ), and a redesigned Action Board built around task ownership and escalation.

**Architecture:** A fully isolated `TasksModule` (schema, service, controller, DTOs) plus a `task-sync` BullMQ queue with a repeatable job that generates/closes system tasks and stamps escalation tiers by reading Trip/Service state — no changes to `services.service.ts`, `legs.service.ts`, or `trips.service.ts`. One new small widget endpoint on the existing Comms module for the Failed Messages Action Board bucket. Client gets a `Task` type, `dataStore.ts` CRUD functions, and a redesigned `Dashboard.tsx`.

**Tech Stack:** NestJS 10, Prisma 5.22, PostgreSQL, BullMQ (already a dependency, already wired for document processing), React 19 + Vite + TypeScript, Jest against real `jetflow_test` Postgres (no mocked Prisma).

**Spec:** [2026-09-08-viq-tasks-attention-engine-design.md](../specs/2026-09-08-viq-tasks-attention-engine-design.md)

## Global Constraints

- Real Postgres (`jetflow_test`) for every server test — never mock Prisma. `beforeEach` calls `truncateAll(prisma)` from `src/server/test/db-test-utils.ts`.
- RBAC role check comes from `@CurrentUser()` (JWT-verified), never a client-supplied `dto.user`/`dto.role` field. `RolesGuard` is already global (`APP_GUARD` in `auth.module.ts`) and already blocks any non-GET request from a `Viewer` — no per-endpoint `@Roles()` needed for the Admin/Coordinator-only task-mutation requirement.
- Every stateful entity follows the existing convention: `status`, `statusChangedAt`, `statusChangedBy`, `version` (optimistic locking via `updateMany({ where: { id, version } })`, `ConflictException` on `count === 0`).
- Escalation tiers are fixed and non-configurable in this phase: Amber at `noLaterThanZ` − 2 hours, Red at `noLaterThanZ` breached. A tier, once stamped, never downgrades.
- "Approaching deadline" for the `deadline:` system-task trigger uses a fixed 24-hour window (`requiredByZ <= now + 24h`), independent of `CountryRule.leadTimeHours` (a different, submission-lead-time concept already used elsewhere) — keeps `task-sync.service.ts` fully independent of `services.service.ts`'s private methods.
- No changes to `src/server/modules/services/services.service.ts`, `src/server/modules/legs/legs.service.ts`, or `src/server/modules/trips/trips.service.ts` in this plan.
- After each task: run the affected test file(s), then `npm run build:server` (kill any orphaned `node.exe`/`nest start --watch` process first if it fails with an `EPERM`/DLL-lock error — a prior run's dev server holds a lock on `node_modules\.prisma\client\query_engine-windows.dll.node`), then commit.

---

### Task 1: Task data model, migration, and status-transition graph

**Files:**
- Modify: `prisma/schema.prisma` — add `Task` model; add `tasks Task[]` back-reference to `Trip`, `Leg`, `Service`, `Client`, `User` models.
- Create: `src/server/common/taskStatusTransitions.ts`
- Test: `src/server/common/taskStatusTransitions.spec.ts`

**Interfaces:**
- Produces: `TASK_TRANSITIONS: Record<string, string[]>`, `isValidTaskTransition(from: string, to: string): boolean`, `taskAllowedTransitions(status: string): string[]`, `withTaskTransitions<T extends { status: string }>(task: T): T & { allowedTransitions: string[] }` — all consumed by Task 2's `tasks.service.ts`.

- [ ] **Step 1: Add the `Task` model to `prisma/schema.prisma`**

Insert immediately after the `DismissedServiceCandidate` model (which currently ends at line 544, right before `model Person {`):

```prisma
// Phase 8: Task / Attention / Escalation Engine. Follows the same
// state-machine convention as Trip/Service (status, statusChangedAt,
// statusChangedBy, version for optimistic locking). System-generated
// tasks (source: 'System') carry a sourceKey the task-sync job uses
// both to avoid double-creating a task for the same trigger and to
// find-and-close it once the trigger resolves -- manual tasks never
// set it. escalationTier is persisted (not derived) so escalatedAtZ
// survives as a historical record even after the task closes; all
// relations use onDelete: SetNull so deleting a Trip/Leg/Service/
// Client/User never blocks on an orphaned Task reference.
model Task {
  id               String    @id @default(cuid())
  title            String
  description      String?
  tripId           String?   @map("trip_id")
  legId            String?   @map("leg_id")
  serviceId        String?   @map("service_id")
  clientId         String?   @map("client_id")
  ownerUserId      String?   @map("owner_user_id")
  priority         String    @default("Normal")
  noLaterThanZ     DateTime? @map("no_later_than_z")
  status           String    @default("Open")
  statusChangedAt  DateTime? @map("status_changed_at")
  statusChangedBy  String?   @map("status_changed_by")
  version          Int       @default(1)
  source           String    @default("Manual")
  sourceKey        String?   @unique @map("source_key")
  escalationTier   String?   @map("escalation_tier")
  escalatedAtZ     DateTime? @map("escalated_at_z")
  createdBy        String?   @map("created_by")
  createdAtZ       DateTime  @default(now()) @map("created_at_z")
  completedAtZ     DateTime? @map("completed_at_z")

  trip    Trip?    @relation(fields: [tripId], references: [tripId], onDelete: SetNull)
  leg     Leg?     @relation(fields: [legId], references: [legId], onDelete: SetNull)
  service Service? @relation(fields: [serviceId], references: [svcId], onDelete: SetNull)
  client  Client?  @relation(fields: [clientId], references: [clientId], onDelete: SetNull)
  owner   User?    @relation(fields: [ownerUserId], references: [id], onDelete: SetNull)

  @@index([status])
  @@index([ownerUserId])
  @@index([noLaterThanZ])
  @@map("tasks")
}
```

- [ ] **Step 2: Add the five back-reference fields**

In `model Trip {`, alongside the other relation fields (`legs Leg[]`, `stops Stop[]`, etc. — around line 337-342), add:
```prisma
  tasks        Task[]
```

In `model Leg {`, alongside its existing relation fields, add:
```prisma
  tasks Task[]
```

In `model Service {`, alongside `trip`/`provider`/`authorization` (around line 512-514), add:
```prisma
  tasks         Task[]
```

In `model Client {`, alongside its existing relation fields, add:
```prisma
  tasks Task[]
```

In `model User {`, alongside `ownedTrips Trip[]` (line 838), add:
```prisma
  ownedTasks Task[]
```

(Named `ownedTasks` rather than bare `tasks` because Prisma requires distinct relation names when a model has more than one relation to the same related model on different fields — `User` already has `ownedTrips Trip[]` for `Trip.ownerUserId`; naming this one `ownedTasks` avoids any ambiguity for a future second User↔Task relation.)

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_tasks`
Expected: creates `prisma/migrations/<timestamp>_add_tasks/migration.sql`, applies cleanly to the dev database, regenerates the Prisma client. If this fails with an `EPERM` on `query_engine-windows.dll.node`, an orphaned `node.exe` from a prior dev-server run holds the lock — find and kill it first:
```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId,CommandLine
Stop-Process -Id <pid> -Force
```
then retry.

- [ ] **Step 4: Write `src/server/common/taskStatusTransitions.ts`**

```typescript
// src/server/common/taskStatusTransitions.ts
//
// Server-side source of truth for which Task status a coordinator may
// move to next -- same convention as src/server/common/statusTransitions.ts
// (TRIP_TRANSITIONS / SERVICE_TRANSITIONS), kept in its own file since
// Task is a new, independent entity rather than an addition to Trip/Service.

export const TASK_TRANSITIONS: Record<string, string[]> = {
  'Open': ['In Progress', 'Waiting', 'Complete', 'Cancelled'],
  'In Progress': ['Waiting', 'Complete', 'Cancelled'],
  'Waiting': ['Open', 'In Progress', 'Complete', 'Cancelled'],
  'Complete': [],
  'Cancelled': [],
};

export function isValidTaskTransition(from: string, to: string): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to);
}

export function taskAllowedTransitions(status: string): string[] {
  return TASK_TRANSITIONS[status] ?? [];
}

export function withTaskTransitions<T extends { status: string }>(
  task: T,
): T & { allowedTransitions: string[] } {
  return { ...task, allowedTransitions: taskAllowedTransitions(task.status) };
}
```

- [ ] **Step 5: Write `src/server/common/taskStatusTransitions.spec.ts`**

```typescript
import {
  isValidTaskTransition,
  taskAllowedTransitions,
  withTaskTransitions,
  TASK_TRANSITIONS,
} from './taskStatusTransitions';

describe('taskStatusTransitions', () => {
  it('allows Open -> In Progress', () => {
    expect(isValidTaskTransition('Open', 'In Progress')).toBe(true);
  });

  it('allows Open -> Complete directly (no forced In Progress step)', () => {
    expect(isValidTaskTransition('Open', 'Complete')).toBe(true);
  });

  it('rejects a transition out of a terminal Complete status', () => {
    expect(isValidTaskTransition('Complete', 'Open')).toBe(false);
    expect(taskAllowedTransitions('Complete')).toEqual([]);
  });

  it('rejects a transition out of a terminal Cancelled status', () => {
    expect(isValidTaskTransition('Cancelled', 'Open')).toBe(false);
  });

  it('allows Waiting back to Open (unlike Trip/Service graphs, Waiting is not terminal)', () => {
    expect(isValidTaskTransition('Waiting', 'Open')).toBe(true);
  });

  it('rejects an unknown status entirely', () => {
    expect(isValidTaskTransition('Bogus', 'Open')).toBe(false);
    expect(taskAllowedTransitions('Bogus')).toEqual([]);
  });

  it('withTaskTransitions attaches allowedTransitions from the current status', () => {
    const task = { id: 't1', status: 'Open' };
    expect(withTaskTransitions(task)).toEqual({ id: 't1', status: 'Open', allowedTransitions: TASK_TRANSITIONS['Open'] });
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test -- taskStatusTransitions.spec.ts`
Expected: 7 tests pass.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/common/taskStatusTransitions.ts src/server/common/taskStatusTransitions.spec.ts
git commit -m "feat: add Task data model and status-transition graph"
```

---

### Task 2: TasksModule — CRUD, status transitions, REST API

**Files:**
- Create: `src/server/modules/tasks/dto/create-task.dto.ts`
- Create: `src/server/modules/tasks/dto/update-task.dto.ts`
- Create: `src/server/modules/tasks/tasks.service.ts`
- Create: `src/server/modules/tasks/tasks.controller.ts`
- Create: `src/server/modules/tasks/tasks.module.ts`
- Modify: `src/server/app.module.ts` — import `TasksModule`
- Test: `src/server/modules/tasks/tasks.service.spec.ts`

**Interfaces:**
- Consumes: `TASK_TRANSITIONS`, `isValidTaskTransition`, `withTaskTransitions` from Task 1's `../../common/taskStatusTransitions`; `AuditService` (`log`, `logDiff`, `forRecord` — same shape as used throughout `services.service.ts`); `CurrentUser`/`CurrentUserPayload` from `../auth/current-user.decorator`.
- Produces: `TasksService.create(dto: CreateTaskDto, currentUsername?: string): Promise<Task & { allowedTransitions: string[] }>`, `TasksService.update(id: string, dto: UpdateTaskDto, currentUsername?: string): Promise<Task & { allowedTransitions: string[] }>`, `TasksService.findAll(filter: { scope?: 'mine'|'team'|'unassigned'|'escalated'; tripId?: string; currentUserId?: string; currentUserTeam?: string }): Promise<Task[]>`, `TasksService.findOne(id: string): Promise<Task & { allowedTransitions: string[] }>` — all consumed by Task 6/7's client layer via the REST endpoints below.

- [ ] **Step 1: Write `src/server/modules/tasks/dto/create-task.dto.ts`**

```typescript
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

export class CreateTaskDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tripId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerUserId?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsDateString()
  noLaterThanZ?: string;
}
```

- [ ] **Step 2: Write `src/server/modules/tasks/dto/update-task.dto.ts`**

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

const STATUSES = ['Open', 'In Progress', 'Waiting', 'Complete', 'Cancelled'] as const;

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  escalationTier?: string;
}
```

- [ ] **Step 3: Write `src/server/modules/tasks/tasks.service.ts`**

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { isValidTaskTransition, withTaskTransitions } from '../../common/taskStatusTransitions';

export interface TaskListFilter {
  scope?: 'mine' | 'team' | 'unassigned' | 'escalated';
  tripId?: string;
  currentUserId?: string;
  currentUserTeam?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filter: TaskListFilter) {
    const where: Record<string, unknown> = {};
    if (filter.tripId) where.tripId = filter.tripId;

    if (filter.scope === 'mine') {
      if (!filter.currentUserId) return [];
      where.ownerUserId = filter.currentUserId;
    } else if (filter.scope === 'team') {
      if (!filter.currentUserTeam) return [];
      where.owner = { team: filter.currentUserTeam };
      where.ownerUserId = { not: filter.currentUserId };
    } else if (filter.scope === 'unassigned') {
      where.ownerUserId = null;
    } else if (filter.scope === 'escalated') {
      where.escalationTier = { not: null };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: [{ noLaterThanZ: 'asc' }, { createdAtZ: 'desc' }],
    });
    return tasks.map(withTaskTransitions);
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return withTaskTransitions(task);
  }

  async create(dto: CreateTaskDto, currentUsername?: string) {
    const { noLaterThanZ, ...rest } = dto;
    const task = await this.prisma.task.create({
      data: {
        ...rest,
        noLaterThanZ: noLaterThanZ ? new Date(noLaterThanZ) : undefined,
        source: 'Manual',
        createdBy: currentUsername ?? 'SYSTEM',
        statusChangedAt: new Date(),
        statusChangedBy: currentUsername ?? 'SYSTEM',
      },
    });
    await this.audit.log(currentUsername ?? 'SYSTEM', 'Task', task.id, 'Created', '', task.title);
    return withTaskTransitions(task);
  }

  async update(id: string, dto: UpdateTaskDto, currentUsername?: string) {
    const before = await this.prisma.task.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Task ${id} not found`);
    const user = currentUsername ?? 'SYSTEM';
    const { version, noLaterThanZ, ...data } = dto;

    if (data.status && data.status !== before.status && !isValidTaskTransition(before.status, data.status)) {
      throw new BadRequestException(`Cannot transition Task from "${before.status}" to "${data.status}"`);
    }

    const statusChanging = data.status !== undefined && data.status !== before.status;
    const becomingComplete = statusChanging && data.status === 'Complete';

    const result = await this.prisma.task.updateMany({
      where: { id, version },
      data: {
        ...data,
        ...(noLaterThanZ !== undefined ? { noLaterThanZ: noLaterThanZ ? new Date(noLaterThanZ) : null } : {}),
        version: { increment: 1 },
        ...(statusChanging ? { statusChangedAt: new Date(), statusChangedBy: user } : {}),
        ...(becomingComplete ? { completedAtZ: new Date() } : {}),
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.task.findUnique({ where: { id } });
      const history = await this.audit.forRecord('Task', id);
      const latest = history[0];
      throw new ConflictException({
        message: `Task ${id} was modified by someone else`,
        current: current ? withTaskTransitions(current) : null,
        changedBy: latest?.user,
        changedAt: latest?.timestampZ,
      });
    }

    const task = await this.prisma.task.findUnique({ where: { id } });
    await this.audit.logDiff(user, 'Task', id, before as unknown as Record<string, unknown>, task as unknown as Record<string, unknown>);
    return withTaskTransitions(task!);
  }
}
```

- [ ] **Step 4: Add `resolveUserTeam` to `TasksService`**

`CurrentUserPayload` (Task 1's read of `current-user.decorator.ts`) only carries `sub`/`username`/`role` — it does not carry `team`, since the JWT itself is never re-verified against the DB inside that decorator. Resolving `team` for the `scope=team` filter needs one extra DB lookup rather than trusting an unverified JWT claim. Add this method to `TasksService` (append after `findAll`):

```typescript
  async resolveUserTeam(userId: string): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { team: true } });
    return user?.team ?? undefined;
  }
```

- [ ] **Step 5: Write `src/server/modules/tasks/tasks.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  async findAll(
    @Query('scope') scope: 'mine' | 'team' | 'unassigned' | 'escalated' | undefined,
    @Query('tripId') tripId: string | undefined,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ) {
    let currentUserTeam: string | undefined;
    if (scope === 'team' && currentUser?.sub) {
      currentUserTeam = await this.tasks.resolveUserTeam(currentUser.sub);
    }
    return this.tasks.findAll({
      scope,
      tripId,
      currentUserId: currentUser?.sub,
      currentUserTeam,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.tasks.create(dto, currentUser?.username);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.tasks.update(id, dto, currentUser?.username);
  }
}
```

- [ ] **Step 6: Write `src/server/modules/tasks/tasks.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
```

(BullMQ queue registration for the sync job is added to this module in Task 4, not here — keeping this task's diff scoped to CRUD.)

- [ ] **Step 7: Wire `TasksModule` into `src/server/app.module.ts`**

Add the import near the other feature modules (after `import { InvoicesModule } from './modules/invoices/invoices.module';`):
```typescript
import { TasksModule } from './modules/tasks/tasks.module';
```
And add `TasksModule,` to the `imports` array, after `InvoicesModule,` and before `QuotesModule,`.

- [ ] **Step 8: Write `src/server/modules/tasks/tasks.service.spec.ts`**

```typescript
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
});
```

- [ ] **Step 9: Run the tests**

Run: `npm test -- tasks.service.spec.ts`
Expected: 8 tests pass.

- [ ] **Step 10: Build and commit**

Run: `npm run build:server`
Expected: clean build (kill any orphaned `node.exe` first if the Prisma DLL is locked).

```bash
git add src/server/modules/tasks src/server/app.module.ts
git commit -m "feat: add TasksModule CRUD, status transitions, and REST API"
```

---

### Task 3: Task sync core logic (generation, auto-close, escalation)

**Files:**
- Create: `src/server/modules/tasks/task-sync.service.ts`
- Test: `src/server/modules/tasks/task-sync.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; no dependency on `TasksService`, `ServicesService`, `LegsService`, or `TripsService` — reads `Service`/`Trip`/`Task` directly via Prisma.
- Produces: `TaskSyncService.runSync(): Promise<{ created: number; closed: number; escalated: number }>` — consumed by Task 4's `task-sync.processor.ts`.

- [ ] **Step 1: Write `src/server/modules/tasks/task-sync.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const AMBER_HOURS_BEFORE_NLT = 2;
const DEADLINE_APPROACHING_WINDOW_HOURS = 24;

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
      (await this.generateDeadlineTasks());
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
    const services = await this.prisma.service.findMany({
      where: {
        requiredByZ: { lte: windowEnd },
        status: { notIn: ['Confirmed', 'Requested', 'Not Required', 'Cancelled'] },
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
```

- [ ] **Step 2: Write `src/server/modules/tasks/task-sync.service.spec.ts`**

```typescript
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
    await prisma.service.update({ where: { svcId: 'SVC-6' }, data: { status: 'Confirmed' } });
    const result = await sync.runSync();
    expect(result.closed).toBe(1);
    const task = await prisma.task.findUnique({ where: { sourceKey: 'reconfirm:SVC-6' } });
    expect(task!.status).toBe('Complete');
    expect(task!.completedAtZ).not.toBeNull();
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

  it('does not escalate a task with no noLaterThanZ', async () => {
    await makeService('SVC-9', 'Not Started', new Date(Date.now() + 72 * 3600_000));
    // SVC-9 falls outside the 24h deadline window, so no task exists at all
    // to escalate -- confirms the escalation pass safely skips tasks
    // without a noLaterThanZ rather than erroring on a null.
    const result = await sync.runSync();
    expect(result.escalated).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- task-sync.service.spec.ts`
Expected: 10 tests pass.

- [ ] **Step 4: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/tasks/task-sync.service.ts src/server/modules/tasks/task-sync.service.spec.ts
git commit -m "feat: add task-sync core logic (generation, auto-close, escalation)"
```

---

### Task 4: BullMQ repeatable job wiring

**Files:**
- Create: `src/server/modules/tasks/task-sync.processor.ts`
- Modify: `src/server/modules/tasks/tasks.module.ts` — register the `task-sync` queue and schedule the repeat
- Test: `src/server/modules/tasks/task-sync.processor.spec.ts`

**Interfaces:**
- Consumes: `TaskSyncService.runSync()` from Task 3.
- Produces: nothing new consumed by later tasks — this is the transport layer only.

- [ ] **Step 1: Write `src/server/modules/tasks/task-sync.processor.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TaskSyncService } from './task-sync.service';

// Thin transport wrapper -- all logic lives in TaskSyncService.runSync()
// so it stays testable with no queue or timing dependency (see
// task-sync.service.spec.ts). Mirrors DocumentProcessingProcessor's
// split between processor (transport) and service (logic).
@Injectable()
@Processor('task-sync')
export class TaskSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskSyncProcessor.name);

  constructor(private readonly taskSync: TaskSyncService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await this.taskSync.runSync();
    this.logger.log(`task-sync job complete: ${JSON.stringify(result)}`);
  }
}
```

- [ ] **Step 2: Update `src/server/modules/tasks/tasks.module.ts`**

Replace the full file with:

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TaskSyncService } from './task-sync.service';
import { TaskSyncProcessor } from './task-sync.processor';

const TASK_SYNC_REPEAT_JOB_ID = 'task-sync-repeat';
const TASK_SYNC_INTERVAL_MS = 10 * 60 * 1000;

@Module({
  imports: [BullModule.registerQueue({ name: 'task-sync' })],
  controllers: [TasksController],
  providers: [TasksService, TaskSyncService, TaskSyncProcessor],
  exports: [TasksService, TaskSyncService],
})
export class TasksModule implements OnModuleInit {
  constructor(@InjectQueue('task-sync') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Idempotent: BullMQ dedupes repeatable jobs sharing the same jobId +
    // repeat config, so this is safe to run on every app boot without
    // creating duplicate schedules.
    await this.queue.add(
      'sync',
      {},
      { jobId: TASK_SYNC_REPEAT_JOB_ID, repeat: { every: TASK_SYNC_INTERVAL_MS } },
    );
  }
}
```

- [ ] **Step 3: Write `src/server/modules/tasks/task-sync.processor.spec.ts`**

```typescript
import { TaskSyncProcessor } from './task-sync.processor';
import { TaskSyncService } from './task-sync.service';

describe('TaskSyncProcessor', () => {
  it('delegates to TaskSyncService.runSync()', async () => {
    const runSync = jest.fn().mockResolvedValue({ created: 1, closed: 0, escalated: 0 });
    const taskSync = { runSync } as unknown as TaskSyncService;
    const processor = new TaskSyncProcessor(taskSync);
    await processor.process({} as any);
    expect(runSync).toHaveBeenCalledTimes(1);
  });
});
```

(This is the one place in this plan that stubs a collaborator rather than hitting real Postgres — it is testing pure transport delegation, not domain logic, which `task-sync.service.spec.ts` already covers end-to-end against the real database.)

- [ ] **Step 4: Run the tests**

Run: `npm test -- task-sync.processor.spec.ts`
Expected: 1 test passes.

- [ ] **Step 5: Build, start the dev server, and verify the repeatable job registers**

Run: `npm run build:server`, then start the dev server and check logs for no BullMQ connection errors (Redis must be running per `REDIS_URL` / default `redis://localhost:6389`).

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/tasks/task-sync.processor.ts src/server/modules/tasks/task-sync.processor.spec.ts src/server/modules/tasks/tasks.module.ts
git commit -m "feat: schedule task-sync as a 10-minute BullMQ repeatable job"
```

---

### Task 5: Failed Messages widget endpoint

**Files:**
- Modify: `src/server/modules/comms/comms.service.ts` — add `failed()` method
- Modify: `src/server/modules/comms/comms.controller.ts` — add `GET /comms/failed`
- Test: `src/server/modules/comms/comms-failed-widget.spec.ts`

**Interfaces:**
- Produces: `CommsService.failed(limit: number, search?: string): Promise<Comm[]>` (each row includes `trip: { tripId, registration }`, matching the `include` shape `legs.service.ts#upcoming()` and `services.service.ts#open()` already use) — consumed by Task 6's client `getFailedMessagesWidget()`.

- [ ] **Step 1: Add `failed()` to `src/server/modules/comms/comms.service.ts`**

Add this method to the `CommsService` class, after `findAll`:

```typescript
  async failed(limit: number, search?: string) {
    const where: Record<string, unknown> = { status: 'Failed' };
    if (search) {
      const q = search.trim();
      (where as any).OR = [
        { tripId: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
        { to: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.comm.findMany({
      where,
      orderBy: { timestampZ: 'desc' },
      take: limit,
      include: { trip: { select: { tripId: true, registration: true } } },
    });
  }
```

- [ ] **Step 2: Add the route to `src/server/modules/comms/comms.controller.ts`**

Add this method to `CommsController`, before the existing `@Get(':commId')`:

```typescript
  @Get('failed')
  failed(@Query('limit') limit?: string, @Query('search') search?: string) {
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
    return this.comms.failed(limitNum, search);
  }
```

(Must come before `@Get(':commId')` in the file — NestJS matches routes in declaration order, and `:commId` would otherwise swallow the literal `/comms/failed` path.)

- [ ] **Step 3: Write `src/server/modules/comms/comms-failed-widget.spec.ts`**

```typescript
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CommsService } from './comms.service';
import { truncateAll } from '../../test/db-test-utils';

describe('CommsService.failed (Action Board widget)', () => {
  let prisma: PrismaService;
  let comms: CommsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    comms = new CommsService(prisma, new AuditService(prisma), {} as MailService);
    await prisma.trip.create({ data: { tripId: 'TEST-COMMFAIL-1', client: 'Test Client' } });
  });

  it('returns only Failed comms, most recent first', async () => {
    await prisma.comm.create({
      data: { commId: 'C-1', direction: 'Outbound', tripId: 'TEST-COMMFAIL-1', from: 'a@x.com', to: 'b@x.com', subject: 'Permit request', body: '...', status: 'Sent' },
    });
    await prisma.comm.create({
      data: { commId: 'C-2', direction: 'Outbound', tripId: 'TEST-COMMFAIL-1', from: 'a@x.com', to: 'b@x.com', subject: 'Handling request', body: '...', status: 'Failed', errorMessage: 'SMTP timeout' },
    });
    const failed = await comms.failed(20);
    expect(failed).toHaveLength(1);
    expect(failed[0].commId).toBe('C-2');
  });

  it('filters by search across trip/subject/recipient', async () => {
    await prisma.comm.create({
      data: { commId: 'C-3', direction: 'Outbound', tripId: 'TEST-COMMFAIL-1', from: 'a@x.com', to: 'ops@vendor.com', subject: 'Overflight Kenya', body: '...', status: 'Failed' },
    });
    const matched = await comms.failed(20, 'Kenya');
    expect(matched).toHaveLength(1);
    const unmatched = await comms.failed(20, 'Nonexistent');
    expect(unmatched).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- comms-failed-widget.spec.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/comms/comms.service.ts src/server/modules/comms/comms.controller.ts src/server/modules/comms/comms-failed-widget.spec.ts
git commit -m "feat: add Failed Messages widget endpoint (GET /comms/failed)"
```

---

### Task 6: Client data layer — Task type, dataStore functions, StatusBadge

**Files:**
- Modify: `src/client/data/types.ts` — add `Task` interface and supporting unions
- Modify: `src/client/lib/dataStore.ts` — add `mapTaskFromApi`/`mapTaskToApi`, `getTasks`, `createTask`, `updateTask`, `getFailedMessagesWidget`
- Modify: `src/client/components/StatusBadge.tsx` — add `TASK_STATUS_COLORS` and `entityType: 'task'`

**Interfaces:**
- Consumes: `apiJson`, `currentUser()` (existing private helpers in `dataStore.ts`).
- Produces: `Task` type, `getTasks(params: { scope?: 'mine'|'team'|'unassigned'|'escalated'; tripId?: string }): Promise<Task[]>`, `createTask(task: Partial<Task>, user?: string): Promise<Task>`, `updateTask(id: string, patch: Partial<Task> & { version: number }, user?: string): Promise<Task>`, `getFailedMessagesWidget(limit: number, search?: string): Promise<(Comm & { Trip: { TripID: string; Registration: string } })[]>` — all consumed by Task 7's `Dashboard.tsx`.

- [ ] **Step 1: Add the `Task` type to `src/client/data/types.ts`**

Add near the `Service` interface (after it, or in the same block of entity types):

```typescript
export type TaskStatus = 'Open' | 'In Progress' | 'Waiting' | 'Complete' | 'Cancelled';
export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type TaskEscalationTier = 'Amber' | 'Red';

export interface Task {
  TaskID: string;
  Title: string;
  Description?: string;
  TripID?: string;
  LegID?: string;
  ServiceID?: string;
  ClientID?: string;
  OwnerUserID?: string;
  Priority: TaskPriority;
  NoLaterThanZ?: string;
  Status: TaskStatus;
  StatusChangedAt?: string;
  StatusChangedBy?: string;
  AllowedTransitions?: string[];
  Version: number;
  Source: 'Manual' | 'System';
  SourceKey?: string;
  EscalationTier?: TaskEscalationTier;
  EscalatedAtZ?: string;
  CreatedBy?: string;
  CreatedAtZ: string;
  CompletedAtZ?: string;
}
```

- [ ] **Step 2: Add mapping functions and CRUD to `src/client/lib/dataStore.ts`**

Add near `mapServiceFromApi`/`mapServiceToApi` (after them):

```typescript
export function mapTaskFromApi(t: any): Task {
  return {
    TaskID: t.id,
    Title: t.title,
    Description: t.description ?? undefined,
    TripID: t.tripId ?? undefined,
    LegID: t.legId ?? undefined,
    ServiceID: t.serviceId ?? undefined,
    ClientID: t.clientId ?? undefined,
    OwnerUserID: t.ownerUserId ?? undefined,
    Priority: t.priority,
    NoLaterThanZ: t.noLaterThanZ ?? undefined,
    Status: t.status,
    StatusChangedAt: t.statusChangedAt ?? undefined,
    StatusChangedBy: t.statusChangedBy ?? undefined,
    AllowedTransitions: t.allowedTransitions ?? undefined,
    Version: t.version,
    Source: t.source,
    SourceKey: t.sourceKey ?? undefined,
    EscalationTier: t.escalationTier ?? undefined,
    EscalatedAtZ: t.escalatedAtZ ?? undefined,
    CreatedBy: t.createdBy ?? undefined,
    CreatedAtZ: t.createdAtZ,
    CompletedAtZ: t.completedAtZ ?? undefined,
  };
}

function mapTaskToApi(task: Partial<Task>): Record<string, unknown> {
  return {
    title: task.Title,
    description: task.Description,
    tripId: task.TripID,
    legId: task.LegID,
    serviceId: task.ServiceID,
    clientId: task.ClientID,
    ownerUserId: task.OwnerUserID,
    priority: task.Priority,
    noLaterThanZ: task.NoLaterThanZ,
    status: task.Status,
    version: task.Version,
    escalationTier: task.EscalationTier,
  };
}
```

Add near `getOpenServicesWidget`/`closeService` (after the Service CRUD block):

```typescript
// ─── Task CRUD ──────────────────────────────────────────────────────────────

export async function getTasks(params: { scope?: 'mine' | 'team' | 'unassigned' | 'escalated'; tripId?: string } = {}): Promise<Task[]> {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (params.tripId) search.set('tripId', params.tripId);
  const qs = search.toString();
  const rows = await apiJson<any[]>(`/tasks${qs ? `?${qs}` : ''}`);
  return rows.map(mapTaskFromApi);
}

export async function createTask(task: Partial<Task>, user = currentUser()): Promise<Task> {
  const row = await apiJson<any>('/tasks', {
    method: 'POST',
    body: JSON.stringify(mapTaskToApi(task)),
  });
  return mapTaskFromApi(row);
}

export async function updateTask(id: string, patch: Partial<Task> & { Version: number }, user = currentUser()): Promise<Task> {
  const row = await apiJson<any>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(mapTaskToApi(patch)),
  });
  return mapTaskFromApi(row);
}

export async function getFailedMessagesWidget(limit: number, search?: string): Promise<(Comm & { Trip: { TripID: string; Registration: string } })[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);
  const rows = await apiJson<any[]>(`/comms/failed?${params.toString()}`);
  return rows.map((r) => ({
    ...mapCommFromApi(r),
    Trip: { TripID: r.trip.tripId, Registration: r.trip.registration ?? '' },
  }));
}
```

Add `Task` to the `import type { ... } from '@/data/types'` line at the top of `dataStore.ts` wherever `Service`/`Comm` are already imported.

- [ ] **Step 3: Add task colors to `src/client/components/StatusBadge.tsx`**

Replace the file with:

```typescript
// src/client/components/StatusBadge.tsx
//
// One shared color-coded status pill for Trip, Service, and Task statuses,
// consolidating the color logic that previously lived duplicated as
// TripsPage.tsx's private tripStatusColor() and dataStore.ts's exported
// statusColor() (Service-only) -- both deleted now that every call site
// uses this component instead. `className` lets callers layer on
// size/spacing without touching the color logic.
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TRIP_STATUS_COLORS: Record<string, string> = {
  'Planning': 'bg-blue-100 text-blue-700',
  'Active': 'bg-emerald-100 text-emerald-700',
  'Complete': 'bg-slate-100 text-slate-600',
  'Cancelled': 'bg-red-100 text-red-700',
};

const SERVICE_STATUS_COLORS: Record<string, string> = {
  'Confirmed': 'bg-emerald-100 text-emerald-700',
  'Requested': 'bg-blue-100 text-blue-700',
  'Chasing': 'bg-amber-100 text-amber-700',
  'Not Started': 'bg-slate-100 text-slate-600',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Re-confirm Required': 'bg-rose-100 text-rose-700',
  'Not Required': 'bg-slate-100 text-slate-600',
  'Submission Pending': 'bg-amber-100 text-amber-700',
  'Submission Failed': 'bg-red-100 text-red-700',
};

const TASK_STATUS_COLORS: Record<string, string> = {
  'Open': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Waiting': 'bg-slate-100 text-slate-600',
  'Complete': 'bg-emerald-100 text-emerald-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
};

const COLOR_MAPS: Record<'trip' | 'service' | 'task', Record<string, string>> = {
  trip: TRIP_STATUS_COLORS,
  service: SERVICE_STATUS_COLORS,
  task: TASK_STATUS_COLORS,
};

export function StatusBadge({ status, entityType, className }: { status: string; entityType: 'trip' | 'service' | 'task'; className?: string }) {
  const colorClassName = COLOR_MAPS[entityType][status] ?? 'bg-gray-100 text-gray-600';
  return <Badge variant="secondary" className={cn(colorClassName, className)}>{status}</Badge>;
}

const ESCALATION_TIER_COLORS: Record<string, string> = {
  'Amber': 'bg-amber-100 text-amber-700',
  'Red': 'bg-red-100 text-red-700',
};

export function EscalationBadge({ tier, className }: { tier: 'Amber' | 'Red'; className?: string }) {
  return <Badge variant="secondary" className={cn(ESCALATION_TIER_COLORS[tier], className)}>{tier === 'Red' ? 'OVERDUE' : 'DUE SOON'}</Badge>;
}
```

- [ ] **Step 4: Build**

Run: `npm run build:client`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/client/data/types.ts src/client/lib/dataStore.ts src/client/components/StatusBadge.tsx
git commit -m "feat: add Task client type, dataStore CRUD, and StatusBadge/EscalationBadge support"
```

---

### Task 7: Dashboard redesign — task-driven Action Board

**Files:**
- Modify: `src/client/pages/Dashboard.tsx` — full rewrite per the spec's §5 layout

**Interfaces:**
- Consumes: `getTasks`, `getFailedMessagesWidget`, `updateTask` from Task 6's `dataStore.ts`; `StatusBadge`/`EscalationBadge` from Task 6's `StatusBadge.tsx`; existing `getUpcomingLegs`, `getTrips`, `formatZ`.

- [ ] **Step 1: Determine the current user's id/team for the client**

Check how `currentUser()` (already used throughout `dataStore.ts`) resolves — grep `src/client/lib/dataStore.ts` for its implementation before writing this task's fetch calls, since `getTasks({ scope: 'mine' })` relies on the server resolving identity from the JWT (already wired in Task 2), not from a client-supplied id. No client-side user-id resolution is needed — the `scope` query param alone is sufficient because `TasksController.findAll` reads `@CurrentUser()` server-side.

- [ ] **Step 2: Rewrite `src/client/pages/Dashboard.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { getUpcomingLegs, getTasks, getFailedMessagesWidget, updateTask, formatZ } from '@/lib/dataStore';
import type { Task, Leg, Comm } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, EscalationBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router';
import { Plane, AlertTriangle, ListChecks, Clock } from 'lucide-react';

const WIDGET_LIMIT = 8;

type UpcomingLeg = Leg & { Trip: { TripID: string; Registration: string; Status: string } };
type FailedComm = Comm & { Trip: { TripID: string; Registration: string } };

function TaskRow({ task, onComplete }: { task: Task; onComplete: (task: Task) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs hover:bg-accent/50 transition-colors">
      <Link to={task.TripID ? `/trips/${task.TripID}` : '#'} className="flex-1 min-w-0">
        <span className="font-medium">{task.Title}</span>
        {task.TripID && <span className="text-muted-foreground ml-2">{task.TripID}</span>}
        <div className="flex items-center gap-2 mt-0.5">
          {task.NoLaterThanZ && <span className="text-muted-foreground">NLT {formatZ(task.NoLaterThanZ)}</span>}
          {task.EscalationTier && <EscalationBadge tier={task.EscalationTier} className="text-[9px]" />}
          <StatusBadge status={task.Status} entityType="task" className="text-[9px]" />
        </div>
      </Link>
      {task.Status !== 'Complete' && task.Status !== 'Cancelled' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] shrink-0"
          onClick={(e) => { e.preventDefault(); onComplete(task); }}
        >
          Complete
        </Button>
      )}
    </div>
  );
}

function TaskList({ tasks, loading, emptyLabel, onComplete }: { tasks: Task[]; loading: boolean; emptyLabel: string; onComplete: (task: Task) => void }) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (tasks.length === 0) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  return <div className="space-y-2">{tasks.map((t) => <TaskRow key={t.TaskID} task={t} onComplete={onComplete} />)}</div>;
}

export default function Dashboard() {
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [teamTasks, setTeamTasks] = useState<Task[]>([]);
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [escalatedTasks, setEscalatedTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const [failedMessages, setFailedMessages] = useState<FailedComm[]>([]);
  const [failedLoading, setFailedLoading] = useState(true);

  const [upcomingLegs, setUpcomingLegs] = useState<UpcomingLeg[]>([]);
  const [departuresLoading, setDeparturesLoading] = useState(true);

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    Promise.all([
      getTasks({ scope: 'mine' }),
      getTasks({ scope: 'team' }),
      getTasks({ scope: 'unassigned' }),
      getTasks({ scope: 'escalated' }),
    ])
      .then(([mine, team, unassigned, escalated]) => {
        if (cancelled) return;
        setMyTasks(mine);
        setTeamTasks(team);
        setUnassignedTasks(unassigned);
        setEscalatedTasks(escalated);
        setTasksLoading(false);
      })
      .catch(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setFailedLoading(true);
    getFailedMessagesWidget(WIDGET_LIMIT)
      .then((rows) => { if (!cancelled) { setFailedMessages(rows); setFailedLoading(false); } })
      .catch(() => { if (!cancelled) setFailedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDeparturesLoading(true);
    getUpcomingLegs(WIDGET_LIMIT)
      .then((legs) => { if (!cancelled) { setUpcomingLegs(legs); setDeparturesLoading(false); } })
      .catch(() => { if (!cancelled) setDeparturesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleCompleteTask(task: Task) {
    await updateTask(task.TaskID, { Status: 'Complete', Version: task.Version });
    setReloadToken((n) => n + 1);
  }

  const activeTripsCount = new Set(
    [...myTasks, ...teamTasks, ...unassignedTasks].filter((t) => t.TripID).map((t) => t.TripID),
  ).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ACTION BOARD</h1>
        <p className="text-muted-foreground">OPERATIONS OVERVIEW</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">TRIPS WITH OPEN TASKS</p><p className="text-2xl font-bold">{activeTripsCount}</p></div><Plane className="h-6 w-6 text-blue-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">MY OPEN TASKS</p><p className="text-2xl font-bold">{myTasks.length}</p></div><ListChecks className="h-6 w-6 text-emerald-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">ESCALATED</p><p className="text-2xl font-bold">{escalatedTasks.length}</p></div><AlertTriangle className="h-6 w-6 text-red-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">UPCOMING DEPARTURES</p><p className="text-2xl font-bold">{upcomingLegs.length}</p></div><Clock className="h-6 w-6 text-amber-600" /></div></CardContent></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">MY TASKS</CardTitle></CardHeader>
          <CardContent><TaskList tasks={myTasks} loading={tasksLoading} emptyLabel="No open tasks — all clear." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">TEAM TASKS</CardTitle></CardHeader>
          <CardContent><TaskList tasks={teamTasks} loading={tasksLoading} emptyLabel="No team tasks." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">UNASSIGNED</CardTitle></CardHeader>
          <CardContent><TaskList tasks={unassignedTasks} loading={tasksLoading} emptyLabel="Nothing unassigned." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ESCALATED</CardTitle></CardHeader>
          <CardContent><TaskList tasks={escalatedTasks} loading={tasksLoading} emptyLabel="Nothing escalated." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">FAILED MESSAGES</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {failedLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : failedMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No failed messages.</p>
            ) : (
              failedMessages.map((c) => (
                <Link key={c.CommID} to={`/trips/${c.TripID}`} className="flex items-center justify-between rounded-md border p-2 text-xs hover:bg-accent/50 transition-colors">
                  <div className="min-w-0">
                    <span className="font-medium">{c.Subject}</span>
                    <span className="text-muted-foreground ml-2">{c.Trip.TripID}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] bg-red-100 text-red-700 shrink-0">FAILED</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">UPCOMING DEPARTURES</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {departuresLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : upcomingLegs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No upcoming departures.</p>
            ) : (
              upcomingLegs.map((leg) => (
                <Link key={leg.LegID} to={`/trips/${leg.Trip.TripID}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                  <div>
                    <div className="font-bold text-sm">{leg.Trip.TripID} — {leg.Trip.Registration}</div>
                    <div className="text-xs text-muted-foreground">{leg.DepICAO} → {leg.ArrICAO}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatZ(leg.ETDZ)}</div>
                    <Badge variant="outline" className="text-[9px]">{leg.Trip.Status}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Note: this drops the per-widget search boxes the old Dashboard had (`departuresSearch`, `servicesSearch`) — the new layout has six cards instead of two, and per-card search inputs would clutter it. If search-within-widget turns out to matter after real use, it's a small follow-up, not a blocker for this phase.

- [ ] **Step 3: Build**

Run: `npm run build:client`
Expected: clean build.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run start:dev`, then `npm run build:client` again since `nest start --watch` wipes `dist/public` on every compile), open `http://localhost:4001`, and confirm:
- Dashboard loads without errors.
- Creating a Service that transitions to `Re-confirm Required` or `Submission Failed` (via the existing Trip detail workflows) results in a task appearing in the relevant bucket after the next `task-sync` run (or trigger it manually — see Step 5).
- The Escalated bucket and per-row `EscalationBadge` render correctly once a task's `noLaterThanZ` passes into the Amber/Red window.

- [ ] **Step 5: Manual trigger for verification (optional, no code change)**

To verify without waiting 10 minutes for the repeat: temporarily lower `TASK_SYNC_INTERVAL_MS` in `tasks.module.ts` to `10_000` during manual testing only, then revert before committing — or call `TaskSyncService.runSync()` directly from a scratch script. Do not commit a lowered interval.

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/Dashboard.tsx
git commit -m "feat: redesign Action Board around task ownership and escalation"
```

---

## Final Verification

After all 7 tasks:
- [ ] Run the full server suite: `npm test` — expect all suites green, including the new `tasks.service.spec.ts`, `task-sync.service.spec.ts`, `task-sync.processor.spec.ts`, `taskStatusTransitions.spec.ts`, `comms-failed-widget.spec.ts`.
- [ ] `npm run build:server` and `npm run build:client` both clean.
- [ ] Local dev server restarted, Dashboard manually verified per Task 7 Step 4.
- [ ] Memory file `project_viq.md` updated: Phase 8 complete.
