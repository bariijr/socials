import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Manual provider change stamps USER_SELECTED (§4)', () => {
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
    services = new ServicesService(prisma, new AuditService(prisma), new VendorResolverService(prisma));
    await prisma.trip.create({ data: { tripId: 'TEST-VENDOR-MANUAL-1', client: 'Test Client' } });
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Vendor B', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
  });

  async function makeUnresolvedService(svcId: string) {
    return prisma.service.create({
      data: {
        svcId, tripId: 'TEST-VENDOR-MANUAL-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', vendorSelectionSource: 'CHOICE_REQUIRED',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
  }

  it('a PATCH that sets providerId stamps USER_SELECTED and clears vendorAssignmentId', async () => {
    const svc = await makeUnresolvedService('TEST-VENDOR-MANUAL-1-SVC-1');
    const updated = await services.update('TEST-VENDOR-MANUAL-1-SVC-1', { providerId: 'PROV-A', version: svc.version } as any);
    expect(updated.vendorSelectionSource).toBe('USER_SELECTED');
    expect(updated.vendorAssignmentId).toBeNull();
    expect(updated.vendorSelectedAtZ).not.toBeNull();
  });

  it('a PATCH that does not touch providerId leaves the vendor fields untouched', async () => {
    const svc = await makeUnresolvedService('TEST-VENDOR-MANUAL-1-SVC-2');
    const updated = await services.update('TEST-VENDOR-MANUAL-1-SVC-2', { notes: 'unrelated edit', version: svc.version } as any);
    expect(updated.vendorSelectionSource).toBe('CHOICE_REQUIRED');
    expect(updated.vendorSelectedAtZ).toBeNull();
  });

  it('changing providerId from one vendor to another also re-stamps USER_SELECTED', async () => {
    const svc = await makeUnresolvedService('TEST-VENDOR-MANUAL-1-SVC-3');
    const first = await services.update('TEST-VENDOR-MANUAL-1-SVC-3', { providerId: 'PROV-A', version: svc.version } as any);
    const second = await services.update('TEST-VENDOR-MANUAL-1-SVC-3', { providerId: 'PROV-B', version: first.version } as any);
    expect(second.providerId).toBe('PROV-B');
    expect(second.vendorSelectionSource).toBe('USER_SELECTED');
  });
});
