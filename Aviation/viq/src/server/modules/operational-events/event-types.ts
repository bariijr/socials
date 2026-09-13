// The full event vocabulary from the mega-spec's §70, typed now so later
// phases never need to change this file's shape -- only add a new
// `emit()` call site in the service that owns that event's workflow.
// An event type with no real emit() call site anywhere yet is "inert":
// legal to reference, never fired. This plan wires four: LEG_CANCELLED,
// TRIP_CANCELLED, SERVICE_CANCELLED, LEG_STATUS_CHANGED. Every other
// type below is inert until its owning phase adds a real call site.
export type OperationalEvent =
  | { type: 'TRIP_CREATED'; tripId: string; user: string }
  | { type: 'TRIP_CHANGED'; tripId: string; user: string }
  | { type: 'TRIP_CANCELLED'; tripId: string; reason: string; user: string }
  | { type: 'LEG_STATUS_CHANGED'; legId: string; tripId: string; from: string; to: string; user: string }
  | { type: 'LEG_CANCELLED'; legId: string; tripId: string; reason: string; user: string }
  | { type: 'LEG_REINSTATED'; legId: string; tripId: string; user: string }
  | { type: 'SERVICE_REQUESTED'; svcId: string; tripId: string; user: string }
  | { type: 'SERVICE_CONFIRMED'; svcId: string; tripId: string; user: string }
  | { type: 'SERVICE_CHANGED'; svcId: string; tripId: string; user: string }
  | { type: 'SERVICE_CANCELLED'; svcId: string; tripId: string; providerId: string | null; reason: string; user: string }
  | { type: 'VENDOR_CHANGED'; svcId: string; user: string }
  | { type: 'VENDOR_RESPONDED'; svcId: string; user: string }
  | { type: 'DOCUMENT_ADDED'; documentId: string; user: string }
  | { type: 'DOCUMENT_VERIFIED'; documentId: string; user: string }
  | { type: 'DOCUMENT_EXPIRED'; documentId: string }
  | { type: 'TASK_OVERDUE'; taskId: string }
  | { type: 'INVOICE_RECEIVED'; invoiceId: string }
  | { type: 'PAYMENT_RECORDED'; invoiceId: string };

export type OperationalEventOfType<T extends OperationalEvent['type']> =
  Extract<OperationalEvent, { type: T }>;
