import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { OperationalEventsModule } from './operational-events.module';
import { OperationalEventsService } from './operational-events.service';
import { truncateAll } from '../../test/db-test-utils';

// Every other cancellation spec (leg-cancellation.spec.ts,
// trip-cancellation.spec.ts) hand-constructs OperationalEventsService and
// registers its own plain emitter.on() collector -- none of them ever
// build a real Nest module, so none of them exercise the actual
// @OnEvent('LEG_CANCELLED') decorator registration path AuditEventListener
// relies on in production. This spec builds a real TestingModule (with
// EventEmitterModule.forRoot() + OperationalEventsModule, both wired the
// same way app.module.ts wires them) and calls moduleRef.init() so Nest's
// own EventSubscribersLoader runs onApplicationBootstrap and actually
// registers AuditEventListener's handlers on the EventEmitter2 instance --
// then proves that pipeline writes a real AuditEntry row.
describe('AuditEventListener (real Nest module wiring)', () => {
  let prisma: PrismaService;
  let events: OperationalEventsService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), PrismaModule, OperationalEventsModule],
    }).compile();

    // Triggers Nest's real onApplicationBootstrap lifecycle, which is when
    // @nestjs/event-emitter's EventSubscribersLoader scans providers and
    // registers every @OnEvent-decorated method (AuditEventListener's
    // handlers included) onto the underlying EventEmitter2 instance.
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    events = moduleRef.get(OperationalEventsService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    await prisma.trip.create({ data: { tripId: 'TEST-AUDIT-WIRING-1', client: 'Test Client' } });
    await prisma.leg.create({
      data: {
        legId: 'TEST-AUDIT-WIRING-1-LEG-1', tripId: 'TEST-AUDIT-WIRING-1', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA', etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T08:00:00.000Z'),
        blockHours: 2, paxCount: 7, crewCount: 4,
      },
    });
  });

  it('a real LEG_CANCELLED emit runs through @OnEvent registration and writes an AuditEntry', async () => {
    events.emit({
      type: 'LEG_CANCELLED',
      legId: 'TEST-AUDIT-WIRING-1-LEG-1',
      tripId: 'TEST-AUDIT-WIRING-1',
      reason: 'Weather',
      user: 'coordinator',
    });

    // AuditEventListener.onLegCancelled is async and only synchronous up to
    // its first await, so give the in-flight promise a tick to complete
    // before asserting (mirrors the async-listener note in
    // operational-events.service.ts's own class comment).
    await new Promise((resolve) => setImmediate(resolve));

    const entry = await prisma.auditEntry.findFirst({
      where: { table: 'Leg', recordId: 'TEST-AUDIT-WIRING-1-LEG-1' },
    });
    expect(entry).not.toBeNull();
    expect(entry!.newValue).toBe('Weather');
  });
});
