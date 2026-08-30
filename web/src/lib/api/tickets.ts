import { apiClient } from "./client";
import type {
  TicketAttachment,
  TicketCreate,
  TicketDetail,
  TicketListResponse,
  TicketUpdate,
  Technician,
} from "@/types/tickets";

export interface TicketListParams {
  status?: string;
  priority?: string;
  station_id?: string;
  limit?: number;
  offset?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface TicketReport {
  id: string;
  notes: string | null;
  severity: "low" | "medium" | "high" | null;
  root_cause: string | null;
  corrective_action: string | null;
  issue_resolved: boolean | null;
  submitted_at: string | null;
  analyst_approved: boolean;
  analyst_approved_at: string | null;
  analyst_notes: string | null;
  /** The analyst note that sent THIS round back (archived rounds only; null if not recorded). */
  follow_up_notes: string | null;
  round: number;
  is_active: boolean;
  photos: { id: string; photo_url: string }[];
}

/** Full inspection history for a ticket: the active round + every archived round. */
export interface TicketReportHistory {
  current: TicketReport | null;
  history: TicketReport[]; // archived rounds, ascending by round (oldest-first)
}

export const ticketsApi = {
  list: (params: TicketListParams = {}) =>
    apiClient.get<TicketListResponse>("/api/tickets", { params }),

  get: (id: string) =>
    apiClient.get<TicketDetail>(`/api/tickets/${id}`),

  create: (body: TicketCreate) =>
    apiClient.post<TicketDetail>("/api/tickets", body),

  update: (id: string, body: TicketUpdate) =>
    apiClient.patch<TicketDetail>(`/api/tickets/${id}`, body),

  listTechnicians: () =>
    apiClient.get<Technician[]>("/api/tickets/technicians"),

  assignTechnicians: (id: string, technician_ids: string[], reason?: string) =>
    apiClient.post<TicketDetail>(`/api/tickets/${id}/technicians`, { technician_ids, reason }),

  removeTechnician: (id: string, userId: string, reason?: string) =>
    apiClient.delete<TicketDetail>(`/api/tickets/${id}/technicians/${userId}`, reason ? { params: { reason } } : {}),

  requestFollowUp: (id: string, follow_up_notes: string) =>
    apiClient.post<TicketDetail>(`/api/tickets/${id}/follow-up`, { follow_up_notes }),

  cancelTicket: (id: string, reason: string) =>
    apiClient.post<TicketDetail>(`/api/tickets/${id}/cancel`, { reason }),

  attachments: (id: string) =>
    apiClient.get<TicketAttachment[]>(`/api/tickets/${id}/attachments`),

  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.upload<{ file_url: string; file_name: string; path: string }>(
      `/api/tickets/${id}/attachments`,
      form,
    );
  },

  report: (id: string) =>
    apiClient.get<TicketReportHistory>(`/api/tickets/${id}/report`),

  downloadPdf: async (id: string, filename: string, opts: { signal?: AbortSignal } = {}) => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const base = typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app") ? window.location.origin : BASE_URL;
    const url = `${base}/api/tickets/${id}/pdf`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    let res: Response;
    try {
      res = await fetch(url, { credentials: "include", signal: controller.signal });
    } catch (e: unknown) {
      const isAbort = e instanceof DOMException && e.name === "AbortError" || (e instanceof Error && e.name === "AbortError");
      if (isAbort) throw new Error("PDF request timed out — try again.");
      throw e instanceof Error ? e : new Error("Network error");
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      let detail = "Failed to generate PDF";
      try { detail = (await res.json())?.detail ?? detail; } catch {}
      // Retry once on 401 via apiClient refresh — fetch here doesn't auto-refresh
      if (res.status === 401) {
        try {
          const { apiClient } = await import("./client");
          // Trigger refresh via a lightweight auth call
          await fetch(new URL("/api/auth/refresh", base).toString(), { method: "POST", credentials: "include" });
        } catch {}
      }
      throw new Error(detail);
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  },
};
