import { apiClient } from "@/lib/api/client";
import type { HistoryRun, HistoryTicket, SavedReview } from "@/types/history";
import type { ProcessResult } from "@/types/zones";

export interface HistoryFilters { search: string; start: string; end: string; offset: number }
export const historyApi = {
  list: (filters: HistoryFilters) => apiClient.get<{ items: HistoryRun[]; total: number }>("/api/history", {
    params: { search: filters.search || undefined, start: filters.start || undefined, end: filters.end || undefined, offset: filters.offset, limit: 20 },
  }),
  get: (id: string) => apiClient.get<HistoryRun>(`/api/history/${id}`),
  results: (id: string) => apiClient.get<ProcessResult>(`/api/history/${id}/results`),
  reviews: (id: string) => apiClient.get<SavedReview[]>(`/api/history/${id}/reviews`),
  review: (id: string, body: { station_id: string; date: string; status: SavedReview["status"]; note: string; expected_revision: number }) =>
    apiClient.patch<SavedReview>(`/api/history/${id}/reviews`, body),
  tickets: (id: string, offset: number) => apiClient.get<{ items: HistoryTicket[]; total: number }>(`/api/history/${id}/tickets`, { params: { offset, limit: 20 } }),
  saveRun: (id: string, title: string) => apiClient.post<ProcessResult>(`/api/zones/jobs/${id}/save`, { title }),
};
