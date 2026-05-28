const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RequestOptions = Omit<RequestInit, "body"> & {
  params?: Record<string, string | number | boolean | undefined>;
};

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Read the csrf_token cookie value (set by the backend, readable by JS — not httpOnly).
 * Returns an empty string if the cookie is absent (e.g., not yet authenticated).
 */
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Attach X-CSRF-Token header to all state-mutating requests.
 * The backend validates that the header value matches the httpOnly csrf_token cookie
 * (double-submit pattern).  A cross-site attacker cannot read the cookie, so they
 * cannot supply the correct header.
 */
function withCsrf(method: string, headers: HeadersInit): HeadersInit {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return headers;
  const token = getCsrfToken();
  if (!token) return headers;
  return { ...headers as Record<string, string>, "X-CSRF-Token": token };
}

async function request<T>(path: string, init: RequestInit, params?: RequestOptions["params"]): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const method = init.method ?? "GET";
  const headers = withCsrf(method, init.headers ?? {});
  const enrichedInit = { ...init, headers, credentials: "include" as RequestCredentials };

  const res = await fetch(url.toString(), enrichedInit);

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    // Access token expired — attempt silent refresh
    const refreshRes = await fetch(
      new URL("/api/auth/refresh", BASE_URL).toString(),
      {
        method: "POST",
        credentials: "include",
        // Refresh also needs the CSRF token (the cookie is still present)
        headers: withCsrf("POST", {}),
      },
    );
    if (refreshRes.ok) {
      // Re-attach a fresh CSRF token (the refresh response rotated it)
      const retryHeaders = withCsrf(method, init.headers ?? {});
      const retryRes = await fetch(url.toString(), {
        ...init,
        headers: retryHeaders,
        credentials: "include",
      });
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
  get: <T>(path: string, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: "GET", headers: withJson(options.headers) }, options.params),

  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(
      path,
      {
        ...options,
        method: "POST",
        headers: withJson(options.headers),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      options.params,
    ),

  patch: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(
      path,
      {
        ...options,
        method: "PATCH",
        headers: withJson(options.headers),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      options.params,
    ),

  delete: <T>(path: string, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: "DELETE", headers: withJson(options.headers) }, options.params),

  /** Upload multipart/form-data — browser sets Content-Type with boundary. */
  upload: <T>(path: string, formData: FormData, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: "POST", body: formData }, options.params),
};
