# Orphans

Files/components with no inbound references from anything else in the map, or that the map flags as suspect. Each entry: what it is, why it has no inbound refs (dead code, map gap, or external entry point), and a suggested action.

---

## Previously reported stale files

Checked 2026-10-24: `start.sh`, `api/debug_tickets.py`, `api/=4.0.0`, `api/uvicorn.log`, and root `test.md` are absent. Earlier deletion/move recommendations no longer apply. No files were deleted during this map refresh.

---

## Apparent orphans (need verification before action)

### `web/src/components/ui/Card.tsx`
**What**: Available primitive `Card`/`CardHeader`/`CardTitle`/`CardBody` (68 lines). Currently 0 inbound imports — all pages build cards inline with `div style={{background:"var(--surface)"…}}`. Not deleted; kept as a reusable primitive for future use.
**Action**: If a new page needs a surface card, import from here instead of inlining. Remove only if the design system drops the pattern.

### `web/src/components/ui/Skeleton.tsx` — `ReportSkeleton`/`AttachmentSkeleton`/`TableSkeleton`
**What**: Three skeleton variants removed 2026-08-31 — never imported (only `TicketRowSkeleton`, `TechRowSkeleton`, `AuditRowSkeleton`, `DetailSkeleton` are live). See `web-pages-components.md` for the retained set.
**Action**: Already pruned.

### `web/src/components/ui/SentinelMark.tsx` — `SentinelChevronMark`
**What**: Alternative geometric chevron mark kept "for reference" — never imported (only `SentinelMark` is live in `Sidebar`). Removed 2026-08-31.
**Action**: Single canonical `SentinelMark` remains.

### `web/src/hooks/useReports.ts` — `optimisticApprove`/`optimisticFollowUp`, `web/src/hooks/useTickets.ts` — `invalidateTechnicians`
**What**: Hook helpers defined but never called (sidebar consumes `pending` but never calls the optimistic mutators; no caller for the technicians invalidator). Removed 2026-08-31.
**Action**: Re-add only if a caller needs optimistic UI or technician-list invalidation.

### `web/src/lib/api/*` — `reportsApi.get`/`photos`, `ticketsApi.update`, `techniciansApi.toggleActive`, `auditApi.verifyIntegrity` (+ `AuditChain*` types), `authApi.refresh`
**What**: API wrappers with 0 callers (verified via `grep -R`). `verifyIntegrity` + chain types had no UI. Removed 2026-08-31; `technicians` toggle endpoint still exists server-side but is admin-only and not exposed in analyst UI.
**Action**: Re-add a wrapper only when a page actually calls it.

### `web/src/types/tickets.ts` — `TicketUpdate`
**What**: Interface only consumed by dead `ticketsApi.update`. Removed alongside it 2026-08-31.
**Action**: Re-declare if `PATCH /api/tickets/{id}` is re-exposed in the web UI.

### `App/constants/*` — `Motion.easeIn`, `activityEvents.dateGroupLabel`, `theme.minTouchTarget`, `ticketStatus.DbStatus`
**What**: Exports with 0 imports across `App/` (verified `grep`). Small tokens/types never wired. Removed 2026-08-31.
**Action**: Re-add if a component needs the token.

### `App/package.json` — `expo-blur`, `expo-print`, `expo-symbols`
**What**: Deps with 0 JS imports and 0 `app.json` plugin refs. `buffer` was missing while `metro.config.js` shimmed it — added `buffer@^6.0.3`. `react-native-url-polyfill` was installed but never imported — now wired in `App/app/_layout.tsx:1`. Removed/pruned 2026-08-31.
**Action**: Do not re-add without a JS import or plugin entry.

### `api/app/zones/zone_a.py` — `import numpy as np`
**What**: Import with 0 `np.` uses. Removed 2026-08-31 (algorithms untouched).
**Action**: Re-add if Zone A ever needs NumPy directly.

---

## Map gaps (files with no page yet)

These exist in the code but have no dedicated component page. Add pages when they become edit targets:
- `api/app/routers/events.py`, `mobile_events.py` — covered briefly under [api-realtime.md](./components/api-realtime.md); could be split if either grows.
- `App/components/*` — covered collectively under [mobile-shell.md](./components/mobile-shell.md); split when one becomes a frequent edit target.
- `docs/migrations/*` — covered under [db-schema.md](./components/db-schema.md).

---

## Not orphans (external entry points — listed for clarity)

These have no inbound *code* references because they are entry points themselves:
- `web/tests/anomaly-review.test.cjs` — Node entry point for review identity, queue/high-low selection, pending navigation, immutable exports and spreadsheet text escaping. New `lib/anomalyReview.ts` and report CSS module are imported by live provider/page/report code, not orphans.
- `api/scripts/reset_ticketing.py` and `docs/RESET_TICKETING.sql` — local untracked manual reset tools, not dead application modules. They can delete ticketing data; not executed or audited in this refresh.
- `USB_SETUP_GUIDE.md` — local untracked transfer/setup documentation; not imported by the application.
- `test-data/synthetic-30-days/generate.py` — manual fixture builder; reads the editable daily plan and writes four HMDAS CSVs plus an independent scenario answer key. Documented in that folder's README.
- `api/tests/test_station_review.py` — unittest discovery entry point for summary rules.
- `web/tests/station-review.test.cjs` — Node entry point; renders the actual overview/report and tests shared review wording.
- `api/tests/test_zones_quality.py` — discovered by `python -m unittest discover -s api/tests -v`; includes a four-file HMDAS conversion/pipeline integration check.
- `api/app/main.py` (FastAPI app object — imported by uvicorn, not by repo code)
- `web/src/app/layout.tsx`, `web/src/app/page.tsx` (Next.js file-route entry points)
- `App/app/_layout.tsx`, `App/app/(tabs)/*`, `App/app/report.tsx`, `App/app/ticket/[id].tsx` (Expo Router entry points)
- `web/src/middleware.ts` (Next.js runtime invokes it by file location)

---

## Resolved

### Zone result visualization references (2026-10-24)
The Zones page imports/renders `NeighborGroupsTab`; `AnomalyReportTab` imports/renders both `StationChart` and `DateComparisonChart`. Removed their unverified-orphan warning. See [web-pages-components.md](./components/web-pages-components.md).

### `api/app/services/hmdas_converter.py`
**Resolved**: Confirmed 2026-10-22: zones router → `run_pipeline_multi` → `convert_uploads` → `_clean_daily_readings`. Covered end-to-end by the real-dataset unittest; not an orphan.

### `Procfile` (repo root)
**What**: Heroku-style procfile that ran `prototypes/streamlit_app.py` via Streamlit.
**Resolved**: Deleted 2026-08-21. Referenced non-existent `prototypes/` directory.

### `prototypes/` directory (referenced but absent)
**What**: Documentation described `prototypes/` as the "reference only" source of truth for zone algorithms.
**Resolved**: Acknowledged as gone. `api/app/zones/` is now the canonical source of truth. All docs updated to reflect this (2026-08-21).

### `App/components/GoogleIcon.tsx`, `web/src/components/ui/Select.tsx`
**What**: Added in `bf810a8` / `19527f3` push. `GoogleIcon` used by `web/src/app/(auth)/login/page.tsx` (inline SVG now extracted), `Select` used by `web/src/app/(dashboard)/zones/page.tsx` and tickets pages.
**Resolved**: No longer orphans — now referenced inbound from dashboard pages. Remove from orphans watchlist.

*2026-10-22 pipeline activity*: `PipelineDiagram.tsx` has an inbound import from the Zones page; not an orphan. Removed the old inline diagram and progress ticker.

## History references checked (2026-10-25)
New history API/schema/service are wired through main.py and zones/tickets integration. History pages are Next.js route entry points. History components, API/types/hook and extracted ZoneResults/CreateTicketModal/InfoTip have active imports; none are new orphan candidates. Existing report/ticket and mobile reference paths are retained.

Manual-save references (2026-10-25): RunSaveController is mounted by the dashboard layout; SaveRunModal is private to it; useSaveHistoryRun is consumed by that controller. RunSaveStatus remains mounted by Zones with props-only actions. No new orphan or removed important caller.
