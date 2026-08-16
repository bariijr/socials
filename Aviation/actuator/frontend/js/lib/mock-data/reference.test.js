import { describe, it, expect } from 'vitest';
import { airports } from './airports.js';
import { countries } from './countries.js';
import { countryRules } from './countryRules.js';
import { aircraft } from './aircraft.js';
import { providers } from './providers.js';
import { personRoles } from './personRoles.js';

describe('reference data integrity', () => {
  const countryIso2s = new Set(countries.map((c) => c.iso2));

  it('every airport references a country present in countries[]', () => {
    for (const a of airports) expect(countryIso2s.has(a.iso2)).toBe(true);
  });

  it('every countryRule references a country present in countries[]', () => {
    for (const r of countryRules) expect(countryIso2s.has(r.countryIso2)).toBe(true);
  });

  it('every provider scope (icao or iso2) resolves against real reference data', () => {
    const icaos = new Set(airports.map((a) => a.icao));
    for (const p of providers) {
      if (p.scopeIcao) expect(icaos.has(p.scopeIcao)).toBe(true);
      if (p.scopeIso2) expect(countryIso2s.has(p.scopeIso2)).toBe(true);
    }
  });

  it('has at least 10 airports across at least 3 countries', () => {
    expect(airports.length).toBeGreaterThanOrEqual(10);
    expect(new Set(airports.map((a) => a.iso2)).size).toBeGreaterThanOrEqual(3);
  });

  it('has at least one aircraft and at least one provider per service type used in country rules', () => {
    expect(aircraft.length).toBeGreaterThan(0);
    const ruleServiceTypes = new Set(countryRules.map((r) => r.serviceType));
    const providerServiceTypes = new Set(providers.map((p) => p.serviceType));
    for (const st of ruleServiceTypes) expect(providerServiceTypes.has(st)).toBe(true);
  });

  it('has at least 8 person roles including PIC, Pax, and VIP', () => {
    expect(personRoles.length).toBeGreaterThanOrEqual(8);
    const labels = new Set(personRoles.map((r) => r.label));
    for (const required of ['PIC', 'Pax', 'VIP']) expect(labels.has(required)).toBe(true);
  });
});
