export interface TechnicianProfile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  phone: string | null;
  station_ids: string[];
  is_active: boolean;
  created_at: string;
}

export interface TechnicianCreate {
  full_name: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
}
