import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorResolverService } from '../vendor-assignments/vendor-resolver.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

// §19: confirmedBy/confirmedAtZ used to be free-text fields a coordinator
// typed by hand, completely decoupled from the actual status transition.
// These tests confirm every path that moves a Service to 'Confirmed' now
// stamps them consistently, and that the server-verified identity (not the
// client-supplied dto.user) wins at the moment of transition.
describe('Service confirmation stamping (§19)', () => {
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
    await prisma.trip.create({ data: { tripId: 'TEST-CONFIRM-1', client: 'Test Client' } });
  });

  async function makeRequestedService(svcId: string) {
    return prisma.service.create({
      data: {
        svcId, tripId: 'TEST-CONFIRM-1', scopeType: 'TRIP', scopeId: 'TEST-CONFIRM-1',
        serviceType: 'Overflight', status: 'Requested',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
  }

  it('stamps confirmedBy from the server-verified username, not dto.user, on transition to Confirmed', async () => {
    await makeRequestedService('TEST-CONFIRM-1-SVC-1');
    const updated = await services.update(
      'TEST-CONFIRM-1-SVC-1',
      { status: 'Confirmed', version: 1, user: 'spoofed-name' } as any,
      'real-verified-user',
    );
    expect(updated.confirmedBy).toBe('real-verified-user');
    expect(updated.confirmedAtZ).not.toBeNull();
  });

  it('falls back to dto.user when no verified username is available', async () => {
    await makeRequestedService('TEST-CONFIRM-1-SVC-2');
    const updated = await services.update('TEST-CONFIRM-1-SVC-2', { status: 'Confirmed', version: 1, user: 'coordinator' } as any);
    expect(updated.confirmedBy).toBe('coordinator');
  });

  it('does not touch confirmedBy/confirmedAtZ on an update that does not change status', async () => {
    const svc = await makeRequestedService('TEST-CONFIRM-1-SVC-3');
    const updated = await services.update('TEST-CONFIRM-1-SVC-3', { refNumber: 'REF-123', version: svc.version } as any, 'someone');
    expect(updated.confirmedBy).toBeNull();
    expect(updated.confirmedAtZ).toBeNull();
  });

  it('lets a later manual edit (status already Confirmed, not transitioning) override confirmedBy', async () => {
    await makeRequestedService('TEST-CONFIRM-1-SVC-4');
    const confirmed = await services.update('TEST-CONFIRM-1-SVC-4', { status: 'Confirmed', version: 1 } as any, 'first-confirmer');
    expect(confirmed.confirmedBy).toBe('first-confirmer');

    // Status doesn't change on this second call -- becomingConfirmed is
    // false, so the manual confirmedBy correction goes through untouched.
    const corrected = await services.update(
      'TEST-CONFIRM-1-SVC-4',
      { confirmedBy: 'CORRECTED BY PHONE', version: confirmed.version } as any,
      'data-entry-person',
    );
    expect(corrected.confirmedBy).toBe('CORRECTED BY PHONE');
  });

  it('re-stamps confirmedBy/confirmedAtZ on a genuine reconfirmation (Re-confirm Required -> Confirmed)', async () => {
    await makeRequestedService('TEST-CONFIRM-1-SVC-5');
    const firstConfirm = await services.update('TEST-CONFIRM-1-SVC-5', { status: 'Confirmed', version: 1 } as any, 'first-confirmer');
    const flagged = await services.update('TEST-CONFIRM-1-SVC-5', { status: 'Re-confirm Required', version: firstConfirm.version } as any, 'system');
    const reconfirmed = await services.update('TEST-CONFIRM-1-SVC-5', { status: 'Confirmed', version: flagged.version } as any, 'second-confirmer');
    expect(reconfirmed.confirmedBy).toBe('second-confirmer');
    expect(reconfirmed.confirmedAtZ!.getTime()).toBeGreaterThanOrEqual(firstConfirm.confirmedAtZ!.getTime());
  });

  it('linkAuthorization stamps confirmedBy/confirmedAtZ', async () => {
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({ data: { registration: 'N1TEST', icaoType: 'GLF6', currentOperatorId: 'OP-1' } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
    await prisma.trip.update({ where: { tripId: 'TEST-CONFIRM-1' }, data: { registration: 'N1TEST' } });
    const svc = await prisma.service.create({
      data: {
        svcId: 'TEST-CONFIRM-1-SVC-6', tripId: 'TEST-CONFIRM-1', scopeType: 'SEGMENT', scopeId: 'LEG-1',
        serviceType: 'Overflight', status: 'Not Started', countryIso2: 'KE',
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'), requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
    const auth = await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'REF-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const linked = await services.linkAuthorization(svc.svcId, auth.id, svc.version, 'linker-user');
    expect(linked.confirmedBy).toBe('linker-user');
    expect(linked.confirmedAtZ).not.toBeNull();
  });

  it('generateOverflightServices stamps confirmedBy/confirmedAtZ when auto-confirmed via a matching authorization', async () => {
    await prisma.operator.create({ data: { operatorId: 'OP-1', name: 'Test Operator', fleet: [] } });
    await prisma.aircraftType.create({
      data: { icaoType: 'GLF6', manufacturer: 'Gulfstream', model: 'G650', mtowKg: 45178, noiseCert: 'Chapter 14' },
    });
    await prisma.aircraft.create({ data: { registration: 'N1TEST', icaoType: 'GLF6', currentOperatorId: 'OP-1' } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
    await prisma.trip.update({ where: { tripId: 'TEST-CONFIRM-1' }, data: { registration: 'N1TEST' } });
    await prisma.leg.create({
      data: {
        legId: 'TEST-CONFIRM-1-LEG-1', tripId: 'TEST-CONFIRM-1', seq: 1,
        depIcao: 'HKJK', arrIcao: 'FAJS', etdZ: new Date('2026-10-01T06:00:00.000Z'), etaZ: new Date('2026-10-01T09:00:00.000Z'),
        blockHours: 3, paxCount: 2, crewCount: 2, countriesOverflown: ['KE'],
      },
    });
    await prisma.permitAuthorization.create({
      data: {
        operatorId: 'OP-1', countryIso2: 'KE', serviceType: 'Overflight', authorizationType: 'Blanket',
        referenceNumber: 'BLANKET-1', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01'),
        status: 'Verified', createdBy: 'SYSTEM',
      },
    });
    const created = await services.generateOverflightServices('TEST-CONFIRM-1-LEG-1', 'generator-user');
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('Confirmed');
    expect(created[0].confirmedBy).toBe('generator-user');
    expect(created[0].confirmedAtZ).not.toBeNull();
  });
});
