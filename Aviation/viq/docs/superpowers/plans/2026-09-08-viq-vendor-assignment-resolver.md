# VIQ Vendor Assignment Resolver (Sub-Project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `VendorAssignment` data model and a fully isolated, thoroughly tested `VendorResolverService` that resolves the correct vendor for a given operational context (country/airport, service/permit type, client) — with zero changes to any live Trip/Leg/Service generation code.

**Architecture:** New Prisma model + a small CRUD module (`VendorAssignmentsModule`) for managing assignment rows, plus a separate pure-logic `VendorResolverService` that reads `VendorAssignment`+`Provider` and returns a `RESOLVED`/`CHOICE_REQUIRED`/`NO_ELIGIBLE_VENDOR` result with a full explanation — never called from anywhere live yet (that's sub-project 2).

**Tech Stack:** NestJS 10, Prisma 5.22, PostgreSQL, Jest against real `jetflow_test` Postgres (no mocked Prisma).

**Spec:** [2026-09-08-viq-vendor-assignment-resolver-design.md](../specs/2026-09-08-viq-vendor-assignment-resolver-design.md)

## Global Constraints

- Real Postgres (`jetflow_test`) for every server test — never mock Prisma. `beforeEach` calls `truncateAll(prisma)` from `src/server/test/db-test-utils.ts`.
- No changes to `src/server/modules/services/services.service.ts`, `src/server/modules/legs/legs.service.ts`, or `src/server/modules/trips/trips.service.ts` in this plan — the resolver is not wired into anything live yet (sub-project 2's job).
- `Preferred` and `Rank` are independent fields, never inferred from each other. Equal ranks are valid and must produce `CHOICE_REQUIRED`, never an arbitrary pick.
- Resolution specificity tuple order (verified against the source's own 11-tier list): `(hasClient, hasPermitType, hasIcao, hasCountry)`, each compared descending — client status dominates, then permit-type match, then geography specificity (airport beats country beats global).
- Prohibition rows are a hard filter applied before ranking, not a competing candidate.
- `rank` is required unless `prohibited: true`. A row cannot be both `preferred: true` and `prohibited: true`.
- After each task: run the affected test file(s), then `npm run build:server` (kill any orphaned `node.exe`/`nest start --watch` process first if it fails with an `EPERM`/DLL-lock error), then commit.

---

### Task 1: VendorAssignment data model + migration

**Files:**
- Modify: `prisma/schema.prisma` — add `VendorAssignment` model; add `vendorAssignments VendorAssignment[]` back-reference to `Provider` and `Client` models.
- Test: none (schema-only task; validated by Task 2's tests exercising it).

**Interfaces:**
- Produces: the `VendorAssignment` Prisma model with fields `id, providerId, countryIso2, icao, serviceType, permitType, clientId, preferred, rank, prohibited, active, effectiveFrom, effectiveUntil, notes, createdBy, createdAtZ` — consumed by Task 2's service and Task 3's resolver.

- [ ] **Step 1: Add the `VendorAssignment` model to `prisma/schema.prisma`**

Insert after the `Provider` model (which currently ends right before `model CountryRule {`):

```prisma
// Vendor Assignment & Resolution Engine, sub-project 1. One row = "this
// Vendor may fill this operational context, at this preference."
// Deliberately NOT a single global vendor.priority -- priority is always
// contextual (country/airport x serviceType/permitType x client).
// preferred and rank are independent fields, never inferred from each
// other; equal ranks across different providers are valid and mean tied
// preference (the resolver, not the schema, detects and surfaces ties).
// rank is nullable because a prohibition row (prohibited: true) has no
// meaningful rank.
model VendorAssignment {
  id             String    @id @default(cuid())
  providerId     String    @map("provider_id")
  countryIso2    String?   @map("country_iso2")
  icao           String?
  serviceType    String    @map("service_type")
  permitType     String?   @map("permit_type")
  clientId       String?   @map("client_id")

  preferred      Boolean   @default(false)
  rank           Int?
  prohibited     Boolean   @default(false)

  active         Boolean   @default(true)
  effectiveFrom  DateTime? @map("effective_from")
  effectiveUntil DateTime? @map("effective_until")

  notes          String?
  createdBy      String?   @map("created_by")
  createdAtZ     DateTime  @default(now()) @map("created_at_z")

  provider Provider @relation(fields: [providerId], references: [providerId], onDelete: Cascade)
  client   Client?  @relation(fields: [clientId], references: [clientId], onDelete: Cascade)
  country  Country? @relation(fields: [countryIso2], references: [iso2])

  @@index([countryIso2, icao, serviceType, permitType, clientId])
  @@index([providerId])
  @@map("vendor_assignments")
}
```

- [ ] **Step 2: Add the two back-reference fields**

In `model Provider {`, alongside `services Service[]`/`priceItems PriceItem[]`/`channels ContactChannel[]`, add:
```prisma
  vendorAssignments VendorAssignment[]
```

In `model Client {`, alongside `linkedOperator`/`trips`/`channels`, add:
```prisma
  vendorAssignments VendorAssignment[]
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_vendor_assignments`
Expected: creates `prisma/migrations/<timestamp>_add_vendor_assignments/migration.sql`, applies cleanly, regenerates the Prisma client. If it fails with an `EPERM` on `query_engine-windows.dll.node`, an orphaned `node.exe` from a prior dev-server run holds the lock:
```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId,CommandLine
Stop-Process -Id <pid> -Force
```
then retry.

- [ ] **Step 4: Build and commit**

Run: `npm run build:server`
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add VendorAssignment data model"
```

---

### Task 2: VendorAssignmentsModule — CRUD with validation

**Files:**
- Create: `src/server/modules/vendor-assignments/dto/create-vendor-assignment.dto.ts`
- Create: `src/server/modules/vendor-assignments/dto/update-vendor-assignment.dto.ts`
- Create: `src/server/modules/vendor-assignments/vendor-assignments.service.ts`
- Create: `src/server/modules/vendor-assignments/vendor-assignments.controller.ts`
- Create: `src/server/modules/vendor-assignments/vendor-assignments.module.ts`
- Modify: `src/server/app.module.ts` — import `VendorAssignmentsModule`
- Test: `src/server/modules/vendor-assignments/vendor-assignments.service.spec.ts`

**Interfaces:**
- Consumes: `AuditService` (`log`, same shape used throughout the codebase, e.g. `permit-authorizations.service.ts`).
- Produces: `VendorAssignmentsService.create(dto: CreateVendorAssignmentDto): Promise<VendorAssignment>`, `VendorAssignmentsService.update(id: string, dto: UpdateVendorAssignmentDto): Promise<VendorAssignment>`, `VendorAssignmentsService.findAll(filters): Promise<VendorAssignment[]>` — Task 3's resolver reads the table directly via Prisma (it does not call this service), but Task 3's tests use `VendorAssignmentsService.create` (or raw `prisma.vendorAssignment.create`) to set up fixtures.

- [ ] **Step 1: Write `src/server/modules/vendor-assignments/dto/create-vendor-assignment.dto.ts`**

```typescript
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVendorAssignmentDto {
  @IsString()
  @MaxLength(200)
  providerId!: string;

  @IsOptional()
  @IsString()
  countryIso2?: string;

  @IsOptional()
  @IsString()
  icao?: string;

  @IsString()
  @MaxLength(200)
  serviceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  permitType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @IsOptional()
  @IsBoolean()
  preferred?: boolean;

  @IsOptional()
  @IsInt()
  rank?: number;

  @IsOptional()
  @IsBoolean()
  prohibited?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
```

- [ ] **Step 2: Write `src/server/modules/vendor-assignments/dto/update-vendor-assignment.dto.ts`**

```typescript
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateVendorAssignmentDto } from './create-vendor-assignment.dto';

export class UpdateVendorAssignmentDto extends PartialType(
  OmitType(CreateVendorAssignmentDto, ['providerId', 'serviceType'] as const),
) {}
```

- [ ] **Step 3: Write `src/server/modules/vendor-assignments/vendor-assignments.service.ts`**

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVendorAssignmentDto } from './dto/create-vendor-assignment.dto';
import { UpdateVendorAssignmentDto } from './dto/update-vendor-assignment.dto';

export interface VendorAssignmentFilters {
  providerId?: string;
  countryIso2?: string;
  serviceType?: string;
  clientId?: string;
}

@Injectable()
export class VendorAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(filters: VendorAssignmentFilters) {
    return this.prisma.vendorAssignment.findMany({
      where: {
        providerId: filters.providerId,
        countryIso2: filters.countryIso2,
        serviceType: filters.serviceType,
        clientId: filters.clientId,
      },
      orderBy: { createdAtZ: 'desc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.vendorAssignment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`VendorAssignment ${id} not found`);
    return row;
  }

  private validate(preferred: boolean | undefined, rank: number | undefined | null, prohibited: boolean | undefined) {
    if (preferred && prohibited) {
      throw new BadRequestException('A vendor assignment cannot be both preferred and prohibited');
    }
    if (!prohibited && rank == null) {
      throw new BadRequestException('rank is required unless prohibited is true');
    }
  }

  async create(dto: CreateVendorAssignmentDto) {
    const prohibited = dto.prohibited ?? false;
    this.validate(dto.preferred, prohibited ? null : dto.rank ?? null, prohibited);

    const existing = await this.prisma.vendorAssignment.findFirst({
      where: {
        providerId: dto.providerId,
        countryIso2: dto.countryIso2 ?? null,
        icao: dto.icao ?? null,
        serviceType: dto.serviceType,
        permitType: dto.permitType ?? null,
        clientId: dto.clientId ?? null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `An identical vendor assignment already exists (id: ${existing.id}) for this provider/context — ` +
          'use a different provider for a tied-preference alternative, or edit the existing row',
      );
    }

    const user = dto.user || 'SYSTEM';
    const row = await this.prisma.vendorAssignment.create({
      data: {
        providerId: dto.providerId,
        countryIso2: dto.countryIso2,
        icao: dto.icao,
        serviceType: dto.serviceType,
        permitType: dto.permitType,
        clientId: dto.clientId,
        preferred: dto.preferred ?? false,
        rank: prohibited ? null : dto.rank,
        prohibited,
        active: dto.active ?? true,
        effectiveFrom: dto.effectiveFrom,
        effectiveUntil: dto.effectiveUntil,
        notes: dto.notes,
        createdBy: user,
      },
    });
    await this.audit.log(user, 'VendorAssignment', row.id, 'Created', '', row.id);
    return row;
  }

  async update(id: string, dto: UpdateVendorAssignmentDto) {
    const before = await this.findOne(id);
    const user = dto.user || 'SYSTEM';
    const preferred = dto.preferred ?? before.preferred;
    const prohibited = dto.prohibited ?? before.prohibited;
    const rank = dto.rank !== undefined ? dto.rank : before.rank;
    this.validate(preferred, prohibited ? null : rank, prohibited);

    const { user: _user, ...data } = dto;
    const row = await this.prisma.vendorAssignment.update({
      where: { id },
      data: { ...data, rank: prohibited ? null : rank },
    });
    await this.audit.logDiff(user, 'VendorAssignment', id, before as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>);
    return row;
  }
}
```

- [ ] **Step 4: Write `src/server/modules/vendor-assignments/vendor-assignments.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { CreateVendorAssignmentDto } from './dto/create-vendor-assignment.dto';
import { UpdateVendorAssignmentDto } from './dto/update-vendor-assignment.dto';

@Controller('vendor-assignments')
export class VendorAssignmentsController {
  constructor(private readonly assignments: VendorAssignmentsService) {}

  @Get()
  findAll(
    @Query('providerId') providerId?: string,
    @Query('countryIso2') countryIso2?: string,
    @Query('serviceType') serviceType?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.assignments.findAll({ providerId, countryIso2, serviceType, clientId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignments.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateVendorAssignmentDto) {
    return this.assignments.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVendorAssignmentDto) {
    return this.assignments.update(id, dto);
  }
}
```

RBAC note: no `@Roles()` decorator needed — the globally-registered `RolesGuard` (`APP_GUARD` in `auth.module.ts`) already blocks any non-GET request from a `Viewer`-role user, matching the existing `PermitAuthorizationsController` pattern for `create`/`update` (only its role-*restricted-to-Admin* endpoints use `@Roles('Admin')`; ordinary create/update do not).

- [ ] **Step 5: Write `src/server/modules/vendor-assignments/vendor-assignments.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { VendorAssignmentsController } from './vendor-assignments.controller';

@Module({
  controllers: [VendorAssignmentsController],
  providers: [VendorAssignmentsService],
  exports: [VendorAssignmentsService],
})
export class VendorAssignmentsModule {}
```

- [ ] **Step 6: Wire into `src/server/app.module.ts`**

Add the import near the other feature modules (after `import { TasksModule } from './modules/tasks/tasks.module';`):
```typescript
import { VendorAssignmentsModule } from './modules/vendor-assignments/vendor-assignments.module';
```
Add `VendorAssignmentsModule,` to the `imports` array, right after `TasksModule,`.

- [ ] **Step 7: Write `src/server/modules/vendor-assignments/vendor-assignments.service.spec.ts`**

```typescript
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { truncateAll } from '../../test/db-test-utils';

describe('VendorAssignmentsService', () => {
  let prisma: PrismaService;
  let assignments: VendorAssignmentsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    assignments = new VendorAssignmentsService(prisma, new AuditService(prisma));
    await prisma.provider.create({
      data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'TZ' },
    });
    await prisma.provider.create({
      data: { providerId: 'PROV-B', name: 'Vendor B', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'TZ' },
    });
  });

  it('creates a valid assignment', async () => {
    const row = await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1 } as any);
    expect(row.rank).toBe(1);
    expect(row.prohibited).toBe(false);
  });

  it('rejects preferred + prohibited on the same row', async () => {
    await expect(
      assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', preferred: true, prohibited: true } as any),
    ).rejects.toThrow();
  });

  it('rejects a non-prohibited row with no rank', async () => {
    await expect(
      assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ' } as any),
    ).rejects.toThrow();
  });

  it('allows a prohibited row with no rank, and forces rank to null even if one is sent', async () => {
    const row = await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', clientId: 'CLI-1', prohibited: true, rank: 99 } as any);
    expect(row.rank).toBeNull();
    expect(row.prohibited).toBe(true);
  });

  it('rejects an identical duplicate (same provider + context)', async () => {
    await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1 } as any);
    await expect(
      assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 2 } as any),
    ).rejects.toThrow();
  });

  it('allows two different providers at the same rank for the same context (tied preference)', async () => {
    await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1, preferred: true } as any);
    const row = await assignments.create({ providerId: 'PROV-B', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1, preferred: true } as any);
    expect(row.rank).toBe(1);
  });

  it('update() re-validates preferred/prohibited/rank together', async () => {
    const created = await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1 } as any);
    await expect(assignments.update(created.id, { prohibited: true, preferred: true } as any)).rejects.toThrow();
    const updated = await assignments.update(created.id, { prohibited: true } as any);
    expect(updated.rank).toBeNull();
  });
});
```

- [ ] **Step 8: Run the tests**

Run: `npm test -- vendor-assignments.service.spec.ts`
Expected: 7 tests pass.

- [ ] **Step 9: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/vendor-assignments src/server/app.module.ts
git commit -m "feat: add VendorAssignmentsModule CRUD with validation"
```

---

### Task 3: VendorResolverService — the core resolution algorithm

**Files:**
- Create: `src/server/modules/vendor-assignments/vendor-resolver.service.ts`
- Modify: `src/server/modules/vendor-assignments/vendor-assignments.module.ts` — add `VendorResolverService` to providers/exports
- Test: `src/server/modules/vendor-assignments/vendor-resolver.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` only — no dependency on `VendorAssignmentsService`, `ServicesService`, `LegsService`, or `TripsService`.
- Produces: `VendorResolverService.resolve(context: VendorResolutionContext): Promise<VendorResolutionResult>` — the entry point sub-project 2 will call from `generateOverflightServices`/`generateArrivalServices` (not done in this plan).

- [ ] **Step 1: Write `src/server/modules/vendor-assignments/vendor-resolver.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export type VendorResolutionStatus = 'RESOLVED' | 'CHOICE_REQUIRED' | 'NO_ELIGIBLE_VENDOR' | 'BLOCKED';

export interface VendorResolutionContext {
  countryIso2?: string;
  icao?: string;
  serviceType: string;
  permitType?: string;
  clientId?: string;
  asOfZ?: Date;
}

export interface VendorResolutionResult {
  status: VendorResolutionStatus;
  selectedVendorId?: string;
  selectionSource?: string;
  matchedRule?: { id: string; rank: number | null; preferred: boolean };
  alternatives: { vendorId: string; rank: number | null }[];
  reason: string;
}

type AssignmentWithProvider = Prisma.VendorAssignmentGetPayload<{ include: { provider: true } }>;

// Fully isolated from ServicesService/LegsService/TripsService by design
// (see the sub-project 1 design spec) -- pure read of VendorAssignment +
// Provider, returns a result, writes nothing. Not called from anywhere
// live yet; sub-project 2 wires this into service generation.
@Injectable()
export class VendorResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(ctx: VendorResolutionContext): Promise<VendorResolutionResult> {
    const asOfZ = ctx.asOfZ ?? new Date();
    // Both buildContextFilter and validityConditions return arrays of
    // conditions (not pre-wrapped {AND:[...]} objects) specifically so
    // they can be flattened into ONE AND array here -- spreading two
    // objects that each independently carry an `AND` key would silently
    // let the second overwrite the first, dropping half the filter.
    const conditions = [...this.buildContextFilter(ctx), ...this.validityConditions(asOfZ)];

    const [candidates, prohibitions] = await Promise.all([
      this.prisma.vendorAssignment.findMany({
        where: { serviceType: ctx.serviceType, prohibited: false, active: true, AND: conditions },
        include: { provider: true },
      }),
      this.prisma.vendorAssignment.findMany({
        where: { serviceType: ctx.serviceType, prohibited: true, active: true, AND: conditions },
      }),
    ]);

    const bannedProviderIds = new Set(prohibitions.map((p) => p.providerId));
    const eligible = candidates.filter(
      (c) => !bannedProviderIds.has(c.providerId) && c.provider.contractActive,
    );

    if (eligible.length === 0) {
      return {
        status: 'NO_ELIGIBLE_VENDOR',
        alternatives: [],
        reason: bannedProviderIds.size > 0
          ? 'All otherwise-eligible vendors are prohibited for this client/context'
          : 'No active vendor assignment matches this context',
      };
    }

    const topTier = this.selectTopTier(eligible);
    const preferredOnly = topTier.filter((r) => r.preferred);
    const pool = preferredOnly.length > 0 ? preferredOnly : topTier;

    const minRank = Math.min(...pool.map((r) => r.rank ?? Number.MAX_SAFE_INTEGER));
    const winners = pool.filter((r) => (r.rank ?? Number.MAX_SAFE_INTEGER) === minRank);

    if (winners.length === 1) {
      const w = winners[0];
      return {
        status: 'RESOLVED',
        selectedVendorId: w.providerId,
        selectionSource: this.describeSelectionSource(w),
        matchedRule: { id: w.id, rank: w.rank, preferred: w.preferred },
        alternatives: pool.filter((r) => r.id !== w.id).map((r) => ({ vendorId: r.providerId, rank: r.rank })),
        reason: `${this.describeSelectionSource(w)}: rank ${w.rank}${w.preferred ? ', preferred' : ''}`,
      };
    }

    return {
      status: 'CHOICE_REQUIRED',
      alternatives: winners.map((r) => ({ vendorId: r.providerId, rank: r.rank })),
      reason: `${winners.length} vendors tied at rank ${minRank} for this context`,
    };
  }

  private buildContextFilter(ctx: VendorResolutionContext): Prisma.VendorAssignmentWhereInput[] {
    const optionalMatch = (value: string | undefined, field: 'icao' | 'countryIso2' | 'clientId' | 'permitType'): Prisma.VendorAssignmentWhereInput =>
      value ? { OR: [{ [field]: value }, { [field]: null }] } : { [field]: null };

    return [
      optionalMatch(ctx.permitType, 'permitType'),
      optionalMatch(ctx.icao, 'icao'),
      optionalMatch(ctx.countryIso2, 'countryIso2'),
      optionalMatch(ctx.clientId, 'clientId'),
    ];
  }

  private validityConditions(asOfZ: Date): Prisma.VendorAssignmentWhereInput[] {
    return [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOfZ } }] },
      { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: asOfZ } }] },
    ];
  }

  // Specificity tuple order verified against the source doc's own 11-tier
  // list: client status dominates, then permit-type match, then geography
  // (airport beats country beats global). Field order here is NOT
  // arbitrary -- do not reorder without re-checking that list.
  private specificity(row: { clientId: string | null; permitType: string | null; icao: string | null; countryIso2: string | null }): [number, number, number, number] {
    return [row.clientId ? 1 : 0, row.permitType ? 1 : 0, row.icao ? 1 : 0, row.countryIso2 ? 1 : 0];
  }

  private selectTopTier(rows: AssignmentWithProvider[]): AssignmentWithProvider[] {
    let best: [number, number, number, number] = [0, 0, 0, 0];
    for (const row of rows) {
      const s = this.specificity(row);
      if (this.compareTuple(s, best) > 0) best = s;
    }
    return rows.filter((row) => this.compareTuple(this.specificity(row), best) === 0);
  }

  private compareTuple(a: [number, number, number, number], b: [number, number, number, number]): number {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  private describeSelectionSource(row: { clientId: string | null; icao: string | null; countryIso2: string | null; permitType: string | null }): string {
    const geo = row.icao ? 'AIRPORT' : row.countryIso2 ? 'COUNTRY' : 'GLOBAL';
    const parts = [row.clientId ? 'CLIENT' : null, geo, row.permitType ? 'PERMIT_TYPE' : null].filter(Boolean);
    return parts.join('_') + (row.clientId || row.icao || row.countryIso2 || row.permitType ? '_OVERRIDE' : '_DEFAULT');
  }
}
```

- [ ] **Step 2: Add `VendorResolverService` to `vendor-assignments.module.ts`**

Update the file from Task 2's Step 5 to:

```typescript
import { Module } from '@nestjs/common';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { VendorAssignmentsController } from './vendor-assignments.controller';
import { VendorResolverService } from './vendor-resolver.service';

@Module({
  controllers: [VendorAssignmentsController],
  providers: [VendorAssignmentsService, VendorResolverService],
  exports: [VendorAssignmentsService, VendorResolverService],
})
export class VendorAssignmentsModule {}
```

- [ ] **Step 3: Write `src/server/modules/vendor-assignments/vendor-resolver.service.spec.ts`**

```typescript
import { PrismaService } from '../../prisma/prisma.service';
import { VendorResolverService } from './vendor-resolver.service';
import { truncateAll } from '../../test/db-test-utils';

describe('VendorResolverService', () => {
  let prisma: PrismaService;
  let resolver: VendorResolverService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    resolver = new VendorResolverService(prisma);
    for (const id of ['PROV-A', 'PROV-B', 'PROV-C']) {
      await prisma.provider.create({
        data: { providerId: id, name: id, serviceTypes: ['Overflight', 'Ground Handling'], scopeType: 'Global', scope: 'GLOBAL' },
      });
    }
    await prisma.client.create({ data: { clientId: 'CLI-1', name: 'Client One' } });
  });

  async function makeAssignment(overrides: Partial<{
    providerId: string; countryIso2: string; icao: string; serviceType: string;
    permitType: string; clientId: string; preferred: boolean; rank: number;
    prohibited: boolean; active: boolean; effectiveFrom: Date; effectiveUntil: Date;
  }>) {
    return prisma.vendorAssignment.create({
      data: { providerId: 'PROV-A', serviceType: 'Overflight', preferred: false, rank: 1, ...overrides },
    });
  }

  it('resolves Rank 1 over Rank 2 (general ranking)', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('PROV-A');
  });

  it('treats preferred and rank as independent: a preferred:false rank:1 row still wins over a preferred:true rank:2 row', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, preferred: false });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2, preferred: true });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    // No row is preferred at the tier level? Actually PROV-B IS preferred.
    // Preferred-filter restricts the pool to preferred rows when any exist
    // in the top tier -- so the pool becomes just PROV-B (rank 2), which
    // then wins by elimination even though PROV-A has the lower rank.
    // This proves preferred/rank are applied as documented: preferred
    // filters the pool FIRST, then rank breaks ties within it.
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('equal rank produces CHOICE_REQUIRED with both alternatives listed', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, preferred: true });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 1, preferred: true });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.status).toBe('CHOICE_REQUIRED');
    expect(result.alternatives.map((a) => a.vendorId).sort()).toEqual(['PROV-A', 'PROV-B']);
  });

  it('client override wins over a general country default', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', clientId: 'CLI-1', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('client + airport override wins over airport-only and country-only rows', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', icao: 'HTDA', rank: 1 });
    await makeAssignment({ providerId: 'PROV-C', icao: 'HTDA', clientId: 'CLI-1', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', icao: 'HTDA', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(result.selectedVendorId).toBe('PROV-C');
  });

  it('client prohibition excludes the otherwise-winning vendor, falling through to the next eligible one', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', clientId: 'CLI-1', prohibited: true, rank: undefined as any });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('airport override wins over country rule', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', icao: 'HTDA', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', icao: 'HTDA', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('permit-type override wins over generic service-type row for the same country', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', permitType: 'Diplomatic', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight', permitType: 'Diplomatic' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('a client+global+permitType row outranks a non-client airport+permitType row (client and permit-type both dominate geography)', async () => {
    await makeAssignment({ providerId: 'PROV-A', icao: 'HTDA', permitType: 'Diplomatic', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', clientId: 'CLI-1', permitType: 'Diplomatic', rank: 1 });
    const result = await resolver.resolve({ icao: 'HTDA', serviceType: 'Overflight', permitType: 'Diplomatic', clientId: 'CLI-1' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('an expired assignment is excluded', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, effectiveUntil: new Date('2020-01-01') });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('a not-yet-effective assignment is excluded', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, effectiveFrom: new Date('2099-01-01') });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('an inactive provider contract falls through to the next eligible vendor', async () => {
    await prisma.provider.update({ where: { providerId: 'PROV-A' }, data: { contractActive: false } });
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('returns NO_ELIGIBLE_VENDOR when no assignment matches', async () => {
    const result = await resolver.resolve({ countryIso2: 'KE', serviceType: 'Overflight' });
    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('an inactive assignment row is excluded', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, active: false });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- vendor-resolver.service.spec.ts`
Expected: 13 tests pass.

- [ ] **Step 5: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/vendor-assignments/vendor-resolver.service.ts src/server/modules/vendor-assignments/vendor-resolver.service.spec.ts src/server/modules/vendor-assignments/vendor-assignments.module.ts
git commit -m "feat: add VendorResolverService (core resolution algorithm)"
```

---

## Final Verification

After all 3 tasks:
- [ ] Run the full server suite: `npm test` — expect all suites green, including `vendor-assignments.service.spec.ts` and `vendor-resolver.service.spec.ts`.
- [ ] `npm run build:server` clean.
- [ ] Confirm (by reading the diff, not just trusting task reports) that no task touched `services.service.ts`, `legs.service.ts`, or `trips.service.ts`.
- [ ] Memory file `project_viq.md` updated: sub-project 1 of the Vendor Assignment Engine complete; sub-projects 2-4 remain, per the design spec's decomposition.
