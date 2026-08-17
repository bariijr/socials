import { describe, it, expect } from 'vitest';
import { scopeTypeForServiceType, getScopeCandidates } from './scope.js';

const legs = [
  { id: 'L1', tripId: 'T1', sequence: 1, callSign: 'ACW169', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', overflightCountries: [], revision: 0 },
  { id: 'L2', tripId: 'T1', sequence: 2, callSign: 'ACW170', depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', overflightCountries: ['ET'], revision: 0 },
];
const stops = [
  { id: 'S1', tripId: 'T1', icao: 'HKJK', arrZ: '2026-08-20T06:15:00.000Z', depZ: '2026-08-20T09:00:00.000Z', groundTimeHours: 2.75, purpose: 'TECH_STOP' },
];

describe('scopeTypeForServiceType', () => {
  it('maps overflight permit to SEGMENT', () => expect(scopeTypeForServiceType('OVERFLIGHT_PERMIT')).toBe('SEGMENT'));
  it('maps landing permit to LEG', () => expect(scopeTypeForServiceType('LANDING_PERMIT')).toBe('LEG'));
  it('maps fuel/handling/catering/crew transport/customs to STOP', () => {
    for (const st of ['FUEL', 'HANDLING', 'CATERING', 'CREW_TRANSPORT', 'CUSTOMS']) {
      expect(scopeTypeForServiceType(st)).toBe('STOP');
    }
  });
});

describe('getScopeCandidates', () => {
  it('returns legs for LANDING_PERMIT', () => {
    expect(getScopeCandidates('LANDING_PERMIT', legs, stops).map((c) => c.scopeId)).toEqual(['L1', 'L2']);
  });
  it('returns stops for FUEL', () => {
    expect(getScopeCandidates('FUEL', legs, stops).map((c) => c.scopeId)).toEqual(['S1']);
  });
  it('returns one candidate per (leg, overflown country) for OVERFLIGHT_PERMIT', () => {
    expect(getScopeCandidates('OVERFLIGHT_PERMIT', legs, stops)).toEqual([{ scopeId: 'L2:ET', label: 'HKJK → HAAB: overflying ET' }]);
  });
});
