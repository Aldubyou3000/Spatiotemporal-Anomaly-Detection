export type TicketStatus = "assigned" | "in-progress" | "completed" | "verified";
export type TicketPriority = "low" | "medium" | "high";
export type AnomalyZone = "A" | "B" | "C";

export interface TechnicianSummary {
  id: string;
  username: string;
  full_name: string;
}

export interface Technician {
  id: string;
  username: string;
  full_name: string;
  email: string;
  station_ids: string[];
  is_active: boolean;
}

export interface TicketListItem {
  id: string;
  title: string;
  station_id: string;
  status: TicketStatus;
  priority: TicketPriority;
  anomaly_zone: AnomalyZone | null;
  analyst_id: string;
  technician_id: string | null;
  technician: TechnicianSummary | null;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends TicketListItem {
  description: string | null;
  anomaly_data: Record<string, unknown> | null;
  assigned_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
}

export interface TicketListResponse {
  items: TicketListItem[];
  total: number;
}

export interface TicketCreate {
  title: string;
  description?: string;
  station_id: string;
  priority?: TicketPriority;
  anomaly_zone?: AnomalyZone;
  technician_id: string;
}

export interface TicketUpdate {
  status?: TicketStatus;
  priority?: TicketPriority;
  technician_id?: string;
  title?: string;
  description?: string;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}
