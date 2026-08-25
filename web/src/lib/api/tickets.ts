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

  downloadPdf: async (id: string, filename: string) => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const url = `${BASE_URL}/api/tickets/${id}/pdf`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to generate PDF");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  },
};
