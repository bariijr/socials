import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('GET vendor-candidates', () => {
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
    await prisma.trip.create({ data: { tripId: 'TEST-VENDOR-CAND-1', client: 'Test Client' } });
  });

  it('returns the live tied alternatives with provider names for a CHOICE_REQUIRED service', async () => {
    await prisma.country.create({ data: { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, centroidLat: -6.369, centroidLng: 34.889 } });
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Alpha Handling', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Beta Handling', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-B', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    const svc = await prisma.service.create({
      data: {
        svcId: 'TEST-VENDOR-CAND-1-SVC-1', tripId: 'TEST-VENDOR-CAND-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', countryIso2: 'TZ', vendorSelectionSource: 'CHOICE_REQUIRED',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
    const result = await services.vendorCandidates(svc.svcId);
    expect(result.status).toBe('CHOICE_REQUIRED');
    expect(result.alternatives.map((a) => a.providerName).sort()).toEqual(['Alpha Handling', 'Beta Handling']);
  });

  it('returns an empty alternatives list for a service with no eligible vendor', async () => {
    await prisma.country.create({ data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, centroidLat: -0.023, centroidLng: 37.906 } });
    const svc = await prisma.service.create({
      data: {
        svcId: 'TEST-VENDOR-CAND-1-SVC-2', tripId: 'TEST-VENDOR-CAND-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', countryIso2: 'KE', vendorSelectionSource: 'NO_ELIGIBLE_VENDOR',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
    const result = await services.vendorCandidates(svc.svcId);
    expect(result.alternatives).toEqual([]);
  });
});
