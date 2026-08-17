import { describe, it, expect } from 'vitest';
import { computeRequiredByZ, computeUrgency, needsReconfirm, resolveCountryRuleForService } from './core-logic.js';

const rule24h = { id: 'r1', countryIso2: 'KE', serviceType: 'HANDLING', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, docsRequired: [], escalationContact: 'ops@example.com' };

describe('computeRequiredByZ', () => {
  it('subtracts lead time directly when workingDaysOnly is false', () => {
    expect(computeRequiredByZ('2026-08-20T12:00:00.000Z', rule24h)).toBe('2026-08-19T12:00:00.000Z');
  });

  it('skips weekends when workingDaysOnly is true', () => {
    const rule48hWorkingDays = { ...rule24h, leadTimeHours: 48, workingDaysOnly: true };
    // ETD Monday 2026-08-24T10:00Z; 48 working hours back: Sat 22 and Sun 23 contribute 0 hours (skipped), Friday contributes 24 hours, Thursday contributes 24 hours = 48 total, lands Thu 2026-08-20T10:00Z.
    expect(computeRequiredByZ('2026-08-24T10:00:00.000Z', rule48hWorkingDays)).toBe('2026-08-20T10:00:00.000Z');
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

describe('resolveCountryRuleForService', () => {
  const countryRules = [
    { id: 'CR-TZ-OVERFLIGHT', countryIso2: 'TZ', serviceType: 'OVERFLIGHT_PERMIT', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 4, docsRequired: [], escalationContact: 'x@example.com' },
    { id: 'CR-ET-OVERFLIGHT', countryIso2: 'ET', serviceType: 'OVERFLIGHT_PERMIT', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 6, docsRequired: [], escalationContact: 'x@example.com' },
    { id: 'CR-EG-LAND', countryIso2: 'EG', serviceType: 'LANDING_PERMIT', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, docsRequired: [], escalationContact: 'x@example.com' },
    { id: 'CR-KE-FUEL', countryIso2: 'KE', serviceType: 'FUEL', leadTimeHours: 12, workingDaysOnly: false, toleranceHours: 2, docsRequired: [], escalationContact: 'x@example.com' },
  ];
  const airports = [
    { icao: 'HTDA', iata: 'DAR', name: 'Julius Nyerere Intl', country: 'Tanzania', iso2: 'TZ', tz: 'Africa/Dar_es_Salaam' },
    { icao: 'HKJK', iata: 'NBO', name: 'Jomo Kenyatta Intl', country: 'Kenya', iso2: 'KE', tz: 'Africa/Nairobi' },
    { icao: 'HECA', iata: 'CAI', name: 'Cairo Intl', country: 'Egypt', iso2: 'EG', tz: 'Africa/Cairo' },
  ];
  const legs = [
    { id: 'L1', tripId: 'T1', sequence: 1, callSign: 'X', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', overflightCountries: ['ET'], revision: 0 },
    { id: 'L2', tripId: 'T1', sequence: 2, callSign: 'X', depIcao: 'HKJK', arrIcao: 'HECA', etdZ: '2026-08-21T05:00:00.000Z', etaZ: '2026-08-21T08:00:00.000Z', overflightCountries: [], revision: 0 },
  ];
  const stops = [
    { id: 'S1', tripId: 'T1', icao: 'HKJK', arrZ: '2026-08-20T06:15:00.000Z', depZ: '2026-08-21T05:00:00.000Z', groundTimeHours: 22.75, purpose: 'NIGHT_STOP' },
  ];

  it('resolves a SEGMENT-scoped service by the country embedded in scopeId (not the first same-serviceType rule)', () => {
    const svc = { id: 'SVC-1', tripId: 'T1', scopeType: 'SEGMENT', scopeId: 'L1:ET', serviceType: 'OVERFLIGHT_PERMIT', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T05:00:00.000Z', assignedTo: null };
    const rule = resolveCountryRuleForService(svc, countryRules, legs, stops, airports);
    expect(rule.id).toBe('CR-ET-OVERFLIGHT');
  });

  it('resolves a LEG-scoped service by the arrival airport\'s country', () => {
    const svc = { id: 'SVC-2', tripId: 'T1', scopeType: 'LEG', scopeId: 'L2', serviceType: 'LANDING_PERMIT', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-21T05:00:00.000Z', assignedTo: null };
    const rule = resolveCountryRuleForService(svc, countryRules, legs, stops, airports);
    expect(rule.id).toBe('CR-EG-LAND');
  });

  it('resolves a STOP-scoped service by the stop\'s airport country', () => {
    const svc = { id: 'SVC-3', tripId: 'T1', scopeType: 'STOP', scopeId: 'S1', serviceType: 'FUEL', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-21T05:00:00.000Z', assignedTo: null };
    const rule = resolveCountryRuleForService(svc, countryRules, legs, stops, airports);
    expect(rule.id).toBe('CR-KE-FUEL');
  });

  it('returns null when no rule matches the resolved country/serviceType pair, rather than falling back to an unrelated rule', () => {
    const svc = { id: 'SVC-4', tripId: 'T1', scopeType: 'STOP', scopeId: 'S1', serviceType: 'CUSTOMS', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-21T05:00:00.000Z', assignedTo: null };
    expect(resolveCountryRuleForService(svc, countryRules, legs, stops, airports)).toBeNull();
  });
});
