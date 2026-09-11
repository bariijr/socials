import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../test/db-test-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorCapabilityService } from './vendor-capability.service';

describe('VendorCapabilityService', () => {
  let prisma: PrismaService;
  let service: VendorCapabilityService;

  beforeAll(() => {
    prisma = new PrismaService();
    service = new VendorCapabilityService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma as unknown as PrismaClient);
    await prisma.provider.create({
      data: { providerId: 'VEN-000001', name: 'Alpha Handling', serviceTypes: ['Overflight'], scopeType: 'Global', scope: 'GLOBAL' },
    });
  });

  it('creates a PENDING request with a unique 48-hex-char token expiring in the future', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);

    expect(created.status).toBe('PENDING');
    expect(created.token).toMatch(/^[0-9a-f]{48}$/);
    expect(created.tokenExpiresAtZ.getTime()).toBeGreaterThan(Date.now());
  });

  it('findAll never includes the token field', async () => {
    await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    const list = await service.findAll();

    expect(list).toHaveLength(1);
    expect((list[0] as any).token).toBeUndefined();
  });

  it('findByToken finds the matching request by its token', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    const found = await service.findByToken(created.token);

    expect(found.id).toBe(created.id);
  });

  it('findByToken throws NotFoundException for an unknown token', async () => {
    await expect(service.findByToken('does-not-exist')).rejects.toThrow('not found');
  });

  it('submit records the vendor answer and moves status to SUBMITTED, and rejects a second submit', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);

    const submitted = await service.submit(created.token, {
      contactName: 'Jane Vendor',
      contactEmail: 'jane@alphahandling.example',
      canService: true,
      vendorNotes: 'We hold a valid TCAA ground handling permit.',
    });

    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.submittedAtZ).not.toBeNull();

    await expect(
      service.submit(created.token, { contactName: 'Jane Vendor', canService: true } as any),
    ).rejects.toThrow('already been submitted');
  });

  it('submit rejects an expired token', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    await prisma.vendorCapabilityRequest.update({ where: { id: created.id }, data: { tokenExpiresAtZ: new Date(Date.now() - 1000) } });

    await expect(
      service.submit(created.token, { contactName: 'Jane Vendor', canService: true } as any),
    ).rejects.toThrow('expired');
  });

  it('submit does not leak internal Admin-only fields to the vendor-facing response', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);

    const submitted = await service.submit(created.token, {
      contactName: 'Jane Vendor',
      contactEmail: 'jane@alphahandling.example',
      canService: true,
      vendorNotes: 'We hold a valid TCAA ground handling permit.',
    });

    expect(submitted).not.toHaveProperty('reviewedBy');
    expect(submitted).not.toHaveProperty('reviewedAtZ');
    expect(submitted).not.toHaveProperty('reviewNotes');
    expect(submitted).not.toHaveProperty('createdBy');
  });

  it('approve moves a SUBMITTED request to APPROVED and records the reviewer', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    await service.submit(created.token, { contactName: 'Jane Vendor', canService: true } as any);

    const approved = await service.approve(created.id, { user: 'ops.admin' });

    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewedBy).toBe('ops.admin');
    expect(approved.reviewedAtZ).not.toBeNull();
  });

  it('reject moves a SUBMITTED request to REJECTED with review notes', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    await service.submit(created.token, { contactName: 'Jane Vendor', canService: false } as any);

    const rejected = await service.reject(created.id, { user: 'ops.admin', reviewNotes: 'Vendor confirmed they do not cover this station.' });

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reviewNotes).toContain('do not cover');
  });

  it('approve rejects a request that has not been submitted yet', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);

    await expect(service.approve(created.id, { user: 'ops.admin' })).rejects.toThrow('has not been submitted');
  });

  it('approve does not leak token to the Admin response', async () => {
    const created = await service.create({ providerId: 'VEN-000001', serviceType: 'Overflight', countryIso2: 'TZ' } as any);
    await service.submit(created.token, { contactName: 'Jane Vendor', canService: true } as any);

    const approved = await service.approve(created.id, { user: 'ops.admin' });

    expect(approved).not.toHaveProperty('token');
  });
});
