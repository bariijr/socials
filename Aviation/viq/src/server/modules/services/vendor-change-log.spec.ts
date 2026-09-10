import { PrismaService } from '../../prisma/prisma.service';
import { truncateAll } from '../../test/db-test-utils';

describe('VendorChangeLog model', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('creates and reads back a VendorChangeLog row scoped to a Service', async () => {
    const providerA = await prisma.provider.create({
      data: { providerId: 'PROV-A', name: 'Vendor A', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] },
    });
    const providerB = await prisma.provider.create({
      data: { providerId: 'PROV-B', name: 'Vendor B', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] },
    });
    const trip = await prisma.trip.create({
      data: { tripId: 'TRIP-VCL-1', registration: 'N1', client: 'Client', operator: 'Op', status: 'Active' },
    });
    const svc = await prisma.service.create({
      data: {
        svcId: 'SVC-VCL-1', tripId: trip.tripId, scopeType: 'LEG', scopeId: 'LEG-1',
        serviceType: 'Overflight', providerId: providerA.providerId, status: 'Requested',
        basedOnEtdZ: new Date(), requiredByZ: new Date(),
      },
    });

    const log = await prisma.vendorChangeLog.create({
      data: {
        svcId: svc.svcId,
        fromProviderId: providerA.providerId,
        toProviderId: providerB.providerId,
        reason: 'No Response',
        notes: 'Tried twice, no reply.',
        changedBy: 'tester',
      },
    });

    const found = await prisma.vendorChangeLog.findMany({ where: { svcId: svc.svcId } });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(log.id);
    expect(found[0].fromProviderId).toBe('PROV-A');
    expect(found[0].toProviderId).toBe('PROV-B');
    expect(found[0].reason).toBe('No Response');
  });

  it('cascades delete when the Service is deleted', async () => {
    const provider = await prisma.provider.create({
      data: { providerId: 'PROV-C', name: 'Vendor C', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] },
    });
    const trip = await prisma.trip.create({
      data: { tripId: 'TRIP-VCL-2', registration: 'N2', client: 'Client', operator: 'Op', status: 'Active' },
    });
    const svc = await prisma.service.create({
      data: {
        svcId: 'SVC-VCL-2', tripId: trip.tripId, scopeType: 'LEG', scopeId: 'LEG-2',
        serviceType: 'Overflight', providerId: provider.providerId, status: 'Requested',
        basedOnEtdZ: new Date(), requiredByZ: new Date(),
      },
    });
    await prisma.vendorChangeLog.create({
      data: { svcId: svc.svcId, fromProviderId: provider.providerId, toProviderId: provider.providerId, reason: 'Other', changedBy: 'tester' },
    });

    await prisma.service.delete({ where: { svcId: svc.svcId } });

    const found = await prisma.vendorChangeLog.findMany({ where: { svcId: svc.svcId } });
    expect(found).toHaveLength(0);
  });
});
