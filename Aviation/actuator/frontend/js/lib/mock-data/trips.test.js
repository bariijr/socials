import { describe, it, expect } from 'vitest';
import { trips, legs, stops, services, comms, auditEntries } from './trips.js';
import { persons } from './persons.js';
import { personRoles } from './personRoles.js';

describe('transactional seed data integrity', () => {
  const tripIds = new Set(trips.map((t) => t.id));
  const legIds = new Set(legs.map((l) => l.id));
  const stopIds = new Set(stops.map((s) => s.id));

  it('every leg references a real trip', () => {
    for (const l of legs) expect(tripIds.has(l.tripId)).toBe(true);
  });

  it('every stop references a real trip', () => {
    for (const s of stops) expect(tripIds.has(s.tripId)).toBe(true);
  });

  it('every service scopeId resolves against its scopeType', () => {
    for (const svc of services) {
      expect(tripIds.has(svc.tripId)).toBe(true);
      if (svc.scopeType === 'LEG') {
        expect(legIds.has(svc.scopeId)).toBe(true);
      } else if (svc.scopeType === 'STOP') {
        expect(stopIds.has(svc.scopeId)).toBe(true);
      } else {
        const [legId] = svc.scopeId.split(':');
        expect(legIds.has(legId)).toBe(true);
      }
    }
  });

  it('every comm references a real trip', () => {
    for (const c of comms) expect(tripIds.has(c.tripId)).toBe(true);
  });

  it('seed data covers Confirmed, Requested, and Re-confirm Required statuses', () => {
    const statuses = new Set(services.map((s) => s.status));
    expect(statuses.has('RECONFIRM_REQUIRED')).toBe(true);
    expect(statuses.has('CONFIRMED')).toBe(true);
    expect(statuses.has('REQUESTED')).toBe(true);
  });

  it('has at least 2 trips with at least 1 leg each', () => {
    expect(trips.length).toBeGreaterThanOrEqual(2);
    for (const t of trips) expect(legs.filter((l) => l.tripId === t.id).length).toBeGreaterThanOrEqual(1);
  });

  it('audit entries reference real record ids', () => {
    for (const a of auditEntries) {
      expect(typeof a.recordId).toBe('string');
      expect(a.recordId.length).toBeGreaterThan(0);
    }
  });

  it('every leg has a callSign and a real ETD, and at least one leg has a null (TBD) ETA', () => {
    for (const l of legs) {
      expect(typeof l.callSign).toBe('string');
      expect(l.callSign.length).toBeGreaterThan(0);
      expect(typeof l.etdZ).toBe('string');
    }
    expect(legs.some((l) => l.etaZ === null)).toBe(true);
  });

  it('every person references a real trip and a real role', () => {
    const roleIds = new Set(personRoles.map((r) => r.id));
    for (const p of persons) {
      expect(tripIds.has(p.tripId)).toBe(true);
      expect(roleIds.has(p.roleId)).toBe(true);
    }
    expect(persons.length).toBeGreaterThan(0);
  });
});
