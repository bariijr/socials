import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Manual retroactive authorization link', () => {
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
    services = new ServicesService(prisma, audit, new VendorResolverService(prisma));
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({ data: { registration: 'N1TEST', icaoType: 'GLF6', currentOperatorId: 'OP-1' } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
    // Seeded for the "different country" rejection test, which links an
    // authorization scoped to TZ — the country FK requires the row to exist.
    await prisma.country.create({
      data: { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -6.4, centroidLng: 34.9 },
    });
    await prisma.trip.create({ data: { tripId: 'TEST-LINK-1', client: 'Test Client', registration: 'N1TEST' } });
    await prisma.service.create({
      data: {
        svcId: 'TEST-LINK-1-SVC-1', tripId: 'TEST-LINK-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
  });

  it('links a matching Verified authorization and pre-confirms the service', async () => {
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const linked = await services.linkAuthorization('TEST-LINK-1-SVC-1', auth.id, 1, 'coordinator');
    expect(linked.status).toBe('Confirmed');
    expect(linked.authorizationId).toBe(auth.id);
    expect(linked.refNumber).toBe('REF-1');
  });

  it('rejects linking an authorization for a different country', async () => {
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'TZ', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-2', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    await expect(services.linkAuthorization('TEST-LINK-1-SVC-1', auth.id, 1, 'coordinator')).rejects.toThrow(BadRequestException);
  });

  it('rejects linking with a stale version and does not mutate the service', async () => {
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-5', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    await expect(services.linkAuthorization('TEST-LINK-1-SVC-1', auth.id, 99, 'coordinator')).rejects.toThrow(ConflictException);
    const unchanged = await prisma.service.findUnique({ where: { svcId: 'TEST-LINK-1-SVC-1' } });
    expect(unchanged!.status).toBe('Not Started');
    expect(unchanged!.authorizationId).toBeNull();
  });

  it('rejects linking a service whose status is Cancelled and does not mutate the service', async () => {
    await prisma.service.update({ where: { svcId: 'TEST-LINK-1-SVC-1' }, data: { status: 'Cancelled' } });
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-6', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    await expect(services.linkAuthorization('TEST-LINK-1-SVC-1', auth.id, 1, 'coordinator')).rejects.toThrow(BadRequestException);
    const unchanged = await prisma.service.findUnique({ where: { svcId: 'TEST-LINK-1-SVC-1' } });
    expect(unchanged!.status).toBe('Cancelled');
    expect(unchanged!.authorizationId).toBeNull();
  });

  it('candidates lists matching authorizations and flags non-Verified ones as ineligible', async () => {
    const verified = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-3', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const draft = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Block',
        referenceNumber: 'REF-4', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Draft', createdBy: 'SYSTEM',
      },
    });
    const candidates = await services.authorizationCandidates('TEST-LINK-1-SVC-1');
    expect(candidates).toHaveLength(2);
    const verifiedEntry = candidates.find((c) => c.authorization.id === verified.id)!;
    const draftEntry = candidates.find((c) => c.authorization.id === draft.id)!;
    expect(verifiedEntry.eligible).toBe(true);
    expect(draftEntry.eligible).toBe(false);
    expect(draftEntry.reason).toMatch(/Draft/);
  });
});
