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
  status?: string | null;
}

export interface InspectionReport {
  id: string;
  ticket_id: string;
  ticket: ReportTicketSummary | null;
  technician_id: string;
  technician: ReportTechnicianSummary | null;
  notes: string | null;
  severity: "low" | "medium" | "high" | null;
  root_cause: string | null;
  corrective_action: string | null;
  issue_resolved: boolean | null;
  submitted_at: string | null;
  analyst_approved: boolean;
  analyst_approved_at: string | null;
  analyst_notes: string | null;
  round: number;
  is_active: boolean;
  created_at: string;
}

export interface InspectionReportListResponse {
  pending: InspectionReport[];
  follow_up: InspectionReport[];
  approved: InspectionReport[];
}

export interface ReportApprove {
  analyst_notes?: string;
}
