import { describe, it, expect } from 'vitest';
import { formatDateTimeZ, formatDateOnlyZ, countryNameFor } from './format.js';

describe('formatDateTimeZ', () => {
  it('formats an ISO timestamp as DD-Mon-YYYY HH:MMZ', () => {
    expect(formatDateTimeZ('2026-08-18T06:00:00.000Z')).toBe('18-Aug-2026 06:00Z');
  });
  it('returns TBD for null', () => {
    expect(formatDateTimeZ(null)).toBe('TBD');
  });
});

describe('formatDateOnlyZ', () => {
  it('formats an ISO timestamp as DD-Mon-YYYY', () => {
    expect(formatDateOnlyZ('2026-08-18T06:00:00.000Z')).toBe('18-Aug-2026');
  });
  it('returns TBD for null', () => {
    expect(formatDateOnlyZ(null)).toBe('TBD');
  });
});

describe('countryNameFor', () => {
  const countries = [
    { name: 'Kenya', iso2: 'KE', region: 'East Africa', overflightPermitRequired: true, landingPermitRequired: true, aocDocsRequired: true, defaultEscalationContact: 'x@example.com' },
  ];
  it('resolves a known ISO2 code to its country name', () => {
    expect(countryNameFor('KE', countries)).toBe('Kenya');
  });
  it('falls back to the raw code for an unknown ISO2', () => {
    expect(countryNameFor('ZZ', countries)).toBe('ZZ');
  });
});
