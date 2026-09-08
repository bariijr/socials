# Automatic Change Impact Triggering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically flag an already-`Confirmed` service for re-confirmation when the leg/trip it depends on changes in a way that invalidates the permit already granted — an ETD/ETA shift beyond the destination country's tolerance, a route change, or a trip-level operator/registration change.

**Architecture:** Two new methods on the existing `ServicesService` (a per-service tolerance-aware schedule-change check, and a generic bulk "flag every Confirmed service matching this filter" helper), called from `LegsService.update()` (schedule + route triggers) and `TripsService.update()` (operator/registration trigger, requiring `TripsService` to gain a `ServicesService` dependency it doesn't have today). No schema change, no new status value — reuses the already-existing `'Confirmed' → 'Re-confirm Required'` transition edge and the already-existing, currently-unused `CountryRule.toleranceHours` field.

**Tech Stack:** NestJS 10 + Prisma 5.22 + PostgreSQL. Jest integration tests run against the real `jetflow_test` database — this project's established convention, never mocked Prisma.

**Spec:** [docs/superpowers/specs/2026-09-09-viq-change-impact-engine-design.md](../specs/2026-09-09-viq-change-impact-engine-design.md)

## Global Constraints

- Only services currently at `'Confirmed'` are ever flagged — a service at `'Requested'`/`'Chasing'`/etc. is left untouched by all three triggers.
- No `SERVICE_TRANSITIONS` change — `'Confirmed' → 'Re-confirm Required'` is already a legal edge.
- No new `Service`/`Trip` status value.
- ETD/ETA tolerance is looked up per-service by `(countryIso2, serviceType)` via `CountryRule`, defaulting to `0` hours (strictest) when no matching `CountryRule` row exists. A service with no `countryIso2` at all is skipped by the schedule-tolerance check (there's no country to look a tolerance up against) — this is different from "no `CountryRule` row for an existing country," which still defaults to `0` and flags.
- Route and trip-identity changes use no tolerance at all — any actual difference flags every `'Confirmed'` service in scope.
- Every auto-flag appends a human-readable reason to the service's `notes` field and writes a distinct audit entry (`field: 'AutoReconfirm'`) so it's visually distinguishable from a coordinator-driven transition in the audit trail.
- `TripsService`'s constructor signature changes from `(prisma, audit)` to `(prisma, audit, services)`. This breaks 4 existing test files that construct `new TripsService(prisma, audit)` directly — all 4 call sites must be updated in Task 2 (exact list below).

---

### Task 1: `ServicesService` — schedule-tolerance check and bulk reconfirmation flag

**Files:**
- Modify: `src/server/modules/services/services.service.ts`
- Create: `src/server/modules/services/change-impact-flagging.spec.ts`

**Interfaces:**
- Produces: `ServicesService.flagConfirmedServicesForScheduleChange(legId: string, oldTime: Date, newTime: Date, user?: string): Promise<Service[]>` and `ServicesService.flagConfirmedServices(where: Prisma.ServiceWhereInput, reason: string, user?: string): Promise<Service[]>` — both public, both consumed by Task 2's calls from `LegsService`/`TripsService`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/modules/services/change-impact-flagging.spec.ts`:
```ts
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Change impact: flagging Confirmed services for reconfirmation', () => {
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
    await prisma.trip.create({ data: { tripId: 'TEST-IMPACT-1', client: 'Test Client' } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
  });

  async function makeConfirmedService(overrides: { countryIso2?: string | null; serviceType?: string; scopeId?: string } = {}) {
    return prisma.service.create({
      data: {
        svcId: `TEST-IMPACT-1-SVC-${Math.random().toString(36).slice(2)}`,
        tripId: 'TEST-IMPACT-1',
        scopeType: 'SEGMENT',
        scopeId: overrides.scopeId ?? 'LEG-1',
        serviceType: overrides.serviceType ?? 'Overflight',
        status: 'Confirmed',
        countryIso2: overrides.countryIso2 === undefined ? 'KE' : overrides.countryIso2,
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'),
        requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
  }

  describe('flagConfirmedServicesForScheduleChange', () => {
    it('does not flag when the ETD change is within the country tolerance', async () => {
      await prisma.countryRule.create({
        data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 3 },
      });
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T08:00:00.000Z'); // 2h delta, within 3h tolerance
      await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });

    it('flags when the ETD change exceeds the country tolerance', async () => {
      await prisma.countryRule.create({
        data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 },
      });
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T09:00:00.000Z'); // 3h delta, exceeds 1h tolerance
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'tester');
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
      expect(after!.notes).toContain('Auto-flagged');
      expect(after!.notes).toContain('3.0h');
      expect(after!.statusChangedBy).toBe('tester');
    });

    it('defaults tolerance to 0 (flags on any change) when no CountryRule row exists', async () => {
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T06:15:00.000Z'); // 15min delta, no rule at all
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
    });

    it('skips a service with no countryIso2 at all', async () => {
      const svc = await makeConfirmedService({ countryIso2: null });
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-02T06:00:00.000Z'); // 24h delta
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });

    it('does not touch a service that is not Confirmed', async () => {
      const svc = await makeConfirmedService();
      await prisma.service.update({ where: { svcId: svc.svcId }, data: { status: 'Requested' } });
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-02T06:00:00.000Z');
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Requested');
    });

    it('does nothing when old and new time are identical', async () => {
      const svc = await makeConfirmedService();
      const same = new Date('2026-10-01T06:00:00.000Z');
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', same, same);
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });
  });

  describe('flagConfirmedServices (generic bulk flag)', () => {
    it('flags every Confirmed service matching the filter, leaving non-matching ones alone', async () => {
      const matching = await makeConfirmedService({ scopeId: 'LEG-1' });
      const other = await makeConfirmedService({ scopeId: 'LEG-2' });
      const flagged = await services.flagConfirmedServices({ scopeId: 'LEG-1' }, 'route changed', 'tester');
      expect(flagged).toHaveLength(1);
      const matchingAfter = await prisma.service.findUnique({ where: { svcId: matching.svcId } });
      const otherAfter = await prisma.service.findUnique({ where: { svcId: other.svcId } });
      expect(matchingAfter!.status).toBe('Re-confirm Required');
      expect(matchingAfter!.notes).toContain('Auto-flagged: route changed.');
      expect(otherAfter!.status).toBe('Confirmed');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- change-impact-flagging.spec.ts`
Expected: FAIL — `services.flagConfirmedServicesForScheduleChange is not a function`.

- [ ] **Step 3: Implement the two methods**

In `src/server/modules/services/services.service.ts`, add these two public methods and one private helper. Place them after the existing `leadTimeHours` private method (so `toleranceHours` sits alongside its sibling lookup):

```ts
  private async toleranceHours(iso2: string, serviceType: string): Promise<number> {
    const rule = await this.prisma.countryRule.findUnique({
      where: { countryIso2_serviceType: { countryIso2: iso2, serviceType } },
    });
    return rule?.toleranceHours ?? 0;
  }

  // Change Impact trigger: an ETD/ETA shift beyond a country's configured
  // tolerance invalidates an already-Confirmed service -- the permit was
  // granted against the old time. A service not yet Confirmed is left
  // alone (it hasn't locked anything in yet that needs invalidating), and
  // a service with no countryIso2 at all is skipped -- there's no country
  // to look a tolerance up against (different from "no CountryRule row for
  // an existing country", which still defaults to 0 and flags).
  async flagConfirmedServicesForScheduleChange(
    legId: string,
    oldTime: Date,
    newTime: Date,
    user = 'SYSTEM',
  ): Promise<Service[]> {
    const deltaHours = Math.abs(newTime.getTime() - oldTime.getTime()) / (1000 * 60 * 60);
    if (deltaHours === 0) return [];
    const confirmed = await this.prisma.service.findMany({ where: { scopeId: legId, status: 'Confirmed' } });
    const flagged: Service[] = [];
    for (const svc of confirmed) {
      if (!svc.countryIso2) continue;
      const tolerance = await this.toleranceHours(svc.countryIso2, svc.serviceType);
      if (deltaHours <= tolerance) continue;
      const updated = await this.prisma.service.update({
        where: { svcId: svc.svcId },
        data: {
          status: 'Re-confirm Required',
          statusChangedAt: new Date(),
          statusChangedBy: user,
          notes: `${svc.notes} Auto-flagged: ETD moved ${deltaHours.toFixed(1)}h (exceeds ${tolerance}h tolerance for ${svc.countryIso2} ${svc.serviceType}).`.trim(),
        },
      });
      await this.audit.log(user, 'Service', svc.svcId, 'AutoReconfirm', 'Confirmed', 'Re-confirm Required');
      flagged.push(updated);
    }
    return flagged;
  }

  // Generic bulk flag for the no-tolerance Change Impact triggers (route
  // change, trip-identity change) -- every Confirmed service matching
  // `where` is flagged with the same human-readable reason. The caller
  // builds the reason string since it's the one that knows what actually
  // changed (a leg's route vs a trip's operator/registration).
  async flagConfirmedServices(where: Prisma.ServiceWhereInput, reason: string, user = 'SYSTEM'): Promise<Service[]> {
    const confirmed = await this.prisma.service.findMany({ where: { ...where, status: 'Confirmed' } });
    const flagged: Service[] = [];
    for (const svc of confirmed) {
      const updated = await this.prisma.service.update({
        where: { svcId: svc.svcId },
        data: {
          status: 'Re-confirm Required',
          statusChangedAt: new Date(),
          statusChangedBy: user,
          notes: `${svc.notes} Auto-flagged: ${reason}.`.trim(),
        },
      });
      await this.audit.log(user, 'Service', svc.svcId, 'AutoReconfirm', 'Confirmed', 'Re-confirm Required');
      flagged.push(updated);
    }
    return flagged;
  }
```

`Prisma.ServiceWhereInput` requires `Prisma` to be imported as a type — check the top of `services.service.ts`; it should already have `import type { Service, Prisma } from '@prisma/client';` from earlier work in this file. If it doesn't, add `Prisma` to that existing type import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- change-impact-flagging.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full server test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/services/services.service.ts src/server/modules/services/change-impact-flagging.spec.ts
git commit -m "feat: add Confirmed-service reconfirmation flagging to ServicesService"
```

---

### Task 2: Wire the three triggers into `LegsService.update()` and `TripsService.update()`

**Files:**
- Modify: `src/server/modules/legs/legs.service.ts`
- Modify: `src/server/modules/trips/trips.service.ts`
- Modify: `src/server/modules/trips/trips.module.ts`
- Modify (constructor call sites only, mechanical): `src/server/modules/legs/leg-optimistic-locking.spec.ts`, `src/server/modules/legs/stop-generation.spec.ts`, `src/server/modules/services/service-regeneration.spec.ts`, `src/server/modules/trips/trip-status-locking.spec.ts`
- Test: `src/server/modules/legs/change-impact-triggers.spec.ts` (new), `src/server/modules/trips/change-impact-triggers.spec.ts` (new)

**Interfaces:**
- Consumes: Task 1's `ServicesService.flagConfirmedServicesForScheduleChange` and `ServicesService.flagConfirmedServices`.
- Produces: no new public methods — this task wires existing `update()` methods to call Task 1's methods automatically. `TripsService`'s constructor becomes `(prisma: PrismaService, audit: AuditService, services: ServicesService)`.

Read the current full text of `LegsService.update()` and `TripsService.update()` before editing — both are shown in the spec's "Where this hooks in" section, but line numbers may have shifted from other work. Match against the actual current file content.

- [ ] **Step 1: Update `TripsModule` to import `ServicesModule`**

In `src/server/modules/trips/trips.module.ts`, add the import (mirroring `LegsModule`'s existing identical pattern):

```ts
import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [ServicesModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
```

- [ ] **Step 2: Add `ServicesService` to `TripsService`'s constructor**

In `src/server/modules/trips/trips.service.ts`, add the import and constructor parameter:

```ts
import { ServicesService } from '../services/services.service';
```

```ts
@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
  ) {}
```

- [ ] **Step 3: Update all 4 existing test files' `TripsService` construction to pass the new argument**

`src/server/modules/legs/leg-optimistic-locking.spec.ts` (line ~28) — a `services` variable already exists in scope from line ~25:
```ts
trips = new TripsService(prisma, audit, services);
```

`src/server/modules/legs/stop-generation.spec.ts` (line ~31) — a `services` variable already exists in scope from line ~28:
```ts
trips = new TripsService(prisma, audit, services);
```

`src/server/modules/services/service-regeneration.spec.ts` (line ~31) — a `services` variable already exists in scope from line ~28:
```ts
trips = new TripsService(prisma, audit, services);
```

`src/server/modules/trips/trip-status-locking.spec.ts` — this file has **3 separate call sites** (around lines 48, 100, 160), one per `describe` block's own `beforeEach`, and does NOT currently import or construct `ServicesService` at all. Add the import at the top of the file:
```ts
import { ServicesService } from '../services/services.service';
```
Then at each of the 3 `beforeEach` blocks that construct `TripsService`, add a `ServicesService` construction immediately before it and pass it as the 3rd argument:
```ts
const services = new ServicesService(prisma, audit);
trips = new TripsService(prisma, audit, services);
```
(The `audit` variable already exists in scope at each of these 3 sites — check the surrounding lines to confirm its exact variable name before editing, it should already be `audit` matching every other file's convention in this codebase.)

- [ ] **Step 4: Write the failing tests for the leg-scoped triggers**

Create `src/server/modules/legs/change-impact-triggers.spec.ts`:
```ts
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { LegsService } from './legs.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Change impact: leg-scoped triggers (schedule + route)', () => {
  let prisma: PrismaService;
  let legs: LegsService;
  let trips: TripsService;
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
    const stops = new StopsService(prisma, audit);
    legs = new LegsService(prisma, audit, services, stops);
    trips = new TripsService(prisma, audit, services);
    await trips.create({ tripId: 'TEST-CI-1', client: 'Test Client' });
    await prisma.country.createMany({
      data: [
        { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
        { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -6.4, centroidLng: 34.9 },
      ],
    });
  });

  it('flags a Confirmed Overflight service when ETD moves beyond the country tolerance', async () => {
    await prisma.countryRule.create({ data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 } });
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-1', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-1-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { etdZ: '2026-10-01T09:00:00.000Z', version: leg.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-1-OVF-KE' } });
    expect(svc!.status).toBe('Re-confirm Required');
  });

  it('does not flag when ETD moves within tolerance', async () => {
    await prisma.countryRule.create({ data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 6 } });
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-2', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-2-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { etdZ: '2026-10-01T08:00:00.000Z', version: leg.version }); // 2h, within 6h tolerance

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-2-OVF-KE' } });
    expect(svc!.status).toBe('Confirmed');
  });

  it('flags every Confirmed service on the leg when the arrival airport changes, regardless of tolerance', async () => {
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-3', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-3-PMT-FALA', tripId: 'TEST-CI-1', scopeType: 'LEG', scopeId: leg.legId,
        serviceType: 'Permit', status: 'Confirmed', countryIso2: 'TZ', icao: 'FALA',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { arrIcao: 'HKJK', version: leg.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-3-PMT-FALA' } });
    expect(svc!.status).toBe('Re-confirm Required');
    expect(svc!.notes).toContain('route changed');
  });

  it('does not flag a service that is not Confirmed when the leg changes', async () => {
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-4', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-4-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Requested', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { arrIcao: 'HKJK', version: leg.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-4-OVF-KE' } });
    expect(svc!.status).toBe('Requested');
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- legs/change-impact-triggers.spec.ts`
Expected: FAIL — the first two tests fail because `legs.update()` doesn't yet call the schedule-change trigger; the third fails because it doesn't yet call the route-change trigger. The fourth passes already (nothing changes anything for a non-Confirmed service), which is fine — it's there as a regression guard for the code you're about to add, not something that needs to go red first.

- [ ] **Step 6: Implement the leg-scoped triggers in `LegsService.update()`**

In `src/server/modules/legs/legs.service.ts`, the current tail of `update()` reads exactly:

```ts
    if (reconcileOverflight) {
      await this.services.reconcileOverflightServices(legId, user);
    }

    if (generateServices) {
      await this.services.generateOverflightServices(legId, user);
      await this.services.generateArrivalServices(legId, { departureGroundHandling }, user);
    }

    return leg;
  }
```

Insert the Change Impact triggers AFTER the `generateServices` block and BEFORE `return leg;`, so the full tail becomes:

```ts
    if (reconcileOverflight) {
      await this.services.reconcileOverflightServices(legId, user);
    }

    if (generateServices) {
      await this.services.generateOverflightServices(legId, user);
      await this.services.generateArrivalServices(legId, { departureGroundHandling }, user);
    }

    // Change Impact triggers -- only ever touch services already Confirmed
    // (see ServicesService.flagConfirmedServicesForScheduleChange /
    // flagConfirmedServices for why). Schedule changes use a per-service
    // country tolerance; a route change uses none.
    if (dto.etdZ !== undefined && before.etdZ.getTime() !== leg.etdZ.getTime()) {
      await this.services.flagConfirmedServicesForScheduleChange(legId, before.etdZ, leg.etdZ, user);
    }
    if (dto.etaZ !== undefined && before.etaZ.getTime() !== leg.etaZ.getTime()) {
      await this.services.flagConfirmedServicesForScheduleChange(legId, before.etaZ, leg.etaZ, user);
    }
    const icaoChanged = (dto.depIcao !== undefined && before.depIcao !== leg.depIcao)
      || (dto.arrIcao !== undefined && before.arrIcao !== leg.arrIcao);
    const routeChanged = icaoChanged
      || (reconcileOverflight && JSON.stringify(before.countriesOverflown) !== JSON.stringify(leg.countriesOverflown));
    if (routeChanged) {
      const reason = icaoChanged
        ? `route changed ${before.depIcao} → ${leg.depIcao}, ${before.arrIcao} → ${leg.arrIcao}`
        : 'overflown countries changed';
      await this.services.flagConfirmedServices({ scopeId: legId }, reason, user);
    }

    return leg;
  }
```

Verify this matches the actual current file content before editing — line numbers may have shifted from other work, but the exact code shown above (the pre-existing `if (reconcileOverflight)` / `if (generateServices)` / `return leg;` sequence) should match verbatim; if it doesn't, stop and report rather than guessing where to insert.

- [ ] **Step 7: Run the leg-trigger tests to verify they pass**

Run: `npm test -- legs/change-impact-triggers.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Write the failing test for the trip-scoped trigger**

Create `src/server/modules/trips/change-impact-triggers.spec.ts`:
```ts
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { TripsService } from './trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Change impact: trip-scoped trigger (operator/registration)', () => {
  let prisma: PrismaService;
  let trips: TripsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    const services = new ServicesService(prisma, audit);
    trips = new TripsService(prisma, audit, services);
  });

  it('flags every Confirmed service across every leg when the trip operator changes', async () => {
    const trip = await trips.create({ tripId: 'TEST-CI-TRIP-1', client: 'Test Client', operator: 'OP-1' });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-TRIP-1-SVC-1', tripId: 'TEST-CI-TRIP-1', scopeType: 'SEGMENT', scopeId: 'LEG-A',
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-TRIP-1-SVC-2', tripId: 'TEST-CI-TRIP-1', scopeType: 'SEGMENT', scopeId: 'LEG-B',
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'TZ',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await trips.update(trip.tripId, { operator: 'OP-2', version: trip.version });

    const svc1 = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-TRIP-1-SVC-1' } });
    const svc2 = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-TRIP-1-SVC-2' } });
    expect(svc1!.status).toBe('Re-confirm Required');
    expect(svc2!.status).toBe('Re-confirm Required');
    expect(svc1!.notes).toContain('operator changed');
  });

  it('does not flag anything when an unrelated field changes', async () => {
    const trip = await trips.create({ tripId: 'TEST-CI-TRIP-2', client: 'Test Client', operator: 'OP-1' });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-TRIP-2-SVC-1', tripId: 'TEST-CI-TRIP-2', scopeType: 'SEGMENT', scopeId: 'LEG-A',
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await trips.update(trip.tripId, { notes: 'unrelated note change', version: trip.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-TRIP-2-SVC-1' } });
    expect(svc!.status).toBe('Confirmed');
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npm test -- trips/change-impact-triggers.spec.ts`
Expected: FAIL — `trips.update()` doesn't yet trigger reconfirmation on an operator change.

- [ ] **Step 10: Implement the trip-scoped trigger in `TripsService.update()`**

In `src/server/modules/trips/trips.service.ts`, the current tail of `update()` (after the `if (result.count === 0) { ... }` conflict-check block) reads exactly:

```ts
    const trip = await this.prisma.trip.findUnique({ where: { tripId } });
    await this.audit.logDiff(user, 'Trip', tripId, before as unknown as Record<string, unknown>, trip as unknown as Record<string, unknown>);
    return withTripTransitions(trip!, role);
  }
```

Insert the Change Impact trigger between the `audit.logDiff` call and `return`, using the already-available `before` and `data` objects (no need for another re-fetch — `data.operator`/`data.registration` already reflect what was just written):

```ts
    const trip = await this.prisma.trip.findUnique({ where: { tripId } });
    await this.audit.logDiff(user, 'Trip', tripId, before as unknown as Record<string, unknown>, trip as unknown as Record<string, unknown>);

    const operatorChanged = data.operator !== undefined && data.operator !== before.operator;
    const registrationChanged = data.registration !== undefined && data.registration !== before.registration;
    if (operatorChanged || registrationChanged) {
      const changes: string[] = [];
      if (operatorChanged) changes.push(`operator changed from ${before.operator ?? 'unset'} to ${data.operator}`);
      if (registrationChanged) changes.push(`registration changed from ${before.registration ?? 'unset'} to ${data.registration}`);
      await this.services.flagConfirmedServices({ tripId }, changes.join('; '), user);
    }

    return withTripTransitions(trip!, role);
  }
```

Verify this matches the actual current file content before editing; if it doesn't, stop and report rather than guessing where to insert.

- [ ] **Step 11: Run the trip-trigger tests to verify they pass**

Run: `npm test -- trips/change-impact-triggers.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 12: Run the full server test suite**

Run: `npm test`
Expected: PASS, no regressions — this confirms all 4 constructor call-site updates from Step 3 were done correctly (a missed one would fail with "Expected 3 arguments, but got 2" at compile time, caught here).

- [ ] **Step 13: Commit**

```bash
git add src/server/modules/legs/legs.service.ts src/server/modules/trips/trips.service.ts src/server/modules/trips/trips.module.ts src/server/modules/legs/leg-optimistic-locking.spec.ts src/server/modules/legs/stop-generation.spec.ts src/server/modules/services/service-regeneration.spec.ts src/server/modules/trips/trip-status-locking.spec.ts src/server/modules/legs/change-impact-triggers.spec.ts src/server/modules/trips/change-impact-triggers.spec.ts
git commit -m "feat: auto-flag Confirmed services for reconfirmation on leg schedule/route or trip identity change"
```

---

## Final Verification

- [ ] Run `npm test` — full server suite passes, no regressions.
- [ ] Run `npm run build:client` — no TypeScript errors (this phase makes no client-facing API shape changes, but confirm nothing else broke).
- [ ] Restart the local preview (`npm run start:dev` if not already running, then `npm run build:client`) and confirm `http://localhost:4001` serves the app; manually edit a leg's ETD on a trip with a Confirmed permit service by more than that country's configured tolerance (or with no `CountryRule` at all) and confirm the service flips to `Re-confirm Required` with an explanatory note, then confirm it shows up in `PermitRevisionGroups`.
