"""
Synthetic hourly dataset generator for the AWS QC Pipeline.

Stations (real PAGASA/DOST hydromet locations, Metro Manila):
  SCI_GARDEN   Science Garden, QC       14.6453  121.0437
  NAPINDAN_II  Napindan II, Taguig      14.5428  121.1067
  MANDALUYONG  Mandaluyong              14.5794  121.0359
  MYC          Marikina Youth Camp      14.6500  121.1167
  VALENZUELA   Valenzuela NHS           14.7011  120.9830

Date range: 2021-01-01 to 2023-12-31 (hourly)
Total stations in output: exactly 5

Case assignments per station:
  SCI_GARDEN   -> C1 isolated spikes, A2 single missing hours, A6 duplicate rows
  NAPINDAN_II  -> C2 zero during wet season, A3 multi-hour gap (>=2), A4 series-start NaN
  MANDALUYONG  -> A5 series-end NaN, A9 daily gap >=2 days, A11 daily series-end NaN
  MYC          -> A10 daily series-start NaN, A6 duplicate rows
  VALENZUELA   -> C3 typhoon cluster (all 5), A7 all-NaN sub-window, A8 <2 valid sub-window
  ALL 5        -> C3 typhoon cluster, C4 normal seasonal baseline

A7/A8 are sub-period windows only (station still survives overall).
A12/A13 (negative rainfall, bad coord) saved separately in validation_errors.csv.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

SEED = 42
rng = np.random.default_rng(SEED)

STATIONS = {
    'SCI_GARDEN':  (14.6453, 121.0437),
    'NAPINDAN_II': (14.5428, 121.1067),
    'MANDALUYONG': (14.5794, 121.0359),
    'MYC':         (14.6500, 121.1167),
    'VALENZUELA':  (14.7011, 120.9830),
}

START = datetime(2021, 1, 1,  0, 0, 0)
END   = datetime(2023, 12, 31, 23, 0, 0)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hourly_rain(dt: datetime) -> float:
    month = dt.month
    hour  = dt.hour
    if 6 <= month <= 11:
        daily_total = rng.uniform(8.0, 60.0)
    else:
        daily_total = rng.uniform(0.0, 5.0)
    weights = np.ones(24)
    weights[13:19] = 3.0
    weights[0:6]   = 0.3
    weights /= weights.sum()
    val = daily_total * weights[hour] + rng.uniform(-0.05, 0.05)
    return round(max(0.0, val), 1)


def dt_range(start: datetime, end: datetime):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(hours=1)


def day_range(start: datetime, n_days: int):
    return [start + timedelta(days=i) for i in range(n_days)]


# ---------------------------------------------------------------------------
# Pre-compute injection sets (dates/hours to mutate)
# ---------------------------------------------------------------------------

# A2: single missing hour (hour 14) — 50 days on SCI_GARDEN
A2_DAYS = set(
    d.date() for d in
    pd.date_range('2021-03-01', periods=17, freq='D').tolist() +
    pd.date_range('2022-07-01', periods=17, freq='D').tolist() +
    pd.date_range('2023-10-01', periods=16, freq='D').tolist()
)

# A3: multi-hour gap (hours 10 & 11 NaN) — 30 days on NAPINDAN_II
A3_DAYS = set(
    d.date() for d in
    pd.date_range('2021-04-01', periods=10, freq='D').tolist() +
    pd.date_range('2022-08-15', periods=10, freq='D').tolist() +
    pd.date_range('2023-11-01', periods=10, freq='D').tolist()
)

# A4: series-start NaN — first 3 hours of NAPINDAN_II's very first day
A4_START_DT = START  # 2021-01-01 00:00, 01:00, 02:00

# A5: series-end NaN — last 3 hours of MANDALUYONG's very last day
A5_END_DT = END  # 2023-12-31 21:00, 22:00, 23:00

# A6: duplicate rows — 15 days on SCI_GARDEN and MYC
A6_DAYS = set(
    d.date() for d in pd.date_range('2021-02-01', periods=15, freq='D')
)
A6_STATIONS = {'SCI_GARDEN', 'MYC'}

# A7: all-NaN sub-window — VALENZUELA Jan 2021 (30 days)
A7_START = datetime(2021, 1, 1)
A7_END   = datetime(2021, 1, 30, 23, 0, 0)

# A8: <2 valid sub-window — VALENZUELA Feb 1-3 2021, only 1 valid hour
A8_START   = datetime(2021, 2, 1)
A8_END     = datetime(2021, 2, 3, 23, 0, 0)
A8_VALID_DT = datetime(2021, 2, 1, 12, 0, 0)  # only this hour is valid

# A9: daily gap >=2 — MANDALUYONG Jul 15-16 2021 (all hours NaN both days)
A9_DAYS = {
    d.date() for d in pd.date_range('2021-07-15', periods=2, freq='D')
}

# A10: daily series-start NaN — MYC Aug 1 2021 (all 24 hours NaN)
A10_DAY = datetime(2021, 8, 1).date()

# A11: daily series-end NaN — MANDALUYONG Sep 30 2023 (all 24 hours NaN)
A11_DAY = datetime(2023, 9, 30).date()

# C1: isolated spikes — SCI_GARDEN, 15 wet-season days across 3 years
_wet_pool = pd.date_range('2021-06-01', '2021-11-30', freq='D').tolist() + \
            pd.date_range('2022-06-01', '2022-11-30', freq='D').tolist() + \
            pd.date_range('2023-06-01', '2023-11-30', freq='D').tolist()
_wet_pool = [d for d in _wet_pool if d.date() not in A2_DAYS]
C1_DAYS = set(
    d.date() for d in rng.choice(_wet_pool, size=15, replace=False)
)

# C2: zero during wet — NAPINDAN_II, 15 wet-season days
_wet_pool2 = [d for d in _wet_pool if d.date() not in A3_DAYS]
C2_DAYS = set(
    d.date() for d in rng.choice(_wet_pool2, size=15, replace=False)
)

# C3: typhoon cluster — all 5 stations, Aug 10-14 2022
C3_DAYS = set(
    d.date() for d in pd.date_range('2022-08-10', periods=5, freq='D')
)

# Pre-draw spike values per C1 day and C3 day so rng stays deterministic
C1_VALS = {d: round(float(rng.uniform(180.0, 230.0)) / 24, 1) for d in C1_DAYS}
C3_VALS = {sid: round(float(rng.uniform(150.0, 200.0)) / 24, 1) for sid in STATIONS}


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------

def build_dataset() -> list:
    rows      = []
    dup_rows  = []   # A6 duplicates collected separately, appended at end
    labels    = []

    for dt in dt_range(START, END):
        date_only = dt.date()
        hour      = dt.hour
        dt_str    = dt.strftime('%Y-%m-%d %H:%M:%S')

        for sid, (lat, lon) in STATIONS.items():
            rain = hourly_rain(dt)
            label = 'C4_normal'

            # ----------------------------------------------------------------
            # SCI_GARDEN injections
            # ----------------------------------------------------------------
            if sid == 'SCI_GARDEN':
                if date_only in C1_DAYS:
                    rain  = C1_VALS[date_only]
                    label = 'C1_isolated_spike'
                elif date_only in A2_DAYS and hour == 14:
                    rain  = None
                    label = 'A2_single_hour_gap'
                elif date_only in C3_DAYS:
                    rain  = C3_VALS[sid]
                    label = 'C3_typhoon_cluster'

            # ----------------------------------------------------------------
            # NAPINDAN_II injections
            # ----------------------------------------------------------------
            elif sid == 'NAPINDAN_II':
                if dt == A4_START_DT or \
                   dt == A4_START_DT + timedelta(hours=1) or \
                   dt == A4_START_DT + timedelta(hours=2):
                    rain  = None
                    label = 'A4_series_start_nan'
                elif date_only in A3_DAYS and hour in (10, 11):
                    rain  = None
                    label = 'A3_multi_hour_gap'
                elif date_only in C2_DAYS:
                    rain  = 0.0
                    label = 'C2_zero_during_wet'
                elif date_only in C3_DAYS:
                    rain  = C3_VALS[sid]
                    label = 'C3_typhoon_cluster'

            # ----------------------------------------------------------------
            # MANDALUYONG injections
            # ----------------------------------------------------------------
            elif sid == 'MANDALUYONG':
                if date_only in A9_DAYS:
                    rain  = None
                    label = 'A9_daily_gap'
                elif date_only == A11_DAY:
                    rain  = None
                    label = 'A11_daily_end_nan'
                elif date_only == A5_END_DT.date() and hour >= 21:
                    rain  = None
                    label = 'A5_series_end_nan'
                elif date_only in C3_DAYS:
                    rain  = C3_VALS[sid]
                    label = 'C3_typhoon_cluster'

            # ----------------------------------------------------------------
            # MYC injections
            # ----------------------------------------------------------------
            elif sid == 'MYC':
                if date_only == A10_DAY:
                    rain  = None
                    label = 'A10_daily_start_nan'
                elif date_only in C3_DAYS:
                    rain  = C3_VALS[sid]
                    label = 'C3_typhoon_cluster'

            # ----------------------------------------------------------------
            # VALENZUELA injections
            # ----------------------------------------------------------------
            elif sid == 'VALENZUELA':
                if A7_START <= dt <= A7_END:
                    rain  = None
                    label = 'A7_all_nan_subwindow'
                elif A8_START <= dt <= A8_END:
                    rain  = 3.2 if dt == A8_VALID_DT else None
                    label = 'A8_insufficient_readings'
                elif date_only in C3_DAYS:
                    rain  = C3_VALS[sid]
                    label = 'C3_typhoon_cluster'

            row = {
                'station_id': sid,
                'date':       dt_str,
                'latitude':   lat,
                'longitude':  lon,
                'rainfall':   rain,
                '_label':     label,
            }
            rows.append(row)

            # A6: collect duplicate for SCI_GARDEN and MYC
            if sid in A6_STATIONS and date_only in A6_DAYS:
                dup_rows.append({
                    'station_id': sid,
                    'date':       dt_str,
                    'latitude':   lat,
                    'longitude':  lon,
                    'rainfall':   round(rain + 1.0, 1) if rain is not None else None,
                    '_label':     'A6_duplicate',
                })

    # Append duplicates at the end (pipeline will dedup by station_id + date)
    rows.extend(dup_rows)

    # Build labels
    labels = [
        {'station_id': 'SCI_GARDEN',  'case': 'A2_single_hour_gap',
         'detail': '50 days, hour 14 NaN',
         'expected': 'hour_interpolated_interpolated_flag_true_on_daily_row'},
        {'station_id': 'SCI_GARDEN',  'case': 'A6_duplicate_rows',
         'detail': '15 days duplicated at end of file',
         'expected': 'duplicate_dropped_first_kept'},
        {'station_id': 'SCI_GARDEN',  'case': 'C1_isolated_spike',
         'detail': '15 wet-season days 180-230mm/day',
         'expected': 'flagged_anomaly_lof_spatial_mode'},
        {'station_id': 'NAPINDAN_II', 'case': 'A3_multi_hour_gap',
         'detail': '30 days hours 10-11 NaN',
         'expected': 'both_hours_excluded_not_interpolated'},
        {'station_id': 'NAPINDAN_II', 'case': 'A4_series_start_nan',
         'detail': 'First 3 hours of station series NaN (2021-01-01 00-02h)',
         'expected': 'leading_nan_hours_excluded'},
        {'station_id': 'NAPINDAN_II', 'case': 'C2_zero_during_wet',
         'detail': '15 wet-season days rainfall=0 while neighbors high',
         'expected': 'flagged_anomaly_lof_spatial_mode'},
        {'station_id': 'MANDALUYONG', 'case': 'A5_series_end_nan',
         'detail': 'Last 3 hours of station series NaN (2023-12-31 21-23h)',
         'expected': 'trailing_nan_hours_excluded'},
        {'station_id': 'MANDALUYONG', 'case': 'A9_daily_gap_gte2',
         'detail': '2021-07-15 and 2021-07-16 all hours NaN -> 2 NaN daily rows excluded',
         'expected': 'two_daily_rows_excluded_after_downmapping'},
        {'station_id': 'MANDALUYONG', 'case': 'A11_daily_series_end_nan',
         'detail': '2023-09-30 all hours NaN -> daily row excluded',
         'expected': 'last_daily_row_of_window_excluded'},
        {'station_id': 'MYC',         'case': 'A10_daily_series_start_nan',
         'detail': '2021-08-01 all hours NaN -> daily row excluded',
         'expected': 'first_daily_row_of_window_excluded'},
        {'station_id': 'MYC',         'case': 'A6_duplicate_rows',
         'detail': '15 days duplicated at end of file',
         'expected': 'duplicate_dropped_first_kept'},
        {'station_id': 'VALENZUELA',  'case': 'A7_all_nan_subwindow',
         'detail': '2021-01-01 to 2021-01-30 all NaN -> 30 daily rows excluded',
         'expected': 'all_nan_daily_rows_excluded_station_survives'},
        {'station_id': 'VALENZUELA',  'case': 'A8_insufficient_readings',
         'detail': '2021-02-01 to 2021-02-03, only 1 valid hour -> daily rows excluded',
         'expected': 'sub_period_excluded_station_survives'},
        {'station_id': 'ALL_5',       'case': 'C3_typhoon_cluster',
         'detail': '2022-08-10 to 2022-08-14 all stations 150-200mm/day',
         'expected': 'not_flagged_all_neighbors_agree'},
        {'station_id': 'ALL_5',       'case': 'C4_normal_seasonal',
         'detail': 'Majority of data: dry season 0-5mm/day, wet season 8-60mm/day',
         'expected': 'no_anomaly'},
        {'station_id': 'A12_validation', 'case': 'A12_negative_rainfall',
         'detail': 'rainfall=-5.0 -> in validation_errors.csv only',
         'expected': 'ValueError_rainfall_must_be_non_negative'},
        {'station_id': 'A13_validation', 'case': 'A13_bad_coordinate',
         'detail': 'latitude=999 -> in validation_errors.csv only',
         'expected': 'ValueError_latitude_out_of_range'},
    ]

    return rows, labels


def build_validation_errors() -> list:
    lat, lon = STATIONS['SCI_GARDEN']
    return [
        {'station_id': 'SCI_GARDEN', 'date': '2021-01-01 06:00:00',
         'latitude': lat, 'longitude': lon, 'rainfall': -5.0,
         'case': 'A12_negative_rainfall',
         'expected': 'ValueError_raised'},
        {'station_id': 'SCI_GARDEN', 'date': '2021-01-01 07:00:00',
         'latitude': 999.0, 'longitude': lon, 'rainfall': 2.0,
         'case': 'A13_bad_coordinate',
         'expected': 'ValueError_raised'},
    ]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    print("Building dataset (5 stations x 2021-2023 hourly)...")
    all_rows, labels = build_dataset()
    print(f"  Total rows (incl. duplicates) : {len(all_rows):,}")

    df_internal = pd.DataFrame(all_rows)

    df_main = df_internal.drop(columns=['_label'])
    df_labels  = pd.DataFrame(labels)
    df_errors  = pd.DataFrame(build_validation_errors())

    out_main   = 'prototypes/synthetic_hourly.csv'
    out_labels = 'prototypes/synthetic_labels.csv'
    out_errors = 'prototypes/synthetic_validation_errors.csv'

    df_main.to_csv(out_main,   index=False)
    df_labels.to_csv(out_labels, index=False)
    df_errors.to_csv(out_errors, index=False)

    print(f"\nSaved : {out_main}   ({len(df_main):,} rows)")
    print(f"Saved : {out_labels}  ({len(df_labels)} label entries)")
    print(f"Saved : {out_errors}  ({len(df_errors)} validation error rows)")

    print("\n--- Sanity Check ---")
    print(f"Unique station_id : {df_main['station_id'].nunique()} -> {sorted(df_main['station_id'].unique())}")
    print(f"NaN rainfall rows : {df_main['rainfall'].isna().sum():,}")
    print(f"Negative rainfall : {(df_main['rainfall'].dropna() < 0).sum()}")
    print(f"Date range        : {df_main['date'].min()} to {df_main['date'].max()}")

    print("\nRow counts by label:")
    for lbl, cnt in df_internal.groupby('_label').size().sort_values(ascending=False).items():
        print(f"  {lbl:<35} {cnt:>8,}")


if __name__ == '__main__':
    main()
