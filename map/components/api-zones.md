# Component: API zones (`routers/zones.py`, `services/zones_service.py`, `services/hmdas_converter.py`, `zones/`, `schemas/zones.py`)

The flagship feature: CSV upload → clean → group → anomaly-detect. The API supports synchronous results or in-process background jobs with polling. The zone algorithms themselves are frozen reference code; service-level data-quality checks surround Zone A.

## What it does
- `POST /api/zones/process` — accepts one or more CSV files, reformats HMDAS exports if detected, and returns a `ProcessResult` or a 202 job ID when async mode is requested. `GET /api/zones/jobs/{id}` polls the job.
- Pipeline order: `zone_a` (clean/interpolate) → `zone_b` (Haversine neighbor grouping) → `zone_c` (LOF anomaly detection).
- Multi-file upload (`run_pipeline_multi`) concatenates per-station files into one combined frame before running.

## Files
| File | Role |
|------|------|
| `routers/zones.py` | HTTP layer: `require_analyst_or_bearer` (cookie **or** `Bearer` for direct 4-file bypass), accepts `UploadFile`s, calls `run_pipeline_multi` via `run_in_threadpool`, raises `ZoneProcessingError` → 400. `MAX_UPLOAD_BYTES 20 MB:24` but Vercel proxy caps 4.5 MB / 30s — 4-file LOF uses direct. Dead `require_analyst` import pruned. |
| `services/zones_service.py` | Orchestration: `parse_csv_to_dataframe`, `run_pipeline`, `run_pipeline_multi`, `ZoneProcessingError`. Both paths use `_clean_daily_readings`: permits only complete hourly days, counts real single-hour estimates, rechecks station minimums, and corrects quality reporting before calling Zone B/C. |
| `services/hmdas_converter.py` | Reformats PAGASA/HMDAS exports (one file per station, 6-line metadata header) into the combined pipeline frame. **Does not judge data quality — Zone A still does QC.** Auto-detects raw HMDAS vs already-combined CSV. |
| `zones/zone_a.py` | **Frozen.** Removes edge/multi-row missing gaps, interpolates isolated rows, sums hourly rainfall to daily, and filters stations with fewer than two valid daily readings. Does not itself enforce hourly completeness; use the pipeline service. |
| `zones/zone_b.py` | **Frozen.** Selects the three closest stations using Haversine distance; no radius cutoff or `neighbor_group_id`. |
| `zones/zone_c.py` | **Frozen.** LOF per-day within-group (`MIN_STATIONS_PER_DAY=4:30`, `ANOMALY_THRESHOLD=2.0:35` — was 1.5, now stricter), `MIN_ANOMALY_RAINFALL_MM=10.0`, jitter `1e-3`. |
| `schemas/zones.py` | `ProcessResult` and supporting Pydantic models. |
| `api/tests/test_zones_quality.py` | Stdlib unittest regression suite, including independent CSV/Decimal verification of every complete daily output from the supplied HMDAS dataset. |

## Depends on
- `core/dependencies.py` → `require_analyst_or_bearer` (cookie or `Bearer`; `get_current_user_or_bearer` tries `Authorization: Bearer` first)
- `zones/zone_a|b|c.py`
- `pandas>=2.2.0`, `numpy>=1.26.0`, `scikit-learn>=1.4.0` (version-pinned because the LOF and `interpolate(limit_area=...)` APIs changed)
- `fastapi.concurrency.run_in_threadpool` (CPU-bound pipeline must not block the event loop)

## Depends on it (reverse)
- `web/src/lib/api/zones.ts` → `useZones`/`ZonesContext` (the pipeline result is **local computation, not server data** — intentionally not in SWR)
- `web/src/components/zones/*` — visualizations of `ProcessResult`

## Key invariants
- **Zone algorithms are frozen.** `api/app/zones/` is the canonical source of truth — no other copy exists in the repo. Do not modify `zone_a/b/c.py` (threshold tuning in `zone_c.py:35` is 2.0 deployed).
- `_clean_daily_readings` is the API quality boundary: hourly station-days need 24 readings in 24 distinct hourly slots after genuinely isolated one-hour interpolation. Missing timestamps and longer gaps cause the daily total to be excluded. Daily-format stations are handled separately and missing daily totals are not interpolated. Stations need two usable days after filtering.
- `rows_filled` counts permitted hourly estimates before incomplete days are excluded; `exclusion_details.incomplete_days` counts excluded daily rows. Report input rows remain post-aggregation, not raw hourly rows. Web mirrors the new field with `?? 0` for older API responses.
- Negative/infinite rainfall is rejected before summation. If no station has two usable days, return a clear `ZoneProcessingError` instead of calling Zone B/C with empty data.
- Verification: `api/.venv/Scripts/python.exe -m unittest discover -s api/tests -v`; actual dataset has 3,029 retained daily rows, 319 partial daily rows removed, and 127 hours interpolated. Algorithms in `zones/` remain unchanged.
- The pipeline is synchronous from the client's perspective but runs in a threadpool on the server. Long runs hold a worker thread. On Render Free `0.1 CPU` 4-file = 25-45s → hits Vercel 30s proxy timeout; deployed `web/src/lib/api/zones.ts:5` bypasses via `apiClient.uploadDirect` to `https://spatiotemporal-api.onrender.com` with `Bearer` (see `api-core.md`).
- No audit event for pipeline runs is mapped to a real-time signal (zone results are local UI state, not shared server data). A `zone_run` audit event is logged but only produces the generic `audit` SSE signal.

## Open questions / debt
- Confirmed: `run_pipeline_multi` routes HMDAS files through `convert_uploads` before quality checks; covered by the actual-dataset regression test.
- Version pins (`pandas>=2.2.0`, `scikit-learn>=1.4.0`) are not enforced caps — a future major release could silently change LOF/interpolation behavior.

## Station review summary (2026-10-22)
- `_compute_station_health` and `_compute_stuck_at_zero` are service-level screening summaries, separate from the frozen Zone C algorithm. They are review priorities, not validated sensor reliability.
- High frequency counts strictly greater readings; ties are agreement and no longer raise all stations to suspect. Low runs count successive assessed rainy days, which may span nonconsecutive dates; API schema descriptions and UI explicitly say this.
- Mean ratios use the group median including the target; maximum spike ratio uses neighbors only and can be from a different day than the absolute peak. UI shows the absolute peak/date independently.
- `api/tests/test_station_review.py` adds 10 checks: ties, true highest frequency, mean differences, daily flags with normal summaries, limited data, isolated peaks, low events, assessed-day runs, and missing neighbors. The full 24-test backend suite passed, including supplied HMDAS data. No frozen algorithms or database schema changed.
