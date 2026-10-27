# Orphans

UI Library removal check (2026-10-27): removed design routes/editor/preview, the unused Card family, gallery-only tests and library docs/scratch notes. Every retained visual component module has an operational inbound reference outside the retired gallery. Shared regression data moved to `web/tests/fixtures.ts`, used by component, History, Overview and ticket-stability checks; no runtime module imports test fixtures.

Files/components with no inbound references from anything else in the map, or that the map flags as suspect. Each entry: what it is, why it has no inbound refs (dead code, map gap, or external entry point), and a suggested action.

---

## Previously reported stale files

Checked 2026-10-24: `start.sh`, `api/debug_tickets.py`, `api/=4.0.0`, `api/uvicorn.log`, and root `test.md` are absent. Earlier deletion/move recommendations no longer apply. No files were deleted during this map refresh.

---

## Apparent orphans (need verification before action)

### `web/src/components/ui/Card.tsx` — removed 2026-10-27
**What**: `Card`/`CardHeader`/`CardTitle`/`CardBody` were used only by the retired gallery. All operational pages build their own surfaces.
**Action**: Removed with the UI Library after checking imports across the source tree; no dashboard caller required replacement.

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

Flat theme reference check (2026-10-25): removed the unused grid background utility/tokens after removing the dashboard's decorative grid element. `web/tests/surface-theme.test.cjs` is a manual Node test entry point. Existing component imports remain live; no new orphan modules.

Result-tab surfaces (2026-10-25): ZoneResults.module.css is imported by the shared ZoneResults component and applied to four tab panels; not an orphan. Overview/NeighborGroups remain used by results and UI Library specimens.

Saved-results viewport (2026-10-25): ZoneResults additionally imports the existing Modal for its full-table dialog. Removed intro-heading CSS has no remaining JSX reference; all report, table, navigation and export components remain live. No orphan module created.

Overview summary (2026-10-25): OverviewTab.module.css is imported by OverviewTab; removed unused decorative stat icon imports/metadata. No visual component was orphaned; existing overview/map/summary callers remain live.

Zones workspace (2026-10-25): Zones.module.css is imported by the Zones page; private RunConfiguration/ConfigurationDialog/CurrentResults are actively composed there. Removed EmptyState/RunningSkeleton/pipelineRef have no remaining callers. PipelineDiagram/FileUpload remain used by setup/details/processing and UI Library; RunSaveStatus retains ordinary and compact specimens. zones-workspace.test.cjs is a manual Node test entry point, not a runtime orphan.

Unsaved navigation (2026-10-25): run-save-navigation.test.cjs is a manual Node entry point covering reminder actions, in-memory preservation, saved/failed continuation and unaffected links. Existing guard/controller/component imports remain live.

Confirmation layout (2026-10-25): ConfirmDialog.module.css is imported by ConfirmDialog; confirm-dialog.test.cjs is a manual Node test entry point. Existing dialog callers and gallery inventory remain live; no new orphan component.

Map marker stability (2026-10-25): station-map.test.cjs is a manual Node entry point exercising StationMap with a Leaflet/resize harness. StationMap remains imported by Overview and library specimens; no runtime reference removed.

Focused run setup (2026-10-25): removed obsolete configurationGrid/upload/runControls styles; FileUpload and PipelineDiagram keep their existing setup/dialog/gallery callers. No module, import or runtime entry point removed.

Setup hierarchy refinement (2026-10-25): FileUpload.module.css and PipelineDiagram.module.css are imported by their matching components. Removed Plus icon and duplicate add-files control; shared Button/PipelineDiagram and gallery callers remain live. No orphan module introduced.

Processing refinement (2026-10-25): removed PipelineDiagram timers/state, inline animation rules and unused status icons; removed the page's Loader2 import/processingHeading rule. PipelineDiagram.module.css owns the single bar animation and shared step layout. Updated gallery selector; no dangling pipeline-stages/pipeline-spinner references or orphan module remains.

Surface simplification (2026-10-25): FileUpload's selected-list styles moved into its existing imported CSS module; all new class references are used. Removed local panel fills/frames, with no component or module removed. Existing setup/dialog/gallery callers remain live.

Reference-guided grouping (2026-10-25): moved the existing fileActions group beside the selection summary and removed the obsolete direct-child button selector. No component/import/module removed; shared FileUpload and PipelineDiagram callers remain live.

Real stage progress (2026-10-25): zones-progress.test.cjs is an explicit manual Node test entry point. PipelineProgress is referenced across API service/router and web API/context/page/diagram/gallery; no orphan module. White-palette research preview (2026-10-26) lives outside the repo in the thread visualization directory and is not a website route or production dependency.

Visible setup redesign (2026-10-25): configurationGrid is a local wrapper/class in the existing Zones page/module; no new component or module. Shared PipelineDiagram zone badges and FileUpload action styling remain available through operational callers and gallery examples. No orphan/reference removal.

Upload/footer gap (2026-10-25): configurationTask replaces the first-child minimum-width selector with an explicit live task wrapper. No imports or modules removed; shared setup/dialog composition remains in use.

Processing feedback (2026-10-25): processingHeader is used by the processing panel's title/Stop row. PipelineDiagram's loading-pulse keyframe is referenced in the reduced-motion rule; sweep remains used normally. No module/import removed or orphan introduced.

Data export consolidation (2026-10-26): removed the local FullAnomalyTable function and its obsolete CSS; Modal remains shared elsewhere. ExportMenu is local and used by ZoneResults; onOpenData is wired from ZoneResults to AnomalyReportTab. No orphan module introduced.

Nearby station relocation (2026-10-26): NeighborGroupsTab is now imported by OverviewTab instead of ZoneResults; the standalone UI Library specimen still uses it. Its new CSS module is imported by that component. No orphan introduced; StationMap's optional highlightedStationIds is supplied by OverviewTab.

Data table styling (2026-10-26): DataTable.module.css is imported by DataTable; cn import removed from this component only. Existing ZoneResults and gallery callers remain. No orphan introduced.


Search/Export refinement (2026-10-26): removed duplicate local search focus rules in DataTable/History; all search fields reference the shared global attribute. ExportMenu imports the existing Button. No orphan introduced.


Review save action (2026-10-26): optional onSaveRun connects CurrentResults through ZoneResults and AnomalyReportTab to ReviewActions. Existing RunSaveController reused; no orphan or new module.


Flag filter cleanup (2026-10-26): removed unused local filterLabel class; no module/import changes.


Upload configuration refinement (2026-10-26): local fileLabel helper and CSS are consumed by FileUpload; no new modules or removed imports.


Review layout stability (2026-10-26): ReviewSaveStatus no longer uses saveStatus locally; that CSS remains used by RunSaveStatus. No orphan/import changes.


Upload helper removal (2026-10-26): requirements/formatHelp CSS deleted with their markup. No orphan module or import.


Nearby tooltip (2026-10-26): NeighborGroupsTab imports existing InfoTip; removed its unused note class. No orphan module.


Map label simplification (2026-10-26): removed unused station-label--flagged CSS after all labels adopted the shared neutral class. Existing map callers remain.


Basemap replacement (2026-10-26): removed unused station-map/data-map-theme hooks with their tile filter. Existing Leaflet layer remains the only basemap integration.


Data quality density (2026-10-26): HelpTip aliases the shared InfoTip in OverviewTab. rowDescription remains used by station-summary guidance; no orphan module.


Station panel refinement (2026-10-26): stationPicker/reviewList CSS is consumed by its owning panels; reused existing HelpTip import. No orphan module.


History visual update (2026-10-26): removed redundant CalendarDays import. Reused existing page, CSS and pagination; no orphan modules.


History sort/filter wiring (2026-10-26): existing Select is imported by History, HistoryFilters.sort crosses API wrapper/router/service; no new modules or orphan references.


Zones ready indicator (2026-10-26): WorkspaceSidebar is private to dashboard layout; Sidebar resultsReady is supplied by that wrapper and the existing gallery. No new module or orphan.


History toolbar alignment (2026-10-26): removed unused ArrowDownWideNarrow import; existing Select and listOrder class remain in use.


Search consistency (2026-10-26): reused existing attributes and modules; no new modules or orphan references.


Search behavior repair (2026-10-26): new web/src/lib/search.ts is imported by DataTable, AnomalyReportTab, Tickets, Technicians and DesignLibrary. Added focused web/tests/search.test.cjs and api/tests/test_search.py; no orphan modules.


Ticket numeric prefix (2026-10-26): matchesTicketSearch exported from existing lib/search.ts is consumed by Tickets page and search regression checks; no new modules.


Shared table headers (2026-10-26): existing components reference the global .table-heading utility; no new modules or orphan references.


History summary density (2026-10-26): summaryOverview/detailBody/summaryCard/ticketsCard classes are referenced by the existing detail page; no new modules or orphan references.


History file readability (2026-10-26): removed obsolete .file/.file strong rules; new detail classes are referenced by existing History detail page. No new module.


History detail canvas (2026-10-26): new local detailPage/detailWorkspace classes are used by the existing detail route; no new files or orphan references.


History back navigation (2026-10-26): removed detail page usage of styles.back; class remains used by History empty-state links. ArrowLeft remains in use in Header.leading.


History back-link restoration (2026-10-26): detail route again uses existing styles.back; topbar-btn--back remains used by results route. No new modules.

Roboto rollout (2026-10-26): removed unused Fraunces import/font load and .font-display class. Root --font-roboto feeds --font-ui across all interface consumers; --font-mono remains referenced by code/version styling. No new runtime module or orphan component introduced. Typography research and implementation plan are documentation artifacts.


Tickets refinement (2026-10-26): Tickets.module.css is imported by the Tickets page, TicketDetailBody and TicketActionDock. Removed private StatusDropdown, duplicated dock header decorations and unused global dock animation rules. Existing detail/dock/gallery imports remain; no orphan runtime component.


Compact ticket queue (2026-10-26): removed Tickets page User icon import and queue-only technician class. TicketRow/rowFooter/station and matching skeleton remain used; assignment detail retains its own existing identity controls. New report-density plan is documentation only.


Report density (2026-10-27): removed background band styling but retained referenced context/properties/dates classes. New local notice/history classes are used by existing TicketDetailBody; all photo/prior-round/file renderers retain active callers. No orphan module.

Ticket update stability (2026-10-27): removed ticket entrance animation class references; global animation utilities remain used elsewhere. Existing components/classes remain referenced; new ticket-stability.test.cjs is a direct Node regression entry point. No orphan runtime modules.

History/realtime performance (2026-10-27): new nested loading files are Next route entry points; both SSE routers call the broker heartbeat subscription; refreshSession is used by REST and SSE. New events/session-refresh tests are test entry points. No orphan runtime module.

Sidebar logo anchoring (2026-10-27): styles only in existing Sidebar; no new modules or changed references.

Sidebar toggle icons (2026-10-27): removed unused Sidebar ChevronLeft/ChevronRight imports; no module/reference change.

Instant result tabs (2026-10-27): removed animation-class references only; global fade utility remains used elsewhere. No orphan module.

Stable panels/map correction (2026-10-27): removed obsolete Zones body overrides and PageTransition fade usage; both components/classes remain referenced. Replaced Stadia constants/attribution with the existing OSM provider; no new runtime modules or orphan references.

- `test-data/synthetic-local-cluster/generate_and_evaluate.py` is a documented manual entry point, not an orphan: builds synchronized nearby fictional station uploads and evaluates the actual service into an evidence directory. All generated files are documented by the adjacent README; no production imports changed.

- `test-data/synthetic-local-cluster/run_extended_testing.py` and `render_report.py` are README-documented manual evaluation/report entry points. The former reuses fixture helpers and the actual service/router; the latter reads saved evidence. Generated report/figures are deliverables, not runtime modules. No application imports removed.

- `test-data/synthetic-local-cluster/build_imrad_docx.py` is a README-documented report builder reading existing evidence; its Word document is a deliverable, not an orphaned application module.

- `api/tests/test_zone_c.py` is a unittest discovery entry point for the authorized Zone C change and local API routes.
- `test-data/zone-c-improvement/evaluate.py` is a README-documented manual selection/validation entry point. Its `baseline_zone_c.py` is imported through importlib by that runner and retained as source-hashed historical evidence, not an orphan or production duplicate.
- `docs/ZONE_C_IMPROVEMENT_PLAN.md` and the adjacent evidence README are linked by docs/zones.md and describe this implementation and its tradeoffs.

Detection reliability (2026-10-28): ApiError is exported by the existing API client and used by Zones retry classification. New test_pipeline_performance.py is a unittest-discovery entry point. No new runtime modules or orphan imports; all algorithms/evaluation artifacts retain their existing references.

Bundled fonts (2026-10-28): root layout directly references Roboto-Latin.woff2 and JetBrainsMono-Latin.woff2; adjacent SIL OFL licenses document redistribution. No orphan modules.
