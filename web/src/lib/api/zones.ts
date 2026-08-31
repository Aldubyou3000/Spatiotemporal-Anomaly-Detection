import { apiClient, getDirectToken, setDirectToken } from "./client";
import type { ProcessResult } from "@/types/zones";

async function ensureDirectToken(): Promise<void> {
  if (typeof window === "undefined" || !window.location.hostname.endsWith("vercel.app") || getDirectToken()) return;
  try {
    const res = await apiClient.get<{ access_token: string }>("/api/auth/direct-token");
    if (res.access_token) setDirectToken(res.access_token);
  } catch {
    // ignore — fallback to proxied
  }
}

async function pollJob(jobId: string, useDirect: boolean): Promise<ProcessResult> {
  const direct = useDirect;
  // Poll every 1.5s up to 120s (80 tries) — covers cold start 50s + LOF 45s
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const data = direct
      ? await apiClient.getDirect<{ status: string; result?: ProcessResult; detail?: string }>(`/api/zones/jobs/${jobId}`)
      : await apiClient.get<{ status: string; result?: ProcessResult; detail?: string }>(`/api/zones/jobs/${jobId}`);
    if (data.status === "done" && data.result) return data.result;
    if (data.status === "error") throw new Error(data.detail || "Processing failed");
  }
  throw new Error("Processing timed out — please try again (Render may be waking up).");
}

export const zonesApi = {
  process: async (files: File[]): Promise<ProcessResult> => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    await ensureDirectToken();
    const useDirect = typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app") && !!getDirectToken();
    const asyncPath = "/api/zones/process?async=true";
    // Prefer async (202) to bypass Vercel 30s edge — POST returns instantly, poll keeps it alive
    try {
      const res = useDirect
        ? await apiClient.uploadDirect<{ job_id: string; status: string }>(asyncPath, form)
        : await apiClient.upload<{ job_id: string; status: string }>(asyncPath, form);
      const jobId = (res as unknown as { job_id?: string }).job_id;
      if (jobId) return pollJob(jobId, useDirect);
      // Fallback: server returned direct ProcessResult (old sync)
      return res as unknown as ProcessResult;
    } catch (err) {
      // If async endpoint missing (old deploy), fallback to sync
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.includes("Not Found")) {
        if (useDirect) return apiClient.uploadDirect<ProcessResult>("/api/zones/process", form);
        return apiClient.upload<ProcessResult>("/api/zones/process", form);
      }
      throw err;
    }
  },
};
