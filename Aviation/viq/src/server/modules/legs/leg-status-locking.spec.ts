import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { LegsService } from './legs.service';
import { TripsService } from '../trips/trips.service';

describe('Leg version/status-tracking columns', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('defaults a new Leg to status Planned with null status-change tracking', async () => {
    await prisma.trip.create({ data: { tripId: 'TEST-LEG-STATUS-1', client: 'Test Client' } });
    const leg = await prisma.leg.create({
      data: {
        legId: 'TEST-LEG-STATUS-1-LEG-1', tripId: 'TEST-LEG-STATUS-1', seq: 1,
        depIcao: 'HTDA', arrIcao: 'FALA',
        etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 2, countriesOverflown: [],
      },
    });

    expect(leg.status).toBe('Planned');
    expect(leg.statusChangedAt).toBeNull();
    expect(leg.statusChangedBy).toBeNull();
  });
});

describe('Leg status transitions', () => {
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

  async function makeLeg(tripId: string, legId: string) {
    await trips.create({ tripId, client: 'Test Client' });
    return legs.create({
      legId, tripId, seq: 1, depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: [], generateServices: false,
    });
  }

  it('allows Planned -> Active and reports it in allowedTransitions before and after', async () => {
    const created = await makeLeg('TEST-LEG-TRANS-1', 'TEST-LEG-TRANS-1-LEG-1');
    expect(created.allowedTransitions).toEqual(['Active', 'Cancelled']);

    const updated = await legs.update(created.legId, { status: 'Active', version: created.version });
    expect(updated.status).toBe('Active');
    expect(updated.allowedTransitions).toEqual(['Completed', 'Cancelled', 'Planned']);
  });

  it('rejects an undefined transition (Planned -> Completed) with a 400', async () => {
    const created = await makeLeg('TEST-LEG-TRANS-2', 'TEST-LEG-TRANS-2-LEG-1');

    await expect(
      legs.update(created.legId, { status: 'Completed', version: created.version }),
    ).rejects.toThrow();
  });

  it('sets statusChangedAt/By on a status change and leaves them alone on a non-status update', async () => {
    const created = await makeLeg('TEST-LEG-TRANS-3', 'TEST-LEG-TRANS-3-LEG-1');
    expect(created.statusChangedAt).toBeNull();

    const afterStatusChange = await legs.update(created.legId, {
      status: 'Active', version: created.version, user: 'coordinator1',
    });
    expect(afterStatusChange.statusChangedAt).not.toBeNull();
    expect(afterStatusChange.statusChangedBy).toBe('coordinator1');

    const afterOtherChange = await legs.update(created.legId, {
      purpose: 'Charter', version: afterStatusChange.version, user: 'coordinator2',
    });
    expect(afterOtherChange.statusChangedBy).toBe('coordinator1'); // unchanged
  });

  it('records a status change in the Leg audit trail', async () => {
    const created = await makeLeg('TEST-LEG-TRANS-4', 'TEST-LEG-TRANS-4-LEG-1');
    await legs.update(created.legId, { status: 'Active', version: created.version, user: 'coordinator1' });

    const audit = new AuditService(prisma);
    const history = await audit.forRecord('Leg', created.legId);
    const statusEntry = history.find((h) => h.field === 'status');
    expect(statusEntry).toBeDefined();
    expect(statusEntry!.oldValue).toBe('Planned');
    expect(statusEntry!.newValue).toBe('Active');
    expect(statusEntry!.user).toBe('coordinator1');
  });
});

describe('Reopening a Completed leg (Admin-gated)', () => {
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

  async function makeCompletedLeg(tripId: string, legId: string) {
    await trips.create({ tripId, client: 'Test Client' });
    const created = await legs.create({
      legId, tripId, seq: 1, depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: [], generateServices: false,
    });
    const active = await legs.update(created.legId, { status: 'Active', version: created.version });
    return legs.update(created.legId, { status: 'Completed', version: active.version });
  }

  it('does not offer Active as an allowed transition on a Completed leg without an Admin role', async () => {
    const completed = await makeCompletedLeg('TEST-LEG-REOPEN-1', 'TEST-LEG-REOPEN-1-LEG-1');
    expect(completed.allowedTransitions).toEqual([]);

    const asCoordinator = await legs.findOne(completed.legId, 'Coordinator');
    expect(asCoordinator.allowedTransitions).toEqual([]);
  });

  it('offers Active as an allowed transition on a Completed leg for an Admin', async () => {
    const completed = await makeCompletedLeg('TEST-LEG-REOPEN-2', 'TEST-LEG-REOPEN-2-LEG-1');
    const asAdmin = await legs.findOne(completed.legId, 'Admin');
    expect(asAdmin.allowedTransitions).toEqual(['Active']);
  });

  it('rejects Completed -> Active with a 403 for a non-Admin role', async () => {
    const completed = await makeCompletedLeg('TEST-LEG-REOPEN-3', 'TEST-LEG-REOPEN-3-LEG-1');

    let caught: any;
    try {
      await legs.update(completed.legId, { status: 'Active', version: completed.version }, 'Coordinator');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(403);
  });

  it('allows Completed -> Active for an Admin', async () => {
    const completed = await makeCompletedLeg('TEST-LEG-REOPEN-4', 'TEST-LEG-REOPEN-4-LEG-1');

    const reopened = await legs.update(completed.legId, { status: 'Active', version: completed.version }, 'Admin');
    expect(reopened.status).toBe('Active');
    expect(reopened.allowedTransitions).toEqual(['Completed', 'Cancelled', 'Planned']);
  });
});

describe('Leg optimistic locking on status change', () => {
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

  it('rejects a status-changing update with a stale version, returning the current record and who/when it changed', async () => {
    await trips.create({ tripId: 'TEST-LEG-STALE-1', client: 'Test Client' });
    const created = await legs.create({
      legId: 'TEST-LEG-STALE-1-LEG-1', tripId: 'TEST-LEG-STALE-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: [], generateServices: false,
    });

    const firstUpdate = await legs.update(created.legId, {
      status: 'Active', version: created.version, user: 'first-user',
    });
    expect(firstUpdate.version).toBe(created.version + 1);

    let caught: any;
    try {
      await legs.update(created.legId, { status: 'Cancelled', version: created.version, user: 'second-user' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(409);
    expect(caught.response.current.status).toBe('Active');
    expect(caught.response.current.allowedTransitions).toEqual(['Completed', 'Cancelled', 'Planned']);
    expect(caught.response.changedBy).toBe('first-user');
  });
});
