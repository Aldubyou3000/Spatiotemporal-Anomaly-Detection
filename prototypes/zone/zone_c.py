import pandas as pd
import numpy as np
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler


# ============================================================================
# ZONE C: Anomaly Detection using Local Outlier Factor (LOF)
# ============================================================================


def zone_c_lof_anomaly_detection(cleaned_data: pd.DataFrame,
                                 neighbors: dict = None,
                                 contamination: float = 0.1,
                                 n_neighbors: int = 20) -> tuple:
    """
    Zone C: Anomaly Detection using Local Outlier Factor (LOF).
    Supports global mode or spatial-context mode using Zone B neighbors.

    Parameters:
    -----------
    cleaned_data : pd.DataFrame
        Data from Zone A with columns: station_id, date, latitude, longitude,
        temperature, humidity (no NaNs).
    neighbors : dict, optional
        Neighbor dict from Zone B: {station_id: [{"neighbor_id": str, "distance_km": float}, ...]}
        If None, uses global LOF mode.
    contamination : float
        Expected proportion of outliers in the data (default 0.1).
    n_neighbors : int
        Number of neighbors for LOF algorithm (default 20).

    Returns:
    --------
    tuple: (flagged_data: pd.DataFrame, anomaly_summary: dict)
        - flagged_data: Original data with 'lof_score' and 'is_anomaly' columns added
        - anomaly_summary: {station_id: [{"date": datetime, "lof_score": float,
                           "temperature": float, "humidity": float}, ...]}
    """

    # Copy data to avoid modifying original
    flagged_data = cleaned_data.copy().reset_index(drop=True)

    # ========================================================================
    # Feature extraction: treat every (temperature, humidity) pair as 2D point
    # ========================================================================
    features = ['temperature', 'humidity']

    # Scale features globally (fit once on all data for consistent scaling)
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(flagged_data[features])

    # Initialize output columns
    flagged_data['lof_score'] = np.nan
    flagged_data['is_anomaly'] = False

    if neighbors is None:
        # ====================================================================
        # GLOBAL MODE: Fit ONE LOF model on all data
        # No spatial context - treats entire dataset as one group
        # ====================================================================

        # Adjust n_neighbors if dataset is too small
        effective_n_neighbors = min(n_neighbors, len(scaled_features) - 1)
        effective_n_neighbors = max(effective_n_neighbors, 1)

        # Fit LOF model on all data
        lof = LocalOutlierFactor(n_neighbors=effective_n_neighbors,
                                 contamination=contamination)
        predictions = lof.fit_predict(scaled_features)

        # Assign results to all rows
        flagged_data['lof_score'] = lof.negative_outlier_factor_
        flagged_data['is_anomaly'] = predictions == -1

    else:
        # ====================================================================
        # SPATIAL-CONTEXT MODE: Fit separate LOF for each station
        # Uses spatial neighbors from Zone B to create local context
        # This restricts LOF neighbor search to geographically nearby stations
        # ====================================================================

        for station_id in flagged_data['station_id'].unique():
            # Get row indices for this station
            station_mask = flagged_data['station_id'] == station_id
            station_row_indices = np.where(station_mask)[0]

            # Get neighbor station IDs from Zone B output
            neighbor_info = neighbors.get(station_id, [])
            neighbor_ids = [n['neighbor_id'] for n in neighbor_info]

            # Build local context: this station's rows + ALL neighbor rows
            context_station_ids = [station_id] + neighbor_ids
            context_mask = flagged_data['station_id'].isin(context_station_ids)
            context_row_indices = np.where(context_mask)[0]

            # Get scaled features for the local context subset
            context_scaled = scaled_features[context_row_indices]

            # Handle edge case: too few samples in local context
            if len(context_scaled) < 2:
                continue

            # Adjust n_neighbors for small local groups (graceful handling)
            effective_n_neighbors = min(n_neighbors, len(context_scaled) - 1)
            effective_n_neighbors = max(effective_n_neighbors, 1)

            # Fit LOF on local context only
            # This ensures anomaly detection considers only spatial neighbors
            lof = LocalOutlierFactor(n_neighbors=effective_n_neighbors,
                                     contamination=contamination)
            predictions = lof.fit_predict(context_scaled)
            scores = lof.negative_outlier_factor_

            # Map results back: assign scores only to THIS station's rows
            # (neighbors get their own scores when processed in their iteration)
            context_list = context_row_indices.tolist()
            for row_idx in station_row_indices:
                position_in_context = context_list.index(row_idx)
                flagged_data.loc[row_idx, 'lof_score'] = scores[position_in_context]
                flagged_data.loc[row_idx, 'is_anomaly'] = predictions[position_in_context] == -1

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
                    'temperature': row['temperature'],
                    'humidity': row['humidity']
                }
                for _, row in station_anomalies.iterrows()
            ]

    return flagged_data, anomaly_summary
