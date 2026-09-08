import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ServicesService } from './services.service';
import { truncateAll } from '../../test/db-test-utils';

describe('Change impact: flagging Confirmed services for reconfirmation', () => {
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
    await prisma.trip.create({ data: { tripId: 'TEST-IMPACT-1', client: 'Test Client' } });
    await prisma.country.create({
      data: { iso2: 'KE', name: 'Kenya', overflightPermitRequired: true, landingPermitRequired: true, centroidLat: -1.3, centroidLng: 36.8 },
    });
  });

  async function makeConfirmedService(overrides: { countryIso2?: string | null; serviceType?: string; scopeId?: string } = {}) {
    return prisma.service.create({
      data: {
        svcId: `TEST-IMPACT-1-SVC-${Math.random().toString(36).slice(2)}`,
        tripId: 'TEST-IMPACT-1',
        scopeType: 'SEGMENT',
        scopeId: overrides.scopeId ?? 'LEG-1',
        serviceType: overrides.serviceType ?? 'Overflight',
        status: 'Confirmed',
        countryIso2: overrides.countryIso2 === undefined ? 'KE' : overrides.countryIso2,
        basedOnEtdZ: new Date('2026-10-01T06:00:00.000Z'),
        requiredByZ: new Date('2026-10-01T04:00:00.000Z'),
      },
    });
  }

  describe('flagConfirmedServicesForScheduleChange', () => {
    it('does not flag when the ETD change is within the country tolerance', async () => {
      await prisma.countryRule.create({
        data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 3 },
      });
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T08:00:00.000Z'); // 2h delta, within 3h tolerance
      await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });

    it('flags when the ETD change exceeds the country tolerance', async () => {
      await prisma.countryRule.create({
        data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 },
      });
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T09:00:00.000Z'); // 3h delta, exceeds 1h tolerance
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'tester');
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
      expect(after!.notes).toContain('Auto-flagged');
      expect(after!.notes).toContain('3.0h');
      expect(after!.statusChangedBy).toBe('tester');
    });

    it('defaults tolerance to 0 (flags on any change) when no CountryRule row exists', async () => {
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T06:15:00.000Z'); // 15min delta, no rule at all
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
    });

    it('skips a service with no countryIso2 at all', async () => {
      const svc = await makeConfirmedService({ countryIso2: null });
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-02T06:00:00.000Z'); // 24h delta
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });

    it('does not touch a service that is not Confirmed', async () => {
      const svc = await makeConfirmedService();
      await prisma.service.update({ where: { svcId: svc.svcId }, data: { status: 'Requested' } });
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-02T06:00:00.000Z');
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd);
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Requested');
    });

    it('does nothing when old and new time are identical', async () => {
      const svc = await makeConfirmedService();
      const same = new Date('2026-10-01T06:00:00.000Z');
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', same, same);
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });
  });

  describe('flagConfirmedServices (generic bulk flag)', () => {
    it('flags every Confirmed service matching the filter, leaving non-matching ones alone', async () => {
      const matching = await makeConfirmedService({ scopeId: 'LEG-1' });
      const other = await makeConfirmedService({ scopeId: 'LEG-2' });
      const flagged = await services.flagConfirmedServices({ scopeId: 'LEG-1' }, 'route changed', 'tester');
      expect(flagged).toHaveLength(1);
      const matchingAfter = await prisma.service.findUnique({ where: { svcId: matching.svcId } });
      const otherAfter = await prisma.service.findUnique({ where: { svcId: other.svcId } });
      expect(matchingAfter!.status).toBe('Re-confirm Required');
      expect(matchingAfter!.notes).toContain('Auto-flagged: route changed.');
      expect(otherAfter!.status).toBe('Confirmed');
    });
  });
});
