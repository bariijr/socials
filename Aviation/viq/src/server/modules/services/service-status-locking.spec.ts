import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Service version defaults', () => {
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

  it('defaults a new Service to version 1 with null status-change tracking', async () => {
    await prisma.trip.create({ data: { tripId: 'TEST-SVC-VERSION-1', client: 'Test Client' } });
    const svc = await prisma.service.create({
      data: {
        svcId: 'TEST-SVC-VERSION-1-SVC-1', tripId: 'TEST-SVC-VERSION-1',
        scopeType: 'TRIP', scopeId: 'TEST-SVC-VERSION-1', serviceType: 'Overflight',
        basedOnEtdZ: new Date(), requiredByZ: new Date(),
      },
    });
    expect(svc.version).toBe(1);
    expect(svc.statusChangedAt).toBeNull();
    expect(svc.statusChangedBy).toBeNull();
  });
});

describe('Service status transitions', () => {
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
    services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
    await prisma.trip.create({ data: { tripId: 'TEST-SVC-TRANS-1', client: 'Test Client' } });
  });

  async function makeService(svcId: string) {
    return services.create({
      svcId, tripId: 'TEST-SVC-TRANS-1', scopeType: 'TRIP', scopeId: 'TEST-SVC-TRANS-1',
      serviceType: 'Overflight', basedOnEtdZ: '2026-10-01T06:00:00.000Z', requiredByZ: '2026-10-01T04:00:00.000Z',
    });
  }

  it('allows Not Started -> Requested and reports it in allowedTransitions before and after', async () => {
    const created = await makeService('TEST-SVC-TRANS-1-SVC-1');
    expect(created.allowedTransitions).toEqual(['Requested', 'Submission Pending', 'Not Required', 'Cancelled']);

    const updated = await services.update(created.svcId, { status: 'Requested', version: created.version });
    expect(updated.status).toBe('Requested');
    expect(updated.allowedTransitions).toEqual(['Chasing', 'Confirmed', 'Not Required', 'Cancelled']);
  });

  it('rejects an undefined transition (Not Started -> Confirmed) with a 400', async () => {
    const created = await makeService('TEST-SVC-TRANS-2-SVC-1');
    await expect(
      services.update(created.svcId, { status: 'Confirmed', version: created.version }),
    ).rejects.toThrow();
  });

  it('allows the Cancel escape hatch from Confirmed', async () => {
    const created = await makeService('TEST-SVC-TRANS-3-SVC-1');
    const requested = await services.update(created.svcId, { status: 'Requested', version: created.version });
    const confirmed = await services.update(created.svcId, { status: 'Confirmed', version: requested.version });
    const cancelled = await services.update(created.svcId, { status: 'Cancelled', version: confirmed.version });
    expect(cancelled.status).toBe('Cancelled');
  });

  it('sets statusChangedAt/By on a status change', async () => {
    const created = await makeService('TEST-SVC-TRANS-4-SVC-1');
    expect(created.statusChangedAt).toBeNull();
    const updated = await services.update(created.svcId, {
      status: 'Requested', version: created.version, user: 'coordinator1',
    });
    expect(updated.statusChangedAt).not.toBeNull();
    expect(updated.statusChangedBy).toBe('coordinator1');
  });
});

describe('Service optimistic locking', () => {
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
    services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
    await prisma.trip.create({ data: { tripId: 'TEST-SVC-LOCK-1', client: 'Test Client' } });
  });

  it('rejects an update with a stale version, returning the current record and who/when it changed', async () => {
    const created = await services.create({
      svcId: 'TEST-SVC-LOCK-1-SVC-1', tripId: 'TEST-SVC-LOCK-1', scopeType: 'TRIP', scopeId: 'TEST-SVC-LOCK-1',
      serviceType: 'Overflight', basedOnEtdZ: '2026-10-01T06:00:00.000Z', requiredByZ: '2026-10-01T04:00:00.000Z',
    });

    const firstUpdate = await services.update(created.svcId, {
      assignedTo: 'First Editor', version: created.version, user: 'first-user',
    });
    expect(firstUpdate.version).toBe(created.version + 1);

    let caught: any;
    try {
      await services.update(created.svcId, { assignedTo: 'Second Editor', version: created.version, user: 'second-user' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(409);
    expect(caught.response.current.assignedTo).toBe('First Editor');
    expect(caught.response.changedBy).toBe('first-user');
  });
});

// Real Postgres-backed persistence of the two new statuses through the
// existing services.update() PATCH path -- covering the gap a pure
// transition-graph unit test (statusTransitions.spec.ts) can't: if
// SERVICE_STATUSES in create-service.dto.ts didn't actually include
// 'Submission Pending' / 'Submission Failed', these calls would 400 on the
// DTO's @IsIn validator even though the graph-function tests stay green.
describe('Submission Pending / Submission Failed persistence', () => {
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
    services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
    await prisma.trip.create({ data: { tripId: 'TEST-SVC-SUBMIT-1', client: 'Test Client' } });
  });

  async function makeService(svcId: string) {
    return services.create({
      svcId, tripId: 'TEST-SVC-SUBMIT-1', scopeType: 'TRIP', scopeId: 'TEST-SVC-SUBMIT-1',
      serviceType: 'Overflight', basedOnEtdZ: '2026-10-01T06:00:00.000Z', requiredByZ: '2026-10-01T04:00:00.000Z',
    });
  }

  it('persists Not Started -> Submission Pending -> Requested', async () => {
    const created = await makeService('TEST-SVC-SUBMIT-1-SVC-1');

    const pending = await services.update(created.svcId, { status: 'Submission Pending', version: created.version });
    expect(pending.status).toBe('Submission Pending');
    expect(pending.allowedTransitions).toEqual(['Requested', 'Submission Failed']);

    const requested = await services.update(created.svcId, { status: 'Requested', version: pending.version });
    expect(requested.status).toBe('Requested');
  });

  it('persists Not Started -> Submission Pending -> Submission Failed', async () => {
    const created = await makeService('TEST-SVC-SUBMIT-2-SVC-1');

    const pending = await services.update(created.svcId, { status: 'Submission Pending', version: created.version });
    expect(pending.status).toBe('Submission Pending');

    const failed = await services.update(created.svcId, { status: 'Submission Failed', version: pending.version });
    expect(failed.status).toBe('Submission Failed');
    expect(failed.allowedTransitions).toEqual(['Submission Pending', 'Not Started', 'Not Required', 'Cancelled']);
  });
});
