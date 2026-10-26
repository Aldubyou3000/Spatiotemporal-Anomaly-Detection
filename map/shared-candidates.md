# Shared-Candidates (Rule of 3)

Behavior duplicated across 3+ components that should be extracted into a shared utility, service, or backend process. Reviewed each session; promoted to an actual refactor when the list grows or duplication causes bugs.

Format per entry: **Pattern** → where it appears (3+ places) → what extraction would look like.

---

## Active candidates

### 1. Signed-URL helper (`_signed_urls_batch` / `_signed_url`)
**Appears in**:
- `api/app/routers/mobile.py` (defined here — ` _signed_urls_batch` + single `_signed_url`)
- `api/app/routers/tickets.py` — `from .mobile import _signed_urls_batch` (was `_signed_url`, corrected 2026-08-31)
- `api/app/routers/reports.py` — `from .mobile import _signed_urls_batch` (was top-level `_signed_url` dead import, fixed 2026-08-31)

**Problem**: Two analyst-facing routers import a private helper from the technician router. Couples unrelated routers and creates a misleading "mobile owns this" signal. The `tickets` import was mixing top-level + lazy inner import; `reports` had a dead top-level `_signed_url` while using batch locally.

**Extraction**: Move to `api/app/core/storage.py` (or `services/storage_service.py`) as a public `signed_urls_batch(...)` / `signed_url(...)`. Update the three import sites. The underscore-prefixed private name becoming public is the signal that it's shared.

---

### 2. Client IP / User-Agent extraction — checked
`core/dependencies.py` owns `_client_ip` / `_client_ua`. Auth and mobile routers currently import/use the shared helpers; no inline forwarded-IP parsing was found in those routers (2026-10-24). Keep using the existing helper; the earlier claim of duplicate extraction there is stale.

---

### 3. Token storage / refresh-on-401 (cross-surface, conceptual duplication)
**Appears in**:
- `web/src/lib/api/client.ts` — 401 → silent refresh → retry (web, cookies)
- `App/services/api.ts` — 401 → refresh → retry (mobile, SecureStore + Bearer)
- Both implement: expiry detection, single-flight refresh, retry-on-success

**Note**: These are deliberately separate because the auth transports differ (cookie vs Bearer). Not a candidate to merge — but worth a shared doc/comment block in both pointing at each other, since the *strategy* is identical even if the mechanics differ. Flag if a third surface is ever added.

---

### 4. Ticket status label/color/sort logic
**Appears in**:
- `web/src/lib/ticketStatus.ts` — canonical (web)
- `App/constants/ticketStatus.ts` — parallel (mobile)
- Backend Pydantic enum (implicit, via `status` field values)

**Status**: Web side is explicitly the single source of truth within the web app. The mobile app re-declares equivalent labels. If they drift the technician sees one wording and the analyst another. Low-priority unless UI wording diverges — at minimum, add a cross-reference comment in both files.

---

### 5. Vercel same-origin `apiBase()` helper
**Appears in**:
- `web/src/lib/api/client.ts:7` `apiBase()` / `DIRECT_BASE` + `setDirectToken`/`getDirectToken`
- `web/src/hooks/useRealtimeSync.ts:7` same `apiBase()` copy
- `web/src/lib/api/tickets.ts:88`, `web/src/lib/api/audit.ts:85` inline `vercel.app ? window.location.origin : BASE_URL`
- `web/src/app/(auth)/login/page.tsx:11` same inline `apiBase()`

**Problem**: 5 copies of `hostname.endsWith("vercel.app") ? window.location.origin : BASE_URL`. Drift already (client has `DIRECT_BASE`+token store, others inline). If the proxy host changes (e.g., `vercel.app` → custom domain) all 5 must be updated.

**Extraction**: `web/src/lib/apiBase.ts` → `export function apiBase(): string` + `export function directBase(): string` + token helpers. All 5 import from there.

---

## Resolved

*2026-10-25 local UI Library* — reused production components rather than introducing gallery copies. Validation/CSS generation is centralized in components/design/library.ts; fixture data and API responses in fixtures.ts. Inert data-ui attributes on six shared primitives provide common preview styling without another production component abstraction. No additional production rule-of-3 refactor is required.

*2026-08-31 dead-code pass* — not an extraction but a pruning: removed truly dead imports/exports that were inflating the candidate surface — `reports.py` dead `_signed_url`, `zones.py` dead `require_analyst`, `audit_service` dead `datetime`/`timezone`/`settings`, `events_service` dead `Any`, `zone_a` dead `numpy`, `web` dead `papaparse`/`next-themes`/`react-leaflet` deps, `App` dead `expo-blur`/`expo-print`/`expo-symbols` deps (+ wired `buffer` polyfill + `react-native-url-polyfill`). These are logged here so future lint doesn't re-flag them as candidates.

*2026-10-22 station review* — resolved the review status labels/tones repeated across OverviewTab, AnomalyReportTab, and StationMap with `web/src/lib/stationReview.ts`. Overview/report also share evidence wording. No additional rule-of-3 hits introduced.

*2026-10-22 pipeline activity* — rechecked: no new behavior repeated in three places. Activity is centralized in PipelineDiagram and its CSS; request cancellation is owned by ZonesProvider.

*2026-10-24 map refresh* — documentation changes only; no new rule-of-3 behavior introduced. Rechecked auth/mobile IP extraction and the shared station-review helper; existing storage/API-origin candidates remain, with no refactor performed.

*2026-10-24 analyst review* — station/day identity, human decision labels and export metadata are centralized in `lib/anomalyReview.ts` for provider/report/page use. Existing station health wording remains in `stationReview.ts`. No new rule-of-3 extraction needed; no unrelated refactors.

*2026-10-24 review hierarchy refinement* — reused review identity, decision labels and next-pending navigation. No new repeated behavior across three components; chart-only zero/missing label formatting stays with DateComparisonChart. Existing module references remain active; no orphan changes.

*2026-10-24 chart switch and review tabs* — reused existing StationChart/DateComparisonChart and review navigation; no additional shared-candidate behavior or orphaned components. History rendering moved into the existing chart area, not a new widget.

*2026-10-24 detection-details simplification* — report no longer imports highReview/lowReview for station-wide explanations; those helpers remain used by Overview and tests, and station status presentation remains active in Overview/map. No new rule-of-3 behavior or orphaned module.

*2026-10-24 structured detection evidence* — restored useful station evidence as labeled fields rather than reusing the full prose tooltip. Existing stationReview helper remains active in Overview/map; report uses source summary fields. No new imports or orphan references; no new cross-component rule-of-3 extraction.

*2026-10-24 LOF tooltip* — reused the existing page InfoTip via renderTip (same pattern as PipelineDiagram), avoiding another near-identical portal implementation. Overview still has its existing local tooltip; no third implementation was added. Module references are unchanged; no orphan updates needed.

## History change review (2026-10-25)
No new production rule-of-3 candidate: ZoneResults/CreateTicketModal/InfoTip are reused by Zones and History rather than copied. Test-only TypeScript loading now appears in station-review.test.cjs, anomaly-review.test.cjs and history tests; a shared loader is a future test-maintenance candidate if these suites grow. No production refactor is needed for this feature.

Manual-save review (2026-10-25): reused existing dialog/input/button and one shared controller for navigation, reset, rerun, file replacement and save-before-ticket. No new production rule-of-3 candidate.

Compact search field candidate (2026-10-25): icon + small outlined input appears near-identically in Audit, DataTable and Tickets. History's inbox redesign now uses a wider rounded search field and is no longer part of this compact pattern. Consider a shared search-field primitive if the three compact controls change together; no refactor was needed for these styling changes.

Flat theme review (2026-10-25): reused the existing shared surface/elevation tokens and one global keyboard-focus rule across controls. Flattened result/gallery composition rather than adding another panel abstraction. No new production rule-of-3 candidate.

Line reduction (2026-10-25): removed decorative declarations in existing components rather than introducing a global border-hiding rule or another panel component. Data-row/control border behavior stays explicit. No new repeated behavior or shared-candidate promotion.

Visibility correction (2026-10-25): chart labels reuse existing --text-secondary; dashboard and shell specimen share dashboard-workspace. No new repeated behavior needing extraction; imports/orphan references unchanged.

Result-tab surfaces (2026-10-25): four result tabs reuse one ZoneResults.module.css panel rule instead of repeating backdrop/inset declarations. This shared presentation is resolved locally; no additional component abstraction is needed.

Saved-results viewport (2026-10-25): reused Tabs, Modal, DataTable and the existing review panels. Viewport mode is scoped through ZoneResults/AnomalyReportTab props; regular Zones layout remains intact. No new production rule-of-3 candidate. Existing custom React test harness cache must be cleared between hook overrides.

Zones workspace (2026-10-25): private RunConfiguration is shared between setup and the configuration dialog; CurrentResults reuses History's fitViewport mode, RunSaveStatus compact variant and global save controller. No additional process state/fetch abstraction or third focus-management implementation introduced (dialog-specific Tab handling remains local). No new production rule-of-3 promotion.

Unsaved dashboard navigation (2026-10-25): reused the global save controller and existing guard; one optional allowContinue flag distinguishes navigation from destructive replacement. No copied modal, new storage layer or production rule-of-3 candidate.

Confirmation layout (2026-10-25): removed duplicate raw button styling from ConfirmDialog in favor of shared Button variants. Dialog layout lives in one CSS module and is reused by actual confirmations/library examples; no new production rule-of-3 candidate.

Focused run setup (2026-10-25): reused private RunConfiguration for setup/dialog and shared FileUpload for the gallery. No new abstraction or near-identical behavior in three places; no promotion needed.

Setup hierarchy refinement (2026-10-25): idle and operational pipeline presentations use the same existing stage metadata; uploader and steps remain shared with the gallery. No copied process definitions or new rule-of-3 candidate.

Processing refinement (2026-10-25): merged idle/running/completed step markup in PipelineDiagram and shared setup/processing surface rules in Zones.module.css. No new duplicated behavior or abstraction needed.

Visible configuration redesign (2026-10-25): setup and result dialog reuse one container-responsive configuration grid; all zone identities are styled once in PipelineDiagram. No copied process definitions or new behavior duplicated in three places.

Resolved spacing scale (2026-10-25): repeated spacing across Zones.module.css, FileUpload.module.css and PipelineDiagram.module.css now consumes --space-* primitives from globals.css. No duplicated local scale or additional layout abstraction introduced.

Real stage progress (2026-10-25): reused existing service orchestration, locked job polling, ZonesContext and PipelineDiagram metadata. No new polling layer or duplicated process definitions. White-palette research (2026-10-26) proposes consistent surface roles before theme changes; no production abstraction or candidate promotion yet.

Resolved shell body surface (2026-10-26): dashboard-content centralizes the rounded work-area background across dashboard pages and the shell specimen; no duplicated page-local surface rule added.


Resolved search focus duplication (2026-10-26): common data-search-field CSS owns focus across seven search fields. Individual layouts stay local; no new component needed.


Review save reuse (2026-10-26): local review CTA uses existing requestSave/controller; no duplicate save workflow or new extraction needed.


Upload readability (2026-10-26): shared FileUpload supplies the same presentation to setup/dialog/gallery; no duplicated formatting or new rule-of-3 candidate.


Review save layout stability (2026-10-26): fixed feedback in shared ReviewSaveStatus and footer geometry in shared AnomalyReportTab; no duplicated page-specific fixes needed.


Map simplification (2026-10-26): one StationMap component owns tooltip visibility; one scoped tile filter is reused by all callers. No new duplicated behavior.


Colored basemap (2026-10-26): provider URL/attribution live in existing shared StationMap; no new wrapper or duplicated map integration.


Data quality help (2026-10-26): QualityReportCard now reuses shared accessible InfoTip instead of extending the older page-local hover helper. No new tooltip implementation.


Station panel refinement (2026-10-26): retained existing panel components and shared HelpTip; no new duplicated behavior or additional abstraction.
