# Orphans

Files/components with no inbound references from anything else in the map, or that the map flags as suspect. Each entry: what it is, why it has no inbound refs (dead code, map gap, or external entry point), and a suggested action.

---

## Confirmed dead / stale (action recommended)

### `start.sh` (repo root)
**What**: Shell script that runs `prototypes/streamlit_app.py` via Streamlit.
**Why orphaned**: The Streamlit app was the pre-migration frontend. Migration is complete (per TECHSTACK.md), and **`prototypes/` no longer exists in the repo**. The file references a path that is gone.
**Action**: Delete, or repoint it at the FastAPI launch command. Keeping it misleads new contributors and breaks `./start.sh`.

### `api/debug_tickets.py`
**What**: Standalone repro script that exercises `tickets_service` against live Supabase.
**Why orphaned**: Not imported by anything; not referenced in docs. Developer-only scratch tool.
**Action**: Keep (useful), but move under `api/scripts/` or add to `.gitignore` if it's not meant to ship. Low priority.

### `api/=4.0.0`
**What**: A literally-named file `=4.0.0` in `api/` (157 bytes). Almost certainly the result of a botched `pip install foo >=4.0.0` that the shell interpreted as a redirect target.
**Why orphaned**: No meaning, not imported, not a config file.
**Action**: Delete. (Verify content first — but it's almost certainly pip output.)

### `api/uvicorn.log`
**What**: Stale server log captured to disk.
**Action**: Delete and add `*.log` to `.gitignore` (currently not ignored).

### `test.md` (repo root, tracked, empty)
**What**: Empty tracked file.
**Action**: Delete unless it has intended purpose.

---

## Apparent orphans (need verification before action)

### `api/app/services/hmdas_converter.py`
**What**: PAGASA/HMDAS → CSV reformatter. Imported only by `zones_service.py` (via `parse_csv_to_dataframe` path) — needs a grep check to confirm whether `zones.py` router actually invokes it on the HMDAS upload branch.
**Action**: Confirm the multi-file upload path in `routers/zones.py` → `zones_service.run_pipeline_multi` routes HMDAS files through the converter. If wired, it's not an orphan — note the path in the zones component page.

### `web/src/components/zones/DateComparisonChart.tsx`, `NeighborGroupsTab.tsx`, `StationChart.tsx`
**What**: Zone pipeline result visualizations. Need a grep to confirm which tab they're mounted from.
**Action**: Likely mounted from `OverviewTab` or the zones page tab bar. Verify and record inbound refs in the web-zones page.

---

## Map gaps (files with no page yet)

These exist in the code but have no dedicated component page. Add pages when they become edit targets:
- `api/app/routers/events.py`, `mobile_events.py` — covered briefly under [api-realtime.md](./components/api-realtime.md); could be split if either grows.
- `App/components/*` (19 files) — covered collectively under [mobile-shell.md](./components/mobile-shell.md); split when one becomes a frequent edit target.
- `docs/migrations/*` — covered under [db-schema.md](./components/db-schema.md).

---

## Not orphans (external entry points — listed for clarity)

These have no inbound *code* references because they are entry points themselves:
- `api/app/main.py` (FastAPI app object — imported by uvicorn, not by repo code)
- `web/src/app/layout.tsx`, `web/src/app/page.tsx` (Next.js file-route entry points)
- `App/app/_layout.tsx`, `App/app/(tabs)/*`, `App/app/report.tsx`, `App/app/ticket/[id].tsx` (Expo Router entry points)
- `web/src/middleware.ts` (Next.js runtime invokes it by file location)

---

## Resolved

### `Procfile` (repo root)
**What**: Heroku-style procfile that ran `prototypes/streamlit_app.py` via Streamlit.
**Resolved**: Deleted 2026-08-21. Referenced non-existent `prototypes/` directory.

### `prototypes/` directory (referenced but absent)
**What**: Documentation described `prototypes/` as the "reference only" source of truth for zone algorithms.
**Resolved**: Acknowledged as gone. `api/app/zones/` is now the canonical source of truth. All docs updated to reflect this (2026-08-21).

### `App/components/GoogleIcon.tsx`, `web/src/components/ui/Select.tsx`
**What**: Added in `bf810a8` / `19527f3` push. `GoogleIcon` used by `web/src/app/(auth)/login/page.tsx` (inline SVG now extracted), `Select` used by `web/src/app/(dashboard)/zones/page.tsx` and tickets pages.
**Resolved**: No longer orphans — now referenced inbound from dashboard pages. Remove from orphans watchlist.
