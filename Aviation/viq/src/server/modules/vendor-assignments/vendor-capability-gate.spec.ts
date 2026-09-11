// src/server/modules/vendor-assignments/vendor-capability-gate.spec.ts
import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { VendorResolverService } from './vendor-resolver.service';

describe('VendorResolverService capability gate', () => {
  let prisma: PrismaService;
  let resolver: VendorResolverService;

  beforeAll(() => {
    prisma = new PrismaService();
    resolver = new VendorResolverService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma as unknown as PrismaClient);
  });

  it('a provider with no capability request at all resolves exactly as before (unaffected)', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('VEN-A');
  });

  it('a provider with a PENDING (unapproved) capability request for this exact context is excluded', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'TZ', token: 'a'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'PENDING' },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('a provider with an APPROVED capability request for this exact context remains eligible', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'TZ', token: 'b'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'APPROVED' },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('VEN-A');
  });

  it('a capability request for a DIFFERENT country does not affect this context', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'KE', token: 'c'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'PENDING' },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('VEN-A');
  });

  it('eligiblePool also excludes a REJECTED provider for this exact context', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.provider.create({ data: { providerId: 'VEN-B', name: 'Beta', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-B', serviceType: 'Overflight', preferred: true, rank: 2 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'TZ', token: 'd'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'REJECTED' },
    });

    const pool = await resolver.eligiblePool({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(pool.map((p) => p.vendorId)).toEqual(['VEN-B']);
  });

  it('excludes a provider when called with the actual production call shape (icao: "" rather than omitted)', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'Overflight', countryIso2: 'TZ', token: 'e'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'PENDING' },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ', icao: '' });

    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('a stale REJECTED row followed by a newer APPROVED row for the same tuple resolves successfully (newest row wins)', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: {
        providerId: 'VEN-A',
        serviceType: 'Overflight',
        countryIso2: 'TZ',
        token: 'f'.repeat(48),
        tokenExpiresAtZ: new Date(Date.now() + 86400000),
        status: 'REJECTED',
        createdAtZ: new Date(Date.now() - 86400000),
      },
    });
    await prisma.vendorCapabilityRequest.create({
      data: {
        providerId: 'VEN-A',
        serviceType: 'Overflight',
        countryIso2: 'TZ',
        token: 'g'.repeat(48),
        tokenExpiresAtZ: new Date(Date.now() + 86400000),
        status: 'APPROVED',
        createdAtZ: new Date(),
      },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('RESOLVED');
    expect(result.selectedVendorId).toBe('VEN-A');
  });

  it('a stale APPROVED row followed by a newer PENDING row for the same tuple blocks the provider (newest row wins, other direction)', async () => {
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'Overflight', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: {
        providerId: 'VEN-A',
        serviceType: 'Overflight',
        countryIso2: 'TZ',
        token: 'h'.repeat(48),
        tokenExpiresAtZ: new Date(Date.now() + 86400000),
        status: 'APPROVED',
        createdAtZ: new Date(Date.now() - 86400000),
      },
    });
    await prisma.vendorCapabilityRequest.create({
      data: {
        providerId: 'VEN-A',
        serviceType: 'Overflight',
        countryIso2: 'TZ',
        token: 'i'.repeat(48),
        tokenExpiresAtZ: new Date(Date.now() + 86400000),
        status: 'PENDING',
        createdAtZ: new Date(),
      },
    });

    const result = await resolver.resolve({ serviceType: 'Overflight', countryIso2: 'TZ' });

    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  // Final-review finding C1: GroundHandling/Permit contexts ALWAYS carry BOTH
  // countryIso2 and icao (they're airport-scoped services at an airport that
  // lives in a country), while an Admin-created capability request is scoped
  // to EITHER a country OR an airport, never both. Exact-tuple matching made
  // the gate inert for exactly those two service types. The two tests below
  // lock in scope-compatible matching: a NULL field on the stored row matches
  // any context value at that level; a non-NULL field must match exactly.
  it('a COUNTRY-scoped PENDING row blocks a context that supplies both a country and a specific airport', async () => {
    await prisma.country.create({ data: { iso2: 'TZ', name: 'Tanzania', centroidLat: -6.37, centroidLng: 34.89 } });
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['GroundHandling'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'GroundHandling', countryIso2: 'TZ', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'GroundHandling', countryIso2: 'TZ', icao: null, token: 'j'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'PENDING' },
    });

    const result = await resolver.resolve({ serviceType: 'GroundHandling', countryIso2: 'TZ', icao: 'HTDA' });

    expect(result.status).toBe('NO_ELIGIBLE_VENDOR');
  });

  it('an AIRPORT-scoped PENDING row does not block a different airport in the same country', async () => {
    await prisma.country.create({ data: { iso2: 'TZ', name: 'Tanzania', centroidLat: -6.37, centroidLng: 34.89 } });
    await prisma.provider.create({ data: { providerId: 'VEN-A', name: 'Alpha', serviceTypes: ['GroundHandling'], scopeType: 'Global', scope: 'GLOBAL' } });
    await prisma.vendorAssignment.create({ data: { providerId: 'VEN-A', serviceType: 'GroundHandling', countryIso2: 'TZ', preferred: true, rank: 1 } });
    await prisma.vendorCapabilityRequest.create({
      data: { providerId: 'VEN-A', serviceType: 'GroundHandling', countryIso2: null, icao: 'HTDA', token: 'k'.repeat(48), tokenExpiresAtZ: new Date(Date.now() + 86400000), status: 'PENDING' },
    });

    // The blocked airport is still blocked...
    const blocked = await resolver.resolve({ serviceType: 'GroundHandling', countryIso2: 'TZ', icao: 'HTDA' });
    expect(blocked.status).toBe('NO_ELIGIBLE_VENDOR');

    // ...but a sibling airport in the same country resolves normally.
    const sibling = await resolver.resolve({ serviceType: 'GroundHandling', countryIso2: 'TZ', icao: 'FALA' });
    expect(sibling.status).toBe('RESOLVED');
    expect(sibling.selectedVendorId).toBe('VEN-A');
  });
});
