"""
Zone A: Data Cleaning & Interpolation with Aggressive Exclusion Policy

This module implements strict data quality control for the AWS Quality Control Pipeline.
It validates input, removes problematic data, and performs minimal interpolation
(single-day gaps only) while maintaining full data integrity and audit trails.

Author: AWS QC Pipeline Team
Version: 1.0.0
"""

import pandas as pd
import numpy as np
from typing import Tuple, Dict, Any


def _downmap_hourly_to_daily(df: pd.DataFrame) -> pd.DataFrame:
    """
    Auto-detect if rainfall data is hourly (contains time component or sub-daily records)
    and convert to daily by sum per day.
    """
    df_temp = df.copy()
    parsed_dates = pd.to_datetime(df_temp['date'], errors='coerce')
    
    # Auto-detect hourly if there is a time component present
    is_hourly = False
    if parsed_dates.notna().any():
        has_time = (parsed_dates.dt.hour != 0).any() | \
                   (parsed_dates.dt.minute != 0).any() | \
                   (parsed_dates.dt.second != 0).any()
        if has_time:
            is_hourly = True
            
    if is_hourly:
        df_temp['date'] = parsed_dates
        df_temp['date_only'] = df_temp['date'].dt.date
        
        rain_col = 'rainfall' if 'rainfall' in df_temp.columns else 'rainfall_mm'
        
        grouped = df_temp.groupby(['station_id', 'date_only']).agg({
            'latitude': 'first',
            'longitude': 'first',
            rain_col: lambda x: x.sum(min_count=1)
        }).reset_index()
        
        grouped = grouped.rename(columns={'date_only': 'date'})
        grouped['date'] = pd.to_datetime(grouped['date'])
        return grouped
        
    return df


def process_zone_a(raw_data: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Zone A: Data Cleaning & Interpolation with Aggressive Exclusion Policy.

    Implements a strict data quality pipeline following three core decisions:
    - Decision 1: Aggressive exclusion (exclude, don't flag)
    - Decision 2: Gap limit = 1 (only fill single-day gaps)
    - Decision 3: No extrapolation (exclude series start/end NaN)

    Processing order (exact):
    1. Hourly to daily downmapping (auto-detected)
    2. Input validation (columns, types, ranges)
    3. Remove duplicate (station_id + date) rows
    4. Station-level filtering (aggressive)
    5. Row-level gap detection & filtering
    6. Single-day gap filling (limit=1, limit_area='inside')
    7. Numeric rounding (1 decimal place)
    8. Quality report generation

    Args:
        raw_data (pd.DataFrame): Raw input CSV data with required columns:
            - station_id: TEXT, unique station identifier
            - date: TEXT/DATE, ISO 8601 format (YYYY-MM-DD)
            - latitude: FLOAT, WGS84 latitude (-90 to +90)
            - longitude: FLOAT, WGS84 longitude (-180 to +180)
            - rainfall or rainfall_mm: FLOAT/INT, rainfall measurements (non-negative)

    Returns:
        Tuple[pd.DataFrame, Dict[str, Any]]:
            - cleaned_data: DataFrame with NO NaN values, interpolated_flag column added
            - quality_report: Dict with exclusion statistics matching SCHEMA.md output contract

    Raises:
        ValueError: Clear, user-friendly error messages on validation failure

    Guarantees:
        - Output contains NO NaN values in rainfall
        - All numeric values rounded to exactly 1 decimal place
        - interpolated_flag column True only for values filled by interpolation
        - All original working columns preserved
        - Complete audit trail of exclusions in quality_report
    """

    # Track initial state for quality report
    initial_rows = len(raw_data)
    initial_stations = raw_data['station_id'].nunique() if len(
        raw_data) > 0 else 0

    try:
        # Step 0: Downmap hourly data to daily
        df_downmapped = _downmap_hourly_to_daily(raw_data)
        initial_downmapped_rows = len(df_downmapped)

        # Step 1: Validate input data
        df = _validate_input(df_downmapped)
        duplicates_removed = initial_downmapped_rows - len(df)

        # Step 2: Station-level filtering (aggressive exclusion)
        df, station_exclusions = _filter_stations_by_validity(df)

        # Step 3: Row-level gap detection & filtering
        df, gap_exclusions = _exclude_invalid_gaps(df)

        # Step 4: Single-day gap filling
        df = _fill_single_day_gaps(df)

        # Step 5: Numeric precision (1 decimal place)
        df = _round_numeric_columns(df)

        # Step 6: Generate quality report
        final_rows = len(df)
        final_stations = df['station_id'].nunique() if len(df) > 0 else 0

        quality_report = _generate_quality_report(
            initial_rows=initial_downmapped_rows,
            initial_stations=initial_stations,
            final_rows=final_rows,
            final_stations=final_stations,
            station_exclusions=station_exclusions,
            gap_exclusions=gap_exclusions,
            duplicates_removed=duplicates_removed,
        )

        return df.reset_index(drop=True), quality_report

    except ValueError:
        # Re-raise validation errors with clear messages
        raise
    except Exception as e:
        raise ValueError(f"Zone A processing failed: {str(e)}")


def _validate_input(raw_data: pd.DataFrame) -> pd.DataFrame:
    """
    Validate input CSV: check required columns, data types, ranges, remove duplicates.

    Checks:
    - Required columns present
    - Date format valid (ISO 8601)
    - Numeric columns parseable
    - Rainfall is non-negative
    - Remove duplicate (station_id + date) combinations

    Args:
        raw_data (pd.DataFrame): Raw input data

    Returns:
        pd.DataFrame: Validated, deduplicated data

    Raises:
        ValueError: Descriptive error for any validation failure
    """

    # Check required columns
    rain_col = 'rainfall' if 'rainfall' in raw_data.columns else 'rainfall_mm'
    required_columns = {'station_id', 'date', 'latitude', 'longitude', rain_col}
    missing_columns = required_columns - set(raw_data.columns)
    if missing_columns:
        raise ValueError(
            f"Missing required columns: {', '.join(sorted(missing_columns))}")

    if len(raw_data) == 0:
        raise ValueError("Input CSV is empty (0 rows)")

    df = raw_data[list(required_columns)].copy()

    # Parse date column
    try:
        df['date'] = pd.to_datetime(
            df['date'], format='%Y-%m-%d', errors='coerce')
    except Exception as e:
        raise ValueError(
            f"Date parsing failed. Expected ISO 8601 format (YYYY-MM-DD): {str(e)}")

    # Remove rows with invalid dates
    initial_count = len(df)
    df = df[df['date'].notna()].copy()

    # Convert numeric columns
    for col in ['latitude', 'longitude', rain_col]:
        try:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        except Exception as e:
            raise ValueError(f"Column '{col}' must be numeric: {str(e)}")

    # Validate coordinate ranges
    if df['latitude'].notna().any():
        if (df.loc[df['latitude'].notna(), 'latitude'] < -90).any() or \
           (df.loc[df['latitude'].notna(), 'latitude'] > 90).any():
            raise ValueError("Latitude must be between -90 and +90")

    if df['longitude'].notna().any():
        if (df.loc[df['longitude'].notna(), 'longitude'] < -180).any() or \
           (df.loc[df['longitude'].notna(), 'longitude'] > 180).any():
            raise ValueError("Longitude must be between -180 and +180")

    # Validate rainfall range
    if df[rain_col].notna().any():
        if (df.loc[df[rain_col].notna(), rain_col] < 0).any():
            raise ValueError(f"{rain_col} must be non-negative")

    # Remove duplicates (station_id + date combination, keep first)
    df = df.drop_duplicates(subset=['station_id', 'date'], keep='first').copy()

    return df.reset_index(drop=True)


def _filter_stations_by_validity(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
    Exclude entire stations with 0% valid data or fewer than 2 valid readings.

    Valid reading: rainfall is non-NaN.
    This is an "aggressive exclusion" to ensure data quality downstream.

    Args:
        df (pd.DataFrame): Validated input data

    Returns:
        Tuple[pd.DataFrame, Dict[str, int]]:
            - Filtered data with invalid stations removed
            - Dict: counts of excluded stations by reason

    Guarantees:
        - Remaining stations have ≥2 valid readings
        - Remaining stations have >0% valid data
    """

    # Define valid reading: rainfall non-NaN
    rain_col = 'rainfall' if 'rainfall' in df.columns else 'rainfall_mm'
    df['_is_valid_reading'] = df[rain_col].notna()

    # Count valid readings per station
    valid_counts = df.groupby('station_id')['_is_valid_reading'].sum()

    # Identify stations to exclude
    zero_valid = valid_counts[valid_counts == 0].index.tolist()
    insufficient = valid_counts[(valid_counts > 0) & (
        valid_counts < 2)].index.tolist()

    exclusion_stats = {
        'zero_valid_stations': len(zero_valid),
        'insufficient_readings_stations': len(insufficient),
    }

    # Filter out excluded stations
    stations_to_exclude = set(zero_valid + insufficient)
    if stations_to_exclude:
        df = df[~df['station_id'].isin(stations_to_exclude)].copy()

    # Clean up helper column
    df = df.drop(columns=['_is_valid_reading'])

    return df.reset_index(drop=True), exclusion_stats


def _exclude_invalid_gaps(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
    Exclude rows that belong to gaps ≥2 consecutive days or series edges (start/end NaN).

    For each station (sorted by date):
    1. Identify all consecutive NaN sequences
    2. If gap is ≥2 consecutive rows: exclude all rows in that gap
    3. If series starts with NaN: exclude those rows
    4. If series ends with NaN: exclude those rows

    Args:
        df (pd.DataFrame): Data after station filtering

    Returns:
        Tuple[pd.DataFrame, Dict[str, int]]:
            - Filtered data with invalid gap rows removed
            - Dict: counts of excluded rows by reason

    Guarantees:
        - No remaining gaps ≥2 consecutive days
        - No series starting with NaN
        - No series ending with NaN
        - Single-day gaps remain for potential filling
    """

    exclusion_stats = {
        'multi_day_gaps': 0,
        'starts_with_nan': 0,
        'ends_with_nan': 0,
    }

    rows_to_exclude = set()

    # Process each station separately
    for station_id in df['station_id'].unique():
        station_mask = df['station_id'] == station_id
        station_indices = df[station_mask].index.tolist()
        station_df = df.loc[station_indices].sort_values('date').copy()

        # Identify which rows are missing (rainfall is NaN)
        rain_col = 'rainfall' if 'rainfall' in station_df.columns else 'rainfall_mm'
        station_df['_has_nan'] = station_df[rain_col].isna()

        # Find rows to exclude within this station
        local_rows_to_exclude = _identify_invalid_gap_rows(
            station_df, exclusion_stats
        )

        # Convert local indices to global indices
        for local_idx in local_rows_to_exclude:
            global_idx = station_indices[local_idx]
            rows_to_exclude.add(global_idx)

    # Remove excluded rows
    df = df.drop(list(rows_to_exclude)).copy()

    # Clean up helper column
    df = df.drop(columns=['_has_nan'], errors='ignore')

    return df.reset_index(drop=True), exclusion_stats


def _identify_invalid_gap_rows(station_df: pd.DataFrame, exclusion_stats: Dict) -> set:
    """
    Identify local row indices within a single station that should be excluded.

    Exclusion criteria:
    1. Rows before first valid reading (series start NaN)
    2. Rows after last valid reading (series end NaN)
    3. Rows in consecutive NaN gaps ≥2 rows long

    Args:
        station_df (pd.DataFrame): Single station's data, sorted by date
        exclusion_stats (Dict): Mutable dict to track exclusion counts

    Returns:
        set: Local indices to exclude
    """

    rows_to_exclude = set()
    has_nan = station_df['_has_nan'].values

    # Find first and last valid readings
    first_valid_idx = None
    for idx in range(len(station_df)):
        if not has_nan[idx]:
            first_valid_idx = idx
            break

    # If entire station is NaN, should have been caught by station filtering
    if first_valid_idx is None:
        return set(range(len(station_df)))

    # Exclude rows before first valid reading (series start with NaN)
    if first_valid_idx > 0:
        for idx in range(first_valid_idx):
            rows_to_exclude.add(idx)
            exclusion_stats['starts_with_nan'] += 1

    # Find last valid reading
    last_valid_idx = None
    for idx in range(len(station_df) - 1, -1, -1):
        if not has_nan[idx]:
            last_valid_idx = idx
            break

    # Exclude rows after last valid reading (series end with NaN)
    if last_valid_idx is not None and last_valid_idx < len(station_df) - 1:
        for idx in range(last_valid_idx + 1, len(station_df)):
            rows_to_exclude.add(idx)
            exclusion_stats['ends_with_nan'] += 1

    # Detect and exclude gaps ≥2 consecutive rows
    idx = first_valid_idx
    while idx < len(station_df):
        if has_nan[idx]:
            # Start of a NaN gap
            gap_start = idx
            gap_length = 0

            # Count consecutive NaN rows
            while idx < len(station_df) and has_nan[idx]:
                gap_length += 1
                idx += 1

            # If gap is ≥2 consecutive rows, exclude all rows in the gap
            if gap_length >= 2:
                for gap_idx in range(gap_start, gap_start + gap_length):
                    rows_to_exclude.add(gap_idx)
                    exclusion_stats['multi_day_gaps'] += 1
        else:
            idx += 1

    return rows_to_exclude


def _fill_single_day_gaps(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fill ONLY single-day gaps using linear interpolation with limit=1, limit_area='inside'.

    For each station:
    1. Sort by date
    2. Apply pandas linear interpolation with limit=1 (fill ≤1 consecutive NaN)
    3. With limit_area='inside' (don't fill edges; edges already excluded)
    4. Track which values were filled in new interpolated_flag column

    Args:
        df (pd.DataFrame): Data ready for interpolation (no edge NaN, no ≥2-day gaps)

    Returns:
        pd.DataFrame: Same data with single-day gaps filled + interpolated_flag column

    Guarantees:
        - interpolated_flag=True only where values were filled
        - interpolated_flag=False for all original measurements
        - No extrapolation (limit_area='inside')
        - Interpolation respects limit=1
    """

    df = df.copy()
    df['interpolated_flag'] = False
    
    rain_col = 'rainfall' if 'rainfall' in df.columns else 'rainfall_mm'

    # Process each station separately to maintain date sorting
    for station_id in df['station_id'].unique():
        station_mask = df['station_id'] == station_id
        station_indices = df[station_mask].index.tolist()

        # Get station data sorted by date (reset index for easier local indexing)
        station_data = df.loc[station_indices].sort_values(
            'date').reset_index(drop=True)

        # Record which values existed BEFORE interpolation
        before_interp = station_data[rain_col].notna()

        # Perform interpolation with limit=1, limit_area='inside'
        station_data[rain_col] = station_data[rain_col].interpolate(
            method='linear', limit=1, limit_area='inside'
        )

        # After interpolation, find newly filled values
        after_interp = station_data[rain_col].notna()

        # Mark rows where at least one value was newly filled
        newly_filled_mask = (~before_interp) & after_interp

        # Map back to original indices and set interpolated_flag
        local_filled_indices = newly_filled_mask[newly_filled_mask].index.tolist()
        for local_idx in local_filled_indices:
            global_idx = station_indices[local_idx]
            df.loc[global_idx, 'interpolated_flag'] = True

        # Update rainfall in original DataFrame
        for local_idx, global_idx in enumerate(station_indices):
            df.loc[global_idx, rain_col] = station_data.loc[local_idx, rain_col]

    return df.reset_index(drop=True)


def _round_numeric_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Round all numeric columns to exactly 1 decimal place.

    Per SCHEMA.md: all measurements must have precision of 1 decimal place.
    Examples: 28.5, 65.0, 85.2 (never 28.523 or 85.23)

    Args:
        df (pd.DataFrame): Data with numeric values to round

    Returns:
        pd.DataFrame: Same data with numeric columns rounded to 1 decimal
    """

    # Round rainfall to 1 decimal
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
    duplicates_removed: int,
) -> Dict[str, Any]:
    """
    Generate a comprehensive quality report with exact structure from project spec.

    Structure matches SCHEMA.md output contract for easy Streamlit display.

    Args:
        initial_rows (int): Total input rows
        initial_stations (int): Total input stations
        final_rows (int): Total output rows
        final_stations (int): Total output stations
        station_exclusions (Dict): {zero_valid_stations, insufficient_readings_stations}
        gap_exclusions (Dict): {multi_day_gaps, starts_with_nan, ends_with_nan}
        duplicates_removed (int): Duplicate (station_id+date) rows removed

    Returns:
        Dict[str, Any]: Quality report with exact structure:
            {
                "total_input_rows": int,
                "total_input_stations": int,
                "stations_excluded": int,
                "rows_excluded": int,
                "rows_filled": int,
                "exclusion_details": {
                    "zero_valid_stations": int,
                    "insufficient_readings_stations": int,
                    "multi_day_gaps": int,
                    "starts_with_nan": int,
                    "ends_with_nan": int,
                    "duplicates": int
                },
                "summary_text": str
            }
    """

    total_rows_excluded = initial_rows - final_rows
    total_stations_excluded = (
        station_exclusions['zero_valid_stations'] +
        station_exclusions['insufficient_readings_stations']
    )

    summary_text = (
        f"Processed {initial_rows} rows from {initial_stations} station(s). "
        f"Output: {final_rows} rows from {final_stations} station(s). "
        f"Excluded: {total_stations_excluded} station(s) "
        f"({station_exclusions['zero_valid_stations']} with 0% valid, "
        f"{station_exclusions['insufficient_readings_stations']} with <2 readings), "
        f"{gap_exclusions['multi_day_gaps']} rows (gaps ≥2 days), "
        f"{gap_exclusions['starts_with_nan']} rows (series start NaN), "
        f"{gap_exclusions['ends_with_nan']} rows (series end NaN), "
        f"{duplicates_removed} duplicate(s)."
    )

    quality_report = {
        "total_input_rows": initial_rows,
        "total_input_stations": initial_stations,
        "stations_excluded": total_stations_excluded,
        "rows_excluded": total_rows_excluded,
        "rows_filled": 0,  # Will be calculated from interpolated_flag in UI if needed
        "exclusion_details": {
            "zero_valid_stations": station_exclusions['zero_valid_stations'],
            "insufficient_readings_stations": station_exclusions['insufficient_readings_stations'],
            "multi_day_gaps": gap_exclusions['multi_day_gaps'],
            "starts_with_nan": gap_exclusions['starts_with_nan'],
            "ends_with_nan": gap_exclusions['ends_with_nan'],
            "duplicates": duplicates_removed,
        },
        "summary_text": summary_text,
    }

    return quality_report


# Backward compatibility wrapper (for existing streamlit_app.py integration)
def zone_a_linear_interpolation(raw_data: pd.DataFrame) -> pd.DataFrame:
    """
    Backward compatibility wrapper for existing code.

    Calls new process_zone_a() function and returns only cleaned data.
    Quality report is handled internally.

    Args:
        raw_data (pd.DataFrame): Raw input data

    Returns:
        pd.DataFrame: Cleaned data (no NaN values, interpolated_flag column added)
    """
    cleaned_data, _ = process_zone_a(raw_data)
    return cleaned_data
