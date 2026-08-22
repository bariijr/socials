import type { Leg } from './api-client';

export function findMostRecentByTail(legs: Leg[], tail: string): Leg | undefined {
  const needle = tail.trim().toUpperCase();
  if (!needle) return undefined;

  const matches = legs.filter((leg) => leg.tail?.toUpperCase() === needle);
  if (matches.length === 0) return undefined;

  return matches.reduce((latest, leg) => (leg.legId > latest.legId ? leg : latest));
}
