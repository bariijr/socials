const API_BASE = '/api';
const TOKEN_KEY = 'viq_auth_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export const AUTH_EXPIRED_EVENT = 'viq:auth-expired';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  // Login itself uses a raw fetch, not apiFetch, so every 401 seen here comes
  // from the JWT guard rejecting an expired/invalid token on a protected
  // route — safe to treat as "log the user out" unconditionally.
  if (res.status === 401) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  return res;
}
