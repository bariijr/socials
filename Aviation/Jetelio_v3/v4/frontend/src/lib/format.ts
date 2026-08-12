const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13-Aug-2026 12:30Z" — UTC, matches the format flight ops actually files in. */
export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTHS[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day}-${month}-${d.getUTCFullYear()} ${hh}:${mm}Z`;
}

/** "13-Aug-2026" — date-only variant of formatUtc, for calendar-date fields
 * (document expiries etc.) that carry no meaningful time-of-day component. */
export function formatUtcDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTHS[d.getUTCMonth()];
  return `${day}-${month}-${d.getUTCFullYear()}`;
}

// The stored TripSource enum value (PUBLIC_FEASIBILITY_IQ) predates the
// Viability IQ (VIQ) rename — special-cased here rather than renamed in the
// database/API, which would touch schema/enum names for no functional gain.
export function formatTripSource(source: string): string {
  if (source === "PUBLIC_FEASIBILITY_IQ") return "Public Viability IQ (VIQ)";
  return source.replace(/_/g, " ");
}
