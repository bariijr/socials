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
});
