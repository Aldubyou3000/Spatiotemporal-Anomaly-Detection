export interface ReportTechnicianSummary {
  id: string;
  username: string;
  full_name: string;
}

export interface ReportTicketSummary {
  id: string;
  title: string;
  station_id: string;
  anomaly_zone: string | null;
}

export interface InspectionReport {
  id: string;
  ticket_id: string;
  ticket: ReportTicketSummary | null;
  technician_id: string;
  technician: ReportTechnicianSummary | null;
  notes: string | null;
  sensor_working: boolean | null;
  severity: "low" | "medium" | "high" | null;
  root_cause: string | null;
  submitted_at: string | null;
  analyst_approved: boolean;
  analyst_approved_at: string | null;
  analyst_notes: string | null;
  created_at: string;
}

export interface InspectionReportListResponse {
  pending: InspectionReport[];
  approved: InspectionReport[];
}

export interface ReportApprove {
  analyst_notes?: string;
}
