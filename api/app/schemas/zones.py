from datetime import date, datetime
from typing import Any
from pydantic import BaseModel, Field


class DailyReading(BaseModel):
    station_id: str
    date: date
    latitude: float
    longitude: float
    rainfall: float
    interpolated_flag: bool = False
    lof_score: float | None = None
    is_anomaly: bool = False
    is_dry_stuck: bool = False


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
    hourly_duplicates: int = 0


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
    date_range_start: date | None = None
    date_range_end: date | None = None


class StationHealth(BaseModel):
    """Per-station bias report card — plain mean ratios, not LOF.

    Computed post-LOF from the same flagged daily frame + Zone B neighbor map.
    Lets an analyst tell "one weird day" (weather) from "weird every rain day"
    (gauge calibration / exposure) at a glance.
    """

    station_id: str
    latitude: float
    longitude: float
    status: str = Field(
        description="normal | watch | suspect | insufficient_data — see zones_service thresholds."
    )
    bias_ratio: float | None = Field(
        default=None, description="Mean(station / group_median) over rain days; null if insufficient_data."
    )
    rain_days: int = Field(description="Rain days where group median ≥ 10 mm.")
    top_rate: float | None = Field(
        default=None, description="Fraction of rain days this station was the group's max (null if insufficient_data)."
    )
    times_flagged: int = Field(description="How many LOF flags this station has in this run.")
    median_group_size: int = Field(description="Median number of stations reporting on its rain days.")


class DryStuckEvent(BaseModel):
    """One stuck day — this gauge at ~0 while the area was rainy."""

    date: date
    rainfall: float
    group_median: float


class StationStuckHealth(BaseModel):
    """Per-station stuck-at-zero report — symmetric to StationHealth but for low side.

    A gauge is not flagged for a single 0 on a rainy day (could be weather).
    It is flagged only when 0 is a pattern over many rainy days.
    """

    station_id: str
    latitude: float
    longitude: float
    status: str = Field(description="normal | watch | suspect | insufficient_data")
    bias_ratio: float | None = Field(default=None, description="Mean(station / group_median) over rain days; null if insufficient_data.")
    rain_days: int = Field(description="Rainy days where group median ≥ 10 mm.")
    zero_rate: float | None = Field(default=None, description="Fraction of rainy days where rainfall ≤ STUCK_ZERO_MM.")
    max_zero_streak: int | None = Field(default=None, description="Longest run of consecutive rainy days at ≤ STUCK_ZERO_MM.")
    events: list[DryStuckEvent] = Field(default_factory=list, description="All stuck days for this station.")


class StationDryStuckSummary(BaseModel):
    """Compact per-station list of stuck dates — mirrors anomaly_summary but for low side."""

    station_id: str
    latitude: float
    longitude: float
    stuck_count: int
    events: list[DryStuckEvent]


class ProcessResult(BaseModel):
    summary: ProcessSummary
    quality_report: QualityReport
    cleaned_data: list[DailyReading]
    flagged_data: list[DailyReading]
    neighbors: dict[str, list[NeighborInfo]]
    anomaly_summary: list[StationAnomalySummary]
    raw_preview: list[dict[str, Any]] = Field(
        default_factory=list,
        description="All rows of the (converted) input data for the Raw Data tab.",
    )
    raw_total_rows: int = 0
    station_health: list[StationHealth] = Field(
        default_factory=list,
        description="Per-station bias report card (post-LOF, plain averages — see StationHealth).",
    )
    station_stuck_health: list[StationStuckHealth] = Field(
        default_factory=list, description="Per-station stuck-at-zero report (symmetric to health, for low side)."
    )
    dry_stuck_summary: list[StationDryStuckSummary] = Field(
        default_factory=list, description="Per-station list of stuck dates (0 while area rainy)."
    )
    processed_at: datetime
