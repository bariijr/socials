import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { truncateAll } from '../../test/db-test-utils';

describe('VendorAssignmentsService', () => {
  let prisma: PrismaService;
  let assignments: VendorAssignmentsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    assignments = new VendorAssignmentsService(prisma, new AuditService(prisma));
    await prisma.country.create({
      data: { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -6.37, centroidLng: 34.89 },
    });
    await prisma.client.create({ data: { clientId: 'CLI-1', name: 'Test Client' } });
    await prisma.provider.create({
      data: { providerId: 'PROV-A', name: 'Vendor A', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'TZ' },
    });
    await prisma.provider.create({
      data: { providerId: 'PROV-B', name: 'Vendor B', serviceTypes: ['Overflight'], scopeType: 'Country', scope: 'TZ' },
    });
  });

  it('creates a valid assignment', async () => {
    const row = await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1 } as any);
    expect(row.rank).toBe(1);
    expect(row.prohibited).toBe(false);
  });

  it('rejects preferred + prohibited on the same row', async () => {
    await expect(
      assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', preferred: true, prohibited: true } as any),
    ).rejects.toThrow();
  });

  it('rejects a non-prohibited row with no rank', async () => {
    await expect(
      assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ' } as any),
    ).rejects.toThrow();
  });

  it('allows a prohibited row with no rank, and forces rank to null even if one is sent', async () => {
    const row = await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', clientId: 'CLI-1', prohibited: true, rank: 99 } as any);
    expect(row.rank).toBeNull();
    expect(row.prohibited).toBe(true);
  });

  it('rejects an identical duplicate (same provider + context)', async () => {
    await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1 } as any);
    await expect(
      assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 2 } as any),
    ).rejects.toThrow();
  });

  it('allows two different providers at the same rank for the same context (tied preference)', async () => {
    await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1, preferred: true } as any);
    const row = await assignments.create({ providerId: 'PROV-B', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1, preferred: true } as any);
    expect(row.rank).toBe(1);
  });

  it('update() re-validates preferred/prohibited/rank together', async () => {
    const created = await assignments.create({ providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1 } as any);
    await expect(assignments.update(created.id, { prohibited: true, preferred: true } as any)).rejects.toThrow();
    const updated = await assignments.update(created.id, { prohibited: true } as any);
    expect(updated.rank).toBeNull();
  });

  it('rejects create() with effectiveFrom after effectiveUntil', async () => {
    await expect(
      assignments.create({
        providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1,
        effectiveFrom: '2026-06-01T00:00:00.000Z', effectiveUntil: '2026-01-01T00:00:00.000Z',
      } as any),
    ).rejects.toThrow();
  });

  it('rejects update() when the merged before+patch window has effectiveFrom after effectiveUntil', async () => {
    const created = await assignments.create({
      providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1,
      effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveUntil: '2026-12-31T00:00:00.000Z',
    } as any);
    await expect(
      assignments.update(created.id, { effectiveFrom: '2027-06-01T00:00:00.000Z' } as any),
    ).rejects.toThrow();
  });

  it('rejects create() with a providerId that does not exist (FK violation -> 400, not 500)', async () => {
    await expect(
      assignments.create({ providerId: 'PROV-DOES-NOT-EXIST', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1 } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows update() to clear effectiveUntil to null while effectiveFrom remains a real, later date', async () => {
    const created = await assignments.create({
      providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1,
      effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveUntil: '2026-12-31T00:00:00.000Z',
    } as any);
    const updated = await assignments.update(created.id, { effectiveUntil: null } as any);
    expect(updated.effectiveUntil).toBeNull();
    expect(updated.effectiveFrom).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('allows update() to clear effectiveFrom to null while effectiveUntil remains set, and persists null (not epoch)', async () => {
    const created = await assignments.create({
      providerId: 'PROV-A', serviceType: 'Overflight', countryIso2: 'TZ', rank: 1,
      effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveUntil: '2026-12-31T00:00:00.000Z',
    } as any);
    const updated = await assignments.update(created.id, { effectiveFrom: null } as any);
    expect(updated.effectiveFrom).toBeNull();
    expect(updated.effectiveUntil).toEqual(new Date('2026-12-31T00:00:00.000Z'));
  });
});
