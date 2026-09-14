import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { LegsService } from '../legs/legs.service';
import { OperationalEventsService } from '../operational-events/operational-events.service';
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
    const services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
    const stops = new StopsService(prisma, audit);
    const events = new OperationalEventsService(new EventEmitter2());
    const legs = new LegsService(prisma, audit, services, stops, events);
    trips = new TripsService(prisma, audit, services, legs, events);
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
