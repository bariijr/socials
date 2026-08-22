import { computeRequiredByZ, computeUrgency, needsReconfirm } from '../src/permits/permit-deadline';

describe('computeRequiredByZ', () => {
  it('subtracts lead time directly when workingDaysOnly is false', () => {
    const rule = { leadTimeHours: 24, workingDaysOnly: false };
    expect(computeRequiredByZ('2026-08-20T12:00:00.000Z', rule)).toBe('2026-08-19T12:00:00.000Z');
  });

  it('skips weekends when workingDaysOnly is true', () => {
    const rule = { leadTimeHours: 48, workingDaysOnly: true };
    // ETD Monday 2026-08-24T10:00Z; 48 working hours back: Sat/Sun contribute 0 (skipped),
    // Friday contributes 24h, Thursday contributes 24h = 48 total, lands Thu 2026-08-20T10:00Z.
    expect(computeRequiredByZ('2026-08-24T10:00:00.000Z', rule)).toBe('2026-08-20T10:00:00.000Z');
  });
});

describe('computeUrgency', () => {
  it('returns BREACH when RequiredByZ is in the past', () => {
    expect(computeUrgency('2026-08-10T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('BREACH');
  });
  it('returns URGENT when due within 24 hours', () => {
    expect(computeUrgency('2026-08-15T20:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('URGENT');
  });
  it('returns DUE when due within 72 hours but beyond 24', () => {
    expect(computeUrgency('2026-08-17T12:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('DUE');
  });
  it('returns OK when beyond 72 hours out', () => {
    expect(computeUrgency('2026-08-25T00:00:00.000Z', '2026-08-15T00:00:00.000Z')).toBe('OK');
  });
});

describe('needsReconfirm', () => {
  it('is false when the ETD shift is within tolerance', () => {
    expect(needsReconfirm('2026-08-20T12:00:00.000Z', '2026-08-20T13:00:00.000Z', 2)).toBe(false);
  });
  it('is true when the ETD shift exceeds tolerance', () => {
    expect(needsReconfirm('2026-08-20T12:00:00.000Z', '2026-08-20T15:30:00.000Z', 2)).toBe(true);
  });
});
