/** Case-insensitive substring match against any of the given fields —
 * shared by the admin list pages' client-side search boxes (Trips,
 * Countries, Operators, Fleet, Vendors). An empty query matches
 * everything; null/undefined fields are skipped rather than throwing. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
