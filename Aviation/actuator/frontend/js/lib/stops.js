export function deriveStopsFromLegs(tripId, legs) {
  const sorted = [...legs].sort((a, b) => a.sequence - b.sequence);
  const result = [];

  sorted.forEach((leg, index) => {
    const isFirst = index === 0;
    const isLast = index === sorted.length - 1;

    if (isFirst) {
      result.push({ tripId, icao: leg.depIcao, arrZ: null, depZ: leg.etdZ, groundTimeHours: null, purpose: 'TURNAROUND' });
    }

    if (isLast) {
      result.push({ tripId, icao: leg.arrIcao, arrZ: leg.etaZ, depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' });
    } else {
      const nextLeg = sorted[index + 1];
      if (leg.etaZ === null) {
        // ETA not known yet (TBD) — the stop exists so staff can attach a handler, but ground
        // time and a TECH_STOP/NIGHT_STOP call can't be made until the leg's ETA is filled in.
        result.push({ tripId, icao: leg.arrIcao, arrZ: null, depZ: nextLeg.etdZ, groundTimeHours: null, purpose: 'TECH_STOP' });
      } else {
        const groundTimeHours = (new Date(nextLeg.etdZ).getTime() - new Date(leg.etaZ).getTime()) / 3_600_000;
        const purpose = groundTimeHours > 8 ? 'NIGHT_STOP' : 'TECH_STOP';
        result.push({ tripId, icao: leg.arrIcao, arrZ: leg.etaZ, depZ: nextLeg.etdZ, groundTimeHours, purpose });
      }
    }
  });

  return result;
}

export function diffStopsForRebuild(tripId, legs, existingStops, hasAttachedServices) {
  const derived = deriveStopsFromLegs(tripId, legs);
  const derivedIcaos = new Set(derived.map((d) => d.icao));
  const existingIcaos = new Set(existingStops.map((s) => s.icao));

  const stillOnRoute = existingStops.filter((s) => derivedIcaos.has(s.icao));
  const offRoute = existingStops.filter((s) => !derivedIcaos.has(s.icao));
  const offRouteWithServices = offRoute.filter((s) => hasAttachedServices(s.id));
  const offRouteWithoutServices = offRoute.filter((s) => !hasAttachedServices(s.id));

  return {
    kept: [...stillOnRoute, ...offRouteWithServices],
    added: derived.filter((d) => !existingIcaos.has(d.icao)),
    orphaned: offRouteWithoutServices,
  };
}
