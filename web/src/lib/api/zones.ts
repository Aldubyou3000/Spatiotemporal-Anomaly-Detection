import { apiClient, getDirectToken } from "./client";
import type { ProcessResult } from "@/types/zones";

export const zonesApi = {
  process: (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    // On Vercel, bypass the 30s edge proxy for the heavy 4-file LOF (25-45s on 0.1 CPU).
    // Direct to Render with Bearer (no cookies needed) avoids timeout.
    if (typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app") && getDirectToken()) {
      return apiClient.uploadDirect<ProcessResult>("/api/zones/process", form);
    }
    return apiClient.upload<ProcessResult>("/api/zones/process", form);
  },
};
