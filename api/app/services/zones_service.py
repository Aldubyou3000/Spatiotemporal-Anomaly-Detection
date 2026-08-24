"""
Zone pipeline orchestration: A → B → C.

Reads a CSV, runs the three zone modules in order, and projects the results
into the API's response shape. CPU-bound; the router should call this via
fastapi.concurrency.run_in_threadpool to keep the event loop responsive.
"""
import io
import math
import time
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import numpy as np

from ..zones import (
    process_zone_a,
    zone_b_haversine_grouping,
    zone_c_lof_anomaly_detection,
)
from ..schemas.zones import (
    AnomalyEvent,
    DailyReading,
    ExclusionDetails,
    NeighborInfo,
    ProcessResult,
    ProcessSummary,
    QualityReport,
    StationAnomalySummary,
    StationHealth,
)

REQUIRED_COLUMNS = {"station_id", "date", "latitude", "longitude"}

# ── Station health thresholds (tunable; see StationHealth doc) ─────────
HEALTH_MIN_RAIN_DAYS = 5  # fewer than this → insufficient_data (can't judge)
HEALTH_WATCH_RATIO = 1.15  # 1.15–1.50× median → watch
HEALTH_SUSPECT_RATIO = 1.50  # >1.50× → suspect
HEALTH_SUSPECT_TOP_RATE = 0.60  # or top on >60% of rain days → suspect
HEALTH_RAIN_FLOOR_MM = 10.0  # only days where group median ≥ this count as "rain days"


class ZoneProcessingError(ValueError):
    """Raised when the pipeline rejects the input or fails to process it."""


def parse_csv_to_dataframe(file_bytes: bytes) -> pd.DataFrame:
    """Decode the uploaded bytes and parse them as a pandas DataFrame."""
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_bytes.decode("latin-1")
        except Exception as exc:
            raise ZoneProcessingError(f"Could not decode CSV: {exc}") from exc

    try:
        df = pd.read_csv(io.StringIO(text))
    except Exception as exc:
        raise ZoneProcessingError(f"CSV parse error: {exc}") from exc

    if df.empty:
        raise ZoneProcessingError("Uploaded CSV is empty (0 rows).")

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ZoneProcessingError(
            f"Missing required columns: {', '.join(sorted(missing))}. "
            f"Need station_id, date, latitude, longitude, and rainfall (or rainfall_mm)."
        )
    if "rainfall" not in df.columns and "rainfall_mm" not in df.columns:
        raise ZoneProcessingError("Missing rainfall column (need 'rainfall' or 'rainfall_mm').")

    try:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    except Exception as exc:
        raise ZoneProcessingError(f"Could not parse date column: {exc}") from exc

    if df["date"].isna().all():
        raise ZoneProcessingError("All rows have invalid dates — check the date format.")

    return df


def run_pipeline(file_bytes: bytes) -> ProcessResult:
    """End-to-end zone pipeline for a single combined CSV (back-compat)."""
    raw_df = parse_csv_to_dataframe(file_bytes)
    return _run_from_dataframe(raw_df)


def run_pipeline_multi(
    files: list[tuple[str, bytes]],
) -> ProcessResult:
    """End-to-end zone pipeline for a batch of uploaded files.

    Each file is auto-detected (raw HMDAS or already-combined CSV), converted,
    and merged into one frame before the unchanged Zone A→B→C flow runs.
    """
    # Imported here to avoid a circular import (hmdas_converter imports from this module).
    from .hmdas_converter import convert_uploads

    raw_df, conversion_stats = convert_uploads(files)
    return _run_from_dataframe(
        raw_df,
        hourly_duplicates=conversion_stats.get("hourly_duplicates_dropped", 0),
    )


def _run_from_dataframe(
    raw_df: pd.DataFrame, hourly_duplicates: int = 0
) -> ProcessResult:
    """Run Zone A→B→C on an already-parsed raw frame and project to a ProcessResult."""
    start = time.perf_counter()

    raw_preview = _build_raw_preview(raw_df)
    raw_total_rows = int(len(raw_df))

    cleaned, quality_report_dict = process_zone_a(raw_df)

    # Guard: Zone A promises no NaN in rainfall, but a daily-format CSV with an
    # isolated single-day NaN can survive its gap logic. Drop any residual NaN
    # rows here so sklearn LOF (which raises on NaN) never sees them. Hourly
    # uploads are unaffected — those days already vanished at the hourly stage.
    _rain_col_cleaned = "rainfall" if "rainfall" in cleaned.columns else "rainfall_mm"
    if _rain_col_cleaned in cleaned.columns and bool(cleaned[_rain_col_cleaned].isna().any()):  # type: ignore[attr-defined]
        cleaned = cleaned[cleaned[_rain_col_cleaned].notna()].copy().reset_index(drop=True)  # type: ignore[attr-defined]

    neighbors_dict = zone_b_haversine_grouping(cleaned)  # type: ignore[arg-type]
    flagged, anomaly_dict = zone_c_lof_anomaly_detection(
        cleaned,  # type: ignore[arg-type]
        neighbors=neighbors_dict,
        n_neighbors=3,
    )

    elapsed = time.perf_counter() - start

    rain_col = "rainfall" if "rainfall" in flagged.columns else "rainfall_mm"
    station_health = _compute_station_health(flagged, neighbors_dict, anomaly_dict, rain_col)
    total_anomalies = int(flagged["is_anomaly"].sum())
    total_rows = int(len(flagged))
    anomaly_rate = round(100 * total_anomalies / total_rows, 2) if total_rows else 0.0

    date_min = flagged["date"].min() if total_rows else None
    date_max = flagged["date"].max() if total_rows else None

    summary = ProcessSummary(
        total_rows=total_rows,
        total_stations=int(flagged["station_id"].nunique()) if total_rows else 0,
        total_anomalies=total_anomalies,
        anomaly_rate=anomaly_rate,
        anomalous_stations=len(anomaly_dict),
        processing_time_seconds=round(elapsed, 3),
        date_range_start=_to_date(date_min),
        date_range_end=_to_date(date_max),
    )

    return ProcessResult(
        summary=summary,
        quality_report=_normalize_quality_report(quality_report_dict, hourly_duplicates),
        cleaned_data=_dataframe_to_readings(cleaned, rain_col, with_lof=False),  # type: ignore[arg-type]
        flagged_data=_dataframe_to_readings(flagged, rain_col, with_lof=True),  # type: ignore[arg-type]
        neighbors=_normalize_neighbors(neighbors_dict),
        anomaly_summary=_normalize_anomaly_summary(anomaly_dict, flagged, rain_col),  # type: ignore[arg-type]
        raw_preview=raw_preview,
        raw_total_rows=raw_total_rows,
        station_health=station_health,
        processed_at=datetime.now(timezone.utc),
    )


# ─── helpers ─────────────────────────────────────────────────────────────

def _build_raw_preview(df: pd.DataFrame) -> list[dict[str, Any]]:
    # No row cap — every uploaded row is returned for full transparency.
    # The Raw Data tab paginates client-side, so DOM cost stays constant.
    out = df.copy()
    if "date" in out.columns:
        out["date"] = out["date"].dt.strftime("%Y-%m-%d %H:%M:%S")
    return _records_safe(out)


def _dataframe_to_readings(df: pd.DataFrame, rain_col: str, with_lof: bool) -> list[DailyReading]:
    if df.empty:
        return []
    out: list[DailyReading] = []
    has_flag = "interpolated_flag" in df.columns
    has_lof = with_lof and "lof_score" in df.columns
    has_anom = with_lof and "is_anomaly" in df.columns

    for row in df.itertuples(index=False):
        rowd = row._asdict()
        date_val = _to_date(rowd.get("date"))
        if date_val is None:
            continue
        rainfall_raw = rowd.get(rain_col)
        rainfall = float(rainfall_raw) if rainfall_raw is not None and not _isnan(rainfall_raw) else 0.0
        lof_raw = rowd.get("lof_score") if has_lof else None
        out.append(
            DailyReading(
                station_id=str(rowd["station_id"]),
                date=date_val,
                latitude=float(rowd["latitude"]),
                longitude=float(rowd["longitude"]),
                rainfall=round(rainfall, 2),
                interpolated_flag=bool(rowd.get("interpolated_flag", False)) if has_flag else False,
                lof_score=round(float(lof_raw), 3) if has_lof and lof_raw is not None and not _isnan(lof_raw) else None,
                is_anomaly=bool(rowd.get("is_anomaly", False)) if has_anom else False,
            )
        )
    return out


def _normalize_neighbors(neighbors: dict[str, list[dict[str, Any]]]) -> dict[str, list[NeighborInfo]]:
    return {
        str(sid): [NeighborInfo(neighbor_id=str(n["neighbor_id"]), distance_km=float(n["distance_km"])) for n in entries]
        for sid, entries in neighbors.items()
    }


def _normalize_anomaly_summary(
    anomalies: dict[str, list[dict[str, Any]]],
    flagged_df: pd.DataFrame,
    rain_col: str,
) -> list[StationAnomalySummary]:
    if not anomalies:
        return []
    station_locs = (
        flagged_df[["station_id", "latitude", "longitude"]]
        .drop_duplicates(subset=["station_id"])  # type: ignore[call-overload]
        .set_index("station_id")
        .to_dict(orient="index")
    )

    out: list[StationAnomalySummary] = []
    for sid, events in anomalies.items():
        loc = station_locs.get(sid, {})
        normalized_events: list[AnomalyEvent] = []
        for event in events:
            evt_date = _to_date(event.get("date"))
            if evt_date is None:
                continue
            rainfall_val = event.get("rainfall", event.get(rain_col, 0.0))
            normalized_events.append(
                AnomalyEvent(
                    date=evt_date,
                    rainfall=round(float(rainfall_val), 2),
                    lof_score=round(float(event.get("lof_score", 0.0)), 3),
                )
            )
        normalized_events.sort(key=lambda e: e.date)
        out.append(
            StationAnomalySummary(
                station_id=str(sid),
                latitude=float(loc.get("latitude", 0.0)),
                longitude=float(loc.get("longitude", 0.0)),
                anomaly_count=len(normalized_events),
                events=normalized_events,
            )
        )
    out.sort(key=lambda s: s.anomaly_count, reverse=True)
    return out


def _compute_station_health(
    flagged_df: pd.DataFrame,
    neighbors: dict[str, list[dict[str, Any]]],
    anomaly_dict: dict[str, list[dict[str, Any]]],
    rain_col: str,
) -> list[StationHealth]:
    """Post-LOF bias report card — plain averages, not LOF.

    For each station, looks at all *rain days* (group median ≥ HEALTH_RAIN_FLOOR_MM)
    where its Zone B group had ≥4 stations reporting. On each rain day computes
    station / group_median. The mean of those ratios is `bias_ratio`.
    Classification:
      rain_days < 5                  → insufficient_data
      bias_ratio > 1.50 or top>60%   → suspect
      bias_ratio > 1.15              → watch
      else                           → normal
    """
    if flagged_df.empty or not neighbors:
        return []

    # Index for fast per-date lookups: (station_id, date) → rainfall
    # Normalize date to date-only (no time) for grouping.
    df = flagged_df.copy()
    # Ensure date is a pandas datetime for .dt access; _to_date already normalized flagged dates to date objects via readings, but flagged_df here is still Timestamps.
    if not pd.api.types.is_datetime64_any_dtype(df["date"]):  # type: ignore[arg-type]
        df["date"] = pd.to_datetime(df["date"], errors="coerce")  # type: ignore[call-overload]

    # Build lookup: date → {station_id: rainfall}
    # Use date only (ignore time) since flagged is daily.
    df["_date_only"] = pd.to_datetime(df["date"]).dt.date  # type: ignore[attr-defined]
    # station → (lat, lon) for the health record
    loc_map: dict[str, dict[str, float]] = (  # type: ignore[assignment]
        df[["station_id", "latitude", "longitude"]]
        .drop_duplicates(subset=["station_id"])  # type: ignore[call-overload]
        .set_index("station_id")
        .to_dict(orient="index")  # type: ignore[call-overload]
    )

    # Group rainfall by date for fast median calc
    # date → dict station_id → rainfall
    date_groups: dict[Any, dict[str, float]] = {}
    for _, row in df.iterrows():  # type: ignore[attr-defined]
        d = row["_date_only"]
        sid = str(row["station_id"])
        val = float(row[rain_col]) if not _isnan(row[rain_col]) else float("nan")
        if math.isnan(val):
            continue
        date_groups.setdefault(d, {})[sid] = val

    health: list[StationHealth] = []
    for station_id in df["station_id"].unique():  # type: ignore[attr-defined]
        sid = str(station_id)
        neighbor_ids = [str(n["neighbor_id"]) for n in neighbors.get(sid, [])]
        group_ids = [sid] + neighbor_ids
        loc = loc_map.get(sid, {"latitude": 0.0, "longitude": 0.0})

        ratios: list[float] = []
        top_hits = 0
        group_sizes: list[int] = []

        # Iterate over every calendar date in the dataset where this station reported
        station_dates = set(df[df["station_id"] == sid]["_date_only"].tolist())  # type: ignore[attr-defined]
        for d in station_dates:
            day_map = date_groups.get(d, {})
            # Only stations in this station's group that actually reported that day
            group_vals = [day_map[g] for g in group_ids if g in day_map]
            if len(group_vals) < 4:  # same gate as Zone C's MIN_STATIONS_PER_DAY
                continue
            group_median = float(np.median(np.array(group_vals, dtype=float)))  # type: ignore[arg-type]
            if group_median < HEALTH_RAIN_FLOOR_MM:
                continue  # dry/drizzle day — not informative
            group_sizes.append(len(group_vals))
            own_val = day_map.get(sid)
            if own_val is None or group_median < 1e-9:
                continue
            ratios.append(own_val / group_median)  # type: ignore[operator]
            if own_val == max(group_vals):
                top_hits += 1

        rain_days = len(ratios)
        times_flagged = len(anomaly_dict.get(sid, []))

        if rain_days < HEALTH_MIN_RAIN_DAYS:
            status = "insufficient_data"
            bias_ratio = None
            top_rate = None
        else:
            bias_ratio = round(float(np.mean(ratios)), 2)
            top_rate = round(top_hits / rain_days, 2) if rain_days else 0.0
            if bias_ratio > HEALTH_SUSPECT_RATIO or (top_rate is not None and top_rate > HEALTH_SUSPECT_TOP_RATE):
                status = "suspect"
            elif bias_ratio > HEALTH_WATCH_RATIO:
                status = "watch"
            else:
                status = "normal"

        health.append(
            StationHealth(
                station_id=sid,
                latitude=float(loc.get("latitude", 0.0)),
                longitude=float(loc.get("longitude", 0.0)),
                status=status,
                bias_ratio=bias_ratio,
                rain_days=rain_days,
                top_rate=top_rate,
                times_flagged=times_flagged,
                median_group_size=int(np.median(group_sizes)) if group_sizes else 0,
            )
        )

    # Sort: suspect first, then watch, then normal, then insufficient; within tier by bias_ratio desc
    order = {"suspect": 0, "watch": 1, "normal": 2, "insufficient_data": 3}
    health.sort(key=lambda h: (order.get(h.status, 99), -(h.bias_ratio or 0)))
    return health


def _normalize_quality_report(report: dict[str, Any], hourly_duplicates: int = 0) -> QualityReport:
    details = report.get("exclusion_details", {}) or {}
    return QualityReport(
        total_input_rows=int(report.get("total_input_rows", 0)),
        total_input_stations=int(report.get("total_input_stations", 0)),
        stations_excluded=int(report.get("stations_excluded", 0)),
        rows_excluded=int(report.get("rows_excluded", 0)),
        rows_filled=int(report.get("rows_filled", 0)),
        exclusion_details=ExclusionDetails(
            zero_valid_stations=int(details.get("zero_valid_stations", 0)),
            insufficient_readings_stations=int(details.get("insufficient_readings_stations", 0)),
            multi_day_gaps=int(details.get("multi_day_gaps", 0)),
            starts_with_nan=int(details.get("starts_with_nan", 0)),
            ends_with_nan=int(details.get("ends_with_nan", 0)),
            duplicates=int(details.get("duplicates", 0)),
            multi_hour_gaps=int(details.get("multi_hour_gaps", 0)),
            hourly_starts_with_nan=int(details.get("hourly_starts_with_nan", 0)),
            hourly_ends_with_nan=int(details.get("hourly_ends_with_nan", 0)),
            hourly_duplicates=int(hourly_duplicates),
        ),
        summary_text=str(report.get("summary_text", "")),
    )


def _records_safe(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert a DataFrame to a JSON-safe list of records (no NaN, no pd.Timestamp)."""
    out: list[dict[str, Any]] = []
    for row in df.itertuples(index=False):
        record: dict[str, Any] = {}
        for col, value in row._asdict().items():
            if value is None:
                record[col] = None
            elif _isnan(value):
                record[col] = None
            elif isinstance(value, (np.integer,)):
                record[col] = int(value)
            elif isinstance(value, (np.floating,)):
                record[col] = float(value)
            elif isinstance(value, pd.Timestamp):
                record[col] = value.isoformat()
            else:
                record[col] = value
        out.append(record)
    return out


def _to_date(value):
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        return value.date()
    if hasattr(value, "date"):
        return value.date()
    try:
        return pd.to_datetime(value).date()
    except Exception:
        return None


def _isnan(value) -> bool:
    if value is None:
        return True
    try:
        return bool(math.isnan(value))
    except (TypeError, ValueError):
        return False
