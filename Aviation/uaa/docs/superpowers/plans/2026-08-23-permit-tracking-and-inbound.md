# Permit Tracking, Re-confirm Invalidation & Inbound Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two-clock deadline system in the design spec actually enforce itself — a `PermitRequest` automatically flips to `Re-confirm Required` when a leg's ETD moves outside an issued permit's validity window, or when an unconfirmed request's `RequiredByZ` deadline passes — surface that on an Action Board, and start filing inbound email replies against the right request automatically via correlation-token matching.

**Architecture:** Extends the existing NestJS backend with a reconfirm-evaluation module wired into two triggers (an immediate check on `PATCH /legs/:id`, and a periodic sweep via `@nestjs/schedule` for the time-based case), an Action Board REST endpoint + frontend page, and an `ImapService` (via `imapflow` + `mailparser`) polling a shared mailbox on the same periodic-scheduling infrastructure. Next.js frontend gets one new page. This is **Slice 3 of 5** from the design spec's Build Sequencing.

**Tech Stack:** NestJS 10 + TypeORM 0.3 (existing), `@nestjs/schedule` for periodic jobs, `imapflow` + `mailparser` for the inbound worker, Next.js 14 App Router (existing), Jest (backend), Vitest + React Testing Library (frontend) — same stack as Slices 1-2, three new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-uaa-webapp-design.md`

## Global Constraints

- Every table gets `createdAt`/`updatedAt` audit timestamps (existing convention — no new tables in this plan, so this only matters if a future task adds one).
- Real IMAP connection — no mock-mail-only phase (Spec: Scope, "Full inbound email tracking from the start"). Matches `MailService`'s established pattern: dry-run (log, skip) when `IMAP_HOST` is unconfigured, so the app stays runnable without real mailbox credentials.
- Single coordinator role — no RBAC (Spec: Scope). The new endpoints sit behind the existing `JwtAuthGuard`.
- The reconfirm trigger conditions are exactly the two the spec names in the Permit workflow section, no more: (1) a `CONFIRMED` request's leg ETD moves outside `[ValidFrom, ValidTo]`, or (2) a request that was never `CONFIRMED` passes its `RequiredByZ` deadline. Both flip status to `RECONFIRM_REQUIRED`, nothing else auto-transitions status.
- `computeUrgency` and `needsReconfirm` already exist and are unit-tested (`backend/src/permits/permit-deadline.ts`, from the permit-request-workflow plan) — this plan calls them, does not re-implement them.
- Manual "file this email" (the fallback for replies the token-match misses, named explicitly in the spec's Permit workflow step 3) gets a backend endpoint in this plan; a dedicated frontend UI for browsing/filing unmatched messages is flagged as deferred — see Explicitly Deferred.

## Explicitly Deferred (not this plan)

- A frontend UI for "file this email" against unmatched inbound messages — Step 8 adds the backend endpoint (`POST /permit-requests/:id/comms`) so the capability exists and is tested, but there's no unmatched-inbox browser page. A coordinator (or a future task) can call the endpoint directly until one exists.
- Rich email body parsing beyond subject-line correlation-token extraction (e.g. auto-detecting a clearance number or validity dates from a reply's body text and pre-filling the confirmation form) — the spec's Permit workflow step 4 has the coordinator record those manually; this plan only files the reply onto the right thread.
- Agent/crew/team notifications (`Comm.kind: 'NOTIFICATION'`) — Slice 4, unrelated to this slice's inbound-worker infrastructure despite sharing the `Comm` table.
- "Mark Complete" + MAYFLY export — Slice 5.

---

## File Structure

```
backend/
├── src/
│   ├── legs/
│   │   ├── dto/update-leg.dto.ts       # new
│   │   ├── legs.service.ts             # modify: add update()
│   │   └── legs.controller.ts          # modify: add PATCH :id
│   ├── permits/
│   │   ├── reconfirm.ts                # new: pure evaluateReconfirm()
│   │   ├── reconfirm-sweep.service.ts  # new: periodic + on-demand sweep
│   │   ├── permits.service.ts          # modify: add reconcileForLeg(), findAllWithUrgency(), addManualComm()
│   │   ├── permits.controller.ts       # modify: add GET /permit-requests, POST /permit-requests/:id/comms
│   │   └── permits.module.ts           # modify: import ScheduleModule, provide ReconfirmSweepService
│   ├── mail/
│   │   ├── correlation-token.ts        # new: pure parseCorrelationToken()
│   │   ├── imap.service.ts             # new: real IMAP poll, dry-run fallback
│   │   └── mail.module.ts              # modify: export ImapService
│   └── app.module.ts                   # modify: import ScheduleModule.forRoot()
└── test/
    ├── legs.service.spec.ts            # modify: add update() tests
    ├── legs.e2e-spec.ts                # modify: add PATCH :id test
    ├── reconfirm.spec.ts               # new
    ├── reconfirm-sweep.service.spec.ts # new
    ├── permits.service.spec.ts         # modify: add reconcileForLeg/findAllWithUrgency/addManualComm tests
    ├── permits.e2e-spec.ts             # modify: add GET /permit-requests, POST .../comms tests
    ├── correlation-token.spec.ts       # new
    └── imap.service.spec.ts            # new

frontend/
├── src/
│   ├── app/action-board/
│   │   └── page.tsx                    # new
│   └── lib/api-client.ts               # modify: add listAllPermitRequests, updateLeg
└── test/
    └── action-board.test.tsx           # new
```

---

### Task 1: Leg update endpoint (prerequisite — nothing can move an ETD yet)

**Files:**
- Create: `backend/src/legs/dto/update-leg.dto.ts`
- Modify: `backend/src/legs/legs.service.ts`, `backend/src/legs/legs.controller.ts`
- Test: `backend/test/legs.service.spec.ts`, `backend/test/legs.e2e-spec.ts`

**Interfaces:**
- Produces: `LegsService.update(id: string, dto: UpdateLegDto): Promise<Leg>`, `PATCH /legs/:id` (200 or 404). Task 3 calls `update()` and, when `arrDate` changes, calls `PermitsService.reconcileForLeg`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/test/legs.service.spec.ts` (append inside the existing `describe('LegsService', ...)` block, after the last test):
```typescript
  it('updates a leg and returns the saved entity', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '482421', arrDate: new Date('2026-09-16T16:20:00.000Z') });
    legRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.update('1', { arrDate: '2026-09-18T10:00:00.000Z' });

    expect(legRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ arrDate: new Date('2026-09-18T10:00:00.000Z') }),
    );
    expect(result).toEqual(expect.objectContaining({ id: '1' }));
  });

  it('throws NotFoundException when updating a leg that does not exist', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.update('missing', { arrDate: '2026-09-18T10:00:00.000Z' })).rejects.toThrow(
      NotFoundException,
    );
  });
```
Add the import at the top of the file: `import { NotFoundException } from '@nestjs/common';`

Add to `backend/test/legs.e2e-spec.ts` (append inside the existing `describe('Legs (e2e)', ...)` block):
```typescript
  it('PATCH /legs/:id updates the leg and returns 200', async () => {
    legRepo.findOne.mockResolvedValue({ id: 'generated-id', tripNo: '2608001', arrDate: new Date('2026-09-16T16:20:00.000Z') });

    const response = await request(app.getHttpServer())
      .patch('/legs/generated-id')
      .send({ arrDate: '2026-09-18T10:00:00.000Z' });

    expect(response.status).toBe(200);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: FAIL — `service.update is not a function`

- [ ] **Step 3: Implement UpdateLegDto and LegsService.update**

`backend/src/legs/dto/update-leg.dto.ts`:
```typescript
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateLegDto {
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() refNo?: string;
  @IsOptional() @IsString() clientName?: string;
  @IsOptional() @IsString() operatorName?: string;
  @IsOptional() @IsString() clientNo?: string;
  @IsOptional() @IsString() agentName?: string;
  @IsOptional() @IsString() agentContacts?: string;
  @IsOptional() @IsString() tripNo?: string;
  @IsOptional() @IsString() tail?: string;
  @IsOptional() @IsString() icao?: string;
  @IsOptional() @IsDateString() arrDate?: string;
  @IsOptional() @IsDateString() depDate?: string;
  @IsOptional() @IsString() arrFrom?: string;
  @IsOptional() @IsString() depToIcao?: string;
  @IsOptional() @IsString() activityType?: string;
  @IsOptional() @IsString() captName?: string;
  @IsOptional() @IsString() captEmail?: string;
  @IsOptional() @IsString() acType?: string;
  @IsOptional() @IsInt() mtowLb?: number;
  @IsOptional() @IsString() pgh?: string;
  @IsOptional() @IsString() tssTeam?: string;
  @IsOptional() @IsBoolean() serviceReportSent?: boolean;
  @IsOptional() @IsBoolean() returnedInTime?: boolean;
}
```

Modify `backend/src/legs/legs.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Leg } from './leg.entity';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';

@Injectable()
export class LegsService {
  constructor(@InjectRepository(Leg) private readonly legRepo: Repository<Leg>) {}

  async create(dto: CreateLegDto): Promise<Leg> {
    const currentMax = await this.legRepo.maximum('legId');
    const legId = (currentMax ?? 0) + 1;
    const leg = this.legRepo.create({ ...dto, legId });
    return this.legRepo.save(leg);
  }

  findAll(): Promise<Leg[]> {
    return this.legRepo.find({ order: { legId: 'ASC' } });
  }

  findOne(id: string): Promise<Leg | null> {
    return this.legRepo.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateLegDto): Promise<Leg> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);

    Object.assign(leg, {
      ...dto,
      arrDate: dto.arrDate !== undefined ? new Date(dto.arrDate) : leg.arrDate,
      depDate: dto.depDate !== undefined ? new Date(dto.depDate) : leg.depDate,
    });

    return this.legRepo.save(leg);
  }
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Add the PATCH route**

Modify `backend/src/legs/legs.controller.ts`:
```typescript
import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegsService } from './legs.service';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';

@Controller('legs')
@UseGuards(JwtAuthGuard)
export class LegsController {
  constructor(private readonly legsService: LegsService) {}

  @Post()
  create(@Body() dto: CreateLegDto) {
    return this.legsService.create(dto);
  }

  @Get()
  findAll() {
    return this.legsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const leg = await this.legsService.findOne(id);
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);
    return leg;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLegDto) {
    return this.legsService.update(id, dto);
  }
}
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `cd backend && npx jest test/legs.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/legs/dto/update-leg.dto.ts backend/src/legs/legs.service.ts backend/src/legs/legs.controller.ts backend/test/legs.service.spec.ts backend/test/legs.e2e-spec.ts
git commit -m "Add PATCH /legs/:id — prerequisite for re-confirm invalidation to have anything to react to"
```

---

### Task 2: Reconfirm evaluation — pure function

**Files:**
- Create: `backend/src/permits/reconfirm.ts`
- Test: `backend/test/reconfirm.spec.ts`

**Interfaces:**
- Produces: `evaluateReconfirm(permitRequest: { status: PermitRequestStatus; requiredByZ: Date | null; validFrom: Date | null; validTo: Date | null }, currentArrDateZ: Date | null, nowZ: Date): PermitRequestStatus`. Returns the *next* status — either unchanged, or `'RECONFIRM_REQUIRED'`. Tasks 3 and 4 call this exact function.

- [ ] **Step 1: Write the failing tests**

`backend/test/reconfirm.spec.ts`:
```typescript
import { evaluateReconfirm } from '../src/permits/reconfirm';

describe('evaluateReconfirm', () => {
  it('flips a CONFIRMED request to RECONFIRM_REQUIRED when the current ETD falls outside validFrom/validTo', () => {
    const request = {
      status: 'CONFIRMED' as const,
      requiredByZ: null,
      validFrom: new Date('2026-09-10T00:00:00.000Z'),
      validTo: new Date('2026-09-20T00:00:00.000Z'),
    };

    const result = evaluateReconfirm(request, new Date('2026-09-25T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('RECONFIRM_REQUIRED');
  });

  it('leaves a CONFIRMED request alone when the current ETD is still within validFrom/validTo', () => {
    const request = {
      status: 'CONFIRMED' as const,
      requiredByZ: null,
      validFrom: new Date('2026-09-10T00:00:00.000Z'),
      validTo: new Date('2026-09-20T00:00:00.000Z'),
    };

    const result = evaluateReconfirm(request, new Date('2026-09-15T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('CONFIRMED');
  });

  it('leaves a CONFIRMED request without a validFrom/validTo window alone (nothing to check against)', () => {
    const request = { status: 'CONFIRMED' as const, requiredByZ: null, validFrom: null, validTo: null };

    const result = evaluateReconfirm(request, new Date('2026-09-25T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('CONFIRMED');
  });

  it('flips an unconfirmed request to RECONFIRM_REQUIRED once RequiredByZ passes', () => {
    const request = {
      status: 'REQUESTED' as const,
      requiredByZ: new Date('2026-09-10T00:00:00.000Z'),
      validFrom: null,
      validTo: null,
    };

    const result = evaluateReconfirm(request, new Date('2026-09-16T00:00:00.000Z'), new Date('2026-09-12T00:00:00.000Z'));

    expect(result).toBe('RECONFIRM_REQUIRED');
  });

  it('leaves an unconfirmed request alone before RequiredByZ passes', () => {
    const request = {
      status: 'REQUESTED' as const,
      requiredByZ: new Date('2026-09-10T00:00:00.000Z'),
      validFrom: null,
      validTo: null,
    };

    const result = evaluateReconfirm(request, new Date('2026-09-16T00:00:00.000Z'), new Date('2026-09-01T00:00:00.000Z'));

    expect(result).toBe('REQUESTED');
  });

  it('never touches a CANCELLED request', () => {
    const request = {
      status: 'CANCELLED' as const,
      requiredByZ: new Date('2026-09-10T00:00:00.000Z'),
      validFrom: null,
      validTo: null,
    };

    const result = evaluateReconfirm(request, new Date('2026-09-25T00:00:00.000Z'), new Date('2026-09-20T00:00:00.000Z'));

    expect(result).toBe('CANCELLED');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/reconfirm.spec.ts`
Expected: FAIL — `Cannot find module '../src/permits/reconfirm'`

- [ ] **Step 3: Implement evaluateReconfirm**

`backend/src/permits/reconfirm.ts`:
```typescript
import type { PermitRequestStatus } from './permit-request.entity';

export interface ReconfirmInput {
  status: PermitRequestStatus;
  requiredByZ: Date | null;
  validFrom: Date | null;
  validTo: Date | null;
}

export function evaluateReconfirm(
  request: ReconfirmInput,
  currentArrDateZ: Date | null,
  nowZ: Date,
): PermitRequestStatus {
  if (request.status === 'CANCELLED') return request.status;

  if (request.status === 'CONFIRMED') {
    if (request.validFrom && request.validTo && currentArrDateZ) {
      const outsideWindow = currentArrDateZ < request.validFrom || currentArrDateZ > request.validTo;
      if (outsideWindow) return 'RECONFIRM_REQUIRED';
    }
    return request.status;
  }

  if (request.requiredByZ && nowZ > request.requiredByZ) {
    return 'RECONFIRM_REQUIRED';
  }

  return request.status;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/reconfirm.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/permits/reconfirm.ts backend/test/reconfirm.spec.ts
git commit -m "Add evaluateReconfirm — the two exact flip conditions the spec names, nothing else"
```

---

### Task 3: Wire reconfirm evaluation into Leg updates

**Files:**
- Modify: `backend/src/permits/permits.service.ts`, `backend/src/legs/legs.controller.ts`, `backend/src/legs/legs.module.ts`
- Test: `backend/test/permits.service.spec.ts`

**Interfaces:**
- Consumes: `evaluateReconfirm` (Task 2), `LegsService.update` (Task 1).
- Produces: `PermitsService.reconcileForLeg(legId: string, currentArrDateZ: Date | null): Promise<void>` — re-evaluates every `PermitRequest` for a leg and saves any that flip. `LegsController.update` (Task 1) calls this after a successful save when `arrDate` was part of the update.

- [ ] **Step 1: Write the failing test**

Add to `backend/test/permits.service.spec.ts` (append inside the existing `describe('PermitsService', ...)` block):
```typescript
  it('reconcileForLeg flips a CONFIRMED request whose validity window no longer covers the leg ETD', async () => {
    permitRequestRepo.find.mockResolvedValue([
      {
        id: 'pr-1',
        legId: 'leg-1',
        status: 'CONFIRMED',
        requiredByZ: null,
        validFrom: new Date('2026-09-10T00:00:00.000Z'),
        validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);

    await service.reconcileForLeg('leg-1', new Date('2026-09-25T00:00:00.000Z'));

    expect(permitRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pr-1', status: 'RECONFIRM_REQUIRED' }),
    );
  });

  it('reconcileForLeg does not save a request whose status does not change', async () => {
    permitRequestRepo.find.mockResolvedValue([
      {
        id: 'pr-1',
        legId: 'leg-1',
        status: 'CONFIRMED',
        requiredByZ: null,
        validFrom: new Date('2026-09-10T00:00:00.000Z'),
        validTo: new Date('2026-09-20T00:00:00.000Z'),
      },
    ]);
    permitRequestRepo.save.mockClear();

    await service.reconcileForLeg('leg-1', new Date('2026-09-15T00:00:00.000Z'));

    expect(permitRequestRepo.save).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: FAIL — `service.reconcileForLeg is not a function`

- [ ] **Step 3: Implement reconcileForLeg**

Modify `backend/src/permits/permits.service.ts` — add the import and the method (append inside the `PermitsService` class, after `update`):
```typescript
import { evaluateReconfirm } from './reconfirm';
```
```typescript
  async reconcileForLeg(legId: string, currentArrDateZ: Date | null): Promise<void> {
    const requests = await this.permitRequestRepo.find({ where: { legId } });
    const now = new Date();

    for (const request of requests) {
      const nextStatus = evaluateReconfirm(request, currentArrDateZ, now);
      if (nextStatus !== request.status) {
        request.status = nextStatus;
        await this.permitRequestRepo.save(request);
      }
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Call reconcileForLeg from the Leg update route**

Modify `backend/src/legs/legs.controller.ts` — inject `PermitsService` and call it after a successful update when `arrDate` was part of the request body:
```typescript
import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegsService } from './legs.service';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { PermitsService } from '../permits/permits.service';

@Controller('legs')
@UseGuards(JwtAuthGuard)
export class LegsController {
  constructor(
    private readonly legsService: LegsService,
    private readonly permitsService: PermitsService,
  ) {}

  @Post()
  create(@Body() dto: CreateLegDto) {
    return this.legsService.create(dto);
  }

  @Get()
  findAll() {
    return this.legsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const leg = await this.legsService.findOne(id);
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);
    return leg;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLegDto) {
    const leg = await this.legsService.update(id, dto);
    if (dto.arrDate !== undefined) {
      await this.permitsService.reconcileForLeg(id, leg.arrDate);
    }
    return leg;
  }
}
```

Modify `backend/src/legs/legs.module.ts` — `LegsModule` now needs `PermitsService`. Import `PermitsModule`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Leg } from './leg.entity';
import { LegsService } from './legs.service';
import { LegsController } from './legs.controller';
import { PermitsModule } from '../permits/permits.module';

@Module({
  imports: [TypeOrmModule.forFeature([Leg]), PermitsModule],
  providers: [LegsService],
  controllers: [LegsController],
  exports: [LegsService],
})
export class LegsModule {}
```

Note: this makes `LegsModule` depend on `PermitsModule`, which is the opposite direction from how `PermitsModule` already depends on the `Leg` *entity* (via `TypeOrmModule.forFeature([Leg])` for its own repository — that's just shared table access, not a module-to-module dependency, so this doesn't create a cycle). `PermitsModule` already exports `PermitsService` (permit-request-workflow plan, Task 6).

- [ ] **Step 6: Update the Legs e2e test to provide PermitsService**

Modify `backend/test/legs.e2e-spec.ts` — the test module now needs `PermitsService` available (since `LegsController` injects it). Add an override:
```typescript
      .overrideProvider(PermitsService)
      .useValue({ reconcileForLeg: jest.fn() })
```
placed alongside the existing `.overrideGuard(JwtAuthGuard)` chain (before `.compile()`), and add the import: `import { PermitsService } from '../src/permits/permits.service';`. Also change the test module's `imports` from `[LegsModule]` to keep `LegsModule` (it now transitively imports `PermitsModule`, which is fine — the override above replaces the real `PermitsService` regardless of which module provides it).

Note: overriding `PermitsService` alone is **not** sufficient — `PermitsModule` also declares `TypeOrmModule.forFeature([PermitRequest, Comm, Leg, CountryRequirement, FormTemplate])`, and Nest's testing module still eagerly instantiates every provider those `forFeature` registrations produce (real repository factories needing a live `DataSource`), regardless of whether anything still injects them once `PermitsService` itself is mocked out. Also override the other four repository tokens with a plain `{}` (nothing calls them — `PermitsService` is already mocked, so they exist purely to satisfy DI construction):
```typescript
      .overrideProvider(getRepositoryToken(PermitRequest))
      .useValue({})
      .overrideProvider(getRepositoryToken(Comm))
      .useValue({})
      .overrideProvider(getRepositoryToken(CountryRequirement))
      .useValue({})
      .overrideProvider(getRepositoryToken(FormTemplate))
      .useValue({})
```
with imports for `PermitRequest`, `Comm`, `CountryRequirement`, `FormTemplate` added alongside the existing `Leg` import. (`getRepositoryToken(Leg)` was already overridden for `LegsModule`'s own use above — that single override also satisfies `PermitsModule`'s separate `forFeature([..., Leg])` registration, since the injection token is keyed by entity class, not by which module's `forFeature` call produced it — no additional `Leg` override needed.)

- [ ] **Step 7: Run the full e2e suite to verify nothing broke**

Run: `cd backend && npx jest --config test/jest-e2e.json`
Expected: PASS (all suites — `legs.e2e-spec.ts`, `permits.e2e-spec.ts`)

- [ ] **Step 8: Commit**

```bash
git add backend/src/permits/permits.service.ts backend/src/legs/legs.controller.ts backend/src/legs/legs.module.ts backend/test/permits.service.spec.ts backend/test/legs.e2e-spec.ts
git commit -m "Wire reconfirm evaluation into PATCH /legs/:id — the ETD-shift trigger"
```

---

### Task 4: Periodic reconfirm sweep — the deadline-passed-unconfirmed trigger

**Files:**
- Create: `backend/src/permits/reconfirm-sweep.service.ts`
- Modify: `backend/src/permits/permits.module.ts`, `backend/src/app.module.ts`, `backend/package.json`
- Test: `backend/test/reconfirm-sweep.service.spec.ts`

**Interfaces:**
- Consumes: `evaluateReconfirm` (Task 2).
- Produces: `ReconfirmSweepService.sweep(): Promise<number>` (returns count of requests flipped) — runs on a 15-minute interval via `@nestjs/schedule`, and is directly callable in tests without waiting on a timer.

- [ ] **Step 1: Add the `@nestjs/schedule` dependency**

Modify `backend/package.json` — add to `dependencies`: `"@nestjs/schedule": "^4.1.1"`. Run:
```bash
cd backend && npm install
```

- [ ] **Step 2: Write the failing test**

`backend/test/reconfirm-sweep.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReconfirmSweepService } from '../src/permits/reconfirm-sweep.service';
import { PermitRequest } from '../src/permits/permit-request.entity';
import { Leg } from '../src/legs/leg.entity';

describe('ReconfirmSweepService', () => {
  let service: ReconfirmSweepService;
  let permitRequestRepo: { find: jest.Mock; save: jest.Mock };
  let legRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    permitRequestRepo = { find: jest.fn(), save: jest.fn(async (entity) => entity) };
    legRepo = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconfirmSweepService,
        { provide: getRepositoryToken(PermitRequest), useValue: permitRequestRepo },
        { provide: getRepositoryToken(Leg), useValue: legRepo },
      ],
    }).compile();
    service = moduleRef.get(ReconfirmSweepService);
  });

  it('flips an unconfirmed request whose RequiredByZ has passed and returns the flip count', async () => {
    permitRequestRepo.find.mockResolvedValue([
      { id: 'pr-1', legId: 'leg-1', status: 'REQUESTED', requiredByZ: new Date('2020-01-01T00:00:00.000Z'), validFrom: null, validTo: null },
    ]);
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', arrDate: new Date('2020-01-05T00:00:00.000Z') });

    const flipped = await service.sweep();

    expect(permitRequestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pr-1', status: 'RECONFIRM_REQUIRED' }),
    );
    expect(flipped).toBe(1);
  });

  it('skips CANCELLED requests entirely and does not query their leg', async () => {
    permitRequestRepo.find.mockResolvedValue([
      { id: 'pr-1', legId: 'leg-1', status: 'CANCELLED', requiredByZ: new Date('2020-01-01T00:00:00.000Z'), validFrom: null, validTo: null },
    ]);

    const flipped = await service.sweep();

    expect(legRepo.findOne).not.toHaveBeenCalled();
    expect(permitRequestRepo.save).not.toHaveBeenCalled();
    expect(flipped).toBe(0);
  });

  it('only queries requests not already RECONFIRM_REQUIRED or CANCELLED', async () => {
    permitRequestRepo.find.mockResolvedValue([]);

    await service.sweep();

    expect(permitRequestRepo.find).toHaveBeenCalledWith({
      where: expect.arrayContaining([
        expect.objectContaining({ status: expect.anything() }),
      ]),
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npx jest test/reconfirm-sweep.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/permits/reconfirm-sweep.service'`

- [ ] **Step 4: Implement ReconfirmSweepService**

`backend/src/permits/reconfirm-sweep.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { PermitRequest } from './permit-request.entity';
import { Leg } from '../legs/leg.entity';
import { evaluateReconfirm } from './reconfirm';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class ReconfirmSweepService {
  private readonly logger = new Logger(ReconfirmSweepService.name);

  constructor(
    @InjectRepository(PermitRequest) private readonly permitRequestRepo: Repository<PermitRequest>,
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async scheduledSweep() {
    const flipped = await this.sweep();
    if (flipped > 0) this.logger.log(`Reconfirm sweep flipped ${flipped} permit request(s).`);
  }

  async sweep(): Promise<number> {
    const requests = await this.permitRequestRepo.find({
      where: [{ status: Not(In(['CANCELLED', 'RECONFIRM_REQUIRED'])) }],
    });

    const now = new Date();
    let flipped = 0;

    for (const request of requests) {
      if (request.status === 'CANCELLED') continue;

      const leg = await this.legRepo.findOne({ where: { id: request.legId } });
      const nextStatus = evaluateReconfirm(request, leg?.arrDate ?? null, now);
      if (nextStatus !== request.status) {
        request.status = nextStatus;
        await this.permitRequestRepo.save(request);
        flipped++;
      }
    }

    return flipped;
  }
}
```

Note: the `if (request.status === 'CANCELLED') continue;` guard is required for Step 2's "skips CANCELLED requests entirely and does not query their leg" test to actually pass — the SQL `where` clause above already excludes `CANCELLED` rows in real usage, but the test drives `permitRequestRepo.find` with a mock that ignores the `where` argument entirely (as mocks do), returning a `CANCELLED` row anyway to exercise the defensive path. Without the explicit continue, the loop would call `legRepo.findOne` for every returned row regardless of status, failing the test's `expect(legRepo.findOne).not.toHaveBeenCalled()`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest test/reconfirm-sweep.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Wire ScheduleModule and ReconfirmSweepService into the app**

Modify `backend/src/permits/permits.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermitRequest } from './permit-request.entity';
import { Comm } from './comm.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { PermitsService } from './permits.service';
import { PermitsController } from './permits.controller';
import { ReconfirmSweepService } from './reconfirm-sweep.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PermitRequest, Comm, Leg, CountryRequirement, FormTemplate]),
    MailModule,
  ],
  providers: [PermitsService, ReconfirmSweepService],
  controllers: [PermitsController],
  exports: [PermitsService],
})
export class PermitsModule {}
```

Modify `backend/src/app.module.ts` — add the import and register `ScheduleModule.forRoot()`:
```typescript
import { ScheduleModule } from '@nestjs/schedule';
```
```typescript
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
```
(add `ScheduleModule.forRoot()` as a new line directly after `ConfigModule.forRoot({ isGlobal: true }),` in the `imports` array).

- [ ] **Step 7: Verify the backend still builds and boots**

Run:
```bash
cd backend
npm run build
```
Expected: compiles with no errors. (Full boot-with-live-scheduler verification happens in Task 9's end-to-end check.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/permits/reconfirm-sweep.service.ts backend/src/permits/permits.module.ts backend/src/app.module.ts backend/package.json backend/package-lock.json backend/test/reconfirm-sweep.service.spec.ts
git commit -m "Add periodic reconfirm sweep — the deadline-passed-unconfirmed trigger"
```

---

### Task 5: Action Board — all permit requests with computed urgency

**Files:**
- Modify: `backend/src/permits/permits.service.ts`, `backend/src/permits/permits.controller.ts`
- Test: `backend/test/permits.service.spec.ts`, `backend/test/permits.e2e-spec.ts`

**Interfaces:**
- Consumes: `computeUrgency` (`backend/src/permits/permit-deadline.ts`, existing).
- Produces: `PermitsService.findAllWithUrgency(): Promise<Array<PermitRequest & { urgency: Urgency; legSummary: { tripNo: string; icao: string; tail: string | null } }>>`, `GET /permit-requests` (200, array, JWT-protected). Task 6 (frontend) consumes this shape.

- [ ] **Step 1: Write the failing test**

Add to `backend/test/permits.service.spec.ts`:
```typescript
  it('findAllWithUrgency joins each request to its leg summary and computed urgency', async () => {
    permitRequestRepo.find.mockResolvedValue([
      {
        id: 'pr-1',
        legId: 'leg-1',
        country: 'Egypt',
        status: 'REQUESTED',
        requiredByZ: new Date(Date.now() - 3_600_000), // 1h ago -> BREACH
      },
    ]);
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', tripNo: '482421', icao: 'HECA', tail: 'N148B' });

    const result = await service.findAllWithUrgency();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'pr-1',
        urgency: 'BREACH',
        legSummary: { tripNo: '482421', icao: 'HECA', tail: 'N148B' },
      }),
    ]);
  });

  it('findAllWithUrgency reports OK urgency for a request with no requiredByZ set', async () => {
    permitRequestRepo.find.mockResolvedValue([
      { id: 'pr-1', legId: 'leg-1', country: 'Egypt', status: 'NOT_STARTED', requiredByZ: null },
    ]);
    legRepo.findOne.mockResolvedValue({ id: 'leg-1', tripNo: '482421', icao: 'HECA', tail: 'N148B' });

    const result = await service.findAllWithUrgency();

    expect(result[0].urgency).toBe('OK');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: FAIL — `service.findAllWithUrgency is not a function`

- [ ] **Step 3: Implement findAllWithUrgency**

Modify `backend/src/permits/permits.service.ts` — add the import and method:
```typescript
import { computeUrgency } from './permit-deadline';
```
```typescript
  async findAllWithUrgency() {
    const requests = await this.permitRequestRepo.find();
    const now = new Date().toISOString();

    const withUrgency = [];
    for (const request of requests) {
      const leg = await this.legRepo.findOne({ where: { id: request.legId } });
      const urgency = request.requiredByZ ? computeUrgency(request.requiredByZ.toISOString(), now) : 'OK';
      withUrgency.push({
        ...request,
        urgency,
        legSummary: leg ? { tripNo: leg.tripNo, icao: leg.icao, tail: leg.tail } : null,
      });
    }
    return withUrgency;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Write the failing e2e test**

Add to `backend/test/permits.e2e-spec.ts`:
```typescript
  it('GET /permit-requests returns all requests with urgency and leg summary', async () => {
    permitRequestRepo.find.mockResolvedValue([
      { id: 'pr-1', legId: 'leg-1', country: 'Egypt', status: 'REQUESTED', requiredByZ: null },
    ]);

    const response = await request(app.getHttpServer()).get('/permit-requests');

    expect(response.status).toBe(200);
    expect(response.body[0]).toEqual(expect.objectContaining({ id: 'pr-1', urgency: 'OK' }));
  });
```
(The `legRepo.findOne` mock already configured earlier in this test file's `beforeAll` resolves to a leg — reused here.)

- [ ] **Step 6: Add the GET /permit-requests route**

Modify `backend/src/permits/permits.controller.ts` — add the route (order matters: register before `legs/:legId/permit-requests` is irrelevant since the paths don't collide, but place it near the other permit-requests routes):
```typescript
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermitsService } from './permits.service';
import { CreatePermitRequestDto } from './dto/create-permit-request.dto';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class PermitsController {
  constructor(private readonly permitsService: PermitsService) {}

  @Post('legs/:legId/permit-requests')
  create(@Param('legId') legId: string, @Body() dto: CreatePermitRequestDto) {
    return this.permitsService.create(legId, dto.country);
  }

  @Get('legs/:legId/permit-requests')
  findByLeg(@Param('legId') legId: string) {
    return this.permitsService.findByLeg(legId);
  }

  @Get('permit-requests')
  findAllWithUrgency() {
    return this.permitsService.findAllWithUrgency();
  }

  @Patch('permit-requests/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePermitRequestDto) {
    return this.permitsService.update(id, dto);
  }
}
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `cd backend && npx jest test/permits.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/src/permits/permits.service.ts backend/src/permits/permits.controller.ts backend/test/permits.service.spec.ts backend/test/permits.e2e-spec.ts
git commit -m "Add GET /permit-requests — all requests with computed urgency, for the Action Board"
```

---

### Task 6: Frontend — Action Board

**Files:**
- Create: `frontend/src/app/action-board/page.tsx`
- Modify: `frontend/src/lib/api-client.ts` (add `listAllPermitRequests`, `updateLeg`), `frontend/src/app/globals.css`, `frontend/src/app/legs/page.tsx` (nav link)
- Test: `frontend/test/action-board.test.tsx`

**Interfaces:**
- Consumes: `GET /permit-requests` (Task 5).
- Produces: `listAllPermitRequests(token): Promise<PermitRequestWithUrgency[]>` in `api-client.ts`. Route `/action-board`.

- [ ] **Step 1: Write the failing test for the api-client function**

Add to `frontend/test/api-client.test.ts`:
```typescript
  it('listAllPermitRequests fetches every permit request with urgency', async () => {
    const requests = [{ id: 'pr-1', legId: '1', country: 'Egypt', status: 'REQUESTED', urgency: 'BREACH', legSummary: { tripNo: '482421', icao: 'HECA', tail: 'N148B' } }];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => requests });

    const result = await listAllPermitRequests('token-123');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/permit-requests'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(requests);
  });
```
Add `listAllPermitRequests` to the top-of-file import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: FAIL — `listAllPermitRequests is not a function`

- [ ] **Step 3: Implement listAllPermitRequests**

Modify `frontend/src/lib/api-client.ts` — add after `updatePermitRequest`:
```typescript
export interface PermitRequestWithUrgency extends PermitRequest {
  urgency: 'BREACH' | 'URGENT' | 'DUE' | 'OK';
  legSummary: { tripNo: string; icao: string; tail: string | null } | null;
}

export async function listAllPermitRequests(token: string): Promise<PermitRequestWithUrgency[]> {
  const response = await fetch(`${API_URL}/permit-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load permit requests');
  return response.json();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Write the failing test for the Action Board page**

`frontend/test/action-board.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as apiClient from '../src/lib/api-client';
import ActionBoardPage from '../src/app/action-board/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, listAllPermitRequests: vi.fn() };
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return { ...actual, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) };
});

describe('ActionBoardPage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it('renders each request with its urgency and trip summary, most severe first', async () => {
    vi.mocked(apiClient.listAllPermitRequests).mockResolvedValue([
      { id: 'pr-ok', legId: '1', country: 'Kenya', status: 'REQUESTED', urgency: 'OK', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, legSummary: { tripNo: '999999', icao: 'HKJK', tail: 'N1' } },
      { id: 'pr-breach', legId: '2', country: 'Egypt', status: 'REQUESTED', urgency: 'BREACH', requiredByZ: null, validFrom: null, validTo: null, clearanceNumber: null, legSummary: { tripNo: '482421', icao: 'HECA', tail: 'N148B' } },
    ]);

    render(<ActionBoardPage />);

    await waitFor(() => expect(screen.getByText('BREACH')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    // header row + BREACH row before OK row
    expect(rows[1]).toHaveTextContent('482421');
    expect(rows[2]).toHaveTextContent('999999');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/action-board.test.tsx`
Expected: FAIL — `Cannot find module '../src/app/action-board/page'`

- [ ] **Step 7: Implement the Action Board page**

`frontend/src/app/action-board/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listAllPermitRequests, type PermitRequestWithUrgency } from '@/lib/api-client';

const URGENCY_ORDER: Record<PermitRequestWithUrgency['urgency'], number> = {
  BREACH: 0,
  URGENT: 1,
  DUE: 2,
  OK: 3,
};

function sortKey(r: PermitRequestWithUrgency): number {
  if (r.status === 'RECONFIRM_REQUIRED') return -1;
  return URGENCY_ORDER[r.urgency];
}
```

Note: `URGENCY_ORDER` must **not** include a `RECONFIRM_REQUIRED` key — `PermitRequestWithUrgency['urgency']` is `'BREACH' | 'URGENT' | 'DUE' | 'OK'` (a `Comm`-adjacent status value never appears there; `RECONFIRM_REQUIRED` is a `PermitRequest.status`, a separate field), so `Record<..., number>` with that extra key is a real TypeScript error (`Object literal may only specify known properties`), not just dead weight. `sortKey` already checks `r.status === 'RECONFIRM_REQUIRED'` first and returns before ever touching the map, so the entry was never reachable anyway.

```tsx
export default function ActionBoardPage() {
  const [requests, setRequests] = useState<PermitRequestWithUrgency[]>([]);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    listAllPermitRequests(token)
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [router]);

  const sorted = [...requests].sort((a, b) => sortKey(a) - sortKey(b));

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — Action Board</h1>
        <a className="btn-link" href="/legs">
          Back to legs
        </a>
      </div>
      <div className="runway-rule" />
      <div className="board-table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th>Trip No</th>
              <th>ICAO</th>
              <th>Country</th>
              <th>Status</th>
              <th>Urgency</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="col-mono">
                  <a href={`/legs/${r.legId}`}>{r.legSummary?.tripNo ?? r.legId}</a>
                </td>
                <td className="col-mono">{r.legSummary?.icao}</td>
                <td>{r.country}</td>
                <td>{r.status}</td>
                <td>
                  <span className={`urgency-badge urgency-${r.urgency.toLowerCase()}`}>{r.urgency}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add urgency badge CSS**

Modify `frontend/src/app/globals.css` — append:
```css
.urgency-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.urgency-breach {
  background: rgba(255, 107, 87, 0.15);
  color: var(--danger);
}

.urgency-urgent {
  background: rgba(255, 176, 32, 0.15);
  color: var(--accent);
}

.urgency-due {
  background: rgba(124, 135, 148, 0.15);
  color: var(--ink);
}

.urgency-ok {
  color: var(--muted);
}
```

- [ ] **Step 9: Link the Action Board from the Legs list**

Modify `frontend/src/app/legs/page.tsx` — add a link in `.board-header-right`, before the "+ New leg" link:
```tsx
          <a className="btn-link" href="/action-board">
            Action board
          </a>
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/action-board.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 11: Run the full frontend suite and the build**

Run:
```bash
cd frontend
npx vitest run
npm run build
```
Expected: all tests PASS, build succeeds, `/action-board` listed in the route output.

Real bug surfaced here, not by this task's own new tests but by broader coverage: running the *full* suite (not just `action-board.test.tsx` in isolation) triggers an unhandled promise rejection from `leg-detail.test.tsx` — that test renders the full `LegDetailPage` tree, which mounts `PermitRequests` (from the permit-request-workflow plan), and its `refresh()` function had no `.catch()` on `listPermitRequests(...)`. `leg-detail.test.tsx` doesn't mock `listPermitRequests` (only `getLeg`/`getLegs`), so the composer's real `fetch()` call fails against no live server, and with no catch that becomes an unhandled rejection — a latent bug in already-shipped code, not something this task introduced, just never exercised by a full-suite run until now. Fix `frontend/src/app/legs/[id]/permit-requests.tsx`'s `refresh()`:
```typescript
  function refresh() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return Promise.resolve();
    return listPermitRequests(token, legId)
      .then(setRequests)
      .catch(() => setRequests([]));
  }
```
(adding the `.catch(() => setRequests([]))`, matching the pattern already used elsewhere in the app, e.g. `legs/page.tsx`'s `getLegs(token).then(setLegs).catch(...)`).

- [ ] **Step 12: Commit**

```bash
git add frontend/src/app/action-board frontend/src/lib/api-client.ts frontend/src/app/globals.css frontend/src/app/legs/page.tsx frontend/test/action-board.test.tsx frontend/test/api-client.test.ts
git commit -m "Add Action Board — every permit request sorted by urgency, RECONFIRM_REQUIRED first"
```

---

### Task 7: Correlation token parsing — pure function

**Files:**
- Create: `backend/src/mail/correlation-token.ts`
- Test: `backend/test/correlation-token.spec.ts`

**Interfaces:**
- Produces: `parseCorrelationToken(subject: string): { legId: number; permitRequestId: string } | null`. Task 8 calls this exact function.

- [ ] **Step 1: Write the failing tests**

`backend/test/correlation-token.spec.ts`:
```typescript
import { parseCorrelationToken } from '../src/mail/correlation-token';

describe('parseCorrelationToken', () => {
  it('extracts legId and permitRequestId from a subject carrying the token', () => {
    const subject = 'RE: Permit Request — Trip 482421 — Egypt [149/5c8f18b2-9f30-4438-a51e-aac332077443]';

    expect(parseCorrelationToken(subject)).toEqual({
      legId: 149,
      permitRequestId: '5c8f18b2-9f30-4438-a51e-aac332077443',
    });
  });

  it('returns null when the subject carries no token', () => {
    expect(parseCorrelationToken('Re: hello')).toBeNull();
  });

  it('returns null when the bracketed content is not a well-formed token', () => {
    expect(parseCorrelationToken('Re: something [not-a-token]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/correlation-token.spec.ts`
Expected: FAIL — `Cannot find module '../src/mail/correlation-token'`

- [ ] **Step 3: Implement parseCorrelationToken**

`backend/src/mail/correlation-token.ts`:
```typescript
const TOKEN_PATTERN = /\[(\d+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

export function parseCorrelationToken(subject: string): { legId: number; permitRequestId: string } | null {
  const match = subject.match(TOKEN_PATTERN);
  if (!match) return null;
  return { legId: Number(match[1]), permitRequestId: match[2] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/correlation-token.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/mail/correlation-token.ts backend/test/correlation-token.spec.ts
git commit -m "Add parseCorrelationToken for inbound reply matching"
```

---

### Task 8: IMAP inbound worker + manual "file this email" fallback

**Files:**
- Create: `backend/src/mail/imap.service.ts`
- Modify: `backend/src/mail/mail.module.ts`, `backend/src/permits/permits.service.ts`, `backend/src/permits/permits.controller.ts`, `backend/package.json`, `backend/.env.example`
- Test: `backend/test/imap.service.spec.ts`, `backend/test/permits.service.spec.ts`, `backend/test/permits.e2e-spec.ts`

**Interfaces:**
- Consumes: `parseCorrelationToken` (Task 7).
- Produces: `ImapService.pollInbox(): Promise<{ filed: number; skipped: number }>` (dry-run fallback when `IMAP_HOST` is unset, matching `MailService`), `PermitsService.addManualComm(permitRequestId: string, input: { fromAddress: string; subject: string; body: string }): Promise<Comm>`, `POST /permit-requests/:id/comms` (201).

- [ ] **Step 1: Add the `imapflow` and `mailparser` dependencies**

Modify `backend/package.json` — add to `dependencies`: `"imapflow": "^1.0.167"`, `"mailparser": "^3.7.1"`; add to `devDependencies`: `"@types/mailparser": "^3.4.4"`. Run:
```bash
cd backend && npm install
```

Modify `backend/.env.example` — append:
```
IMAP_HOST=
IMAP_PORT=993
IMAP_USER=
IMAP_PASS=
IMAP_SECURE=true
```

- [ ] **Step 2: Write the failing test for PermitsService.addManualComm**

Add to `backend/test/permits.service.spec.ts`:
```typescript
  it('addManualComm files an inbound reply against a permit request', async () => {
    permitRequestRepo.findOne.mockResolvedValue({ id: 'pr-1', legId: 'leg-1', correlationToken: '149/pr-1' });

    const result = await service.addManualComm('pr-1', {
      fromAddress: 'permits.eg@example.com',
      subject: 'RE: Permit Request',
      body: 'Clearance confirmed, number EG-4471.',
    });

    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'INBOUND',
        legId: 'leg-1',
        permitRequestId: 'pr-1',
        kind: 'REQUEST',
        fromAddress: 'permits.eg@example.com',
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 'comm-1' }));
  });

  it('addManualComm throws NotFoundException for an unknown permit request', async () => {
    permitRequestRepo.findOne.mockResolvedValue(null);

    await expect(
      service.addManualComm('missing', { fromAddress: 'x@example.com', subject: 's', body: 'b' }),
    ).rejects.toThrow(NotFoundException);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: FAIL — `service.addManualComm is not a function`

- [ ] **Step 4: Implement addManualComm**

Modify `backend/src/permits/permits.service.ts` — add the method (append inside the class, after `reconcileForLeg`):
```typescript
  async addManualComm(
    permitRequestId: string,
    input: { fromAddress: string; subject: string; body: string },
  ): Promise<Comm> {
    const permitRequest = await this.permitRequestRepo.findOne({ where: { id: permitRequestId } });
    if (!permitRequest) throw new NotFoundException(`PermitRequest ${permitRequestId} not found`);

    return this.commRepo.save(
      this.commRepo.create({
        direction: 'INBOUND',
        legId: permitRequest.legId,
        permitRequestId,
        correlationToken: permitRequest.correlationToken,
        fromAddress: input.fromAddress,
        toAddress: process.env.SMTP_FROM ?? '',
        subject: input.subject,
        body: input.body,
        kind: 'REQUEST',
        sentAt: new Date(),
      }),
    );
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest test/permits.service.spec.ts`
Expected: PASS (15 tests)

- [ ] **Step 6: Add the POST /permit-requests/:id/comms route**

Add to `backend/src/permits/dto/create-permit-request.dto.ts`'s file a sibling DTO — create `backend/src/permits/dto/create-comm.dto.ts`:
```typescript
import { IsString } from 'class-validator';

export class CreateCommDto {
  @IsString()
  fromAddress: string;

  @IsString()
  subject: string;

  @IsString()
  body: string;
}
```

Modify `backend/src/permits/permits.controller.ts` — add the import and route:
```typescript
import { CreateCommDto } from './dto/create-comm.dto';
```
```typescript
  @Post('permit-requests/:id/comms')
  addManualComm(@Param('id') id: string, @Body() dto: CreateCommDto) {
    return this.permitsService.addManualComm(id, dto);
  }
```

- [ ] **Step 7: Write the failing e2e test**

Add to `backend/test/permits.e2e-spec.ts`:
```typescript
  it('POST /permit-requests/:id/comms files a manual inbound reply', async () => {
    permitRequestRepo.findOne.mockResolvedValue({ id: 'pr-1', legId: 'leg-1', correlationToken: '149/pr-1' });

    const response = await request(app.getHttpServer())
      .post('/permit-requests/pr-1/comms')
      .send({ fromAddress: 'permits.eg@example.com', subject: 'RE: Permit', body: 'Confirmed.' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ direction: 'INBOUND' }));
  });
```

- [ ] **Step 8: Run the e2e test to verify it passes**

Run: `cd backend && npx jest test/permits.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (6 tests)

- [ ] **Step 9: Write the failing test for ImapService**

`backend/test/imap.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { ImapService } from '../src/mail/imap.service';
import { PermitsService } from '../src/permits/permits.service';

describe('ImapService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('dry-runs (no connection attempt) when IMAP_HOST is not configured', async () => {
    delete process.env.IMAP_HOST;
    const addManualComm = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [ImapService, { provide: PermitsService, useValue: { addManualComm } }],
    }).compile();
    const service = moduleRef.get(ImapService);

    const result = await service.pollInbox();

    expect(result).toEqual({ filed: 0, skipped: 0 });
    expect(addManualComm).not.toHaveBeenCalled();
  });

  it('files a message whose subject carries a matching correlation token', async () => {
    process.env.IMAP_HOST = 'imap.example.com';
    const addManualComm = jest.fn().mockResolvedValue({ id: 'comm-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [ImapService, { provide: PermitsService, useValue: { addManualComm } }],
    }).compile();
    const service = moduleRef.get(ImapService);

    const fakeClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([42]),
      fetchOne: jest.fn().mockResolvedValue({
        envelope: {
          subject: 'RE: Permit Request — Trip 482421 — Egypt [149/5c8f18b2-9f30-4438-a51e-aac332077443]',
          from: [{ address: 'permits.eg@example.com' }],
        },
        source: Buffer.from('body text'),
      }),
      messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
    };
    (service as any).client = fakeClient;

    const result = await service.pollInbox();

    expect(addManualComm).toHaveBeenCalledWith(
      '5c8f18b2-9f30-4438-a51e-aac332077443',
      expect.objectContaining({ fromAddress: 'permits.eg@example.com' }),
    );
    expect(result).toEqual({ filed: 1, skipped: 0 });
  });

  it('leaves an unmatched message for the manual "file this email" fallback', async () => {
    process.env.IMAP_HOST = 'imap.example.com';
    const addManualComm = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [ImapService, { provide: PermitsService, useValue: { addManualComm } }],
    }).compile();
    const service = moduleRef.get(ImapService);

    const fakeClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      mailboxOpen: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([43]),
      fetchOne: jest.fn().mockResolvedValue({
        envelope: { subject: 'Out of office', from: [{ address: 'someone@example.com' }] },
        source: Buffer.from('body text'),
      }),
      messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
    };
    (service as any).client = fakeClient;

    const result = await service.pollInbox();

    expect(addManualComm).not.toHaveBeenCalled();
    expect(result).toEqual({ filed: 0, skipped: 1 });
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `cd backend && npx jest test/imap.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/mail/imap.service'`

- [ ] **Step 11: Implement ImapService**

`backend/src/mail/imap.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { PermitsService } from '../permits/permits.service';
import { parseCorrelationToken } from './correlation-token';

@Injectable()
export class ImapService {
  private readonly logger = new Logger(ImapService.name);
  private readonly client: ImapFlow | null;

  constructor(private readonly permitsService: PermitsService) {
    this.client = process.env.IMAP_HOST
      ? new ImapFlow({
          host: process.env.IMAP_HOST,
          port: Number(process.env.IMAP_PORT ?? 993),
          secure: process.env.IMAP_SECURE !== 'false',
          auth: { user: process.env.IMAP_USER ?? '', pass: process.env.IMAP_PASS ?? '' },
          logger: false,
        })
      : null;
  }

  async pollInbox(): Promise<{ filed: number; skipped: number }> {
    if (!this.client) {
      this.logger.warn('IMAP not configured — dry-run only. Skipping inbound poll.');
      return { filed: 0, skipped: 0 };
    }

    await this.client.connect();
    let filed = 0;
    let skipped = 0;

    try {
      await this.client.mailboxOpen('INBOX');
      const uids = await this.client.search({ seen: false });

      for (const uid of uids) {
        const message = await this.client.fetchOne(String(uid), { envelope: true, source: true });
        const subject = message.envelope?.subject ?? '';
        const token = parseCorrelationToken(subject);

        if (token) {
          await this.permitsService.addManualComm(token.permitRequestId, {
            fromAddress: message.envelope?.from?.[0]?.address ?? '',
            subject,
            body: message.source?.toString() ?? '',
          });
          filed++;
        } else {
          skipped++;
        }

        await this.client.messageFlagsAdd(String(uid), ['\\Seen']);
      }
    } finally {
      await this.client.logout();
    }

    return { filed, skipped };
  }
}
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `cd backend && npx jest test/imap.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 13: Wire the periodic poll and export ImapService**

Modify `backend/src/mail/mail.module.ts`:
```typescript
import { Module, forwardRef } from '@nestjs/common';
import { MailService } from './mail.service';
import { ImapService } from './imap.service';
import { PermitsModule } from '../permits/permits.module';

@Module({
  imports: [forwardRef(() => PermitsModule)],
  providers: [MailService, ImapService],
  exports: [MailService, ImapService],
})
export class MailModule {}
```

Note: `MailModule` now needs `PermitsService` (for `ImapService`'s constructor), and `PermitsModule` already imports `MailModule` (permit-request-workflow plan, Task 6, for `MailService`) — that's a real circular module dependency, unlike the false alarm noted in Task 3. `forwardRef(() => PermitsModule)` here, paired with `forwardRef(() => MailModule)` on `PermitsModule`'s existing `MailModule` import, resolves it. Modify `backend/src/permits/permits.module.ts`'s existing import line:
```typescript
import { forwardRef, Module } from '@nestjs/common';
```
and change `MailModule` to `forwardRef(() => MailModule)` inside the `imports` array:
```typescript
    forwardRef(() => MailModule),
```
(replacing the plain `MailModule` that was already there from the permit-request-workflow plan).

Add the periodic poll — create a small wrapper since `ImapService.pollInbox` itself has no `@Interval`: add to `backend/src/mail/imap.service.ts`, inside the `ImapService` class:
```typescript
import { Interval } from '@nestjs/schedule';
```
```typescript
  @Interval(15 * 60 * 1000)
  async scheduledPoll() {
    const { filed, skipped } = await this.pollInbox();
    if (filed > 0 || skipped > 0) {
      this.logger.log(`Inbound poll: filed ${filed}, skipped ${skipped} (unmatched, needs manual filing).`);
    }
  }
```

- [ ] **Step 14: Run the full backend test suite and build**

Run:
```bash
cd backend
npx jest
npx jest --config test/jest-e2e.json
npm run build
```
Expected: all PASS, build succeeds.

- [ ] **Step 15: Commit**

```bash
git add backend/src/mail backend/src/permits/permits.service.ts backend/src/permits/permits.controller.ts backend/src/permits/dto/create-comm.dto.ts backend/src/permits/permits.module.ts backend/package.json backend/package-lock.json backend/.env.example backend/test/imap.service.spec.ts backend/test/permits.service.spec.ts backend/test/permits.e2e-spec.ts
git commit -m "Add IMAP inbound worker with dry-run fallback, and the manual file-this-email endpoint"
```

---

### Task 9: End-to-end smoke check against the real seeded stack

**Files:** none (verification-only task)

- [ ] **Step 1: Bring up the full stack fresh and run every migration + seed script**

Run:
```bash
docker compose down -v
docker compose up --build -d
cd backend
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npm run seed -- "C:/Backups/InsiderTechSol/Aviation/uaa/UAA_Coordinator_v5.xlsm"
DATABASE_URL="postgres://uaa:uaa@localhost:5432/uaa" npm run seed:country-requirements
```
Expected: same 6 migrations as the permit-request-workflow plan's Task 10 (this plan adds no new tables), both seed scripts report the same real counts.

- [ ] **Step 2: Confirm the scheduler booted without a live IMAP/SMTP connection**

```bash
docker compose logs backend --tail 20
```
Expected: `Nest application successfully started` with no crash — confirms `ScheduleModule.forRoot()` and both `@Interval` jobs registered cleanly even with `IMAP_HOST`/`SMTP_HOST` unset.

- [ ] **Step 3: Move a leg's ETD outside an already-confirmed permit's validity window and confirm the immediate flip**

Using a real seeded coordinator's token and a real leg id, first create and confirm a permit request (mirrors the permit-request-workflow plan's Task 10 flow), then:
```bash
curl -s -X PATCH http://localhost:3011/legs/<leg-id> -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"arrDate":"2027-01-01T00:00:00.000Z"}'
curl -s http://localhost:3011/legs/<leg-id>/permit-requests -H "Authorization: Bearer <token>"
```
Expected: the second call's `status` is now `"RECONFIRM_REQUIRED"` — confirms `reconcileForLeg` actually ran off the real `PATCH /legs/:id` call, not just in the unit test's mocked repos.

- [ ] **Step 4: Confirm the Action Board reflects it**

Visit `http://localhost:3012/action-board`, confirm the leg from Step 3 appears at the top (status `RECONFIRM_REQUIRED` sorts first regardless of urgency).

- [ ] **Step 5: File a manual inbound reply and confirm it's on the Comms ledger**

```bash
curl -s -X POST http://localhost:3011/permit-requests/<permit-request-id>/comms -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"fromAddress":"permits.eg@example.com","subject":"RE: Permit Request","body":"Reconfirmed, still valid."}'
docker compose exec postgres psql -U uaa -d uaa -c "SELECT direction, kind, from_address FROM comms WHERE permit_request_id = '<permit-request-id>' ORDER BY created_at DESC LIMIT 1;"
```
Expected: `201` response with `direction: "INBOUND"`; the `psql` query shows the same row.

- [ ] **Step 6: No commit for this task** — it's verification only. If anything fails, fix it in the task that owns the broken piece and re-run this check.

---

## Self-Review

**1. Spec coverage** — this plan implements exactly Build Sequencing item 3 ("`RequiredByZ`/`ValidFrom`/`ValidTo` tracking, re-confirm invalidation, Action Board, IMAP inbound worker + correlation matching"). Both flip conditions from the Permit workflow section (step 5) are implemented and unit-tested independently of their triggers (`evaluateReconfirm`, Task 2), then wired to both the event-driven trigger (Task 3, `PATCH /legs/:id`) and the time-based trigger (Task 4, periodic sweep) the spec's own wording implies are both needed ("later moves" = event-driven; "passes its deadline" = time-based, nothing else causes it). The Action Board (Task 5-6) and IMAP worker + correlation matching + manual fallback (Task 7-8) are both explicitly named in the same Build Sequencing item and covered.

**2. Placeholder scan** — no TBD/TODO/"add error handling"/"similar to Task N" found. The one narrower scope decision (no frontend UI for browsing/filing unmatched inbound messages) is flagged explicitly in Explicitly Deferred, with the backend capability that a future task would build that UI against already shipped and tested in Task 8.

**3. Type consistency** — checked field names and signatures across every consumer: `evaluateReconfirm`'s `ReconfirmInput` (Task 2) matches the exact fields `PermitRequest` (already exists) and `ReconfirmSweepService.sweep` (Task 4) pass it; `PermitsService.reconcileForLeg`'s signature (Task 3) matches what `LegsController.update` (Task 1, modified in Task 3) calls; `findAllWithUrgency`'s returned shape (`urgency`, `legSummary: { tripNo, icao, tail }`) matches the frontend `PermitRequestWithUrgency` interface (Task 6) field-for-field; `parseCorrelationToken`'s return shape (`{ legId, permitRequestId }`, Task 7) matches how `ImapService.pollInbox` (Task 8) destructures it — note `pollInbox` only actually uses `token.permitRequestId` (correlation matching resolves the request directly by its own id; `legId` is carried through for potential future use, e.g. a stricter cross-check that the resolved `PermitRequest.legId` matches, which this plan does not add since the spec doesn't call for it beyond "matches the token" — `addManualComm` already 404s if the id doesn't resolve to a real request, which is the failure mode that matters). One real cross-module dependency issue caught during self-review and fixed in Task 8 Step 13: `PermitsModule` already imports `MailModule` (for `MailService`, from the permit-request-workflow plan), and this plan's `MailModule` needs `PermitsService` (for `ImapService`) — a genuine circular module dependency requiring `forwardRef()` on both sides, not the false-alarm kind noted in Task 3 (where `PermitsModule`'s entity-only `Leg` registration doesn't actually depend on `LegsModule`).

---

Plan complete and saved to `docs/superpowers/plans/2026-08-23-permit-tracking-and-inbound.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
