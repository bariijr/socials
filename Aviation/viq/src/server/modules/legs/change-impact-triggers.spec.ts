import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from '../services/services.service';
import { StopsService } from '../stops/stops.service';
import { LegsService } from './legs.service';
import { TripsService } from '../trips/trips.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Change impact: leg-scoped triggers (schedule + route)', () => {
  let prisma: PrismaService;
  let legs: LegsService;
  let trips: TripsService;
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
    const stops = new StopsService(prisma, audit);
    legs = new LegsService(prisma, audit, services, stops);
    trips = new TripsService(prisma, audit, services);
    await trips.create({ tripId: 'TEST-CI-1', client: 'Test Client' });
    await prisma.country.createMany({
      data: [
        { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
        { iso2: 'TZ', name: 'Tanzania', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -6.4, centroidLng: 34.9 },
      ],
    });
  });

  it('flags a Confirmed Overflight service when ETD moves beyond the country tolerance', async () => {
    await prisma.countryRule.create({ data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 } });
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-1', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-1-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { etdZ: '2026-10-01T09:00:00.000Z', version: leg.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-1-OVF-KE' } });
    expect(svc!.status).toBe('Re-confirm Required');
  });

  it('does not flag when ETD moves within tolerance', async () => {
    await prisma.countryRule.create({ data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 6 } });
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-2', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-2-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { etdZ: '2026-10-01T08:00:00.000Z', version: leg.version }); // 2h, within 6h tolerance

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-2-OVF-KE' } });
    expect(svc!.status).toBe('Confirmed');
  });

  it('flags every Confirmed service on the leg when the arrival airport changes, regardless of tolerance', async () => {
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-3', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-3-PMT-FALA', tripId: 'TEST-CI-1', scopeType: 'LEG', scopeId: leg.legId,
        serviceType: 'Permit', status: 'Confirmed', countryIso2: 'TZ', icao: 'FALA',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { arrIcao: 'HKJK', version: leg.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-3-PMT-FALA' } });
    expect(svc!.status).toBe('Re-confirm Required');
    expect(svc!.notes).toContain('route changed');
  });

  it('flags a Confirmed service when the effective overflown countries change via Avoid/Include FIRs, even with no ICAO change', async () => {
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-5', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-5-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    // Mirrors the real client (TripDetail.tsx via dataStore.ts's mapLegToApi),
    // which always sends the already-recomputed countriesOverflown alongside
    // avoidFirs/includeFirs rather than leaving it for the server to
    // recompute -- so `reconcileOverflight` never becomes true on an edit
    // shaped like this, and the route-change check must compare the
    // persisted countriesOverflown unconditionally, not gated on it.
    await legs.update(leg.legId, { avoidFirs: ['KE'], countriesOverflown: [], version: leg.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-5-OVF-KE' } });
    expect(svc!.status).toBe('Re-confirm Required');
    expect(svc!.notes).toContain('overflown countries changed');
  });

  it('records the route-change reason (not the schedule reason) when both change in the same update (Finding 4)', async () => {
    await prisma.countryRule.create({ data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 } });
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-6', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-6-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Confirmed', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    // Both the ETD (beyond the 1h tolerance) and the arrival ICAO change in
    // the same update -- the route change is the more consequential fact
    // (a different permit application entirely) and must survive even
    // though the schedule check would otherwise flip the service away from
    // Confirmed first and leave nothing for the route check to find.
    await legs.update(leg.legId, {
      etdZ: '2026-10-01T09:00:00.000Z', arrIcao: 'HKJK', version: leg.version,
    });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-6-OVF-KE' } });
    expect(svc!.status).toBe('Re-confirm Required');
    expect(svc!.notes).toContain('route changed');
  });

  it('does not re-flag a service created-and-auto-confirmed within the SAME update call (Finding 2)', async () => {
    await prisma.operator.create({ data: { operatorId: 'OP-FINDING2', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({ data: { registration: 'N-FINDING2', icaoType: 'GLF6', currentOperatorId: 'OP-FINDING2' } });
    await prisma.trip.update({ where: { tripId: 'TEST-CI-1' }, data: { registration: 'N-FINDING2' } });
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-FINDING2', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'BLANKET-F2', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    await prisma.countryRule.create({ data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 } });

    // No Overflight service exists yet for this leg/country -- it gets
    // created (and auto-confirmed, since the Verified authorization above
    // matches) by generateOverflightServices as part of THIS SAME update
    // call, triggered by the ETD change below moving well beyond tolerance.
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-7', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });

    await legs.update(leg.legId, {
      etdZ: '2026-10-01T10:00:00.000Z', // 4h delta, exceeds the 1h tolerance
      generateServices: true,
      version: leg.version,
    });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-7-OVF-KE' } });
    expect(svc).not.toBeNull();
    expect(svc!.status).toBe('Confirmed');
    expect(svc!.notes).not.toContain('Auto-flagged');
  });

  it('does not flag a service that is not Confirmed when the leg changes', async () => {
    const leg = await legs.create({
      legId: 'TEST-CI-1-LEG-4', tripId: 'TEST-CI-1', seq: 1,
      depIcao: 'HTDA', arrIcao: 'FALA',
      etdZ: '2026-10-01T06:00:00.000Z', etaZ: '2026-10-01T09:00:00.000Z',
      countriesOverflown: ['KE'], generateServices: false,
    });
    await prisma.service.create({
      data: {
        svcId: 'TEST-CI-1-LEG-4-OVF-KE', tripId: 'TEST-CI-1', scopeType: 'SEGMENT', scopeId: leg.legId,
        serviceType: 'Overflight', status: 'Requested', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });

    await legs.update(leg.legId, { arrIcao: 'HKJK', version: leg.version });

    const svc = await prisma.service.findUnique({ where: { svcId: 'TEST-CI-1-LEG-4-OVF-KE' } });
    expect(svc!.status).toBe('Requested');
  });
});
