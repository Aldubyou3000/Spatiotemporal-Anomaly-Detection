# Zone Pipeline Reference

The zone pipeline processes raw rainfall CSV data through three sequential stages.
Execution order is always **Zone A → Zone B → Zone C**.

---

## Zone A — Data Cleaning & Interpolation

**File:** `api/app/zones/zone_a.py`
**Entry point:** `process_zone_a(raw_data)`

Transforms raw hourly station data into daily rainfall. The reference algorithm is frozen. Both API upload paths call it through `services/zones_service.py::_clean_daily_readings`, which enforces complete daily totals and corrects its quality reporting before Zones B/C.

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
- Hourly input needs **24 usable readings in 24 distinct hourly slots per calendar day**. Partial days are excluded, including when a timestamp is absent entirely. Extra readings in one hour cannot replace another missing hour.
- An isolated missing hourly row is recoverable only if valid readings exist exactly one hour before and after it. No interpolation across longer or irregular time gaps.
- A station needs **at least 2 usable daily totals after completeness filtering**, not two hourly records.
- No extrapolation: NaN values at the start or end of a series are always excluded, never estimated.
- Already-daily station input (all timestamps at midnight) retains its supplied daily totals; missing daily values are excluded, not interpolated. Hourly completeness cannot be inferred from a pre-aggregated daily total.
- Hourly/daily detection is per station; one daily-format station can be uploaded alongside hourly stations.
- Negative or infinite rainfall is rejected before summation, so a positive daily sum cannot hide a negative hourly value.
- Pipeline output contains **no missing rainfall values**. Direct calls to the frozen Zone A function do not carry the service's completeness guarantees.

### Quality reporting and verification
- `exclusion_details.incomplete_days`: daily rows produced by Zone A that are excluded for lacking a complete usable total.
- `rows_filled`: number of permitted single-hour estimates made **before** daily exclusions. Includes estimates in days later excluded; it is not the number of retained interpolated days.
- `rows_excluded`: difference between the report's post-aggregation input daily-row count and final retained daily-row count. It does not count fully missing calendar days that vanished during hourly cleaning.
- Station exclusion counters are recalculated after completeness checks. Timestamp duplicates are reported for both single-combined and multi-file uploads.
- The hourly gap and additional daily-gap counters still come from the frozen algorithm. A zero additional daily-gap count does not establish complete calendar coverage; hourly cleaning can already have removed all readings for a day.
- Regression suite: from the repository root, run `api/.venv/Scripts/python.exe -m unittest discover -s api/tests -v`. It includes independent CSV/Decimal recalculation of the four supplied HMDAS files: **3,029 complete daily totals**, **319 partial daily totals excluded**, **127 hourly gaps filled**. This verifies cleaning arithmetic and completeness, not LOF accuracy or sensor health.

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


## Station Review Summary (after Zone C)

This is a separate screening summary, not a sensor accuracy score or a confirmed fault diagnosis. Daily high flags still come from Zone C; individual low-reading events are retained even when the station has no overall warning. The UI uses compact station rows with both flag counts and short guidance. Warning/limited-data rows remain visible; other stations can be expanded. Detailed comparisons and rainy-day coverage are available in tooltips.

A station's comparison group is itself plus its three Zone B neighbors. Average and frequency checks use days when all four report and the group median is at least 10 mm. At least five such days are needed. `bias_ratio` is the mean of daily station/group-median ratios, not a ratio of total rainfall. `top_rate` counts days strictly higher than every neighbor: tied highest values do not count.

- High review: Monitor when `bias_ratio >1.15`; Needs attention when `bias_ratio >1.50` or `top_rate >0.70`.
- Flagged peaks can raise a warning even with fewer assessed rainy days: >=300 mm, or >=15x neighbors with >=30 mm, means Needs attention; >=150 mm, or >=8x with >=20 mm, means Monitor. Neighbor ratios require at least two reporting neighbors and their median >=10 mm. Absolute peaks require no ratio. Peak rainfall/date and maximum ratio can describe different events, so the UI does not combine them into a single event claim.
- Low review: recorded 0–1 mm on an assessed rainy day creates an individual low-reading event. This is not a missing measurement. Monitor when mean ratio <0.80, low-day fraction >0.30, or the low-reading run >=3 assessed rainy days. Needs attention when mean ratio <0.50, or low-day fraction >0.70 together with a run >=5. Runs count successive assessed rainy days; skipped dates do not prove consecutive calendar days.
- Overall priority is the stronger high/low warning. Otherwise either missing/insufficient assessment means Not enough data; only two normal assessments produce No overall warning. Normal uses a neutral badge. No overall warning never clears individual daily flags.

The overview, report, and map share labels in `web/src/lib/stationReview.ts`: Needs attention, Monitor, No overall warning, and Not enough data. The report calls near-zero events Low readings. Daily comparison labels show a rainfall multiple when possible, Nearby typical rainfall: 0 mm when the neighbor median is zero, or comparison unavailable if no neighbor readings exist; they no longer switch to a raw LOF score.

Verification: `api/.venv/Scripts/python.exe -m unittest discover -s api/tests -v` includes station-summary regressions and actual-data cleaning checks. From `web/`, run `node tests/station-review.test.cjs` for shared wording and rendered overview/report cases, then `node node_modules/typescript/bin/tsc --noEmit --incremental false`. No database migration is needed. Rerun the pipeline after updating to recalculate old summaries.
