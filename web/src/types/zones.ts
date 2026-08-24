export interface DailyReading {
  station_id: string;
  date: string; // ISO date (YYYY-MM-DD)
  latitude: number;
  longitude: number;
  rainfall: number;
  interpolated_flag: boolean;
  lof_score: number | null;
  is_anomaly: boolean;
  is_dry_stuck: boolean;
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
  hourly_duplicates: number;
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
  date_range_start: string | null;
  date_range_end: string | null;
}

export type HealthStatus = "normal" | "watch" | "suspect" | "insufficient_data";

export interface StationHealth {
  station_id: string;
  latitude: number;
  longitude: number;
  status: HealthStatus;
  bias_ratio: number | null;
  rain_days: number;
  top_rate: number | null;
  times_flagged: number;
  median_group_size: number;
}

export interface DryStuckEvent {
  date: string;
  rainfall: number;
  group_median: number;
}

export interface StationStuckHealth {
  station_id: string;
  latitude: number;
  longitude: number;
  status: HealthStatus;
  bias_ratio: number | null;
  rain_days: number;
  zero_rate: number | null;
  max_zero_streak: number | null;
  events: DryStuckEvent[];
}

export interface StationDryStuckSummary {
  station_id: string;
  latitude: number;
  longitude: number;
  stuck_count: number;
  events: DryStuckEvent[];
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
  station_health: StationHealth[];
  station_stuck_health: StationStuckHealth[];
  dry_stuck_summary: StationDryStuckSummary[];
  processed_at: string;
}
