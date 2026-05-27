from datetime import date, datetime
from typing import Any
from pydantic import BaseModel, Field


class StationLocation(BaseModel):
    station_id: str
    latitude: float
    longitude: float


class DailyReading(BaseModel):
    station_id: str
    date: date
    latitude: float
    longitude: float
    rainfall: float
    interpolated_flag: bool = False
    lof_score: float | None = None
    is_anomaly: bool = False


class NeighborInfo(BaseModel):
    neighbor_id: str
    distance_km: float


class AnomalyEvent(BaseModel):
    date: date
    rainfall: float
    lof_score: float


class StationAnomalySummary(BaseModel):
    station_id: str
    latitude: float
    longitude: float
    anomaly_count: int
    events: list[AnomalyEvent]


class ExclusionDetails(BaseModel):
    zero_valid_stations: int = 0
    insufficient_readings_stations: int = 0
    multi_day_gaps: int = 0
    starts_with_nan: int = 0
    ends_with_nan: int = 0
    duplicates: int = 0
    multi_hour_gaps: int = 0
    hourly_starts_with_nan: int = 0
    hourly_ends_with_nan: int = 0


class QualityReport(BaseModel):
    total_input_rows: int
    total_input_stations: int
    stations_excluded: int
    rows_excluded: int
    rows_filled: int = 0
    exclusion_details: ExclusionDetails
    summary_text: str


class ProcessSummary(BaseModel):
    total_rows: int
    total_stations: int
    total_anomalies: int
    anomaly_rate: float
    anomalous_stations: int
    processing_time_seconds: float
    contamination: float
    date_range_start: date | None = None
    date_range_end: date | None = None


class ProcessResult(BaseModel):
    summary: ProcessSummary
    quality_report: QualityReport
    cleaned_data: list[DailyReading]
    flagged_data: list[DailyReading]
    neighbors: dict[str, list[NeighborInfo]]
    anomaly_summary: list[StationAnomalySummary]
    raw_preview: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Up to 200 rows of the input file for the Raw Data tab.",
    )
    raw_total_rows: int = 0
    processed_at: datetime
