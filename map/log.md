# Map Session Log

Append-only. One entry per mapping session. Format:

```
## [YYYY-MM-DD] <action> | <what>
```

Where `<action>` ∈ `created` | `updated` | `linted` | `queried` | `refactored`.

Recent activity:

```bash
grep "^## \[" map/log.md | tail -5
```

---

## [2026-07-06] created | Initial map build from full codebase scan

Walked `api/`, `web/`, `App/`, `docs/` and root config. Wrote overview + 14 component pages (api: main, core, auth, zones, tickets, reports, technicians, audit, realtime, mobile; web: shell, state, pages, components; mobile: shell; cross: db-schema, infra-config). Surfaced 4 rule-of-3 candidates (signed-url helper, IP extraction, token-refresh strategy, ticket-status labels). Flagged orphans: dead `start.sh`/`Procfile` referencing nonexistent `prototypes/`, stray `api/=4.0.0` file, `uvicorn.log`, empty `test.md`, `debug_tickets.py` scratch script. Noted doc/repo drift: `prototypes/` described as source of truth but absent from `main`. Noted data-layer asymmetry: web uses SWR, mobile uses React Query (docs only mention SWR). Updated CLAUDE.md with a map-navigation header.

## [2026-08-21] updated | Stale references cleanup + zone source-of-truth fix

Deleted `Procfile` (referenced non-existent `prototypes/streamlit_app.py`). Updated 6 map pages: removed `Procfile` from orphans (now resolved), updated `start.sh` to single stale entry, fixed `overview.md` and `api-zones.md` to declare `api/app/zones/` as canonical source of truth (no other copy exists), updated `infra-config.md` root files table, added resolved entries for `Procfile` and `prototypes/` to `orphans.md`. Verified all 17 component pages against current codebase — no missing files or new components discovered. All routers, services, schemas, hooks, pages, and components match their map entries.
## [2026-08-21] updated | Header text-size picker: M is now a hard default — removed localStorage persistence (ui-text-size) from Header.tsx and the layout.tsx no-flash bootstrap; picker still works per-session, every load resets to M (globals.css root tokens).
## [2026-08-21] updated | Header text-size picker hidden behind SHOW_TEXT_SIZE_PICKER=false in Header.tsx (buggy per user report); code kept + type-checked, UI pinned to M via globals.css root tokens; comment block explains restore path for future AI models.
## [2026-08-28] deployed | Vercel Hobby proxy + Render Free live — fix CSP (allow unsafe-inline), SameSite Partitioned→Lax first-party via vercel.app/api/* rewrite, middleware skip /api/*, zones 4-file direct Bearer bypass (25-45s LOF on 0.1 CPU), zone_c ANOMALY_THRESHOLD 1.5→2.0, tiles OSM/Esri free, StationMap flagged 10px+dual halo+red labels, push bf810a8
## [2026-08-28] updated | Map refresh — overview, api-core/auth/zones, web-shell/state/pages, infra-config, shared-candidates (apiBase dup), orphans (GoogleIcon/Select resolved) for deployed state

## [2026-08-31] Mobile OAuth root-cause fix
- mobile_oauth_callback passes host-derived callback_url into oauth_complete_mobile (PKCE exchange redirect match); App timeout guard added to apiLoginWithGoogle (90s); awscout:// scheme added to allowed return URLs; Render allowlist entry needed in Supabase Dashboard.
Files: api/app/routers/mobile.py, api/app/services/auth_service.py, App/services/api.ts
## [2026-08-31] fixed | Mobile Google OAuth hang — root cause: shared-hosting Safe Browsing + EAS ignoring .env. API _mobile_oauth_callback_url now prefers X-Forwarded-Host (trusted allowlist, fail-closed); App added EXPO_PUBLIC_OAUTH_URL (fallback API_URL) and eas.json points it to first-party Vercel proxy; docs + CLAUDE updated. User must add Vercel callback to Supabase allowlist + set Render MOBILE_OAUTH_REDIRECT_BASE + rebuild.
## [2026-08-31] fixed | Dev-build Custom Tabs crash — WebBrowser.openAuthSessionAsync threw "No matching browser activity" on Android 11+ (missing <queries> + no Chrome guard). Added App/plugins/withCustomTabsQueries.js + app.json plugin + App/services/api.ts _isNoBrowserError guard with humane alert and listener/timeout cleanup; manifest fix requires fresh eas build.
## [2026-08-31] refactored | Dead-code sweep (no behavior change) — pruned 11 dead web deps/exports (papaparse/next-themes/react-leaflet, StatCard×2, SentinelChevronMark, 3 skeletons, MoveArrow, 4 API wrappers + TicketUpdate/AuditChain types, invalidateTechnicians/optimistic helpers) + 5 API dead imports (zones require_analyst, reports _signed_url, audit datetime/timezone/settings, events Any, zone_a numpy) + App dead 3 deps/4 exports + wired buffer + react-native-url-polyfill. Verified web tsc:0, App tsc:0, api compile:0. See orphans.md + shared-candidates.md resolved note.
## [2026-08-31] linted | Map health-check — updated 9 map pages (web-state, web-pages-components, infra-config, mobile-shell, api-mobile, api-zones, api-audit, api-reports, overview none) + shared-candidates §1 (dead import fix) + orphans (promoted pruned items to documented resolved) + index none. CLAUDE.md/AGENTS.md hook table + TECHSTACK.md hooks/deps synchronized.

## [2026-10-22] updated | Complete daily rainfall and truthful interpolation reporting

Added service-level `_clean_daily_readings` around frozen Zone A: require 24 usable readings in distinct hourly slots, permit only genuine one-hour interpolation, exclude partial daily totals before Zone B/C, recheck two-day station minimums, preserve supplied daily totals without daily interpolation, and reject negative/infinite rainfall before aggregation. Added `incomplete_days` to API/web quality reporting and fixed interpolation-only summaries. All three frozen zone algorithms remain unchanged. Added 14 unittest checks including independent stdlib CSV/Decimal recalculation of every retained output: 3,029 complete daily rows, 319 incomplete rows excluded, 127 hours interpolated. Web TypeScript check passed. Updated zone documentation and relevant map pages; confirmed converter references, registered test entry point, and rechecked shared-candidates with no new rule-of-3 extraction. Existing Obsidian/user changes were left alone. Local verification only; no deployment or database migration.

## [2026-10-22] updated | Plain-language station review summary
Replaced misleading sensor-reliability badges with Station Review Summary and neutral No overall warning. Kept daily flags visible, showed directional evidence and assessed-day counts, distinguished 0–1 mm from missing data, clarified rainy-day runs, removed unsupported fault diagnoses, and made zero-neighbor comparisons explicit. Shared status/wording helper across overview/report/map. Fixed service highest-frequency ties without changing frozen zones. Added 10 backend and five frontend checks; 24 backend tests (including actual dataset), five frontend checks, and TypeScript passed. API on :8000 and dashboard on :3000 started; HTTP 200 verified; browser reaches login. No database migration or deployment. Authenticated browser upload not performed; users must rerun old results.

## [2026-10-22] fixed | Pipeline animation no longer appears frozen at a simulated percentage
Replaced the random timer and 92% cap with continuous CSS activity in PipelineDiagram. Completion is driven by actual results; reruns clear stale results. Moved the abort-controller ref into ZonesProvider for navigation-safe Stop/Reset and guarded old request callbacks from changing newer runs. Corrected group and high-plus-low result counts. Added six focused component/handler tests; web TypeScript and the five station-review checks pass. Browser fixture verified changing animation transforms and reduced-motion behavior; sample-count screenshot saved outside the repo. No API/zone algorithms changed; no authenticated upload test. Temporary preview server stopped after verification.

## [2026-10-22] corrected | Restore the compact station guide
User feedback: the expanded summary was too wordy. Restored compact station rows, status key, one short guide, high/low counts, and the Show other stations toggle. Removed repeated paragraphs, two-column breakdown, and the how-to article; full evidence stays in tooltips. Shortened shared report guidance too, preserving neutral badges and backend rules. Eight station-review checks and TypeScript passed; browser preview checked with sample values. Rechecked shared-candidates and orphans: no new duplicate behavior or changed module references. Temporary preview stopped after review; full authenticated upload not retested.

## [2026-10-22] fixed | Pipeline cards stacked because their CSS classes were missing
Made PipelineDiagram self-contained: inline three-column grid/gap and bar geometry; local keyframes, spinner, reduced-motion rule, and mobile stacking breakpoint. Restores side-by-side desktop cards without relying on absent globals.css rules. No processing changes. No verification or server startup, as explicitly requested by the user. Rechecked shared-candidates and orphans; no new rule-of-3 hits or changed imports.

## [2026-10-22] fixed | Keep a visible loader in reduced-motion mode
The reduced-motion media rule disabled the pipeline animation entirely. Replaced animation:none with a gentle opacity pulse and added a loading icon inside each running card. Normal mode retains the rotating loader and sweeping bar; completion still uses the actual response. No processing or layout changes. No verification or servers run, following the user's existing request. Rechecked shared-candidates/orphans; no new duplication or changed imports between modules.

## [2026-10-22] corrected | Restore one-at-a-time zone loading
User clarified that the animation must preserve the original A→B→C sequence. Restored active/completed/waiting card states with 3s/6s visual transitions, only one loader/bar at a time, and ongoing Zone C activity until the response. Removed the visible explanatory paragraph and Step N labels. Timers clean up on stop/unmount. These are animation timings, not measured server progress. No verification, previews, or servers run per user request. The previously added pipeline-progress test file is absent in the current working tree and was not recreated. Shared-candidates unchanged: same component/page import, no new rule-of-3 hits.

## [2026-10-22] corrected | Restore original pipeline styling and move the underline itself
Restored original tinted backgrounds, icons, spacing, numeric badges, and title tooltips, reusing the page's existing InfoTip through renderTip. Corrected the nonexistent --on-brand foreground token to --brand-fg. The active underline explicitly translates left-to-right continuously; reduced-motion no longer changes it to a static opacity-only pulse. Previous steps retain a full underline, future steps wait, and the A→B→C visual sequence remains. No tests/verification, previews, or servers run as requested. Shared-candidates/orphans rechecked: reused the tooltip instead of adding a third copy; existing component/page references remain.

## [2026-10-22] added | Editable one-month synthetic rainfall fixture
Created test-data/synthetic-30-days with four clearly synthetic HMDAS hourly CSVs (720 rows each), editable daily plan, independent station-day answer key, regeneration script, and concise testing instructions. September 2023 cases specify six high, six low, and 108 normal station-days, with heavy-rain and minimum-rainfall controls. Saved-file timestamps and Decimal daily totals self-checked during generation; detector/server not run, so detection results are not claimed. Existing real data and frozen algorithms unchanged. Rechecked shared-candidates: no new rule-of-3 behavior. Registered generator as a manual entry point in orphans and documented fixture in api-zones map.

## [2026-10-24] updated | Map refresh for current code and presentation/testing discussions

Source-checked the zones router/service/algorithms, frontend upload polling and animation ownership, OAuth state storage, photo hash handling, migration inventory, component inbound references, and launch configuration. Corrected sync-only pipeline descriptions, documented process-local jobs/restart-related 404s and browser-only Stop, added exact Zone C high/low rules and four-station assessment gate, and retained the distinction between controlled synthetic expectations and measured accuracy. Added the two-terminal Windows website commands using the Repository checkout after the Desktop-copy startup failure. Indexed migrations 0006/0007 and DB/file/memory OAuth fallback; live migration application remains unverified. Removed absent-file orphan warnings and resolved chart/group references; rechecked shared-candidates without refactoring. Preserved existing fixture/map changes and all unrelated working-tree files. Documentation-only refresh; no servers, detector, application tests, database operations, commit, push, or deployment.

## [2026-10-24] updated | Human-in-the-loop anomaly review workspace

Replaced the report's station/banner/date-list layout with a themed station-day queue and selected-day comparison. Added per-reading anomaly/not-anomaly judgments, Needs review/Reviewed/All, station/date search, optional note, confirmation, Undo, explicit Next pending, reviewer/time, and run-scoped provider state. Preserved high/low detection, manual tickets, history/neighbor overlays, detailed evidence, raw/cleaned tabs, collapsed full table and exports. Result/reset replacement clears decisions atomically; guards warn before discarding current reviews. All-row Results CSV and flagged-only downloads preserve original flags and include review metadata; formula-like note text is escaped for spreadsheets. No API, frozen algorithms, Supabase schema, mobile or model changes. Controlled browser preview checked decisions, zero-valued low readings, undo, navigation retention, new-run isolation, date search, history overlay, dark/narrow layout and an actual CSV download. Five helper/export checks plus nine existing/updated rendering checks and TypeScript passed before final cleanup; no authenticated end-to-end pipeline or production deployment test. Read-only code review found no critical/important issues. Updated dependencies, orphan/test entry and shared-candidate notes; existing user files and prior map changes preserved. Review retention is by CSV, not database persistence; do not claim analyst judgments are objective accuracy labels.

## [2026-10-24] updated | Clearer review purpose, hierarchy and continuation

Added a short report goal, global high-plus-low review progress, explicit scoped All labels, queue heading, stronger station/rainfall typography, and same-day chart caption. Decision confirmation advances within the current selection; parent-owned Undo remains available and returns to the restored reading. Skip for now leaves a reading pending. Completed selections offer remaining readings across directions/filters. Kept decisions equally prominent and existing charts, details, filters, tickets, table and downloads. Changed comparison labels to distinguish recorded zero from no reading. Removed the temporary blue review-panel accent immediately after user feedback; retained neutral theme surfaces. Added failing checks for hierarchy/global counts/chart labels before implementation; rendering checks and TypeScript passed. No servers, detector, database, deployment or commit operations for this refinement; rechecked shared candidates/orphan references without new extraction.

## [2026-10-24] updated | Compact review action footer

Grouped both decision buttons on the right with Skip beside them; moved Add note to the left of the same footer. Expanded notes span the full width above the action group, with wrapping on narrow screens. Layout only; confirmation, decision storage, automatic advance, Undo and exports are unchanged. Shared-candidates/orphan references rechecked: no new duplication, dependencies or entry points. No browser preview, servers, commit or deployment.

## [2026-10-24] updated | Move review section below evidence

Moved ReviewActions after rainfall history and detection details, making it the selected-reading card's final section. No styling, handlers, review storage or exports changed. Existing imports and shared candidates remain unchanged; no new orphan references. No browser preview or server startup.

## [2026-10-24] updated | Make review decisions more visible

Applied the existing primary blue Button variant equally to both review decisions; kept Skip ghost-styled and the section neutral. Presentation only, with no new styles, dependencies, shared-candidate behavior or reference changes. No browser preview, server startup, commit or deployment.

## [2026-10-24] updated | Keep only High and Low in the report toolbar

Removed Needs review/Reviewed/All filter controls and their local state. Both pending and reviewed readings remain selectable with status badges; default selection prefers pending, while auto-next/Undo and exports remain intact. Retained station/date search and global review progress. Updated empty/completion copy to avoid references to removed controls. No new imports, orphan references or rule-of-3 behavior; no servers, database, commit or deployment operations.

## [2026-10-24] updated | Single chart switch, text cleanup, and restored review tabs

Removed the introductory instruction and bottom run-retention paragraph specified in screenshots. Added a History / Bar graph button to switch one fixed-height chart area, retaining history neighbor overlays and selected-reading data. Removed the stacked history disclosure. Completed that change before restoring Needs review / Reviewed / All following the user's clarification: only duplicated High/Low filtering was meant to be removed. Kept one High/Low toggle, generic All, selection-aware Undo/advance and appropriate empty/completion states. Both changes were checked with failing rendering assertions followed by passing checks; no server/database/deployment changes. Existing beforeunload/rerun/reset loss guards and CSV retention remain. Rechecked shared candidates/orphan references; both chart components remain used.

## [2026-10-24] updated | Shorter, larger selected-day detection details

Replaced the dense coordinates/score/rule/station-summary paragraphs with Why flagged, high-only Detection score, and one short review reminder. Removed station-wide averages, assessed-day frequency and historical peak from this selected-day explanation to avoid mixing dates. Increased detail text to --font-sm with clearer label/value spacing and wrapping. Low reasons stay distinct from LOF. Source data, Overview station summaries, map, charts, exports and review behavior are unchanged. Added a regression checking selected-day score and absence of unrelated station-history values; rechecked shared candidates/orphans after dropping the report's stationReview helper import. No servers, database, commit or deployment.

## [2026-10-24] updated | Restore helpful evidence with clear day/period grouping

Expanded Detection details after feedback that the prior version removed too much evidence. Selected day now includes the reason, reporting neighbor count/median, reading-to-neighbor ratio (explicitly unavailable for a zero median), high-only LOF score and location. Station pattern across all uploaded dates restores assessed rainy-day count, average vs group, and high frequency/dated flagged peak or low frequency/assessed-check run length. Two-column label/value layout keeps the larger text, stacks on phones, and separates historical statistics from the selected date. No algorithm, review state, chart or export changes. Updated regressions for day/period separation and low-pattern evidence; TypeScript and rendering checks passed. Rechecked shared candidates/orphans; no new dependencies or entry points. No browser preview, servers, commit or deployment.

## [2026-10-24] updated | Remove three requested detection fields

Removed Nearby rainfall, Reading vs nearby and Location from Detection details. Kept the selected-day reason, high-only LOF score, period statistics and chart comparison. Presentation-only deletion; no import/dependency, shared-candidate, orphan, review-state or export changes. No browser preview, servers, commit or deployment.

## [2026-10-24] updated | Make remaining detection evidence easier to scan

Replaced the widely separated two-column blocks with aligned label/value rows, larger base text and headings, stronger numeric values, quieter date/context suffixes and subtle row dividers. Limited reading width and stacked labels above values on narrow screens. Kept the three requested fields removed and retained all other facts and review/chart behavior. Rechecked shared candidates/orphans: styling and markup only, with no new modules or dependencies. No browser preview, servers, commit or deployment.

## [2026-10-24] updated | Plain-language LOF score tooltip

Added a help icon beside Detection score using the page's existing InfoTip via renderTip. Explanation covers LOF's meaning, same-day nearby readings, scores near -1, more-negative values, -3 vs -1, and -2 high cutoff plus rainfall checks; it does not claim an accuracy percentage or proven fault. Improved the reused tooltip's readable width/font and focus/tap/keyboard/Escape behavior with accessible tooltip description. Added regression assertions for the explanation and checked TypeScript/rendering tests. No algorithms, review state, dependencies or export changes; shared candidates/orphan references checked with no third tooltip implementation. No browser preview, servers, commit or deployment.

## [2026-10-24] updated | Make selected date and system flag more noticeable

Replaced the small combined metadata line with a larger semibold date and separately spaced System flag label/value. Used existing text tokens and weight rather than colored highlighting or a badge, following clarification. Station name remains the main heading; date value and all review/chart behavior stay unchanged. Styling/semantic markup only; no shared-candidate or orphan reference changes. No browser preview, servers, commit or deployment.

## [2026-10-24] updated | Explain average and highest-frequency metrics

Added help icons for Average vs group and Highest in group using the existing renderTip/InfoTip path. Explained daily comparisons averaged over checked rainy days, group membership, uploaded-period scope, strict highest frequency with ties excluded, and a one-in-four example. Added metric-specific accessible labels and strengthened regression assertions so visible values are checked separately from tooltip examples. Reused label styling and portal behavior; no new shared candidates, imports, orphan modules or dependencies. No server, database, commit or deployment changes; no browser preview.

## [2026-10-25] updated | Confirmation toast for review decisions

ReviewActions now uses the existing dashboard useToast hook after a confirmed review: Marked as anomaly / Marked as not anomaly with the station and date. Opening/cancelling the dialog and Skip do not notify. Existing Undo and automatic next-reading behavior remain. Rendering checks now include the real ToastProvider, matching dashboard context. Reused existing notification infrastructure; no new shared candidates, orphan modules, dependency or persistence changes. No browser preview, servers, commit or deployment.

## [2026-10-25] updated | Move Undo from banner to decision controls

Removed the full-width last-review banner. Following clarification, kept last-review Undo as a small ghost button beside Mark as anomaly/Mark as not anomaly; the button's title/accessibility label identifies the affected station/date. Undo remains available with completion actions after the final pending item and restores the exact prior record/selection. Kept confirmation toasts and existing review flow. Removed unused banner CSS; no new dependency, shared-candidate behavior or orphan module. No browser preview, servers, commit or deployment.

## [2026-10-25] updated | Remove gray marks beside ticket subheadings

Deleted the decorative gray span in TicketDetailBody's shared SubHeading helper after checking its callers. Field Observations, Root Cause and other subsection labels remain; the shared rendering change also applies in Reports. No behavior, imports or dependency changes. Shared-candidates/orphans unchanged; no tests added for a decorative deletion. No browser preview, servers, commit or deployment.

## [2026-10-25] updated | Consistent ticket detail spacing and alignment

Unified header, property strip and body horizontal insets using density tokens; reduced uneven section, heading and finding gaps. Removed leftover content/photo indents from current and prior rounds, aligned main heading text with body text while retaining its existing accent, and tightened status/approval spacing. Shared component applies to Tickets and Reports; data, workflow and actions unchanged. TypeScript passed. A temporary SSR sample ticket was inspected in the browser; finding headings aligned at the same x-coordinate with consistent row spacing. Preview tab/server stopped; no test fixtures or dependencies added. Shared-candidates/orphans reviewed with no changed imports or new duplicate behavior. No authenticated workflow test, database operation, commit or deployment.

## [2026-10-25] Separate processing History with saved reviews and ticket links
Implemented /history list, run summary and reopened results using extracted ZoneResults/CreateTicketModal/InfoTip. Added atomic immutable processing snapshots, source metadata, versioned authenticated reviews, original flags in downloads, optional validated ticket run/date links, latest submitted inspection/approval attribution, audit/SSE integration and ticket deep links. Failed saves retain downloadable results and retry; late retry cannot replace reset/new runs. Independent review caught confirmation/SSE concurrency: fixed by retaining original handler/revision and draft note, with RED→GREEN regression. Migration 0008 is manual and NOT applied. Final checks: 39/39 backend (actual dataset included), 27/27 frontend, TypeScript and production build passed. Browser visual check unavailable because local browser use is disabled; live SQL/Supabase flow unverified. Maps/shared candidates/orphans updated. No frozen algorithms, Expo edits, commits or deployment. Setup: docs/PROCESSING_HISTORY.md.

## [2026-10-25] Diagnose History save warning
Read-only Supabase checks returned PGRST205 for all four History tables/view. Required History schema is unavailable in the configured project; user must run migration 0008 in Supabase SQL editor and retry saving. Opened the migration source. No database writes or application-code changes; no test rerun needed.

## [2026-10-25] Analyst-controlled History save with titles
Removed automatic History persistence after processing. Runs stay temporary until Save to History with an editable title (trimmed 1–120 chars); title is stored/searchable/displayed with older filename fallback. Added migration 0009 and explicit titled-save RPC. Shared controller provides Save/Discard/Keep working on unsaved navigation/reset/rerun/file changes, and save-before-ticket. Reviews still persist automatically after saving. Job store now holds compact file metadata rather than raw uploads and uses one-hour temporary retention. Failed saves retain title/error and original result; uncertain retries return canonical title. Checks: full backend 43/43, targeted latest History 19/19, frontend 30/30, TypeScript and production build passed. No SQL applied, no browser visual check (Work setting disabled), no frozen algorithm/Expo changes, commits or deployment. Setup docs/maps updated; shared candidates/orphans checked.

## [2026-10-25] Compact, consistent History filters
Matched the History toolbar to the other dashboard lists: saved-run heading/count, short search with icon, compact inline date range and aligned action buttons. Preserved search/date submission and accessibility; responsive wrapping and dark native date controls remain. TypeScript and 4 History render checks passed; no new cosmetic tests, browser preview, API changes or migration changes. Shared search candidate noted; no orphan/reference removals.

## [2026-10-25] Restrained History list polish
Put run identity first, clipped long filenames with full-name tooltip, tightened/fixed row and column geometry, clarified review progress and rainfall period, and replaced loud repeated detail links with quieter Open actions. Kept all filters, metadata and exact run links; scoped styling to the run list. Updated existing render assertions for the new wording. TypeScript and 4 render checks passed; browser visual review remains unavailable. No new duplicate behavior or orphan references.

## [2026-10-25] Remove the selected initial History run
At the user's request, matched the screenshot to run 4cee0eaf-3f2c-4170-8a93-9e9a78b6afa8 (01:40 Asia/Manila, four files/stations, 75 flags). Verified zero review rows and linked tickets, backed up its metadata/results to the local temporary directory, then deleted that UUID; the result snapshot cascaded. Verified absence from History and its related tables and preserved the separate 02:51 run. Live Supabase History tables are now available. After the user authorized the Supabase plugin, verified MCP access by listing projects and querying History in the project matching api/.env. No application/schema changes or test rerun; shared candidates/orphan references unchanged.

## [2026-10-25] Remove repeated title and description strips from dashboard tabs
Deleted the shared Header heading block and its obsolete props/callers; retained an accessible h1 in the topbar breadcrumb. Moved New Technician and audit Export into the topbar so both actions remain available. Applies to all five dashboard tabs and nested History pages. Removed the technician count used only in the deleted description. TypeScript, 4 existing History render tests and a temporary five-tab Header render self-check passed; no new cosmetic tests, browser preview or production build. Updated component/shell maps; shared candidates and orphans checked with no new duplication or reference changes. No API, mobile, database, commit or deployment changes.
