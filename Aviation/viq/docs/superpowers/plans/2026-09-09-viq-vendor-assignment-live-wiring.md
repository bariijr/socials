# VIQ Vendor Assignment Live Wiring (Sub-Project 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `services.service.ts`'s simple `resolveProvider()` fallback with the already-built `VendorResolverService.resolve()` in live generation, persist the outcome on `Service`, and give coordinators a way to resolve ties and see why a vendor was chosen.

**Architecture:** Server-side swap in the two generation methods, three new `Service` fields, a 4th auto-generation trigger on Phase 8's existing isolated `task-sync.service.ts`, one new "candidates" endpoint mirroring the existing `authorization-candidates` pattern, and two small client additions (a shared tie-resolution dialog invoked from all 4 generation call sites, and a "Why this vendor?" panel in the existing Service editor).

**Tech Stack:** NestJS 10, Prisma 5.22, PostgreSQL, React 19 + Vite + TS, Jest against real `jetflow_test` Postgres (no mocked Prisma).

**Spec:** [2026-09-09-viq-vendor-assignment-live-wiring-design.md](../specs/2026-09-09-viq-vendor-assignment-live-wiring-design.md)

## Global Constraints

- Real Postgres (`jetflow_test`) for every server test — never mock Prisma.
- `vendorSelectionSource` serves two purposes with one field: the real source string when `RESOLVED`/`USER_SELECTED`, or the literal marker `'CHOICE_REQUIRED'`/`'NO_ELIGIBLE_VENDOR'` otherwise. The client's only check for "needs the tie dialog" is `VendorSelectionSource === 'CHOICE_REQUIRED'`.
- A manual `PATCH` that changes `providerId` ALWAYS server-side stamps `vendorSelectionSource: 'USER_SELECTED'`, `vendorSelectedAtZ: now()`, `vendorAssignmentId: null` — never trust a client-supplied value for these three fields (same reasoning as `confirmedBy`/`confirmedAtZ` in this same file, §19).
- `VendorResolverService` itself (sub-project 1, already shipped/reviewed) is NOT modified by this plan — only called into. No task in this plan touches `vendor-resolver.service.ts` or its own tests.
- `task-sync.service.ts`'s existing 3 triggers, escalation logic, and BullMQ scheduling are NOT modified beyond the one additive 4th trigger — same isolation guarantee Phase 8 established.
- After each task: run the affected test file(s), then `npm run build:server` and/or `npm run build:client` as applicable (kill any orphaned `node.exe`/`nest start --watch` process first if a server build fails with an `EPERM`/DLL-lock error), then commit.

---

### Task 1: Data model — Service gets 3 new fields, back-reference added

**Files:**
- Modify: `prisma/schema.prisma` — add 3 fields + 1 relation to `Service` (currently `model Service { ... }` starting at line 530); add `services Service[]` back-reference to `VendorAssignment`.

**Interfaces:**
- Produces: `Service.vendorSelectionSource: String?`, `Service.vendorAssignmentId: String?`, `Service.vendorSelectedAtZ: DateTime?`, `Service.vendorAssignment: VendorAssignment?` relation — consumed by Tasks 2, 3, 4, 5.

- [ ] **Step 1: Add the 3 fields + relation to `model Service`**

In `prisma/schema.prisma`, in the `Service` model, add these fields right after `authorizationId String? @map("authorization_id")` (currently the last scalar field before the blank line and relations):

```prisma
  vendorSelectionSource String?   @map("vendor_selection_source")
  vendorAssignmentId    String?   @map("vendor_assignment_id")
  vendorSelectedAtZ     DateTime? @map("vendor_selected_at_z")
```

And add this relation alongside the existing `trip`/`provider`/`authorization`/`tasks` relations:

```prisma
  vendorAssignment VendorAssignment? @relation(fields: [vendorAssignmentId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Add the back-reference to `model VendorAssignment`**

Find `model VendorAssignment {` in `prisma/schema.prisma` (has existing relations `provider`, `client`, `country`, `airport`). Add:

```prisma
  services Service[]
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name vendor_selection_on_service`
Expected: creates `prisma/migrations/<timestamp>_vendor_selection_on_service/migration.sql`, applies cleanly. If it fails with `EPERM` on `query_engine-windows.dll.node`:
```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId,CommandLine
Stop-Process -Id <pid> -Force
```
then retry.

- [ ] **Step 4: Build and commit**

Run: `npm run build:server`
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add vendor selection fields to Service"
```

---

### Task 2: Wire VendorResolverService into live generation

**Files:**
- Modify: `src/server/modules/services/services.service.ts` — `createOverflightService` (private method, currently calls `this.resolveProvider('Overflight', leg.depIcao, iso2)` around line 391), `generateArrivalServices`'s `make()` closure (currently calls `this.resolveProvider(serviceType, icao, iso2)` around line 567), constructor.
- Modify: `src/server/modules/services/services.module.ts` — import `VendorAssignmentsModule`.
- Test: `src/server/modules/services/vendor-resolution-generation.spec.ts`

**Interfaces:**
- Consumes: `VendorResolverService.resolve(ctx: VendorResolutionContext): Promise<VendorResolutionResult>` from `../vendor-assignments/vendor-resolver.service` (sub-project 1, already shipped — `VendorResolutionContext = { countryIso2?, icao?, serviceType, permitType?, clientId?, asOfZ? }`, `VendorResolutionResult = { status: 'RESOLVED'|'CHOICE_REQUIRED'|'NO_ELIGIBLE_VENDOR'|'BLOCKED', selectedVendorId?, selectionSource?, matchedRule?: {id, rank, preferred}, alternatives, reason }`).
- Produces: both generation methods now populate `providerId`/`vendorSelectionSource`/`vendorAssignmentId`/`vendorSelectedAtZ` per the mapping table below — consumed by Task 4 (candidates endpoint reads the same context shape) and the client tasks (7).

- [ ] **Step 1: Add `VendorResolverService` to `ServicesService`'s constructor**

In `src/server/modules/services/services.service.ts`, add the import:
```typescript
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
```
and update the constructor:
```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vendorResolver: VendorResolverService,
  ) {}
```

- [ ] **Step 2: Import `VendorAssignmentsModule` in `services.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { VendorAssignmentsModule } from '../vendor-assignments/vendor-assignments.module';

@Module({
  imports: [VendorAssignmentsModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
```

- [ ] **Step 3: Add a private helper resolving the trip's clientId, and replace `resolveProvider` calls**

Add this private method to `ServicesService` (it's used by both call sites and Task 4):

```typescript
  private async resolveVendor(serviceType: string, icao: string, iso2: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { tripId }, select: { clientId: true } });
    return this.vendorResolver.resolve({
      countryIso2: iso2,
      icao,
      serviceType,
      clientId: trip?.clientId ?? undefined,
    });
  }
```

In `createOverflightService`, replace:
```typescript
    const providerId = await this.resolveProvider('Overflight', leg.depIcao, iso2);
```
with:
```typescript
    const resolution = await this.resolveVendor('Overflight', leg.depIcao, iso2, leg.tripId);
    const providerId = resolution.status === 'RESOLVED' ? resolution.selectedVendorId : null;
```
Then in the `prisma.service.create({ data: { ... } })` call in the same method, add these three fields alongside the existing `providerId,` line:
```typescript
        providerId,
        vendorSelectionSource: resolution.status === 'RESOLVED' ? resolution.selectionSource : resolution.status,
        vendorAssignmentId: resolution.status === 'RESOLVED' ? resolution.matchedRule!.id : null,
        vendorSelectedAtZ: resolution.status === 'RESOLVED' ? new Date() : null,
```

In `generateArrivalServices`'s `make()` closure, replace:
```typescript
      const providerId = await this.resolveProvider(serviceType, icao, iso2);
```
with:
```typescript
      const resolution = await this.resolveVendor(serviceType, icao, iso2, leg.tripId);
      const providerId = resolution.status === 'RESOLVED' ? resolution.selectedVendorId : null;
```
Then add the same three fields to that method's `prisma.service.create({ data: { ... } })` call, alongside its existing `providerId,` line:
```typescript
          providerId,
          vendorSelectionSource: resolution.status === 'RESOLVED' ? resolution.selectionSource : resolution.status,
          vendorAssignmentId: resolution.status === 'RESOLVED' ? resolution.matchedRule!.id : null,
          vendorSelectedAtZ: resolution.status === 'RESOLVED' ? new Date() : null,
```

Leave the old private `resolveProvider` method in place for now — it becomes dead code but removing it is out of scope for this task (a later cleanup task, not blocking correctness). Do NOT delete it in this task.

- [ ] **Step 4: Write `src/server/modules/services/vendor-resolution-generation.spec.ts`**

```typescript
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Vendor resolution wired into live generation', () => {
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
    const resolver = new VendorResolverService(prisma);
    services = new ServicesService(prisma, audit, resolver);
    await prisma.country.create({
      data: { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -6.37, centroidLng: 34.89 },
    });
    await prisma.trip.create({ data: { tripId: 'TEST-VENDOR-GEN-1', client: 'Test Client' } });
  });

  async function makeLeg(legId: string, depIcao: string, arrIcao: string) {
    return prisma.leg.create({
      data: {
        legId, tripId: 'TEST-VENDOR-GEN-1', seq: 1, depIcao, arrIcao,
        etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 3, paxCount: 2, crewCount: 2, countriesOverflown: ['TZ'],
      },
    });
  }

  it('a RESOLVED context stamps providerId, vendorSelectionSource, vendorAssignmentId, vendorSelectedAtZ', async () => {
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    const assignment = await prisma.vendorAssignment.create({
      data: { providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1 },
    });
    await makeLeg('TEST-VENDOR-GEN-1-LEG-1', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-1');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBe('PROV-A');
    expect(created[0].vendorSelectionSource).toBe('COUNTRY_DEFAULT');
    expect(created[0].vendorAssignmentId).toBe(assignment.id);
    expect(created[0].vendorSelectedAtZ).not.toBeNull();
  });

  it('a CHOICE_REQUIRED context creates the service with providerId null and the literal marker', async () => {
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Vendor B', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-B', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    await makeLeg('TEST-VENDOR-GEN-1-LEG-2', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-2');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBeNull();
    expect(created[0].vendorSelectionSource).toBe('CHOICE_REQUIRED');
    expect(created[0].vendorAssignmentId).toBeNull();
  });

  it('a NO_ELIGIBLE_VENDOR context creates the service with providerId null and the literal marker', async () => {
    await makeLeg('TEST-VENDOR-GEN-1-LEG-3', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-3');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBeNull();
    expect(created[0].vendorSelectionSource).toBe('NO_ELIGIBLE_VENDOR');
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- vendor-resolution-generation.spec.ts`
Expected: 3 tests pass.

- [ ] **Step 6: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/services/services.service.ts src/server/modules/services/services.module.ts src/server/modules/services/vendor-resolution-generation.spec.ts
git commit -m "feat: wire VendorResolverService into live service generation"
```

---

### Task 3: Auto-stamp USER_SELECTED on manual provider change

**Files:**
- Modify: `src/server/modules/services/services.service.ts` — `update()` method (around line 78).
- Test: `src/server/modules/services/vendor-selection-manual-update.spec.ts`

**Interfaces:**
- Consumes: nothing new (same `update()` method already present).
- Produces: `update()` now also stamps `vendorSelectionSource`/`vendorSelectedAtZ`/`vendorAssignmentId` when `providerId` changes — consumed by Task 7's tie-resolution dialog (which resolves a tie via a normal `PATCH` with a `providerId`).

- [ ] **Step 1: Add provider-change detection and stamping to `update()`**

In `src/server/modules/services/services.service.ts`'s `update()` method, alongside the existing `const becomingConfirmed = statusChanging && data.status === 'Confirmed';` line, add:

```typescript
    const providerChanging = data.providerId !== undefined && data.providerId !== before.providerId;
```

Then in the `prisma.service.updateMany({ where: ..., data: { ... } })` call, alongside the existing `...(becomingConfirmed ? { confirmedBy: ..., confirmedAtZ: ... } : {}),` line, add:

```typescript
        ...(providerChanging ? { vendorSelectionSource: 'USER_SELECTED', vendorSelectedAtZ: new Date(), vendorAssignmentId: null } : {}),
```

- [ ] **Step 2: Write `src/server/modules/services/vendor-selection-manual-update.spec.ts`**

```typescript
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Manual provider change stamps USER_SELECTED (§4)', () => {
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
    services = new ServicesService(prisma, new AuditService(prisma), new VendorResolverService(prisma));
    await prisma.trip.create({ data: { tripId: 'TEST-VENDOR-MANUAL-1', client: 'Test Client' } });
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Vendor B', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
  });

  async function makeUnresolvedService(svcId: string) {
    return prisma.service.create({
      data: {
        svcId, tripId: 'TEST-VENDOR-MANUAL-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', vendorSelectionSource: 'CHOICE_REQUIRED',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
  }

  it('a PATCH that sets providerId stamps USER_SELECTED and clears vendorAssignmentId', async () => {
    const svc = await makeUnresolvedService('TEST-VENDOR-MANUAL-1-SVC-1');
    const updated = await services.update('TEST-VENDOR-MANUAL-1-SVC-1', { providerId: 'PROV-A', version: svc.version } as any);
    expect(updated.vendorSelectionSource).toBe('USER_SELECTED');
    expect(updated.vendorAssignmentId).toBeNull();
    expect(updated.vendorSelectedAtZ).not.toBeNull();
  });

  it('a PATCH that does not touch providerId leaves the vendor fields untouched', async () => {
    const svc = await makeUnresolvedService('TEST-VENDOR-MANUAL-1-SVC-2');
    const updated = await services.update('TEST-VENDOR-MANUAL-1-SVC-2', { notes: 'unrelated edit', version: svc.version } as any);
    expect(updated.vendorSelectionSource).toBe('CHOICE_REQUIRED');
    expect(updated.vendorSelectedAtZ).toBeNull();
  });

  it('changing providerId from one vendor to another also re-stamps USER_SELECTED', async () => {
    const svc = await makeUnresolvedService('TEST-VENDOR-MANUAL-1-SVC-3');
    const first = await services.update('TEST-VENDOR-MANUAL-1-SVC-3', { providerId: 'PROV-A', version: svc.version } as any);
    const second = await services.update('TEST-VENDOR-MANUAL-1-SVC-3', { providerId: 'PROV-B', version: first.version } as any);
    expect(second.providerId).toBe('PROV-B');
    expect(second.vendorSelectionSource).toBe('USER_SELECTED');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- vendor-selection-manual-update.spec.ts`
Expected: 3 tests pass.

- [ ] **Step 4: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/services/services.service.ts src/server/modules/services/vendor-selection-manual-update.spec.ts
git commit -m "feat: auto-stamp USER_SELECTED when a service's provider is manually changed"
```

---

### Task 4: `GET /services/:svcId/vendor-candidates` endpoint

**Files:**
- Modify: `src/server/modules/services/services.service.ts` — add `vendorCandidates(svcId)` method.
- Modify: `src/server/modules/services/services.controller.ts` — add the route.
- Test: `src/server/modules/services/vendor-candidates.spec.ts`

**Interfaces:**
- Consumes: `this.resolveVendor` (Task 2), `VendorResolverService.resolve` (sub-project 1).
- Produces: `ServicesService.vendorCandidates(svcId: string): Promise<{ status: string; alternatives: { vendorId: string; providerName: string }[] }>` — consumed by Task 6/7's client `getVendorCandidates` function and the tie-resolution dialog.

- [ ] **Step 1: Add `vendorCandidates` to `ServicesService`**

Add this method to `services.service.ts`, near `authorizationCandidates` (around line 227):

```typescript
  async vendorCandidates(svcId: string) {
    const svc = await this.findOne(svcId);
    if (!svc.countryIso2) return { status: 'NO_ELIGIBLE_VENDOR', alternatives: [] };
    const resolution = await this.resolveVendor(svc.serviceType, svc.icao ?? '', svc.countryIso2, svc.tripId);
    if (resolution.alternatives.length === 0) {
      return { status: resolution.status, alternatives: [] };
    }
    const providers = await this.prisma.provider.findMany({
      where: { providerId: { in: resolution.alternatives.map((a) => a.vendorId) } },
    });
    const nameById = new Map(providers.map((p) => [p.providerId, p.name]));
    return {
      status: resolution.status,
      alternatives: resolution.alternatives.map((a) => ({ vendorId: a.vendorId, providerName: nameById.get(a.vendorId) ?? a.vendorId })),
    };
  }
```

- [ ] **Step 2: Add the route to `ServicesController`**

Add this method to `services.controller.ts`, after `authorizationCandidates`:

```typescript
  @Get(':svcId/vendor-candidates')
  vendorCandidates(@Param('svcId') svcId: string) {
    return this.services.vendorCandidates(svcId);
  }
```

- [ ] **Step 3: Write `src/server/modules/services/vendor-candidates.spec.ts`**

```typescript
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('GET vendor-candidates', () => {
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
    services = new ServicesService(prisma, new AuditService(prisma), new VendorResolverService(prisma));
    await prisma.trip.create({ data: { tripId: 'TEST-VENDOR-CAND-1', client: 'Test Client' } });
  });

  it('returns the live tied alternatives with provider names for a CHOICE_REQUIRED service', async () => {
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Alpha Handling', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Beta Handling', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-B', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    const svc = await prisma.service.create({
      data: {
        svcId: 'TEST-VENDOR-CAND-1-SVC-1', tripId: 'TEST-VENDOR-CAND-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', countryIso2: 'TZ', vendorSelectionSource: 'CHOICE_REQUIRED',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
    const result = await services.vendorCandidates(svc.svcId);
    expect(result.status).toBe('CHOICE_REQUIRED');
    expect(result.alternatives.map((a) => a.providerName).sort()).toEqual(['Alpha Handling', 'Beta Handling']);
  });

  it('returns an empty alternatives list for a service with no eligible vendor', async () => {
    const svc = await prisma.service.create({
      data: {
        svcId: 'TEST-VENDOR-CAND-1-SVC-2', tripId: 'TEST-VENDOR-CAND-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', countryIso2: 'KE', vendorSelectionSource: 'NO_ELIGIBLE_VENDOR',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
    const result = await services.vendorCandidates(svc.svcId);
    expect(result.alternatives).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- vendor-candidates.spec.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/services/services.service.ts src/server/modules/services/services.controller.ts src/server/modules/services/vendor-candidates.spec.ts
git commit -m "feat: add GET /services/:svcId/vendor-candidates endpoint"
```

---

### Task 5: Task engine 4th trigger — no eligible vendor

**Files:**
- Modify: `src/server/modules/tasks/task-sync.service.ts` — add `generateNoVendorTasks`, call it from `runSync`, extend `isTriggerResolved`.
- Test: `src/server/modules/tasks/task-sync.service.spec.ts` — add 2 tests (existing file from Phase 8, currently 11 tests).

**Interfaces:**
- Consumes: nothing new — reads `Service.vendorSelectionSource`/`providerId` directly via `PrismaService`, exactly like the other 3 generators. No dependency on `VendorResolverService` or `ServicesService`.
- Produces: nothing new consumed elsewhere — this is the last piece of Phase 8/sub-project-2 integration.

- [ ] **Step 1: Add `generateNoVendorTasks` to `TaskSyncService`**

In `src/server/modules/tasks/task-sync.service.ts`, add this method alongside the existing 3 generators (`generateReconfirmTasks`, `generateResubmitTasks`, `generateDeadlineTasks`):

```typescript
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
```

- [ ] **Step 2: Call it from `runSync`**

In `runSync()`, add `generateNoVendorTasks` to the `created` sum:

```typescript
    const created =
      (await this.generateReconfirmTasks()) +
      (await this.generateResubmitTasks()) +
      (await this.generateDeadlineTasks()) +
      (await this.generateNoVendorTasks());
```

- [ ] **Step 3: Extend `isTriggerResolved`**

Add one more branch to the existing `isTriggerResolved` method:

```typescript
    if (sourceKey.startsWith('novendor:')) return svc.providerId !== null;
```

- [ ] **Step 4: Add 2 tests to `src/server/modules/tasks/task-sync.service.spec.ts`**

Append these two tests to the existing `describe` block (the file already has a `makeService` helper and `truncateAll` setup from Phase 8 — reuse them):

```typescript
  it('creates a no-vendor task for a service with NO_ELIGIBLE_VENDOR and no provider', async () => {
    await prisma.service.update({
      where: { svcId: (await makeService('SVC-NOVENDOR-1', 'Not Started')).svcId },
      data: { vendorSelectionSource: 'NO_ELIGIBLE_VENDOR' },
    });
    const result = await sync.runSync();
    expect(result.created).toBeGreaterThanOrEqual(1);
    const task = await prisma.task.findUnique({ where: { sourceKey: 'novendor:SVC-NOVENDOR-1' } });
    expect(task).not.toBeNull();
    expect(task!.title).toContain('No eligible vendor');
  });

  it('auto-closes a no-vendor task once the service gets a providerId', async () => {
    await prisma.service.update({
      where: { svcId: (await makeService('SVC-NOVENDOR-2', 'Not Started')).svcId },
      data: { vendorSelectionSource: 'NO_ELIGIBLE_VENDOR' },
    });
    await sync.runSync();
    await prisma.provider.create({ data: { providerId: 'PROV-FALLBACK', name: 'Fallback Vendor', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.service.update({ where: { svcId: 'SVC-NOVENDOR-2' }, data: { providerId: 'PROV-FALLBACK', vendorSelectionSource: 'USER_SELECTED' } });
    const result = await sync.runSync();
    expect(result.closed).toBeGreaterThanOrEqual(1);
    const task = await prisma.task.findUnique({ where: { sourceKey: 'novendor:SVC-NOVENDOR-2' } });
    expect(task!.status).toBe('Complete');
  });
```

Confirmed against the existing file (`task-sync.service.spec.ts:23-30`): `makeService(svcId: string, status: string, requiredByZ?: Date)` creates the row via `prisma.service.create` (tripId `'TEST-SYNC-1'`, scopeType/scopeId `'TRIP'`/`'TEST-SYNC-1'`, serviceType `'Overflight'`) and returns the created row — the two new tests' usage above matches this signature exactly.

- [ ] **Step 5: Run the tests**

Run: `npm test -- task-sync.service.spec.ts`
Expected: 13 tests pass (11 existing + 2 new).

- [ ] **Step 6: Build and commit**

Run: `npm run build:server`
```bash
git add src/server/modules/tasks/task-sync.service.ts src/server/modules/tasks/task-sync.service.spec.ts
git commit -m "feat: add no-eligible-vendor as a 4th task-sync trigger"
```

---

### Task 6: Client data layer — Service type fields, getVendorCandidates, VendorTieResolutionDialog

**Files:**
- Modify: `src/client/data/types.ts` — add 3 fields to `Service`.
- Modify: `src/client/lib/dataStore.ts` — extend `mapServiceFromApi`, add `getVendorCandidates`.
- Create: `src/client/components/VendorTieResolutionDialog.tsx`

**Interfaces:**
- Produces: `Service.VendorSelectionSource?: string`, `Service.VendorAssignmentID?: string`, `Service.VendorSelectedAtZ?: string`; `getVendorCandidates(svcId: string): Promise<{ status: string; alternatives: { vendorId: string; providerName: string }[] }>`; `VendorTieResolutionDialog` component — consumed by Task 7 (wiring into call sites) and Task 8 (Why This Vendor panel).

- [ ] **Step 1: Add 3 fields to the `Service` interface in `src/client/data/types.ts`**

In the `Service` interface (currently ends with `Variant?: string;` before its closing brace), add:

```typescript
  VendorSelectionSource?: string;
  VendorAssignmentID?: string;
  VendorSelectedAtZ?: string;
```

- [ ] **Step 2: Extend `mapServiceFromApi` in `src/client/lib/dataStore.ts`**

Add to the object `mapServiceFromApi` returns (after the existing `Variant: s.variant ?? undefined,` line):

```typescript
    VendorSelectionSource: s.vendorSelectionSource ?? undefined,
    VendorAssignmentID: s.vendorAssignmentId ?? undefined,
    VendorSelectedAtZ: s.vendorSelectedAtZ ?? undefined,
```

(These fields are server-derived/read-only from the client's perspective — do NOT add them to `mapServiceToApi`, matching how e.g. `AllowedTransitions` is read-only-from-client already.)

- [ ] **Step 3: Add `getVendorCandidates` to `dataStore.ts`**

Add near `getPermitAuthorizationList`/`authorizationCandidates`-style functions (search for how `authorization-candidates` is fetched from the client, if such a function already exists, and place this next to it for consistency; otherwise place it near the Service CRUD section):

```typescript
export async function getVendorCandidates(svcId: string): Promise<{ status: string; alternatives: { vendorId: string; providerName: string }[] }> {
  return apiJson(`/services/${svcId}/vendor-candidates`);
}
```

- [ ] **Step 4: Write `src/client/components/VendorTieResolutionDialog.tsx`**

```typescript
// src/client/components/VendorTieResolutionDialog.tsx
//
// Sub-project 2 of the Vendor Assignment Engine: after generation, any
// created service left as VendorSelectionSource === 'CHOICE_REQUIRED'
// needs a coordinator to pick between tied vendors. This dialog is
// invoked identically from all 4 generation call sites (TripDetail,
// AdminTrips x3, NewTripWizard) -- callers just filter the generation
// result for CHOICE_REQUIRED services and pass them in.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getVendorCandidates, saveService } from '@/lib/dataStore';
import type { Service } from '@/data/types';

interface RowState {
  service: Service;
  alternatives: { vendorId: string; providerName: string }[];
  selected?: string;
  loading: boolean;
  saved: boolean;
}

export function VendorTieResolutionDialog({
  open, onClose, services,
}: {
  open: boolean;
  onClose: () => void;
  services: Service[];
}) {
  const [rows, setRows] = useState<RowState[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(services.map((service) => ({ service, alternatives: [], loading: true, saved: false })));
    services.forEach((service, idx) => {
      getVendorCandidates(service.SVCID)
        .then((result) => {
          setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], alternatives: result.alternatives, loading: false };
            return next;
          });
        })
        .catch(() => {
          setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], loading: false };
            return next;
          });
        });
    });
  }, [open, services]);

  async function handleResolve(idx: number) {
    const row = rows[idx];
    if (!row.selected) return;
    await saveService({ ...row.service, ProviderID: row.selected });
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], saved: true };
      return next;
    });
  }

  const unresolvedCount = rows.filter((r) => !r.saved).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Vendor Choices ({unresolvedCount} remaining)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-auto">
          {rows.map((row, idx) => (
            <div key={row.service.SVCID} className="rounded-md border p-3 text-sm">
              <div className="font-medium mb-1">{row.service.ServiceType} — {row.service.CountryISO2 || row.service.ICAO}</div>
              {row.saved ? (
                <div className="text-xs text-emerald-600">Resolved.</div>
              ) : row.loading ? (
                <div className="text-xs text-muted-foreground">Loading options…</div>
              ) : row.alternatives.length === 0 ? (
                <div className="text-xs text-muted-foreground">No alternatives found — this may have already been resolved elsewhere.</div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={row.selected} onValueChange={(v) => setRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], selected: v };
                    return next;
                  })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {row.alternatives.map((a) => <SelectItem key={a.vendorId} value={a.vendorId}>{a.providerName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!row.selected} onClick={() => handleResolve(idx)}>Use</Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Note:** `saveService` (confirmed in `dataStore.ts:751`) checks whether the service already exists via `getServicesForTrip` and PATCHes it via `mapServiceToApi(service)` (which already includes `providerId`/`version`) — setting `ProviderID: row.selected` on the spread copy of `row.service` before calling it is sufficient; the server's Task 3 auto-stamp handles `VendorSelectionSource`/`VendorSelectedAtZ`/`VendorAssignmentID` itself from the `providerId` change, so the client must NOT also send `VendorSelectionSource` in this payload (it would be ignored server-side per Task 3's design, but omit it for clarity).

- [ ] **Step 5: Build**

Run: `npm run build:client`
Expected: clean (after resolving the `updateService`/`saveService` naming check in Step 4).

- [ ] **Step 6: Commit**

```bash
git add src/client/data/types.ts src/client/lib/dataStore.ts src/client/components/VendorTieResolutionDialog.tsx
git commit -m "feat: add vendor-selection Service fields, getVendorCandidates, and the tie-resolution dialog"
```

---

### Task 7: Wire the tie-resolution dialog into all 4 generation call sites

**Files:**
- Modify: `src/client/pages/TripDetail.tsx` — `save()` in the Leg editor (around line 419-456).
- Modify: `src/client/pages/admin/AdminTrips.tsx` — `handleRecalculateRoute`, `handleAddDepartureGroundHandling`, `handleAddLeg` (around lines 835-859).
- Modify: `src/client/pages/admin/NewTripWizard.tsx` — the per-leg generation loop (around lines 581-585).

**Interfaces:**
- Consumes: `VendorTieResolutionDialog` (Task 6).

- [ ] **Step 1: Add a shared filter helper**

Add this small helper to `src/client/lib/dataStore.ts` (near the Service CRUD section), so all 4 call sites use identical logic instead of repeating the filter:

```typescript
export function filterVendorTies(services: Service[]): Service[] {
  return services.filter((s) => s.VendorSelectionSource === 'CHOICE_REQUIRED');
}
```

- [ ] **Step 2: Wire into `TripDetail.tsx`'s `save()`**

In the Leg editor component, add state near the existing `suggested`/`reviewOpen` state:
```typescript
const [vendorTies, setVendorTies] = useState<Service[]>([]);
const [vendorTiesOpen, setVendorTiesOpen] = useState(false);
```
In `save()`, after the existing line `const newlySuggested = [...overflightCreated, ...arrivalCreated];`, add:
```typescript
      const ties = filterVendorTies(newlySuggested);
      if (ties.length > 0) {
        setVendorTies(ties);
        setVendorTiesOpen(true);
      }
```
Render the dialog in this component's JSX (wherever other dialogs in this same component are rendered, e.g. near `ConflictDialog`):
```tsx
<VendorTieResolutionDialog open={vendorTiesOpen} onClose={() => setVendorTiesOpen(false)} services={vendorTies} />
```
Add the imports: `import { VendorTieResolutionDialog } from '@/components/VendorTieResolutionDialog';` and add `filterVendorTies` to the existing `dataStore` import list.

- [ ] **Step 3: Wire into `AdminTrips.tsx`'s three call sites**

Add the same two state variables and the dialog render once at the top level of the component that owns `handleRecalculateRoute`/`handleAddDepartureGroundHandling`/`handleAddLeg` (they likely already share a common parent scope — check where `reload()` is defined and add the state there).

In `handleRecalculateRoute`:
```typescript
  const handleRecalculateRoute = async (leg: Leg) => {
    if (!canEdit) return;
    const countries = await computeCountriesOverflown(leg.DepICAO, leg.ArrICAO);
    const updated = { ...leg, CountriesOverflown: countries };
    await saveLeg(updated);
    const overflight = await generateOverflightServices(updated.LegID);
    const arrival = await generateArrivalServices(updated.LegID);
    const ties = filterVendorTies([...overflight, ...arrival]);
    if (ties.length > 0) { setVendorTies(ties); setVendorTiesOpen(true); }
    await reload();
  };
```

In `handleAddDepartureGroundHandling`:
```typescript
  const handleAddDepartureGroundHandling = async (leg: Leg) => {
    if (!canEdit) return;
    const arrival = await generateArrivalServices(leg.LegID, { departureGroundHandling: true });
    const ties = filterVendorTies(arrival);
    if (ties.length > 0) { setVendorTies(ties); setVendorTiesOpen(true); }
    await reload();
  };
```

In `handleAddLeg`:
```typescript
  const handleAddLeg = async (leg: Leg) => {
    await saveLeg(leg);
    const overflight = await generateOverflightServices(leg.LegID);
    const arrival = await generateArrivalServices(leg.LegID);
    const ties = filterVendorTies([...overflight, ...arrival]);
    if (ties.length > 0) { setVendorTies(ties); setVendorTiesOpen(true); }
    await reload();
    setAddLegOpen(false);
    setSelectedLegId(leg.LegID);
  };
```

Add the imports (`VendorTieResolutionDialog` from `@/components/VendorTieResolutionDialog`, `filterVendorTies` added to the existing `dataStore` import list) and render the dialog once alongside this component's other dialogs.

- [ ] **Step 4: Wire into `NewTripWizard.tsx`'s per-leg loop**

Add the same two state variables at the component's top level. Replace:
```typescript
    for (const [idx, l] of legs.entries()) {
      await saveLeg(l as Leg);
      await generateOverflightServices((l as Leg).LegID);
      await generateArrivalServices((l as Leg).LegID, { departureGroundHandling: depGHRequested[idx] });
    }
```
with:
```typescript
    const allTies: Service[] = [];
    for (const [idx, l] of legs.entries()) {
      await saveLeg(l as Leg);
      const overflight = await generateOverflightServices((l as Leg).LegID);
      const arrival = await generateArrivalServices((l as Leg).LegID, { departureGroundHandling: depGHRequested[idx] });
      allTies.push(...filterVendorTies([...overflight, ...arrival]));
    }
    if (allTies.length > 0) { setVendorTies(allTies); setVendorTiesOpen(true); }
```
Add the imports and render the dialog once, near wherever this wizard's other end-of-flow dialogs/confirmations are rendered. Add `Service` to this file's existing type imports if not already present.

- [ ] **Step 5: Build**

Run: `npm run build:client`
Expected: clean.

- [ ] **Step 6: Manual verification**

Start the dev server (`npm run start:dev`, then `npm run build:client` again per the `dist/public`-wipe quirk). Create two `VendorAssignment` rows tied at rank 1 for a country a real trip's route passes through (via `POST /vendor-assignments` or a quick script), then create a trip through `NewTripWizard` covering that country — confirm the tie-resolution dialog appears listing that service, and that picking a vendor and clicking "Use" updates it (reload the trip and confirm `ProviderID` is set).

- [ ] **Step 7: Commit**

```bash
git add src/client/lib/dataStore.ts src/client/pages/TripDetail.tsx src/client/pages/admin/AdminTrips.tsx src/client/pages/admin/NewTripWizard.tsx
git commit -m "feat: wire vendor-tie resolution dialog into all 4 generation call sites"
```

---

### Task 8: "Why this vendor?" panel in the Service editor

**Files:**
- Modify: `src/client/pages/admin/AdminTrips.tsx` — `ServiceEditorDialog` (around line 67-160+, where Phase 6's confirmation history was added).
- Modify: `src/client/lib/dataStore.ts` — add `getVendorAssignment(id: string)`.

**Interfaces:**
- Consumes: `GET /vendor-assignments/:id` (sub-project 1, already exists and works).

- [ ] **Step 1: Add `getVendorAssignment` to `dataStore.ts`**

```typescript
export async function getVendorAssignment(id: string): Promise<{ id: string; rank: number | null; preferred: boolean; effectiveFrom: string | null; effectiveUntil: string | null } | null> {
  try {
    return await apiJson(`/vendor-assignments/${id}`);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add the panel to `ServiceEditorDialog`**

Following the exact pattern Phase 6 used for `confirmationHistory` in this same component (a `useState` + `useEffect` fetching on `service.SVCID` change, then rendered inline), add:

```typescript
  const [vendorAssignmentDetail, setVendorAssignmentDetail] = useState<Awaited<ReturnType<typeof getVendorAssignment>>>(null);
  useEffect(() => {
    if (service.VendorAssignmentID) {
      getVendorAssignment(service.VendorAssignmentID).then(setVendorAssignmentDetail);
    } else {
      setVendorAssignmentDetail(null);
    }
  }, [service.VendorAssignmentID]);
```

Render, wherever this dialog's other read-only detail sections are shown (e.g. near the confirmation history block), whenever `service.ProviderID` is set:

```tsx
{service.ProviderID && (
  <div className="rounded-md border p-3 text-xs space-y-1">
    <div className="font-semibold">Why this vendor?</div>
    <div>Source: {service.VendorSelectionSource || 'Unknown'}</div>
    {service.VendorSelectedAtZ && <div>Selected: {formatZ(service.VendorSelectedAtZ)}</div>}
    {vendorAssignmentDetail && (
      <div>
        Rule: Rank {vendorAssignmentDetail.rank ?? '—'}{vendorAssignmentDetail.preferred ? ', Preferred' : ''}
        {vendorAssignmentDetail.effectiveUntil && ` — valid until ${formatZ(vendorAssignmentDetail.effectiveUntil)}`}
      </div>
    )}
  </div>
)}
```

Add `getVendorAssignment` to this file's existing `dataStore` import list. `formatZ` and `useEffect` are already imported/used in this file (confirmed by the existing confirmation-history code in the same component).

- [ ] **Step 3: Build**

Run: `npm run build:client`
Expected: clean.

- [ ] **Step 4: Manual verification**

Open a service that was auto-resolved during generation (from Task 7's verification) in the Service editor — confirm the "Why this vendor?" panel shows its selection source and (if it came from a specific `VendorAssignment` rule) the rank/preferred/validity detail.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/admin/AdminTrips.tsx src/client/lib/dataStore.ts
git commit -m "feat: add Why This Vendor panel to the Service editor"
```

---

## Final Verification

After all 8 tasks:
- [ ] Run the full server suite: `npm test` — expect all suites green, including the 5 new/extended server test files from Tasks 2, 3, 4, 5.
- [ ] `npm run build:server` and `npm run build:client` both clean.
- [ ] Confirm (by reading the diff, not just trusting task reports) that `vendor-resolver.service.ts` and its own spec file (sub-project 1) were never touched.
- [ ] Local dev server restarted, all 4 generation call sites manually spot-checked per Task 7 Step 6.
- [ ] Memory file `project_viq.md` updated: Vendor Assignment Engine sub-project 2 complete.
