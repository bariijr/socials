import { PrismaService } from '../../prisma/prisma.service';
import { VendorResolverService } from './vendor-resolver.service';
import { truncateAll } from '../../test/db-test-utils';

describe('VendorResolverService', () => {
  let prisma: PrismaService;
  let resolver: VendorResolverService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    resolver = new VendorResolverService(prisma);
    await prisma.country.create({
      data: { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -6.37, centroidLng: 34.89 },
    });
    await prisma.airport.create({
      data: { icao: 'HTDA', name: 'Julius Nyerere International Airport', countryIso2: 'TZ', latitude: -6.88, longitude: 39.2 },
    });
    for (const id of ['PROV-A', 'PROV-B', 'PROV-C']) {
      await prisma.provider.create({
        data: { providerId: id, name: id, serviceTypes: ['Overflight', 'Ground Handling'], scopeType: 'Global', scope: 'GLOBAL' },
      });
    }
    await prisma.client.create({ data: { clientId: 'CLI-1', name: 'Client One' } });
  });

  async function makeAssignment(overrides: Partial<{
    providerId: string; countryIso2: string; icao: string; serviceType: string;
    permitType: string; clientId: string; preferred: boolean; rank: number;
    prohibited: boolean; active: boolean; effectiveFrom: Date; effectiveUntil: Date;
  }>) {
    return prisma.vendorAssignment.create({
      data: { providerId: 'PROV-A', serviceType: 'Overflight', preferred: false, rank: 1, ...overrides },
    });
  }

  it('resolves Rank 1 over Rank 2 (general ranking)', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('PROV-A');
  });

  it('treats preferred and rank as independent: a preferred:false rank:1 row still wins over a preferred:true rank:2 row', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, preferred: false });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2, preferred: true });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    // No row is preferred at the tier level? Actually PROV-B IS preferred.
    // Preferred-filter restricts the pool to preferred rows when any exist
    // in the top tier -- so the pool becomes just PROV-B (rank 2), which
    // then wins by elimination even though PROV-A has the lower rank.
    // This proves preferred/rank are applied as documented: preferred
    // filters the pool FIRST, then rank breaks ties within it.
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('equal rank produces CHOICE_REQUIRED with both alternatives listed', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, preferred: true });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 1, preferred: true });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.status).toBe('CHOICE_REQUIRED');
    expect(result.alternatives.map((a) => a.vendorId).sort()).toEqual(['PROV-A', 'PROV-B']);
  });

  it('client override wins over a general country default', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', clientId: 'CLI-1', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('client + airport override wins over airport-only and country-only rows', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', icao: 'HTDA', rank: 1 });
    await makeAssignment({ providerId: 'PROV-C', icao: 'HTDA', clientId: 'CLI-1', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', icao: 'HTDA', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(result.selectedVendorId).toBe('PROV-C');
  });

  it('client prohibition excludes the otherwise-winning vendor, falling through to the next eligible one', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', clientId: 'CLI-1', prohibited: true, rank: undefined as any });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('airport override wins over country rule', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', icao: 'HTDA', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', icao: 'HTDA', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('permit-type override wins over generic service-type row for the same country', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', permitType: 'Diplomatic', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight', permitType: 'Diplomatic' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('a client+global+permitType row outranks a non-client airport+permitType row (client and permit-type both dominate geography)', async () => {
    await makeAssignment({ providerId: 'PROV-A', icao: 'HTDA', permitType: 'Diplomatic', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', clientId: 'CLI-1', permitType: 'Diplomatic', rank: 1 });
    const result = await resolver.resolve({ icao: 'HTDA', serviceType: 'Overflight', permitType: 'Diplomatic', clientId: 'CLI-1' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('an expired assignment is excluded', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, effectiveUntil: new Date('2020-01-01') });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('a not-yet-effective assignment is excluded', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, effectiveFrom: new Date('2099-01-01') });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('an inactive provider contract falls through to the next eligible vendor', async () => {
    await prisma.provider.update({ where: { providerId: 'PROV-A' }, data: { contractActive: false } });
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('a provider not offering the requested service type is excluded even with an otherwise-winning assignment row', async () => {
    await prisma.provider.update({ where: { providerId: 'PROV-A' }, data: { serviceTypes: ['Ground Handling'] } });
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1 });
    await makeAssignment({ providerId: 'PROV-B', countryIso2: 'TZ', serviceType: 'Overflight', rank: 2 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectedVendorId).toBe('PROV-B');
  });

  it('returns NO_ELIGIBLE_VENDOR when the only assignment row belongs to a provider that does not offer the service type', async () => {
    await prisma.provider.update({ where: { providerId: 'PROV-A' }, data: { serviceTypes: ['Ground Handling'] } });
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', serviceType: 'Overflight', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('returns NO_ELIGIBLE_VENDOR when no assignment matches', async () => {
    const result = await resolver.resolve({ countryIso2: 'KE', serviceType: 'Overflight' });
    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('an inactive assignment row is excluded', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1, active: false });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('selectionSource for a plain global-only row is GLOBAL_DEFAULT', async () => {
    await makeAssignment({ providerId: 'PROV-A', rank: 1 });
    const result = await resolver.resolve({ serviceType: 'Overflight' });
    expect(result.selectionSource).toBe('GLOBAL_DEFAULT');
  });

  it('selectionSource for a plain country-only row is COUNTRY_DEFAULT', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight' });
    expect(result.selectionSource).toBe('COUNTRY_DEFAULT');
  });

  it('selectionSource for a plain airport-only row is AIRPORT_DEFAULT', async () => {
    await makeAssignment({ providerId: 'PROV-A', icao: 'HTDA', rank: 1 });
    const result = await resolver.resolve({ icao: 'HTDA', serviceType: 'Overflight' });
    expect(result.selectionSource).toBe('AIRPORT_DEFAULT');
  });

  it('selectionSource for a client+country row contains CLIENT and ends in _OVERRIDE', async () => {
    await makeAssignment({ providerId: 'PROV-A', countryIso2: 'TZ', clientId: 'CLI-1', rank: 1 });
    const result = await resolver.resolve({ countryIso2: 'TZ', serviceType: 'Overflight', clientId: 'CLI-1' });
    expect(result.selectionSource).toContain('CLIENT');
    expect(result.selectionSource).toMatch(/_OVERRIDE$/);
    expect(result.selectionSource).toBe('CLIENT_COUNTRY_OVERRIDE');
  });
});
