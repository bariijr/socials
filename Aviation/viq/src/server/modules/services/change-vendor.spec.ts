import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ServicesService } from './services.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { AuditService } from '../audit/audit.service';
import { truncateAll } from '../../test/db-test-utils';

describe('ServicesService.changeVendor', () => {
  let prisma: PrismaService;
  let services: ServicesService;

  beforeAll(() => {
    prisma = new PrismaService();
    const audit = new AuditService(prisma);
    services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  async function seed(status: string) {
    const providerA = await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] } });
    const providerB = await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Vendor B', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Overflight'] } });
    const trip = await prisma.trip.create({ data: { tripId: 'TRIP-CV-1', registration: 'N1', client: 'Client', operator: 'Op', status: 'Active' } });
    const svc = await prisma.service.create({
      data: {
        svcId: 'SVC-CV-1', tripId: trip.tripId, scopeType: 'LEG', scopeId: 'LEG-1',
        serviceType: 'Overflight', providerId: providerA.providerId, status,
        countryIso2: 'TZ', basedOnEtdZ: new Date(), requiredByZ: new Date(), version: 1,
      },
    });
    return { providerA, providerB, svc };
  }

  it('rejects when the current status is not in the allowed set', async () => {
    const { svc, providerB } = await seed('Submission Pending');
    await expect(
      services.changeVendor(svc.svcId, { toProviderId: providerB.providerId, reason: 'No Response', cancellationCommId: 'COMM-1', version: 1 }, 'tester'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-eligible replacement vendor for a non-Admin caller', async () => {
    const { svc } = await seed('Requested');
    const ineligible = await prisma.provider.create({ data: { providerId: 'PROV-X', name: 'Ineligible', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Fuel'] } });
    await expect(
      services.changeVendor(svc.svcId, { toProviderId: ineligible.providerId, reason: 'Other', cancellationCommId: 'COMM-1', version: 1 }, 'tester', 'Coordinator'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an Admin to override into a non-eligible replacement vendor', async () => {
    const { svc } = await seed('Requested');
    const ineligible = await prisma.provider.create({ data: { providerId: 'PROV-Y', name: 'Override Target', scopeType: 'Global', scope: 'GLOBAL', serviceTypes: ['Fuel'] } });
    const result = await services.changeVendor(svc.svcId, { toProviderId: ineligible.providerId, reason: 'Other', cancellationCommId: 'COMM-1', version: 1 }, 'tester', 'Admin');
    expect((result as any).ProviderID ?? (result as any).providerId).toBe(ineligible.providerId);
  });

  it('writes a VendorChangeLog row and resets status to Submission Pending on success', async () => {
    const { svc, providerA, providerB } = await seed('Requested');
    await services.changeVendor(svc.svcId, { toProviderId: providerB.providerId, reason: 'No Response', notes: 'Twice, no reply.', cancellationCommId: 'COMM-1', version: 1 }, 'tester', 'Admin');

    const updated = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
    expect(updated?.providerId).toBe(providerB.providerId);
    expect(updated?.status).toBe('Submission Pending');
    expect(updated?.vendorSelectionSource).toBe('USER_SELECTED');
    expect(updated?.version).toBe(2);

    const logs = await prisma.vendorChangeLog.findMany({ where: { svcId: svc.svcId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].fromProviderId).toBe(providerA.providerId);
    expect(logs[0].toProviderId).toBe(providerB.providerId);
    expect(logs[0].reason).toBe('No Response');
    expect(logs[0].cancellationCommId).toBe('COMM-1');
  });

  it('409s on a stale version', async () => {
    const { svc, providerB } = await seed('Requested');
    await expect(
      services.changeVendor(svc.svcId, { toProviderId: providerB.providerId, reason: 'Other', cancellationCommId: 'COMM-1', version: 999 }, 'tester', 'Admin'),
    ).rejects.toThrow();
  });
});
