import { ApiError, apiClient, getDirectToken, setDirectToken } from "./client";
import type { ProcessResult, PipelineProgress } from "@/types/zones";

type ProcessOptions = { signal?: AbortSignal | null; onProgress?: (progress: PipelineProgress) => void };
type JobStatus = { status: string; result?: ProcessResult; detail?: string; progress?: PipelineProgress };

async function ensureDirectToken(): Promise<void> {
  if (typeof window === "undefined" || !window.location.hostname.endsWith("vercel.app") || getDirectToken()) return;
  // Use a longer timeout + retry for Render cold start (first hit after idle is 40-60s).
  // Default apiClient.get is 20s — too short for a cold boot, would fail and leave
  // useDirect=false -> proxied path which then dies at Vercel's 30s edge.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await apiClient.get<{ access_token: string }>("/api/auth/direct-token", {
        timeoutMs: 65_000,
      });
      if (res.access_token) {
        setDirectToken(res.access_token);
        return;
      }
    } catch {
      if (attempt === 0) {
        // Brief backoff before retry — lets Render finish booting.
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      // ignore — fallback to proxied
    }
  }
}

function waitForPoll(delay: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function pollJob(jobId: string, useDirect: boolean, opts?: ProcessOptions): Promise<ProcessResult> {
  let delay = 1500;
  // A healthy processing job has no client deadline; Stop cancels this polling loop.
  while (true) {
    await waitForPoll(delay, opts?.signal);
    let data: JobStatus;
    try {
      data = useDirect
        ? await apiClient.getDirect<JobStatus>(`/api/zones/jobs/${jobId}`, { timeoutMs: 30_000, signal: opts?.signal })
        : await apiClient.get<JobStatus>(`/api/zones/jobs/${jobId}`, { timeoutMs: 30_000, signal: opts?.signal });
    } catch (err) {
      if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const networkFailure = err instanceof TypeError || (err instanceof Error &&
        (err.name === "AbortError" || /timed out|network error|failed to fetch|load failed/i.test(err.message)));
      if (useDirect && (networkFailure || (err instanceof ApiError && [401, 403].includes(err.status)))) {
        if (err instanceof ApiError && err.status === 401) setDirectToken(null);
        useDirect = false;
        continue;
      }
      if (err instanceof ApiError && [404, 410].includes(err.status)) {
        throw new Error("This processing job is no longer available. The server may have restarted or the job expired. Run detection again.");
      }
      if (networkFailure || (err instanceof ApiError && [408, 429, 500, 502, 503, 504].includes(err.status))) {
        delay = Math.min(delay * 2, 15_000);
        continue;
      }
      throw err;
    }
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    delay = 1500;
    if (data.progress) opts?.onProgress?.(data.progress);
    if (data.status === "done" && data.result) return data.result;
    if (data.status === "error") throw new Error(data.detail || "Processing failed — the server rejected the file. Please check the format.");
    if (data.status !== "processing") throw new Error("Invalid processing response. Please contact support.");
  }
}

export const zonesApi = {
  process: async (files: File[], opts?: ProcessOptions): Promise<ProcessResult> => {
    if (files.length === 0) throw new Error("No files selected.");
    // Log for debugging "only one file processed" reports
    if (typeof window !== "undefined") {
      console.info(`[zones] uploading ${files.length} file(s):`, files.map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`).join(", "));
    }
    const form = new FormData();
    // FastAPI expects list[UploadFile] under key "files" — append each file with same key.
    // Preserve original filename so HMDAS station name is used for station_id derivation.
    files.forEach((file) => form.append("files", file, file.name));
    await ensureDirectToken();
    const useDirect = typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app") && !!getDirectToken();
    // Send both async aliases + Prefer header for maximum compatibility with old/new deploys
    // and with Vercel rewrite edge that may normalize query params. Server accepts all three.
    const asyncPath = "/api/zones/process?async=true&async_mode=true";
    const preferHeader: Record<string, string> = { Prefer: "respond-async" };
    // Prefer async (202) to bypass Vercel 30s edge — POST returns in <1s, poll keeps it alive via direct or proxied
    try {
      const res = useDirect
        ? await apiClient.uploadDirect<{ job_id: string; status: string }>(asyncPath, form, { headers: preferHeader, signal: opts?.signal })
        : await apiClient.upload<{ job_id: string; status: string }>(asyncPath, form, { headers: preferHeader, signal: opts?.signal });
      const jobId = (res as unknown as { job_id?: string }).job_id;
      if (jobId) return pollJob(jobId, useDirect, opts);
      // Fallback: server returned direct ProcessResult (old sync / single-file fast path)
      return res as unknown as ProcessResult;
    } catch (err) {
      if (opts?.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // If async endpoint missing (old deploy) or direct CORS blocked, fallback intelligently
      if ((err instanceof ApiError && err.status === 404) || msg.includes("404") || msg.includes("Not Found") || msg.includes("not found")) {
        // Try sync direct first if we have a token, else proxied
        if (useDirect) {
          try {
            return await apiClient.uploadDirect<ProcessResult>("/api/zones/process", form, { signal: opts?.signal });
          } catch {
            return apiClient.upload<ProcessResult>("/api/zones/process", form, { signal: opts?.signal });
          }
        }
        return apiClient.upload<ProcessResult>("/api/zones/process", form, { signal: opts?.signal });
      }
      // Direct path failed due to CORS / auth — retry via proxied path once
      if (useDirect && ((err instanceof ApiError && err.status === 401) || msg.includes("CORS") || msg.includes("Failed to fetch") || msg.includes("401") || msg.includes("Not authenticated"))) {
        if (err instanceof ApiError && err.status === 401) setDirectToken(null);
        console.warn("[zones] direct upload failed, retrying via proxied path:", msg);
        const res2 = await apiClient.upload<{ job_id: string; status: string }>(asyncPath, form, { headers: preferHeader, signal: opts?.signal });
        const jobId2 = (res2 as unknown as { job_id?: string }).job_id;
        if (jobId2) return pollJob(jobId2, false, opts);
        return res2 as unknown as ProcessResult;
      }
      throw err;
    }
  },
};
