# Reusable Permit Authorizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coordinator record that an operator already holds a verified Blanket/Block/Seasonal permit for a country, and have every future trip's overflight/landing permit generation for that operator+country auto-confirm instead of starting from scratch.

**Architecture:** A new `PermitAuthorization` Prisma model, scoped to `Operator` (not trip or tail number), matched automatically inside the existing `generateOverflightServices`/`reconcileOverflightServices`/`generateArrivalServices` functions in `services.service.ts` via a new `resolveAuthorization` helper. A new `PermitAuthorizationsModule` handles CRUD + Admin-gated verify/revoke. A manual link endpoint on `ServicesController` covers the case where an authorization is verified after a service already exists. Client-side, `PermitAuthorization` is reference data managed from a new Admin > Assets tab, following the exact `Operator`/`CountryFee` pattern already in `dataStore.ts` and `AdminAssets.tsx`.

**Tech Stack:** NestJS 10 + Prisma 5.22 + PostgreSQL (server), React 19 + Vite + TypeScript (client, no test framework — verify with `npm run build:client`). Jest integration tests run against the real `jetflow_test` database via `truncateAll()` — never mock Prisma.

**Spec:** [docs/superpowers/specs/2026-09-07-viq-permit-authorizations-design.md](../specs/2026-09-07-viq-permit-authorizations-design.md)

## Global Constraints

- No aircraft/callsign-level matching — authorizations match at Operator level only (operatorId + countryIso2 + serviceType + validity window covering the leg's `etdZ`).
- `status` on `PermitAuthorization` has exactly three stored values: `'Draft'`, `'Verified'`, `'Revoked'`. There is no stored `'Expired'` value and no "expire" action — a past-`validUntil` authorization is simply excluded from matching by the date-range check, and the Admin UI computes an "Expired" display badge from `validUntil < now` without touching `status`.
- `authorizationType` is a small fixed string union (`'Blanket' | 'Block' | 'Seasonal'`), validated with `@IsIn` — not an admin-editable catalog table, matching the `ServiceResponsibility` precedent from the prior §11 slice.
- `docId` is a plain optional string field (no Prisma relation) pointing at the existing, working `DocAttachment` model (`docs` module) — never the newer, still-unfinished `documents` module.
- An authorization can only be edited (`PATCH`) while `status = 'Draft'`. Once `'Verified'`, only `/revoke` can change it.
- `/verify` and `/revoke` are Admin-only, gated the same way the existing reopen-Complete-trip feature gates its Admin-only transition: read `request.user.role` server-side via `@CurrentUser()`, never trust a client-supplied role field.
- Revoking an authorization never retroactively un-confirms services already linked to it — it only audit-logs those services as flagged for manual review, mirroring `reconcileOverflightServices`'s existing "never silently destroy a coordinator's confirmed work" caution.
- Matching only ever affects a service at the moment it is newly created by generation — it never modifies an existing service. Retroactive linking is a separate, explicit action (`PATCH /services/:svcId/link-authorization`).
- New Prisma model requires a real migration (`npx prisma migrate dev`), run from `src/server` — confirm no dev server (`nest start --watch`) is currently holding a lock on `node_modules/.prisma/client/query_engine-windows.dll.node` before running it; stop it first if so, and restart + `npm run build:client` afterward per the standing "commit and keep a local preview running" instruction.

---

### Task 1: Prisma schema — `PermitAuthorization` model + `Service.authorizationId`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev --name add_permit_authorizations` (generates `prisma/migrations/<timestamp>_add_permit_authorizations/`)

**Interfaces:**
- Produces: `PermitAuthorization` Prisma model (fields: `id`, `operatorId`, `countryIso2`, `serviceType`, `authorizationType`, `referenceNumber`, `validFrom`, `validUntil`, `status`, `docId`, `notes`, `createdAt`, `createdBy`, `verifiedBy`, `verifiedAt`), and `Service.authorizationId` (nullable FK). Every later task's Prisma calls (`prisma.permitAuthorization.*`, `service.authorizationId`) depend on this.

- [ ] **Step 1: Add the `PermitAuthorization` model**

In `prisma/schema.prisma`, add this model directly after the `ServiceTypeDef` model (after line 265, before `model LegPurposeDef`):

```prisma
model PermitAuthorization {
  id                String    @id @default(cuid())
  operatorId        String    @map("operator_id")
  countryIso2       String    @map("country_iso2")
  serviceType       String    @map("service_type")       // 'Permit' | 'Overflight'
  authorizationType String    @map("authorization_type") // 'Blanket' | 'Block' | 'Seasonal'
  referenceNumber   String    @map("reference_number")
  validFrom         DateTime  @map("valid_from")
  validUntil        DateTime  @map("valid_until")
  status            String    @default("Draft")          // 'Draft' | 'Verified' | 'Revoked'
  docId             String?   @map("doc_id")
  notes             String?
  createdAt         DateTime  @default(now()) @map("created_at")
  createdBy         String    @map("created_by")
  verifiedBy        String?   @map("verified_by")
  verifiedAt        DateTime? @map("verified_at")

  operator Operator  @relation(fields: [operatorId], references: [operatorId])
  country  Country   @relation(fields: [countryIso2], references: [iso2])
  services Service[]

  @@index([operatorId, countryIso2, serviceType, status])
  @@map("permit_authorizations")
}
```

- [ ] **Step 2: Add the back-relations Prisma requires**

In `model Operator` (around line 175), add `permitAuthorizations PermitAuthorization[]` alongside the existing `aircraft`/`clients`/`channels` relation fields:

```prisma
  aircraft Aircraft[]
  clients  Client[]
  channels ContactChannel[]
  permitAuthorizations PermitAuthorization[]

  @@map("operators")
```

In `model Country` (lines 30-33), add `permitAuthorizations PermitAuthorization[]` after the existing `fees` relation field (confirmed by reading the model directly — it has exactly four relation fields today):

```prisma
  airports         Airport[]
  countryRules     CountryRule[]
  messageTemplates MessageTemplate[]
  fees             CountryFee[]
  permitAuthorizations PermitAuthorization[]
```

- [ ] **Step 3: Add `authorizationId` to `Service`**

In `model Service`, add the field after `responsibility` (line 482) and the relation after the existing `trip`/`provider` relations (lines 484-485 — confirmed by reading the model directly, exactly these two relations exist today):

```prisma
  responsibility  String  @default("VIQ Arrangement")
  authorizationId String? @map("authorization_id")

  trip          Trip                  @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  provider      Provider?             @relation(fields: [providerId], references: [providerId])
  authorization PermitAuthorization?  @relation(fields: [authorizationId], references: [id])
```

- [ ] **Step 4: Generate and apply the migration**

Run from `src/server`'s project root (`C:\Backups\InsiderTechSol\Aviation\viq`):
```bash
npx prisma migrate dev --name add_permit_authorizations
```
Expected: a new directory under `prisma/migrations/` and `Your database is now in sync with your schema.` If this fails with `EPERM` on `query_engine-windows.dll.node`, a running `nest start --watch`/`node dist/main.js` process is holding the file lock — find and stop it (Windows: `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"` filtered by command line, then `Stop-Process -Force`), then retry.

- [ ] **Step 5: Verify the client generates cleanly**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` with no errors, confirming `prisma.permitAuthorization` and `Service.authorizationId` are now typed.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add PermitAuthorization model and Service.authorizationId"
```

---

### Task 2: `PermitAuthorizationsModule` — CRUD + Admin-gated verify/revoke

**Files:**
- Create: `src/server/modules/permit-authorizations/dto/create-permit-authorization.dto.ts`
- Create: `src/server/modules/permit-authorizations/dto/update-permit-authorization.dto.ts`
- Create: `src/server/modules/permit-authorizations/permit-authorizations.service.ts`
- Create: `src/server/modules/permit-authorizations/permit-authorizations.controller.ts`
- Create: `src/server/modules/permit-authorizations/permit-authorizations.module.ts`
- Create: `src/server/modules/permit-authorizations/permit-authorizations.spec.ts`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (`src/server/prisma/prisma.service.ts`), `AuditService.log`/`AuditService.logDiff` (`src/server/modules/audit/audit.service.ts`, signatures: `log(user, table, recordId, field, oldValue, newValue)`, `logDiff(user, table, recordId, before, after)`), `CurrentUser`/`CurrentUserPayload` from `src/server/modules/auth/current-user.decorator.ts`.
- Produces: `PermitAuthorizationsService` with `findAll(filters)`, `findOne(id)`, `create(dto)`, `update(id, dto)`, `verify(id, role)`, `revoke(id, role)` — used by Task 4's candidates lookup and by the client.

- [ ] **Step 1: Write the DTOs**

`src/server/modules/permit-authorizations/dto/create-permit-authorization.dto.ts`:
```ts
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const SERVICE_TYPES = ['Permit', 'Overflight'] as const;
export const AUTHORIZATION_TYPES = ['Blanket', 'Block', 'Seasonal'] as const;

export class CreatePermitAuthorizationDto {
  @IsString()
  @MaxLength(200)
  operatorId!: string;

  @IsString()
  @MaxLength(10)
  countryIso2!: string;

  @IsIn(SERVICE_TYPES)
  serviceType!: (typeof SERVICE_TYPES)[number];

  @IsIn(AUTHORIZATION_TYPES)
  authorizationType!: (typeof AUTHORIZATION_TYPES)[number];

  @IsString()
  @MaxLength(200)
  referenceNumber!: string;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validUntil!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  docId?: string;

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

`src/server/modules/permit-authorizations/dto/update-permit-authorization.dto.ts`:
```ts
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AUTHORIZATION_TYPES } from './create-permit-authorization.dto';

const SERVICE_TYPES = ['Permit', 'Overflight'] as const;

export class UpdatePermitAuthorizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  operatorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryIso2?: string;

  @IsOptional()
  @IsIn(SERVICE_TYPES)
  serviceType?: (typeof SERVICE_TYPES)[number];

  @IsOptional()
  @IsIn(AUTHORIZATION_TYPES)
  authorizationType?: (typeof AUTHORIZATION_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referenceNumber?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  docId?: string;

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

- [ ] **Step 2: Write the failing tests**

`src/server/modules/permit-authorizations/permit-authorizations.spec.ts`:
```ts
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermitAuthorizationsService } from './permit-authorizations.service';
import { truncateAll } from '../../test/db-test-utils';

describe('PermitAuthorizationsService', () => {
  let prisma: PrismaService;
  let authorizations: PermitAuthorizationsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    authorizations = new PermitAuthorizationsService(prisma, audit);
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
  });

  it('always creates as Draft regardless of what the request body claims', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-1', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
      status: 'Verified',
    } as any);
    expect(created.status).toBe('Draft');
  });

  it('verify requires Admin role and records who verified it', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-2', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
    });
    await expect(authorizations.verify(created.id, 'Coordinator', 'someone')).rejects.toThrow(ForbiddenException);
    const verified = await authorizations.verify(created.id, 'Admin', 'admin-user');
    expect(verified.status).toBe('Verified');
    expect(verified.verifiedBy).toBe('admin-user');
  });

  it('revoke requires Admin role and does not delete the row', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-3', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
    });
    await authorizations.verify(created.id, 'Admin');
    await expect(authorizations.revoke(created.id, 'Coordinator')).rejects.toThrow(ForbiddenException);
    const revoked = await authorizations.revoke(created.id, 'Admin');
    expect(revoked.status).toBe('Revoked');
  });

  it('blocks editing once Verified', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-4', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
    });
    await authorizations.verify(created.id, 'Admin');
    await expect(authorizations.update(created.id, { referenceNumber: 'REF-5' })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- permit-authorizations.spec.ts`
Expected: FAIL — `Cannot find module './permit-authorizations.service'`.

- [ ] **Step 4: Implement the service**

`src/server/modules/permit-authorizations/permit-authorizations.service.ts`:
```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePermitAuthorizationDto } from './dto/create-permit-authorization.dto';
import { UpdatePermitAuthorizationDto } from './dto/update-permit-authorization.dto';

@Injectable()
export class PermitAuthorizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(filters: { operatorId?: string; countryIso2?: string; serviceType?: string; status?: string }) {
    return this.prisma.permitAuthorization.findMany({
      where: {
        operatorId: filters.operatorId,
        countryIso2: filters.countryIso2,
        serviceType: filters.serviceType,
        status: filters.status,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const auth = await this.prisma.permitAuthorization.findUnique({ where: { id } });
    if (!auth) throw new NotFoundException(`PermitAuthorization ${id} not found`);
    return auth;
  }

  async create(dto: CreatePermitAuthorizationDto) {
    const user = dto.user || 'SYSTEM';
    const auth = await this.prisma.permitAuthorization.create({
      data: {
        operatorId: dto.operatorId,
        countryIso2: dto.countryIso2,
        serviceType: dto.serviceType,
        authorizationType: dto.authorizationType,
        referenceNumber: dto.referenceNumber,
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
        docId: dto.docId,
        notes: dto.notes,
        createdBy: user,
        status: 'Draft',
      },
    });
    await this.audit.log(user, 'PermitAuthorization', auth.id, 'Created', '', auth.id);
    return auth;
  }

  async update(id: string, dto: UpdatePermitAuthorizationDto) {
    const before = await this.findOne(id);
    if (before.status === 'Verified') {
      throw new BadRequestException('Cannot edit a Verified authorization — revoke it first');
    }
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const auth = await this.prisma.permitAuthorization.update({ where: { id }, data });
    await this.audit.logDiff(user, 'PermitAuthorization', id, before as unknown as Record<string, unknown>, auth as unknown as Record<string, unknown>);
    return auth;
  }

  async verify(id: string, role: string | undefined, user = 'SYSTEM') {
    if (role !== 'Admin') throw new ForbiddenException('Verifying an authorization requires the Admin role');
    const before = await this.findOne(id);
    if (before.status !== 'Draft') {
      throw new BadRequestException(`Cannot verify from status "${before.status}"`);
    }
    const auth = await this.prisma.permitAuthorization.update({
      where: { id },
      data: { status: 'Verified', verifiedBy: user, verifiedAt: new Date() },
    });
    await this.audit.log(user, 'PermitAuthorization', id, 'Verified', before.status, 'Verified');
    return auth;
  }

  async revoke(id: string, role: string | undefined, user = 'SYSTEM') {
    if (role !== 'Admin') throw new ForbiddenException('Revoking an authorization requires the Admin role');
    const before = await this.findOne(id);
    if (before.status === 'Revoked') {
      throw new BadRequestException('Already revoked');
    }
    const auth = await this.prisma.permitAuthorization.update({ where: { id }, data: { status: 'Revoked' } });
    await this.audit.log(user, 'PermitAuthorization', id, 'Revoked', before.status, 'Revoked');

    const linkedServices = await this.prisma.service.findMany({ where: { authorizationId: id } });
    for (const svc of linkedServices) {
      await this.audit.log(
        user, 'Service', svc.svcId, 'FlaggedStale', svc.status,
        `Linked authorization ${id} was revoked — review manually.`,
      );
    }
    return auth;
  }
}
```

Note: `verify(id, role, user)` and `revoke(id, role, user)` take the acting user's role (for the Admin gate) and username (for the audit trail / `verifiedBy`) as **separate** parameters — the controller passes both from `@CurrentUser()`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- permit-authorizations.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the controller**

`src/server/modules/permit-authorizations/permit-authorizations.controller.ts`:
```ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermitAuthorizationsService } from './permit-authorizations.service';
import { CreatePermitAuthorizationDto } from './dto/create-permit-authorization.dto';
import { UpdatePermitAuthorizationDto } from './dto/update-permit-authorization.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('permit-authorizations')
export class PermitAuthorizationsController {
  constructor(private readonly authorizations: PermitAuthorizationsService) {}

  @Get()
  findAll(
    @Query('operatorId') operatorId?: string,
    @Query('countryIso2') countryIso2?: string,
    @Query('serviceType') serviceType?: string,
    @Query('status') status?: string,
  ) {
    return this.authorizations.findAll({ operatorId, countryIso2, serviceType, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authorizations.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePermitAuthorizationDto) {
    return this.authorizations.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePermitAuthorizationDto) {
    return this.authorizations.update(id, dto);
  }

  @Post(':id/verify')
  verify(@Param('id') id: string, @CurrentUser() currentUser?: CurrentUserPayload, @Query('user') userOverride?: string) {
    return this.authorizations.verify(id, currentUser?.role, userOverride ?? currentUser?.username);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @CurrentUser() currentUser?: CurrentUserPayload, @Query('user') userOverride?: string) {
    return this.authorizations.revoke(id, currentUser?.role, userOverride ?? currentUser?.username);
  }
}
```

- [ ] **Step 7: Write the module and register it**

`src/server/modules/permit-authorizations/permit-authorizations.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PermitAuthorizationsService } from './permit-authorizations.service';
import { PermitAuthorizationsController } from './permit-authorizations.controller';

@Module({
  controllers: [PermitAuthorizationsController],
  providers: [PermitAuthorizationsService],
  exports: [PermitAuthorizationsService],
})
export class PermitAuthorizationsModule {}
```

In `src/server/app.module.ts`, add the import after `ServiceTypesModule` (line 17):
```ts
import { PermitAuthorizationsModule } from './modules/permit-authorizations/permit-authorizations.module';
```
And add `PermitAuthorizationsModule,` to the `imports` array after `ServiceTypesModule,` (line 54).

- [ ] **Step 8: Run the full server test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/server/modules/permit-authorizations src/server/app.module.ts
git commit -m "feat: add PermitAuthorizationsModule (CRUD + Admin-gated verify/revoke)"
```

---

### Task 3: Auto-matching at service-generation time

**Files:**
- Modify: `src/server/modules/services/services.service.ts`
- Create: `src/server/modules/services/permit-authorization-matching.spec.ts`

**Interfaces:**
- Consumes: `prisma.permitAuthorization`, `prisma.aircraft` (Task 1). `Service.authorizationId` field.
- Produces: `resolveAuthorization(registration, countryIso2, serviceType, atDate)` private method on `ServicesService` — reused by Task 4's manual-link validation.

- [ ] **Step 1: Write the failing tests**

`src/server/modules/services/permit-authorization-matching.spec.ts`:
```ts
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Permit authorization matching at generation time', () => {
  let prisma: PrismaService;
  let services: ServicesService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedTripAndLeg(overrides: { registration?: string } = {}) {
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({
      data: { registration: overrides.registration ?? 'N1TEST', icaoType: 'GLF6', currentOperatorId: 'OP-1' },
    });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
    await prisma.trip.create({ data: { tripId: 'TEST-AUTH-1', client: 'Test Client', registration: overrides.registration ?? 'N1TEST' } });
    const leg = await prisma.leg.create({
      data: {
        legId: 'TEST-AUTH-1-LEG-1', tripId: 'TEST-AUTH-1', seq: 1,
        depIcao: 'HKJK', arrIcao: 'FAJS', etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 3, paxCount: 2, crewCount: 2, countriesOverflown: ['KE'],
      },
    });
    return leg;
  }

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    services = new ServicesService(prisma, audit);
  });

  it('auto-confirms a new Overflight service when a Verified authorization covers it', async () => {
    const leg = await seedTripAndLeg();
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'BLANKET-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('Confirmed');
    expect(created[0].authorizationId).toBe(auth.id);
    expect(created[0].refNumber).toBe('BLANKET-1');
  });

  it('does not match a Draft (unverified) authorization', async () => {
    const leg = await seedTripAndLeg();
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'DRAFT-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Draft', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
    expect(created[0].authorizationId).toBeNull();
  });

  it('does not match an authorization whose validity window excludes the leg date', async () => {
    const leg = await seedTripAndLeg();
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'EXPIRED-1', validFrom: new Date('2020-01-01'), validUntil: new Date('2021-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
  });

  it('does not match when the trip registration has no known Aircraft row', async () => {
    const leg = await seedTripAndLeg({ registration: 'N-UNKNOWN' });
    await prisma.aircraft.deleteMany({ where: { registration: 'N-UNKNOWN' } });
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'ORPHAN-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
  });

  it('does not match a different operator\u2019s authorization', async () => {
    const leg = await seedTripAndLeg();
    await prisma.operator.create({ data: { operatorId: 'OP-OTHER', name: 'Other Operator', fleet: [] } });
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-OTHER', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'OTHER-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- permit-authorization-matching.spec.ts`
Expected: FAIL — services still generate `Not Started` even when a Verified authorization exists (no matching logic yet), so the first test's assertions fail.

- [ ] **Step 3: Implement `resolveAuthorization` and wire it into generation**

In `src/server/modules/services/services.service.ts`, add this private method after `dismissedCountries` (after line 255, before the `reconcileOverflightServices` comment block):

```ts
  // Operator-level match only (see design spec's "Coverage matching" — no
  // per-aircraft/callsign tracking). Returns null (never throws) whenever
  // resolution isn't possible, so callers can always fall back to normal
  // Not Started generation.
  private async resolveAuthorization(
    registration: string | null,
    countryIso2: string,
    serviceType: string,
    atDate: Date,
  ) {
    if (!registration) return null;
    const aircraft = await this.prisma.aircraft.findUnique({ where: { registration } });
    if (!aircraft) return null;
    return this.prisma.permitAuthorization.findFirst({
      where: {
        operatorId: aircraft.currentOperatorId,
        countryIso2,
        serviceType,
        status: 'Verified',
        validFrom: { lte: atDate },
        validUntil: { gte: atDate },
      },
    });
  }
```

Modify `createOverflightService` (lines 192-220) to look up the trip's registration and apply a match. Change the signature and body:

```ts
  private async createOverflightService(
    leg: { legId: string; tripId: string; depIcao: string; arrIcao: string; etdZ: Date },
    iso2: string,
    user: string,
    notes: string,
  ): Promise<Service> {
    const leadHours = await this.leadTimeHours(iso2, 'Overflight', 48);
    const requiredByZ = new Date(leg.etdZ.getTime() - leadHours * 60 * 60 * 1000);
    const providerId = await this.resolveProvider('Overflight', leg.depIcao, iso2);
    const trip = await this.prisma.trip.findUnique({ where: { tripId: leg.tripId }, select: { registration: true } });
    const auth = await this.resolveAuthorization(trip?.registration ?? null, iso2, 'Overflight', leg.etdZ);
    const svc = await this.prisma.service.create({
      data: {
        svcId: `${leg.legId}-OVF-${iso2}`,
        tripId: leg.tripId,
        scopeType: 'SEGMENT',
        scopeId: leg.legId,
        serviceType: 'Overflight',
        providerId,
        status: auth ? 'Confirmed' : 'Not Started',
        basedOnEtdZ: leg.etdZ,
        requiredByZ,
        urgency: computeUrgency(requiredByZ),
        assignedTo: 'Unassigned',
        notes: auth ? `${notes} Auto-confirmed via ${auth.authorizationType} permit ${auth.referenceNumber}.` : notes,
        countryIso2: iso2,
        refNumber: auth?.referenceNumber ?? '',
        validityZ: auth?.validUntil,
        authorizationId: auth?.id,
      },
    });
    await this.audit.log(user, 'Service', svc.svcId, 'Created', '', svc.svcId);
    return svc;
  }
```

Modify `generateArrivalServices`'s `make()` helper (lines 325-350) the same way — resolve the trip once at the top of `generateArrivalServices` (not per-call, since `make()` is called up to twice per leg) and pass it through:

```ts
  async generateArrivalServices(legId: string, opts: { departureGroundHandling?: boolean } = {}, user = 'SYSTEM') {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    const trip = await this.prisma.trip.findUnique({ where: { tripId: leg.tripId }, select: { registration: true } });

    const existing = await this.prisma.service.findMany({
      where: { tripId: leg.tripId, scopeType: 'LEG', scopeId: legId },
    });
    const has = (serviceType: string, iso2: string) =>
      existing.some((s) => s.serviceType === serviceType && s.countryIso2 === iso2);
    const dismissed = await this.prisma.dismissedServiceCandidate.findMany({
      where: { scopeType: 'LEG', scopeId: legId },
    });
    const isDismissed = (serviceType: string, iso2: string) =>
      dismissed.some((d) => d.serviceType === serviceType && d.countryIso2 === iso2);

    const created: Service[] = [];
    const make = async (serviceType: ServiceType, iso2: string, icao: string, direction: 'ARR' | 'DEP', notes: string) => {
      if (has(serviceType, iso2) || isDismissed(serviceType, iso2)) return;
      const leadHours = await this.leadTimeHours(iso2, serviceType, 48);
      const requiredByZ = new Date(leg.etdZ.getTime() - leadHours * 60 * 60 * 1000);
      const providerId = await this.resolveProvider(serviceType, icao, iso2);
      const auth = serviceType === 'Permit'
        ? await this.resolveAuthorization(trip?.registration ?? null, iso2, 'Permit', leg.etdZ)
        : null;
      const svc = await this.prisma.service.create({
        data: {
          svcId: `${legId}-${serviceType.toUpperCase()}-${direction}-${iso2}`,
          tripId: leg.tripId,
          scopeType: 'LEG',
          scopeId: legId,
          serviceType,
          providerId,
          status: auth ? 'Confirmed' : 'Not Started',
          basedOnEtdZ: leg.etdZ,
          requiredByZ,
          urgency: computeUrgency(requiredByZ),
          assignedTo: 'Unassigned',
          notes: auth ? `${notes} Auto-confirmed via ${auth.authorizationType} permit ${auth.referenceNumber}.` : notes,
          countryIso2: iso2,
          icao,
          refNumber: auth?.referenceNumber ?? '',
          validityZ: auth?.validUntil,
          authorizationId: auth?.id,
        },
      });
      await this.audit.log(user, 'Service', svc.svcId, 'Created', '', svc.svcId);
      created.push(svc);
    };

    const arrAirport = await this.prisma.airport.findUnique({ where: { icao: leg.arrIcao } });
    if (arrAirport) {
      const arrCountry = await this.prisma.country.findUnique({ where: { iso2: arrAirport.countryIso2 } });
      if (arrCountry?.landingPermitRequired) {
        await make('Permit', arrAirport.countryIso2, arrAirport.icao, 'ARR', `Landing permit for ${arrAirport.icao} arrival.`);
      }
      await make('GroundHandling', arrAirport.countryIso2, arrAirport.icao, 'ARR', `Ground handling at ${arrAirport.icao} arrival.`);
    }

    if (opts.departureGroundHandling) {
      const depAirport = await this.prisma.airport.findUnique({ where: { icao: leg.depIcao } });
      if (depAirport) {
        await make('GroundHandling', depAirport.countryIso2, depAirport.icao, 'DEP', `Ground handling at ${depAirport.icao} departure — arranged on request.`);
      }
    }

    return created;
  }
```

`reconcileOverflightServices` calls the same (now-updated) `createOverflightService`, so it inherits matching automatically — no separate change needed there.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- permit-authorization-matching.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full server test suite**

Run: `npm test`
Expected: PASS, no regressions (existing `service-regeneration.spec.ts` and `service-responsibility.spec.ts` tests must still pass unchanged — they create no `PermitAuthorization` rows, so `resolveAuthorization` returns `null` for all of them and behavior is identical to before).

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/services/services.service.ts src/server/modules/services/permit-authorization-matching.spec.ts
git commit -m "feat: auto-confirm generated services when a Verified permit authorization covers them"
```

---

### Task 4: Manual retroactive link + candidates endpoint

**Files:**
- Modify: `src/server/modules/services/services.service.ts`
- Modify: `src/server/modules/services/services.controller.ts`
- Create: `src/server/modules/services/link-authorization.spec.ts`

**Interfaces:**
- Consumes: `resolveAuthorization`'s matching semantics (Task 3), but as an explicit-id validation rather than a search.
- Produces: `ServicesService.linkAuthorization(svcId, authorizationId, user)`, `ServicesService.authorizationCandidates(svcId)` — both used directly by the controller; the candidates shape (`{ authorization: PermitAuthorization, eligible: boolean, reason?: string }[]`) is what Task 6's client UI consumes.

- [ ] **Step 1: Write the failing tests**

`src/server/modules/services/link-authorization.spec.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Manual retroactive authorization link', () => {
  let prisma: PrismaService;
  let services: ServicesService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    services = new ServicesService(prisma, audit);
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({ data: { registration: 'N1TEST', icaoType: 'GLF6', currentOperatorId: 'OP-1' } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
    await prisma.trip.create({ data: { tripId: 'TEST-LINK-1', client: 'Test Client', registration: 'N1TEST' } });
    await prisma.service.create({
      data: {
        svcId: 'TEST-LINK-1-SVC-1', tripId: 'TEST-LINK-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
  });

  it('links a matching Verified authorization and pre-confirms the service', async () => {
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const linked = await services.linkAuthorization('TEST-LINK-1-SVC-1', auth.id, 'coordinator');
    expect(linked.status).toBe('Confirmed');
    expect(linked.authorizationId).toBe(auth.id);
    expect(linked.refNumber).toBe('REF-1');
  });

  it('rejects linking an authorization for a different country', async () => {
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'TZ', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-2', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    await expect(services.linkAuthorization('TEST-LINK-1-SVC-1', auth.id, 'coordinator')).rejects.toThrow(BadRequestException);
  });

  it('candidates lists matching authorizations and flags non-Verified ones as ineligible', async () => {
    const verified = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-3', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const draft = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Block',
        referenceNumber: 'REF-4', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Draft', createdBy: 'SYSTEM',
      },
    });
    const candidates = await services.authorizationCandidates('TEST-LINK-1-SVC-1');
    expect(candidates).toHaveLength(2);
    const verifiedEntry = candidates.find((c) => c.authorization.id === verified.id)!;
    const draftEntry = candidates.find((c) => c.authorization.id === draft.id)!;
    expect(verifiedEntry.eligible).toBe(true);
    expect(draftEntry.eligible).toBe(false);
    expect(draftEntry.reason).toMatch(/Draft/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- link-authorization.spec.ts`
Expected: FAIL — `services.linkAuthorization is not a function`.

- [ ] **Step 3: Implement `linkAuthorization` and `authorizationCandidates`**

In `src/server/modules/services/services.service.ts`, add these two public methods after `remove` (after line 148, before `refreshUrgency`):

```ts
  // Validates the named authorization actually matches this service (same
  // operator/country/serviceType, and the service's requiredByZ falls in
  // its validity window) before applying — covers the common case where an
  // authorization is verified after the service already exists.
  async linkAuthorization(svcId: string, authorizationId: string, user = 'SYSTEM') {
    const svc = await this.findOne(svcId);
    const auth = await this.prisma.permitAuthorization.findUnique({ where: { id: authorizationId } });
    if (!auth) throw new NotFoundException(`PermitAuthorization ${authorizationId} not found`);
    if (auth.status !== 'Verified') {
      throw new BadRequestException(`Authorization ${authorizationId} is not Verified (status: ${auth.status})`);
    }
    if (!svc.countryIso2 || auth.countryIso2 !== svc.countryIso2 || auth.serviceType !== svc.serviceType) {
      throw new BadRequestException('Authorization does not match this service\u2019s country/service type');
    }
    const trip = await this.prisma.trip.findUnique({ where: { tripId: svc.tripId }, select: { registration: true } });
    const aircraft = trip?.registration ? await this.prisma.aircraft.findUnique({ where: { registration: trip.registration } }) : null;
    if (!aircraft || aircraft.currentOperatorId !== auth.operatorId) {
      throw new BadRequestException('Authorization operator does not match this trip\u2019s aircraft operator');
    }
    if (svc.requiredByZ < auth.validFrom || svc.requiredByZ > auth.validUntil) {
      throw new BadRequestException('Authorization validity window does not cover this service\u2019s required date');
    }

    const updated = await this.prisma.service.update({
      where: { svcId },
      data: {
        status: 'Confirmed',
        refNumber: auth.referenceNumber,
        validityZ: auth.validUntil,
        authorizationId: auth.id,
        notes: `${svc.notes} Linked to ${auth.authorizationType} permit ${auth.referenceNumber}.`.trim(),
      },
    });
    await this.audit.log(user, 'Service', svcId, 'LinkedAuthorization', '', authorizationId);
    return withServiceTransitions(updated);
  }

  // Resolves operator/country/serviceType server-side from the service and
  // its trip (same resolution resolveAuthorization uses) rather than
  // requiring the client to look up Trip -> Aircraft -> Operator itself.
  async authorizationCandidates(svcId: string) {
    const svc = await this.findOne(svcId);
    if (!svc.countryIso2) return [];
    const trip = await this.prisma.trip.findUnique({ where: { tripId: svc.tripId }, select: { registration: true } });
    const aircraft = trip?.registration ? await this.prisma.aircraft.findUnique({ where: { registration: trip.registration } }) : null;
    if (!aircraft) return [];

    const matches = await this.prisma.permitAuthorization.findMany({
      where: { operatorId: aircraft.currentOperatorId, countryIso2: svc.countryIso2, serviceType: svc.serviceType },
      orderBy: { createdAt: 'desc' },
    });
    return matches.map((authorization) => {
      if (authorization.status !== 'Verified') {
        return { authorization, eligible: false, reason: `${authorization.status} — not yet verified` };
      }
      if (svc.requiredByZ < authorization.validFrom || svc.requiredByZ > authorization.validUntil) {
        return { authorization, eligible: false, reason: 'Validity window does not cover this service\u2019s required date' };
      }
      return { authorization, eligible: true };
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- link-authorization.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire up the controller endpoints**

In `src/server/modules/services/services.controller.ts`, add after the `remove` method:

```ts
  @Patch(':svcId/link-authorization')
  linkAuthorization(
    @Param('svcId') svcId: string,
    @Body() body: { authorizationId: string; user?: string },
  ) {
    return this.services.linkAuthorization(svcId, body.authorizationId, body.user);
  }

  @Get(':svcId/authorization-candidates')
  authorizationCandidates(@Param('svcId') svcId: string) {
    return this.services.authorizationCandidates(svcId);
  }
```

Note: `@Get(':svcId/authorization-candidates')` must be registered before `@Get(':svcId')` (line 31) is reached by NestJS's route matching, but NestJS matches routes in declaration order within a controller and `:svcId` is a single dynamic segment — `authorization-candidates` as a literal second path segment does not collide with the single-segment `:svcId` route, so declaration order does not matter here. Add it anywhere in the controller; placing it near `linkAuthorization` keeps the two related endpoints together.

- [ ] **Step 6: Run the full server test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/server/modules/services/services.service.ts src/server/modules/services/services.controller.ts src/server/modules/services/link-authorization.spec.ts
git commit -m "feat: add manual retroactive permit-authorization linking"
```

---

### Task 5: Client types + dataStore CRUD

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Produces: `PermitAuthorization`, `AuthorizationType`, `AuthorizationStatus` types and `getPermitAuthorizationList()`, `savePermitAuthorization()`, `verifyPermitAuthorization()`, `revokePermitAuthorization()`, `getServiceAuthorizationCandidates(svcId)`, `linkServiceAuthorization(svcId, authorizationId)` functions — consumed by Task 6 (Admin tab) and Task 7 (service-level UI).
- Consumes: `apiJson`, `currentUser()`, `preloadReferenceData()`'s existing `Promise.all` structure (all in `dataStore.ts`).

- [ ] **Step 1: Add `Service.AuthorizationID` to the core spine type**

In `src/client/data/types.ts`, in the `Service` interface (around line 214-248), add after `AllowedTransitions?: string[];`:
```ts
  AllowedTransitions?: string[];
  AuthorizationID?: string;
```

- [ ] **Step 2: Add the reference-data types to `dataStore.ts`**

In `src/client/lib/dataStore.ts`, after the `Operator` interface (after line 65), add:
```ts
export type AuthorizationType = 'Blanket' | 'Block' | 'Seasonal';
export type AuthorizationStatus = 'Draft' | 'Verified' | 'Revoked';

export interface PermitAuthorization {
  ID: string;
  OperatorID: string;
  CountryISO2: string;
  ServiceType: string;
  AuthorizationType: AuthorizationType;
  ReferenceNumber: string;
  ValidFrom: string;
  ValidUntil: string;
  Status: AuthorizationStatus;
  DocID?: string;
  Notes?: string;
  CreatedAt: string;
  CreatedBy: string;
  VerifiedBy?: string;
  VerifiedAt?: string;
}

export interface AuthorizationCandidate {
  Authorization: PermitAuthorization;
  Eligible: boolean;
  Reason?: string;
}
```

- [ ] **Step 3: Add `mapServiceFromApi`'s `AuthorizationID` mapping**

In `mapServiceFromApi` (around line 381-411), add after `AllowedTransitions: s.allowedTransitions ?? undefined,`:
```ts
    AllowedTransitions: s.allowedTransitions ?? undefined,
    AuthorizationID: s.authorizationId ?? undefined,
```
Do **not** add `authorizationId` to `mapServiceToApi` — it's never sent through the normal `saveService` PATCH; only `linkServiceAuthorization` (Step 6 below) sets it, via its own dedicated endpoint.

- [ ] **Step 4: Add the mapping function and cache**

After `mapClientFromApi` (after line 1638, before `export async function preloadReferenceData`), add:
```ts
function mapPermitAuthorizationFromApi(a: any): PermitAuthorization {
  return {
    ID: a.id,
    OperatorID: a.operatorId,
    CountryISO2: a.countryIso2,
    ServiceType: a.serviceType,
    AuthorizationType: a.authorizationType,
    ReferenceNumber: a.referenceNumber,
    ValidFrom: a.validFrom,
    ValidUntil: a.validUntil,
    Status: a.status,
    DocID: a.docId ?? undefined,
    Notes: a.notes ?? undefined,
    CreatedAt: a.createdAt,
    CreatedBy: a.createdBy,
    VerifiedBy: a.verifiedBy ?? undefined,
    VerifiedAt: a.verifiedAt ?? undefined,
  };
}

let _permitAuthorizationCache: PermitAuthorization[] | null = null;
```

- [ ] **Step 5: Wire into `preloadReferenceData`**

In `preloadReferenceData` (lines 1385-1406), add `permitAuthorizations` to the `Promise.all` array and its destructuring, and set the cache:
```ts
export async function preloadReferenceData(): Promise<void> {
  const [aircraft, providers, airports, countries, operators, messageTemplates, countryFees, countryRules, clients, permitAuthorizations] = await Promise.all([
    apiJson<any[]>('/reference/aircraft'),
    apiJson<any[]>('/reference/providers'),
    apiJson<any[]>('/reference/airports'),
    apiJson<any[]>('/reference/countries'),
    apiJson<any[]>('/reference/operators'),
    apiJson<any[]>('/message-templates'),
    apiJson<any[]>('/reference/country-fees'),
    apiJson<any[]>('/reference/country-rules'),
    apiJson<any[]>('/clients'),
    apiJson<any[]>('/permit-authorizations'),
  ]);
  _aircraftCache = aircraft.map(mapAircraftFromApi);
  _providerCache = providers.map(mapProviderFromApi);
  _airportCache = airports.map(mapAirportFromApi);
  _countryCache = countries.map(mapCountryFromApi);
  _operatorCache = operators.map(mapOperatorFromApi);
  _messageTemplateCache = messageTemplates.map(mapMessageTemplateFromApi);
  _countryFeeCache = countryFees.map(mapCountryFeeFromApi);
  _countryRuleCache = countryRules.map(mapCountryRuleFromApi);
  _clientCache = clients.map(mapClientFromApi);
  _permitAuthorizationCache = permitAuthorizations.map(mapPermitAuthorizationFromApi);
}
```

- [ ] **Step 6: Add the CRUD + verify/revoke + link functions**

After `deleteOperator` (after line 1621), add:
```ts
export function getPermitAuthorizationList(): PermitAuthorization[] {
  return _permitAuthorizationCache ?? [];
}

export async function savePermitAuthorization(
  a: Omit<PermitAuthorization, 'ID' | 'Status' | 'CreatedAt' | 'CreatedBy' | 'VerifiedBy' | 'VerifiedAt'> & { ID?: string },
  user = currentUser(),
): Promise<PermitAuthorization> {
  const body = JSON.stringify({
    operatorId: a.OperatorID,
    countryIso2: a.CountryISO2,
    serviceType: a.ServiceType,
    authorizationType: a.AuthorizationType,
    referenceNumber: a.ReferenceNumber,
    validFrom: a.ValidFrom,
    validUntil: a.ValidUntil,
    docId: a.DocID,
    notes: a.Notes,
    user,
  });
  const row = a.ID
    ? await apiJson<any>(`/permit-authorizations/${a.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/permit-authorizations', { method: 'POST', body });
  const mapped = mapPermitAuthorizationFromApi(row);
  const list = getPermitAuthorizationList();
  const idx = list.findIndex((x) => x.ID === mapped.ID);
  _permitAuthorizationCache = idx >= 0 ? list.map((x, i) => (i === idx ? mapped : x)) : [...list, mapped];
  return mapped;
}

export async function verifyPermitAuthorization(id: string, user = currentUser()): Promise<PermitAuthorization> {
  const row = await apiJson<any>(`/permit-authorizations/${id}/verify?user=${encodeURIComponent(user)}`, { method: 'POST' });
  const mapped = mapPermitAuthorizationFromApi(row);
  const list = getPermitAuthorizationList();
  _permitAuthorizationCache = list.map((x) => (x.ID === mapped.ID ? mapped : x));
  return mapped;
}

export async function revokePermitAuthorization(id: string, user = currentUser()): Promise<PermitAuthorization> {
  const row = await apiJson<any>(`/permit-authorizations/${id}/revoke?user=${encodeURIComponent(user)}`, { method: 'POST' });
  const mapped = mapPermitAuthorizationFromApi(row);
  const list = getPermitAuthorizationList();
  _permitAuthorizationCache = list.map((x) => (x.ID === mapped.ID ? mapped : x));
  return mapped;
}

export async function getServiceAuthorizationCandidates(svcId: string): Promise<AuthorizationCandidate[]> {
  const rows = await apiJson<any[]>(`/services/${svcId}/authorization-candidates`);
  return rows.map((r) => ({
    Authorization: mapPermitAuthorizationFromApi(r.authorization),
    Eligible: r.eligible,
    Reason: r.reason ?? undefined,
  }));
}

export async function linkServiceAuthorization(svcId: string, authorizationId: string, user = currentUser()): Promise<Service> {
  const row = await apiJson<any>(`/services/${svcId}/link-authorization`, {
    method: 'PATCH',
    body: JSON.stringify({ authorizationId, user }),
  });
  return mapServiceFromApi(row);
}
```

- [ ] **Step 7: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/client/data/types.ts src/client/lib/dataStore.ts
git commit -m "feat: add client types and dataStore CRUD for permit authorizations"
```

---

### Task 6: Admin > Assets "Authorizations" tab

**Files:**
- Create: `src/client/pages/admin/AdminAuthorizations.tsx`
- Modify: `src/client/pages/admin/AdminAssets.tsx`

**Interfaces:**
- Consumes: Task 5's `getPermitAuthorizationList`, `savePermitAuthorization`, `verifyPermitAuthorization`, `revokePermitAuthorization`, `getOperatorList` (existing), `getCountryList` (existing).
- Produces: `<AuthorizationsPanel />` and `<AuthorizationsList />`-equivalent exports consumed only by `AdminAssets.tsx`'s new tab — no other file imports this.

- [ ] **Step 1: Write the tab component**

This mirrors the real `MasterDetailList`/`EntityListCard`/`DetailPanel`/`MasterDetailShell` APIs (`src/client/components/ui/master-detail-list.tsx`, `src/client/components/ui/master-detail-shell.tsx`) and the exact `OperatorPanel`/`operators` tab pattern already in `AdminAssets.tsx` (lines 563-640 and 1196-1235) — confirmed by reading both files directly, not guessed.

`src/client/pages/admin/AdminAuthorizations.tsx`:
```tsx
import { useState, useEffect } from 'react';
import {
  getPermitAuthorizationList, savePermitAuthorization, verifyPermitAuthorization, revokePermitAuthorization,
  getOperatorList, getCountryList,
} from '@/lib/dataStore';
import type { PermitAuthorization, AuthorizationType } from '@/lib/dataStore';
import { useAuth } from '@/lib/authContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MasterDetailList, EntityListCard, DetailPanel } from '@/components/ui/master-detail-list';
import { MasterDetailShell } from '@/components/ui/master-detail-shell';
import { FileCheck } from 'lucide-react';

const AUTHORIZATION_TYPES: AuthorizationType[] = ['Blanket', 'Block', 'Seasonal'];
const SERVICE_TYPES = ['Permit', 'Overflight'] as const;

function isExpired(a: PermitAuthorization): boolean {
  return new Date(a.ValidUntil).getTime() < Date.now();
}

// AdminAssets.tsx's useSelection()/PanelActions helpers are private to that
// file (not exported) — this tab replicates the same tiny pattern locally
// rather than exporting them out of an unrelated file for one new caller.
function useAuthSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return {
    selectedId, adding,
    select: (id: string) => { setSelectedId(id); setAdding(false); },
    startAdd: () => { setSelectedId(null); setAdding(true); },
    clear: () => { setSelectedId(null); setAdding(false); },
  };
}

function AuthorizationPanel({ authorization, isNew, isAdmin, onSaved, onCancel }: {
  authorization: PermitAuthorization | null; isNew: boolean; isAdmin: boolean;
  onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [operators, setOperators] = useState<{ OperatorID: string; Name: string }[]>([]);
  const [countries, setCountries] = useState<{ ISO2: string; Name: string }[]>([]);
  useEffect(() => {
    setOperators(getOperatorList());
    setCountries(getCountryList());
  }, []);

  const [operatorId, setOperatorId] = useState(authorization?.OperatorID || '');
  const [countryIso2, setCountryIso2] = useState(authorization?.CountryISO2 || '');
  const [serviceType, setServiceType] = useState(authorization?.ServiceType || 'Overflight');
  const [authorizationType, setAuthorizationType] = useState<AuthorizationType>(authorization?.AuthorizationType || 'Blanket');
  const [referenceNumber, setReferenceNumber] = useState(authorization?.ReferenceNumber || '');
  const [validFrom, setValidFrom] = useState(authorization?.ValidFrom?.slice(0, 10) || '');
  const [validUntil, setValidUntil] = useState(authorization?.ValidUntil?.slice(0, 10) || '');
  const [notes, setNotes] = useState(authorization?.Notes || '');
  const [saving, setSaving] = useState(false);

  const canEditFields = isAdmin && (isNew || authorization?.Status === 'Draft');
  const valid = operatorId && countryIso2 && referenceNumber.trim() && validFrom && validUntil;

  const handleSave = async () => {
    if (!canEditFields || !valid) return;
    setSaving(true);
    try {
      const saved = await savePermitAuthorization({
        ID: authorization?.ID,
        OperatorID: operatorId,
        CountryISO2: countryIso2,
        ServiceType: serviceType,
        AuthorizationType: authorizationType,
        ReferenceNumber: referenceNumber.trim(),
        ValidFrom: new Date(validFrom).toISOString(),
        ValidUntil: new Date(validUntil).toISOString(),
        Notes: notes.trim() || undefined,
      });
      onSaved(saved.ID);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!authorization || !isAdmin) return;
    setSaving(true);
    try {
      const updated = await verifyPermitAuthorization(authorization.ID);
      onSaved(updated.ID);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!authorization || !isAdmin) return;
    setSaving(true);
    try {
      const updated = await revokePermitAuthorization(authorization.ID);
      onSaved(updated.ID);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {isNew ? 'Add Authorization' : `Edit ${authorization?.ReferenceNumber}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {authorization && (
          <div className="flex items-center gap-2">
            <Badge variant={authorization.Status === 'Verified' ? 'default' : 'outline'}>{authorization.Status}</Badge>
            {authorization.Status === 'Verified' && isExpired(authorization) && (
              <Badge variant="outline" className="text-amber-600">Expired</Badge>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label>Operator</Label>
          <Select value={operatorId} onValueChange={setOperatorId} disabled={!canEditFields}>
            <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
            <SelectContent>
              {operators.map((o) => <SelectItem key={o.OperatorID} value={o.OperatorID}>{o.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Country</Label>
          <Select value={countryIso2} onValueChange={setCountryIso2} disabled={!canEditFields}>
            <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Service Type</Label>
            <Select value={serviceType} onValueChange={setServiceType} disabled={!canEditFields}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Authorization Type</Label>
            <Select value={authorizationType} onValueChange={(v) => setAuthorizationType(v as AuthorizationType)} disabled={!canEditFields}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTHORIZATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Reference Number</Label>
          <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} disabled={!canEditFields} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Valid From</Label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} disabled={!canEditFields} />
          </div>
          <div className="space-y-1">
            <Label>Valid Until</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={!canEditFields} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEditFields} />
        </div>
        <div className="flex items-center gap-2">
          {canEditFields && (
            <Button onClick={handleSave} disabled={!valid || saving}>{isNew ? 'Create' : 'Save'}</Button>
          )}
          {!isNew && authorization?.Status === 'Draft' && isAdmin && (
            <Button onClick={handleVerify} disabled={saving}>Verify</Button>
          )}
          {!isNew && authorization?.Status === 'Verified' && isAdmin && (
            <Button onClick={handleRevoke} disabled={saving} variant="destructive">Revoke</Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AuthorizationsTab() {
  const { isAdmin } = useAuth();
  const [authorizations, setAuthorizations] = useState<PermitAuthorization[]>([]);
  useEffect(() => { setAuthorizations(getPermitAuthorizationList()); }, []);
  const sel = useAuthSelection();
  const refresh = () => setAuthorizations(getPermitAuthorizationList());
  const selected = authorizations.find((a) => a.ID === sel.selectedId) || null;

  return (
    <MasterDetailShell
      heightClassName="h-[calc(100vh-14rem)]"
      listWidthClassName="md:w-64 lg:w-96"
      detailOpen={!!(sel.selectedId || sel.adding)}
      onDetailOpenChange={(open) => { if (!open) sel.clear(); }}
      detailTitle={selected?.ReferenceNumber ?? (sel.adding ? 'Add Authorization' : undefined)}
      list={
        <MasterDetailList
          title="Authorizations" subtitle={`${authorizations.length} total`} items={authorizations}
          getId={(a) => a.ID} searchText={(a) => `${a.OperatorID} ${a.CountryISO2} ${a.ReferenceNumber}`}
          viewStorageKey="viq_assets_authorizations_view" selectedId={sel.selectedId || (sel.adding ? 'new' : null)}
          onSelect={sel.select} onAddNew={sel.startAdd} addLabel="Add Authorization" canAdd={isAdmin}
          emptyText="No permit authorizations yet"
          renderItem={(a, { viewMode, selected: isSelected }) => (
            <EntityListCard
              viewMode={viewMode} selected={isSelected}
              icon={<FileCheck className="h-4 w-4 text-muted-foreground" />}
              title={a.ReferenceNumber}
              subtitle={`${a.OperatorID} — ${a.CountryISO2} — ${a.AuthorizationType}`}
              badges={<Badge variant={a.Status === 'Verified' ? 'default' : 'outline'} className="text-[10px]">{a.Status}</Badge>}
            />
          )}
        />
      }
      detail={
        <DetailPanel empty={!selected && !sel.adding}>
          {!selected && !sel.adding ? 'Select an authorization from the left, or add a new one' : (
            <AuthorizationPanel
              key={selected?.ID ?? 'new'}
              authorization={selected} isNew={sel.adding} isAdmin={isAdmin}
              onSaved={(id) => { refresh(); sel.select(id); }}
              onCancel={sel.clear}
            />
          )}
        </DetailPanel>
      }
    />
  );
}
```

- [ ] **Step 2: Wire the new tab into `AdminAssets.tsx`**

In `src/client/pages/admin/AdminAssets.tsx`, add the import near the top (after the other page-local imports, before the component definitions):
```tsx
import { AuthorizationsTab } from './AdminAuthorizations';
```

Add a new `<TabsTrigger>` after the `fees` trigger (after line 930):
```tsx
          <TabsTrigger value="authorizations" className="flex items-center gap-1"><FileCheck className="h-3.5 w-3.5" /> Authorizations</TabsTrigger>
```
(Add `FileCheck` to the `lucide-react` import on line 32, alongside `Plane, Building2, MapPin, ...`.)

Add a new `<TabsContent>` after the `fees` content block (after line 1283's block closes):
```tsx
        <TabsContent value="authorizations">
          <AuthorizationsTab />
        </TabsContent>
```

- [ ] **Step 3: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run start:dev` in background, then `npm run build:client` since `nest start --watch` wipes `dist/public`), log in as an Admin user, navigate to Admin > Assets > Authorizations, create a Draft authorization, verify it appears in the list with a Draft badge, click Verify, confirm the badge changes to Verified and the Verify/Revoke buttons swap correctly.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/admin/AdminAuthorizations.tsx src/client/pages/admin/AdminAssets.tsx
git commit -m "feat: add Authorizations tab to Admin > Assets"
```

---

### Task 7: Service-level UI — coverage badge + manual link action

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`
- Modify: `src/client/pages/admin/AdminTrips.tsx`

**Interfaces:**
- Consumes: Task 5's `getPermitAuthorizationList`, `getServiceAuthorizationCandidates`, `linkServiceAuthorization`; Task 6's nothing (independent of the Admin tab).

- [ ] **Step 1: Add the coverage badge + link action to `ServiceInlineEditor`**

In `src/client/pages/TripDetail.tsx`, add the import near the top (alongside the existing `dataStore` imports):
```tsx
import { getServiceAuthorizationCandidates, linkServiceAuthorization, getPermitAuthorizationList } from '@/lib/dataStore';
import type { AuthorizationCandidate } from '@/lib/dataStore';
```

In `ServiceInlineEditor` (starting line 915), add state for the candidates picker near the top of the function body (after `const [conflict, ...] = useState(...)` on line 920):
```tsx
  const [candidates, setCandidates] = useState<AuthorizationCandidate[] | null>(null);
  const [linking, setLinking] = useState(false);
```

Insert the coverage display / link action after the Responsibility `<select>` block (after line 1060, before `<div className="mt-1"><StatusTimeline ...`):
```tsx
            {draft.AuthorizationID ? (
              (() => {
                const auth = getPermitAuthorizationList().find((a) => a.ID === draft.AuthorizationID);
                return auth ? (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[10px] text-emerald-800">
                    Covered by {auth.AuthorizationType} permit {auth.ReferenceNumber} (valid until {new Date(auth.ValidUntil).toLocaleDateString()}).
                  </div>
                ) : null;
              })()
            ) : (draft.ServiceType === 'Permit' || draft.ServiceType === 'Overflight') && editing && (
              <div className="space-y-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={async () => setCandidates(await getServiceAuthorizationCandidates(service.SVCID))}
                >
                  Link existing permit
                </Button>
                {candidates && (
                  <div className="space-y-1 rounded border p-2">
                    {candidates.length === 0 && <div className="text-[10px] text-muted-foreground">No matching authorizations found.</div>}
                    {candidates.map((c) => (
                      <div key={c.Authorization.ID} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className={c.Eligible ? '' : 'text-muted-foreground'}>
                          {c.Authorization.ReferenceNumber} ({c.Authorization.AuthorizationType}){!c.Eligible && ` — ${c.Reason}`}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 px-2 text-[9px]"
                          disabled={!c.Eligible || linking}
                          onClick={async () => {
                            setLinking(true);
                            try {
                              const saved = await linkServiceAuthorization(service.SVCID, c.Authorization.ID);
                              setDraft(saved);
                              setSavedDraft(saved);
                              setCandidates(null);
                              await onSaved();
                            } finally {
                              setLinking(false);
                            }
                          }}
                        >
                          Link
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 2: Add the equivalent badge to `ServiceEditorDialog` in `AdminTrips.tsx`**

In `src/client/pages/admin/AdminTrips.tsx`, insert after the Responsibility `<Select>` block (after line 161, before the "Reference / Permit Number" field on line 163):
```tsx
          {service.AuthorizationID && (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              {(() => {
                const auth = getPermitAuthorizationList().find((a) => a.ID === service.AuthorizationID);
                return auth
                  ? `Covered by ${auth.AuthorizationType} permit ${auth.ReferenceNumber} (valid until ${new Date(auth.ValidUntil).toLocaleDateString()}).`
                  : 'Covered by a permit authorization.';
              })()}
            </div>
          )}
```
Add the import: `import { getPermitAuthorizationList } from '@/lib/dataStore';` near the top of the file (this dialog is read-only display for coverage — the manual link action lives only in `TripDetail.tsx`'s `ServiceInlineEditor`, since `AdminTrips.tsx`'s dialog is a simpler admin override view; this asymmetry is intentional, not an oversight, to avoid duplicating the candidates-picker UI in two places for a secondary admin surface).

- [ ] **Step 3: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual verification**

With the dev server running (rebuild `dist/public` via `npm run build:client` if it was restarted): open a trip with an Overflight or Permit service, verify the "Link existing permit" button appears when no authorization is set, click it, confirm candidates list (empty state if none exist), create+verify a matching authorization in Admin > Assets > Authorizations in another tab, return, click "Link existing permit" again, confirm the newly-verified authorization now shows as eligible, click Link, confirm the service badge changes to Confirmed with the "Covered by..." banner.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/TripDetail.tsx src/client/pages/admin/AdminTrips.tsx
git commit -m "feat: show permit-authorization coverage and manual link action on services"
```

---

## Final Verification

After all 7 tasks:
- [ ] Run `npm test` — full server suite passes, no regressions.
- [ ] Run `npm run build:client` — no TypeScript errors.
- [ ] Manually create an operator+country Blanket authorization, verify it, then generate overflight services for a leg matching that operator/country and confirm the new service is created already `Confirmed` with the authorization linked (via the existing "Generate Overflight Services" action in the trip UI, or `POST /services/legs/:legId/generate-overflight`).
- [ ] Per the standing instruction to keep a local preview running: restart `npm run start:dev` (background) + `npm run build:client` one final time, confirm `http://localhost:4001` serves the app with the new Authorizations tab visible.
