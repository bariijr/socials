//
// Shared across Leg/Trip cancellation DTOs (and, later, Cluster C's
// financial-disposition records) -- mirrors ChangeVendorDto's
// VENDOR_CHANGE_REASONS pattern: a plain string enum via @IsIn, no DB
// enum, no reference table, matching this codebase's existing
// convention for small closed vocabularies.
export const CANCELLATION_REASONS = [
  'Client Cancelled', 'Aircraft Technical', 'Weather', 'Crew',
  'Schedule Change', 'Permit / Regulatory', 'Operational', 'Commercial',
  'Security', 'Airport Closed', 'Mission Cancelled', 'Duplicate Trip', 'Other',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];
