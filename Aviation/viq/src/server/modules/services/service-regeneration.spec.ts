import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { LegsService } from '../legs/legs.service';
import { StopsService } from '../stops/stops.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('generateOverflightServices — dismissal-tracking (Phase 0 Conflict #2, fixed)', () => {
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

  it('a user-deleted auto-generated Overflight service does NOT reappear next time generateOverflightServices runs', async () => {
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

    // Through the real user-facing delete path (services.remove), not a raw
    // Prisma delete -- only this path records a dismissal.
    await services.remove(afterCreate[0].svcId, 'coordinator1');
    const afterDelete = await prisma.service.findMany({
      where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
    });
    expect(afterDelete).toHaveLength(0);

    await services.generateOverflightServices(leg.legId, 'SYSTEM');
    const afterRegenerate = await prisma.service.findMany({
      where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
    });
    expect(afterRegenerate).toHaveLength(0); // fixed: stays dismissed
  });

  it('a NEW overflown country on the same leg is still generated after an unrelated dismissal', async () => {
    const tripId = 'TEST-REGEN-2';
    await trips.create({ tripId, client: 'Test Client' });
    await prisma.country.create({
      data: { iso2: 'YY', name: 'Otherland', overflightPermitRequired: true, centroidLat: 0, centroidLng: 0 },
    });
    const leg = await legs.create({
      legId: `${tripId}-LEG-1`,
      tripId,
      seq: 1,
      depIcao: 'HTDA',
      arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z',
      etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['ZZ'],
      generateServices: false,
    });

    const [created] = await services.generateOverflightServices(leg.legId, 'SYSTEM');
    await services.remove(created.svcId, 'coordinator1');

    // Route now also overflies YY -- a country never dismissed for this leg.
    await prisma.leg.update({ where: { legId: leg.legId }, data: { countriesOverflown: ['ZZ', 'YY'] } });
    await services.generateOverflightServices(leg.legId, 'SYSTEM');

    const zz = await prisma.service.findMany({ where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' } });
    const yy = await prisma.service.findMany({ where: { tripId, serviceType: 'Overflight', countryIso2: 'YY' } });
    expect(zz).toHaveLength(0); // still dismissed
    expect(yy).toHaveLength(1); // never dismissed, generated normally
  });

  it('reconcileOverflightServices auto-removing a service (route/FIR change) does NOT create a dismissal', async () => {
    const tripId = 'TEST-REGEN-3';
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
      generateServices: false,
    });

    await services.generateOverflightServices(leg.legId, 'SYSTEM');

    // System (not the user) drops ZZ from the route -- reconcile auto-removes
    // the still-untouched ('Not Started') service, which must NOT be treated
    // as a coordinator dismissal.
    await prisma.leg.update({ where: { legId: leg.legId }, data: { countriesOverflown: [] } });
    const { removed } = await services.reconcileOverflightServices(leg.legId, 'SYSTEM');
    expect(removed).toHaveLength(1);

    // Route reverts to overflying ZZ again -- since the removal was system-
    // driven, not a coordinator dismissal, the service must come back.
    await prisma.leg.update({ where: { legId: leg.legId }, data: { countriesOverflown: ['ZZ'] } });
    await services.reconcileOverflightServices(leg.legId, 'SYSTEM');
    const afterRevert = await prisma.service.findMany({
      where: { tripId, serviceType: 'Overflight', countryIso2: 'ZZ' },
    });
    expect(afterRevert).toHaveLength(1);
  });
});
