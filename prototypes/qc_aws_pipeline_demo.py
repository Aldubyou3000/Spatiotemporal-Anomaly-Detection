import pandas as pd


# ============================================================================
# CONFIGURATION
# ============================================================================

CSV_FILE = 'prototypes/qc_aws_dummy_data.csv'
DISTANCE_THRESHOLD_KM = 5
CONTAMINATION = 0.1
N_NEIGHBORS = 20


# ============================================================================
# IMPORT ZONES (Zone A → Zone B → Zone C)
# ============================================================================

from zone.zone_a import zone_a_linear_interpolation
from zone.zone_b import zone_b_haversine_grouping
from zone.zone_c import zone_c_lof_anomaly_detection


# ============================================================================
# MAIN PROGRAM
# ============================================================================

if __name__ == "__main__":

    print("=" * 70)
    print("AWS QUALITY CONTROL PIPELINE: ZONE A -> ZONE B -> ZONE C")
    print("=" * 70)

    # ========================================================================
    # STEP 1: Load raw data from CSV
    # ========================================================================
    print(f"\n[STEP 1] Loading data from: {CSV_FILE}")

    raw_data = pd.read_csv(CSV_FILE)
    raw_data['date'] = pd.to_datetime(raw_data['date'])

    print(f"  Loaded {len(raw_data)} rows, {raw_data['station_id'].nunique()} stations")
    print(f"  Missing temperature: {raw_data['temperature'].isna().sum()}")
    print(f"  Missing humidity: {raw_data['humidity'].isna().sum()}")

    # ========================================================================
    # STEP 2: Show raw data sample
    # ========================================================================
    print("\n[STEP 2] RAW DATA SAMPLE (first 5 rows):")
    print("-" * 70)
    print(raw_data.head(5).to_string(index=False))

    # ========================================================================
    # ZONE A: Linear Interpolation (Clean Missing Data)
    # ========================================================================
    print("\n" + "=" * 70)
    print("[ZONE A] Linear Interpolation - Cleaning missing data...")
    print("=" * 70)

    cleaned_data = zone_a_linear_interpolation(raw_data)

    print(f"  Missing after cleaning: temp={cleaned_data['temperature'].isna().sum()}, humidity={cleaned_data['humidity'].isna().sum()}")

    # ========================================================================
    # ZONE B: Haversine Grouping (Find Neighboring Stations)
    # ========================================================================
    print("\n" + "=" * 70)
    print(f"[ZONE B] Haversine Grouping - Finding neighbors within {DISTANCE_THRESHOLD_KM} km...")
    print("=" * 70)

    neighbors = zone_b_haversine_grouping(cleaned_data, DISTANCE_THRESHOLD_KM)

    stations_with_neighbors = sum(1 for v in neighbors.values() if v)
    print(f"  Stations with neighbors: {stations_with_neighbors}/{len(neighbors)}")

    for station_id in sorted(neighbors.keys())[:3]:
        neighbor_list = neighbors[station_id]
        if neighbor_list:
            neighbor_str = ", ".join([f"{n['neighbor_id']} ({n['distance_km']}km)" for n in neighbor_list[:2]])
            print(f"  {station_id}: {neighbor_str}...")

    # ========================================================================
    # ZONE C: LOF Anomaly Detection (Using Spatial Context)
    # ========================================================================
    print("\n" + "=" * 70)
    print(f"[ZONE C] LOF Anomaly Detection - contamination={CONTAMINATION}, n_neighbors={N_NEIGHBORS}")
    print("=" * 70)

    flagged_data, anomaly_summary = zone_c_lof_anomaly_detection(
        cleaned_data,
        neighbors=neighbors,
        contamination=CONTAMINATION,
        n_neighbors=N_NEIGHBORS
    )

    total_anomalies = flagged_data['is_anomaly'].sum()
    print(f"  Total anomalies detected: {total_anomalies}/{len(flagged_data)} ({100*total_anomalies/len(flagged_data):.1f}%)")
    print(f"  Stations with anomalies: {len(anomaly_summary)}")

    # ========================================================================
    # STEP 3: Show flagged data sample
    # ========================================================================
    print("\n[STEP 3] FLAGGED DATA SAMPLE (first 10 rows):")
    print("-" * 70)
    display_cols = ['station_id', 'date', 'temperature', 'humidity', 'lof_score', 'is_anomaly']
    print(flagged_data[display_cols].head(10).to_string(index=False))

    # ========================================================================
    # STEP 4: Show anomaly details
    # ========================================================================
    print("\n[STEP 4] DETECTED ANOMALIES BY STATION:")
    print("-" * 70)

    for station_id in sorted(anomaly_summary.keys()):
        anomalies = anomaly_summary[station_id]
        print(f"\n  {station_id}: {len(anomalies)} anomalies")
        for a in anomalies[:3]:
            date_str = a['date'].strftime('%Y-%m-%d') if hasattr(a['date'], 'strftime') else str(a['date'])[:10]
            print(f"    {date_str}: temp={a['temperature']:.1f}, humidity={a['humidity']:.1f}, lof={a['lof_score']:.3f}")
        if len(anomalies) > 3:
            print(f"    ... and {len(anomalies) - 3} more")

    # ========================================================================
    # STEP 5: Save output to CSV
    # ========================================================================
    output_csv = CSV_FILE.replace('.csv', '_flagged.csv')
    flagged_data.to_csv(output_csv, index=False)
    print(f"\n[STEP 5] Flagged data saved to: {output_csv}")

    # ========================================================================
    # FINAL SUMMARY
    # ========================================================================
    print("\n" + "=" * 70)
    print("PIPELINE SUMMARY")
    print("=" * 70)
    print(f"  Input file:        {CSV_FILE}")
    print(f"  Total records:     {len(flagged_data)}")
    print(f"  Total stations:    {len(neighbors)}")
    print(f"  Distance threshold: {DISTANCE_THRESHOLD_KM} km")
    print(f"  Contamination:     {CONTAMINATION}")
    print(f"  Anomalies found:   {total_anomalies}")
    print(f"  Output file:       {output_csv}")
    print("=" * 70)
    print("Pipeline complete: Zone A -> Zone B -> Zone C")
    print("=" * 70)
