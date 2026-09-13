import { CANCELLATION_REASONS } from './cancellationReasons';

describe('CANCELLATION_REASONS', () => {
  it('contains the 13 reasons from the mega-spec §9, each a non-empty string', () => {
    expect(CANCELLATION_REASONS).toHaveLength(13);
    for (const r of CANCELLATION_REASONS) {
      expect(typeof r).toBe('string');
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('includes every reason the spec names', () => {
    expect(CANCELLATION_REASONS).toEqual([
      'Client Cancelled', 'Aircraft Technical', 'Weather', 'Crew',
      'Schedule Change', 'Permit / Regulatory', 'Operational', 'Commercial',
      'Security', 'Airport Closed', 'Mission Cancelled', 'Duplicate Trip', 'Other',
    ]);
  });
});
