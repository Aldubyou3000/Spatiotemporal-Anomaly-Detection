import { apiClient } from "./client";
import type { ProcessResult } from "@/types/zones";

export const zonesApi = {
  process: (files: File[], contamination = 0.05) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return apiClient.upload<ProcessResult>("/api/zones/process", form, {
      params: { contamination },
    });
  },
};
