import { apiClient } from "./client";
import type { ProcessResult } from "@/types/zones";

export const zonesApi = {
  process: (file: File, contamination = 0.05) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.upload<ProcessResult>("/api/zones/process", form, {
      params: { contamination },
    });
  },
};
