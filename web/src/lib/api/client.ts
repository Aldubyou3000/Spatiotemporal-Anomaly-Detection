const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RequestOptions = Omit<RequestInit, "body"> & {
  params?: Record<string, string | number | boolean | undefined>;
};

async function request<T>(path: string, init: RequestInit, params?: RequestOptions["params"]): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), { ...init, credentials: "include" });

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    const refreshRes = await fetch(
      new URL("/api/auth/refresh", BASE_URL).toString(),
      { method: "POST", credentials: "include" },
    );
    if (refreshRes.ok) {
      const retryRes = await fetch(url.toString(), { ...init, credentials: "include" });
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

  // 204 No Content
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
