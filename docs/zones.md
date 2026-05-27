# Zone Pipeline Reference

The zone pipeline processes raw rainfall CSV data through three sequential stages.
Execution order is always **Zone A → Zone B → Zone C**.

---

## Zone A — Data Cleaning & Interpolation

**File:** `api/app/zones/zone_a.py`
**Entry point:** `process_zone_a(raw_data)`

Transforms raw hourly station data into a clean daily dataset ready for spatial analysis. Applies an aggressive exclusion policy: when data quality is uncertain, the row or station is dropped rather than estimated.

### Processing steps (in order)

| Step | What happens |
|------|-------------|
| 1 | **Hourly gap exclusion** — drops rows that belong to gaps ≥ 2 consecutive missing hours, or that fall before the first valid reading / after the last valid reading for a station |
| 2 | **Single-hour interpolation** — linearly fills exactly 1 missing hour between two valid readings (`limit=1, limit_area='inside'`); marks filled rows with `interpolated_flag = True` |
| 3 | **Hourly → daily downmap** — sums rainfall per station per calendar day; `interpolated_flag` is carried as `True` if any hour in that day was interpolated |
| 4 | **Input validation** — checks required columns (`station_id`, `date`, `latitude`, `longitude`, `rainfall`/`rainfall_mm`), parses types, validates coordinate ranges, rejects negative rainfall, removes duplicate `(station_id, date)` rows |
| 5 | **Station-level filtering** — excludes entire stations with 0 valid daily readings or fewer than 2 valid readings |
| 6 | **Daily gap exclusion** — drops daily rows in gaps ≥ 2 consecutive missing days, or at series edges; no interpolation at the daily level |
| 7 | **Rounding** — rounds all rainfall values to 1 decimal place |
| 8 | **Quality report** — returns a dict with full exclusion statistics and a human-readable summary string |

### Key rules
- Single-hour gaps can be interpolated; single-**day** gaps that survive to the daily stage remain NaN (rare edge case).
- A station needs **at least 2 valid readings** to pass through.
- No extrapolation: NaN values at the start or end of a series are always excluded, never estimated.
- Output is guaranteed to contain **no NaN rainfall values**.

### Inputs required
```
station_id   — unique station identifier (TEXT)
date         — ISO 8601 with time component (YYYY-MM-DD HH:MM:SS)
latitude     — WGS84 latitude (−90 to +90)
longitude    — WGS84 longitude (−180 to +180)
rainfall     — non-negative float (also accepted as rainfall_mm)
```

### Output
A daily `DataFrame` with `interpolated_flag` column added, plus a `quality_report` dict.

---

## Zone B — Spatial Neighbor Grouping

**File:** `api/app/zones/zone_b.py`
**Entry point:** `zone_b_haversine_grouping(cleaned_data, k=3)`

Computes the geographic neighborhood for every station so Zone C can evaluate anomalies in local spatial context rather than globally.

### What it does

For each station, calculates the **Haversine distance** (great-circle distance in km) to every other station in the dataset. Returns the `k` closest neighbors sorted by distance.

### Algorithm
1. Extract unique stations (`station_id`, `latitude`, `longitude`) from the cleaned data.
2. For every station pair `(i, j)`, compute the Haversine distance.
3. Sort all other stations by distance for each reference station.
4. Keep only the `k` nearest neighbors (default `k = 3`).

### Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `cleaned_data` | — | DataFrame from Zone A output |
| `k` | `3` | Number of nearest neighbors to return per station |

### Output
```python
{
  "station_id_A": [
    {"neighbor_id": "station_id_B", "distance_km": 12.45},
    {"neighbor_id": "station_id_C", "distance_km": 27.80},
    ...
  ],
  ...
}
```

---

## Zone C — Anomaly Detection (LOF)

**File:** `api/app/zones/zone_c.py`
**Entry point:** `zone_c_lof_anomaly_detection(cleaned_data, neighbors, contamination=0.05, n_neighbors=15)`

Detects rainfall anomalies using **Local Outlier Factor (LOF)** applied within each station's geographic neighborhood. This ensures anomaly scoring is relative to local weather patterns, not the global dataset.

### What it does

For each station:
1. Assembles a **local context** of data rows from that station + all its Zone B neighbors.
2. Scales the `rainfall` feature globally with `RobustScaler` (resistant to outliers).
3. Fits an LOF model on the local context subset.
4. Assigns LOF scores and `is_anomaly` flags back to that station's own rows.
5. Repeats for all stations (each station gets its own LOF model).

### Why spatial context matters
A heavy rainfall day at a coastal station is normal; the same reading at an inland station surrounded by dry neighbors is anomalous. Using geographic neighbors as context captures this distinction.

### Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `cleaned_data` | — | DataFrame from Zone A (no NaN rainfall) |
| `neighbors` | — | Neighbor dict from Zone B (required) |
| `contamination` | `0.05` | Expected fraction of anomalies (5%) |
| `n_neighbors` | `15` | LOF neighborhood size; automatically reduced if local context is smaller |

### Edge cases
- If a station's local context has fewer than 2 data points, it is skipped (no score assigned).
- If local context is smaller than `n_neighbors`, `effective_n_neighbors` is clamped to `len(context) - 1`, minimum 1.

### Output
```python
(
  flagged_data,     # Original DataFrame + 'lof_score' (float) + 'is_anomaly' (bool)
  anomaly_summary   # {station_id: [{"date": ..., "lof_score": ..., "rainfall": ...}]}
)
```

`anomaly_summary` contains only stations that have at least one anomalous reading.

---

## Pipeline Summary

```
Raw hourly CSV
      ↓
  Zone A — clean, interpolate single gaps, downmap to daily
      ↓
  Zone B — compute k-nearest geographic neighbors per station
      ↓
  Zone C — LOF anomaly detection per station in spatial context
      ↓
flagged daily DataFrame + anomaly summary
```

The pipeline is CPU-bound. The API calls it via `run_in_threadpool` to avoid blocking the FastAPI event loop.
