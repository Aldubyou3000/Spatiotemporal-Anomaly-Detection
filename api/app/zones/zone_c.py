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
# meaningful. LOF needs n_neighbors >= 2 to avoid a divide-by-zero on tied
# values (two stations with equal rainfall is common — e.g. both 0 mm dry days);
# and n_neighbors=2 only discriminates an outlier when there are >= 4 points
# (with exactly 3 points it collapses to all ~-1). So a real per-day comparison
# needs at least 4 stations reporting. Fewer than that → no anomaly judged.
# Verified on real data across tie/outlier/normal cases. Tunable later.
MIN_STATIONS_PER_DAY = 4

# Anomaly cutoff on the LOF score. sklearn's negative_outlier_factor_ is ~ -1
# for inliers and more negative for outliers; a value <= -ANOMALY_THRESHOLD is
# flagged. 1.5 matches the threshold documented for Zone C. Tunable later.
ANOMALY_THRESHOLD = 1.5

# Minimum rainfall (mm) for a station to be eligible as an anomaly. Below this,
# a reading is a trace/light drizzle — not a notable rain event — so even if it
# is the "odd one out" versus dry neighbors (e.g. 1 mm while others are 0 mm) it
# must NOT be flagged. ~10 mm is the rough line between drizzle and a real rain
# event. Without this guard the LOF score can explode for a 1 mm day against an
# all-dry, tie-jittered neighborhood and produce a meaningless flag. Tunable.
MIN_ANOMALY_RAINFALL_MM = 10.0

# Tie-breaking jitter (mm). Added to each day's values before LOF so no two are
# exactly equal (which would cause divide-by-zero in LOF's density math). Kept
# far below the 0.1 mm data precision so it cannot change any result. Seeded for
# reproducible runs.
_JITTER = 1e-3
_rng = np.random.default_rng(0)


def zone_c_lof_anomaly_detection(cleaned_data: pd.DataFrame,
                                 neighbors: dict,
                                 contamination: float = 0.05,
                                 n_neighbors: int = 15) -> tuple:
    """
    Zone C: Anomaly Detection using Local Outlier Factor (LOF), per day.

    For every calendar day, LOF compares the stations that reported that day
    against each other (same-day, within-group). A station is flagged as an
    anomaly only when its LOF score is worse than ANOMALY_THRESHOLD — the count
    of anomalies is therefore *discovered* per day, never forced to a fixed
    fraction.

    Parameters:
    -----------
    cleaned_data : pd.DataFrame
        Data from Zone A with columns: station_id, date, latitude, longitude,
        rainfall or rainfall_mm (no NaNs).
    neighbors : dict
        REQUIRED. Neighbor dict from Zone B:
        {station_id: [{"neighbor_id": str, "distance_km": float}, ...]}.
        Used to restrict each station's same-day comparison to its spatial group.
    contamination : float
        Retained for signature/back-compat. NOT used to force a flag fraction;
        flagging is governed by ANOMALY_THRESHOLD on the LOF score.
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
    ValueError: If neighbors dict is None or empty.
    """

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
            day_rows = group_rows[group_rows['date'] == day]
            n_today = len(day_rows)

            # Too few stations to judge an "odd one out" → leave as normal.
            if n_today < MIN_STATIONS_PER_DAY:
                continue

            values = day_rows[[rain_col]].to_numpy(dtype=float)

            # Break exact ties before LOF. Rainfall repeats heavily (esp. several
            # stations at 0 mm on a dry day). Identical values are distance 0 from
            # each other, and LOF divides by neighbor distance → divide-by-zero →
            # nonsensical billion-scale scores. A microscopic positive nudge
            # (<= 1e-3 mm, far below the 0.1 mm data precision) makes every value
            # unique so distances are never zero, without changing which station
            # is the outlier. Standard fix for LOF on data with duplicate values.
            values = values + _rng.uniform(0.0, _JITTER, size=values.shape)

            # n_neighbors = 2 (clamped): with >= 4 stations (MIN_STATIONS_PER_DAY)
            # this ranks a true outlier strongly negative while normal days stay
            # near -1. Verified on real data including the [0,0,0,X] dry-day shape.
            effective_n_neighbors = min(n_neighbors, 2)

            lof = LocalOutlierFactor(n_neighbors=effective_n_neighbors)
            lof.fit_predict(values)
            scores = lof.negative_outlier_factor_

            # Find this station's position within the day's rows and read its score.
            day_positions = day_rows.index.tolist()
            pos = day_positions.index(global_idx)
            score = float(scores[pos])

            # Flag only HIGH outliers: a station that is an outlier because it read
            # MORE rain than its same-day neighbors (real storm or sensor spiking
            # high). A station that is the odd-one-out only because it stayed dry
            # while neighbors rained (value below the day's median) is not an
            # actionable anomaly, so it is not flagged.
            station_value = float(day_rows.loc[global_idx, rain_col])
            day_median = float(day_rows[rain_col].median())
            is_high_outlier = station_value > day_median

            # Also require a meaningful amount of rain — a trace (e.g. 1 mm while
            # neighbors are dry) is the odd one out but not a real anomaly.
            is_meaningful = station_value >= MIN_ANOMALY_RAINFALL_MM

            flagged_data.loc[global_idx, 'lof_score'] = score
            flagged_data.loc[global_idx, 'is_anomaly'] = (
                score <= -ANOMALY_THRESHOLD and is_high_outlier and is_meaningful
            )

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
