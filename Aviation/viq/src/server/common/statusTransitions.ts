// src/server/common/statusTransitions.ts
//
// The server-side source of truth for which status a Trip or Service may
// move to next. Every Trip/Service response the client edits from
// (sheet(), findOne, create, update) carries the current status's legal
// next values as `allowedTransitions` -- the client renders this as-is
// and never re-derives the graph itself.
//
// Vocabulary is unchanged from what's already in production use (see
// CreateTripDto's TRIP_STATUSES / TripDetail.tsx's SERVICE_STATUSES) --
// this formalizes existing values into an enforced graph, it does not
// introduce new ones.

export const TRIP_TRANSITIONS: Record<string, string[]> = {
  'Planning': ['Active', 'Cancelled'],
  'Active': ['Complete', 'Cancelled', 'Planning'],
  'Complete': [],
  'Cancelled': ['Planning'],
};

export const SERVICE_TRANSITIONS: Record<string, string[]> = {
  'Not Started': ['Requested', 'Not Required', 'Cancelled'],
  'Requested': ['Chasing', 'Confirmed', 'Cancelled'],
  'Chasing': ['Requested', 'Confirmed', 'Cancelled'],
  'Confirmed': ['Re-confirm Required', 'Cancelled'],
  'Re-confirm Required': ['Confirmed', 'Cancelled'],
  'Not Required': ['Not Started'],
  'Cancelled': ['Not Started'],
};

export function isValidTripTransition(from: string, to: string): boolean {
  return (TRIP_TRANSITIONS[from] ?? []).includes(to);
}

export function tripAllowedTransitions(status: string): string[] {
  return TRIP_TRANSITIONS[status] ?? [];
}

export function isValidServiceTransition(from: string, to: string): boolean {
  return (SERVICE_TRANSITIONS[from] ?? []).includes(to);
}

export function serviceAllowedTransitions(status: string): string[] {
  return SERVICE_TRANSITIONS[status] ?? [];
}

export function withTripTransitions<T extends { status: string }>(
  trip: T,
): T & { allowedTransitions: string[] } {
  return { ...trip, allowedTransitions: tripAllowedTransitions(trip.status) };
}

export function withServiceTransitions<T extends { status: string }>(
  svc: T,
): T & { allowedTransitions: string[] } {
  return { ...svc, allowedTransitions: serviceAllowedTransitions(svc.status) };
}
