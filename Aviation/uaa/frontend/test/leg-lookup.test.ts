import { describe, expect, it } from 'vitest';
import { findMostRecentByTail } from '../src/lib/leg-lookup';
import type { Leg } from '../src/lib/api-client';

function leg(overrides: Partial<Leg>): Leg {
  return {
    id: overrides.id ?? 'x',
    tripNo: overrides.tripNo ?? '000000',
    icao: overrides.icao ?? 'ZZZZ',
    tail: overrides.tail ?? null,
    country: overrides.country ?? null,
    arrDate: overrides.arrDate ?? null,
    depDate: overrides.depDate ?? null,
    legId: overrides.legId ?? 1,
    ...overrides,
  };
}

describe('findMostRecentByTail', () => {
  it('returns undefined when there are no legs', () => {
    expect(findMostRecentByTail([], 'N148B')).toBeUndefined();
  });

  it('returns undefined when the tail is blank', () => {
    const legs = [leg({ tail: 'N148B', legId: 1 })];
    expect(findMostRecentByTail(legs, '  ')).toBeUndefined();
  });

  it('returns undefined when no leg matches the tail', () => {
    const legs = [leg({ tail: 'N148B', legId: 1 })];
    expect(findMostRecentByTail(legs, 'N999QA')).toBeUndefined();
  });

  it('matches case-insensitively', () => {
    const legs = [leg({ tail: 'N148B', legId: 1, operatorName: 'HONEYWELL' })];
    expect(findMostRecentByTail(legs, 'n148b')?.operatorName).toBe('HONEYWELL');
  });

  it('returns the leg with the highest legId when multiple legs share a tail', () => {
    const legs = [
      leg({ tail: 'N148B', legId: 44, operatorName: 'OLD OPERATOR' }),
      leg({ tail: 'N148B', legId: 149, operatorName: 'CURRENT OPERATOR' }),
      leg({ tail: 'N148B', legId: 90, operatorName: 'MID OPERATOR' }),
    ];
    expect(findMostRecentByTail(legs, 'N148B')?.operatorName).toBe('CURRENT OPERATOR');
  });
});
