import { describe, it, expect } from 'vitest';
import { deriveStopsFromLegs, diffStopsForRebuild } from './stops.js';

const legs = [
  { id: 'L1', tripId: 'T1', sequence: 1, callSign: 'ACW169', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', overflightCountries: [], revision: 0 },
  { id: 'L2', tripId: 'T1', sequence: 2, callSign: 'ACW170', depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', overflightCountries: ['ET'], revision: 0 },
];

describe('deriveStopsFromLegs', () => {
  it('produces an origin turnaround, a tech stop between legs, and a destination turnaround', () => {
    const result = deriveStopsFromLegs('T1', legs);
    expect(result.map((s) => s.icao)).toEqual(['HTDA', 'HKJK', 'HAAB']);
    expect(result[0].purpose).toBe('TURNAROUND');
    expect(result[1].purpose).toBe('TECH_STOP');
    expect(result[1].groundTimeHours).toBeCloseTo(2.75, 2);
    expect(result[2].purpose).toBe('TURNAROUND');
  });

  it('marks a stop NIGHT_STOP when ground time exceeds 8 hours', () => {
    const longLegs = [legs[0], { ...legs[1], etdZ: '2026-08-21T07:00:00.000Z' }];
    expect(deriveStopsFromLegs('T1', longLegs)[1].purpose).toBe('NIGHT_STOP');
  });

  it('leaves arrZ and groundTimeHours null for a mid-route stop when the feeding leg has no ETA yet (TBD)', () => {
    const tbdLegs = [legs[0], { ...legs[1], etaZ: null }];
    const result = deriveStopsFromLegs('T1', tbdLegs);
    expect(result[2].arrZ).toBeNull();
    expect(result[2].groundTimeHours).toBeNull();
  });

  it('leaves the final stop\'s arrZ null when the last leg has no ETA yet (TBD)', () => {
    const tbdLegs = [{ ...legs[0], etaZ: null }];
    const result = deriveStopsFromLegs('T1', tbdLegs);
    expect(result[result.length - 1].arrZ).toBeNull();
  });
});

describe('diffStopsForRebuild', () => {
  const existingStops = [
    { id: 'S-HTDA', tripId: 'T1', icao: 'HTDA', arrZ: null, depZ: legs[0].etdZ, groundTimeHours: null, purpose: 'TURNAROUND' },
    { id: 'S-HKJK', tripId: 'T1', icao: 'HKJK', arrZ: legs[0].etaZ, depZ: legs[1].etdZ, groundTimeHours: 2.75, purpose: 'TECH_STOP' },
    { id: 'S-STALE', tripId: 'T1', icao: 'HUEN', arrZ: null, depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' },
  ];

  it('keeps stops whose ICAO still appears in the derived list', () => {
    expect(diffStopsForRebuild('T1', legs, existingStops, () => false).kept.map((s) => s.id)).toEqual(['S-HTDA', 'S-HKJK']);
  });

  it('flags stops no longer on the route as orphaned when nothing is attached', () => {
    expect(diffStopsForRebuild('T1', legs, existingStops, () => false).orphaned.map((s) => s.id)).toEqual(['S-STALE']);
  });

  it('preserves an orphaned stop instead of dropping it when a service is attached', () => {
    const result = diffStopsForRebuild('T1', legs, existingStops, (stopId) => stopId === 'S-STALE');
    expect(result.orphaned).toEqual([]);
    expect(result.kept.map((s) => s.id)).toContain('S-STALE');
  });

  it('adds newly-derived stops missing from the existing list', () => {
    expect(diffStopsForRebuild('T1', legs, [existingStops[0]], () => false).added.map((s) => s.icao)).toEqual(['HKJK', 'HAAB']);
  });
});
