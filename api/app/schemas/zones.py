from datetime import date, datetime
from typing import Any, Literal
from pydantic import BaseModel, Field

PipelineStage = Literal["preparing", "zone_a", "zone_b", "zone_c", "finalizing"]


class PipelineProgress(BaseModel):
    stage: PipelineStage = "preparing"
    station_ids: list[str] = Field(default_factory=list)


class DailyReading(BaseModel):
    station_id: str
    date: date
    latitude: float
    longitude: float
    rainfall: float
    interpolated_flag: bool = False
    lof_score: float | None = None
    is_anomaly: bool = False
    is_low_anomaly: bool = False
    is_dry_stuck: bool = False


class NeighborInfo(BaseModel):
    neighbor_id: str
    distance_km: float


class AnomalyEvent(BaseModel):
    date: date
    rainfall: float
    lof_score: float
    group_median: float | None = None
    is_low: bool = False


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
    incomplete_days: int = 0
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
    rows_filled: int = Field(default=0, description="Single-hour estimates made before incomplete daily totals are excluded.")
    exclusion_details: ExclusionDetails
    summary_text: str


class ProcessSummary(BaseModel):
    total_rows: int
    total_stations: int
    total_anomalies: int
    total_high_anomalies: int = 0
    total_low_anomalies: int = 0
    anomaly_rate: float
    anomalous_stations: int
    processing_time_seconds: float
    date_range_start: date | None = None
    date_range_end: date | None = None


class StationHealth(BaseModel):
    """Review priority from rainy-day comparisons and flagged peaks, not sensor accuracy."""

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
        default=None, description="Fraction of assessed rainy days strictly higher than all reporting neighbors; ties excluded."
    )
    times_flagged: int = Field(description="How many LOF flags this station has in this run.")
    median_group_size: int = Field(description="Median number of stations reporting on its rain days.")
    # Spike evidence — null if station has no flagged days
    max_ratio: float | None = Field(
        default=None, description="Largest own/median(neighbors) on flagged days with at least two neighbors and neighbor median >=10 mm; may be on a different date from peak_rainfall."
    )
    peak_rainfall: float | None = Field(
        default=None, description="Largest rainfall among flagged days (mm); null if no flags."
    )
    peak_date: date | None = Field(
        default=None, description="Date of the peak_rainfall flagged day; null if no flags."
    )


class DryStuckEvent(BaseModel):
    """One stuck day — this gauge at ~0 while the area was rainy."""

    date: date
    rainfall: float
    group_median: float


class StationStuckHealth(BaseModel):
    """Low-reading review priority; events include individual low days even without an overall warning."""

    station_id: str
    latitude: float
    longitude: float
    status: str = Field(description="normal | watch | suspect | insufficient_data")
    bias_ratio: float | None = Field(default=None, description="Mean(station / group_median) over rain days; null if insufficient_data.")
    rain_days: int = Field(description="Rainy days where group median ≥ 10 mm.")
    zero_rate: float | None = Field(default=None, description="Fraction of rainy days where rainfall ≤ STUCK_ZERO_MM.")
    max_zero_streak: int | None = Field(default=None, description="Longest run of successive assessed rainy days at <=1 mm; dates need not be consecutive calendar days.")
    events: list[DryStuckEvent] = Field(default_factory=list, description="All stuck days for this station.")


class StationDryStuckSummary(BaseModel):
    """Compact per-station list of stuck dates — mirrors anomaly_summary but for low side."""

    station_id: str
    latitude: float
    longitude: float
    stuck_count: int
    events: list[DryStuckEvent]


class ProcessResult(BaseModel):
    run_id: str | None = None
    history_saved: bool = False
    history_error: str | None = None
    history_title: str | None = None
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
