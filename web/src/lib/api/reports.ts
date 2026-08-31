import { apiClient } from "./client";
import type {
  InspectionReport,
  InspectionReportListResponse,
  ReportApprove,
} from "@/types/reports";

export const reportsApi = {
  list: () =>
    apiClient.get<InspectionReportListResponse>("/api/reports"),

  approve: (id: string, body: ReportApprove = {}) =>
    apiClient.patch<InspectionReport>(`/api/reports/${id}/approve`, body),
};
