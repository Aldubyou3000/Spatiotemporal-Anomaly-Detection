# Component: API zones (`routers/zones.py`, `services/zones_service.py`, `services/hmdas_converter.py`, `zones/`, `schemas/zones.py`)

The flagship feature: CSV upload → clean → group → anomaly-detect. The API supports synchronous results or in-process background jobs with polling. The zone algorithms themselves are frozen reference code; service-level data-quality checks surround Zone A.

## What it does
- `POST /api/zones/process` — accepts one or more CSV files, reformats HMDAS exports if detected, and returns a `ProcessResult` or a 202 job ID when async mode is requested. `GET /api/zones/jobs/{id}` polls the job.
- Pipeline order: `zone_a` (clean/interpolate) → `zone_b` (Haversine neighbor grouping) → `zone_c` (LOF anomaly detection).
- Multi-file upload (`run_pipeline_multi`) concatenates per-station files into one combined frame before running.

## Files
| File | Role |
|------|------|
| `routers/zones.py` | Cookie or Bearer analyst auth; 20 MB combined CSV upload limit. Async requests return 202 and start a daemon thread; synchronous requests use `run_in_threadpool`. `ZoneProcessingError` maps to HTTP 422 synchronously or a polled error status asynchronously. In-memory jobs are guarded by a lock. |
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
- The web uploads with both `async=true` and `async_mode=true` plus `Prefer: respond-async`, then polls. Direct Bearer requests are preferred on Vercel; cookie/proxy and legacy synchronous fallbacks remain. Async jobs now include real stage/station progress (see below).
- Pipeline execution currently has no `audit.log()` call in the router/service; it does not publish an SSE resource signal. Results stay in the requesting browser's ZonesContext.

## Same-day detection rules (source checked 2026-10-24)
- Zone B selects three nearest geographic stations (`k=3`), so a comparison contains the target plus up to three neighbors. More history cannot replace missing stations on a particular date.
- Zone C requires at least four reporting station-days in that group. Otherwise `lof_score` stays missing and both daily flags stay false: this is unassessed, not proof of normal rainfall.
- High readings: rainfall-only, one-dimensional LOF; no RobustScaler. The service passes `n_neighbors=3`, but Zone C clamps it to two rainfall neighbors. Geographic grouping and LOF rainfall neighbors are different steps.
- A high flag needs all three: negative LOF score <= -2, rainfall above the same-day group median (including the target), and rainfall >= 10 mm. Above the median alone is insufficient; no fixed flag quota is used.
- A low flag uses a separate rule, not LOF: rainfall <= 1 mm, group median >= 10 mm, and rainfall < 25% of that median. The four-station gate applies here too.
- Tiny random jitter (0–0.001 mm) breaks rainfall ties before LOF. The module-level seeded generator advances across calls; identical repeated requests are not guaranteed identical scores. The displayed reading/neighbor-median ratio is not the LOF score.

## Background job lifecycle and deployment symptom
- `_jobs` is an in-process dictionary, not Supabase Storage/Postgres. GET returns processing/done/error with HTTP 200 for an existing job, or HTTP 404 `Job not found or expired` when absent. A 200 polling log alone does not establish completion.
- `_gc_jobs()` runs when a new async job is accepted; it removes entries older than 600 seconds from creation and trims the existing store to 50 before insertion. This is opportunistic cleanup, not a precise ten-minute GET expiry.
- Restart/deploy loses every job and stops its daemon work; one worker/replica is required. Stop aborts browser requests, not backend computation. No durable recovery or backend cancellation endpoint exists.
- Supplied deployment logs showed an old job polling successfully, API shutdown, then a 404 for that same ID. This supports restart-related job loss for that incident; the later job's 200 responses did not show its final outcome. Retry after deployment finishes; a durable job store/worker would require separate implementation.

## Open questions / debt
- Confirmed: `run_pipeline_multi` routes HMDAS files through `convert_uploads` before quality checks; covered by the actual-dataset regression test.
- Version pins (`pandas>=2.2.0`, `scikit-learn>=1.4.0`) are not enforced caps — a future major release could silently change LOF/interpolation behavior.

## Controlled synthetic fixture (2026-10-22)
`test-data/synthetic-30-days/` contains four HMDAS-format hourly uploads for September 2023, with synthetic station names/rainfall and locations copied from the supplied station headers. `daily_plan.csv` is editable; `generate.py` rebuilds uploads and the independent 120-row `answer_key.csv`. Original scenarios specify six high, six low, and 108 normal station-days, including heavy-rain controls and 5/10 mm boundary cases. Generation checks saved hourly timestamps and exact daily totals; it does not execute or validate the detector. No missing-data cases are mixed into this Zone C fixture. Use all four files together, separately from real data. Instructions and metric definitions are in its README; controlled-case success cannot establish real-world accuracy.

## Station review summary (2026-10-22)
- `_compute_station_health` and `_compute_stuck_at_zero` are service-level screening summaries, separate from the frozen Zone C algorithm. They are review priorities, not validated sensor reliability.
- High frequency counts strictly greater readings; ties are agreement and no longer raise all stations to suspect. Low runs count successive assessed rainy days, which may span nonconsecutive dates; API schema descriptions and UI explicitly say this.
- Mean ratios use the group median including the target; maximum spike ratio uses neighbors only and can be from a different day than the absolute peak. UI shows the absolute peak/date independently.
- `api/tests/test_station_review.py` adds 10 checks: ties, true highest frequency, mean differences, daily flags with normal summaries, limited data, isolated peaks, low events, assessed-day runs, and missing neighbors. The full 24-test backend suite passed, including supplied HMDAS data. No frozen algorithms or database schema changed.

## Analyst review boundary (2026-10-24)
The web report now stores separate run-scoped analyst judgments and adds them to CSV downloads. They are not added to `ProcessResult`, persisted to the API, fed back into LOF, or used to overwrite detection flags. Review labels are analyst judgments, not independently established ground truth. Service station summaries and original detection counts still describe system output. See [web-state.md](./web-state.md) and [web-pages-components.md](./web-pages-components.md).

## Saved processing runs (2026-10-25)
Successful sync/async executions now call history_service.try_save_run, returning run_id/history_saved/history_error with the original result. Saved results and metadata persist in Supabase; jobs are still in-process. Failure preserves downloadable output and server-held retry data until restart/cleanup. Polling and save retry are limited to the job creator; cookie retry uses CSRF. The frozen algorithms remain unchanged. See [api-history.md](./api-history.md).

## Manual History save (2026-10-25)
_run_job no longer calls history persistence: it returns a temporary run_id/history_saved=false with no save error. Source metadata is computed from uploads, without retaining raw bytes in jobs. Explicit save requires a validated title and calls try_save_run; existing results remain downloadable if saving fails. Job TTL is now 3600 seconds and cleanup/max count remain opportunistic. No frozen algorithm changes.

## Real pipeline progress (2026-10-25)
`PipelineProgress` carries preparing/zone_a/zone_b/zone_c/finalizing and station_ids. `run_pipeline_multi` optionally reports before conversion, each real stage and result assembly; Zone A receives input station IDs, later stages receive retained IDs. `_run_job` writes snapshots under the existing job lock; owner-authenticated GET polling returns them while processing. Synchronous callers remain compatible. No timers, per-station completion claims, algorithm edits, database fields or extra endpoints. Fast stages can pass between polling snapshots; stations are processed as a comparison set. Focused tests exercise stage order at actual algorithm boundaries and owner-only polling.
