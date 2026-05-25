"""
Zone A: Data Cleaning & Interpolation with Aggressive Exclusion Policy

This module implements strict data quality control for the AWS Quality Control Pipeline.
It validates input, removes problematic data, and performs minimal interpolation
(single-hour gaps only, before downmapping) while maintaining full data integrity
and audit trails.

Author: AWS QC Pipeline Team
Version: 2.0.0
"""

import pandas as pd
import numpy as np
from typing import Tuple, Dict, Any


def _exclude_invalid_hour_gaps(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
    Exclude hourly rows that belong to gaps ≥2 consecutive missing hours or series edges.

    For each station (sorted by datetime):
    1. If series starts with NaN hours: exclude those rows
    2. If series ends with NaN hours: exclude those rows
    3. If gap is ≥2 consecutive NaN hours: exclude all rows in that gap

    Single missing hours (gap length == 1) are left in for interpolation.

    Args:
        df (pd.DataFrame): Raw hourly data with datetime 'date' column

    Returns:
        Tuple[pd.DataFrame, Dict[str, int]]:
            - Filtered data with invalid hourly gap rows removed
            - Dict: counts of excluded rows by reason
    """
    exclusion_stats = {
        'multi_hour_gaps': 0,
        'starts_with_nan': 0,
        'ends_with_nan': 0,
    }

    rain_col = 'rainfall' if 'rainfall' in df.columns else 'rainfall_mm'
    rows_to_exclude = set()

    for station_id in df['station_id'].unique():
        station_mask = df['station_id'] == station_id
        station_indices = df[station_mask].index.tolist()
        station_df = df.loc[station_indices].sort_values('date').copy()
        station_df['_has_nan'] = station_df[rain_col].isna()

        local_to_exclude = _identify_invalid_gap_rows(station_df, exclusion_stats,
                                                       multi_key='multi_hour_gaps')

        for local_idx in local_to_exclude:
            rows_to_exclude.add(station_indices[local_idx])

    df = df.drop(list(rows_to_exclude)).copy()
    df = df.drop(columns=['_has_nan'], errors='ignore')
    return df.reset_index(drop=True), exclusion_stats


def _fill_single_hour_gaps(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fill ONLY single-hour gaps in hourly data using linear interpolation.

    limit=1 ensures only one consecutive missing hour is filled.
    limit_area='inside' prevents extrapolation at series edges.
    Adds 'interpolated_flag' column: True for any row whose value was estimated.

    Args:
        df (pd.DataFrame): Hourly data after invalid gap exclusion

    Returns:
        pd.DataFrame: Same data with single-hour gaps filled + interpolated_flag column
    """
    df = df.copy()
    df['interpolated_flag'] = False
    rain_col = 'rainfall' if 'rainfall' in df.columns else 'rainfall_mm'

    for station_id in df['station_id'].unique():
        station_mask = df['station_id'] == station_id
        station_indices = df[station_mask].index.tolist()

        station_data = df.loc[station_indices].sort_values('date').reset_index(drop=True)
        before_interp = station_data[rain_col].notna()

        station_data[rain_col] = station_data[rain_col].interpolate(
            method='linear', limit=1, limit_area='inside'
        )

        after_interp = station_data[rain_col].notna()
        newly_filled = (~before_interp) & after_interp

        for local_idx in newly_filled[newly_filled].index.tolist():
            df.loc[station_indices[local_idx], 'interpolated_flag'] = True

        for local_idx, global_idx in enumerate(station_indices):
            df.loc[global_idx, rain_col] = station_data.loc[local_idx, rain_col]

    return df.reset_index(drop=True)


def _downmap_hourly_to_daily(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert hourly data to daily by summing rainfall per station per day.

    Auto-detects hourly input by checking for any non-midnight time component.
    interpolated_flag is carried forward: True if any hour in that day was interpolated.
    min_count=1 ensures a day with all-NaN hours stays NaN rather than becoming 0.

    Args:
        df (pd.DataFrame): Hourly data (may include interpolated_flag column)

    Returns:
        pd.DataFrame: Daily-aggregated data
    """
    df_temp = df.copy()
    parsed_dates = pd.to_datetime(df_temp['date'], errors='coerce')

    is_hourly = False
    if parsed_dates.notna().any():
        has_time = (
            (parsed_dates.dt.hour != 0).any() |
            (parsed_dates.dt.minute != 0).any() |
            (parsed_dates.dt.second != 0).any()
        )
        if has_time:
            is_hourly = True

    if is_hourly:
        df_temp['date'] = parsed_dates
        df_temp['date_only'] = df_temp['date'].dt.date
        rain_col = 'rainfall' if 'rainfall' in df_temp.columns else 'rainfall_mm'

        has_flag = 'interpolated_flag' in df_temp.columns

        agg_dict = {
            'latitude': 'first',
            'longitude': 'first',
            rain_col: lambda x: x.sum(min_count=1),
        }
        if has_flag:
            agg_dict['interpolated_flag'] = 'any'

        grouped = df_temp.groupby(['station_id', 'date_only']).agg(agg_dict).reset_index()
        grouped = grouped.rename(columns={'date_only': 'date'})
        grouped['date'] = pd.to_datetime(grouped['date'])
        return grouped

    return df_temp


def process_zone_a(raw_data: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Zone A: Data Cleaning & Interpolation with Aggressive Exclusion Policy.

    Implements a strict data quality pipeline:
    - Decision 1: Aggressive exclusion (exclude, don't flag)
    - Decision 2: Gap limit = 1 (only fill single-hour gaps, before downmapping)
    - Decision 3: No extrapolation (exclude series start/end NaN)

    Processing order (exact):
    1. Hourly gap exclusion (series-edge NaN, gaps ≥2 consecutive hours excluded)
    2. Single-hour gap filling via linear interpolation (limit=1, limit_area='inside')
    3. Hourly to daily downmapping (sum per station per day; interpolated_flag carried)
    4. Input validation (columns, types, ranges)
    5. Remove duplicate (station_id + date) rows
    6. Station-level filtering (aggressive: 0 valid or <2 valid readings)
    7. Daily row-level gap detection & filtering (no interpolation at daily level)
    8. Numeric rounding (1 decimal place)
    9. Quality report generation

    Args:
        raw_data (pd.DataFrame): Raw hourly CSV data with required columns:
            - station_id: TEXT, unique station identifier
            - date: TEXT/DATETIME, ISO 8601 with time component (YYYY-MM-DD HH:MM:SS)
            - latitude: FLOAT, WGS84 latitude (-90 to +90)
            - longitude: FLOAT, WGS84 longitude (-180 to +180)
            - rainfall or rainfall_mm: FLOAT/INT, rainfall measurements (non-negative)

    Returns:
        Tuple[pd.DataFrame, Dict[str, Any]]:
            - cleaned_data: Daily DataFrame with NO NaN rainfall values,
              interpolated_flag column added
            - quality_report: Dict with exclusion statistics

    Raises:
        ValueError: Clear, user-friendly error messages on validation failure

    Guarantees:
        - Output contains NO NaN values in rainfall
        - All numeric values rounded to exactly 1 decimal place
        - interpolated_flag=True on any daily row where at least one hourly value
          was estimated by interpolation
        - All original working columns preserved
        - Complete audit trail of exclusions in quality_report
    """
    initial_rows = len(raw_data)
    initial_stations = raw_data['station_id'].nunique() if len(raw_data) > 0 else 0

    try:
        # Step 1: Exclude invalid hourly gaps (edge NaN, ≥2 consecutive missing hours)
        df_hourly, hour_gap_exclusions = _exclude_invalid_hour_gaps(raw_data)

        # Step 2: Fill single-hour gaps via linear interpolation
        df_hourly = _fill_single_hour_gaps(df_hourly)

        # Step 3: Downmap hourly → daily (interpolated_flag carried as 'any')
        df_daily = _downmap_hourly_to_daily(df_hourly)
        initial_downmapped_rows = len(df_daily)

        # Step 4: Validate input (columns, types, coordinate ranges, negative rainfall)
        df = _validate_input(df_daily)
        duplicates_removed = initial_downmapped_rows - len(df)

        # Step 5: Station-level filtering
        df, station_exclusions = _filter_stations_by_validity(df)

        # Step 6: Daily row-level gap exclusion (no fill at daily level)
        df, gap_exclusions = _exclude_invalid_gaps(df)

        # Step 7: Numeric rounding
        df = _round_numeric_columns(df)

        final_rows = len(df)
        final_stations = df['station_id'].nunique() if len(df) > 0 else 0

        quality_report = _generate_quality_report(
            initial_rows=initial_downmapped_rows,
            initial_stations=initial_stations,
            final_rows=final_rows,
            final_stations=final_stations,
            station_exclusions=station_exclusions,
            gap_exclusions=gap_exclusions,
            hour_gap_exclusions=hour_gap_exclusions,
            duplicates_removed=duplicates_removed,
        )

        return df.reset_index(drop=True), quality_report

    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Zone A processing failed: {str(e)}")


def _validate_input(raw_data: pd.DataFrame) -> pd.DataFrame:
    """
    Validate daily data: check required columns, data types, ranges, remove duplicates.

    Checks:
    - Required columns present
    - Date format valid
    - Numeric columns parseable
    - Rainfall is non-negative
    - Remove duplicate (station_id + date) combinations

    Args:
        raw_data (pd.DataFrame): Daily-aggregated data post-downmapping

    Returns:
        pd.DataFrame: Validated, deduplicated data

    Raises:
        ValueError: Descriptive error for any validation failure
    """
    rain_col = 'rainfall' if 'rainfall' in raw_data.columns else 'rainfall_mm'
    required_columns = {'station_id', 'date', 'latitude', 'longitude', rain_col}
    missing_columns = required_columns - set(raw_data.columns)
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing_columns))}")

    if len(raw_data) == 0:
        raise ValueError("Input CSV is empty (0 rows)")

    keep_cols = list(required_columns)
    if 'interpolated_flag' in raw_data.columns:
        keep_cols.append('interpolated_flag')

    df = raw_data[keep_cols].copy()

    try:
        df['date'] = pd.to_datetime(df['date'], errors='coerce')
    except Exception as e:
        raise ValueError(f"Date parsing failed: {str(e)}")

    df = df[df['date'].notna()].copy()

    for col in ['latitude', 'longitude', rain_col]:
        try:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        except Exception as e:
            raise ValueError(f"Column '{col}' must be numeric: {str(e)}")

    if df['latitude'].notna().any():
        if (df.loc[df['latitude'].notna(), 'latitude'] < -90).any() or \
           (df.loc[df['latitude'].notna(), 'latitude'] > 90).any():
            raise ValueError("Latitude must be between -90 and +90")

    if df['longitude'].notna().any():
        if (df.loc[df['longitude'].notna(), 'longitude'] < -180).any() or \
           (df.loc[df['longitude'].notna(), 'longitude'] > 180).any():
            raise ValueError("Longitude must be between -180 and +180")

    if df[rain_col].notna().any():
        if (df.loc[df[rain_col].notna(), rain_col] < 0).any():
            raise ValueError(f"{rain_col} must be non-negative")

    df = df.drop_duplicates(subset=['station_id', 'date'], keep='first').copy()
    return df.reset_index(drop=True)


def _filter_stations_by_validity(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
    Exclude entire stations with 0% valid daily readings or fewer than 2 valid readings.

    Valid reading: rainfall is non-NaN.

    Args:
        df (pd.DataFrame): Validated daily data

    Returns:
        Tuple[pd.DataFrame, Dict[str, int]]:
            - Filtered data with invalid stations removed
            - Dict: counts of excluded stations by reason
    """
    rain_col = 'rainfall' if 'rainfall' in df.columns else 'rainfall_mm'
    df['_is_valid_reading'] = df[rain_col].notna()
    valid_counts = df.groupby('station_id')['_is_valid_reading'].sum()

    zero_valid = valid_counts[valid_counts == 0].index.tolist()
    insufficient = valid_counts[(valid_counts > 0) & (valid_counts < 2)].index.tolist()

    exclusion_stats = {
        'zero_valid_stations': len(zero_valid),
        'insufficient_readings_stations': len(insufficient),
    }

    stations_to_exclude = set(zero_valid + insufficient)
    if stations_to_exclude:
        df = df[~df['station_id'].isin(stations_to_exclude)].copy()

    df = df.drop(columns=['_is_valid_reading'])
    return df.reset_index(drop=True), exclusion_stats


def _exclude_invalid_gaps(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
    Exclude daily rows in gaps ≥2 consecutive days or at series edges (start/end NaN).

    No interpolation is performed at the daily level. Single-day NaN gaps that
    survive this step remain as NaN (they arise only if a full calendar day had
    all-NaN hourly readings that were not recoverable at the hourly stage).

    Args:
        df (pd.DataFrame): Daily data after station filtering

    Returns:
        Tuple[pd.DataFrame, Dict[str, int]]:
            - Filtered data with invalid daily gap rows removed
            - Dict: counts of excluded rows by reason
    """
    exclusion_stats = {
        'multi_day_gaps': 0,
        'starts_with_nan': 0,
        'ends_with_nan': 0,
    }

    rows_to_exclude = set()

    for station_id in df['station_id'].unique():
        station_mask = df['station_id'] == station_id
        station_indices = df[station_mask].index.tolist()
        station_df = df.loc[station_indices].sort_values('date').copy()

        rain_col = 'rainfall' if 'rainfall' in station_df.columns else 'rainfall_mm'
        station_df['_has_nan'] = station_df[rain_col].isna()

        local_rows_to_exclude = _identify_invalid_gap_rows(station_df, exclusion_stats)

        for local_idx in local_rows_to_exclude:
            rows_to_exclude.add(station_indices[local_idx])

    df = df.drop(list(rows_to_exclude)).copy()
    df = df.drop(columns=['_has_nan'], errors='ignore')
    return df.reset_index(drop=True), exclusion_stats


def _identify_invalid_gap_rows(station_df: pd.DataFrame, exclusion_stats: Dict,
                                multi_key: str = 'multi_day_gaps') -> set:
    """
    Identify local row indices within a single station that should be excluded.

    Exclusion criteria:
    1. Rows before first valid reading (series start NaN)
    2. Rows after last valid reading (series end NaN)
    3. Rows in consecutive NaN gaps ≥2 rows long

    Args:
        station_df (pd.DataFrame): Single station's data, sorted by date, with _has_nan column
        exclusion_stats (Dict): Mutable dict to track exclusion counts
        multi_key (str): Key in exclusion_stats to increment for multi-row gaps

    Returns:
        set: Local indices to exclude
    """
    rows_to_exclude = set()
    has_nan = station_df['_has_nan'].values

    first_valid_idx = None
    for idx in range(len(station_df)):
        if not has_nan[idx]:
            first_valid_idx = idx
            break

    if first_valid_idx is None:
        return set(range(len(station_df)))

    if first_valid_idx > 0:
        for idx in range(first_valid_idx):
            rows_to_exclude.add(idx)
            exclusion_stats['starts_with_nan'] += 1

    last_valid_idx = None
    for idx in range(len(station_df) - 1, -1, -1):
        if not has_nan[idx]:
            last_valid_idx = idx
            break

    if last_valid_idx is not None and last_valid_idx < len(station_df) - 1:
        for idx in range(last_valid_idx + 1, len(station_df)):
            rows_to_exclude.add(idx)
            exclusion_stats['ends_with_nan'] += 1

    idx = first_valid_idx
    while idx < len(station_df):
        if has_nan[idx]:
            gap_start = idx
            gap_length = 0
            while idx < len(station_df) and has_nan[idx]:
                gap_length += 1
                idx += 1
            if gap_length >= 2:
                for gap_idx in range(gap_start, gap_start + gap_length):
                    rows_to_exclude.add(gap_idx)
                    exclusion_stats[multi_key] += 1
        else:
            idx += 1

    return rows_to_exclude


def _round_numeric_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Round rainfall to exactly 1 decimal place.

    Args:
        df (pd.DataFrame): Daily data

    Returns:
        pd.DataFrame: Same data with rainfall rounded to 1 decimal
    """
    rain_col = 'rainfall' if 'rainfall' in df.columns else 'rainfall_mm'
    if rain_col in df.columns:
        df[rain_col] = df[rain_col].round(1)
    return df


def _generate_quality_report(
    initial_rows: int,
    initial_stations: int,
    final_rows: int,
    final_stations: int,
    station_exclusions: Dict[str, int],
    gap_exclusions: Dict[str, int],
    hour_gap_exclusions: Dict[str, int],
    duplicates_removed: int,
) -> Dict[str, Any]:
    """
    Generate a comprehensive quality report.

    Args:
        initial_rows (int): Total daily rows after downmapping (pre-validation)
        initial_stations (int): Total input stations (pre-processing)
        final_rows (int): Total output daily rows
        final_stations (int): Total output stations
        station_exclusions (Dict): {zero_valid_stations, insufficient_readings_stations}
        gap_exclusions (Dict): {multi_day_gaps, starts_with_nan, ends_with_nan}
        hour_gap_exclusions (Dict): {multi_hour_gaps, starts_with_nan, ends_with_nan}
        duplicates_removed (int): Duplicate (station_id+date) rows removed

    Returns:
        Dict[str, Any]: Quality report
    """
    total_rows_excluded = initial_rows - final_rows
    total_stations_excluded = (
        station_exclusions['zero_valid_stations'] +
        station_exclusions['insufficient_readings_stations']
    )

    summary_text = (
        f"Processed {initial_rows} daily rows from {initial_stations} station(s). "
        f"Output: {final_rows} rows from {final_stations} station(s). "
        f"Hourly exclusions — gaps ≥2h: {hour_gap_exclusions['multi_hour_gaps']}, "
        f"series-start: {hour_gap_exclusions['starts_with_nan']}, "
        f"series-end: {hour_gap_exclusions['ends_with_nan']}. "
        f"Station exclusions: {total_stations_excluded} "
        f"({station_exclusions['zero_valid_stations']} with 0% valid, "
        f"{station_exclusions['insufficient_readings_stations']} with <2 readings). "
        f"Daily exclusions — gaps ≥2d: {gap_exclusions['multi_day_gaps']}, "
        f"series-start: {gap_exclusions['starts_with_nan']}, "
        f"series-end: {gap_exclusions['ends_with_nan']}, "
        f"duplicates: {duplicates_removed}."
    )

    return {
        "total_input_rows": initial_rows,
        "total_input_stations": initial_stations,
        "stations_excluded": total_stations_excluded,
        "rows_excluded": total_rows_excluded,
        "rows_filled": 0,
        "exclusion_details": {
            "zero_valid_stations": station_exclusions['zero_valid_stations'],
            "insufficient_readings_stations": station_exclusions['insufficient_readings_stations'],
            "multi_day_gaps": gap_exclusions['multi_day_gaps'],
            "starts_with_nan": gap_exclusions['starts_with_nan'],
            "ends_with_nan": gap_exclusions['ends_with_nan'],
            "duplicates": duplicates_removed,
            "multi_hour_gaps": hour_gap_exclusions['multi_hour_gaps'],
            "hourly_starts_with_nan": hour_gap_exclusions['starts_with_nan'],
            "hourly_ends_with_nan": hour_gap_exclusions['ends_with_nan'],
        },
        "summary_text": summary_text,
    }


# Backward compatibility wrapper
def zone_a_linear_interpolation(raw_data: pd.DataFrame) -> pd.DataFrame:
    """
    Backward compatibility wrapper. Calls process_zone_a() and returns only cleaned data.
    """
    cleaned_data, _ = process_zone_a(raw_data)
    return cleaned_data
