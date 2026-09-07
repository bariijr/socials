import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermitAuthorizationsService } from './permit-authorizations.service';
import { truncateAll } from '../../test/db-test-utils';

describe('PermitAuthorizationsService', () => {
  let prisma: PrismaService;
  let authorizations: PermitAuthorizationsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    authorizations = new PermitAuthorizationsService(prisma, audit);
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
  });

  it('always creates as Draft regardless of what the request body claims', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-1', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
      status: 'Verified',
    } as any);
    expect(created.status).toBe('Draft');
  });

  it('verify requires Admin role and records who verified it', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-2', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
    });
    await expect(authorizations.verify(created.id, 'Coordinator', 'someone')).rejects.toThrow(ForbiddenException);
    const verified = await authorizations.verify(created.id, 'Admin', 'admin-user');
    expect(verified.status).toBe('Verified');
    expect(verified.verifiedBy).toBe('admin-user');
  });

  it('revoke requires Admin role and does not delete the row', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-3', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
    });
    await authorizations.verify(created.id, 'Admin');
    await expect(authorizations.revoke(created.id, 'Coordinator')).rejects.toThrow(ForbiddenException);
    const revoked = await authorizations.revoke(created.id, 'Admin');
    expect(revoked.status).toBe('Revoked');
  });

  it('blocks editing once Verified', async () => {
    const created = await authorizations.create({
      operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
      referenceNumber: 'REF-4', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z',
    });
    await authorizations.verify(created.id, 'Admin');
    await expect(authorizations.update(created.id, { referenceNumber: 'REF-5' })).rejects.toThrow();
  });
});
