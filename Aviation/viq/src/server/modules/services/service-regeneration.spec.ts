import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { LegsService } from '../legs/legs.service';
import { StopsService } from '../stops/stops.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('generateOverflightServices — known regeneration limitation (Phase 0 Conflict #2)', () => {
  let prisma: PrismaService;
  let services: ServicesService;
  let legs: LegsService;
  let trips: TripsService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // PrismaService extends PrismaClient, so it's assignable directly --
    // no cast needed.
    await truncateAll(prisma);
    const audit = new AuditService(prisma);
    services = new ServicesService(prisma, audit);
    const stops = new StopsService(prisma, audit);
    legs = new LegsService(prisma, audit, services, stops);
    trips = new TripsService(prisma, audit);

    await prisma.country.create({
      data: {
        iso2: 'ZZ',
        name: 'Testland',
        overflightPermitRequired: true,
        centroidLat: 0,
        centroidLng: 0,
      },
    });
  });

  it(
    'a manually deleted auto-generated Overflight service reappears the next time generateOverflightServices runs -- ' +
      'known limitation, not fixed by this phase, tracked for the future Change Impact Engine',
    async () => {
      const tripId = 'TEST-REGEN-1';
      await trips.create({ tripId, client: 'Test Client' });
      const leg = await legs.create({
        legId: `${tripId}-LEG-1`,
        tripId,
        seq: 1,
        depIcao: 'HTDA',
        arrIcao: 'FALA',
        etdZ: '2026-10-01T06:00:00.000Z',
        etaZ: '2026-10-01T09:00:00.000Z',
        countriesOverflown: ['ZZ'],
        generateServices: false, // generate explicitly below, scoped to Overflight only
      });

      await services.generateOverflightServices(leg.legId, 'SYSTEM');
      const afterCreate = await prisma.service.findMany({
        where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
      });
      expect(afterCreate).toHaveLength(1);

      await prisma.service.delete({ where: { svcId: afterCreate[0].svcId } });
      const afterDelete = await prisma.service.findMany({
        where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
      });
      expect(afterDelete).toHaveLength(0);

      await services.generateOverflightServices(leg.legId, 'SYSTEM');
      const afterRegenerate = await prisma.service.findMany({
        where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
      });
      expect(afterRegenerate).toHaveLength(1); // reappeared -- documented limitation, not a bug in this phase
    },
  );
});
