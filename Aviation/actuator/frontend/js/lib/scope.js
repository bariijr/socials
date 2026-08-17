const SERVICE_TYPE_SCOPE = {
  OVERFLIGHT_PERMIT: 'SEGMENT',
  LANDING_PERMIT: 'LEG',
  FUEL: 'STOP',
  HANDLING: 'STOP',
  CATERING: 'STOP',
  CREW_TRANSPORT: 'STOP',
  CUSTOMS: 'STOP',
};

export function scopeTypeForServiceType(serviceType) {
  return SERVICE_TYPE_SCOPE[serviceType];
}

export function getScopeCandidates(serviceType, legs, stops) {
  const scopeType = scopeTypeForServiceType(serviceType);
  if (scopeType === 'LEG') {
    return legs.map((l) => ({ scopeId: l.id, label: `${l.depIcao} → ${l.arrIcao} (ETD ${l.etdZ})` }));
  }
  if (scopeType === 'STOP') {
    return stops.map((s) => ({ scopeId: s.id, label: `${s.icao} (${s.purpose})` }));
  }
  const candidates = [];
  for (const leg of legs) {
    for (const iso2 of leg.overflightCountries) {
      candidates.push({ scopeId: `${leg.id}:${iso2}`, label: `${leg.depIcao} → ${leg.arrIcao}: overflying ${iso2}` });
    }
  }
  return candidates;
}
