from numbers import Integral

import pandas as pd
import numpy as np
from sklearn.neighbors import LocalOutlierFactor


# ============================================================================
# ZONE C: Anomaly Detection using Local Outlier Factor (LOF)
# ============================================================================
#
# Per-day, within-group comparison.
#
# For each calendar day, the stations that reported that day (within a station's
# Zone B spatial group) are compared AGAINST EACH OTHER on that same day. LOF
# scores each station relative to that day's local crowd; a station is flagged
# only if its score crosses a fixed threshold (not a forced quota).
#
# This replaces the previous approach, which pooled every station's full
# multi-year history into one set and ran LOF on the pile — that was dominated
# by the many 0 mm (dry) days, which corrupted the density math and produced
# meaningless scores. Comparing same-day values keeps each LOF run small, local,
# and free of the all-zeros degeneracy.

# Minimum number of stations that must report on a day for a comparison to be
# meaningful under this model: target plus three concurrent neighbors.
# Fewer reporting stations are unassessed, not confirmed normal.
MIN_STATIONS_PER_DAY = 4

# Anomaly cutoff on the LOF score. sklearn's negative_outlier_factor_ is ~ -1
# for inliers and more negative for outliers; a value <= -ANOMALY_THRESHOLD is
# screened further by rainfall magnitude/difference gates; the score alone is insufficient.
ANOMALY_THRESHOLD = 2.0

# Minimum rainfall (mm) for a station to be eligible as an anomaly. Below this,
# a reading is a trace/light drizzle — not a notable rain event — so even if it
# is the "odd one out" versus dry neighbors (e.g. 1 mm while others are 0 mm) it
# must NOT be flagged. ~10 mm is the rough line between drizzle and a real rain
# event. Without this guard the LOF score can explode for a 1 mm day against an
# all-dry, tie-jittered neighborhood and produce a meaningless flag. Tunable.
MIN_ANOMALY_RAINFALL_MM = 10.0

# Provisional engineering tolerances validated on synthetic cases, not RIDF or sensor-accuracy limits.
HIGH_MIN_DIFFERENCE_MM = 5.0
HIGH_RELATIVE_DIFFERENCE = 0.30

# Low-side anomaly (silent) — single day, deterministic, no LOF.
# A station that stays at ≤1 mm while its group median is ≥10 mm and is <25%
# of that median is a low outlier for that day. Partial readings above 1 mm
# additionally use a neighbor-only median and a minimum 10 mm shortfall.
# High uses LOF plus magnitude checks; low uses explicit screening rules.
# Keeps the dataset limited (no new libs) and unbiased (same thresholds for all).
LOW_MAX_RAIN_MM = 1.0
LOW_MIN_MEDIAN_MM = 10.0
LOW_RATIO = 0.25
LOW_MIN_DEFICIT_MM = 10.0

# Deterministic tie offsets, below the 0.1 mm measurement resolution.
# Sorting each group first keeps scores stable across calls and input order.
_JITTER = 1e-3


def zone_c_lof_anomaly_detection(cleaned_data: pd.DataFrame,
                                 neighbors: dict,
                                 n_neighbors: int = 15) -> tuple:
    """
    Zone C: Anomaly Detection using Local Outlier Factor (LOF), per day.

    For every calendar day, LOF compares the stations that reported that day
    against each other (same-day, within-group). High flags require LOF plus
    rainfall magnitude/difference checks. Low flags screen near-zero or severe
    partial deficits separately. None of these flags confirms a sensor fault.

    Parameters:
    -----------
    cleaned_data : pd.DataFrame
        Data from Zone A with columns: station_id, date, latitude, longitude,
        rainfall or rainfall_mm (no NaNs).
    neighbors : dict
        REQUIRED. Neighbor dict from Zone B:
        {station_id: [{"neighbor_id": str, "distance_km": float}, ...]}.
        Used to restrict each station's same-day comparison to its spatial group.
    n_neighbors : int
        Upper bound on LOF's neighbor count; automatically reduced to fit the
        number of stations available on each day.

    Returns:
    --------
    tuple: (flagged_data: pd.DataFrame, anomaly_summary: dict)
        - flagged_data: Original data with 'lof_score' and 'is_anomaly' columns added
        - anomaly_summary: {station_id: [{"date": datetime, "lof_score": float,
                           "rainfall": float}, ...]}

    Raises:
    -------
    ValueError: If neighbors dict is None or empty, or n_neighbors is not an integer >= 2.
    """

    if isinstance(n_neighbors, bool) or not isinstance(n_neighbors, Integral) or n_neighbors < 2:
        raise ValueError("n_neighbors must be an integer of at least 2.")
    if neighbors is None or not neighbors:
        raise ValueError(
            "Zone C requires spatial neighbors from Zone B. "
            "neighbors dict cannot be None or empty."
        )

    flagged_data = cleaned_data.copy().reset_index(drop=True)
    rain_col = 'rainfall' if 'rainfall' in flagged_data.columns else 'rainfall_mm'

    # Initialize output columns
    flagged_data['lof_score'] = np.nan
    flagged_data['is_anomaly'] = False
    flagged_data['is_low_anomaly'] = False

    # ========================================================================
    # PER-DAY MODE: for each station, score its days against its spatial group
    # on the SAME day. Iterating per station keeps each station's comparison
    # restricted to its own Zone B neighbors (groups may differ per station).
    # ========================================================================
    for station_id in flagged_data['station_id'].unique():
        neighbor_ids = [n['neighbor_id'] for n in neighbors.get(station_id, [])]
        group_ids = [station_id] + neighbor_ids

        # All rows for this station + its spatial group, indexed for same-day lookup.
        group_rows = flagged_data[flagged_data['station_id'].isin(group_ids)]

        # Walk each day this station actually has a reading for.
        station_rows = flagged_data[flagged_data['station_id'] == station_id]
        for global_idx, row in station_rows.iterrows():
            day = row['date']

            # That day's values across the spatial group.
            day_rows = group_rows[group_rows['date'] == day].sort_values('station_id')
            n_today = len(day_rows)

            # Too few stations to judge an "odd one out" → leave as normal.
            if n_today < MIN_STATIONS_PER_DAY:
                continue

            values = day_rows[[rain_col]].to_numpy(dtype=float)

            # Avoid zero-distance ties without introducing process-global random state.
            values = values + np.arange(n_today).reshape(-1, 1) * (_JITTER / n_today)

            # n_neighbors = 2 (clamped): with >= 4 stations (MIN_STATIONS_PER_DAY)
            # this ranks a true outlier strongly negative while normal days stay
            # near -1. Verified on real data including the [0,0,0,X] dry-day shape.
            effective_n_neighbors = min(n_neighbors, 2)

            lof = LocalOutlierFactor(n_neighbors=effective_n_neighbors)
            lof.fit(values)
            scores = lof.negative_outlier_factor_

            # Find this station's position within the day's rows and read its score.
            day_positions = day_rows.index.tolist()
            pos = day_positions.index(global_idx)
            score = float(scores[pos])

            station_value = float(day_rows.loc[global_idx, rain_col])
            day_median = float(day_rows[rain_col].median())
            neighbor_median = float(day_rows.loc[day_rows['station_id'] != station_id, rain_col].median())
            is_high_outlier = station_value > day_median

            # Also require a meaningful amount of rain — a trace (e.g. 1 mm while
            # neighbors are dry) is the odd one out but not a real anomaly.
            is_meaningful = station_value >= MIN_ANOMALY_RAINFALL_MM

            significant_difference = station_value - neighbor_median >= max(
                HIGH_MIN_DIFFERENCE_MM, HIGH_RELATIVE_DIFFERENCE * neighbor_median
            )
            is_high = (score <= -ANOMALY_THRESHOLD and is_high_outlier and is_meaningful and significant_difference)

            # Low outlier: single day where station stayed ≤1 mm while area rained.
            # Deterministic, no LOF (LOF on 0 vs median is unstable with n=4).
            # Catches 0 vs 12, 0.5 vs 11.5 from your screenshots; ignores 0 vs 3 drizzle.
            is_low_outlier = (
                station_value <= LOW_MAX_RAIN_MM
                and day_median >= LOW_MIN_MEDIAN_MM
                and station_value < day_median * LOW_RATIO
            )
            partial_low = (
                station_value > LOW_MAX_RAIN_MM
                and neighbor_median >= LOW_MIN_MEDIAN_MM
                and station_value < neighbor_median * LOW_RATIO
                and neighbor_median - station_value >= LOW_MIN_DEFICIT_MM
            )

            flagged_data.loc[global_idx, 'lof_score'] = score
            flagged_data.loc[global_idx, 'is_anomaly'] = is_high
            flagged_data.loc[global_idx, 'is_low_anomaly'] = is_low_outlier or partial_low

    # ========================================================================
    # Build anomaly summary: group anomalous records by station
    # ========================================================================
    anomaly_summary = {}

    anomalies = flagged_data[flagged_data['is_anomaly']]

    for station_id in flagged_data['station_id'].unique():
        station_anomalies = anomalies[anomalies['station_id'] == station_id]

        if len(station_anomalies) > 0:
            anomaly_summary[station_id] = [
                {
                    'date': row['date'],
                    'lof_score': row['lof_score'],
                    rain_col: row[rain_col]
                }
                for _, row in station_anomalies.iterrows()
            ]

    return flagged_data, anomaly_summary
