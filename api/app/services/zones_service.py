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
)

REQUIRED_COLUMNS = {"station_id", "date", "latitude", "longitude"}


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


def run_pipeline(file_bytes: bytes, contamination: float = 0.05) -> ProcessResult:
    """End-to-end zone pipeline for a single combined CSV (back-compat)."""
    raw_df = parse_csv_to_dataframe(file_bytes)
    return _run_from_dataframe(raw_df, contamination)


def run_pipeline_multi(
    files: list[tuple[str, bytes]], contamination: float = 0.05
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
        contamination,
        hourly_duplicates=conversion_stats.get("hourly_duplicates_dropped", 0),
    )


def _run_from_dataframe(
    raw_df: pd.DataFrame, contamination: float, hourly_duplicates: int = 0
) -> ProcessResult:
    """Run Zone A→B→C on an already-parsed raw frame and project to a ProcessResult."""
    start = time.perf_counter()

    raw_preview = _build_raw_preview(raw_df)
    raw_total_rows = int(len(raw_df))

    cleaned, quality_report_dict = process_zone_a(raw_df)
    neighbors_dict = zone_b_haversine_grouping(cleaned)
    flagged, anomaly_dict = zone_c_lof_anomaly_detection(
        cleaned,
        neighbors=neighbors_dict,
        contamination=contamination,
        n_neighbors=3,
    )

    elapsed = time.perf_counter() - start

    rain_col = "rainfall" if "rainfall" in flagged.columns else "rainfall_mm"
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
        contamination=contamination,
        date_range_start=_to_date(date_min),
        date_range_end=_to_date(date_max),
    )

    return ProcessResult(
        summary=summary,
        quality_report=_normalize_quality_report(quality_report_dict, hourly_duplicates),
        cleaned_data=_dataframe_to_readings(cleaned, rain_col, with_lof=False),
        flagged_data=_dataframe_to_readings(flagged, rain_col, with_lof=True),
        neighbors=_normalize_neighbors(neighbors_dict),
        anomaly_summary=_normalize_anomaly_summary(anomaly_dict, flagged, rain_col),
        raw_preview=raw_preview,
        raw_total_rows=raw_total_rows,
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
        .drop_duplicates("station_id")
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
