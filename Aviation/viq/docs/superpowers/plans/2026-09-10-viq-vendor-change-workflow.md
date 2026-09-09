# VIQ Vendor Assignment Engine Sub-Project 3b: Change Vendor Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give coordinators a guided "Change Vendor" action for a service that already has a real, previously-sent request — cancel the old vendor's request (with a real, tracked cancellation email), capture why, and send a fresh request to the replacement vendor — instead of the current silent-overwrite path (editing the raw provider field directly).

**Architecture:** One small new table (`VendorChangeLog`) holds the structured reason/audit data; everything else rides on the existing `Comm`/`AuditEntry` infrastructure, which is already scoped per-service and already retained forever. The workflow is orchestrated entirely client-side, mirroring how the Submission Engine already works in this codebase (`generateEmail`/`saveComm`/`sendComm`, then a status-flipping `saveService` call) rather than introducing a new server-side send abstraction. One new server endpoint (`POST /services/:svcId/change-vendor`) does the one thing that must be atomic: writing the log row and flipping the service's provider/status together.

**Tech Stack:** NestJS 10 + Prisma 5.22 + PostgreSQL (server), React 19 + Vite + TypeScript (client, no test framework — `npm run build:client` is the verification bar). Jest server tests run against a real `jetflow_test` Postgres database — never mock Prisma.

**Spec:** `docs/superpowers/specs/2026-09-10-viq-vendor-change-workflow-design.md`

## Global Constraints

- Jest server tests run against the real `jetflow_test` Postgres database. Never mock Prisma Client in any test.
- No client test framework exists. Client verification is `npm run build:client` succeeding plus a manual dev-server walkthrough — both `tsconfig.json` and `tsconfig.client.json` have `noUnusedLocals: true`, but only `build:client` catches it for client files (Jest/ts-jest does not) — always run the real build command, not just tests.
- Every mutating server endpoint that establishes "who did this" must use `@CurrentUser()` (the JWT-verified payload `NestJS`'s `JwtAuthGuard` already populates), never a client-supplied `dto.user`/`dto.role` field for anything security- or audit-load-bearing.
- Optimistic locking: every Service mutation takes a `version` and uses `prisma.service.updateMany({ where: { svcId, version }, ... })`, checking `result.count === 0` to detect a stale version and throwing the same `ConflictException` shape (`{ message, current, changedBy, changedAt }`) every other Service mutation already throws.
- `audit.logDiff(user, 'Service', svcId, before, after)` must still run on every Service field change, exactly as it does today — `VendorChangeLog` is a structured *addition*, not a replacement for the generic audit trail.
- Reason is always required for this workflow (not conditional) — this is `POST /services/:svcId/change-vendor`'s own dedicated endpoint, not the generic Service `PATCH`, which stays completely unchanged.
- `changeVendorAllowed(status)` gates this workflow to `Requested`, `Chasing`, `Confirmed`, `Re-confirm Required` only.

---

### Task 1: `VendorChangeLog` Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_vendor_change_log/migration.sql`
- Test: `src/server/modules/services/vendor-change-log.spec.ts`

**Interfaces:**
- Produces: the `VendorChangeLog` Prisma model (fields: `id`, `svcId`, `fromProviderId`, `toProviderId`, `reason`, `notes`, `cancellationCommId`, `newRequestCommId`, `changedBy`, `changedAtZ`), reachable via `prisma.vendorChangeLog.*` and `prisma.service.findUnique({..., include: { vendorChangeLogs: true }})`.

This project's migrations are hand-written SQL under `prisma/migrations/<timestamp>_<name>/migration.sql`, applied via `npx prisma migrate deploy` + `npx prisma generate` (this environment's `prisma migrate dev` fails non-interactively — do not attempt it).

- [ ] **Step 1: Add the model to the schema**

Open `prisma/schema.prisma` and find the `Service` model (search for `model Service {`). Add a back-relation field inside it, alongside the other relation fields (near `tasks Task[]`):

```prisma
  vendorChangeLogs VendorChangeLog[]
```

Then add the new model directly below the `Service` model's closing `}`:

```prisma
// Sub-project 3b of the Vendor Assignment Engine: structured record of
// every "Change Vendor" action (source doc §29/§31/§55/§57). One row per
// change -- a service changed twice has two rows, giving a full
// chronological history for free. This is deliberately NOT a "Service
// Order" child hierarchy (the source doc's §30 imagines one that doesn't
// exist in this codebase's flat Service model) -- everything else the
// workflow needs (field-level history, message bodies) already rides on
// the existing AuditEntry/Comm tables, both already scoped per-service.
model VendorChangeLog {
  id                 String   @id @default(cuid())
  svcId              String   @map("svc_id")
  fromProviderId     String   @map("from_provider_id")
  toProviderId       String   @map("to_provider_id")
  reason             String
  notes              String?
  cancellationCommId String?  @map("cancellation_comm_id")
  newRequestCommId   String?  @map("new_request_comm_id")
  changedBy          String   @map("changed_by")
  changedAtZ         DateTime @default(now()) @map("changed_at_z")

  service Service @relation(fields: [svcId], references: [svcId], onDelete: Cascade)

  @@index([svcId])
  @@map("vendor_change_logs")
}
```

- [ ] **Step 2: Write the migration SQL**

Run `date +%Y%m%d%H%M%S` (or use any monotonically-later timestamp than the last migration folder under `prisma/migrations/`) to name the folder, e.g. `prisma/migrations/20260910120000_add_vendor_change_log/migration.sql`:

```sql
CREATE TABLE "vendor_change_logs" (
    "id" TEXT NOT NULL,
    "svc_id" TEXT NOT NULL,
    "from_provider_id" TEXT NOT NULL,
    "to_provider_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "cancellation_comm_id" TEXT,
    "new_request_comm_id" TEXT,
    "changed_by" TEXT NOT NULL,
    "changed_at_z" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_change_logs_svc_id_idx" ON "vendor_change_logs"("svc_id");

ALTER TABLE "vendor_change_logs" ADD CONSTRAINT "vendor_change_logs_svc_id_fkey" FOREIGN KEY ("svc_id") REFERENCES "services"("svc_id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Note `TIMESTAMP(3)` (this repo's established precision convention — a prior plan's final review caught a migration using bare `TIMESTAMP` as real Prisma drift; don't repeat that here).

- [ ] **Step 3: Apply the migration and regenerate the client**

If a `nest start --watch` process is running, it holds a lock on the Prisma query-engine DLL on Windows — stop it first:

```bash
# Windows: find and stop any running VIQ dev-server node processes before regenerating
```
```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId, CommandLine
Stop-Process -Id <pid> -Force   # for VIQ's own nest.js/npm-cli.js start:dev processes only
```

Then, from `C:\Backups\InsiderTechSol\Aviation\viq`:

```bash
npx dotenv -e .env.test -- npx prisma migrate deploy
npx prisma migrate deploy
npx prisma generate
```

(The `.env.test`-scoped deploy applies it to the real test database `pretest`/`test` scripts use; the plain `prisma migrate deploy` applies it to the dev database referenced by the default `.env`.)

- [ ] **Step 4: Write a smoke test confirming the model round-trips**

```typescript
// src/server/modules/services/vendor-change-log.spec.ts
import { PrismaService } from '../../prisma/prisma.service';
import { truncateAll } from '../../test/db-test-utils';

describe('VendorChangeLog model', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('creates and reads back a VendorChangeLog row scoped to a Service', async () => {
    const providerA = await prisma.provider.create({
      data: { providerId: 'PROV-A', name: 'Vendor A', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] },
    });
    const providerB = await prisma.provider.create({
      data: { providerId: 'PROV-B', name: 'Vendor B', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] },
    });
    const trip = await prisma.trip.create({
      data: { tripId: 'TRIP-VCL-1', registration: 'N1', client: 'Client', operator: 'Op', status: 'Active' },
    });
    const svc = await prisma.service.create({
      data: {
        svcId: 'SVC-VCL-1', tripId: trip.tripId, scopeType: 'LEG', scopeId: 'LEG-1',
        serviceType: 'Overflight', providerId: providerA.providerId, status: 'Requested',
        basedOnEtdZ: new Date(), requiredByZ: new Date(),
      },
    });

    const log = await prisma.vendorChangeLog.create({
      data: {
        svcId: svc.svcId,
        fromProviderId: providerA.providerId,
        toProviderId: providerB.providerId,
        reason: 'No Response',
        notes: 'Tried twice, no reply.',
        changedBy: 'tester',
      },
    });

    const found = await prisma.vendorChangeLog.findMany({ where: { svcId: svc.svcId } });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(log.id);
    expect(found[0].fromProviderId).toBe('PROV-A');
    expect(found[0].toProviderId).toBe('PROV-B');
    expect(found[0].reason).toBe('No Response');
  });

  it('cascades delete when the Service is deleted', async () => {
    const provider = await prisma.provider.create({
      data: { providerId: 'PROV-C', name: 'Vendor C', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] },
    });
    const trip = await prisma.trip.create({
      data: { tripId: 'TRIP-VCL-2', registration: 'N2', client: 'Client', operator: 'Op', status: 'Active' },
    });
    const svc = await prisma.service.create({
      data: {
        svcId: 'SVC-VCL-2', tripId: trip.tripId, scopeType: 'LEG', scopeId: 'LEG-2',
        serviceType: 'Overflight', providerId: provider.providerId, status: 'Requested',
        basedOnEtdZ: new Date(), requiredByZ: new Date(),
      },
    });
    await prisma.vendorChangeLog.create({
      data: { svcId: svc.svcId, fromProviderId: provider.providerId, toProviderId: provider.providerId, reason: 'Other', changedBy: 'tester' },
    });

    await prisma.service.delete({ where: { svcId: svc.svcId } });

    const found = await prisma.vendorChangeLog.findMany({ where: { svcId: svc.svcId } });
    expect(found).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- vendor-change-log.spec`
Expected: PASS, 2/2.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/modules/services/vendor-change-log.spec.ts
git commit -m "feat: add VendorChangeLog model for the Change Vendor workflow"
```

---

### Task 2: Resolver `eligiblePool()` + `GET /services/:svcId/change-vendor-candidates`

**Files:**
- Modify: `src/server/modules/vendor-assignments/vendor-resolver.service.ts`
- Modify: `src/server/modules/services/services.service.ts`
- Modify: `src/server/modules/services/services.controller.ts`
- Test: `src/server/modules/vendor-assignments/vendor-resolver.service.spec.ts` (extend existing file)

**Interfaces:**
- Consumes: `VendorResolverService`'s existing private helpers `buildContextFilter`/`validityConditions` (both already return `Prisma.VendorAssignmentWhereInput[]`) and the `VendorResolutionContext` type it already exports.
- Produces: `VendorResolverService.eligiblePool(context: VendorResolutionContext): Promise<{ vendorId: string; rank: number | null }[]>`, and `GET /services/:svcId/change-vendor-candidates` returning `{ candidates: { vendorId: string; providerName: string }[] }` — consumed by Task 6's dialog.

- [ ] **Step 1: Read the existing `resolve()` method for its filtering logic**

Open `src/server/modules/vendor-assignments/vendor-resolver.service.ts` and read `resolve()` in full, along with `buildContextFilter`, `validityConditions`, `specificity`, and `selectTopTier`. `eligiblePool` reuses everything up to (but not including) the specificity-tiering/winner-selection step.

- [ ] **Step 2: Write the failing test**

Add to `src/server/modules/vendor-assignments/vendor-resolver.service.spec.ts`, inside the existing `describe('VendorResolverService', ...)` block, after the other `it(...)` tests (this file's `beforeEach` already seeds providers `PROV-A`/`PROV-B`/`PROV-C`, country `TZ`, airport `HTDA`, and client `CLI-1` — reuse the existing `makeAssignment` helper the file already defines, exactly like every other test in this file does, rather than re-seeding anything):

```typescript
  it('eligiblePool returns every eligible vendor across all tiers, not just the winning tier', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const pool = await resolver.eligiblePool({ countryIso2: 'TZ', icao: '', serviceType: 'Overflight' });
    expect(pool.map((p) => p.vendorId).sort()).toEqual(['PROV-A', 'PROV-B']);
  });

  it('eligiblePool excludes a vendor covered by a prohibited row for the same context', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', clientId: 'CLI-1', prohibited: true, rank: undefined as any });
    const pool = await resolver.eligiblePool({ countryIso2: 'TZ', icao: '', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(pool.map((p) => p.vendorId)).toEqual(['PROV-B']);
  });
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm test -- vendor-resolver.service.spec`
Expected: FAIL with "resolver.eligiblePool is not a function".

- [ ] **Step 4: Implement `eligiblePool`**

In `vendor-resolver.service.ts`, add a new public method directly below `resolve()` (this is a verbatim, verified match against the real file's existing private helpers — `buildContextFilter`, `validityConditions`, `specificity`, `compareTuple` — read in Step 1):

```typescript
  // Sub-project 3b: Change Vendor's replacement picker needs "every
  // eligible vendor at any tier", not resolve()'s "the winning tier only"
  // -- a service with a single top-tier winner and no ties would otherwise
  // show an empty picker even when legitimate lower-tier vendors exist.
  // Reuses resolve()'s exact candidate-filtering (context + validity +
  // active/contractActive/serviceTypes + prohibition exclusion) but skips
  // the specificity-tiering/winner-selection step -- returns every
  // surviving candidate, sorted most- to least-specific then by rank.
  async eligiblePool(ctx: VendorResolutionContext): Promise<{ vendorId: string; rank: number | null }[]> {
    const asOfZ = ctx.asOfZ ?? new Date();
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
      (c) => !bannedProviderIds.has(c.providerId) && c.provider.contractActive && c.provider.serviceTypes.includes(ctx.serviceType),
    );

    return eligible
      .sort((a, b) => this.compareTuple(this.specificity(b), this.specificity(a)) || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
      .map((row) => ({ vendorId: row.providerId, rank: row.rank }));
  }
```

- [ ] **Step 5: Run the test again to see it pass**

Run: `npm test -- vendor-resolver.service.spec`
Expected: PASS.

- [ ] **Step 6: Add the service method and controller endpoint**

`findOne(svcId)` (already in this file) returns `withServiceTransitions(svc)` where `svc` is the raw Prisma row — plain camelCase fields (`countryIso2`, `icao`, `serviceType`, `tripId`), exactly like the existing `vendorCandidates()` method (read earlier in Step 1's exploration) already consumes. Add a new method in `src/server/modules/services/services.service.ts`, directly below the existing `vendorCandidates()`:

```typescript
  async changeVendorCandidates(svcId: string) {
    const svc = await this.findOne(svcId);
    if (!svc.countryIso2) return { candidates: [] };
    const trip = await this.prisma.trip.findUnique({ where: { tripId: svc.tripId }, select: { clientId: true } });
    const pool = await this.vendorResolver.eligiblePool({
      countryIso2: svc.countryIso2,
      icao: svc.icao ?? '',
      serviceType: svc.serviceType,
      clientId: trip?.clientId ?? undefined,
    });
    if (pool.length === 0) return { candidates: [] };
    const providers = await this.prisma.provider.findMany({ where: { providerId: { in: pool.map((p) => p.vendorId) } } });
    const nameById = new Map(providers.map((p) => [p.providerId, p.name]));
    return { candidates: pool.map((p) => ({ vendorId: p.vendorId, providerName: nameById.get(p.vendorId) ?? p.vendorId })) };
  }
```

In `src/server/modules/services/services.controller.ts`, add, near the existing `vendorCandidates` route:

```typescript
  @Get(':svcId/change-vendor-candidates')
  changeVendorCandidates(@Param('svcId') svcId: string) {
    return this.services.changeVendorCandidates(svcId);
  }
```

- [ ] **Step 7: Verify the server builds**

Run: `npm run build:server`
Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/modules/vendor-assignments/vendor-resolver.service.ts src/server/modules/vendor-assignments/vendor-resolver.service.spec.ts src/server/modules/services/services.service.ts src/server/modules/services/services.controller.ts
git commit -m "feat: add resolver eligiblePool and change-vendor-candidates endpoint"
```

---

### Task 3: `changeVendorAllowed` + `POST /services/:svcId/change-vendor` + `PATCH /vendor-change-logs/:id`

**Files:**
- Modify: `src/server/common/statusTransitions.ts`
- Create: `src/server/modules/services/dto/change-vendor.dto.ts`
- Create: `src/server/modules/services/dto/update-vendor-change-log.dto.ts`
- Modify: `src/server/modules/services/services.service.ts`
- Modify: `src/server/modules/services/services.controller.ts`
- Test: `src/server/modules/services/change-vendor.spec.ts`

**Interfaces:**
- Consumes: Task 1's `VendorChangeLog` model, Task 2's `eligiblePool`/`changeVendorCandidates`.
- Produces: `changeVendorAllowed(status: string): boolean`; `POST /services/:svcId/change-vendor` returning the updated `Service` (same shape as the generic `update()` response); `PATCH /vendor-change-logs/:id` accepting `{ newRequestCommId: string }`. Task 5's client `changeVendor()`/`patchVendorChangeLog()` call these by exact path and body shape.

- [ ] **Step 1: Add `changeVendorAllowed` to the status graph**

In `src/server/common/statusTransitions.ts`, add near `serviceAuthorizationLinkAllowed`:

```typescript
// Sub-project 3b: Change Vendor is only meaningful once a real request has
// actually been sent to a vendor (Submission Pending/Submission Failed mean
// nothing was ever sent, per the Submission Engine's own "never show
// Requested without a confirmed send" invariant) -- for those two statuses
// the generic Service editor's provider field remains the right tool.
export function changeVendorAllowed(status: string): boolean {
  return ['Requested', 'Chasing', 'Confirmed', 'Re-confirm Required'].includes(status);
}
```

- [ ] **Step 2: Write the DTOs**

```typescript
// src/server/modules/services/dto/change-vendor.dto.ts
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export const VENDOR_CHANGE_REASONS = [
  'Client Requested', 'Vendor Unavailable', 'No Response', 'Price', 'Credit Issue',
  'Operational Requirement', 'Capability Issue', 'Schedule Issue', 'Quality Issue', 'Other',
] as const;

export class ChangeVendorDto {
  @IsString()
  @MaxLength(200)
  toProviderId!: string;

  @IsIn(VENDOR_CHANGE_REASONS)
  reason!: (typeof VENDOR_CHANGE_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsString()
  @MaxLength(200)
  cancellationCommId!: string;

  @IsInt()
  version!: number;
}
```

```typescript
// src/server/modules/services/dto/update-vendor-change-log.dto.ts
import { IsString, MaxLength } from 'class-validator';

export class UpdateVendorChangeLogDto {
  @IsString()
  @MaxLength(200)
  newRequestCommId!: string;
}
```

- [ ] **Step 3: Write the failing test**

```typescript
// src/server/modules/services/change-vendor.spec.ts
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ServicesService } from './services.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { AuditService } from '../audit/audit.service';
import { truncateAll } from '../../test/db-test-utils';

describe('ServicesService.changeVendor', () => {
  let prisma: PrismaService;
  let services: ServicesService;

  beforeAll(() => {
    prisma = new PrismaService();
    const audit = new AuditService(prisma);
    services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  async function seed(status: string) {
    const providerA = await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] } });
    const providerB = await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Vendor B', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] } });
    const trip = await prisma.trip.create({ data: { tripId: 'TRIP-CV-1', registration: 'N1', client: 'Client', operator: 'Op', status: 'Active' } });
    const svc = await prisma.service.create({
      data: {
        svcId: 'SVC-CV-1', tripId: trip.tripId, scopeType: 'LEG', scopeId: 'LEG-1',
        serviceType: 'Overflight', providerId: providerA.providerId, status,
        countryIso2: 'TZ', basedOnEtdZ: new Date(), requiredByZ: new Date(), version: 1,
      },
    });
    return { providerA, providerB, svc };
  }

  it('rejects when the current status is not in the allowed set', async () => {
    const { svc, providerB } = await seed('Submission Pending');
    await expect(
      services.changeVendor(svc.svcId, { toProviderId: providerB.providerId, reason: 'No Response', cancellationCommId: 'COMM-1', version: 1 }, 'tester'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-eligible replacement vendor for a non-Admin caller', async () => {
    const { svc } = await seed('Requested');
    const ineligible = await prisma.provider.create({ data: { providerId: 'PROV-X', name: 'Ineligible', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Fuel'] } });
    await expect(
      services.changeVendor(svc.svcId, { toProviderId: ineligible.providerId, reason: 'Other', cancellationCommId: 'COMM-1', version: 1 }, 'tester', 'Coordinator'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an Admin to override into a non-eligible replacement vendor', async () => {
    const { svc } = await seed('Requested');
    const ineligible = await prisma.provider.create({ data: { providerId: 'PROV-Y', name: 'Override Target', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Fuel'] } });
    const result = await services.changeVendor(svc.svcId, { toProviderId: ineligible.providerId, reason: 'Other', cancellationCommId: 'COMM-1', version: 1 }, 'tester', 'Admin');
    expect(result.ProviderID ?? (result as any).providerId).toBe(ineligible.providerId);
  });

  it('writes a VendorChangeLog row and resets status to Submission Pending on success', async () => {
    const { svc, providerA, providerB } = await seed('Requested');
    await services.changeVendor(svc.svcId, { toProviderId: providerB.providerId, reason: 'No Response', notes: 'Twice, no reply.', cancellationCommId: 'COMM-1', version: 1 }, 'tester', 'Admin');

    const updated = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
    expect(updated?.providerId).toBe(providerB.providerId);
    expect(updated?.status).toBe('Submission Pending');
    expect(updated?.vendorSelectionSource).toBe('USER_SELECTED');
    expect(updated?.version).toBe(2);

    const logs = await prisma.vendorChangeLog.findMany({ where: { svcId: svc.svcId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].fromProviderId).toBe(providerA.providerId);
    expect(logs[0].toProviderId).toBe(providerB.providerId);
    expect(logs[0].reason).toBe('No Response');
    expect(logs[0].cancellationCommId).toBe('COMM-1');
  });

  it('409s on a stale version', async () => {
    const { svc, providerB } = await seed('Requested');
    await expect(
      services.changeVendor(svc.svcId, { toProviderId: providerB.providerId, reason: 'Other', cancellationCommId: 'COMM-1', version: 999 }, 'tester', 'Admin'),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npm test -- change-vendor.spec`
Expected: FAIL with "services.changeVendor is not a function".

- [ ] **Step 5: Implement `changeVendor` and `patchVendorChangeLog`**

In `services.service.ts`, add (near `linkAuthorization`, whose shape this closely follows):

```typescript
  async changeVendor(svcId: string, dto: ChangeVendorDto, currentUsername: string, callerRole?: string) {
    const svc = await this.prisma.service.findUnique({ where: { svcId } });
    if (!svc) throw new NotFoundException(`Service ${svcId} not found`);
    if (!changeVendorAllowed(svc.status)) {
      throw new BadRequestException(`Cannot change vendor on a service with status "${svc.status}"`);
    }
    if (!svc.providerId) {
      throw new BadRequestException('Service has no current provider to change from');
    }

    if (callerRole !== 'Admin') {
      const pool = svc.countryIso2
        ? await this.changeVendorCandidates(svcId)
        : { candidates: [] };
      const eligible = pool.candidates.some((c) => c.vendorId === dto.toProviderId);
      if (!eligible) {
        throw new ForbiddenException('Replacement vendor is not in the eligible list — requires Admin to override');
      }
    }

    const result = await this.prisma.service.updateMany({
      where: { svcId, version: dto.version },
      data: {
        providerId: dto.toProviderId,
        vendorSelectionSource: 'USER_SELECTED',
        vendorAssignmentId: null,
        vendorSelectedAtZ: new Date(),
        status: 'Submission Pending',
        statusChangedAt: new Date(),
        statusChangedBy: currentUsername,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.service.findUnique({ where: { svcId } });
      const history = await this.audit.forRecord('Service', svcId);
      const latest = history[0];
      throw new ConflictException({
        message: `Service ${svcId} was modified by someone else`,
        current: withServiceTransitions(current!),
        changedBy: latest?.user,
        changedAt: latest?.timestampZ,
      });
    }

    await this.prisma.vendorChangeLog.create({
      data: {
        svcId,
        fromProviderId: svc.providerId,
        toProviderId: dto.toProviderId,
        reason: dto.reason,
        notes: dto.notes,
        cancellationCommId: dto.cancellationCommId,
        changedBy: currentUsername,
      },
    });

    const updated = await this.prisma.service.findUnique({ where: { svcId } });
    await this.audit.logDiff(currentUsername, 'Service', svcId, svc as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
    return withServiceTransitions(updated!);
  }

  async patchVendorChangeLogNewRequestComm(id: string, newRequestCommId: string) {
    return this.prisma.vendorChangeLog.update({ where: { id }, data: { newRequestCommId } });
  }
```

`services.service.ts`'s current top-of-file imports (read them first to confirm nothing has shifted) are:

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
...
import { isValidServiceTransition, serviceAuthorizationLinkAllowed, withServiceTransitions } from '../../common/statusTransitions';
```

Change these two lines to:

```typescript
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
...
import { changeVendorAllowed, isValidServiceTransition, serviceAuthorizationLinkAllowed, withServiceTransitions } from '../../common/statusTransitions';
```

And add one new import for the DTO: `import { ChangeVendorDto } from './dto/change-vendor.dto';`.

- [ ] **Step 6: Add the controller endpoints**

In `services.controller.ts`, add near `linkAuthorization`:

```typescript
  @Post(':svcId/change-vendor')
  changeVendor(@Param('svcId') svcId: string, @Body() dto: ChangeVendorDto, @CurrentUser() user: CurrentUserPayload) {
    return this.services.changeVendor(svcId, dto, user.username, user.role);
  }

  @Patch('vendor-change-logs/:id')
  patchVendorChangeLog(@Param('id') id: string, @Body() dto: UpdateVendorChangeLogDto) {
    return this.services.patchVendorChangeLogNewRequestComm(id, dto.newRequestCommId);
  }
```

`services.controller.ts` already imports `Patch` from `@nestjs/common` (used by `linkAuthorization`) — no change needed there. Add two new import lines: `import { ChangeVendorDto } from './dto/change-vendor.dto';` and `import { UpdateVendorChangeLogDto } from './dto/update-vendor-change-log.dto';`.

Note: `PATCH 'vendor-change-logs/:id'` is registered on `ServicesController` (its `@Controller('services')` prefix makes the real route `/services/vendor-change-logs/:id`) rather than a new dedicated controller — this one small edit endpoint doesn't warrant its own module, matching how `authorization-candidates` and `vendor-candidates` already live on this same controller rather than spinning up new ones. This is a two-segment path (`vendor-change-logs/:id`), so it does not collide with the existing single-segment `@Patch(':svcId')` route regardless of registration order — no reordering needed.

- [ ] **Step 7: Run the test again to see it pass**

Run: `npm test -- change-vendor.spec`
Expected: PASS, 5/5.

- [ ] **Step 8: Run the full server build and existing services test suite**

Run: `npm run build:server`
Run: `npm test -- services`
Expected: no new TypeScript errors; no regressions in the existing services test files.

- [ ] **Step 9: Commit**

```bash
git add src/server/common/statusTransitions.ts src/server/modules/services/dto/change-vendor.dto.ts src/server/modules/services/dto/update-vendor-change-log.dto.ts src/server/modules/services/services.service.ts src/server/modules/services/services.controller.ts src/server/modules/services/change-vendor.spec.ts
git commit -m "feat: add POST /services/:svcId/change-vendor and vendor-change-log patch endpoint"
```

---

### Task 4: Cancellation email template type

**Files:**
- Modify: `src/client/lib/emailTemplates.ts`

**Interfaces:**
- Consumes: existing `TemplateType`, `RequestAction`, `ACTION_TEMPLATE_PAIRS`, `DEFAULT_TEMPLATES`, `generateEmail()`.
- Produces: `RequestAction` extended with `'Cancellation'`; three new `TemplateType` values (`VIQ_OverflyCancellation`, `VIQ_LandingCancellation`, `VIQ_GroundHandlingCancellation`) plus a `'Cancellation'` catch-all `TemplateType` for every other service type — consumed by Task 6's dialog via `defaultTemplateForCancellation(serviceType)`.

- [ ] **Step 1: Extend the types**

In `src/client/lib/emailTemplates.ts`:

```typescript
export type TemplateType =
  | 'VIQ_OverflyRequest'
  | 'VIQ_OverflyRevision'
  | 'VIQ_OverflyCancellation'
  | 'VIQ_LandingRequest'
  | 'VIQ_LandingRevision'
  | 'VIQ_LandingCancellation'
  | 'VIQ_GroundHandlingRequest'
  | 'VIQ_GroundHandlingRevision'
  | 'VIQ_GroundHandlingCancellation'
  | 'Fuel'
  | 'Catering'
  | 'CrewTransport'
  | 'Customs'
  | 'Hotel'
  | 'VIQ_MultiLegPermit'
  | 'Cancellation'
  | 'Generic';

export type RequestAction = 'Request' | 'Revision' | 'Cancellation';
```

Update `ACTION_TEMPLATE_PAIRS` to a 3-key record:

```typescript
const ACTION_TEMPLATE_PAIRS: Record<'Overflight' | 'Permit' | 'GroundHandling', Record<RequestAction, TemplateType>> = {
  Overflight: { Request: 'VIQ_OverflyRequest', Revision: 'VIQ_OverflyRevision', Cancellation: 'VIQ_OverflyCancellation' },
  Permit: { Request: 'VIQ_LandingRequest', Revision: 'VIQ_LandingRevision', Cancellation: 'VIQ_LandingCancellation' },
  GroundHandling: { Request: 'VIQ_GroundHandlingRequest', Revision: 'VIQ_GroundHandlingRevision', Cancellation: 'VIQ_GroundHandlingCancellation' },
};
```

Add a new exported helper alongside `defaultTemplateFor`:

```typescript
// For the 3 service types with per-action templates, use the dedicated
// Cancellation variant; every other service type never had per-action
// templates at all (Fuel/Catering/etc. render one flat body regardless of
// action) -- for those, fall back to the generic 'Cancellation' type
// rather than building 7 more bespoke cancellation templates nothing else
// in this codebase has a precedent for.
export function defaultTemplateForCancellation(serviceType: ServiceType): TemplateType {
  const pair = (ACTION_TEMPLATE_PAIRS as Partial<Record<ServiceType, Record<RequestAction, TemplateType>>>)[serviceType];
  return pair ? pair.Cancellation : 'Cancellation';
}
```

Update `toggleTemplateAction` and `isRevisionTemplate`/`isActionTemplate` only if their existing logic would now be confused by the third pair member — read them first: `toggleTemplateAction` only checks `.Request`/`.Revision`, so it's unaffected and needs no change; `isRevisionTemplate`/`isActionTemplate` likewise only check those two keys and are unaffected. Do not modify them.

Add the three new template types to `COUNTRY_AWARE_TEMPLATE_TYPES`:

```typescript
export const COUNTRY_AWARE_TEMPLATE_TYPES: TemplateType[] = [
  'VIQ_OverflyRequest', 'VIQ_OverflyRevision', 'VIQ_OverflyCancellation',
  'VIQ_LandingRequest', 'VIQ_LandingRevision', 'VIQ_LandingCancellation',
  'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision', 'VIQ_GroundHandlingCancellation',
];
```

- [ ] **Step 2: Add default templates for the 3 country-aware Cancellation variants**

Add to `DEFAULT_TEMPLATES` (find the object, add these entries alongside the existing `VIQ_OverflyRequest`/`VIQ_OverflyRevision` etc.):

```typescript
  VIQ_OverflyCancellation: {
    subject: 'OVERFLY PERMIT REQUEST WITHDRAWN - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CAA: {{COUNTRY_NAME}}, PLEASE BE ADVISED THE FOLLOWING OVERFLY PERMIT REQUEST IS WITHDRAWN:
A. OPERATOR: {{OPERATOR}}
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}
C. PREVIOUS REQUEST REFERENCE: {{ISSUED_REF}}
D. ITINERARY: ETD {{DEP_NAME}} / {{DEP}}   ETA {{ARR_NAME}} / {{ARR}}
A REPLACEMENT REQUEST WILL FOLLOW SEPARATELY IF STILL REQUIRED. THANK YOU FOR YOUR UNDERSTANDING.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END`,
  },
  VIQ_LandingCancellation: {
    subject: 'LANDING PERMIT REQUEST WITHDRAWN - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CAA: {{COUNTRY_NAME}}, PLEASE BE ADVISED THE FOLLOWING LANDING PERMIT REQUEST IS WITHDRAWN:
A. OPERATOR: {{OPERATOR}}
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}
C. PREVIOUS REQUEST REFERENCE: {{ISSUED_REF}}
D. ITINERARY: ETA {{ARR_NAME}} / {{ARR}}   {{ETA}}
A REPLACEMENT REQUEST WILL FOLLOW SEPARATELY IF STILL REQUIRED. THANK YOU FOR YOUR UNDERSTANDING.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END`,
  },
  VIQ_GroundHandlingCancellation: {
    subject: 'GROUND HANDLING REQUEST WITHDRAWN - {{TRIP_ID}} - {{REG}} - {{ARR}}',
    body: `Dear Handler,

Please be advised the ground handling request below is withdrawn:

Aircraft: {{REG}} ({{ACTYPE}})
Airport: {{ARR}}
Previous request reference: {{ISSUED_REF}}
Arrival: {{ETA}}

A replacement request will follow separately if still required.

Regards,
{{SENDER_NAME}}`,
  },
```

(`{{ISSUED_REF}}` already renders from the existing `issuedRef` parameter `generateEmail` accepts — no new template variable is needed for "Previous request: ET-12345".)

- [ ] **Step 3: Handle the generic `'Cancellation'` type in `generateEmail`'s switch**

Find the `switch (template)` block inside `generateEmail` (the `else` branch after the `COUNTRY_AWARE_TEMPLATE_TYPES.includes(template)` check). Add a case before `default:`:

```typescript
      case 'Cancellation':
        subject = `Request Withdrawn — ${arr} — ${tripId}/${token.split('/').pop()}`;
        body = `Dear Team,\n\nPlease be advised the following request is withdrawn:\n\nAircraft: ${reg} (${acType})\nAirport: ${arr}\nPrevious request reference: ${issuedRef || 'N/A'}\n\nA replacement request will follow separately if still required.\n\nToken: ${token}\n\nRegards,\nOperations`;
        break;
```

- [ ] **Step 4: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/emailTemplates.ts
git commit -m "feat: add Cancellation email template type for the Change Vendor workflow"
```

---

### Task 5: Client data layer — `dataStore.ts` additions

**Files:**
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Consumes: Task 2's `GET /services/:svcId/change-vendor-candidates`, Task 3's `POST /services/:svcId/change-vendor` and `PATCH /services/vendor-change-logs/:id`.
- Produces:
  - `interface VendorChangeLog { ID: string; SVCID: string; FromProviderID: string; ToProviderID: string; Reason: string; Notes?: string; CancellationCommID?: string; NewRequestCommID?: string; ChangedBy: string; ChangedAtZ: string; }`
  - `getChangeVendorCandidates(svcId: string): Promise<{ vendorId: string; providerName: string }[]>`
  - `changeVendor(svcId: string, body: { toProviderId: string; reason: string; notes?: string; cancellationCommId: string; version: number }): Promise<Service>`
  - `patchVendorChangeLogNewRequestComm(id: string, newRequestCommId: string): Promise<VendorChangeLog>`
  - `getVendorChangeLogsForService(svcId: string): Promise<VendorChangeLog[]>`

  All four are consumed by Task 6 (dialog + gating) and Task 7 (timeline).

- [ ] **Step 1: Add the interface and mapper**

Find `getVendorAssignment` in `dataStore.ts` (search for `export async function getVendorAssignment`) and add directly below it:

```typescript
export interface VendorChangeLog {
  ID: string;
  SVCID: string;
  FromProviderID: string;
  ToProviderID: string;
  Reason: string;
  Notes?: string;
  CancellationCommID?: string;
  NewRequestCommID?: string;
  ChangedBy: string;
  ChangedAtZ: string;
}

function mapVendorChangeLogFromApi(v: any): VendorChangeLog {
  return {
    ID: v.id,
    SVCID: v.svcId,
    FromProviderID: v.fromProviderId,
    ToProviderID: v.toProviderId,
    Reason: v.reason,
    Notes: v.notes ?? undefined,
    CancellationCommID: v.cancellationCommId ?? undefined,
    NewRequestCommID: v.newRequestCommId ?? undefined,
    ChangedBy: v.changedBy,
    ChangedAtZ: v.changedAtZ,
  };
}
```

- [ ] **Step 2: Add the four functions**

```typescript
export async function getChangeVendorCandidates(svcId: string): Promise<{ vendorId: string; providerName: string }[]> {
  const result = await apiJson<{ candidates: { vendorId: string; providerName: string }[] }>(`/services/${svcId}/change-vendor-candidates`);
  return result.candidates;
}

export async function changeVendor(
  svcId: string,
  body: { toProviderId: string; reason: string; notes?: string; cancellationCommId: string; version: number },
): Promise<Service> {
  const row = await apiJson<any>(`/services/${svcId}/change-vendor`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return mapServiceFromApi(row);
}

export async function patchVendorChangeLogNewRequestComm(id: string, newRequestCommId: string): Promise<VendorChangeLog> {
  const row = await apiJson<any>(`/services/vendor-change-logs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ newRequestCommId }),
  });
  return mapVendorChangeLogFromApi(row);
}

export async function getVendorChangeLogsForService(svcId: string): Promise<VendorChangeLog[]> {
  const rows = await apiJson<any[]>(`/services/${svcId}/vendor-change-logs`);
  return rows.map(mapVendorChangeLogFromApi);
}
```

`getVendorChangeLogsForService` calls a route not yet built (`GET /services/:svcId/vendor-change-logs`) — add it now as a small addition to Task 3's controller/service (this is a read-only list endpoint, safe to add here rather than back in Task 3 since Task 3 is already reviewed/complete by the time this task runs): in `services.controller.ts`, add `@Get(':svcId/vendor-change-logs') vendorChangeLogs(@Param('svcId') svcId: string) { return this.services.vendorChangeLogsForService(svcId); }`, and in `services.service.ts`, add `async vendorChangeLogsForService(svcId: string) { return this.prisma.vendorChangeLog.findMany({ where: { svcId }, orderBy: { changedAtZ: 'asc' } }); }`. Run `npm run build:server` after adding these to confirm no errors.

- [ ] **Step 3: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/lib/dataStore.ts src/server/modules/services/services.service.ts src/server/modules/services/services.controller.ts
git commit -m "feat: add client data layer for the Change Vendor workflow"
```

---

### Task 6: `ChangeVendorDialog.tsx` + wire into `TripDetail.tsx`'s `ServiceInlineEditor`

**Files:**
- Create: `src/client/components/ChangeVendorDialog.tsx`
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: Task 4's `defaultTemplateForCancellation`, `generateEmail`; Task 5's `getChangeVendorCandidates`/`changeVendor`/`patchVendorChangeLogNewRequestComm`; existing `saveComm`/`sendComm`/`getProviderList`/`saveService`; `useAuth()`'s `isAdmin`.
- Produces: `<ChangeVendorDialog open onClose svc leg trip legs persons onChanged />` — a self-contained component `ServiceInlineEditor` renders and controls the open state of; consumed only by Task 6 itself (no later task depends on this component's internals beyond its props).

- [ ] **Step 1: Write `ChangeVendorDialog.tsx`**

```typescript
// src/client/components/ChangeVendorDialog.tsx
//
// Sub-project 3b of the Vendor Assignment Engine: the guided "Change
// Vendor" workflow (source doc §28-29, §57-58). Available only once a
// service has a real, previously-sent request (changeVendorAllowed on the
// server side gates this the same way) -- never silently swaps the
// provider like the raw field edit used to.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ApiError, getChangeVendorCandidates, changeVendor, patchVendorChangeLogNewRequestComm,
  saveComm, sendComm, saveService, getProviderList,
} from '@/lib/dataStore';
import { generateEmail, defaultTemplateFor, defaultTemplateForCancellation } from '@/lib/emailTemplates';
import { useAuth } from '@/lib/authContext';
import type { Service, Leg, Trip, TripPersonView, Comm } from '@/data/types';

const VENDOR_CHANGE_REASONS = [
  'Client Requested', 'Vendor Unavailable', 'No Response', 'Price', 'Credit Issue',
  'Operational Requirement', 'Capability Issue', 'Schedule Issue', 'Quality Issue', 'Other',
];

type Step = 'pick' | 'cancelling' | 'cancel-failed' | 'requesting' | 'done' | 'request-failed';

export function ChangeVendorDialog({
  open, onClose, svc, leg, trip, legs, persons, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  svc: Service;
  leg: Leg;
  trip: Trip;
  legs: Leg[];
  persons: TripPersonView[];
  onChanged: () => Promise<void> | void;
}) {
  const { isAdmin } = useAuth();
  const [candidates, setCandidates] = useState<{ vendorId: string; providerName: string }[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [overrideMode, setOverrideMode] = useState(false);
  const [allProviders, setAllProviders] = useState<{ ProviderID: string; Name: string }[]>([]);
  const [toProviderId, setToProviderId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setToProviderId('');
    setReason('');
    setNotes('');
    setOverrideMode(false);
    setError('');
    setLoadingCandidates(true);
    getChangeVendorCandidates(svc.SVCID)
      .then((result) => setCandidates(result))
      .catch(() => setCandidates([]))
      .finally(() => setLoadingCandidates(false));
    setAllProviders(getProviderList());
  }, [open, svc.SVCID]);

  const currentProvider = allProviders.find((p) => p.ProviderID === svc.ProviderID);
  const pickerOptions = overrideMode ? allProviders : candidates.map((c) => ({ ProviderID: c.vendorId, Name: c.providerName }));

  async function handleConfirm() {
    if (!toProviderId || !reason || !svc.ProviderID) return;
    setError('');
    setStep('cancelling');

    const fromProvider = getProviderList().find((p) => p.ProviderID === svc.ProviderID) ?? null;
    const recipients = fromProvider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
    if (recipients.length === 0) {
      setError('The current provider has no email address on file — cannot send a cancellation. Fix the provider contact details first.');
      setStep('cancel-failed');
      return;
    }

    const cancelTemplate = defaultTemplateForCancellation(svc.ServiceType);
    const generatedCancel = generateEmail(
      cancelTemplate, trip.TripID, leg.LegID, svc.SVCID, legs, persons, '',
      trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
      trip.Client, trip.Operator, trip.SupportRef || '', svc.CountryISO2 ?? null, recipients,
      null, svc.RefNumber || '',
    );
    const cancelComm: Comm = {
      CommID: `COMM-${svc.SVCID}-CANCEL-${Date.now()}`,
      Direction: 'OUTBOUND',
      TripID: trip.TripID,
      SVCID: svc.SVCID,
      Token: svc.SVCID,
      From: 'operations@viq.local',
      To: recipients.join(', '),
      Subject: generatedCancel.subject,
      Body: generatedCancel.body,
      TimestampZ: new Date().toISOString(),
      Status: 'Draft',
    };

    try {
      await saveComm(cancelComm);
      const sentCancel = await sendComm(cancelComm.CommID);
      if (sentCancel.Status !== 'Sent') {
        setError(`Cancellation to ${fromProvider?.Name ?? 'the current vendor'} could not be sent: ${sentCancel.ErrorMessage || 'unknown error'}. Nothing has changed — you can retry.`);
        setStep('cancel-failed');
        return;
      }
    } catch (err) {
      setError('Cancellation send failed — nothing has changed. You can retry.');
      setStep('cancel-failed');
      return;
    }

    let pending: Service;
    try {
      pending = await changeVendor(svc.SVCID, {
        toProviderId, reason, notes: notes || undefined,
        cancellationCommId: cancelComm.CommID, version: svc.Version,
      });
    } catch (err) {
      const message = err instanceof ApiError && err.status === 409
        ? 'This service was modified elsewhere — close and reopen to retry.'
        : 'The cancellation to the previous vendor was sent, but the vendor swap failed to save. Please retry — do not resend the cancellation.';
      setError(message);
      setStep('cancel-failed');
      return;
    }

    setStep('requesting');
    const toProvider = getProviderList().find((p) => p.ProviderID === toProviderId) ?? null;
    const newRecipients = toProvider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
    if (newRecipients.length === 0) {
      await saveService({ ...pending, Notes: `${pending.Notes} Change Vendor: new provider has no email on file.`.trim() });
      setError('Vendor cancelled and swapped, but the new provider has no email address on file. This service now needs a manual submission.');
      setStep('request-failed');
      await onChanged();
      return;
    }

    const requestTemplate = defaultTemplateFor(svc.ServiceType, 'Request');
    const newRef = `REQ-${svc.SVCID}-${Date.now()}`;
    const generatedRequest = generateEmail(
      requestTemplate, trip.TripID, leg.LegID, pending.SVCID, legs, persons, '',
      trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
      trip.Client, trip.Operator, trip.SupportRef || '', pending.CountryISO2 ?? null, newRecipients,
      null, newRef,
    );
    const requestComm: Comm = {
      CommID: `COMM-${pending.SVCID}-${Date.now()}`,
      Direction: 'OUTBOUND',
      TripID: pending.TripID,
      SVCID: pending.SVCID,
      Token: pending.SVCID,
      From: 'operations@viq.local',
      To: newRecipients.join(', '),
      Subject: generatedRequest.subject,
      Body: generatedRequest.body,
      TimestampZ: new Date().toISOString(),
      Status: 'Draft',
    };

    try {
      await saveComm(requestComm);
      const sentRequest = await sendComm(requestComm.CommID);
      if (sentRequest.Status === 'Sent') {
        await saveService({ ...pending, Status: 'Requested', RefNumber: newRef });
        setStep('done');
      } else {
        await saveService({ ...pending, Status: 'Submission Failed', Notes: `${pending.Notes} Send failed: ${sentRequest.ErrorMessage || 'unknown error'}.`.trim() });
        setStep('request-failed');
      }
    } catch (err) {
      await saveService({ ...pending, Status: 'Submission Failed', Notes: `${pending.Notes} Send failed: unexpected error.`.trim() });
      setStep('request-failed');
    }

    await onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change Vendor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm">
            <div className="text-muted-foreground">Current vendor</div>
            <div className="font-medium">{currentProvider?.Name ?? svc.ProviderID}</div>
            {svc.RefNumber && <div className="text-xs text-muted-foreground">Previous request: {svc.RefNumber}</div>}
          </div>

          {step === 'pick' && (
            <>
              <div>
                <Label>Replacement vendor</Label>
                {loadingCandidates ? (
                  <div className="text-xs text-muted-foreground">Loading eligible vendors…</div>
                ) : (
                  <Select value={toProviderId} onValueChange={setToProviderId}>
                    <SelectTrigger><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
                    <SelectContent>
                      {pickerOptions.map((p) => <SelectItem key={p.ProviderID} value={p.ProviderID}>{p.Name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {!loadingCandidates && candidates.length === 0 && !overrideMode && (
                  <div className="mt-1 text-xs text-muted-foreground">No eligible vendors found for this context.</div>
                )}
                {isAdmin && (
                  <button type="button" className="mt-1 text-xs text-blue-600 underline" onClick={() => setOverrideMode((v) => !v)}>
                    {overrideMode ? 'Show eligible vendors only' : 'Choose any vendor (Admin override)'}
                  </button>
                )}
              </div>
              <div>
                <Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                  <SelectContent>
                    {VENDOR_CHANGE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}

          {step === 'cancelling' && <div className="text-sm">Sending cancellation to {currentProvider?.Name}…</div>}
          {step === 'requesting' && <div className="text-sm">Sending new request to the replacement vendor…</div>}
          {step === 'done' && <div className="text-sm text-emerald-600">Done — previous request cancelled, replacement request sent.</div>}

          {(step === 'cancel-failed' || step === 'request-failed') && (
            <div className="text-sm text-red-600">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{step === 'done' ? 'Close' : 'Cancel'}</Button>
          {step === 'pick' && (
            <Button disabled={!toProviderId || !reason} onClick={handleConfirm}>Confirm Change</Button>
          )}
          {step === 'cancel-failed' && (
            <Button onClick={handleConfirm}>Retry Cancellation</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`src/client/components/ui/textarea.tsx` already exists in this codebase — the `Textarea` import above is correct as written.

- [ ] **Step 2: Gate the raw provider field and wire the dialog into `ServiceInlineEditor`**

`changeVendorAllowed` (Task 3) lives in `src/server/common/statusTransitions.ts`, a server-only module the client cannot import. Add a client-side copy of the same one-line check directly to `dataStore.ts`, near its other Service-status helpers:

```typescript
// src/client/lib/dataStore.ts
export function changeVendorAllowedClient(status: string): boolean {
  return ['Requested', 'Chasing', 'Confirmed', 'Re-confirm Required'].includes(status);
}
```

In `src/client/pages/TripDetail.tsx`, add `changeVendorAllowedClient` to the existing large `import { ... } from '@/lib/dataStore';` block near the top of the file (do not add a second, separate import statement — every other dataStore function this file uses is already imported from that one block). Also add a new import line for the dialog component:

```typescript
import { ChangeVendorDialog } from '@/components/ChangeVendorDialog';
```

Find `ServiceInlineEditor` (search for `function ServiceInlineEditor`) and add local state near its other `useState` calls:

```typescript
  const [changeVendorOpen, setChangeVendorOpen] = useState(false);
```

Find the raw provider `<select>` (search for `title="Provider"`, around where `draft.ProviderID` is read/set) and change its `disabled` prop and add the button:

```typescript
              <select
                className="h-8 min-w-0 rounded border bg-background px-1 text-xs"
                disabled={!editing || changeVendorAllowedClient(service.Status)}
                value={draft.ProviderID || ''}
                onChange={(event) => setDraft({ ...draft, ProviderID: event.target.value || null })}
                title="Provider"
              >
                <option value="">NO PROVIDER</option>
                {providerOptions.map((p) => <option key={p.ProviderID} value={p.ProviderID}>{p.Name}</option>)}
              </select>
              {editing && changeVendorAllowedClient(service.Status) && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setChangeVendorOpen(true)}>
                  CHANGE VENDOR
                </Button>
              )}
```

Note this uses `service.Status` (the last-saved status, from props) rather than `draft.Status` — deliberately: Change Vendor operates on the real, saved state of the service, not an unsaved draft edit sitting in the same form. If the coordinator has an unsaved status change pending in `draft`, they should save or discard that first; opening Change Vendor mid-edit against unsaved draft state would be genuinely ambiguous about which "before" state it's acting on.

Add the dialog itself near the end of `ServiceInlineEditor`'s JSX (inside the existing `<Sheet>`, after the other dialogs already rendered there — search for where `ComposeDrawer`/similar sibling dialogs are already rendered in this component to match placement):

```typescript
      <ChangeVendorDialog
        open={changeVendorOpen}
        onClose={() => setChangeVendorOpen(false)}
        svc={service}
        leg={leg}
        trip={trip}
        legs={legs}
        persons={persons}
        onChanged={async () => {
          setChangeVendorOpen(false);
          await onSaved();
        }}
      />
```

- [ ] **Step 3: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual dev-server verification**

Start the dev server (`npm run start:dev`, then `npm run build:client` again since watch-mode wipes `dist/public` on its initial compile). Open a trip with a service in `Requested` status, open its drawer, confirm the raw Provider `<select>` is now disabled and a `CHANGE VENDOR` button appears. Click it, confirm the dialog loads eligible candidates, pick one, pick a reason, confirm — verify (via the Comms/Activity views, or server logs) that a cancellation email and a new request email were both created, and the service ends at `Requested` with the new provider. Then deliberately test a failure path if practical (e.g. a provider with no email channel) to confirm the hard-stop behavior.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ChangeVendorDialog.tsx src/client/pages/TripDetail.tsx src/client/lib/dataStore.ts
git commit -m "feat: add Change Vendor dialog and wire into the service inline editor"
```

---

### Task 7: Service Activity timeline — merge in `VendorChangeLog` entries

**Files:**
- Modify: `src/client/components/StatusTimeline.tsx`
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: Task 5's `getVendorChangeLogsForService`, existing `getProviderList`.
- Produces: `StatusTimeline` gains an optional `extraEntries` prop — no other file depends on this beyond `TripDetail.tsx`'s own usage added in this task.

- [ ] **Step 1: Extend `StatusTimeline` with an optional `extraEntries` prop**

```typescript
// src/client/components/StatusTimeline.tsx
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuditForRecord } from '@/lib/dataStore';
import type { AuditEntry } from '@/data/types';

export interface TimelineExtraEntry {
  timestampZ: string;
  node: ReactNode;
}

export function StatusTimeline({ table, recordId, extraEntries = [] }: { table: string; recordId: string; extraEntries?: TimelineExtraEntry[] }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getAuditForRecord(table, recordId)
      .then((rows) => {
        if (!cancelled) setEntries(rows.filter((r) => r.Field === 'status'));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [table, recordId]);

  if (loading) return <p className="text-xs text-muted-foreground">Loading status history…</p>;
  if (failed) return <p className="text-xs text-destructive">Couldn't load status history.</p>;

  const merged = [
    ...entries.map((entry) => ({
      timestampZ: entry.TimestampZ,
      node: (
        <>
          <span>{entry.OldValue} → <span className="font-medium text-foreground">{entry.NewValue}</span></span>
          <span>by {entry.User}</span>
        </>
      ),
    })),
    ...extraEntries,
  ].sort((a, b) => new Date(a.timestampZ).getTime() - new Date(b.timestampZ).getTime());

  if (merged.length === 0) return <p className="text-xs text-muted-foreground">No status changes yet.</p>;

  return (
    <ul className="space-y-1 text-xs">
      {merged.map((item, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span className="font-mono">{new Date(item.timestampZ).toISOString()}</span>
          {item.node}
        </li>
      ))}
    </ul>
  );
}
```

This project's `tsconfig.client.json` uses `"jsx": "react-jsx"` (the automatic JSX runtime), which does not put the `React` namespace in scope for type references — the explicit `import type { ReactNode } from 'react';` above is required, not optional.

The Trip-table caller (`TripDetail.tsx` line ~1784, `<StatusTimeline table="Trip" recordId={trip.TripID} />`) needs no changes — it simply doesn't pass `extraEntries`, defaulting to `[]`, and renders exactly as it does today.

- [ ] **Step 2: Wire `VendorChangeLog` entries into the Service-table caller**

In `ServiceInlineEditor` (`TripDetail.tsx`), add state and an effect near the existing `changeVendorOpen` state added in Task 6:

```typescript
  const [vendorChangeLogs, setVendorChangeLogs] = useState<VendorChangeLog[]>([]);
  useEffect(() => {
    getVendorChangeLogsForService(service.SVCID).then(setVendorChangeLogs).catch(() => setVendorChangeLogs([]));
  }, [service.SVCID]);
```

`VendorChangeLog` is defined in `@/lib/dataStore` (Task 5), not `@/data/types` — this file already has a separate `import type { ..., Client, UserDirectoryEntry, AuthorizationCandidate } from '@/lib/dataStore';` line for exactly this reason (types that live in `dataStore.ts` rather than `data/types.ts`). Add `VendorChangeLog` to that existing type-only import line. Add `getVendorChangeLogsForService` to this file's main (non-type-only) `@/lib/dataStore` import block.

Find the existing `<StatusTimeline table="Service" recordId={service.SVCID} />` call (around line 1144) and replace it with:

```typescript
              <StatusTimeline
                table="Service"
                recordId={service.SVCID}
                extraEntries={vendorChangeLogs.map((log) => {
                  const fromName = providers.find((p) => p.ProviderID === log.FromProviderID)?.Name ?? log.FromProviderID;
                  const toName = providers.find((p) => p.ProviderID === log.ToProviderID)?.Name ?? log.ToProviderID;
                  return {
                    timestampZ: log.ChangedAtZ,
                    node: (
                      <span>
                        VENDOR CHANGED: {fromName} → {toName} — Reason: {log.Reason}. Previous request cancelled, replacement request created.
                      </span>
                    ),
                  };
                })}
              />
```

(`providers` is already in scope in `ServiceInlineEditor` — it's the `getProviderList()` result already used for `eligibleProviders`/`selectedProvider` a few lines above.)

- [ ] **Step 3: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual dev-server verification**

Complete a Change Vendor flow (Task 6's manual verification), then open the same service's drawer's activity view and confirm a "VENDOR CHANGED: X → Y — Reason: ..." line appears in chronological position alongside the ordinary status-change lines, and that the Trip-level `StatusTimeline` (unrelated) still renders exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/StatusTimeline.tsx src/client/pages/TripDetail.tsx
git commit -m "feat: merge VendorChangeLog entries into the Service Activity timeline"
```

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** §1 (availability) → Task 3 (`changeVendorAllowed`) + Task 6 (client gating). §2 (data model) → Task 1. §3 (resolver extension) → Task 2. §4 (email template) → Task 4. §5 (workflow sequencing) → Task 6. §6 (atomic endpoint) → Task 3. §7 (activity timeline) → Task 7. §8 (trip change impact) → deliberately no task; §8 concludes no new trigger is needed beyond what Tasks 1/3 already produce.
- **Type consistency checked:** `VendorChangeLog`'s field names are identical across Task 1 (Prisma), Task 3 (service/DTO), Task 5 (client interface/mapper), and Task 7 (consumption) — `fromProviderId`/`toProviderId`/`reason`/`notes`/`cancellationCommId`/`newRequestCommId`/`changedBy`/`changedAtZ` server-side, `FromProviderID`/`ToProviderID`/`Reason`/`Notes`/`CancellationCommID`/`NewRequestCommID`/`ChangedBy`/`ChangedAtZ` client-side, matching this codebase's established snake_case-server/PascalCase-client convention throughout every other entity in `dataStore.ts`.
- **Placeholder scan:** first draft had two bracketed "fill in" placeholders in Task 2's test code — fixed by reading the real `vendor-resolver.service.spec.ts` fixtures (`PROV-A`/`PROV-B`/`PROV-C`, country `TZ`, client `CLI-1`, the existing `makeAssignment` helper) and writing fully concrete, self-contained tests instead. Also caught during this pass: Task 3's test file used `Test.createTestingModule` where this codebase's real convention (confirmed against `service-status-locking.spec.ts`) is direct instantiation (`new ServicesService(prisma, audit, new VendorResolverService(prisma))`) plus the shared `truncateAll` helper, not manual per-table `deleteMany()` — fixed in both Task 1 and Task 3's tests. Also caught: every `Provider` test fixture was missing the required `scope` field (schema has no default) — fixed across all 7 occurrences. Also caught: Task 6 Step 2 gave a contradictory two-step instruction (add an import, then immediately remove it) — rewritten as one coherent instruction. No remaining TBD/TODO/"fill in" markers; every code block is real, runnable code verified against the actual files it modifies.
