import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from '../services/services.service';
import { TripsService } from './trips.service';

describe('Trip version/status-tracking columns', () => {
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

  it('defaults a new Trip to version 1 with null status-change tracking', async () => {
    const trip = await prisma.trip.create({
      data: { tripId: 'TEST-VERSION-1', client: 'Test Client' },
    });

    expect(trip.version).toBe(1);
    expect(trip.statusChangedAt).toBeNull();
    expect(trip.statusChangedBy).toBeNull();
  });
});

describe('Trip status transitions', () => {
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
    trips = new TripsService(prisma, audit, services);
  });

  it('allows Planning -> Active and reports it in allowedTransitions before and after', async () => {
    const created = await trips.create({ tripId: 'TEST-TRANS-1', client: 'Test Client' });
    expect(created.allowedTransitions).toEqual(['Active', 'Cancelled']);

    const updated = await trips.update('TEST-TRANS-1', { status: 'Active', version: created.version });
    expect(updated.status).toBe('Active');
    expect(updated.allowedTransitions).toEqual(['Complete', 'Cancelled', 'Planning']);
  });

  it('rejects an undefined transition (Planning -> Complete) with a 400', async () => {
    const created = await trips.create({ tripId: 'TEST-TRANS-2', client: 'Test Client' });

    await expect(
      trips.update('TEST-TRANS-2', { status: 'Complete', version: created.version }),
    ).rejects.toThrow();
  });

  it('sets statusChangedAt/By on a status change and leaves them alone on a non-status update', async () => {
    const created = await trips.create({ tripId: 'TEST-TRANS-3', client: 'Test Client' });
    expect(created.statusChangedAt).toBeNull();

    const afterStatusChange = await trips.update('TEST-TRANS-3', {
      status: 'Active', version: created.version, user: 'coordinator1',
    });
    expect(afterStatusChange.statusChangedAt).not.toBeNull();
    expect(afterStatusChange.statusChangedBy).toBe('coordinator1');

    const afterOtherChange = await trips.update('TEST-TRANS-3', {
      owner: 'New Owner', version: afterStatusChange.version, user: 'coordinator2',
    });
    expect(afterOtherChange.statusChangedBy).toBe('coordinator1'); // unchanged
  });
});

describe('Reopening a Complete trip (Admin-gated)', () => {
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
    trips = new TripsService(prisma, audit, services);
  });

  async function makeCompleteTrip(tripId: string) {
    const created = await trips.create({ tripId, client: 'Test Client' });
    const active = await trips.update(tripId, { status: 'Active', version: created.version });
    return trips.update(tripId, { status: 'Complete', version: active.version });
  }

  it('does not offer Active as an allowed transition on a Complete trip without an Admin role', async () => {
    const complete = await makeCompleteTrip('TEST-REOPEN-1');
    expect(complete.allowedTransitions).toEqual([]);

    const asCoordinator = await trips.findOne('TEST-REOPEN-1', 'Coordinator');
    expect(asCoordinator.allowedTransitions).toEqual([]);
  });

  it('offers Active as an allowed transition on a Complete trip for an Admin', async () => {
    await makeCompleteTrip('TEST-REOPEN-2');
    const asAdmin = await trips.findOne('TEST-REOPEN-2', 'Admin');
    expect(asAdmin.allowedTransitions).toEqual(['Active']);
  });

  it('rejects Complete -> Active with a 403 for a non-Admin role', async () => {
    const complete = await makeCompleteTrip('TEST-REOPEN-3');

    let caught: any;
    try {
      await trips.update('TEST-REOPEN-3', { status: 'Active', version: complete.version }, 'Coordinator');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(403);
  });

  it('allows Complete -> Active for an Admin', async () => {
    const complete = await makeCompleteTrip('TEST-REOPEN-4');

    const reopened = await trips.update('TEST-REOPEN-4', { status: 'Active', version: complete.version }, 'Admin');
    expect(reopened.status).toBe('Active');
    expect(reopened.allowedTransitions).toEqual(['Complete', 'Cancelled', 'Planning']);
  });
});

describe('Trip optimistic locking', () => {
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
    trips = new TripsService(prisma, audit, services);
  });

  it('rejects an update with a stale version, returning the current record and who/when it changed', async () => {
    const created = await trips.create({ tripId: 'TEST-LOCK-1', client: 'Test Client' });

    // First editor reads version 1, saves successfully.
    const firstUpdate = await trips.update('TEST-LOCK-1', {
      owner: 'First Editor', version: created.version, user: 'first-user',
    });
    expect(firstUpdate.version).toBe(created.version + 1);

    // Second editor still holds the stale version 1 -- must be rejected.
    let caught: any;
    try {
      await trips.update('TEST-LOCK-1', { owner: 'Second Editor', version: created.version, user: 'second-user' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(409);
    expect(caught.response.current.owner).toBe('First Editor');
    expect(caught.response.changedBy).toBe('first-user');
    expect(caught.response.changedAt).toBeDefined();
  });

  it('increments version on every successful update', async () => {
    const created = await trips.create({ tripId: 'TEST-LOCK-2', client: 'Test Client' });
    const updated = await trips.update('TEST-LOCK-2', { owner: 'Someone', version: created.version });
    expect(updated.version).toBe(created.version + 1);
  });
});
