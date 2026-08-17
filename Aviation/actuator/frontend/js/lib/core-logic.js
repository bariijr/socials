export function computeRequiredByZ(basedOnEtdZ, rule) {
  const etd = new Date(basedOnEtdZ);
  if (!rule.workingDaysOnly) {
    return new Date(etd.getTime() - rule.leadTimeHours * 3_600_000).toISOString();
  }
  let remainingHours = rule.leadTimeHours;
  let cursor = new Date(etd);
  while (remainingHours > 0) {
    cursor = new Date(cursor.getTime() - 3_600_000);
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      remainingHours -= 1;
    }
  }
  return cursor.toISOString();
}

const URGENT_THRESHOLD_HOURS = 24;
const DUE_THRESHOLD_HOURS = 72;

export function computeUrgency(requiredByZ, nowZ) {
  const hoursRemaining = (new Date(requiredByZ).getTime() - new Date(nowZ).getTime()) / 3_600_000;
  if (hoursRemaining < 0) return 'BREACH';
  if (hoursRemaining <= URGENT_THRESHOLD_HOURS) return 'URGENT';
  if (hoursRemaining <= DUE_THRESHOLD_HOURS) return 'DUE';
  return 'OK';
}

export function needsReconfirm(basedOnEtdZ, currentEtdZ, toleranceHours) {
  const diffHours = Math.abs(new Date(currentEtdZ).getTime() - new Date(basedOnEtdZ).getTime()) / 3_600_000;
  return diffHours > toleranceHours;
}

// A CountryRule is keyed by (countryIso2, serviceType) — there are multiple rules per
// serviceType, one per country, so a lookup that filters on serviceType alone (e.g.
// `countryRules.find(r => r.serviceType === svc.serviceType)`) silently grabs whichever rule
// happens to be first in the array, not the one for this service's actual country. This
// resolves the country first, from whichever entity the service is scoped to, then looks up
// the (country, serviceType) pair.
export function resolveCountryRuleForService(service, countryRules, legs, stops, airports) {
  let countryIso2 = null;
  if (service.scopeType === 'SEGMENT') {
    countryIso2 = service.scopeId.split(':')[1];
  } else if (service.scopeType === 'LEG') {
    const leg = legs.find((l) => l.id === service.scopeId);
    const airport = leg ? airports.find((a) => a.icao === leg.arrIcao) : null;
    countryIso2 = airport ? airport.iso2 : null;
  } else if (service.scopeType === 'STOP') {
    const stop = stops.find((s) => s.id === service.scopeId);
    const airport = stop ? airports.find((a) => a.icao === stop.icao) : null;
    countryIso2 = airport ? airport.iso2 : null;
  }
  if (!countryIso2) return null;
  return countryRules.find((r) => r.countryIso2 === countryIso2 && r.serviceType === service.serviceType) ?? null;
}
