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
