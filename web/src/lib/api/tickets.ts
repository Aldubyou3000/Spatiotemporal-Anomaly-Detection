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
