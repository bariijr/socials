// ─────────────────────────────────────────────────────────────────────────────
// VIQ — Great-Circle Route Geography
// Determines which reference countries a route overflies. There's no country
// boundary/polygon data in this app (only per-country centroids), so this
// samples points along the great-circle path and attributes each to its
// nearest reference-country centroid — an approximation, not a true
// airspace-boundary intersection, but sufficient to drive permit planning
// off the countries this app actually has rules for.
// ─────────────────────────────────────────────────────────────────────────────

import type { Airport, Country, Urgency } from '@/data/types';

const EARTH_RADIUS_NM = 3440.065;
const SAMPLE_INTERVAL_NM = 150; // roughly one sample every 150nm along the route

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineNM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

// Spherical linear interpolation along the great circle, fraction f in [0, 1].
function intermediatePoint(
  lat1: number, lng1: number, lat2: number, lng2: number, f: number
): [number, number] {
  const phi1 = toRad(lat1), lam1 = toRad(lng1);
  const phi2 = toRad(lat2), lam2 = toRad(lng2);
  const d = 2 * Math.asin(
    Math.sqrt(Math.sin((phi2 - phi1) / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2)
  );
  if (d === 0) return [lat1, lng1];
  const a = Math.sin((1 - f) * d) / Math.sin(d);
  const b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(phi1) * Math.cos(lam1) + b * Math.cos(phi2) * Math.cos(lam2);
  const y = a * Math.cos(phi1) * Math.sin(lam1) + b * Math.cos(phi2) * Math.sin(lam2);
  const z = a * Math.sin(phi1) + b * Math.sin(phi2);
  const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lam = Math.atan2(y, x);
  return [toDeg(phi), toDeg(lam)];
}

export function greatCirclePoints(
  lat1: number, lng1: number, lat2: number, lng2: number
): [number, number][] {
  const totalNM = haversineNM(lat1, lng1, lat2, lng2);
  const segments = Math.max(2, Math.round(totalNM / SAMPLE_INTERVAL_NM));
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(intermediatePoint(lat1, lng1, lat2, lng2, i / segments));
  }
  return points;
}

export function nearestCountryISO2(lat: number, lng: number, countries: Country[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of countries) {
    const dist = haversineNM(lat, lng, c.CentroidLat, c.CentroidLng);
    if (dist < bestDist) {
      bestDist = dist;
      best = c.ISO2;
    }
  }
  return best;
}

// Countries the route between depICAO and arrICAO passes over, excluding the
// departure and arrival countries themselves (those are handled by landing/
// departure permits, not overflight), in path order, deduplicated.
export function computeOverflightCountries(
  depICAO: string, arrICAO: string, airports: Airport[], countries: Country[]
): string[] {
  const dep = airports.find((a) => a.ICAO === depICAO);
  const arr = airports.find((a) => a.ICAO === arrICAO);
  if (!dep || !arr) return [];

  const points = greatCirclePoints(dep.Latitude, dep.Longitude, arr.Latitude, arr.Longitude);
  const sequence: string[] = [];
  for (const [lat, lng] of points) {
    const iso2 = nearestCountryISO2(lat, lng, countries);
    if (iso2 && sequence[sequence.length - 1] !== iso2) {
      sequence.push(iso2);
    }
  }

  const excluded = new Set([dep.CountryISO2, arr.CountryISO2]);
  return [...new Set(sequence.filter((iso2) => !excluded.has(iso2)))];
}

// Matches the BREACH/URGENT/DUE/OK thresholds already used for the deadline
// rail and urgency badges elsewhere in the app.
export function computeUrgency(requiredByZ: string, nowZ: string): Urgency {
  const hours = (new Date(requiredByZ).getTime() - new Date(nowZ).getTime()) / (1000 * 60 * 60);
  if (hours < 0) return 'BREACH';
  if (hours < 12) return 'URGENT';
  if (hours < 48) return 'DUE';
  return 'OK';
}
