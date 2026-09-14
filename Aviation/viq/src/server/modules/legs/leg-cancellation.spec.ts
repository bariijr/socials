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
    // OperationalEventsService.emit() fans out via `this.emitter.listeners(event.type)`,
    // not the underlying EventEmitter2's own `.emit()` -- so listeners must be
    // registered per event type (matching operational-events.service.spec.ts's own
    // pattern), not via `.onAny()`, which EventEmitter2 tracks separately and which
    // `.listeners(type)` never returns.
    for (const type of ['LEG_CANCELLED', 'SERVICE_CANCELLED'] as const) {
      emitter.on(type, (payload: OperationalEvent) => observed.push(payload));
    }
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
        { svcId: 'SVC-4', tripId: 'TEST-CANCEL-1', scopeType: 'LEG', scopeId: 'TEST-CANCEL-1-LEG-1', serviceType: 'Fuel', status: 'Not Required', providerId: null, basedOnEtdZ: new Date(), requiredByZ: new Date() },
      ],
    });

    const preview = await legs.previewLegCancellation('TEST-CANCEL-1-LEG-1');
    expect(preview.servicesAffected).toBe(4);
    expect(preview.confirmed).toBe(1);
    expect(preview.requested).toBe(1);
    expect(preview.notStarted).toBe(1);
    expect(preview.notRequired).toBe(1);
    expect(preview.confirmed + preview.requested + preview.notStarted + preview.notRequired).toBe(preview.servicesAffected);
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

  it('cancelLeg with a stale version is rejected, leaving the Leg and its Services untouched', async () => {
    await prisma.service.createMany({
      data: [
        { svcId: 'SVC-1', tripId: 'TEST-CANCEL-1', scopeType: 'LEG', scopeId: 'TEST-CANCEL-1-LEG-1', serviceType: 'Overflight', status: 'Confirmed', providerId: null, basedOnEtdZ: new Date(), requiredByZ: new Date() },
      ],
    });

    await expect(
      legs.cancelLeg('TEST-CANCEL-1-LEG-1', { reason: 'Weather', version: 999, user: 'coordinator' } as any),
    ).rejects.toThrow();

    const leg = await prisma.leg.findUnique({ where: { legId: 'TEST-CANCEL-1-LEG-1' } });
    expect(leg!.status).not.toBe('Cancelled');
    expect(leg!.cancellationReason).toBeNull();

    const svc1 = await prisma.service.findUnique({ where: { svcId: 'SVC-1' } });
    expect(svc1!.status).not.toBe('Cancelled');

    expect(observed.filter((e) => e.type === 'LEG_CANCELLED')).toHaveLength(0);
    expect(observed.filter((e) => e.type === 'SERVICE_CANCELLED')).toHaveLength(0);
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
