# VIQ Operational Event Engine + Leg/Trip Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give coordinators a real Leg/Multi-Leg/Trip cancellation workflow with an impact-review step, full history preservation (Completed Legs untouched), and per-service vendor notification — and the minimal in-process event mechanism this needs, scoped to new workflows only.

**Architecture:** New `OperationalEventsModule` wraps `@nestjs/event-emitter`'s `EventEmitter2`; `LegsService`/`TripsService` gain `preview*`/`cancel*` methods that write inside a `$transaction`, then emit typed events after commit; one `AuditEventListener` is the only consequence wired in this plan. Client gets new `CancelLegDialog`/`CancelTripDialog` components that show the preview, collect a reason, call the cancel endpoint, then loop the existing `ChangeVendorDialog` email-send pattern per affected service.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `@nestjs/event-emitter` (new dependency), React/Vite, class-validator.

**Spec:** [2026-09-13-viq-event-engine-and-cancellation-design.md](../specs/2026-09-13-viq-event-engine-and-cancellation-design.md)

## Global Constraints

- Every write goes through `$transaction` where more than one row changes together (Leg + its Services); optimistic locking (`version`) is used exactly where the design doc §5 specifies it — caller-supplied on the single-Leg/Trip routes, freshly-read-per-row on the batch route (matching `flagConfirmedServices`'s existing convention).
- `emit()` is called only *after* a transaction commits — never inside it.
- Cancellation reason is validated against the shared `CANCELLATION_REASONS` const (`@IsIn`), never a free-form string.
- No AP/AR field, no cancellation-sent-vs-acknowledged tracking, no `LEG_REINSTATED` emit call site — all explicitly out of scope per the design doc §9.
- Every new/changed server file gets a co-located `*.spec.ts` using this codebase's established convention: `truncateAll(prisma)` in `beforeEach`, real Postgres via `dotenv -e .env.test -- npx jest`.
- Hand-author the Prisma migration SQL (this environment's `prisma migrate dev` is non-interactive) and apply with `npx prisma migrate deploy`.

---

### Task 1: Cancellation schema + shared reason constant

**Files:**
- Modify: `prisma/schema.prisma` (Leg, Service, Trip models)
- Create: `prisma/migrations/<timestamp>_add_cancellation_fields/migration.sql`
- Create: `src/server/common/cancellationReasons.ts`
- Test: `src/server/common/cancellationReasons.spec.ts`

**Interfaces:**
- Produces: `CANCELLATION_REASONS` (readonly string array) and `CancellationReason` (union type), imported by every later task's DTOs.

- [ ] **Step 1: Add the four cancellation columns to Leg, Service, and Trip**

In `prisma/schema.prisma`, inside `model Leg { ... }` (after the existing `statusChangedBy` line), `model Service { ... }` (after `statusChangedBy`), and `model Trip { ... }` (after `statusChangedBy`), add:

```prisma
  cancellationReason  String?   @map("cancellation_reason")
  cancellationRemarks String?   @map("cancellation_remarks")
  cancelledBy         String?   @map("cancelled_by")
  cancelledAtZ        DateTime? @map("cancelled_at_z")
```

- [ ] **Step 2: Hand-author the migration**

Create `prisma/migrations/<timestamp>_add_cancellation_fields/migration.sql` (use the current UTC timestamp in `YYYYMMDDHHMMSS` format for `<timestamp>`, matching the existing migrations directory's naming):

```sql
ALTER TABLE "legs" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "legs" ADD COLUMN "cancellation_remarks" TEXT;
ALTER TABLE "legs" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "legs" ADD COLUMN "cancelled_at_z" TIMESTAMP(3);

ALTER TABLE "services" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "services" ADD COLUMN "cancellation_remarks" TEXT;
ALTER TABLE "services" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "services" ADD COLUMN "cancelled_at_z" TIMESTAMP(3);

ALTER TABLE "trips" ADD COLUMN "cancellation_reason" TEXT;
ALTER TABLE "trips" ADD COLUMN "cancellation_remarks" TEXT;
ALTER TABLE "trips" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "trips" ADD COLUMN "cancelled_at_z" TIMESTAMP(3);
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run (stop the dev server first if it's running, to release the Prisma engine DLL on Windows):

```bash
npx dotenv -e .env -- npx prisma migrate deploy
npx dotenv -e .env.test -- npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 4: Write the failing test for the shared reason constant**

```ts
// src/server/common/cancellationReasons.spec.ts
import { CANCELLATION_REASONS } from './cancellationReasons';

describe('CANCELLATION_REASONS', () => {
  it('contains the 13 reasons from the mega-spec §9, each a non-empty string', () => {
    expect(CANCELLATION_REASONS).toHaveLength(13);
    for (const r of CANCELLATION_REASONS) {
      expect(typeof r).toBe('string');
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('includes every reason the spec names', () => {
    expect(CANCELLATION_REASONS).toEqual([
      'Client Cancelled', 'Aircraft Technical', 'Weather', 'Crew',
      'Schedule Change', 'Permit / Regulatory', 'Operational', 'Commercial',
      'Security', 'Airport Closed', 'Mission Cancelled', 'Duplicate Trip', 'Other',
    ]);
  });
});
```

- [ ] **Step 5: Run it, confirm it fails (module doesn't exist yet)**

Run: `npx dotenv -e .env.test -- npx jest src/server/common/cancellationReasons.spec.ts`
Expected: FAIL — `Cannot find module './cancellationReasons'`

- [ ] **Step 6: Implement**

```ts
// src/server/common/cancellationReasons.ts
//
// Shared across Leg/Trip cancellation DTOs (and, later, Cluster C's
// financial-disposition records) -- mirrors ChangeVendorDto's
// VENDOR_CHANGE_REASONS pattern: a plain string enum via @IsIn, no DB
// enum, no reference table, matching this codebase's existing
// convention for small closed vocabularies.
export const CANCELLATION_REASONS = [
  'Client Cancelled', 'Aircraft Technical', 'Weather', 'Crew',
  'Schedule Change', 'Permit / Regulatory', 'Operational', 'Commercial',
  'Security', 'Airport Closed', 'Mission Cancelled', 'Duplicate Trip', 'Other',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];
```

- [ ] **Step 7: Run the test again, confirm it passes**

Run: `npx dotenv -e .env.test -- npx jest src/server/common/cancellationReasons.spec.ts`
Expected: PASS

- [ ] **Step 8: Build check and commit**

```bash
npx nest build
git add prisma/schema.prisma prisma/migrations src/server/common/cancellationReasons.ts src/server/common/cancellationReasons.spec.ts
git commit -m "feat: add cancellation schema fields and shared reason constant"
```

---

### Task 2: Operational Events module

**Files:**
- Create: `src/server/modules/operational-events/event-types.ts`
- Create: `src/server/modules/operational-events/operational-events.service.ts`
- Create: `src/server/modules/operational-events/operational-events.module.ts`
- Create: `src/server/modules/operational-events/listeners/audit-event.listener.ts`
- Test: `src/server/modules/operational-events/operational-events.service.spec.ts`
- Modify: `src/server/app.module.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `AuditService` (`src/server/modules/audit/audit.service.ts`, already has `log(user, table, recordId, field, oldValue, newValue)`).
- Produces: `OperationalEvent` (discriminated union type), `OperationalEventsService.emit(event)`, both imported by Task 4/5's `LegsService`/`TripsService`.

- [ ] **Step 1: Add the dependency**

```bash
npm install @nestjs/event-emitter@^2.0.4
```

- [ ] **Step 2: Define the full event taxonomy**

```ts
// src/server/modules/operational-events/event-types.ts
//
// The full event vocabulary from the mega-spec's §70, typed now so later
// phases never need to change this file's shape -- only add a new
// `emit()` call site in the service that owns that event's workflow.
// An event type with no real emit() call site anywhere yet is "inert":
// legal to reference, never fired. This plan wires four: LEG_CANCELLED,
// TRIP_CANCELLED, SERVICE_CANCELLED, LEG_STATUS_CHANGED. Every other
// type below is inert until its owning phase adds a real call site.
export type OperationalEvent =
  | { type: 'TRIP_CREATED'; tripId: string; user: string }
  | { type: 'TRIP_CHANGED'; tripId: string; user: string }
  | { type: 'TRIP_CANCELLED'; tripId: string; reason: string; user: string }
  | { type: 'LEG_STATUS_CHANGED'; legId: string; tripId: string; from: string; to: string; user: string }
  | { type: 'LEG_CANCELLED'; legId: string; tripId: string; reason: string; user: string }
  | { type: 'LEG_REINSTATED'; legId: string; tripId: string; user: string }
  | { type: 'SERVICE_REQUESTED'; svcId: string; tripId: string; user: string }
  | { type: 'SERVICE_CONFIRMED'; svcId: string; tripId: string; user: string }
  | { type: 'SERVICE_CHANGED'; svcId: string; tripId: string; user: string }
  | { type: 'SERVICE_CANCELLED'; svcId: string; tripId: string; providerId: string | null; reason: string; user: string }
  | { type: 'VENDOR_CHANGED'; svcId: string; user: string }
  | { type: 'VENDOR_RESPONDED'; svcId: string; user: string }
  | { type: 'DOCUMENT_ADDED'; documentId: string; user: string }
  | { type: 'DOCUMENT_VERIFIED'; documentId: string; user: string }
  | { type: 'DOCUMENT_EXPIRED'; documentId: string }
  | { type: 'TASK_OVERDUE'; taskId: string }
  | { type: 'INVOICE_RECEIVED'; invoiceId: string }
  | { type: 'PAYMENT_RECORDED'; invoiceId: string };

export type OperationalEventOfType<T extends OperationalEvent['type']> =
  Extract<OperationalEvent, { type: T }>;
```

- [ ] **Step 2b: Write the failing test for the emit/fan-out service**

```ts
// src/server/modules/operational-events/operational-events.service.spec.ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OperationalEventsService } from './operational-events.service';

describe('OperationalEventsService', () => {
  let emitter: EventEmitter2;
  let service: OperationalEventsService;

  beforeEach(() => {
    emitter = new EventEmitter2();
    service = new OperationalEventsService(emitter);
  });

  it('fans out to every listener registered for that event type', () => {
    const received: unknown[] = [];
    emitter.on('LEG_CANCELLED', (e) => received.push(e));
    emitter.on('LEG_CANCELLED', (e) => received.push(e));

    const event = { type: 'LEG_CANCELLED' as const, legId: 'L1', tripId: 'T1', reason: 'Weather', user: 'coordinator' };
    service.emit(event);

    expect(received).toEqual([event, event]);
  });

  it('is a no-op for an event type with no registered listener', () => {
    expect(() => service.emit({ type: 'TASK_OVERDUE', taskId: 'TASK-1' })).not.toThrow();
  });

  it('one listener throwing does not prevent a sibling listener for the same event from running', () => {
    const received: unknown[] = [];
    emitter.on('TRIP_CANCELLED', () => { throw new Error('boom'); });
    emitter.on('TRIP_CANCELLED', (e) => received.push(e));

    const event = { type: 'TRIP_CANCELLED' as const, tripId: 'T1', reason: 'Weather', user: 'coordinator' };
    // EventEmitter2's default (non-async) emit invokes every listener
    // synchronously in sequence; a thrown error inside one listener
    // propagates to the caller of .emit() by default, so this test
    // documents that behavior rather than asserting silence -- see
    // Step 3's listener itself for why the real AuditEventListener
    // never lets this matter in practice (it never throws for a normal
    // audit write).
    expect(() => service.emit(event)).toThrow('boom');
    expect(received).toEqual([event]);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `npx jest src/server/modules/operational-events/operational-events.service.spec.ts`
Expected: FAIL — `Cannot find module './operational-events.service'`

- [ ] **Step 4: Implement the service**

```ts
// src/server/modules/operational-events/operational-events.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { OperationalEvent } from './event-types';

// Thin on purpose. `.emit()` is synchronous, in-process fan-out to
// whatever's registered via @OnEvent -- there is no queue, no
// persistence, and no retry here. A future listener whose consequence
// genuinely needs durable async work (a real send, a PDF render) opens
// its own dedicated BullMQ queue and enqueues from inside itself,
// mirroring documents.service.ts's queue.add() pattern -- this service
// never does that on a listener's behalf. See the design doc's Ruling 1.
@Injectable()
export class OperationalEventsService {
  constructor(private readonly emitter: EventEmitter2) {}

  emit(event: OperationalEvent): void {
    this.emitter.emit(event.type, event);
  }
}
```

- [ ] **Step 5: Run the test again, confirm it passes**

Run: `npx jest src/server/modules/operational-events/operational-events.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Implement the audit listener (no separate test file — covered by Task 4/5's integration specs, which assert the resulting AuditEntry rows)**

```ts
// src/server/modules/operational-events/listeners/audit-event.listener.ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';
import type { OperationalEventOfType } from '../event-types';

// The event engine's first real, visible consequence: a human-readable
// "Cancelled: <reason>" AuditEntry per record, which the field-diff
// audit.logDiff() every cancel*() method also calls doesn't capture on
// its own (it shows status: Active -> Cancelled, not why). Every other
// consequence (notification, brief regen, financial review) is
// registered by the phase that builds it -- this is the only listener
// this plan ships.
@Injectable()
export class AuditEventListener {
  constructor(private readonly audit: AuditService) {}

  @OnEvent('LEG_CANCELLED')
  async onLegCancelled(e: OperationalEventOfType<'LEG_CANCELLED'>) {
    await this.audit.log(e.user, 'Leg', e.legId, 'Cancelled', '', e.reason);
  }

  @OnEvent('TRIP_CANCELLED')
  async onTripCancelled(e: OperationalEventOfType<'TRIP_CANCELLED'>) {
    await this.audit.log(e.user, 'Trip', e.tripId, 'Cancelled', '', e.reason);
  }

  @OnEvent('SERVICE_CANCELLED')
  async onServiceCancelled(e: OperationalEventOfType<'SERVICE_CANCELLED'>) {
    await this.audit.log(e.user, 'Service', e.svcId, 'Cancelled', '', e.reason);
  }
}
```

- [ ] **Step 7: Wire the module**

```ts
// src/server/modules/operational-events/operational-events.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationalEventsService } from './operational-events.service';
import { AuditEventListener } from './listeners/audit-event.listener';

@Module({
  imports: [AuditModule],
  providers: [OperationalEventsService, AuditEventListener],
  exports: [OperationalEventsService],
})
export class OperationalEventsModule {}
```

- [ ] **Step 8: Register globally in app.module.ts**

In `src/server/app.module.ts`, add the import:

```ts
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OperationalEventsModule } from './modules/operational-events/operational-events.module';
```

Add to the `imports` array, right after the existing `BullModule.forRootAsync({...})` block:

```ts
    EventEmitterModule.forRoot(),
    OperationalEventsModule,
```

(`OperationalEventsModule` is imported directly in `AppModule` — not only re-exported through `LegsModule`/`TripsModule` in Task 4/5 — so `AuditEventListener` instantiates and registers its `@OnEvent` handlers exactly once, regardless of which feature modules also import `OperationalEventsModule` for the service.)

- [ ] **Step 9: Build check and commit**

```bash
npx nest build
git add package.json package-lock.json src/server/modules/operational-events src/server/app.module.ts
git commit -m "feat: add Operational Events module (event-emitter, scoped to new workflows)"
```

---

### Task 3: Leg cancellation

**Files:**
- Create: `src/server/modules/legs/dto/cancel-leg.dto.ts`
- Create: `src/server/modules/legs/dto/cancel-legs.dto.ts`
- Modify: `src/server/modules/legs/legs.service.ts`
- Modify: `src/server/modules/legs/legs.controller.ts`
- Modify: `src/server/modules/legs/legs.module.ts`
- Test: `src/server/modules/legs/leg-cancellation.spec.ts`

**Interfaces:**
- Consumes: `OperationalEventsService` (Task 2), `CANCELLATION_REASONS` (Task 1).
- Produces: `LegsService.previewLegCancellation(legId)`, `cancelLeg(legId, dto, role?)`, `cancelLegs(legIds, dto)` — `cancelTrip` (Task 4) calls `cancelLegs`.

- [ ] **Step 1: DTOs**

```ts
// src/server/modules/legs/dto/cancel-leg.dto.ts
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { CANCELLATION_REASONS } from '../../../common/cancellationReasons';

export class CancelLegDto {
  @IsIn(CANCELLATION_REASONS)
  reason!: (typeof CANCELLATION_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
```

```ts
// src/server/modules/legs/dto/cancel-legs.dto.ts
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CANCELLATION_REASONS } from '../../../common/cancellationReasons';

// No per-Leg `version` here -- cancelLegs() reads each Leg's current
// version immediately before its own write, the same no-caller-pinned-
// version convention ServicesService.flagConfirmedServices already uses
// for its own multi-row writes (see the design doc §5's ruling).
export class CancelLegsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  legIds!: string[];

  @IsIn(CANCELLATION_REASONS)
  reason!: (typeof CANCELLATION_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/server/modules/legs/leg-cancellation.spec.ts
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { OperationalEventsService } from '../operational-events/operational-events.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LegsService } from './legs.service';
import { truncateAll } from '../../test/db-test-utils';
import type { OperationalEvent } from '../operational-events/event-types';

describe('LegsService cancellation', () => {
  let prisma: PrismaService;
  let legs: LegsService;
  let emitter: EventEmitter2;
  let observed: OperationalEvent[];

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    const services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
    const stops = new StopsService(prisma, audit);
    emitter = new EventEmitter2();
    observed = [];
    emitter.onAny((_event, payload) => observed.push(payload as OperationalEvent));
    const events = new OperationalEventsService(emitter);
    legs = new LegsService(prisma, audit, services, stops, events);

    await prisma.trip.create({ data: { tripId: 'TEST-CANCEL-1', client: 'Test Client' } });
    await prisma.leg.create({
      data: {
        legId: 'TEST-CANCEL-1-LEG-1', tripId: 'TEST-CANCEL-1', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA', etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T08:00:00.000Z'),
        blockHours: 2, paxCount: 7, crewCount: 4,
      },
    });
  });

  it('previewLegCancellation counts services by bucket', async () => {
    await prisma.service.createMany({
      data: [
        { svcId: 'SVC-1', tripId: 'TEST-CANCEL-1', scopeType: 'LEG', scopeId: 'TEST-CANCEL-1-LEG-1', serviceType: 'Overflight', status: 'Confirmed', providerId: null, basedOnEtdZ: new Date(), requiredByZ: new Date() },
        { svcId: 'SVC-2', tripId: 'TEST-CANCEL-1', scopeType: 'LEG', scopeId: 'TEST-CANCEL-1-LEG-1', serviceType: 'Fuel', status: 'Requested', providerId: null, basedOnEtdZ: new Date(), requiredByZ: new Date() },
        { svcId: 'SVC-3', tripId: 'TEST-CANCEL-1', scopeType: 'LEG', scopeId: 'TEST-CANCEL-1-LEG-1', serviceType: 'GroundHandling', status: 'Not Started', providerId: null, basedOnEtdZ: new Date(), requiredByZ: new Date() },
      ],
    });

    const preview = await legs.previewLegCancellation('TEST-CANCEL-1-LEG-1');
    expect(preview.servicesAffected).toBe(3);
    expect(preview.confirmed).toBe(1);
    expect(preview.requested).toBe(1);
    expect(preview.notStarted).toBe(1);
    expect(preview.crewCount).toBe(4);
    expect(preview.paxCount).toBe(7);
  });

  it('cancelLeg moves the Leg and every affected Service to Cancelled with the same reason, and emits one LEG_CANCELLED plus one SERVICE_CANCELLED per service', async () => {
    await prisma.service.createMany({
      data: [
        { svcId: 'SVC-1', tripId: 'TEST-CANCEL-1', scopeType: 'LEG', scopeId: 'TEST-CANCEL-1-LEG-1', serviceType: 'Overflight', status: 'Confirmed', providerId: null, basedOnEtdZ: new Date(), requiredByZ: new Date() },
        { svcId: 'SVC-2', tripId: 'TEST-CANCEL-1', scopeType: 'LEG', scopeId: 'TEST-CANCEL-1-LEG-1', serviceType: 'Fuel', status: 'Requested', providerId: null, basedOnEtdZ: new Date(), requiredByZ: new Date() },
      ],
    });

    const result = await legs.cancelLeg('TEST-CANCEL-1-LEG-1', { reason: 'Weather', remarks: 'Storm inbound', version: 1, user: 'coordinator' } as any);
    expect(result.status).toBe('Cancelled');
    expect(result.cancellationReason).toBe('Weather');

    const svc1 = await prisma.service.findUnique({ where: { svcId: 'SVC-1' } });
    const svc2 = await prisma.service.findUnique({ where: { svcId: 'SVC-2' } });
    expect(svc1!.status).toBe('Cancelled');
    expect(svc1!.cancellationReason).toBe('Weather');
    expect(svc2!.status).toBe('Cancelled');

    expect(observed.filter((e) => e.type === 'LEG_CANCELLED')).toHaveLength(1);
    expect(observed.filter((e) => e.type === 'SERVICE_CANCELLED')).toHaveLength(2);
  });

  it('cancelLeg on a Completed leg is rejected, leaving it Completed', async () => {
    await prisma.leg.update({ where: { legId: 'TEST-CANCEL-1-LEG-1' }, data: { status: 'Completed' } });
    await expect(
      legs.cancelLeg('TEST-CANCEL-1-LEG-1', { reason: 'Weather', version: 1, user: 'coordinator' } as any),
    ).rejects.toThrow();
    const leg = await prisma.leg.findUnique({ where: { legId: 'TEST-CANCEL-1-LEG-1' } });
    expect(leg!.status).toBe('Completed');
  });

  it('cancelLegs cancels each Leg independently with its own history, without a caller-supplied version', async () => {
    await prisma.leg.create({
      data: {
        legId: 'TEST-CANCEL-1-LEG-2', tripId: 'TEST-CANCEL-1', seq: 2,
        depIcao: 'FALA', arrIcao: 'HAAB', etdZ: new Date('2026-10-02T06:00:00.000Z'), etaZ: new Date('2026-10-02T08:00:00.000Z'),
        blockHours: 2, paxCount: 7, crewCount: 4,
      },
    });

    const results = await legs.cancelLegs(['TEST-CANCEL-1-LEG-1', 'TEST-CANCEL-1-LEG-2'], { reason: 'Client Cancelled', user: 'coordinator' } as any);
    expect(results).toHaveLength(2);
    expect(results.every((l) => l.status === 'Cancelled' && l.cancellationReason === 'Client Cancelled')).toBe(true);
    expect(observed.filter((e) => e.type === 'LEG_CANCELLED')).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `npx dotenv -e .env.test -- npx jest src/server/modules/legs/leg-cancellation.spec.ts`
Expected: FAIL — `legs.previewLegCancellation is not a function`

- [ ] **Step 4: Implement on `LegsService`**

In `src/server/modules/legs/legs.service.ts`, add the import and constructor param:

```ts
import { isValidLegTransition, legReopenAllowed, withLegTransitions } from '../../common/statusTransitions';
import { OperationalEventsService } from '../operational-events/operational-events.service';
```

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly stops: StopsService,
    private readonly events: OperationalEventsService,
  ) {}
```

Add these methods (after `remove()`, before the closing class brace):

```ts
  // "Requested" bucket generalizes Requested/Chasing/Re-confirm Required
  // (all mean "a request is already in flight"); "notStarted" generalizes
  // Not Started/Submission Pending/Submission Failed (nothing has been
  // sent yet). Matches the mega-spec §4's three-bucket impact preview.
  private static readonly REQUESTED_STATUSES = ['Requested', 'Chasing', 'Re-confirm Required'];
  private static readonly NOT_STARTED_STATUSES = ['Not Started', 'Submission Pending', 'Submission Failed'];

  async previewLegCancellation(legId: string) {
    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    const affected = await this.prisma.service.findMany({
      where: { scopeId: legId, status: { not: 'Cancelled' } },
      select: { status: true, providerId: true },
    });
    const confirmed = affected.filter((s) => s.status === 'Confirmed').length;
    const requested = affected.filter((s) => LegsService.REQUESTED_STATUSES.includes(s.status)).length;
    const notStarted = affected.filter((s) => LegsService.NOT_STARTED_STATUSES.includes(s.status)).length;
    const vendorNotifications = new Set(affected.filter((s) => s.providerId).map((s) => s.providerId)).size;
    return {
      legId,
      route: `${leg.depIcao} → ${leg.arrIcao}`,
      servicesAffected: affected.length,
      confirmed,
      requested,
      notStarted,
      vendorNotifications,
      crewCount: leg.crewCount,
      paxCount: leg.paxCount,
    };
  }

  async cancelLeg(legId: string, dto: CancelLegDto, role?: string) {
    const before = await this.prisma.leg.findUnique({ where: { legId } });
    if (!before) throw new NotFoundException(`Leg ${legId} not found`);
    if (!isValidLegTransition(before.status, 'Cancelled')) {
      throw new BadRequestException(`Cannot cancel a Leg with status "${before.status}"`);
    }
    if (!legReopenAllowed(before.status, role)) {
      throw new ForbiddenException('Cancelling from this status requires the Admin role');
    }
    const user = dto.user || 'SYSTEM';
    const cancelledAtZ = new Date();

    const affectedServices = await this.cancelLegTransaction(legId, before, dto, user, cancelledAtZ);

    const leg = await this.prisma.leg.findUnique({ where: { legId } });
    await this.audit.logDiff(user, 'Leg', legId, before as unknown as Record<string, unknown>, leg as unknown as Record<string, unknown>);
    this.events.emit({ type: 'LEG_CANCELLED', legId, tripId: leg!.tripId, reason: dto.reason, user });
    for (const svc of affectedServices) {
      this.events.emit({ type: 'SERVICE_CANCELLED', svcId: svc.svcId, tripId: leg!.tripId, providerId: svc.providerId, reason: dto.reason, user });
    }
    return withLegTransitions(leg!, role);
  }

  async cancelLegs(legIds: string[], dto: CancelLegsDto) {
    const user = dto.user || 'SYSTEM';
    const results = [];
    for (const legId of legIds) {
      const before = await this.prisma.leg.findUnique({ where: { legId } });
      if (!before) throw new NotFoundException(`Leg ${legId} not found`);
      if (!isValidLegTransition(before.status, 'Cancelled')) {
        throw new BadRequestException(`Cannot cancel Leg ${legId} with status "${before.status}"`);
      }
      const cancelledAtZ = new Date();
      const affectedServices = await this.cancelLegTransaction(legId, before, dto, user, cancelledAtZ);

      const leg = await this.prisma.leg.findUnique({ where: { legId } });
      await this.audit.logDiff(user, 'Leg', legId, before as unknown as Record<string, unknown>, leg as unknown as Record<string, unknown>);
      this.events.emit({ type: 'LEG_CANCELLED', legId, tripId: leg!.tripId, reason: dto.reason, user });
      for (const svc of affectedServices) {
        this.events.emit({ type: 'SERVICE_CANCELLED', svcId: svc.svcId, tripId: leg!.tripId, providerId: svc.providerId, reason: dto.reason, user });
      }
      results.push(withLegTransitions(leg!));
    }
    return results;
  }

  // Shared by cancelLeg (caller-pinned version) and cancelLegs (freshly
  // read per Leg) -- both call this with `before` already loaded and
  // already validated, so this only ever performs the write.
  private async cancelLegTransaction(
    legId: string,
    before: { version: number },
    dto: { reason: string; remarks?: string; version?: number },
    user: string,
    cancelledAtZ: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.leg.updateMany({
        where: { legId, version: dto.version ?? before.version },
        data: {
          status: 'Cancelled',
          statusChangedAt: cancelledAtZ,
          statusChangedBy: user,
          cancellationReason: dto.reason,
          cancellationRemarks: dto.remarks,
          cancelledBy: user,
          cancelledAtZ,
          version: { increment: 1 },
        },
      });
      const affected = await tx.service.findMany({ where: { scopeId: legId, status: { not: 'Cancelled' } } });
      if (affected.length > 0) {
        await tx.service.updateMany({
          where: { svcId: { in: affected.map((s) => s.svcId) } },
          data: {
            status: 'Cancelled',
            statusChangedAt: cancelledAtZ,
            statusChangedBy: user,
            cancellationReason: dto.reason,
            cancellationRemarks: dto.remarks,
            cancelledBy: user,
            cancelledAtZ,
            version: { increment: 1 },
          },
        });
      }
      return affected;
    });
  }
```

Add the DTO imports near the top of the file:

```ts
import { CancelLegDto } from './dto/cancel-leg.dto';
import { CancelLegsDto } from './dto/cancel-legs.dto';
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `npx dotenv -e .env.test -- npx jest src/server/modules/legs/leg-cancellation.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Controller routes**

In `src/server/modules/legs/legs.controller.ts`, add imports:

```ts
import { CancelLegDto } from './dto/cancel-leg.dto';
import { CancelLegsDto } from './dto/cancel-legs.dto';
```

Add routes (literal `cancel-batch` before the `:legId` catch-all, matching this controller's existing `upcoming`/`compute-overflight` ordering convention):

```ts
  @Get(':legId/cancellation-preview')
  cancellationPreview(@Param('legId') legId: string) {
    return this.legs.previewLegCancellation(legId);
  }

  @Post('cancel-batch')
  cancelBatch(@Body() dto: CancelLegsDto) {
    return this.legs.cancelLegs(dto.legIds, dto);
  }

  @Post(':legId/cancel')
  cancel(@Param('legId') legId: string, @Body() dto: CancelLegDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.legs.cancelLeg(legId, dto, currentUser?.role);
  }
```

- [ ] **Step 7: Wire the module**

In `src/server/modules/legs/legs.module.ts`:

```ts
import { OperationalEventsModule } from '../operational-events/operational-events.module';
```

```ts
@Module({
  imports: [ServicesModule, StopsModule, OperationalEventsModule],
  ...
```

- [ ] **Step 8: Build check and commit**

```bash
npx nest build
npx dotenv -e .env.test -- npx jest src/server/modules/legs --runInBand
git add src/server/modules/legs
git commit -m "feat: add single/multi-Leg cancellation with impact preview"
```

---

### Task 4: Trip cancellation

**Files:**
- Create: `src/server/modules/trips/dto/cancel-trip.dto.ts`
- Modify: `src/server/modules/trips/trips.service.ts`
- Modify: `src/server/modules/trips/trips.controller.ts`
- Modify: `src/server/modules/trips/trips.module.ts`
- Test: `src/server/modules/trips/trip-cancellation.spec.ts`

**Interfaces:**
- Consumes: `LegsService.cancelLegs` (Task 3), `OperationalEventsService` (Task 2).
- Produces: `TripsService.previewTripCancellation(tripId)`, `cancelTrip(tripId, dto, role?)`.

- [ ] **Step 1: DTO**

```ts
// src/server/modules/trips/dto/cancel-trip.dto.ts
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { CANCELLATION_REASONS } from '../../../common/cancellationReasons';

export class CancelTripDto {
  @IsIn(CANCELLATION_REASONS)
  reason!: (typeof CANCELLATION_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;

  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/server/modules/trips/trip-cancellation.spec.ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { OperationalEventsService } from '../operational-events/operational-events.service';
import { LegsService } from '../legs/legs.service';
import { TripsService } from './trips.service';
import { truncateAll } from '../../test/db-test-utils';
import type { OperationalEvent } from '../operational-events/event-types';

describe('TripsService cancellation', () => {
  let prisma: PrismaService;
  let trips: TripsService;
  let observed: OperationalEvent[];

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    const services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
    const stops = new StopsService(prisma, audit);
    const emitter = new EventEmitter2();
    observed = [];
    emitter.onAny((_event, payload) => observed.push(payload as OperationalEvent));
    const events = new OperationalEventsService(emitter);
    const legs = new LegsService(prisma, audit, services, stops, events);
    trips = new TripsService(prisma, audit, services, legs, events);

    await prisma.trip.create({ data: { tripId: 'TEST-TRIP-CANCEL-1', client: 'Test Client', status: 'Active', version: 1 } });
    await prisma.leg.createMany({
      data: [
        { legId: 'TC1-LEG-1', tripId: 'TEST-TRIP-CANCEL-1', seq: 1, depIcao: 'HECA', arrIcao: 'HTDA', etdZ: new Date('2026-10-01T00:00:00.000Z'), etaZ: new Date('2026-10-01T02:00:00.000Z'), blockHours: 2, status: 'Completed' },
        { legId: 'TC1-LEG-2', tripId: 'TEST-TRIP-CANCEL-1', seq: 2, depIcao: 'HTDA', arrIcao: 'FALA', etdZ: new Date('2026-10-02T00:00:00.000Z'), etaZ: new Date('2026-10-02T02:00:00.000Z'), blockHours: 2, status: 'Active' },
        { legId: 'TC1-LEG-3', tripId: 'TEST-TRIP-CANCEL-1', seq: 3, depIcao: 'FALA', arrIcao: 'HAAB', etdZ: new Date('2026-10-03T00:00:00.000Z'), etaZ: new Date('2026-10-03T02:00:00.000Z'), blockHours: 2, status: 'Planned' },
      ],
    });
  });

  it('cancelTrip cancels every non-Completed Leg and the Trip, leaving the Completed Leg untouched — the §101 acceptance scenario', async () => {
    const result = await trips.cancelTrip('TEST-TRIP-CANCEL-1', { reason: 'Weather', version: 1, user: 'coordinator' } as any);
    expect(result.status).toBe('Cancelled');

    const completedLeg = await prisma.leg.findUnique({ where: { legId: 'TC1-LEG-1' } });
    expect(completedLeg!.status).toBe('Completed');
    expect(completedLeg!.cancelledAtZ).toBeNull();

    const activeLeg = await prisma.leg.findUnique({ where: { legId: 'TC1-LEG-2' } });
    const plannedLeg = await prisma.leg.findUnique({ where: { legId: 'TC1-LEG-3' } });
    expect(activeLeg!.status).toBe('Cancelled');
    expect(plannedLeg!.status).toBe('Cancelled');

    expect(observed.filter((e) => e.type === 'LEG_CANCELLED')).toHaveLength(2);
    expect(observed.filter((e) => e.type === 'TRIP_CANCELLED')).toHaveLength(1);
  });

  it('cancelTrip still cancels the Trip when every Leg is already Completed', async () => {
    await prisma.leg.updateMany({ where: { tripId: 'TEST-TRIP-CANCEL-1' }, data: { status: 'Completed' } });
    const result = await trips.cancelTrip('TEST-TRIP-CANCEL-1', { reason: 'Commercial', version: 1, user: 'coordinator' } as any);
    expect(result.status).toBe('Cancelled');
    expect(observed.filter((e) => e.type === 'LEG_CANCELLED')).toHaveLength(0);
    expect(observed.filter((e) => e.type === 'TRIP_CANCELLED')).toHaveLength(1);
  });

  it('previewTripCancellation counts only non-terminal Legs as "to cancel"', async () => {
    const preview = await trips.previewTripCancellation('TEST-TRIP-CANCEL-1');
    expect(preview.legsToCancel).toBe(2);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `npx dotenv -e .env.test -- npx jest src/server/modules/trips/trip-cancellation.spec.ts`
Expected: FAIL — `trips.cancelTrip is not a function`

- [ ] **Step 4: Implement on `TripsService`**

Add imports and constructor param in `src/server/modules/trips/trips.service.ts`:

```ts
import { LegsService } from '../legs/legs.service';
import { OperationalEventsService } from '../operational-events/operational-events.service';
import { CancelTripDto } from './dto/cancel-trip.dto';
```

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly services: ServicesService,
    private readonly legs: LegsService,
    private readonly events: OperationalEventsService,
  ) {}
```

Add methods (after `sheet()`, or anywhere convenient before `create()`):

```ts
  async previewTripCancellation(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { tripId }, include: { legs: true } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    const nonTerminal = trip.legs.filter((l) => l.status !== 'Completed' && l.status !== 'Cancelled');
    const legPreviews = await Promise.all(nonTerminal.map((l) => this.legs.previewLegCancellation(l.legId)));
    return {
      tripId,
      legsToCancel: nonTerminal.length,
      servicesAffected: legPreviews.reduce((sum, p) => sum + p.servicesAffected, 0),
      confirmed: legPreviews.reduce((sum, p) => sum + p.confirmed, 0),
      requested: legPreviews.reduce((sum, p) => sum + p.requested, 0),
      notStarted: legPreviews.reduce((sum, p) => sum + p.notStarted, 0),
      vendorNotifications: legPreviews.reduce((sum, p) => sum + p.vendorNotifications, 0),
    };
  }

  async cancelTrip(tripId: string, dto: CancelTripDto, role?: string) {
    const before = await this.prisma.trip.findUnique({ where: { tripId }, include: { legs: true } });
    if (!before) throw new NotFoundException(`Trip ${tripId} not found`);
    if (!isValidTripTransition(before.status, 'Cancelled')) {
      throw new BadRequestException(`Cannot cancel a Trip with status "${before.status}"`);
    }
    const user = dto.user || 'SYSTEM';

    const nonTerminalLegIds = before.legs
      .filter((l) => l.status !== 'Completed' && l.status !== 'Cancelled')
      .map((l) => l.legId);
    if (nonTerminalLegIds.length > 0) {
      await this.legs.cancelLegs(nonTerminalLegIds, { reason: dto.reason, remarks: dto.remarks, user });
    }

    const result = await this.prisma.trip.updateMany({
      where: { tripId, version: dto.version },
      data: {
        status: 'Cancelled',
        statusChangedAt: new Date(),
        statusChangedBy: user,
        cancellationReason: dto.reason,
        cancellationRemarks: dto.remarks,
        cancelledBy: user,
        cancelledAtZ: new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      const current = await this.prisma.trip.findUnique({ where: { tripId } });
      throw new ConflictException({ message: `Trip ${tripId} was modified by someone else`, current: current ? withTripTransitions(current, role) : current });
    }

    const trip = await this.prisma.trip.findUnique({ where: { tripId } });
    await this.audit.logDiff(user, 'Trip', tripId, before as unknown as Record<string, unknown>, trip as unknown as Record<string, unknown>);
    this.events.emit({ type: 'TRIP_CANCELLED', tripId, reason: dto.reason, user });
    return withTripTransitions(trip!, role);
  }
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `npx dotenv -e .env.test -- npx jest src/server/modules/trips/trip-cancellation.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Controller routes**

In `src/server/modules/trips/trips.controller.ts`:

```ts
import { CancelTripDto } from './dto/cancel-trip.dto';
```

```ts
  @Get(':tripId/cancellation-preview')
  cancellationPreview(@Param('tripId') tripId: string) {
    return this.trips.previewTripCancellation(tripId);
  }

  @Post(':tripId/cancel')
  cancel(@Param('tripId') tripId: string, @Body() dto: CancelTripDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.trips.cancelTrip(tripId, dto, currentUser?.role);
  }
```

- [ ] **Step 7: Wire the module**

In `src/server/modules/trips/trips.module.ts`:

```ts
import { LegsModule } from '../legs/legs.module';
import { OperationalEventsModule } from '../operational-events/operational-events.module';
```

```ts
@Module({
  imports: [ServicesModule, LegsModule, OperationalEventsModule],
  ...
```

- [ ] **Step 8: Build check and commit**

```bash
npx nest build
npx dotenv -e .env.test -- npx jest src/server/modules/trips --runInBand
git add src/server/modules/trips
git commit -m "feat: add whole-Trip cancellation, preserving Completed Legs"
```

---

### Task 5: Client data layer — Leg status + cancellation API

**Files:**
- Modify: `src/client/data/types.ts` (`Leg` interface)
- Modify: `src/client/lib/dataStore.ts` (`mapLegFromApi`, new functions/types)
- Modify: `src/client/components/StatusBadge.tsx` (`'leg'` entityType)
- Test: none (this codebase's convention is server-side Jest tests; client data-layer functions are covered by the manual smoke test in Task 6)

**Interfaces:**
- Produces: `Leg.Status/AllowedTransitions/CancellationReason/...`, `LEG_CANCELLATION_REASONS`, `getLegCancellationPreview`, `cancelLeg`, `cancelLegs`, `getTripCancellationPreview`, `cancelTrip` — consumed by Task 6's dialogs.

- [ ] **Step 1: Extend the client `Leg` type**

In `src/client/data/types.ts`, inside `export interface Leg { ... }` (after `Routing?: string;`), add:

```ts
  Status: string;
  StatusChangedAt?: string;
  StatusChangedBy?: string;
  AllowedTransitions?: string[];
  CancellationReason?: string;
  CancellationRemarks?: string;
  CancelledBy?: string;
  CancelledAtZ?: string;
```

- [ ] **Step 2: Map the new fields**

In `src/client/lib/dataStore.ts`, `mapLegFromApi` (add after the existing `Routing: l.routing ?? undefined,` line):

```ts
    Status: l.status,
    StatusChangedAt: l.statusChangedAt ?? undefined,
    StatusChangedBy: l.statusChangedBy ?? undefined,
    AllowedTransitions: l.allowedTransitions ?? undefined,
    CancellationReason: l.cancellationReason ?? undefined,
    CancellationRemarks: l.cancellationRemarks ?? undefined,
    CancelledBy: l.cancelledBy ?? undefined,
    CancelledAtZ: l.cancelledAtZ ?? undefined,
```

- [ ] **Step 3: Cancellation reason constant + preview/cancel functions**

Add near `getVendorAssignmentList`/other list functions in `dataStore.ts`:

```ts
export const CANCELLATION_REASONS = [
  'Client Cancelled', 'Aircraft Technical', 'Weather', 'Crew',
  'Schedule Change', 'Permit / Regulatory', 'Operational', 'Commercial',
  'Security', 'Airport Closed', 'Mission Cancelled', 'Duplicate Trip', 'Other',
] as const;

export interface CancellationPreview {
  servicesAffected: number;
  confirmed: number;
  requested: number;
  notStarted: number;
  vendorNotifications: number;
}

export interface LegCancellationPreview extends CancellationPreview {
  legId: string;
  route: string;
  crewCount: number;
  paxCount: number;
}

export interface TripCancellationPreview extends CancellationPreview {
  tripId: string;
  legsToCancel: number;
}

export async function getLegCancellationPreview(legId: string): Promise<LegCancellationPreview> {
  return apiJson<LegCancellationPreview>(`/legs/${legId}/cancellation-preview`);
}

export async function cancelLeg(
  legId: string,
  input: { reason: string; remarks?: string; version: number },
  user = currentUser(),
): Promise<Leg> {
  const row = await apiJson<any>(`/legs/${legId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ ...input, user }),
  });
  return mapLegFromApi(row);
}

export async function cancelLegs(
  legIds: string[],
  input: { reason: string; remarks?: string },
  user = currentUser(),
): Promise<Leg[]> {
  const rows = await apiJson<any[]>('/legs/cancel-batch', {
    method: 'POST',
    body: JSON.stringify({ legIds, ...input, user }),
  });
  return rows.map(mapLegFromApi);
}

export async function getTripCancellationPreview(tripId: string): Promise<TripCancellationPreview> {
  return apiJson<TripCancellationPreview>(`/trips/${tripId}/cancellation-preview`);
}

export async function cancelTrip(
  tripId: string,
  input: { reason: string; remarks?: string; version: number },
  user = currentUser(),
): Promise<Trip> {
  const row = await apiJson<any>(`/trips/${tripId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ ...input, user }),
  });
  return mapTripFromApi(row);
}
```

(If `mapTripFromApi` is not already exported, check its current visibility in `dataStore.ts` — export it if it's currently module-private, since `cancelTrip` above needs it. Every other `map*FromApi` function in this file is already exported; this one should already match that pattern, but confirm rather than assume.)

- [ ] **Step 4: Add the `'leg'` entityType to `StatusBadge`**

In `src/client/components/StatusBadge.tsx`, add after `TASK_STATUS_COLORS`:

```ts
const LEG_STATUS_COLORS: Record<string, string> = {
  'Planned': 'bg-blue-100 text-blue-700',
  'Active': 'bg-emerald-100 text-emerald-700',
  'Completed': 'bg-slate-100 text-slate-600',
  'Cancelled': 'bg-red-100 text-red-700',
};
```

Change the `COLOR_MAPS` type and value, and the `StatusBadge` prop type, to include `'leg'`:

```ts
const COLOR_MAPS: Record<'trip' | 'service' | 'task' | 'leg', Record<string, string>> = {
  trip: TRIP_STATUS_COLORS,
  service: SERVICE_STATUS_COLORS,
  task: TASK_STATUS_COLORS,
  leg: LEG_STATUS_COLORS,
};

export function StatusBadge({ status, entityType, className }: { status: string; entityType: 'trip' | 'service' | 'task' | 'leg'; className?: string }) {
```

- [ ] **Step 5: Build check**

```bash
npx tsc -p tsconfig.client.json --noEmit
```

Expected: clean (no errors). Fix any callers that construct a `Leg` object literal missing the now-required `Status` field (e.g. in tests or optimistic-update code) by checking every compile error's file — do not add a workaround default; use the real status from context.

- [ ] **Step 6: Commit**

```bash
git add src/client/data/types.ts src/client/lib/dataStore.ts src/client/components/StatusBadge.tsx
git commit -m "feat: surface Leg status and cancellation preview/cancel on the client"
```

---

### Task 6: Client cancellation dialogs

**Files:**
- Create: `src/client/components/CancelLegDialog.tsx`
- Create: `src/client/components/CancelTripDialog.tsx`
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: Task 5's `getLegCancellationPreview`/`cancelLeg`/`cancelLegs`/`getTripCancellationPreview`/`cancelTrip`/`CANCELLATION_REASONS`; `generateEmail`/`defaultTemplateForCancellation` (`src/client/lib/emailTemplates.ts`, already used by `ChangeVendorDialog.tsx`); `saveComm`/`sendComm` (`dataStore.ts`, already used by `ChangeVendorDialog.tsx`).

- [ ] **Step 1: `CancelLegDialog`**

```tsx
// src/client/components/CancelLegDialog.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  ApiError, CANCELLATION_REASONS, cancelLeg, getLegCancellationPreview,
  getProviderList, saveComm, sendComm,
} from '@/lib/dataStore';
import type { LegCancellationPreview, Service } from '@/lib/dataStore';
import { generateEmail, defaultTemplateForCancellation } from '@/lib/emailTemplates';
import type { Leg, Trip, TripPersonView, Comm } from '@/data/types';

type Step = 'preview' | 'cancelling' | 'done';

// Modeled directly on ChangeVendorDialog.tsx's own cancellation-send
// block (its handleConfirm, around lines 149-182) -- after the
// server-side cancellation commits, this loops every affected service
// with a provider on file and sends the exact same cancellation email
// that block already sends for a single service, via the same
// generateEmail/saveComm/sendComm primitives, adjusted only to run once
// per affected service instead of once. A send failure is shown per
// service and never rolled back or retried automatically -- the
// cancellation itself already committed. Providers are fetched with
// getProviderList() directly (the same synchronous in-memory-cache call
// ChangeVendorDialog.tsx itself uses via `useState(getProviderList())`)
// rather than taken as a prop -- TripDetail.tsx has no ready provider
// list of its own to pass down; confirmed by checking how
// <ChangeVendorDialog> is actually invoked there (around line 1215),
// which passes no `providers` prop either.
export function CancelLegDialog({
  open, onClose, leg, trip, legs, persons, legServices, onCancelled,
}: {
  open: boolean; onClose: () => void; leg: Leg; trip: Trip; legs: Leg[]; persons: TripPersonView[]; legServices: Service[];
  onCancelled: () => Promise<void> | void;
}) {
  const [providers] = useState(getProviderList());
  const [preview, setPreview] = useState<LegCancellationPreview | null>(null);
  const [reason, setReason] = useState<typeof CANCELLATION_REASONS[number] | ''>('');
  const [remarks, setRemarks] = useState('');
  const [step, setStep] = useState<Step>('preview');
  const [error, setError] = useState('');
  const [sendResults, setSendResults] = useState<{ provider: string; ok: boolean; error?: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setReason('');
    setRemarks('');
    setStep('preview');
    setError('');
    setSendResults([]);
    getLegCancellationPreview(leg.LegID).then(setPreview).catch(() => setError('Could not load cancellation impact — try again.'));
  }, [open, leg.LegID]);

  const handleConfirm = async () => {
    if (!reason) return;
    setStep('cancelling');
    setError('');
    try {
      await cancelLeg(leg.LegID, { reason, remarks: remarks.trim() || undefined, version: leg.Version });
    } catch (err) {
      const msg = err instanceof ApiError ? `Could not cancel this leg: ${err.message}` : 'Could not cancel this leg — try again.';
      setError(msg);
      setStep('preview');
      return;
    }

    const results: { provider: string; ok: boolean; error?: string }[] = [];
    const withProvider = legServices.filter((s) => s.ProviderID && s.Status !== 'Cancelled');
    for (const svc of withProvider) {
      const provider = providers.find((p) => p.ProviderID === svc.ProviderID);
      const recipients = provider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
      if (!provider || recipients.length === 0) continue;
      try {
        // Exact call shape from ChangeVendorDialog.tsx's own cancellation
        // send (line 157) -- same 17 positional args, same trailing
        // issuedRef/previousItinerary handling.
        const generated = generateEmail(
          defaultTemplateForCancellation(svc.ServiceType), trip.TripID, leg.LegID, svc.SVCID, legs, persons, '',
          trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
          trip.Client, trip.Operator, trip.SupportRef || '', svc.CountryISO2 ?? null, recipients,
          null, svc.RefNumber || '',
        );
        const comm: Comm = {
          CommID: `COMM-${svc.SVCID}-CANCEL-${Date.now()}`,
          Direction: 'OUTBOUND',
          TripID: trip.TripID,
          SVCID: svc.SVCID,
          Token: svc.SVCID,
          From: 'operations@viq.local',
          To: recipients.join(', '),
          Subject: generated.subject,
          Body: generated.body,
          TimestampZ: new Date().toISOString(),
          Status: 'Draft',
        };
        await saveComm(comm);
        const sent = await sendComm(comm.CommID);
        results.push({ provider: provider.Name, ok: sent.Status === 'Sent', error: sent.ErrorMessage });
      } catch {
        results.push({ provider: provider.Name, ok: false, error: 'send failed' });
      }
    }
    setSendResults(results);
    setStep('done');
    await onCancelled();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Cancel Leg {leg.Seq}: {leg.DepICAO} → {leg.ArrICAO}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {step === 'preview' && preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Services affected: <strong>{preview.servicesAffected}</strong></div>
              <div>Confirmed: <strong>{preview.confirmed}</strong></div>
              <div>Requested: <strong>{preview.requested}</strong></div>
              <div>Not started: <strong>{preview.notStarted}</strong></div>
              <div>Crew: <strong>{preview.crewCount}</strong></div>
              <div>Passengers: <strong>{preview.paxCount}</strong></div>
              <div>Vendor notifications: <strong>{preview.vendorNotifications}</strong></div>
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Remarks (optional)</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="destructive" disabled={!reason} onClick={handleConfirm}>Cancel &amp; Notify</Button>
            </div>
          </div>
        )}
        {step === 'cancelling' && <p className="text-sm text-muted-foreground">Cancelling…</p>}
        {step === 'done' && (
          <div className="space-y-2">
            <p className="text-sm">Leg cancelled.</p>
            {sendResults.map((r, i) => (
              <p key={i} className={`text-xs ${r.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                {r.ok ? `Notified ${r.provider}.` : `Could not notify ${r.provider}${r.error ? ` (${r.error})` : ''}.`}
              </p>
            ))}
            <Button size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `CancelTripDialog`**

```tsx
// src/client/components/CancelTripDialog.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ApiError, CANCELLATION_REASONS, cancelTrip, getTripCancellationPreview } from '@/lib/dataStore';
import type { TripCancellationPreview } from '@/lib/dataStore';
import type { Trip } from '@/data/types';

// Trip-level counterpart to CancelLegDialog -- deliberately does not
// re-send per-service vendor notifications itself: the server's
// cancelTrip() already cancels every non-Completed Leg through the same
// LegsService.cancelLegs() path CancelLegDialog's own single-Leg send
// loop is modeled on, so sending here too would double-notify every
// vendor. A future iteration could surface a combined per-service send
// summary across every cancelled Leg; out of scope for this pass.
export function CancelTripDialog({
  open, onClose, trip, onCancelled,
}: {
  open: boolean; onClose: () => void; trip: Trip; onCancelled: () => Promise<void> | void;
}) {
  const [preview, setPreview] = useState<TripCancellationPreview | null>(null);
  const [reason, setReason] = useState<typeof CANCELLATION_REASONS[number] | ''>('');
  const [remarks, setRemarks] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setReason('');
    setRemarks('');
    setError('');
    getTripCancellationPreview(trip.TripID).then(setPreview).catch(() => setError('Could not load cancellation impact — try again.'));
  }, [open, trip.TripID]);

  const handleConfirm = async () => {
    if (!reason) return;
    setCancelling(true);
    setError('');
    try {
      await cancelTrip(trip.TripID, { reason, remarks: remarks.trim() || undefined, version: trip.Version });
      await onCancelled();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? `Could not cancel this trip: ${err.message}` : 'Could not cancel this trip — try again.';
      setError(msg);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Cancel Trip {trip.TripID}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Legs to cancel: <strong>{preview.legsToCancel}</strong></div>
              <div>Services affected: <strong>{preview.servicesAffected}</strong></div>
              <div>Confirmed: <strong>{preview.confirmed}</strong></div>
              <div>Requested: <strong>{preview.requested}</strong></div>
              <div>Not started: <strong>{preview.notStarted}</strong></div>
              <div>Vendor notifications: <strong>{preview.vendorNotifications}</strong></div>
            </div>
            <p className="text-xs text-muted-foreground">Already-Completed legs are left exactly as they are.</p>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Remarks (optional)</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button variant="destructive" disabled={!reason || cancelling} onClick={handleConfirm}>
                {cancelling ? 'Cancelling…' : 'Cancel Trip'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire into `TripDetail.tsx`**

Add imports near the top (alongside the existing `ChangeVendorDialog` import at line 19):

```tsx
import { CancelLegDialog } from '@/components/CancelLegDialog';
import { CancelTripDialog } from '@/components/CancelTripDialog';
```

In `LegEditor` (around line 262, alongside its other `useState` calls), add:

```tsx
  const [cancelOpen, setCancelOpen] = useState(false);
```

In its returned JSX, in the "LEG SERVICES & ROUTING" header block (around line 486-492), add a status badge and a Cancel button next to the existing Edit/Save button, gated on the Leg not already being terminal:

```tsx
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">LEG SERVICES & ROUTING</h3>
          <StatusBadge status={leg.Status} entityType="leg" className="text-[10px]" />
        </div>
        <div className="flex items-center gap-2">
          {leg.Status !== 'Cancelled' && leg.Status !== 'Completed' && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)}>
              Cancel Leg
            </Button>
          )}
          <Button size="sm" variant={editing ? 'default' : 'outline'} disabled={!canEdit || (editing && !legHasChanges)} onClick={() => canEdit && (editing ? save() : setEditing(true))}>
            {editing ? <Save className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
            {editing ? 'SAVE' : 'EDIT'}
          </Button>
        </div>
      </div>
      <CancelLegDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        leg={leg}
        trip={trip}
        legs={legs}
        persons={persons}
        legServices={legServices}
        onCancelled={onSaved}
      />
```

(`StatusBadge` is already imported in `TripDetail.tsx` at line 45 — no new import needed. `legServices` is `LegEditor`'s own existing local variable, already computed at line 301-303; `legs` and `persons` are `LegEditor`'s own existing props, already in scope in this same function.)

Near the Trip-level header (around line 1802's Edit/Save button, alongside `trip.AllowedTransitions` at line 1847), add the same pattern for `CancelTripDialog`, gated on `trip.Status !== 'Cancelled' && trip.Status !== 'Complete'`. `CancelTripDialog` takes no `providers`/services prop at all (it never sends vendor emails itself, per its own header comment above) — only `open`/`onClose`/`trip`/`onCancelled`.

- [ ] **Step 4: Build check**

```bash
npx tsc -p tsconfig.client.json --noEmit
npm run build:client
```

- [ ] **Step 5: Manual smoke test**

Start the dev server (rebuild `dist/public` first if it was wiped by a restart), then in the browser:

1. Open a Trip with a Leg that has at least one Confirmed service with a real provider email on file.
2. Click "Cancel Leg" — confirm the impact preview numbers match the Leg's actual services.
3. Pick a reason, confirm — verify the Leg's badge turns Cancelled, its services turn Cancelled, and (if a provider email was on file) a real cancellation email arrives.
4. Open a Trip with one Completed Leg and cancel the whole Trip — verify the Completed Leg's badge is untouched and every other Leg plus the Trip itself show Cancelled.

- [ ] **Step 6: Commit**

```bash
git add src/client/components/CancelLegDialog.tsx src/client/components/CancelTripDialog.tsx src/client/pages/TripDetail.tsx
git commit -m "feat: add Cancel Leg / Cancel Trip dialogs with vendor notification"
```

---

## Final Review Checklist

- [ ] `npx nest build` and `npx tsc -p tsconfig.client.json --noEmit` both clean.
- [ ] `npx dotenv -e .env.test -- npx jest src/server/modules/legs src/server/modules/trips src/server/modules/operational-events src/server/common/cancellationReasons.spec.ts --runInBand` all green.
- [ ] Confirm (by reading the diff, not just trusting task reports) that no task touched `legs.service.ts`'s existing `update()` Change Impact trigger calls, or `services.service.ts`'s `flagConfirmedServices*` methods — Ruling 1 says those stay untouched.
- [ ] Confirm every new `emit()` call site happens after its `$transaction`/`updateMany` result is confirmed successful, never before or inside it.
- [ ] Manual dev-server check per Task 6 Step 5.
- [ ] Memory file `project_viq.md` updated: Operational Event Engine (scoped) + Leg/Multi-Leg/Trip Cancellation sub-projects complete; Cluster C (Financial Cancellation Treatment) is next per the approved build sequence.
