# Spatiotemporal Anomaly Detection - Development Guide

## Project Overview

**AWS Quality Control Pipeline** — A Streamlit web application for automated weather station (AWS) data quality control and anomaly detection using multiple spatial analysis methods.

**Purpose**: Detect anomalies in daily rainfall records through complimentary algorithms deployed across different geographic zones.

**Stack**: Python 3.8+, Streamlit, Pandas, NumPy, scikit-learn, Plotly, Folium

---

## System Scope & Limitations

### Scope of the System

**Zone A (Data Cleaning):**
- **Hourly-to-Daily Downmapping**: Auto-detects if input rainfall data is hourly (sub-daily records) and aggregates to daily totals (sum per day per station) before cleaning/interpolation.
- **Linear interpolation** to fill ONLY single-day gaps with valid data on both sides (limit=1 day).
- **Aggressive exclusion strategy**: removes any data with gaps ≥2 days, NaN at series edges, or insufficient valid readings.
- **Validates rainfall** is within physical range (non-negative, ≥ 0).
- **Checks for required columns**: `station_id`, `date`, `latitude`, `longitude`, and `rainfall` (or `rainfall_mm`).
- **Detects and removes duplicate** `station_id` + `date` combinations.
- **Handles all missing value formats** (NaN, 'NA', 'null', empty cells).
- **Tracks** which values were interpolated vs. measured via `interpolated_flag` column.
- **Flags** stations with missing coordinates.
- **Monitors rounding precision**: 1 decimal place.
- **Exclusion rules** (data is REMOVED, not flagged, to ensure downstream accuracy):
  - Stations with 0% valid data (no salvageable data).
  - Stations with <2 valid readings (insufficient for statistical analysis).
  - Gaps ≥2 consecutive days (too risky to interpolate).
  - Series starting with NaN.
  - Series ending with NaN.

**Zone B (Neighbor Identification):**
- **Haversine distance calculation** for geographic neighbors (1–50 km threshold, tunable).
- Groups stations within distance threshold; adds `neighbor_group_id` column.
- Isolated stations receive NULL group_id.

**Zone C (Anomaly Detection):**
- **Local Outlier Factor (LOF) anomaly detection** using **1D rainfall feature only** (rainfall/rainfall_mm).
- **Supports global mode** (all data) and **spatial-context mode** (neighbors from Zone B only).
- **Uses RobustScaler** to scale skewed rainfall distribution robustly.
- Outputs: `lof_score` (0.5-5.0), `is_anomaly` (boolean, threshold=1.5), `anomaly_mode` (which analysis used).

**Dashboard:**
- CSV upload and download with configurable parameters.
- Folium maps for station locations and neighbor groupings.
- Plotly charts for rainfall timelines with anomaly overlays.
- Rainfall vs LOF score scatter plots for anomaly justification.
- Quality metrics (total records, stations, missing values, anomaly rate).

### Limitations of the System

**Zone A Limitations:**
- Linear interpolation assumes smooth change; cannot capture flash floods or sudden storm fronts.
- Aggressive exclusion reduces dataset size.
- Rounding to 1 decimal place may introduce cumulative precision loss in calculations.

**Data NOT Handled:**
- Temperature, humidity, wind speed, wind direction, atmospheric pressure (rainfall-only system).
- Time zone normalization (assumes input is pre-standardized to UTC).
- Deprecated utilities (`utils/temperature.py`, `unit_converter.py`, `unit_detector.py`) are not used and can be safely deleted.

**System Constraints:**
- Single CSV file per session (no batch processing).
- Session data not persisted (lost on browser close).
- Cannot predict or forecast weather.

---

## Architecture

### Zone-Based Algorithm Structure

Three independent implementations for different geospatial analysis approaches:

- **Zone A** (`zone_a.py`): **Downmapping & Interpolation** — Aggregate hourly to daily sums and fill single-day gaps.
- **Zone B** (`zone_b.py`): **Haversine Grouping** — Cluster nearby stations using geographic distance.
- **Zone C** (`zone_c.py`): **LOF Anomaly Detection** — Local Outlier Factor (1D rainfall feature with RobustScaler).

Each zone is self-contained and plugged into the main Streamlit UI.

### Directory Structure

```
prototypes/               # Main application code
├── streamlit_app.py      # Streamlit UI entry point
├── utils/                # Utility modules (DEPRECATED: temperature utilities no longer used; can be deleted)
├── zone/                 # Zone algorithm implementations
│   ├── __init__.py
│   ├── zone_a.py         # Downmapping, cleaning, and interpolation
│   ├── zone_b.py         # Haversine grouping
│   └── zone_c.py         # LOF anomaly detection
├── qc_aws_dummy_data.csv # Test dataset
└── SETUP.md              # User-facing setup guide
```

---

## Running & Developing

### Start the App

From project root:

```bash
cd prototypes
streamlit run streamlit_app.py
```

Opens on `http://localhost:8501`

### Version Constraints
- **streamlit 1.32.0+** — Required for stable session state.
- **scikit-learn 1.4.0+** — LOF API changed; prior versions have incompatible parameters.
- **pandas 2.2.0+** — `interpolate(limit_area='inside')` parameter required.

---

## Development Conventions

### Streamlit Widget Patterns & Session State Management

**CRITICAL PATTERN FOR RADIO BUTTONS & CONTROLLED WIDGETS:**

✅ **CORRECT (use `key=` parameter):**
```python
st.radio(
    "Select distance mode:",
    options=['Global', 'Spatial-Context'],
    key='distance_mode',
    help="Choose mode"
)
```

❌ **WRONG (manual assignment creates bugs):**
```python
# This causes double-click glitching! Don't do this:
st.session_state.distance_mode = st.radio(
    "Select distance mode:",
    options=['Global', 'Spatial-Context'],
    index=current_index
)
```

### Data Quality Standards

- **Rainfall precision**: 1 decimal place.
- **Rainfall range**: Non-negative (≥ 0).
- **Interpolation**: Zone A rounds to 1 decimal to prevent floating-point bloat.

---

## Testing Notes

⚠️ **No automated tests currently exist.** Testing is manual:
- Upload test CSV via Streamlit UI.
- Verify output in "View Processed Data" tab.
- Check chart anomaly overlays visually.
- Export CSV and inspect columns.

**Manual test data scenarios**:
- Hourly input (should downmap to daily sums).
- Daily input (should skip downmapping).
- 1-day gap (should fill).
- 2-day gap (should exclude).
- Series starts/ends with NaN (should exclude).
- Station with <2 readings (should exclude).
- 0% valid station (should exclude completely).
