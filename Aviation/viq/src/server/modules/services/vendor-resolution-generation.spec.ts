import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Vendor resolution wired into live generation', () => {
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
    const resolver = new VendorResolverService(prisma);
    services = new ServicesService(prisma, audit, resolver);
    await prisma.country.create({
      data: { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -6.37, centroidLng: 34.89 },
    });
    await prisma.trip.create({ data: { tripId: 'TEST-VENDOR-GEN-1', client: 'Test Client' } });
  });

  async function makeLeg(legId: string, depIcao: string, arrIcao: string) {
    return prisma.leg.create({
      data: {
        legId, tripId: 'TEST-VENDOR-GEN-1', seq: 1, depIcao, arrIcao,
        etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 3, paxCount: 2, crewCount: 2, countriesOverflown: ['TZ'],
      },
    });
  }

  it('a RESOLVED context stamps providerId, vendorSelectionSource, vendorAssignmentId, vendorSelectedAtZ', async () => {
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    const assignment = await prisma.vendorAssignment.create({
      data: { providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1 },
    });
    await makeLeg('TEST-VENDOR-GEN-1-LEG-1', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-1');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBe('PROV-A');
    expect(created[0].vendorSelectionSource).toBe('COUNTRY_DEFAULT');
    expect(created[0].vendorAssignmentId).toBe(assignment.id);
    expect(created[0].vendorSelectedAtZ).not.toBeNull();
  });

  it('a CHOICE_REQUIRED context creates the service with providerId null and the literal marker', async () => {
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Vendor B', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    await prisma.vendorAssignment.create({ data: { providerId: 'PROV-B', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1, preferred: true } });
    await makeLeg('TEST-VENDOR-GEN-1-LEG-2', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-2');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBeNull();
    expect(created[0].vendorSelectionSource).toBe('CHOICE_REQUIRED');
    expect(created[0].vendorAssignmentId).toBeNull();
  });

  it('a NO_ELIGIBLE_VENDOR context creates the service with providerId null and the literal marker', async () => {
    await makeLeg('TEST-VENDOR-GEN-1-LEG-3', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-3');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBeNull();
    expect(created[0].vendorSelectionSource).toBe('NO_ELIGIBLE_VENDOR');
  });

  // Fix 3: Overflight generation now resolves with icao: '' (not the leg's
  // departure ICAO), matching what vendorCandidates() does for a service
  // with no persisted icao. An airport-scoped VendorAssignment must NOT be
  // matched here, while a country-scoped (or global) one still is.
  it('an airport-scoped VendorAssignment is not matched during Overflight generation (icao-less by design)', async () => {
    await prisma.airport.create({
      data: { icao: 'HTDA', name: 'Dodoma Airport', countryIso2: 'TZ', latitude: -6.17, longitude: 35.75 },
    });
    await prisma.provider.create({ data: { providerId: 'PROV-AIRPORT', name: 'Airport Vendor', serviceTypes: ['Overflight'], scopeType: 'ICAO', scope: 'HTDA' } });
    await prisma.vendorAssignment.create({
      data: { providerId: 'PROV-AIRPORT', icao: 'HTDA', serviceType: 'Overflight', rank: 1 },
    });
    await makeLeg('TEST-VENDOR-GEN-1-LEG-4', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-4');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBeNull();
    expect(created[0].vendorSelectionSource).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('a country-scoped VendorAssignment is still matched during Overflight generation', async () => {
    await prisma.provider.create({ data: { providerId: 'PROV-COUNTRY', name: 'Country Vendor', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'TZ' } });
    await prisma.vendorAssignment.create({
      data: { providerId: 'PROV-COUNTRY', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1 },
    });
    await makeLeg('TEST-VENDOR-GEN-1-LEG-5', 'HTDA', 'FALA');
    const created = await services.generateOverflightServices('TEST-VENDOR-GEN-1-LEG-5');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBe('PROV-COUNTRY');
    expect(created[0].vendorSelectionSource).toBe('COUNTRY_DEFAULT');
  });
});
