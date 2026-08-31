# Component: API zones (`routers/zones.py`, `services/zones_service.py`, `services/hmdas_converter.py`, `zones/`, `schemas/zones.py`)

The flagship feature: CSV upload → clean → group → anomaly-detect, returning a `ProcessResult` synchronously. The zone algorithms themselves are frozen reference code.

## What it does
- `POST /api/zones/process` — accepts one or more CSV files (+ optional `contamination`), reformats HMDAS exports if detected, runs the pipeline, returns `ProcessResult` in the same request.
- Pipeline order: `zone_a` (clean/interpolate) → `zone_b` (Haversine neighbor grouping) → `zone_c` (LOF anomaly detection).
- Multi-file upload (`run_pipeline_multi`) concatenates per-station files into one combined frame before running.

## Files
| File | Role |
|------|------|
| `routers/zones.py` | HTTP layer: `require_analyst_or_bearer` (cookie **or** `Bearer` for direct 4-file bypass), accepts `UploadFile`s, calls `run_pipeline_multi` via `run_in_threadpool`, raises `ZoneProcessingError` → 400. `MAX_UPLOAD_BYTES 20 MB:24` but Vercel proxy caps 4.5 MB / 30s — 4-file LOF uses direct. Dead `require_analyst` import pruned. |
| `services/zones_service.py` | Orchestration: `parse_csv_to_dataframe`, `run_pipeline`, `run_pipeline_multi`, `ZoneProcessingError`. Calls `zone_a/b/c`. |
| `services/hmdas_converter.py` | Reformats PAGASA/HMDAS exports (one file per station, 6-line metadata header) into the combined pipeline frame. **Does not judge data quality — Zone A still does QC.** Auto-detects raw HMDAS vs already-combined CSV. |
| `zones/zone_a.py` | **Frozen** (algorithm untouched; dead `numpy` import removed). Hourly→daily downmap, single-day linear interpolation, drops stations with gaps ≥2 days or <2 valid readings. |
| `zones/zone_b.py` | **Frozen.** Haversine distance grouping (1–50 km threshold), adds `neighbor_group_id`. |
| `zones/zone_c.py` | **Frozen.** LOF per-day within-group (`MIN_STATIONS_PER_DAY=4:30`, `ANOMALY_THRESHOLD=2.0:35` — was 1.5, now stricter), `MIN_ANOMALY_RAINFALL_MM=10.0`, jitter `1e-3`. |
| `schemas/zones.py` | `ProcessResult` and supporting Pydantic models. |

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
- The pipeline is synchronous from the client's perspective but runs in a threadpool on the server. Long runs hold a worker thread. On Render Free `0.1 CPU` 4-file = 25-45s → hits Vercel 30s proxy timeout; deployed `web/src/lib/api/zones.ts:5` bypasses via `apiClient.uploadDirect` to `https://spatiotemporal-api.onrender.com` with `Bearer` (see `api-core.md`).
- No audit event for pipeline runs is mapped to a real-time signal (zone results are local UI state, not shared server data). A `zone_run` audit event is logged but only produces the generic `audit` SSE signal.

## Open questions / debt
- See [orphans.md](../orphans.md): confirm the multi-file path actually routes HMDAS files through `hmdas_converter` end-to-end.
- Version pins (`pandas>=2.2.0`, `scikit-learn>=1.4.0`) are not enforced caps — a future major release could silently change LOF/interpolation behavior.
