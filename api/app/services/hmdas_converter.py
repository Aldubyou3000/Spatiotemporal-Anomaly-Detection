"""
HMDAS → pipeline-CSV converter.

PAGASA/HMDAS rainfall exports are one file per station, shaped differently from
what the zone pipeline expects. This module *reformats* those files (it does NOT
clean or judge the data — Zone A still does all quality control) into the single
combined frame the pipeline already accepts:

    station_id, date, latitude, longitude, rainfall

Two input shapes are auto-detected per file:
  - **Raw HMDAS** — 6 metadata header lines (lat/long live there), split
    Date/Time columns, ``NULL`` literals, value column named ``Value [mm]`` or
    ``Total [mm]``. Converted here.
  - **Already-combined CSV** — has ``station_id``/``date``/lat/long columns.
    Handed off to the existing combined-CSV parser unchanged.

Reformatting only:
  - ``NULL`` → real ``NaN`` (PAGASA defines NULL as "no data / erroneous data
    due to defective equipment" — genuinely missing, not zero). Rows are KEPT so
    Zone A can see the gaps.
  - ``Date`` + ``Time`` → one ISO timestamp.
  - value column → ``rainfall``; lat/long from the header onto every row.

On anything it cannot safely handle (missing lat/long, unparseable date,
unexpected columns) it raises ``HmdasFormatError`` naming the file + problem —
the caller maps this to a 422 so the whole batch is rejected with a clear
message rather than producing a silently half-correct dataset.
"""
import io
import re
from typing import Any

import pandas as pd

from .zones_service import ZoneProcessingError, parse_csv_to_dataframe

OUTPUT_COLUMNS = ["station_id", "date", "latitude", "longitude", "rainfall"]

# Number of HMDAS metadata header lines before the real CSV header row.
_HMDAS_META_LINES = 6
_HMDAS_DATE_FORMAT = "%m/%d/%Y %H:%M"


class HmdasFormatError(ZoneProcessingError):
    """Raised when a file looks like (or claims to be) HMDAS but can't be parsed.

    Subclasses ZoneProcessingError so the router's existing 422 mapping catches it.
    """


def _decode(file_bytes: bytes) -> str:
    """Decode upload bytes as text, tolerating a BOM or latin-1 fallback."""
    try:
        return file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            return file_bytes.decode("latin-1")
        except Exception as exc:  # pragma: no cover - extremely unlikely
            raise ZoneProcessingError(f"Could not decode file: {exc}") from exc


def is_hmdas_format(text: str) -> bool:
    """Sniff whether ``text`` is a raw HMDAS station export.

    The signature is a first non-empty line beginning with ``Station Site:`` or
    ``Station Name:`` (optionally wrapped in a quote).
    """
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        probe = stripped.lstrip('"').strip()
        return probe.startswith("Station Site:") or probe.startswith("Station Name:")
    return False


def _slug(name: str) -> str:
    """Turn a station name into a compact station_id (e.g. 'Marikina Youth Camp' -> 'MarikinaYouthCamp')."""
    cleaned = re.sub(r"[^A-Za-z0-9]+", " ", name).strip()
    return "".join(part[:1].upper() + part[1:] for part in cleaned.split())


def parse_metadata(lines: list[str], filename: str) -> dict[str, Any]:
    """Extract station_name, latitude, longitude from the 6 HMDAS metadata lines.

    Each line looks like ``"Key:\tValue",,`` — strip the wrapping quotes and the
    trailing commas, split on the first tab, drop the trailing ``:`` from the key.
    """
    meta: dict[str, str] = {}
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        # Drop a leading quote and everything from the trailing ",, onward.
        line = line.lstrip('"')
        # Remove a trailing quote that precedes the empty trailing columns.
        line = re.sub(r'",?,?\s*$', "", line)
        if "\t" not in line:
            continue
        key, _, value = line.partition("\t")
        meta[key.rstrip(":").strip()] = value.strip()

    name = meta.get("Station Name", "").strip()
    if not name:
        raise HmdasFormatError(
            f"{filename}: missing 'Station Name' in the metadata header."
        )

    lat = _parse_float(meta.get("Latitude"), "Latitude", filename)
    lon = _parse_float(meta.get("Longitude"), "Longitude", filename)
    return {"station_name": name, "latitude": lat, "longitude": lon}


def _parse_float(value: str | None, field: str, filename: str) -> float:
    if value is None or value == "":
        raise HmdasFormatError(
            f"{filename}: missing '{field}' in the metadata header."
        )
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HmdasFormatError(
            f"{filename}: '{field}' value '{value}' in the header is not a number."
        )


def parse_station_file(filename: str, text: str) -> pd.DataFrame:
    """Convert one raw HMDAS station file's text into the combined output shape."""
    all_lines = text.splitlines()
    if len(all_lines) <= _HMDAS_META_LINES:
        raise HmdasFormatError(f"{filename}: file has no data rows.")

    meta = parse_metadata(all_lines[:_HMDAS_META_LINES], filename)

    try:
        df = pd.read_csv(io.StringIO(text), skiprows=_HMDAS_META_LINES, na_values=["NULL"])
    except Exception as exc:
        raise HmdasFormatError(f"{filename}: could not read data rows ({exc}).") from exc

    if df.shape[1] < 3:
        raise HmdasFormatError(
            f"{filename}: expected Date, Time and a value column, found {list(df.columns)}."
        )

    cols = list(df.columns)
    if cols[0].strip().lower() != "date" or cols[1].strip().lower() != "time":
        raise HmdasFormatError(
            f"{filename}: expected 'Date' and 'Time' as the first two columns, found {cols[:2]}."
        )

    value_col = cols[2]  # 'Value [mm]' or 'Total [mm]'
    df = df.rename(columns={value_col: "rainfall"})

    if df.empty:
        raise HmdasFormatError(f"{filename}: file has no data rows.")

    # HMDAS files mix '/' and '-' date separators, sometimes within one file
    # (e.g. 01/01/2021 early, 01-21-2021 later). Normalize to '/' so a single
    # strict month-first format parses everything (no ambiguous auto-guessing).
    raw_date = df["Date"].astype(str).str.strip().str.replace("-", "/", regex=False)
    combined = raw_date + " " + df["Time"].astype(str).str.strip()
    parsed = pd.to_datetime(combined, format=_HMDAS_DATE_FORMAT, errors="coerce")
    bad = parsed.isna()
    if bad.any():
        first_bad = combined[bad].iloc[0]
        raise HmdasFormatError(
            f"{filename}: could not parse date/time '{first_bad}' "
            f"(expected MM/DD/YYYY or MM-DD-YYYY and H:MM)."
        )

    out = pd.DataFrame({
        "station_id": _slug(meta["station_name"]),
        "date": parsed,
        "latitude": meta["latitude"],
        "longitude": meta["longitude"],
        "rainfall": pd.to_numeric(df["rainfall"], errors="coerce"),
    })
    return out[OUTPUT_COLUMNS]


def convert_uploads(files: list[tuple[str, bytes]]) -> tuple[pd.DataFrame, dict[str, int]]:
    """Convert + merge a batch of uploaded files into one pipeline-ready frame.

    Each file is sniffed independently: raw HMDAS files are converted here;
    already-combined CSVs are parsed by the existing combined-CSV path. The
    results are concatenated and sorted by station_id, date.

    Duplicate (station_id, timestamp) rows are dropped keeping the first — a
    duplicate hourly timestamp would otherwise be silently *summed* into the
    daily total during downmapping. The number dropped is reported so it is
    visible, not silent.

    Returns:
        (merged_frame, conversion_stats) where conversion_stats includes
        ``hourly_duplicates_dropped``.
    """
    if not files:
        raise ZoneProcessingError("No files were uploaded.")

    frames: list[pd.DataFrame] = []
    for filename, raw_bytes in files:
        if not raw_bytes:
            raise ZoneProcessingError(f"{filename}: file is empty.")
        text = _decode(raw_bytes)

        if is_hmdas_format(text):
            frames.append(parse_station_file(filename, text))
        else:
            # Already-combined CSV: reuse the validated combined parser unchanged.
            combined = parse_csv_to_dataframe(raw_bytes)
            rain_col = "rainfall" if "rainfall" in combined.columns else "rainfall_mm"
            keep = ["station_id", "date", "latitude", "longitude", rain_col]
            sub = combined[keep].rename(columns={rain_col: "rainfall"})
            frames.append(sub[OUTPUT_COLUMNS])

    merged = pd.concat(frames, ignore_index=True)
    merged = merged.sort_values(["station_id", "date"]).reset_index(drop=True)

    # Guard: a duplicate (station, timestamp) inflates the daily sum at downmap.
    duplicates_dropped = int(merged.duplicated(subset=["station_id", "date"]).sum())
    if duplicates_dropped:
        merged = merged.drop_duplicates(
            subset=["station_id", "date"], keep="first"
        ).reset_index(drop=True)

    conversion_stats = {"hourly_duplicates_dropped": duplicates_dropped}
    return merged, conversion_stats
