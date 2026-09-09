import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../src/server/test/db-test-utils';
import { backfillVendorAssignmentsFromProviders } from './backfill-vendor-assignments-from-providers';

describe('backfillVendorAssignmentsFromProviders', () => {
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

  it('creates one VendorAssignment per (provider x serviceType), mapping scopeType to countryIso2/icao correctly', async () => {
    await prisma.country.create({ data: { iso2: 'TZ', name: 'Tanzania', centroidLat: -6.37, centroidLng: 34.89 } });
    await prisma.airport.create({ data: { icao: 'HTDA', name: 'Dodoma Airport', countryIso2: 'TZ', latitude: -6.17, longitude: 35.75 } });

    await prisma.provider.create({
      data: { providerId: 'PROV-ICAO', name: 'Airport Vendor', serviceTypes: ['Permit', 'GroundHandling'], scopeType: 'ICAO', scope: 'HTDA' },
    });
    await prisma.provider.create({
      data: { providerId: 'PROV-COUNTRY', name: 'Country Vendor', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'TZ' },
    });
    await prisma.provider.create({
      data: { providerId: 'PROV-GLOBAL', name: 'Global Vendor', serviceTypes: ['Overflight', 'Permit'], scopeType: 'Global', scope: 'GLOBAL' },
    });

    const summary = await backfillVendorAssignmentsFromProviders(prisma);

    expect(summary.find((r) => r.providerId === 'PROV-ICAO')).toEqual({ providerId: 'PROV-ICAO', created: 2, skipped: 0 });
    expect(summary.find((r) => r.providerId === 'PROV-COUNTRY')).toEqual({ providerId: 'PROV-COUNTRY', created: 1, skipped: 0 });
    expect(summary.find((r) => r.providerId === 'PROV-GLOBAL')).toEqual({ providerId: 'PROV-GLOBAL', created: 2, skipped: 0 });

    const rows = await prisma.vendorAssignment.findMany();
    expect(rows).toHaveLength(5);

    const icaoRows = rows.filter((r) => r.providerId === 'PROV-ICAO');
    expect(icaoRows).toHaveLength(2);
    expect(icaoRows.every((r) => r.icao === 'HTDA' && r.countryIso2 === null)).toBe(true);

    const countryRows = rows.filter((r) => r.providerId === 'PROV-COUNTRY');
    expect(countryRows).toHaveLength(1);
    expect(countryRows.every((r) => r.countryIso2 === 'TZ' && r.icao === null)).toBe(true);

    const globalRows = rows.filter((r) => r.providerId === 'PROV-GLOBAL');
    expect(globalRows).toHaveLength(2);
    expect(globalRows.every((r) => r.countryIso2 === null && r.icao === null)).toBe(true);

    expect(rows.every((r) => r.rank === 1 && r.preferred === false && r.active === true && r.createdBy === 'SYSTEM_BACKFILL')).toBe(true);
  });

  it('is idempotent -- re-running skips combos that already have a matching VendorAssignment row', async () => {
    await prisma.provider.create({
      data: { providerId: 'PROV-GLOBAL', name: 'Global Vendor', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' },
    });

    const first = await backfillVendorAssignmentsFromProviders(prisma);
    expect(first).toEqual([{ providerId: 'PROV-GLOBAL', created: 1, skipped: 0 }]);

    const second = await backfillVendorAssignmentsFromProviders(prisma);
    expect(second).toEqual([{ providerId: 'PROV-GLOBAL', created: 0, skipped: 1 }]);

    const rows = await prisma.vendorAssignment.findMany({ where: { providerId: 'PROV-GLOBAL' } });
    expect(rows).toHaveLength(1);
  });

  it('two different providers landing on the identical context creates two rows (a genuine tie), not a dedup', async () => {
    await prisma.country.create({ data: { iso2: 'KE', name: 'Kenya', centroidLat: -0.023, centroidLng: 37.906 } });
    await prisma.provider.create({ data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'KE' } });
    await prisma.provider.create({ data: { providerId: 'PROV-B', name: 'Vendor B', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'KE' } });

    await backfillVendorAssignmentsFromProviders(prisma);

    const rows = await prisma.vendorAssignment.findMany({ where: { countryIso2: 'KE', serviceType: 'Overflight' } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.providerId).sort()).toEqual(['PROV-A', 'PROV-B']);
  });
});
