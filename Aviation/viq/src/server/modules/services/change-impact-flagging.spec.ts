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
      await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'ETD');
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });

    it('flags when the ETD change exceeds the country tolerance, bumping version', async () => {
      await prisma.countryRule.create({
        data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 },
      });
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T09:00:00.000Z'); // 3h delta, exceeds 1h tolerance
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'ETD', 'tester');
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
      expect(after!.notes).toContain('Auto-flagged');
      expect(after!.notes).toContain('ETD moved 3.0h');
      expect(after!.statusChangedBy).toBe('tester');
      expect(after!.version).toBe(svc.version + 1);
    });

    it('says "ETA moved" (not "ETD moved") when the label is ETA', async () => {
      await prisma.countryRule.create({
        data: { countryIso2: 'KE', serviceType: 'Overflight', leadTimeHours: 48, toleranceHours: 1 },
      });
      const svc = await makeConfirmedService();
      const oldEta = new Date('2026-10-01T06:00:00.000Z');
      const newEta = new Date('2026-10-01T09:00:00.000Z'); // 3h delta, exceeds 1h tolerance
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEta, newEta, 'ETA', 'tester');
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.notes).toContain('ETA moved 3.0h');
      expect(after!.notes).not.toContain('ETD moved');
    });

    it('expresses a sub-hour delta in minutes, not a misleading "0.0h"', async () => {
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T06:01:00.000Z'); // 1min delta, no rule (tolerance 0)
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'ETD');
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.notes).toContain('ETD moved 1min');
      expect(after!.notes).not.toContain('0.0h');
    });

    it('defaults tolerance to 0 (flags on any change) when no CountryRule row exists', async () => {
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T06:15:00.000Z'); // 15min delta, no rule at all
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'ETD');
      expect(flagged).toHaveLength(1);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
    });

    it('skips a service with no countryIso2 at all', async () => {
      const svc = await makeConfirmedService({ countryIso2: null });
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-02T06:00:00.000Z'); // 24h delta
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'ETD');
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });

    it('does not touch a service that is not Confirmed', async () => {
      const svc = await makeConfirmedService();
      await prisma.service.update({ where: { svcId: svc.svcId }, data: { status: 'Requested' } });
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-02T06:00:00.000Z');
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'ETD');
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Requested');
    });

    it('does nothing when old and new time are identical', async () => {
      const svc = await makeConfirmedService();
      const same = new Date('2026-10-01T06:00:00.000Z');
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', same, same, 'ETD');
      expect(flagged).toHaveLength(0);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Confirmed');
    });

    it('restricts flagging to onlyIds when provided', async () => {
      const included = await makeConfirmedService({ scopeId: 'LEG-1' });
      const excluded = await makeConfirmedService({ scopeId: 'LEG-1' });
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-02T06:00:00.000Z'); // 24h delta, no rule
      const flagged = await services.flagConfirmedServicesForScheduleChange(
        'LEG-1', oldEtd, newEtd, 'ETD', 'tester', [included.svcId],
      );
      expect(flagged).toHaveLength(1);
      expect(flagged[0].svcId).toBe(included.svcId);
      const excludedAfter = await prisma.service.findUnique({ where: { svcId: excluded.svcId } });
      expect(excludedAfter!.status).toBe('Confirmed');
    });

    it('makes a stale-version update() on the auto-flagged service throw a conflict (Finding 1)', async () => {
      const svc = await makeConfirmedService();
      const oldEtd = new Date('2026-10-01T06:00:00.000Z');
      const newEtd = new Date('2026-10-01T09:00:00.000Z'); // 3h delta, no rule (tolerance 0)
      const flagged = await services.flagConfirmedServicesForScheduleChange('LEG-1', oldEtd, newEtd, 'ETD');
      expect(flagged).toHaveLength(1);

      // A client that had this service's editor open before the auto-flag
      // still holds the pre-flag version -- saving that stale draft must
      // now conflict rather than silently reverting the auto-flag.
      let caught: any;
      try {
        await services.update(svc.svcId, { status: 'Confirmed', version: svc.version, user: 'stale-editor' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(caught.status).toBe(409);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
    });
  });

  describe('flagConfirmedServices (generic bulk flag)', () => {
    it('flags every Confirmed service matching the filter, leaving non-matching ones alone, and bumps version', async () => {
      const matching = await makeConfirmedService({ scopeId: 'LEG-1' });
      const other = await makeConfirmedService({ scopeId: 'LEG-2' });
      const flagged = await services.flagConfirmedServices({ scopeId: 'LEG-1' }, 'route changed', 'tester');
      expect(flagged).toHaveLength(1);
      const matchingAfter = await prisma.service.findUnique({ where: { svcId: matching.svcId } });
      const otherAfter = await prisma.service.findUnique({ where: { svcId: other.svcId } });
      expect(matchingAfter!.status).toBe('Re-confirm Required');
      expect(matchingAfter!.notes).toContain('Auto-flagged: route changed.');
      expect(matchingAfter!.version).toBe(matching.version + 1);
      expect(otherAfter!.status).toBe('Confirmed');
    });

    it('restricts flagging to onlyIds when provided', async () => {
      const included = await makeConfirmedService({ scopeId: 'LEG-1' });
      const excluded = await makeConfirmedService({ scopeId: 'LEG-1' });
      const flagged = await services.flagConfirmedServices({ scopeId: 'LEG-1' }, 'route changed', 'tester', [included.svcId]);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].svcId).toBe(included.svcId);
      const excludedAfter = await prisma.service.findUnique({ where: { svcId: excluded.svcId } });
      expect(excludedAfter!.status).toBe('Confirmed');
    });

    it('makes a stale-version update() on the auto-flagged service throw a conflict (Finding 1)', async () => {
      const svc = await makeConfirmedService({ scopeId: 'LEG-1' });
      const flagged = await services.flagConfirmedServices({ scopeId: 'LEG-1' }, 'route changed', 'tester');
      expect(flagged).toHaveLength(1);

      let caught: any;
      try {
        await services.update(svc.svcId, { status: 'Confirmed', version: svc.version, user: 'stale-editor' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      expect(caught.status).toBe(409);
      const after = await prisma.service.findUnique({ where: { svcId: svc.svcId } });
      expect(after!.status).toBe('Re-confirm Required');
    });
  });
});
