/** Decodes the stored JWT's `role` claim for UI gating only — never trust
 * this for actual authorization. The backend's require_write_access /
 * require_delete_access (app/api/deps.py) are the real enforcement; this
 * only hides controls a click would 403 on anyway.
 */
export function getCurrentUserRole(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem("jetelio_access_token");
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}

export function canWrite(role: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "OPERATIONS_SPECIALIST";
}

export function canDelete(role: string | null): boolean {
  return role === "SUPER_ADMIN";
}
