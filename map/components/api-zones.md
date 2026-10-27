# Component: API zones (`routers/zones.py`, `services/zones_service.py`, `services/hmdas_converter.py`, `zones/`, `schemas/zones.py`)

The flagship feature: CSV upload → clean → group → anomaly-detect. The API supports synchronous results or in-process background jobs with polling. Zones A/B remain frozen; the user's 2026-10-27 request explicitly authorized the Zone C screening update described below. Service-level data-quality checks surround Zone A.

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
| `zones/zone_c.py` | Per-day LOF (score <= -2, >=10 mm) plus a >=5 mm / >=30% excess over neighbor median. Original near-zero low rule plus severe partial deficits above 1 mm. Four-station gate and deterministic offsets below 0.001 mm. |
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
- **Zones A/B remain frozen.** `api/app/zones/` remains the production source of truth. The user explicitly authorized Zone C changes on 2026-10-27; `test-data/zone-c-improvement/baseline_zone_c.py` is a source-hashed archival baseline used only by comparisons, not a production implementation.
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
- A high flag needs negative LOF score <= -2, rainfall above the same-day group median and >=10 mm, plus excess over the **neighbor-only** median >=5 mm and >=30% of that median. These new tolerances are empirical development choices, not RIDF-derived or agency-approved limits. No fixed flag quota is used.
- Low screening uses explicit rules, not LOF. Near-zero events retain rainfall <=1 mm, group median >=10 mm and rainfall <25% of that median. Partial low events additionally allow own rainfall >1 mm, neighbor-only median >=10 mm, own rainfall strictly <25% of it, and shortfall >=10 mm. The four-station gate applies to both.
- Ties use deterministic offsets `rank * (0.001 / group_size)` after sorting station IDs. No process-global random state remains. Repeated calls and shuffled input rows reproduce exact scores; the displayed rainfall/neighbor ratio is still not the LOF score.
- API daily low flags and unified anomaly summaries include partial deficits; `is_dry_stuck`, dry summaries and low station-pattern evidence continue to describe near-zero behavior. Their narrower scope is intentional. Existing shapes and history fingerprinting remain compatible.

## Background job lifecycle and deployment symptom
- `_jobs` is an in-process dictionary, not Supabase Storage/Postgres. GET returns processing/done/error with HTTP 200 for an existing job, or HTTP 404 `Job not found or expired` when absent. A 200 polling log alone does not establish completion.
- `_gc_jobs()` runs when a new async job is accepted; it removes entries older than 600 seconds from creation and trims the existing store to 50 before insertion. This is opportunistic cleanup, not a precise ten-minute GET expiry.
- Restart/deploy loses every job and stops its daemon work; one worker/replica is required. Stop aborts browser requests, not backend computation. No durable recovery or backend cancellation endpoint exists.
- Supplied deployment logs showed an old job polling successfully, API shutdown, then a 404 for that same ID. This supports restart-related job loss for that incident; the later job's 200 responses did not show its final outcome. Retry after deployment finishes; a durable job store/worker would require separate implementation.

## Open questions / debt
- Confirmed: `run_pipeline_multi` routes HMDAS files through `convert_uploads` before quality checks; covered by the actual-dataset regression test.
- Version pins (`pandas>=2.2.0`, `scikit-learn>=1.4.0`) are not enforced caps — a future major release could silently change LOF/interpolation behavior.

## Historical baseline activity

The dated entries below record the earlier algorithm/evaluation state. The current rules are above; new comparison evidence is in `test-data/zone-c-improvement/`, preserving older predictions, labels and reports.

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

## Local synthetic cluster evaluation (2026-10-27)
`test-data/synthetic-local-cluster/` adds a separate fixture with eight hypothetical QC-area sites, two nearest-neighbor quartets, and identical September 1-30, 2023 hourly timestamps. Selected neighbors are 0.43-0.62 km apart; the full layout spans at most 3.1513 km. One manual `generate_and_evaluate.py` entry point creates 5,760 hourly records, an intervention-based 240-row answer key (8 high faults, 8 low faults, 224 valid readings), and evidence from the unchanged `run_pipeline_multi` path. Includes valid localized rain/dry differences, mild overreporting, partial underreporting and simultaneous faults rather than only obvious successes. Actual result: TP=12, FN=4, FP=7, TN=217; precision 63.16%, recall 75%, F1 68.57%, accuracy 95.42%. Report high/low separately because high includes LOF/gates and low is rule-based. Full comparison, raw service predictions, JSON, source/input/output hashes, distances and errors are retained under `evidence/`. Saved timestamps/totals, exact joins, assessment coverage, geographic groups and hand-calculated metric checks pass; the existing 15-test quality suite passes. No app algorithms, thresholds, database state or older fixture changed. This is a development functional test with hypothetical sites/weather, not independently labeled historical data, realistic storm calibration or real-world sensor accuracy; near-boundary UI reruns can differ due to advancing jitter state.

## Complete controlled evaluation package (2026-10-27)
`run_extended_testing.py` preserves the original fixture/key and adds 22 passing check groups: original hashes and independent sklearn metrics, three fresh-process and three same-process observations, reversed upload order, 11 quality/control variants, actual local sync/async multipart routes with seven HTTP cases, and the complete 54-test backend suite. Fresh-process scores/flags and reversed uploads are identical. Warm calls change 85/86 exposed scores but no flags. Nonoverlapping dates leave 120/240 rows unassessed; a missing day leaves three neighbor comparisons unassessed. These variants remain outside the primary 240-row confusion matrices. `render_report.py` uses bundled ReportLab/Poppler to create a visually inspected five-page PDF, four PNG/SVG matrices and the final Markdown report. Per-station/scenario breakdowns, all repeat outputs, JSON checks and logs are retained in evidence/extended. Local route tests override auth and disable rate limiting only in their in-process test; no real login/browser/deployment/persistence claim. No production source, thresholds, algorithms or original labels changed. The package's detection result remains TP12/FN4/FP7/TN217; engineering passes do not imply perfect detection or real-data accuracy.

## Editable IMRaD evaluation report (2026-10-27)
Added build_imrad_docx.py to reuse the frozen evidence in an editable Word report with exactly Introduction, Methods, Results and Discussion as its main sections. Ten native Word tables preserve all four matrices, metrics, quality/HTTP outcomes and every misclassification. Section order/table counts/key figures are checked after reopening the DOCX. No detector rerun or metric/label changes; source predictions and previous PDF remain intact. The canonical DOCX rendering workflow is attempted; no bundled LibreOffice or Word engine is available on this Windows runtime, so page-layout QA cannot be established here. School-specific formatting is not claimed.

IMRaD simplification (2026-10-27): build_imrad_docx.py now produces a separate Simple.docx with four main sections, one combined matrix, one plain-language metric table and concise discussion. Retains every combined outcome, false alarms/misses, normal-class imbalance and the synthetic/known-system scenario limitation. The detailed Word/PDF reports and all evidence remain available. Removed implementation and engineering detail from the short prose without changing test data or calculations. Structural and count checks pass; native pagination remains unverified because no renderer is installed.

RIDF reference (2026-10-27): docs/references/science-garden-ridf-2026.md and the unchanged user-supplied image record Science Garden station 98430 rainfall-frequency context. Selected 24-hour depths are 159.4/249.4/308.9/495.3 mm for 2/5/10/100-year return periods. These are not sensor-error cutoffs or universal station limits. Confirm accumulation windows before formal comparison with calendar-day totals; never mix mm/hour intensities with depth. No flags, answer keys, algorithms or evaluation results changed.

## Zone C false-alarm and partial-low update (2026-10-27)
Implemented the user-authorized Zone C change after a written plan and development comparison. Rejected a stricter trial that lost a known detection; selected 5 mm / 30% high-difference gates with the existing LOF and a severe partial-low extension. Canonical ordering and deterministic tie offsets replace advancing random jitter. Screenshot case 22.7 vs 18.2/18.0/19.7 now has no flag. Development: TP12->13, FN4->3, FP7->3, TN217->221. Separate fixed 480-row October-November series, saved before selection: TP19->24, FN9->4, FP13->11, TN439->441. No previously detected fault was lost in either series. Low validation false alarms increase 2->6 while five additional low faults are caught; report this tradeoff rather than claiming all errors resolved. api/tests/test_zone_c.py covers boundaries, exact determinism, finite ties/dry values, RIDF-scale coherent rain, gross discrepancies below/above RIDF, partial deficits, insufficient coverage, input immutability, aliases, parameters and sync/async local routes. All 67 backend tests pass; actual daily arithmetic stays 3029 retained / 319 excluded / 127 interpolated hours. Source archive, frozen validation data, selection records, all changed flags and reports are in test-data/zone-c-improvement. No frontend, mobile, schema, dependencies, database or Zone A/B changes. Existing History results/reports stay baseline snapshots; run again to apply new classification. RIDF is a test/reference context, not a global fault cutoff. No independently labeled real-world accuracy is established.

## Native thread budget (2026-10-28)
The service wraps the existing Zone C call in threadpoolctl(limits=1), using scikit-learn's already-installed resource-control dependency (now explicit in requirements). Four-value daily fits incurred large native-thread overhead in local benchmarks. A module lock serializes this limited scope so concurrent jobs cannot restore each other's process-wide BLAS limits. Other pipeline stages and API requests remain outside this lock; the algorithms, thresholds and outputs are unchanged by this resource change. Tests compare every exposed score/flag and summary against unrestricted execution, concurrent calls and exception restoration. In-process job loss on API restart remains a separate hosting limitation.

Render verification (2026-10-28): workspace tea-da688ov10e5c73eh7om0 and single Singapore Free API srv-da68b3nqj5pc73eslg30 confirmed by user/discovery. Live source is f5803af; auto-deploy on main is enabled. Native metrics show CPU capped at0.15 and reaching that limit during the21:30–21:35UTC processing window, with memory around244MB of536.9MB. Upload was accepted21:29:54UTC and polling stopped21:33:56UTC while CPU remained busy afterward; no OOM/restart event was returned for that window. Recent direct uploads also returned401. Status-based upload fallback now clears a rejected cached direct token and uses the existing cookie/refresh path; added red/green regression. Router/service diagnostic loggers now inherit Uvicorn's configured INFO handlers so job start/done and stage-memory records appear in production. No hosting-plan or worker-count changes.
