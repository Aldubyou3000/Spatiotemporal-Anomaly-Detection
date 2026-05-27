import { apiClient } from "./client";
import type {
  InspectionReport,
  InspectionReportListResponse,
  ReportApprove,
} from "@/types/reports";

export const reportsApi = {
  list: () =>
    apiClient.get<InspectionReportListResponse>("/api/reports"),

  get: (id: string) =>
    apiClient.get<InspectionReport>(`/api/reports/${id}`),

  approve: (id: string, body: ReportApprove = {}) =>
    apiClient.patch<InspectionReport>(`/api/reports/${id}/approve`, body),

  photos: (reportId: string) =>
    apiClient.get<{ id: string; photo_url: string }[]>(`/api/reports/${reportId}/photos`),
};
