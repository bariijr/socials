// src/server/common/statusTransitions.ts
//
// The server-side source of truth for which status a Trip, Service, or Leg
// may move to next. Every Trip/Service/Leg response the client edits from
// (sheet(), findOne, create, update) carries the current status's legal
// next values as `allowedTransitions` -- the client renders this as-is
// and never re-derives the graph itself.
//
// Vocabulary is unchanged from what's already in production use (see
// CreateTripDto's TRIP_STATUSES / TripDetail.tsx's SERVICE_STATUSES) --
// this formalizes existing values into an enforced graph, it does not
// introduce new ones.
//
// Trip's graph has one role-gated edge (Complete -> Active, reopening a
// completed trip) -- everywhere else `role` is unused and every caller may
// omit it. `role` must be the server-verified JWT role (CurrentUser()),
// never a client-supplied field -- a spoofed role would defeat the gate.

export const TRIP_TRANSITIONS: Record<string, string[]> = {
  'Planning': ['Active', 'Cancelled'],
  'Active': ['Complete', 'Cancelled', 'Planning'],
  'Complete': ['Active'],
  'Cancelled': ['Planning'],
};

// Reopening a Complete trip (forgotten services, corrections, etc.) is
// deliberately restricted to Admins -- everyone else must see and be
// rejected from the same terminal state the graph otherwise implies.
// Exported (not just used internally by tripAllowedTransitions below) so
// TripsService.update() can throw a 403 Forbidden specifically for "valid
// edge, wrong role" -- kept distinct from isValidTripTransition's 400 Bad
// Request for "no such edge at all", since those are different failures
// a client should be able to tell apart.
export function tripReopenAllowed(from: string, role: string | undefined): boolean {
  return from !== 'Complete' || role === 'Admin';
}

export const SERVICE_TRANSITIONS: Record<string, string[]> = {
  'Not Started': ['Requested', 'Submission Pending', 'Not Required', 'Cancelled'],
  'Submission Pending': ['Requested', 'Submission Failed'],
  'Submission Failed': ['Submission Pending', 'Not Started', 'Not Required', 'Cancelled'],
  'Requested': ['Chasing', 'Confirmed', 'Not Required', 'Cancelled'],
  'Chasing': ['Requested', 'Submission Pending', 'Confirmed', 'Not Required', 'Cancelled'],
  'Confirmed': ['Re-confirm Required', 'Cancelled'],
  'Re-confirm Required': ['Confirmed', 'Not Required', 'Cancelled'],
  'Not Required': ['Not Started'],
  'Cancelled': ['Not Started', 'Not Required'],
};

export function isValidTripTransition(from: string, to: string): boolean {
  return (TRIP_TRANSITIONS[from] ?? []).includes(to);
}

export function tripAllowedTransitions(status: string, role?: string): string[] {
  return tripReopenAllowed(status, role) ? (TRIP_TRANSITIONS[status] ?? []) : [];
}

export function isValidServiceTransition(from: string, to: string): boolean {
  return (SERVICE_TRANSITIONS[from] ?? []).includes(to);
}

export function serviceAllowedTransitions(status: string): string[] {
  return SERVICE_TRANSITIONS[status] ?? [];
}

export function withTripTransitions<T extends { status: string }>(
  trip: T,
  role?: string,
): T & { allowedTransitions: string[] } {
  return { ...trip, allowedTransitions: tripAllowedTransitions(trip.status, role) };
}

// Linking an already-verified authorization to a service is a system-
// assisted shortcut, not a coordinator status click -- it may jump
// straight to Confirmed from any "still working on it" status, but must
// never override a coordinator's deliberate Cancelled/Not Required call,
// and linking an already-Confirmed service makes no sense either.
export function serviceAuthorizationLinkAllowed(status: string): boolean {
  return ['Not Started', 'Requested', 'Chasing', 'Re-confirm Required'].includes(status);
}

// Sub-project 3b: Change Vendor is only meaningful once a real request has
// actually been sent to a vendor (Submission Pending/Submission Failed mean
// nothing was ever sent, per the Submission Engine's own "never show
// Requested without a confirmed send" invariant) -- for those two statuses
// the generic Service editor's provider field remains the right tool.
export function changeVendorAllowed(status: string): boolean {
  return ['Requested', 'Chasing', 'Confirmed', 'Re-confirm Required'].includes(status);
}

export function withServiceTransitions<T extends { status: string }>(
  svc: T,
): T & { allowedTransitions: string[] } {
  return { ...svc, allowedTransitions: serviceAllowedTransitions(svc.status) };
}

// Leg Lifecycle & Status Foundation sub-project. Shape mirrors
// TRIP_TRANSITIONS exactly -- Leg didn't have a status at all before this;
// this formalizes the mega-spec's PLANNED/ACTIVE/COMPLETED/CANCELLED
// vocabulary (Title Case, matching the rest of this file) into the same
// bidirectional graph shape Trip already uses, including its own
// Cancelled -> Planned edge (the eventual reinstatement transition -- see
// the design spec for why this edge ships now but its business logic
// (revision increment, Change Impact triggering) does not).
export const LEG_TRANSITIONS: Record<string, string[]> = {
  'Planned': ['Active', 'Cancelled'],
  'Active': ['Completed', 'Cancelled', 'Planned'],
  'Completed': ['Active'],
  'Cancelled': ['Planned'],
};

// Reopening a Completed leg is deliberately restricted to Admins, mirroring
// tripReopenAllowed's rationale exactly (see that function's comment above).
export function legReopenAllowed(from: string, role: string | undefined): boolean {
  return from !== 'Completed' || role === 'Admin';
}

export function isValidLegTransition(from: string, to: string): boolean {
  return (LEG_TRANSITIONS[from] ?? []).includes(to);
}

export function legAllowedTransitions(status: string, role?: string): string[] {
  return legReopenAllowed(status, role) ? (LEG_TRANSITIONS[status] ?? []) : [];
}

export function withLegTransitions<T extends { status: string }>(
  leg: T,
  role?: string,
): T & { allowedTransitions: string[] } {
  return { ...leg, allowedTransitions: legAllowedTransitions(leg.status, role) };
}
