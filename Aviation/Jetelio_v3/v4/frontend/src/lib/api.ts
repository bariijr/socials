const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const ACCESS_TOKEN_KEY = "jetelio_access_token";
const REFRESH_TOKEN_KEY = "jetelio_refresh_token";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

function getAccessToken(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null;
}

function clearTokensAndRedirectToLogin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

// Access tokens expire after 30 minutes (app.config.jwt_access_token_expire_minutes)
// with no prior refresh handling — a session left open past that window went
// silently blank (every query 401ing, nothing rendered, no prompt to sign
// back in). Concurrent 401s share one in-flight refresh call rather than
// each firing their own.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = typeof window !== "undefined" ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null;
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const tokens = (await res.json()) as { access_token: string; refresh_token: string };
        window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
        window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
        return tokens.access_token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function throwApiError(res: Response): Promise<never> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no body
  }
  throw new ApiError(res.status, body);
}

const AUTH_ENDPOINTS = ["/auth/login", "/auth/refresh"];

// One retry after a successful token refresh; a second 401 (or a failed
// refresh) means the session is genuinely over — clear it and send the
// user back to /login instead of leaving the page silently empty.
async function fetchWithAuthRetry(path: string, init: RequestInit): Promise<Response> {
  const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => path.startsWith(p));
  const token = getAccessToken();
  const withAuthHeader = (t: string | null): RequestInit => ({
    ...init,
    headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(init.headers || {}) },
  });

  const res = await fetch(`${API_BASE}${path}`, { ...withAuthHeader(token), cache: "no-store" });
  if (res.status !== 401 || isAuthEndpoint) return res;

  const newToken = await refreshAccessToken();
  if (!newToken) {
    clearTokensAndRedirectToLogin();
    return res;
  }
  return fetch(`${API_BASE}${path}`, { ...withAuthHeader(newToken), cache: "no-store" });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuthRetry(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) return throwApiError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestUpload<T>(path: string, formData: FormData): Promise<T> {
  // No Content-Type here — the browser sets multipart/form-data with the
  // correct boundary itself; forcing application/json (like `request`
  // does for every other call) would break the upload.
  const res = await fetchWithAuthRetry(path, { method: "POST", body: formData });
  if (!res.ok) return throwApiError(res);
  return res.json() as Promise<T>;
}

async function requestDownload(path: string): Promise<Blob> {
  const res = await fetchWithAuthRetry(path, { method: "GET" });
  if (!res.ok) return throwApiError(res);
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => requestUpload<T>(path, formData),
  download: (path: string) => requestDownload(path),
};
