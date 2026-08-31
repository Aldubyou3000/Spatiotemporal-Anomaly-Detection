const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DIRECT_BASE = BASE_URL; // Render direct — bypasses Vercel 30s proxy timeout for large uploads

// Direct Bearer token for zones upload (bypasses Vercel proxy). Stored after login.
let _directToken: string | null = null;
if (typeof window !== "undefined") {
  _directToken = sessionStorage.getItem("direct_access_token");
}
export function setDirectToken(token: string | null) {
  _directToken = token;
  if (typeof window !== "undefined") {
    if (token) sessionStorage.setItem("direct_access_token", token);
    else sessionStorage.removeItem("direct_access_token");
  }
}
export function getDirectToken(): string | null {
  return _directToken;
}

// On the Vercel deployment, call the API same-origin ("/api/...") — next.config.ts
// rewrites proxy it to Render. Cookies become first-party on vercel.app, so Chrome
// never applies third-party blocking / CHIPS purging. Localhost dev still hits
// :8000 directly (no rewrite is registered for localhost).
function apiBase(): string {
  if (typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app")) {
    return window.location.origin;
  }
  return BASE_URL;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  params?: Record<string, string | number | boolean | undefined>;
};

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Timeout defaults — 20s normal, 90s heavy (zones 4-file LOF + cold start), 10s for refresh. Render free-tier cold start is 40-60s so login uses 60s.
export const DEFAULT_TIMEOUT_MS = 20_000;
export const HEAVY_TIMEOUT_MS = 90_000;

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function withCsrf(method: string, headers: HeadersInit): HeadersInit {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return headers;
  const token = getCsrfToken();
  if (!token) return headers;
  return { ...headers as Record<string, string>, "X-CSRF-Token": token };
}

function isAbortError(err: unknown): boolean {
  return (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError")
    || (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted")));
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number; signal?: AbortSignal | null } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: outerSignal, ...rest } = init as RequestInit & { timeoutMs?: number; signal?: AbortSignal | null };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let signal: AbortSignal = controller.signal as AbortSignal;
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    signal = controller.signal as AbortSignal;
  }
  try {
    return await fetch(input, { ...rest, signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Single in-flight refresh promise shared across all concurrent requests.
// When multiple requests get a 401 simultaneously, only one refresh call is
// made; all callers await the same promise and retry with the rotated cookies.
let _refreshPromise: Promise<boolean> | null = null;

async function _doRefresh(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(new URL("/api/auth/refresh", apiBase()).toString(), {
      method: "POST",
      credentials: "include",
      headers: withCsrf("POST", {}),
      timeoutMs: 10_000,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    _refreshPromise = null;
  }
}

function _refresh(): Promise<boolean> {
  if (!_refreshPromise) {
    _refreshPromise = _doRefresh();
  }
  return _refreshPromise;
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number; signal?: AbortSignal | null }, params?: RequestOptions["params"]): Promise<T> {
  const url = new URL(path, apiBase());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const method = init.method ?? "GET";
  const headers = withCsrf(method, init.headers ?? {});
  const enrichedInit = { ...init, headers, credentials: "include" as RequestCredentials };

  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), enrichedInit as RequestInit & { timeoutMs?: number });
  } catch (err: unknown) {
    if (isAbortError(err)) {
      // Auto-retry once for cold-start — Render free wakes 40-60s, Vercel proxy caps ~30s.
      // Second hit is warm. Applies to login (60s) and zones heavy (90s).
      const isColdStartPath = path.includes("/api/auth/login") || path.includes("/api/zones/process") || path.includes("/api/auth/refresh");
      if (isColdStartPath && typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app") && (init.timeoutMs ?? DEFAULT_TIMEOUT_MS) >= 30_000) {
        try {
          await new Promise((r) => setTimeout(r, 1500));
          res = await fetchWithTimeout(url.toString(), enrichedInit as RequestInit & { timeoutMs?: number });
        } catch (err2: unknown) {
          if (isAbortError(err2)) throw new Error("Request timed out — server is waking up (Render cold start). Please wait 10s and try again.");
          throw err2 instanceof Error ? err2 : new Error("Network error — check your connection.");
        }
      } else {
        throw new Error("Request timed out — server may be waking up (Render cold start), please try again.");
      }
    } else {
      throw err instanceof Error ? err : new Error("Network error — check your connection.");
    }
  }

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    const refreshed = await _refresh();
    if (refreshed) {
      // Re-read CSRF after rotation (the refresh endpoint rotated it)
      const retryHeaders = withCsrf(method, init.headers ?? {});
      let retryRes: Response;
      try {
        retryRes = await fetchWithTimeout(url.toString(), {
          ...init,
          headers: retryHeaders,
          credentials: "include",
        } as RequestInit & { timeoutMs?: number });
      } catch (err: unknown) {
        if (isAbortError(err)) throw new Error("Request timed out — server may be waking up (Render cold start), please try again.");
        throw err instanceof Error ? err : new Error("Network error — check your connection.");
      }
      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(body?.detail ?? body?.message ?? "Request failed");
      }
      if (retryRes.status === 204) return undefined as T;
      return retryRes.json() as Promise<T>;
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body?.detail ?? body?.message ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function withJson(headers?: HeadersInit): HeadersInit {
  return { "Content-Type": "application/json", ...(headers || {}) };
}

export const apiClient = {
  get: <T>(path: string, options: RequestOptions & { timeoutMs?: number; signal?: AbortSignal | null } = {}) =>
    request<T>(path, { ...options, method: "GET", headers: withJson(options.headers) } as RequestInit & { timeoutMs?: number }, options.params),

  post: <T>(path: string, body?: unknown, options: RequestOptions & { timeoutMs?: number; signal?: AbortSignal | null } = {}) =>
    request<T>(
      path,
      {
        ...options,
        method: "POST",
        headers: withJson(options.headers),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      } as RequestInit & { timeoutMs?: number },
      options.params,
    ),

  patch: <T>(path: string, body?: unknown, options: RequestOptions & { timeoutMs?: number; signal?: AbortSignal | null } = {}) =>
    request<T>(
      path,
      {
        ...options,
        method: "PATCH",
        headers: withJson(options.headers),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      } as RequestInit & { timeoutMs?: number },
      options.params,
    ),

  delete: <T>(path: string, options: RequestOptions & { timeoutMs?: number; signal?: AbortSignal | null } = {}) =>
    request<T>(path, { ...options, method: "DELETE", headers: withJson(options.headers) } as RequestInit & { timeoutMs?: number }, options.params),

  /** Upload multipart/form-data — browser sets Content-Type with boundary. */
  upload: <T>(path: string, formData: FormData, options: RequestOptions & { timeoutMs?: number; signal?: AbortSignal | null } = {}) =>
    request<T>(path, { ...options, method: "POST", body: formData, timeoutMs: HEAVY_TIMEOUT_MS } as RequestInit & { timeoutMs?: number }, options.params),

  /** Direct upload to Render — bypasses Vercel proxy (avoids 30s timeout for 4-file LOF). */
  uploadDirect: async <T>(path: string, formData: FormData, opts: { timeoutMs?: number; signal?: AbortSignal | null } = {}): Promise<T> => {
    const token = getDirectToken();
    const url = new URL(path, DIRECT_BASE).toString();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    // CSRF not needed for Bearer auth
    const timeoutMs = opts.timeoutMs ?? HEAVY_TIMEOUT_MS;
    let res: Response;
    try {
      res = await fetchWithTimeout(url, { method: "POST", body: formData, headers, credentials: "omit", timeoutMs, signal: opts.signal });
    } catch (err: unknown) {
      if (isAbortError(err)) {
        // Same cold-start retry as proxied path — Render wake 40-60s, direct still times out if cold
        const isColdStartPath = path.includes("/api/zones/process");
        if (isColdStartPath && typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app") && timeoutMs >= 30_000) {
          try {
            await new Promise((r) => setTimeout(r, 1500));
            res = await fetchWithTimeout(url, { method: "POST", body: formData, headers, credentials: "omit", timeoutMs, signal: opts.signal });
          } catch (err2: unknown) {
            if (isAbortError(err2)) throw new Error("Request timed out — server is waking up (Render cold start). Please wait 10s and try again.");
            throw err2 instanceof Error ? err2 : new Error("Network error — check your connection.");
          }
        } else {
          throw new Error("Request timed out — server may be waking up (Render cold start), please try again.");
        }
      } else {
        throw err instanceof Error ? err : new Error("Network error — check your connection.");
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: "Request failed" }));
      // Surface 503 from tickets workload as friendly retry message; SWR will retry
      throw new Error(body?.detail ?? body?.message ?? "Request failed");
    }
    return res.json() as Promise<T>;
  },
};
