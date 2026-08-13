/** Adds a fractional number of hours to an ISO datetime string, returning a
 * new ISO string. Previously duplicated inline (`date.getTime() + eetHours *
 * 3600_000`) in RoutePreviewPanel.tsx and LegEditor.tsx — factored out here
 * since LegEditor's departure→arrival EET prefill (task #116) needed a third
 * call site. Returns null if the input isn't a valid datetime.
 */
export function addHours(iso: string, hours: number): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + hours * 3600_000).toISOString();
}
