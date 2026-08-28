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
**Entry point:** `zone_c_lof_anomaly_detection(cleaned_data, neighbors, n_neighbors=3)`

Detects rainfall anomalies using **per-day, within-group Local Outlier Factor** — each calendar day is scored inside its 4-station local neighborhood (station + 3 Haversine neighbors), not globally. Deployed `ANOMALY_THRESHOLD=2.0` (`zone_c.py:35`, was 1.5 — stricter, extreme-only), `MIN_STATIONS_PER_DAY=4:30`, `MIN_ANOMALY_RAINFALL_MM=10.0:43`.

### What it does

For each station, for each day:
1. Assembles that **day’s** rows for the station + its Zone B neighbors (`k=3` → group ≤4).
2. If `n_today < 4` skip (need quorum); adds `1e-3` jitter to break ties.
3. Fits `LocalOutlierFactor(n_neighbors=min(2, n_neighbors))` on that day’s `rainfall` values.
4. Flags `is_anomaly` if `score <= -2.0` **and** the value is the high outlier on that day and `>=10 mm`.
5. Also flags `is_low_anomaly` for silent vs wet-neighbor days. Repeats for all stations/days.

### Why spatial context matters
A heavy rainfall day at a coastal station is normal; the same reading at an inland station surrounded by dry neighbors is anomalous. Using geographic neighbors per-day captures this distinction.

### Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `cleaned_data` | — | DataFrame from Zone A (no NaN rainfall) |
| `neighbors` | — | Neighbor dict from Zone B (required) |
| `n_neighbors` | `3` (clamped to `2` inside) | LOF neighborhood size; auto-reduced if group smaller |

### Edge cases
- If a day’s group has `<4` stations, it is skipped (no score — `1`-station uploads never flag, by design).
- `effective_n_neighbors = min(n_neighbors, 2)`; `score` kept in `lof_score`, `NaN` if skipped.

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
