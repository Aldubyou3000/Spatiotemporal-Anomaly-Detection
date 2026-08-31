import { apiClient, getDirectToken, setDirectToken } from "./client";
import type { ProcessResult } from "@/types/zones";

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

async function pollJob(jobId: string, useDirect: boolean, opts?: { signal?: AbortSignal | null }): Promise<ProcessResult> {
  // Poll every 1.5s up to 180s (120 tries) — covers cold start 50s + 2.05 MB 4-file LOF 45s + margin.
  // Handles both direct (Bearer) and proxied (cookie) naturally; if direct token expired mid-poll,
  // fall back to proxied polling so the job isn't lost.
  for (let i = 0; i < 120; i++) {
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((r) => setTimeout(r, 1500));
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let data: { status: string; result?: ProcessResult; detail?: string };
    try {
      data = useDirect
        ? await apiClient.getDirect<{ status: string; result?: ProcessResult; detail?: string }>(`/api/zones/jobs/${jobId}`, { timeoutMs: 30_000, signal: opts?.signal })
        : await apiClient.get<{ status: string; result?: ProcessResult; detail?: string }>(`/api/zones/jobs/${jobId}`, { timeoutMs: 30_000, signal: opts?.signal });
    } catch (err) {
      if (opts?.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // If direct Bearer was rejected (401) or CORS-blocked, try proxied once as fallback
      if (useDirect && (msg.includes("401") || msg.includes("CORS") || msg.includes("Failed to fetch") || msg.includes("Not authenticated"))) {
        try {
          data = await apiClient.get<{ status: string; result?: ProcessResult; detail?: string }>(`/api/zones/jobs/${jobId}`, { timeoutMs: 30_000, signal: opts?.signal });
        } catch {
          // transient — keep polling
          continue;
        }
      } else {
        // Transient network/CORS hiccup — don't abort the whole poll, just retry next tick
        // (Render may be briefly overloaded). Log and continue.
        if (msg.includes("timed out") || msg.includes("Network error") || msg.includes("Failed to fetch") || msg.includes("aborted")) {
          continue;
        }
        throw err;
      }
    }
    if (data.status === "done" && data.result) return data.result;
    if (data.status === "error") throw new Error(data.detail || "Processing failed — the server rejected the file. Please check the format.");
    if (data.status === "processing") continue;
    // Unknown status — keep polling
  }
  throw new Error("Processing is taking longer than expected (server may be busy). Please keep this tab open and try again in 30s — your job may still be finishing.");
}

export const zonesApi = {
  process: async (files: File[], opts?: { signal?: AbortSignal | null }): Promise<ProcessResult> => {
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
      if (msg.includes("404") || msg.includes("Not Found") || msg.includes("not found")) {
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
      if (useDirect && (msg.includes("CORS") || msg.includes("Failed to fetch") || msg.includes("401") || msg.includes("Not authenticated"))) {
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
