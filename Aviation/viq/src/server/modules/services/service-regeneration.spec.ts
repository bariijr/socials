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

  it('auto-removes an auto-confirmed (authorization-matched) service when its country drops off the route, but only flags one a coordinator has since touched', async () => {
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({ data: { registration: 'N1TEST', icaoType: 'GLF6', currentOperatorId: 'OP-1' } });
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'ZZ', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'BLANKET-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });

    // Case A: an untouched, auto-confirmed service.
    const tripIdA = 'TEST-REGEN-4A';
    await trips.create({ tripId: tripIdA, client: 'Test Client', registration: 'N1TEST' });
    const legA = await legs.create({
      legId: `${tripIdA}-LEG-1`,
      tripId: tripIdA,
      seq: 1,
      depIcao: 'HTDA',
      arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z',
      etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['ZZ'],
      generateServices: false,
    });
    const [createdA] = await services.generateOverflightServices(legA.legId, 'SYSTEM');
    expect(createdA.status).toBe('Confirmed');
    expect(createdA.authorizationId).not.toBeNull();

    await prisma.leg.update({ where: { legId: legA.legId }, data: { countriesOverflown: [] } });
    const { removed: removedA, flagged: flaggedA } = await services.reconcileOverflightServices(legA.legId, 'SYSTEM');
    expect(removedA).toHaveLength(1);
    expect(removedA[0].svcId).toBe(createdA.svcId);
    expect(flaggedA).toHaveLength(0);

    // Case B: same setup, but a coordinator has since made a status-changing
    // edit -- must be flagged, not removed, exactly like any other
    // human-touched service.
    const tripIdB = 'TEST-REGEN-4B';
    await trips.create({ tripId: tripIdB, client: 'Test Client', registration: 'N1TEST' });
    const legB = await legs.create({
      legId: `${tripIdB}-LEG-1`,
      tripId: tripIdB,
      seq: 1,
      depIcao: 'HTDA',
      arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z',
      etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['ZZ'],
      generateServices: false,
    });
    const [createdB] = await services.generateOverflightServices(legB.legId, 'SYSTEM');
    expect(createdB.status).toBe('Confirmed');
    await services.update(createdB.svcId, { status: 'Re-confirm Required', version: createdB.version, user: 'coordinator1' });

    await prisma.leg.update({ where: { legId: legB.legId }, data: { countriesOverflown: [] } });
    const { removed: removedB, flagged: flaggedB } = await services.reconcileOverflightServices(legB.legId, 'SYSTEM');
    expect(removedB).toHaveLength(0);
    expect(flaggedB).toHaveLength(1);
    expect(flaggedB[0].svcId).toBe(createdB.svcId);
  });
});
