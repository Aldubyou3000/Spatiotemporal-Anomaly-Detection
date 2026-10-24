import type { AnomalyReview } from "@/lib/anomalyReview";
import type { ProcessSummary, QualityReport } from "@/types/zones";
import type { TicketListItem } from "@/types/tickets";

export interface HistoryRun {
  title?: string | null;
  id: string;
  processed_by: string;
  processed_by_name: string;
  processed_at: string;
  files: { name: string; size: number; sha256: string }[];
  station_ids: string[];
  summary: ProcessSummary;
  quality_report: QualityReport;
  algorithm_version: string;
  flagged_count: number;
  reviewed_count: number;
  confirmed_count: number;
  dismissed_count: number;
  open_tickets: number;
  verified_tickets: number;
  cancelled_tickets: number;
}

export interface SavedReview extends Omit<AnomalyReview, "status"> {
  station_id: string;
  date: string;
  status: AnomalyReview["status"] | null;
  revision: number;
}

export interface HistoryTicket extends TicketListItem {
  inspection: {
    id: string;
    technician_id: string;
    submitted_at: string | null;
    analyst_approved: boolean;
    analyst_approved_at: string | null;
    issue_resolved: boolean | null;
    round: number;
    profiles: { full_name: string; username: string } | null;
    approver: { full_name: string; username: string } | null;
  } | null;
}
