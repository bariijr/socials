import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Permit authorization matching at generation time', () => {
  let prisma: PrismaService;
  let services: ServicesService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedTripAndLeg(overrides: { registration?: string } = {}) {
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({
      data: { registration: overrides.registration ?? 'N1TEST', icaoType: 'GLF6', currentOperatorId: 'OP-1' },
    });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
    await prisma.trip.create({ data: { tripId: 'TEST-AUTH-1', client: 'Test Client', registration: overrides.registration ?? 'N1TEST' } });
    const leg = await prisma.leg.create({
      data: {
        legId: 'TEST-AUTH-1-LEG-1', tripId: 'TEST-AUTH-1', seq: 1,
        depIcao: 'HKJK', arrIcao: 'FAJS', etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 3, paxCount: 2, crewCount: 2, countriesOverflown: ['KE'],
      },
    });
    return leg;
  }

  beforeEach(async () => {
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    services = new ServicesService(prisma, audit);
  });

  it('auto-confirms a new Overflight service when a Verified authorization covers it', async () => {
    const leg = await seedTripAndLeg();
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'BLANKET-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('Confirmed');
    expect(created[0].authorizationId).toBe(auth.id);
    expect(created[0].refNumber).toBe('BLANKET-1');
  });

  it('does not match a Draft (unverified) authorization', async () => {
    const leg = await seedTripAndLeg();
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'DRAFT-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Draft', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
    expect(created[0].authorizationId).toBeNull();
  });

  it('does not match an authorization whose validity window excludes the leg date', async () => {
    const leg = await seedTripAndLeg();
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'EXPIRED-1', validFrom: new Date('2020-01-01'), validUntil: new Date('2021-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
  });

  it('does not match when the trip registration has no known Aircraft row', async () => {
    const leg = await seedTripAndLeg({ registration: 'N-UNKNOWN' });
    await prisma.aircraft.deleteMany({ where: { registration: 'N-UNKNOWN' } });
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'ORPHAN-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
  });

  it('does not match a different operator’s authorization', async () => {
    const leg = await seedTripAndLeg();
    await prisma.operator.create({ data: { operatorId: 'OP-OTHER', name: 'Other Operator', fleet: [] } });
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-OTHER', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'OTHER-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices(leg.legId);
    expect(created[0].status).toBe('Not Started');
  });
});
