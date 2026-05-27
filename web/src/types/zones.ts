export interface DailyReading {
  station_id: string;
  date: string; // ISO date (YYYY-MM-DD)
  latitude: number;
  longitude: number;
  rainfall: number;
  interpolated_flag: boolean;
  lof_score: number | null;
  is_anomaly: boolean;
}

export interface NeighborInfo {
  neighbor_id: string;
  distance_km: number;
}

export interface AnomalyEvent {
  date: string;
  rainfall: number;
  lof_score: number;
}

export interface StationAnomalySummary {
  station_id: string;
  latitude: number;
  longitude: number;
  anomaly_count: number;
  events: AnomalyEvent[];
}

export interface ExclusionDetails {
  zero_valid_stations: number;
  insufficient_readings_stations: number;
  multi_day_gaps: number;
  starts_with_nan: number;
  ends_with_nan: number;
  duplicates: number;
  multi_hour_gaps: number;
  hourly_starts_with_nan: number;
  hourly_ends_with_nan: number;
}

export interface QualityReport {
  total_input_rows: number;
  total_input_stations: number;
  stations_excluded: number;
  rows_excluded: number;
  rows_filled: number;
  exclusion_details: ExclusionDetails;
  summary_text: string;
}

export interface ProcessSummary {
  total_rows: number;
  total_stations: number;
  total_anomalies: number;
  anomaly_rate: number;
  anomalous_stations: number;
  processing_time_seconds: number;
  contamination: number;
  date_range_start: string | null;
  date_range_end: string | null;
}

export interface ProcessResult {
  summary: ProcessSummary;
  quality_report: QualityReport;
  cleaned_data: DailyReading[];
  flagged_data: DailyReading[];
  neighbors: Record<string, NeighborInfo[]>;
  anomaly_summary: StationAnomalySummary[];
  raw_preview: Record<string, unknown>[];
  raw_total_rows: number;
  processed_at: string;
}
