import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { LegsService } from './legs.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Leg optimistic locking', () => {
  let prisma: PrismaService;
  let legs: LegsService;
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
    legs = new LegsService(prisma, audit, services, stops);
    trips = new TripsService(prisma, audit, services);
  });

  it('defaults a new Leg to version 1 and increments on update', async () => {
    await trips.create({ tripId: 'TEST-LEG-LOCK-1', client: 'Test Client' });
    const leg = await legs.create({
      legId: 'TEST-LEG-LOCK-1-LEG-1', tripId: 'TEST-LEG-LOCK-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: [], generateServices: false,
    });
    expect(leg.version).toBe(1);

    const updated = await legs.update(leg.legId, { purpose: 'Charter', version: leg.version });
    expect(updated.version).toBe(2);
  });

  it('rejects an update with a stale version, returning the current record and who/when it changed', async () => {
    await trips.create({ tripId: 'TEST-LEG-LOCK-2', client: 'Test Client' });
    const leg = await legs.create({
      legId: 'TEST-LEG-LOCK-2-LEG-1', tripId: 'TEST-LEG-LOCK-2', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: [], generateServices: false,
    });

    const firstUpdate = await legs.update(leg.legId, { purpose: 'First Edit', version: leg.version, user: 'first-user' });
    expect(firstUpdate.version).toBe(2);

    let caught: any;
    try {
      await legs.update(leg.legId, { purpose: 'Second Edit', version: leg.version, user: 'second-user' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(409);
    expect(caught.response.current.purpose).toBe('First Edit');
    expect(caught.response.changedBy).toBe('first-user');
  });
});
