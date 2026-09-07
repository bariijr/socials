import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Service responsibility', () => {
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
    services = new ServicesService(prisma, audit);
    await prisma.trip.create({ data: { tripId: 'TEST-RESP-1', client: 'Test Client' } });
  });

  it('defaults a newly created service to VIQ Arrangement', async () => {
    const created = await services.create({
      svcId: 'TEST-RESP-1-SVC-1', tripId: 'TEST-RESP-1', scopeType: 'TRIP', scopeId: 'TEST-RESP-1',
      serviceType: 'Overflight', basedOnEtdZ: '2026-10-01T06:00:00.000Z', requiredByZ: '2026-10-01T04:00:00.000Z',
    });
    expect(created.responsibility).toBe('VIQ Arrangement');
  });

  it('accepts an explicit responsibility on create and lets it be updated', async () => {
    const created = await services.create({
      svcId: 'TEST-RESP-1-SVC-2', tripId: 'TEST-RESP-1', scopeType: 'TRIP', scopeId: 'TEST-RESP-1',
      serviceType: 'GroundHandling', basedOnEtdZ: '2026-10-01T06:00:00.000Z', requiredByZ: '2026-10-01T04:00:00.000Z',
      responsibility: 'Client Own',
    });
    expect(created.responsibility).toBe('Client Own');

    const updated = await services.update(created.svcId, { responsibility: 'Operator Own', version: created.version });
    expect(updated.responsibility).toBe('Operator Own');
  });
});
