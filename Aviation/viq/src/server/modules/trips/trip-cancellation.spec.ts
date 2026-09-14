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
    // OperationalEventsService.emit() fans out via `this.emitter.listeners(event.type)`,
    // not the underlying EventEmitter2's own `.emit()` -- so listeners must be
    // registered per event type via `.on()`, not `.onAny()`, which EventEmitter2
    // tracks separately and which `.listeners(type)` never returns (see Task 3's
    // leg-cancellation.spec.ts for the same fix).
    for (const type of ['LEG_CANCELLED', 'TRIP_CANCELLED', 'SERVICE_CANCELLED'] as const) {
      emitter.on(type, (payload: OperationalEvent) => observed.push(payload));
    }
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

  it('cancelTrip with a stale version is rejected before touching any Leg, leaving the Trip and every Leg unchanged', async () => {
    await expect(
      trips.cancelTrip('TEST-TRIP-CANCEL-1', { reason: 'Weather', version: 999, user: 'coordinator' } as any),
    ).rejects.toThrow();

    const trip = await prisma.trip.findUnique({ where: { tripId: 'TEST-TRIP-CANCEL-1' } });
    expect(trip!.status).not.toBe('Cancelled');
    expect(trip!.cancellationReason).toBeNull();

    const completedLeg = await prisma.leg.findUnique({ where: { legId: 'TC1-LEG-1' } });
    const activeLeg = await prisma.leg.findUnique({ where: { legId: 'TC1-LEG-2' } });
    const plannedLeg = await prisma.leg.findUnique({ where: { legId: 'TC1-LEG-3' } });
    expect(completedLeg!.status).toBe('Completed');
    expect(activeLeg!.status).toBe('Active');
    expect(plannedLeg!.status).toBe('Planned');

    expect(observed.filter((e) => e.type === 'LEG_CANCELLED')).toHaveLength(0);
    expect(observed.filter((e) => e.type === 'TRIP_CANCELLED')).toHaveLength(0);
  });
});
