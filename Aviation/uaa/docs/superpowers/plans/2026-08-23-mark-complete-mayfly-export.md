# Mark Complete & MAYFLY Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the last two features from the design spec's Build Sequencing (item 5): a "Mark Complete" action per leg that flips it into a completed state without removing it from the Legs list, and an on-demand "Download Completed Missions (Excel)" export in MAYFLY's exact column order for a coordinator-selected date range.

**Architecture:** A nullable `completedAt` timestamp on `Leg` is the single source of truth for completion state — set by a new `POST /legs/:id/complete` action, left alone everywhere else. A pure `mayfly-export.ts` module (no DB/HTTP dependencies) maps a `Leg` back into MAYFLY's real 42-column layout and writes a real `.xlsx` buffer via the `xlsx` package (already a dependency — no new packages needed), which a new `GET /legs/export?from=&to=` route streams back as a file download. Frontend gets a "Mark Complete" control on the leg detail page, a "Completed" status badge on the Legs list, and a date-range export control that turns the authenticated fetch response into a browser file download.

**Tech Stack:** NestJS 10 + TypeORM 0.3 (existing), `xlsx` (already a dependency, used today only for *reading* the seed workbook — this plan is its first *write* use), Next.js 14 App Router (existing), Jest (backend), Vitest + React Testing Library (frontend) — same stack as Slices 1-4, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-uaa-webapp-design.md`

## Global Constraints

- Every table/column addition follows existing convention — no new tables this plan, just one nullable column on `legs`.
- Single coordinator role — no RBAC (Spec: Scope). The new endpoints sit behind the existing `JwtAuthGuard`.
- "Mark Complete... without deleting it from the active view" (Spec: Billing/MAYFLY export) is implemented literally: completed legs stay in the `GET /legs` list and response — no filtering, no soft-delete, no separate archive table. This is a deliberate divergence from the Excel macro's `ArchivePastOps` (transcribed from `mod_Archive.bas` for this plan — see below), which physically deletes the row from `MAYFLY` and pastes it into a separate `PAST OPS` sheet. The spec explicitly frames "Mark Complete" as improving on that destructive behavior, not reproducing it.
- The export's column order and headers are the real 42 `MAYFLY` sheet headers (row 1 of the live workbook, read for this plan via `openpyxl`), in the same order the existing `seed-from-excel.ts` already reads them in — not invented or reordered.
- Export date range filters on `Leg.completedAt` (inclusive both ends) — the feature is literally named "Download **Completed** Missions," and `completedAt` is the one field that directly answers "was this leg completed, and when."

## Explicitly Deferred (not this plan)

- **Scheduled/automatic nightly export** — spec's own words: "Deferred to a later phase: a scheduled/automatic nightly export job. Phase 1 is on-demand only." This plan implements only the on-demand endpoint.
- **`PAST OPS` sheet / row-archival semantics** — superseded by the spec's own design (a status flag, not a row move). No `PAST OPS`-equivalent table.
- **`RefreshDashboard`** (`mod_Archive.bas`'s other macro, populating the Excel `DASHBOARD` sheet's "Today's Departures"/"This Week's Departures" panels) — the `DASHBOARD` sheet has no equivalent anywhere in the design spec's Data model or Build Sequencing; out of scope for this project entirely, not just this slice.
- **Invoice generation, tax handling, or provider-cost linkage** — spec's own Explicitly out of scope list: `Legs` already carries the flat billing fields the workbook has (`agentExpenses`/`readyToBill`/`invoiceReceived`/`a2gInvoiceNumber`/`billingMonth`); this plan exports them as-is, adds no new billing logic.
- **Un-marking a leg complete** — the spec describes only a one-way "Mark Complete" action; no requirement or use case for reverting it is named. If a coordinator marks the wrong leg, direct DB correction (matching how no other flow in this app has an "undo" either) is the fallback until a real need is demonstrated.

---

## File Structure

```
backend/
├── src/
│   ├── legs/
│   │   ├── leg.entity.ts                     # modify: add completedAt
│   │   ├── legs.service.ts                   # modify: add markComplete, findCompletedInRange, exportMayflyBuffer
│   │   ├── legs.controller.ts                # modify: add POST :id/complete, GET export
│   │   ├── mayfly-export.ts                  # new: pure legToMayflyRow()/buildMayflyWorkbook()
│   │   └── dto/export-legs-query.dto.ts       # new
│   └── database/
└── migrations/
    └── <ts>-AddCompletedAtToLegs.ts           # new

test/
├── legs.service.spec.ts                       # modify: markComplete/findCompletedInRange/exportMayflyBuffer tests
├── legs.e2e-spec.ts                            # modify: POST :id/complete, GET export tests
└── mayfly-export.spec.ts                       # new

frontend/
├── src/
│   ├── app/legs/
│   │   ├── page.tsx                           # modify: Status column + export toolbar
│   │   └── [id]/page.tsx                      # modify: Mark Complete button / Completed badge
│   ├── app/globals.css                        # modify: completed badge + export toolbar styles
│   └── lib/api-client.ts                      # modify: markLegComplete, downloadCompletedMissions
└── test/
    ├── api-client.test.ts                     # modify
    ├── leg-detail.test.tsx                    # modify
    └── legs-list.test.tsx                     # modify
```

---

### Task 1: `completedAt` column on `Leg`

**Files:**
- Modify: `backend/src/legs/leg.entity.ts`
- Create: `backend/migrations/1756166400000-AddCompletedAtToLegs.ts`

**Interfaces:**
- Produces: `Leg.completedAt: Date | null`. Task 2's `markComplete` sets it; Task 4's `findCompletedInRange` filters on it.

- [ ] **Step 1: Add the column to the entity**

Modify `backend/src/legs/leg.entity.ts` — add after the `intelStatus` column (before `createdAt`):
```typescript
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
```

- [ ] **Step 2: Create the migration**

`backend/migrations/1756166400000-AddCompletedAtToLegs.ts`:
```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCompletedAtToLegs1756166400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'legs',
      new TableColumn({ name: 'completed_at', type: 'timestamptz', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('legs', 'completed_at');
  }
}
```

- [ ] **Step 3: Verify the backend still builds**

Run: `cd backend && npm run build`
Expected: compiles with no errors. (The migration itself runs for real in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/legs/leg.entity.ts backend/migrations/1756166400000-AddCompletedAtToLegs.ts
git commit -m "Add Leg.completedAt — the single source of truth for Mark Complete"
```

---

### Task 2: `markComplete` action

**Files:**
- Modify: `backend/src/legs/legs.service.ts`, `backend/src/legs/legs.controller.ts`
- Test: `backend/test/legs.service.spec.ts`, `backend/test/legs.e2e-spec.ts`

**Interfaces:**
- Produces: `LegsService.markComplete(id: string): Promise<Leg>`, `POST /legs/:id/complete` (201).

- [ ] **Step 1: Write the failing unit tests**

Add to `backend/test/legs.service.spec.ts` (inside the existing `describe('LegsService', ...)` block):
```typescript
  it('markComplete stamps completedAt and returns the saved leg', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '482421', completedAt: null });
    legRepo.save.mockImplementation(async (entity) => entity);

    const result = await service.markComplete('1');

    expect(result.completedAt).toBeInstanceOf(Date);
    expect(legRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: '1', completedAt: expect.any(Date) }));
  });

  it('throws NotFoundException when marking a leg that does not exist as complete', async () => {
    legRepo.findOne.mockResolvedValue(null);

    await expect(service.markComplete('missing')).rejects.toThrow(NotFoundException);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: FAIL — `service.markComplete is not a function`

- [ ] **Step 3: Implement markComplete**

Modify `backend/src/legs/legs.service.ts` — add the method (after `update`):
```typescript
  async markComplete(id: string): Promise<Leg> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);
    leg.completedAt = new Date();
    return this.legRepo.save(leg);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Add the route**

Modify `backend/src/legs/legs.controller.ts` — add the route (after `findOne`, before `update`):
```typescript
  @Post(':id/complete')
  markComplete(@Param('id') id: string) {
    return this.legsService.markComplete(id);
  }
```

- [ ] **Step 6: Write the failing e2e test**

Add to `backend/test/legs.e2e-spec.ts` (inside the existing `describe('Legs (e2e)', ...)` block):
```typescript
  it('POST /legs/:id/complete marks the leg complete and returns 201', async () => {
    legRepo.findOne.mockResolvedValue({ id: 'generated-id', tripNo: '2608001', completedAt: null });

    const response = await request(app.getHttpServer()).post('/legs/generated-id/complete').send();

    expect(response.status).toBe(201);
    expect(response.body.completedAt).toBeTruthy();
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `cd backend && npx jest test/legs.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/src/legs/legs.service.ts backend/src/legs/legs.controller.ts backend/test/legs.service.spec.ts backend/test/legs.e2e-spec.ts
git commit -m "Add POST /legs/:id/complete — Mark Complete, without removing the leg from the active list"
```

---

### Task 3: MAYFLY export — pure row/workbook builder

**Files:**
- Create: `backend/src/legs/mayfly-export.ts`
- Test: `backend/test/mayfly-export.spec.ts`

**Interfaces:**
- Produces: `MAYFLY_HEADERS: string[]` (42 real column headers), `legToMayflyRow(leg: Leg): Array<string | number | null>`, `buildMayflyWorkbook(legs: Leg[]): Buffer`. Task 4 calls `buildMayflyWorkbook` from `LegsService`.

Headers and column order below are the real `MAYFLY` sheet row 1 (read via `openpyxl` for this plan), in the same order `seed-from-excel.ts`'s `seedLegs` already reads them by position — every `Leg` field maps back to the exact column it was read from at seed time.

- [ ] **Step 1: Write the failing tests**

`backend/test/mayfly-export.spec.ts`:
```typescript
import * as XLSX from 'xlsx';
import { legToMayflyRow, buildMayflyWorkbook, MAYFLY_HEADERS } from '../src/legs/mayfly-export';

const leg = {
  country: 'Morocco',
  region: 'Africa',
  refNo: 'REF-1',
  clientName: 'ACME',
  operatorName: 'ACME OPS',
  clientNo: '123',
  agentName: 'Hicham Bentouzer',
  serviceReportSent: true,
  returnedInTime: false,
  agentContacts: 'starscmn@starsaviationservices.com / +212 661 888 747',
  tripNo: '475087',
  tail: 'N832PJ',
  icao: 'GMMN',
  arrDate: new Date('2026-08-21T01:05:00.000Z'),
  depDate: new Date('2026-08-21T02:10:00.000Z'),
  arrFrom: 'OMDB',
  depToIcao: 'LFPG',
  activityType: 'Tech Stop',
  progress: 'Complete',
  captName: 'JOHN SPANNHAKE',
  captEmail: 'john.spannhake@jetaviation.com',
  acType: 'GLF6',
  mtowLb: 94600,
  pgh: 'Success',
  tssTeam: 'Victor',
  clearanceNumber: 'MA-1234',
  tssNotified: true,
  clientNotified: true,
  agentExpenses: 'NO',
  readyToBill: true,
  invoiceReceived: false,
  remarks: 'None',
  a2gSupervisor: 'Baraka',
  driveCompleteDate: new Date('2026-08-21T03:00:00.000Z'),
  a2gInvoiceNumber: 'INV-1',
  processBy: 'Baraka',
  processDate: new Date('2026-08-22T00:00:00.000Z'),
  billingMonth: 'AUG-26',
  semaphore: 'GREEN',
  commentsToAgent: 'Thanks',
  legId: 63,
  intelStatus: 'OK',
} as any;

describe('legToMayflyRow', () => {
  it('maps a Leg to MAYFLY column order, formatting booleans as YES/NO and dates as readable text', () => {
    const row = legToMayflyRow(leg);

    expect(row).toHaveLength(MAYFLY_HEADERS.length);
    expect(row[0]).toBe('Morocco');
    expect(row[7]).toBe('YES');
    expect(row[8]).toBe('NO');
    expect(row[10]).toBe('475087');
    expect(row[13]).toBe('21-Aug-2026 01:05');
    expect(row[40]).toBe(63);
  });

  it('leaves null date fields blank', () => {
    const row = legToMayflyRow({ ...leg, arrDate: null });
    expect(row[13]).toBeNull();
  });
});

describe('buildMayflyWorkbook', () => {
  it('writes a real .xlsx buffer with the MAYFLY header row and one row per leg', () => {
    const buffer = buildMayflyWorkbook([leg]);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    expect(rows[0]).toEqual(MAYFLY_HEADERS);
    expect(rows[1][10]).toBe('475087');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/mayfly-export.spec.ts`
Expected: FAIL — `Cannot find module '../src/legs/mayfly-export'`

- [ ] **Step 3: Implement the builder**

`backend/src/legs/mayfly-export.ts`:
```typescript
import * as XLSX from 'xlsx';
import type { Leg } from './leg.entity';

export const MAYFLY_HEADERS = [
  'COUNTRY', 'REGION', 'REF No', 'CLIENT NAME', 'OPR NAME', 'CLIENT NO.', 'AGENT NAME',
  'Service Report Sent', 'Returned in Time Frame?', 'AGENT CONTACTS', 'TRIP_NO.', 'TAIL',
  'UAA_ICAO', 'ARR DATE', 'DEP DATE', 'ARR_FROM', 'DEP_TO_ICAO', 'Activity type', 'Progress',
  'CAPT NAME', 'CAPT EMAIL', 'AC Type', 'MTOW (LB)', 'PGH', 'TSS Team', 'Report / Clearance Number',
  'TSS Notified', 'Client Notified', 'Agent Expenses', 'Ready to bill ', 'Invoice Received', 'Remarks',
  'A2G SUPERVISORS', 'DATE DRIVE COMPLETE LINE', 'A2G INVOICE NUMBER NS', 'PROCESS BY', 'DATE PROCESS',
  'BILLING MONTH', 'SEMAPHORE', 'COMENTS TO KELLY/AGENT', 'LEG ID', 'INTEL STATUS',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatExcelDate(date: Date | null): string | null {
  if (!date) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hh}:${mm}`;
}

function yesNo(value: boolean): string {
  return value ? 'YES' : 'NO';
}

export function legToMayflyRow(leg: Leg): Array<string | number | null> {
  return [
    leg.country,
    leg.region,
    leg.refNo,
    leg.clientName,
    leg.operatorName,
    leg.clientNo,
    leg.agentName,
    yesNo(leg.serviceReportSent),
    yesNo(leg.returnedInTime),
    leg.agentContacts,
    leg.tripNo,
    leg.tail,
    leg.icao,
    formatExcelDate(leg.arrDate),
    formatExcelDate(leg.depDate),
    leg.arrFrom,
    leg.depToIcao,
    leg.activityType,
    leg.progress,
    leg.captName,
    leg.captEmail,
    leg.acType,
    leg.mtowLb,
    leg.pgh,
    leg.tssTeam,
    leg.clearanceNumber,
    yesNo(leg.tssNotified),
    yesNo(leg.clientNotified),
    leg.agentExpenses,
    yesNo(leg.readyToBill),
    yesNo(leg.invoiceReceived),
    leg.remarks,
    leg.a2gSupervisor,
    formatExcelDate(leg.driveCompleteDate),
    leg.a2gInvoiceNumber,
    leg.processBy,
    formatExcelDate(leg.processDate),
    leg.billingMonth,
    leg.semaphore,
    leg.commentsToAgent,
    leg.legId,
    leg.intelStatus,
  ];
}

export function buildMayflyWorkbook(legs: Leg[]): Buffer {
  const rows = [MAYFLY_HEADERS, ...legs.map(legToMayflyRow)];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Completed Missions');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/mayfly-export.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/legs/mayfly-export.ts backend/test/mayfly-export.spec.ts
git commit -m "Add MAYFLY export builder — real 42-column layout, pure and independently tested"
```

---

### Task 4: `GET /legs/export` route

**Files:**
- Create: `backend/src/legs/dto/export-legs-query.dto.ts`
- Modify: `backend/src/legs/legs.service.ts`, `backend/src/legs/legs.controller.ts`
- Test: `backend/test/legs.service.spec.ts`, `backend/test/legs.e2e-spec.ts`

**Interfaces:**
- Consumes: `buildMayflyWorkbook` (Task 3).
- Produces: `LegsService.findCompletedInRange(from: Date, to: Date): Promise<Leg[]>`, `LegsService.exportMayflyBuffer(from: Date, to: Date): Promise<Buffer>`, `GET /legs/export?from=&to=` (200, `.xlsx` file).

- [ ] **Step 1: Write the failing unit tests**

Add to `backend/test/legs.service.spec.ts`:
```typescript
  it('findCompletedInRange queries legs with completedAt between the given dates', async () => {
    legRepo.find.mockResolvedValue([{ id: '1', completedAt: new Date('2026-08-15T00:00:00.000Z') }]);

    const result = await service.findCompletedInRange(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z'),
    );

    expect(legRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completedAt: expect.anything() }) }),
    );
    expect(result).toHaveLength(1);
  });

  it('exportMayflyBuffer returns a real xlsx buffer for the completed legs in range', async () => {
    legRepo.find.mockResolvedValue([{ id: '1', country: 'Morocco', tripNo: '475087', icao: 'GMMN', legId: 63 }]);

    const buffer = await service.exportMayflyBuffer(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z'),
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: FAIL — `service.findCompletedInRange is not a function`

- [ ] **Step 3: Implement findCompletedInRange and exportMayflyBuffer**

Modify `backend/src/legs/legs.service.ts` — add the imports and methods:
```typescript
import { Between, Repository } from 'typeorm';
import { buildMayflyWorkbook } from './mayfly-export';
```
```typescript
  findCompletedInRange(from: Date, to: Date): Promise<Leg[]> {
    return this.legRepo.find({ where: { completedAt: Between(from, to) }, order: { completedAt: 'ASC' } });
  }

  async exportMayflyBuffer(from: Date, to: Date): Promise<Buffer> {
    const legs = await this.findCompletedInRange(from, to);
    return buildMayflyWorkbook(legs);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Add the query DTO and route**

`backend/src/legs/dto/export-legs-query.dto.ts`:
```typescript
import { IsDateString } from 'class-validator';

export class ExportLegsQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
```

Modify `backend/src/legs/legs.controller.ts` — add the imports and the route. **Route order matters**: `@Get('export')` must be declared before `@Get(':id')`, or `/legs/export` would be swallowed by the `:id` wildcard route:
```typescript
import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegsService } from './legs.service';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { ExportLegsQueryDto } from './dto/export-legs-query.dto';
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

  @Get('export')
  async exportCompleted(@Query() query: ExportLegsQueryDto, @Res() res: Response) {
    const buffer = await this.legsService.exportMayflyBuffer(new Date(query.from), new Date(query.to));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="UAA_Completed_Missions_${query.from}_to_${query.to}.xlsx"`,
    });
    res.send(buffer);
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

  @Post(':id/complete')
  markComplete(@Param('id') id: string) {
    return this.legsService.markComplete(id);
  }
}
```

- [ ] **Step 6: Write the failing e2e test**

Add to `backend/test/legs.e2e-spec.ts`:
```typescript
  it('GET /legs/export returns an xlsx file for the date range', async () => {
    legRepo.find.mockResolvedValue([
      { id: '1', tripNo: '475087', icao: 'GMMN', country: 'Morocco', legId: 63, completedAt: new Date('2026-08-15T00:00:00.000Z') },
    ]);

    const response = await request(app.getHttpServer()).get('/legs/export?from=2026-08-01&to=2026-08-31');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `cd backend && npx jest test/legs.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (6 tests)

- [ ] **Step 8: Run the full backend suite and build**

Run:
```bash
cd backend
npx jest
npx jest --config test/jest-e2e.json
npm run build
```
Expected: all PASS, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add backend/src/legs/dto/export-legs-query.dto.ts backend/src/legs/legs.service.ts backend/src/legs/legs.controller.ts backend/test/legs.service.spec.ts backend/test/legs.e2e-spec.ts
git commit -m "Add GET /legs/export — on-demand MAYFLY-format download for a date range"
```

---

### Task 5: Frontend — Mark Complete button and Completed status

**Files:**
- Modify: `frontend/src/lib/api-client.ts`, `frontend/src/app/legs/[id]/page.tsx`, `frontend/src/app/legs/page.tsx`, `frontend/src/app/globals.css`
- Test: `frontend/test/api-client.test.ts`, `frontend/test/leg-detail.test.tsx`, `frontend/test/legs-list.test.tsx`

**Interfaces:**
- Consumes: `POST /legs/:id/complete` (Task 2).
- Produces: `markLegComplete(token, id): Promise<Leg>` in `api-client.ts`; `Leg.completedAt` field.

- [ ] **Step 1: Write the failing api-client test**

Add to `frontend/test/api-client.test.ts` (add `markLegComplete` to the import list):
```typescript
  it('markLegComplete posts to the complete endpoint and returns the updated leg', async () => {
    const updated = { id: '1', tripNo: '482421', icao: 'HECA', tail: 'N148B', country: 'Egypt', arrDate: null, depDate: null, legId: 149, completedAt: '2026-08-23T00:00:00.000Z' };
    (fetch as any).mockResolvedValue({ ok: true, json: async () => updated });

    const result = await markLegComplete('token-123', '1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/1/complete'),
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(updated);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: FAIL — `markLegComplete is not a function`

- [ ] **Step 3: Implement markLegComplete and add completedAt to the Leg interface**

Modify `frontend/src/lib/api-client.ts` — add `completedAt?: string | null;` to the `Leg` interface (alongside the other optional fields), and add the function after `createLeg`:
```typescript
export async function markLegComplete(token: string, id: string): Promise<Leg> {
  const response = await fetch(`${API_URL}/legs/${id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to mark leg complete');
  return response.json();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Write the failing leg-detail test**

Add to `frontend/test/leg-detail.test.tsx` — add `markLegComplete: vi.fn()` to the mocked exports, then add a test:
```typescript
  it('marks the leg complete and shows the Completed badge', async () => {
    vi.mocked(apiClient.getLeg).mockResolvedValue({
      id: '1',
      tripNo: '482421',
      icao: 'HECA',
      tail: 'N148B',
      country: 'Egypt',
      arrDate: null,
      depDate: null,
      legId: 149,
      completedAt: null,
    });
    vi.mocked(apiClient.getLegs).mockResolvedValue([]);
    vi.mocked(apiClient.markLegComplete).mockResolvedValue({
      id: '1',
      tripNo: '482421',
      icao: 'HECA',
      tail: 'N148B',
      country: 'Egypt',
      arrDate: null,
      depDate: null,
      legId: 149,
      completedAt: '2026-08-23T00:00:00.000Z',
    });

    render(<LegDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /482421/ })).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mark Complete' }));

    await waitFor(() => expect(screen.getByText(/Completed/)).toBeInTheDocument());
  });
```
Add the import at the top: `import userEvent from '@testing-library/user-event';`

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/leg-detail.test.tsx`
Expected: FAIL — no "Mark Complete" button rendered yet

- [ ] **Step 7: Implement the Mark Complete button and Completed badge**

Modify `frontend/src/app/legs/[id]/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getLeg, markLegComplete, type Leg } from '@/lib/api-client';
import PermitRequests from './permit-requests';
import Notifications from './notifications';

export default function LegDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [leg, setLeg] = useState<Leg | null>(null);
  const [completing, setCompleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getLeg(token, id)
      .then(setLeg)
      .catch(() => router.replace('/legs'));
  }, [id, router]);

  async function handleMarkComplete() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !leg) return;
    setCompleting(true);
    try {
      const updated = await markLegComplete(token, leg.id);
      setLeg(updated);
    } finally {
      setCompleting(false);
    }
  }

  if (!leg) return null;

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">
          UAA Coordinator — Trip {leg.tripNo}
        </h1>
        <div className="board-header-right">
          {leg.completedAt ? (
            <span className="completed-badge">Completed {new Date(leg.completedAt).toLocaleDateString()}</span>
          ) : (
            <button type="button" className="btn-link" onClick={handleMarkComplete} disabled={completing}>
              {completing ? 'Marking…' : 'Mark Complete'}
            </button>
          )}
          <a className="btn-link" href="/legs">
            Back to legs
          </a>
        </div>
      </div>
      <div className="runway-rule" />

      <div className="leg-detail-summary">
        <div>
          <span className="col-muted">ICAO</span>
          <span className="col-mono">{leg.icao}</span>
        </div>
        <div>
          <span className="col-muted">Tail</span>
          <span className="col-mono">{leg.tail}</span>
        </div>
        <div>
          <span className="col-muted">Country</span>
          <span>{leg.country}</span>
        </div>
      </div>

      <PermitRequests legId={leg.id} country={leg.country} />
      <Notifications legId={leg.id} />
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/leg-detail.test.tsx`
Expected: PASS (2 tests)

Real bug surfaced here (a genuine test-infrastructure defect, not a component bug): the test failed with the click firing and `markLegComplete` resolving correctly, but the DOM never updating. Root cause: `frontend/test/setup.ts`'s global `next/navigation` mock recreated a brand-new `useRouter()` object on every call — `useRouter: () => ({ push: vi.fn(), replace: vi.fn(), ... })`. Real Next.js's `useRouter()` returns a referentially stable object across renders; this mock didn't. `LegDetailPage`'s initial-fetch `useEffect(() => {...}, [id, router])` therefore re-fired on *every* re-render (including the one triggered by `setCompleting(true)`), re-running `getLeg(token, id).then(setLeg)` with the original mocked value (`completedAt: null`) and clobbering the just-applied `setLeg(updated)` from `markLegComplete`'s resolution — a real race, confirmed by isolating a minimal repro outside this component. This pattern (`[..., router]` in an initial-fetch effect's deps) exists on every page in this app (`legs/page.tsx`, `legs/new/page.tsx`, this one) and was previously invisible because no other test triggered a state-changing re-render *after* the initial fetch. Fixed at the root, not just locally: `frontend/test/setup.ts`'s `useRouter` mock now returns a module-scoped, referentially stable object (matching real Next.js's actual behavior — the fix makes the test double more accurate, not a workaround), and `leg-detail.test.tsx`'s own local `next/navigation` override (needed for `useParams`) does the same. No production code needed to change — the bug was entirely in the mock's fidelity to the real API, and every other already-passing test stayed green after the fix (full suite re-run: 39/39 passed).

- [ ] **Step 9: Write the failing legs-list Status column test**

Add to `frontend/test/legs-list.test.tsx`:
```typescript
  it('shows a Completed badge for legs with completedAt set', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      { id: '1', tripNo: '2608001', icao: 'GMMN', tail: 'N832PJ', country: 'Morocco', arrDate: null, depDate: null, legId: 1, completedAt: '2026-08-23T00:00:00.000Z' },
    ]);

    render(<LegsPage />);

    await waitFor(() => expect(screen.getByText('Completed')).toBeInTheDocument());
  });
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/legs-list.test.tsx`
Expected: FAIL — no "Completed" text rendered yet

- [ ] **Step 11: Add the Status column**

Note: see Task 6 Step 7's deviation note — `frontend/src/app/legs/page.tsx` already has sort/filter/date columns from a mid-session addition unrelated to this plan, so `<th>Status</th>` becomes the 7th header (after `Arrival`/`Departure`), not the 5th.

Modify `frontend/src/app/legs/page.tsx` — add `<th>Status</th>` to the header row and a matching `<td>` to each body row:
```tsx
              <th>Status</th>
```
```tsx
                <td>{leg.completedAt ? <span className="completed-badge">Completed</span> : null}</td>
```
(placed as the last header/cell, after Country.)

- [ ] **Step 12: Add badge CSS**

Modify `frontend/src/app/globals.css` — append:
```css
.completed-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: rgba(124, 135, 148, 0.15);
  color: var(--muted);
}
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/legs-list.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 14: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/app/legs/[id]/page.tsx frontend/src/app/legs/page.tsx frontend/src/app/globals.css frontend/test/api-client.test.ts frontend/test/leg-detail.test.tsx frontend/test/legs-list.test.tsx
git commit -m "Add Mark Complete button and Completed status badge"
```

---

### Task 6: Frontend — Download Completed Missions (Excel)

**Files:**
- Modify: `frontend/src/lib/api-client.ts`, `frontend/src/app/legs/page.tsx`, `frontend/src/app/globals.css`
- Test: `frontend/test/api-client.test.ts`, `frontend/test/legs-list.test.tsx`

**Interfaces:**
- Consumes: `GET /legs/export?from=&to=` (Task 4).
- Produces: `downloadCompletedMissions(token, from, to): Promise<Blob>` in `api-client.ts`.

- [ ] **Step 1: Write the failing api-client test**

Add to `frontend/test/api-client.test.ts` (add `downloadCompletedMissions` to the import list):
```typescript
  it('downloadCompletedMissions fetches the export endpoint with the date range and returns a blob', async () => {
    const blob = new Blob(['fake-xlsx-bytes']);
    (fetch as any).mockResolvedValue({ ok: true, blob: async () => blob });

    const result = await downloadCompletedMissions('token-123', '2026-08-01', '2026-08-31');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/export?from=2026-08-01&to=2026-08-31'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toBe(blob);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: FAIL — `downloadCompletedMissions is not a function`

- [ ] **Step 3: Implement downloadCompletedMissions**

Modify `frontend/src/lib/api-client.ts` — add after `markLegComplete`:
```typescript
export async function downloadCompletedMissions(token: string, from: string, to: string): Promise<Blob> {
  const response = await fetch(`${API_URL}/legs/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to export completed missions');
  return response.blob();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Write the failing legs-list export test**

Add to `frontend/test/legs-list.test.tsx` — add `downloadCompletedMissions: vi.fn()` to the mocked exports, then:
```typescript
  it('downloads completed missions for the selected date range', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([]);
    const blob = new Blob(['fake-xlsx-bytes']);
    vi.mocked(apiClient.downloadCompletedMissions).mockResolvedValue(blob);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });

    render(<LegsPage />);
    await waitFor(() => expect(apiClient.getLegs).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '2026-08-01');
    await user.type(screen.getByLabelText('To'), '2026-08-31');
    await user.click(screen.getByRole('button', { name: /Download Completed Missions/ }));

    await waitFor(() =>
      expect(apiClient.downloadCompletedMissions).toHaveBeenCalledWith('test-token', '2026-08-01', '2026-08-31'),
    );
  });
```
Add the import at the top: `import userEvent from '@testing-library/user-event';`

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/legs-list.test.tsx`
Expected: FAIL — no export controls rendered yet

- [ ] **Step 7: Implement the export toolbar**

Real deviation, found before this task started executing: mid-session, the user flagged that `/legs` needed sorting, filtering, and visible arrival/departure columns — a real usability gap unrelated to this plan's own scope, addressed immediately as its own change (commit "Add sorting, filtering, and arrival/departure columns to the Legs list") rather than folded into this plan's task numbering. `frontend/src/app/legs/page.tsx` and `frontend/test/legs-list.test.tsx` are therefore **already substantially different** from the simple 4-column version this plan was originally drafted against: the page now has `search`/`countryFilter`/`sortKey`/`sortDir` state, a `.legs-filter-toolbar`, click-to-sort column headers, and `Arrival`/`Departure` columns. The block below is left as originally drafted to show exactly what this task adds (the `exportFrom`/`exportTo`/`exporting`/`exportError` state, `handleExport`, the `.export-toolbar` JSX, and the `downloadCompletedMissions` import) — **merge those additions into the real current file, do not paste this block over it**, or the sort/filter/date-column work will be silently reverted. Step 11 of Task 5 (the Status column) needs the same care: it becomes the 7th column (after Departure), not the 5th.

Modify `frontend/src/app/legs/page.tsx` (illustrative — merge, don't overwrite; see note above):
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getLegs, downloadCompletedMissions, type Leg } from '@/lib/api-client';

export default function LegsPage() {
  const [legs, setLegs] = useState<Leg[]>([]);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getLegs(token)
      .then(setLegs)
      .catch(() => {
        localStorage.removeItem('uaa_token');
        router.replace('/login');
      });
  }, [router]);

  function handleSignOut() {
    localStorage.removeItem('uaa_token');
    router.replace('/login');
  }

  async function handleExport() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !exportFrom || !exportTo) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadCompletedMissions(token, exportFrom, exportTo);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UAA_Completed_Missions_${exportFrom}_to_${exportTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Could not export completed missions. Check the date range and try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — Legs</h1>
        <div className="board-header-right">
          <span className="board-count">{legs.length} leg{legs.length === 1 ? '' : 's'}</span>
          <a className="btn-link" href="/action-board">
            Action board
          </a>
          <a className="btn-link" href="/legs/new">
            + New leg
          </a>
          <button type="button" className="btn-link" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
      <div className="runway-rule" />

      <div className="export-toolbar">
        <label htmlFor="export-from">From</label>
        <input id="export-from" type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
        <label htmlFor="export-to">To</label>
        <input id="export-to" type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
        <button type="button" className="btn-link" onClick={handleExport} disabled={exporting || !exportFrom || !exportTo}>
          {exporting ? 'Exporting…' : 'Download Completed Missions (Excel)'}
        </button>
      </div>
      {exportError && (
        <p className="login-error" role="alert">
          {exportError}
        </p>
      )}

      <div className="board-table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th>Trip No</th>
              <th>ICAO</th>
              <th>Tail</th>
              <th>Country</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={leg.id}>
                <td className="col-mono">
                  <a href={`/legs/${leg.id}`}>{leg.tripNo}</a>
                </td>
                <td className="col-mono">{leg.icao}</td>
                <td className="col-mono">{leg.tail}</td>
                <td className="col-muted">{leg.country}</td>
                <td>{leg.completedAt ? <span className="completed-badge">Completed</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add export toolbar CSS**

Modify `frontend/src/app/globals.css` — append:
```css
.export-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.export-toolbar label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.export-toolbar input[type='date'] {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 2px;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 8px;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/legs-list.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 10: Run the full frontend suite and the build**

Run:
```bash
cd frontend
npx vitest run
npm run build
```
Expected: all tests PASS, build succeeds.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/app/legs/page.tsx frontend/src/app/globals.css frontend/test/api-client.test.ts frontend/test/legs-list.test.tsx
git commit -m "Add Download Completed Missions (Excel) date-range export to the Legs list"
```

---

### Task 7: End-to-end smoke check against the real seeded stack

**Files:** none (verification-only task)

- [ ] **Step 1: Bring up the full stack fresh and run every migration + seed script**

Following the established approach from Slices 3-4 (Postgres has no published host port; `node:20-alpine`'s musl libc can't load `bcrypt`'s prebuilt binding, so seed scripts run from the backend Dockerfile's `build`-stage image):
```bash
docker compose down -v
docker compose up --build -d
docker build --target build -t uaa-backend-seed ./backend
docker run --rm --network web-proxy -v "<repo>/Aviation/uaa/backend:/app" -w /app \
  -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" node:20-alpine \
  sh -c "npm install --silent && npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts"
docker run --rm --network web-proxy -v "<repo>/Aviation/uaa/UAA_Coordinator_v5.xlsm:/app/UAA_Coordinator_v5.xlsm:ro" \
  -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" uaa-backend-seed npm run seed -- "UAA_Coordinator_v5.xlsm"
docker run --rm --network web-proxy -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" \
  uaa-backend-seed npm run seed:country-requirements
```
Expected: 8 migrations now (the prior 7 plus `AddCompletedAtToLegs`), same real seed counts as Slice 4's Task 8 (`Seeded 2 user(s), 62 leg(s), 20 team(s).`, `Seeded 15 CountryRequirement(s), 15 FormTemplate(s).`). Reset coordinator `bminja`'s password to `Admin123!` the same way as prior slices.

- [ ] **Step 2: Confirm the backend booted cleanly with the new routes**

```bash
docker compose logs backend --tail 30
```
Expected: `Nest application successfully started`, with `Mapped {/legs/export, GET}` listed *before* `Mapped {/legs/:id, GET}` and `Mapped {/legs/:id/complete, POST}` also listed, no crash.

- [ ] **Step 3: Mark a real leg complete**

```bash
curl -s -X POST http://localhost:3011/legs/<leg-id>/complete -H "Authorization: Bearer <token>"
curl -s http://localhost:3011/legs/<leg-id> -H "Authorization: Bearer <token>"
```
Expected: first call returns `201` with a non-null `completedAt`; second call's `completedAt` matches — confirms the leg is still fully retrievable (not archived away) after being marked complete.

- [ ] **Step 4: Download a real MAYFLY export and verify it opens as a real workbook**

```bash
curl -s -X GET "http://localhost:3011/legs/export?from=2020-01-01&to=2030-01-01" -H "Authorization: Bearer <token>" -o /tmp/export-test.xlsx
```
Then, using the same `uaa-backend-seed` image (has `xlsx` available), verify the file is a real, readable workbook with the expected header row:
```bash
docker run --rm -v "/tmp/export-test.xlsx:/tmp/export-test.xlsx:ro" uaa-backend-seed \
  node -e "const XLSX=require('xlsx'); const wb=XLSX.readFile('/tmp/export-test.xlsx'); const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1}); console.log(rows[0].length, rows[0][0], rows.length - 1);"
```
Expected: prints `42 COUNTRY <N>` where `<N>` is the number of legs marked complete in Step 3 (at least 1) — confirms a real `.xlsx` file with 42 real MAYFLY columns and the completed leg's row.

- [ ] **Step 5: Confirm the frontend renders Mark Complete, the Completed badge, and the export toolbar in a real browser**

Log in at `http://localhost:3012/login`. On the Legs list (`http://localhost:3012/legs`), confirm the date-range export toolbar renders and the leg from Step 3 shows a "Completed" badge in its Status column. Open that leg's detail page, confirm it shows a "Completed <date>" badge instead of a "Mark Complete" button.

- [ ] **Step 6: No commit for this task** — it's verification only. If anything fails, fix it in the task that owns the broken piece and re-run this check.

---

## Self-Review

**1. Spec coverage** — this plan implements exactly Build Sequencing item 5 ("'Mark Complete' + MAYFLY-format Excel export"), matching the Billing/MAYFLY export section's two named features one-for-one: "Mark Complete... flips the leg into a completed state without deleting it from the active view" (Tasks 1-2, 5 — `completedAt` is set, `GET /legs` and the Legs list are never filtered) and "Download Completed Missions (Excel) — on-demand export, MAYFLY's exact column order, for a selected date range" (Tasks 3-4, 6 — real 42-column headers, `from`/`to` query params, on-demand only). The spec's explicit deferral ("scheduled/automatic nightly export... Phase 1 is on-demand only") is honored — no scheduling code added.

**2. Placeholder scan** — no TBD/TODO/"add error handling"/"similar to Task N" found. Every task's code is complete and concrete, including the real MAYFLY header list (verified against the live workbook, not approximated).

**3. Type consistency** — `legToMayflyRow`'s return type (`Array<string | number | null>`, Task 3) matches what `buildMayflyWorkbook` (same task) spreads into `aoa_to_sheet`. `LegsService.exportMayflyBuffer`'s signature (Task 4) matches exactly what `LegsController.exportCompleted` (same task) awaits and sends. `ExportLegsQueryDto`'s `from`/`to` string fields (Task 4) match what the frontend's `downloadCompletedMissions` (Task 6) sends as query params — both plain `YYYY-MM-DD` date strings from an `<input type="date">`, validated server-side by `@IsDateString()`. `Leg.completedAt` is `Date | null` on the backend entity (Task 1) and `string | null` on the frontend interface (Task 5) — consistent with every other date field already in `api-client.ts`'s `Leg` interface (`arrDate`, `depDate`), which are also backend `Date` vs. frontend `string` (JSON-serialized), not a new inconsistency introduced by this plan. One routing-order detail double-checked during self-review: `@Get('export')` must be declared before `@Get(':id')` in `LegsController` (Task 4) — verified against NestJS's route-registration-order matching behavior, called out explicitly in that task's Step 5 rather than left as a silent trap.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-23-mark-complete-mayfly-export.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
