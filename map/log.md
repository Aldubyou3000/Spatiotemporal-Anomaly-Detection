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

## [2026-10-25] Inbox-inspired History redesign
Replaced the saved-run table with compact full-row links in a full-height panel, wider search, quiet source icons/dividers, review badges, right-aligned dates and responsive metadata. Kept all existing run data, search/date submission, pagination, native navigation, loading/error/empty states and SWR behavior. Removed superseded run-table CSS while leaving shared detail styles intact. TypeScript and 4 existing History render checks passed; assertions now follow the full-row link. Browser QA used isolated real components with the live saved-run metadata read via Supabase MCP: light/dark, 900/600/390px wrapping/overflow and a temporary 20-row scroll/pagination check. No test rows were persisted. Shared-candidates updated because History no longer uses the compact search pattern; orphan module references unchanged. No authenticated workflow retest, production build, API/mobile/schema changes, database writes, commit or deployment.

## [2026-10-25] Fixed-height review panels and permanent notes
Bound the two-column AnomalyReportTab workspace to a stable viewport-aware height, with equal panel bottoms, scrolling queue/evidence areas and anchored note/decision controls. Replaced the note disclosure with a permanent fixed-height textarea. Added Detection details alongside explicit Bar graph/History view buttons; retained all evidence, neighbor comparison, review state and confirmation guards. Applies to Zones and reopened History results. TypeScript and 18 relevant checks passed; added one view-switch interaction regression and updated the existing note rendering assertions. Isolated browser checks verified equal 500px panels in all three views with internal scrolling and a visible note field. Live review submission was not retested. Maps/shared candidates/orphans checked; no new duplication, module or orphan changes. No API, frozen algorithms, mobile, database writes, commit or deployment.

## [2026-10-25] Compact review decision bar
Reduced AnomalyReportTab's review footer to a short heading/status and a two-row permanent note beside the actions, with wrapping and density-aware spacing. Removed repeated instruction copy; preserved confirmation/save/undo behavior. Updated the render assertion and component map; shared candidates and orphan references unchanged. TypeScript and 18 checks passed; isolated desktop preview measured 111px vs previous 240px. Live saves and narrow-screen browser layout not retested.

## [2026-10-25] Expand charts into remaining review space
Removed fixed report chart height in favor of a flex slot and percentage-height Recharts containers for Bar graph and History. Preserved panel bounds, minimum chart height, horizontal overflow and chart defaults elsewhere. Updated component map; shared candidates/orphans unchanged. TypeScript and 18 checks passed (SSR dimension warnings); browser geometry confirmed both chart slots fill available height. Hydrated charts and mobile not retested.

## [2026-10-25] Make neighbor comparison easier to find
Moved Compare neighbors from the view-switch toolbar into the chart measurement row beside nearby rainfall. Added outlined/off and blue/check/on styling using the existing Button and retained aria-pressed/disabled behavior. Removed the redundant toolbar wrapper. Component map updated; shared candidates/orphans checked with no changes. TypeScript and five relevant checks passed; browser visual QA not run.

## [2026-10-25] Fix both graphs' scrollbar/resize feedback
Reproduced the issue with hydrated Recharts rather than SSR: rounded SVG sizing fed back into auto-overflow flex containers. Isolated both plots in absolute clipped content, leaving horizontal scrolling only on narrow bar comparisons. Browser checks covered view changes, neighbor overlays and fractional-width resizing with matching plot/slot sizes; TypeScript and five interaction checks passed. Updated component map; shared candidates/orphans unchanged. Synthetic preview only, no live saves.

## [2026-10-25] Fix saved review requests crashing before database access
Reproduced validate_reading's TypeError with the installed PostgREST client: a list of dictionaries entered the SQL-array contains path. JSON-encoded the JSONB containment predicate in the shared validator, fixing review/Undo and reading-linked ticket validation. Added a real-client MockTransport review-endpoint regression with quoted station names; all 20 History tests passed. Live client lookup and intentionally stale RPC conflict succeeded without a decision write; SQL save probe rolled back. API health/preflight and reload mode verified; no authenticated browser resubmission. Updated API map and known-bugs log, rechecked shared candidates/orphans with no changes. No migrations, permission changes, algorithm/mobile changes or deployment.

## [2026-10-25] Stabilize review updates and preserve live-update drafts
Reproduced note-entry height changes, Undo shifting actions and live review changes replacing the initial selected editor. Reserved control space, moved note guidance to aria-description, kept attribution on one line and pinned selection. Queue-only scrolling reveals the next reading without moving the workspace; disabled queue scroll anchoring. Hydrated synthetic browser checks covered typing/save/advance/Undo, remote review updates, wide/narrow panels and queue scroll; geometry stayed stable and drafts survived. TypeScript and 19 checks passed, including the new live-update selection regression. Updated component/state maps and known-bugs doc; shared candidates/orphans unchanged. No authenticated save/mobile viewport retest, backend/algorithm/database changes, commit or deployment.

## [2026-10-25] Align search and review filters above their panels
Moved search above the queue and review-status controls to the start of the report column; retained the station dropdown inside Flagged readings per clarification. Shared responsive grid tracks keep controls aligned while retaining equal panel heights. TypeScript and six History tests passed; hydrated desktop geometry confirmed alignment and 500px panels. Component map updated, shared candidates/orphans unchanged. No live-save/mobile retest or data changes.

## [2026-10-25] Match History review progress to brand blue
Explicitly styled the native Analyst review progress fill/track in History.module.css with theme tokens and WebKit/Firefox selectors, matching AnomalyReportTab. Component map updated; shared candidates/orphans checked with no changes. CSS diff check passed; browser/tests not rerun for this cosmetic change.

## [2026-10-25] Chart the UI Library planning map
User confirmed both a gallery of actual website components and a visual customization editor. Created a local Wayfinder map and four decision tickets with dependencies for saving/publishing, control coverage, access/location and gallery/editor prototype. Saving/control questions await user answers; no ticket resolved during charting. Read missing grilling/domain-modeling dependencies from the author's upstream source without installing them. Linked the effort from the architecture index; shared candidates/orphans checked with no production changes. No website code, tests, schema or deployment changes.

## [2026-10-25] Clarify UI Library as local design playground
User clarified the gallery/editor is solely for local designing, with no deployment. Claimed and resolved the save/publication decision with that scope, removed deployment/publication assumptions from the destination and dependent questions, and retained local draft preferences as the simple storage approach. One decision resolved; no application code, operational data or tests changed.

## [2026-10-25] Implement local UI Library and visual editor
Built development-only /ui-library with searchable 20-section real-component gallery, isolated responsive preview, light/dark and density previews, shared/per-component appearance controls and validated browser drafts/reset. Source inventory covers every visual component module. Shared primitives gained inert data-ui hooks; chart variables retain original defaults; preview sidebar uses isolated storage and fixture contexts/SWR cache. Explicit sample ticket mutations complete locally; all other API requests are blocked inside preview. Added exact dev-only same-origin preview frame headers while retaining production frame protection and dashboard authentication. TypeScript and 48 settings/access/render/regression checks passed; both routes and response headers verified over HTTP. Independent review findings fixed and rechecked. Browser automation attempted but disabled in Work settings, so hydrated visuals/persistence remain unverified. Updated guide, implementation record and architecture maps/candidates/orphans. No dependencies, backend/schema changes, commit, push or deployment.

## [2026-10-25] Flatten theme and strengthen background separation
Used Gmail and supplied inbox/board references for a plain tinted canvas, contrasting work surfaces, restrained dividers and rounded navigation while retaining Sentinel blue. Removed decorative grid/elevation shadows/header blur, flattened shared Zones/History results framing, consolidated Overview cards, distinguished queue/detail surfaces and removed redundant UI Library specimen/browser frames. Added keyboard outlines and light/dark contrast checks. Independent review caught the Canvas control losing its visible backdrop; restored the canvas around the gallery and under single specimens. TypeScript and 50 theme/settings/render/regression checks passed. Local UI Library responds over HTTP. Hydrated browser inspection remains unavailable because browser use is disabled in Work settings. Updated map pages/candidates/orphans and library guide; no backend, schema, dependency or algorithm changes.

## [2026-10-25] Reduce decorative lines throughout the website
Removed structural panel outlines and redundant header/section dividers across Zones, shared History review, Overview, ticket/report detail, History details, Audit/Technicians, Card, dialogs and UI Library chrome. Preserved fields/buttons, floating surface edges, table/list row separators, active-tab underlines and meaningful state cues; kept an invisible Card border for customization. Grouping now relies on existing surface contrast, headings and spacing. TypeScript, 50 existing theme/settings/render/regression checks and diff whitespace check passed; SSR chart dimension warnings are expected. Hydrated browser layout remains unverified because browser automation is disabled. Component maps/shared candidates checked; no imports removed, new orphans, dependencies, backend or algorithm changes.

## [2026-10-25] Restore visibility and separate navigation from content
User screenshots exposed near-identical selection/panel fills and low-opacity chart axis labels. Strengthened the shared light selection tint, added solid active review filters and a selected-reading edge, and moved both charts to readable theme text colors. Placeholders use full-opacity muted text. Followed the supplied Gmail reference with pale navigation beside one inset rounded workspace and matching surface header; mobile removes the outer inset. UI Library shell preview shares that structure. Added two selection contrast checks; confirmed the light-mode check failed before the fix. TypeScript and 45 relevant theme/component/history/review checks passed, plus diff whitespace validation. Browser layout remains unverified because browser automation is disabled. Maps/shared candidates/orphans reviewed with no module reference changes. No backend/data/algorithm changes.

## [2026-10-25] Reserve blue-gray for the background
Changed light content alt/sunken/muted surface tokens to neutral grays while retaining white work surfaces and the blue-gray shell canvas. All existing dashboard/library token consumers inherit the change; actions/selections retain semantic blue. Four light/dark contrast checks and diff whitespace check passed. Browser visual verification remains unavailable; no logic, dependency or module reference changes. Updated shell/component maps; shared candidates/orphans reviewed with no new entries.

## [2026-10-25] Remove doubled History search focus highlight
The global important focus rule outlined the borderless inner search input in addition to its rounded wrapper. Scoped the input exception to History search and gave its wrapper one rounded focus cue; date fields and other keyboard focus indicators remain intact. History render checks and diff whitespace validation passed. Browser visuals remain unverified. Component map updated; shared candidates/orphan references unchanged, with no new behavior duplication or imports.

## [2026-10-25] Redesign shared scrollbars
Added thicker rounded handles, inset transparent tracks, shorter visible thumb ends and hidden zero-size arrow buttons for supported WebKit/Chromium scrollbar parts. Reset standard scrollbar properties to auto inside the support query because non-auto values override part styling; checked MDN's scrollbar reference. Removed anomaly-review thin-width exceptions so all scrolling areas inherit the shared style. Retained native-width colored fallback elsewhere; native handle length still follows viewport/content ratio. Four theme checks passed, CSS parsed and UI Library returned HTTP 200; diff whitespace validation passed. Browser visual verification remains unavailable. Updated shell/component maps; shared candidates/orphans unchanged, no new dependencies or scrolling logic.

## [2026-10-25] Give Tickets a distinct split view
Separated Tickets list and detail into two labeled white rounded panes with a neutral backdrop/gutter, following the supplied split-pane reference. List width now caps at 420px; minmax(0,1fr)/minWidth:0 keep detail content within its column. Existing independent scrolling, filters, selection, loading/empty states and ticket actions are retained. TypeScript and diff whitespace checks passed; browser visuals remain unverified. Updated component map; shared candidates/orphans reviewed with unchanged imports and no new duplication, dependencies or backend/data changes.

## [2026-10-25] Align Tickets panes and unify their parent color
Removed the ticket-count footer that visually shortened the white list pane and its unused constant. Explicitly constrained both panes to one stretching grid row. Tickets now owns a consistent neutral background through the header and pane gutter; Header's optional background preserves existing callers' default. TypeScript, 22 component rendering/inventory checks and diff whitespace validation passed; expected SSR chart measurement warnings remain. Browser geometry remains unverified. Updated component/shell maps; no import/orphan changes or new shared rule-of-3 candidate, data or behavior changes.

## [2026-10-25] Apply split-view surfaces to Anomaly Report
Matched Tickets with one neutral report parent spanning heading/progress/toolbar/gutter and two white rounded queue/evidence panes. Kept the existing equal fixed-height desktop grid and mobile stacking; aligned toolbar/panes with shared gap tokens. Review actions remain white within the detail pane, while inactive filters use white against the neutral parent. Shared component updates Zones, History and library examples. Nineteen History/station-review checks, report CSS parsing and diff whitespace validation passed; browser geometry remains unverified. Component map updated; shared candidates/orphans checked with no imports, new behavior duplication or data changes.

## [2026-10-25] Separate backgrounds across the other result tabs
Added one shared neutral inset panel style for Overview & Map, Raw Data, Cleaned Data and Neighbor Groups, leaving white work surfaces inside and the tab bar outside. Kept Anomaly Report's equivalent parent without another wrapper. Removed obsolete Overview/NeighborGroups top padding so the shared parent owns spacing. Applies to Zones and saved History results. TypeScript, nineteen History/station-review checks and diff whitespace validation passed; browser visuals remain unverified. Component/shared-candidate/orphan maps updated for the live stylesheet import. No behavior, dependencies, data or algorithm changes.

## [2026-10-25] Match the supplied Google background color
Sampled the attached screenshot's dominant pale background (#F8FAFD) and replaced light --surface-alt with it. Tickets, result tabs, Anomaly Report and all shared token consumers inherit the reference color; white panels and the #E9EEF6 shell are retained. Four theme contrast checks and diff whitespace validation passed. Browser visuals remain unverified. Shell/component maps updated; shared candidates/orphan references unchanged. No behavior/data changes.

## [2026-10-25] Remove excess space above saved-result tabs
History results used large body gaps between the back link, padded save-status row and results navigation. Combined link/status in one compact wrapping toolbar and reduced only this route's body spacing to --gap-card. Status errors/retry/loading feedback are retained; other History/Zones layouts are unaffected. TypeScript, six History checks and diff whitespace validation passed; browser geometry remains unverified. Component map updated; shared candidates/orphan references unchanged, no new dependencies or data changes.

## [2026-10-25] Shorten the saved-runs search field
Changed History search from growing across the toolbar to a shrinkable 22rem basis, retaining narrow-screen wrapping. Six History checks and diff whitespace validation passed; browser visuals remain unverified. Component map updated; shared candidates/orphans unchanged, no behavior or reference changes.

## [2026-10-25] Move Run summary into the header and hide idle save copy
Placed Run summary before Workspace via Header's optional leading slot, removing the body toolbar and unused styles. Shared ReviewSaveStatus hides idle saved copy visually while retaining its screen-reader announcement; saving/loading/error/retry feedback remains visible. TypeScript, 28 History/component rendering checks and diff whitespace validation passed; browser visuals remain unverified. Shell/component maps updated; references/shared candidates checked with no new orphan or duplicated behavior, dependencies or data changes.

## [2026-10-25] Show current History record in breadcrumbs
Replaced Workspace → History on saved-run summary/results with linked History → current saved title, using filename/short-ID fallbacks without new data fetching. Results back navigation is now arrow-only, retaining its accessible label and original target. Header's parent prop defaults to Workspace for other callers; long current titles truncate with a full-title tooltip. TypeScript, 28 History/component render checks and diff whitespace validation passed; browser visuals remain unverified. Shell/component maps updated; shared candidates/orphans unchanged. No data or workflow changes.

## [2026-10-25] Soften scrollbar color only
User clarified to retain scrollbar size and change only color. Added shared neutral thumb/hover tokens for both themes, replacing text-derived colors in native fallback/custom parts. Dimensions, track insets and arrow removal remain unchanged. CSS parsing, four theme checks and diff whitespace validation passed; browser visuals remain unverified. Shell map updated; shared candidates/orphan references unchanged. No behavior or data changes.

## [2026-10-25] Fit saved results to the window and consolidate report chrome
Replaced saved History results' page scrolling/fixed report height with a constrained flex layout that fills actual available space. Queues/evidence/other tab content scroll internally; full table uses the existing Modal only in viewport mode, preserving regular Zones' inline disclosure. Hid the incidental vertical scrollbar caused by tab navigation's horizontal-overflow rule. Removed Review flagged readings, moved progress into the filter row and placed CSV actions in a bottom-right footer. Added a functional disclosure test covering modal open/close and normal inline behavior; fixed its mock-cache isolation. TypeScript, 42 History/station/component checks, CSS parsing and diff whitespace validation passed. Browser geometry remains unverified because browser automation is disabled. Updated component/shell/shared-candidate/orphan maps. No backend, algorithm, data or dependency changes.

## [2026-10-25] Consolidate the saved-results footer
Moved the viewport-mode full-table action into the same compact footer as the CSV controls, left/right aligned, removing the extra row of bottom whitespace. The existing tab system is now controlled by ZoneResults so the action appears only on Anomaly Report; reused one table element and preserved ordinary Zones' inline disclosure. Extended the disclosure test to assert shared-footer placement. TypeScript, 29 History/component checks and diff whitespace validation passed; browser visuals remain unverified. Component map updated; shared candidates/orphans checked with no new module references or duplication, dependencies or data changes.

## [2026-10-25] Stabilize review filter buttons on selection
Removed the selected-only font-weight increase that changed control width. Both review-status and High/Low controls now keep a consistent weight, no-wrap layout and reserved tabular count width derived from the run's total flagged-reading digits, avoiding movement when counts cross a digit boundary. Shared report updates Zones, History and gallery specimens. TypeScript, twenty History/station-review checks and diff whitespace validation passed; browser geometry remains unverified. Component map updated; shared candidates/orphan references unchanged, no dependencies or data/workflow changes.

## [2026-10-25] Align and clarify shared dropdown icons
Corrected Select's excessive right padding for its in-flow chevron, enlarged the icon to 14px with readable text color and kept it non-shrinking while long labels truncate. Field dimensions/open rotation are retained. TypeScript, 22 component render checks and diff whitespace validation passed; browser visuals remain unverified. Component map updated; shared candidates/orphans unchanged with no new imports, data or behavior changes.

## [2026-10-25] Simplify the Overview summary hierarchy
Replaced dense uppercase/icon/monospace metric styling with larger tabular values, sentence-case labels and quieter supporting text in a semantic metrics list. Condensed the stacked date range to a wrapping horizontal interval and simplified next steps to a plain ordered list with consolidated help. Removed unused decorative metadata/imports; added one local token-based stylesheet. Data calculations/map behavior are unchanged. TypeScript, 35 station/component checks and diff whitespace validation passed; browser visuals remain unverified. Component/orphan maps updated; shared candidates checked with no new repeated behavior.

## [2026-10-25] Restore separated Overview cards and icons
User clarified that metrics/sections should remain separated and retain their icons. Restored four white metric cards plus separate Date range/Next steps cards with shared gaps on the pale backdrop, and the original metric/section icons. Kept the clearer typography and compact date/steps layouts without adding borders or shadows. TypeScript, 35 station/component checks and diff whitespace validation passed; CSS parsed, browser visuals remain unverified. Component map updated; shared candidates/orphan references unchanged, data and map logic retained.

## [2026-10-25] Restore large right-side metric icons
Checked the original Overview implementation and restored its 64px faded right-side watermark treatment with the existing shared class. Separate cards retain clearer labels/values above the decorative icon; small section icons remain. TypeScript, 22 component rendering checks and diff whitespace validation passed; browser visuals remain unverified. Component map updated; reused existing behavior with no new shared candidate/orphan reference or data change.

## [2026-10-25] Connect Station Review Summary sections
Unified heading, legend, station rows and footer within one padded white card. Removed alternating background strips and full-width section rules; retained only separators between station records. Combined the shared-Button other-stations toggle and review reminder in one wrapping footer, retaining counts/status/evidence and expansion logic. TypeScript, 35 station/component checks and diff whitespace validation passed; CSS parsed and browser visuals remain unverified. Component map updated; shared candidates/orphans checked with only reuse of the existing Button, no new duplicate behavior or data changes.

## [2026-10-25] Plan a compact Zones process/results workspace
Investigated Zones page handlers, ZonesContext, PipelineDiagram, save coordination and the existing History viewport mode. Wrote docs/ZONES_WORKSPACE_PLAN.md proposing mutually exclusive setup/running/results content, persistent compact result actions and an on-demand configuration dialog. Documented state preservation, file-change/rerun/reset safeguards, Stop/late-response limits, save failure handling, responsive overflow and verification criteria. Updated the component map; shared candidates/orphans checked with no source references changed. Planning only: no application edits, tests, backend or data changes for this request.

## [2026-10-25] Implement the compact Zones workspace
Replaced stacked setup/pipeline/status/results with mutually exclusive setup, processing and fitViewport results. Reused one configuration component in setup/result dialog, with collapsed process details, bounded file list, focused keyboard navigation and trigger restoration; global save/leave dialogs retain priority. Retained result component identity during configuration, guarded file changes/reruns/reset, save-before-ticket, revision handling and Stop/late-response checks. Removed auto-scrolling and duplicate idle/running placeholders. Refined the result header with a file-count badge, primary save action, screen-reader-only unsaved copy and icon-only Reset; added compact save specimens to the library. TypeScript, 74 workflow/history/review/library/theme checks, CSS parsing and diff whitespace validation passed. Browser geometry/authenticated processing remain unverified; browser automation is disabled. Updated the implementation plan and architecture/state/shell/candidate/orphan maps. No backend, algorithms, database, dependencies, commit or deployment changes.

## [2026-10-25] Allow tab navigation while retaining an unsaved run
Added a non-destructive Continue without saving choice to the existing reminder for shared-dashboard links. Internal continuation no longer resets ZonesContext; files/result/reviews stay available on return. Keep working cancels navigation; Save waits for success and failures leave the run/action intact. File replacement/rerun/reset and routes outside the shared dashboard retain the destructive save/discard warning; native unload protection remains. Added five controller interaction checks and extended provider-guard coverage. TypeScript, 57 navigation/history/workspace/library checks and diff whitespace validation passed. Browser navigation remains unverified. Updated state/component/candidate/orphan maps and workspace plan. No automatic saving, new storage, backend, data or dependency changes.

## [2026-10-25] Standardize the save reminder dialog
Reviewed Microsoft confirmation labels and Material dialog action layout guidance. Replaced verbose copy/labels and competing primary actions with Cancel / Don’t save / Save, one primary button, one white surface and a compact aligned footer; small screens deliberately stack actions. ConfirmDialog reuses Button and adds accessible description, safe initial focus, Tab containment and focus restoration, preserving destructive defaults and persistence/navigation callbacks. Added three dialog tests and a Save reminder gallery example; updated navigation wording tests. TypeScript, 58 dialog/navigation/workspace/history/station/library checks, CSS parsing and diff whitespace validation passed. Browser visuals remain unverified. Recorded rationale in docs/SAVE_REMINDER_DESIGN.md and updated maps; no data/backend/dependency changes.

## [2026-10-25] Stop unsaved-run reminders on unrelated dashboard tabs
Reproduced the global save controller intercepting links on History while an unsaved Zones run remained in context. Scoped the event handler to the current /zones pathname; navigating other dashboard pages now leaves the retained run untouched without another reminder. Added a regression covering History list/detail, Tickets, Reports, Technicians, Audit and return-to-Zones behavior; verified it failed before the one-line fix. TypeScript, 22 navigation/history/workspace checks and diff whitespace validation passed; browser navigation remains unverified. State/component maps updated, shared candidates/orphans checked with unchanged references. No persistence, destructive-guard or data changes.

## [2026-10-25] Prevent transient oversized map markers on tab changes
Inspected StationMap and installed Leaflet source: fitBounds used per-edge padding while a following getBoundsZoom used half that total, potentially raising minimum zoom and triggering implicit SVG zoom scaling. Disabled map/marker zoom tweening, measured before fitting and reused the actual fitted zoom for the minimum. Coalesced/cancelled resize frames and checked map identity during cleanup to prevent stale tab work. Normal dot/halo radii are unchanged. TypeScript, 38 map/station/component checks and diff whitespace validation passed; browser visuals remain unverified. Component/orphan maps updated; shared candidates reviewed with no new duplicated behavior, dependencies or data changes.

## [2026-10-25] Simplify the Zones upload and run form
Replaced the oversized two-column configuration with one centered white form on the pale workspace background. Shortened the drop target, made browse/format/size requirements readable, removed repeated Start detection copy and moved processing into one compact action row. Optional How detection works retains the existing pipeline explanation. Setup/results dialog reuse the composition; the UI Library inherits FileUpload. Preserved validation, removal/loss guards and all processing/save callbacks; added explicit disabled and validation-announcement semantics. TypeScript, 31 workspace/library checks, CSS parsing and diff whitespace validation passed. Hydrated browser appearance remains unverified because browser automation is disabled. Updated the component map/workspace plan and checked shared candidates/orphans; no dependencies, backend or data changes.

## [2026-10-25] Keep detection steps visible without a toggle
Replaced the How detection works disclosure with a labeled section and heading in the shared setup/results configuration. All three PipelineDiagram steps remain visible. Removed disclosure-specific styling and updated the workspace assertion/documentation. TypeScript and nine workspace checks passed. Shared candidates/orphans reviewed; references and processing behavior unchanged. Browser visuals not checked.

## [2026-10-25] Refine setup hierarchy without adding complexity
Strengthened the Rainfall detection heading and shortened its intro. Replaced the large centered drop target with a compact responsive upload row and native Browse/Add files button; retained drag/drop, validation and removal guards. Reduced guidance to two quiet lines and removed the duplicate add-files footer action. Idle PipelineDiagram now shows three plain ordered steps from the existing metadata, without nested cards or placeholder counts; running/completed feedback remains unchanged. Configuration uses the idle explanation and one larger Run detection action. Updated gallery selectors, workspace labels, component maps/plan and reference/candidate checks. TypeScript, 40 workspace/library checks, three CSS parses and targeted diff whitespace validation passed. Browser visuals remain unverified; no backend, data or dependency changes.

## [2026-10-25] Simplify the processing view to match setup
Aligned processing with the centered setup surface, heading hierarchy and pale canvas. Unified idle/running/completed pipeline markup into three plain ordered steps. Replaced colored stage cards, placeholder counts and timed stage simulation with one accessible indeterminate progress bar, respecting reduced motion; completed mode retains actual counts and completion feedback. Removed the redundant heading spinner and unused timers/icons/styles. Stop, request guards and result transitions are unchanged. Updated library selector, component/workspace docs and candidate/orphan checks. TypeScript, 41 workspace/library checks, two CSS parses and targeted whitespace validation passed. Browser visuals remain unverified; no backend, data or dependency changes.

## [2026-10-25] Flatten the Zones setup panels
Removed the nested pale body and rounded setup/processing card so the bounded form sits directly on the existing work surface. Removed the process explanation fill/frame. Selected uploads now use a plain summary row and unboxed file list, keeping only useful row separators; removed the tinted footer and persistent outlines around remove buttons. Empty upload/drop feedback, file validation, confirmations, internal scrolling and processing handlers remain unchanged. TypeScript, 34 workspace/library render checks and two CSS parses passed. Browser visuals remain unverified. Updated component/workspace/reference notes; shared candidates reviewed with no new rule-of-3 pattern, module, dependency or data changes.

## [2026-10-25] Add the two structural panels shown in the user outline
Restored one inset pale body panel below the header and one centered white setup/processing panel, using existing tokens and compact mobile insets. Kept selected uploads, file list and process steps unboxed. No new markup, shadows, imports or behavior changes; shared candidates/orphan references reviewed and unchanged. Component/workspace notes updated. CSS parsing and nine workspace checks passed; browser visuals remain unverified.

## [2026-10-25] Research and refine upload panel grouping
Consulted official Material color roles, Carbon uploader/forms and GOV.UK upload guidance. Retained the pale parent/white form while improving desktop/mobile insets, joining the selection summary directly to the file list, grouping Add files/Remove all above it and placing technical notes below it. Tightened density-aware file rows and clarified the process heading/sentence-case labels. Existing removal confirmation, validation, processing and save handlers remain. TypeScript, 34 workspace/component checks, two CSS parses and targeted whitespace validation passed. Updated maps/workspace reference notes; shared candidates reviewed with no new repeated behavior or abstraction. Browser visuals remain unverified; no new dependency, backend or data changes.

## [2026-10-25] Make scene-specific layout changes and highlight the zones
Confirmed from the supplied screenshots that previous refinements were present but too subtle. Researched official empty-state, panel-footer, loading/progress and single-page configuration guidance. Reworked setup into upload/files plus a slim process guide in one white panel, with a clear action footer and container-width stacking. Processing now uses a narrower status panel with vertical steps. Added consistent green/amber/red zone identity labels across states, retaining honest indeterminate progress. Browse receives primary emphasis before selection, and Run after selection. Existing removal/unsaved/Stop/save/result guards remain. TypeScript and 34 workspace/gallery checks passed; three CSS parses and targeted whitespace checks passed. Component/reference/candidate/orphan notes updated. Browser geometry remains unverified; no API, algorithm, data or dependency changes.

## [2026-10-25] Standardize Zones spacing on a shared scale
Checked Carbon's official spacing guidance and added explicit shared 4/8/16/24/32px spacing primitives. Replaced mixed radius/density gap values in Zones setup/processing/header/configuration and shared upload/pipeline styling. Aligned panel/section/footer insets, standardized mobile padding, balanced badge/text gaps and matched uploader action minimum height to file rows. No workflow, data, component/import or algorithm changes; orphan references remain unchanged. Four CSS files parsed, 13 surface/workspace checks and targeted whitespace checks passed. Updated component/shell/reference/shared-candidate notes. Browser geometry remains unverified.

## [2026-10-25] Remove the upload-to-footer blank area
Found that the taller process guide set the configuration grid row height and pushed the full-width Run footer below the upload column. Grouped FileUpload, pipeline errors and Run controls in one independent task column so the footer follows upload content at the existing 24px gap. Guide stacking, handlers, disabled states and loss/save guards remain. TypeScript, nine workspace checks, CSS parsing and targeted whitespace checks passed. Updated component/workspace/orphan notes; shared candidates reviewed with no new duplication or abstraction. Browser geometry remains unverified.

## [2026-10-25] Restore visible loading feedback and place Stop in context
Confirmed Windows MinAnimate=0 and found the reduced-motion media rule explicitly disabling the progress animation. Replaced that frozen state with a gentle fixed-position opacity pulse; normal mode still sweeps. Inspected generated CSS to confirm scoped animation names/keyframes. Moved Stop beside the processing title while preserving confirmation/abort behavior; extended existing workspace assertions for its local placement. TypeScript, 34 workspace/gallery checks, two CSS parses and targeted whitespace checks passed. Updated component/workspace/orphan notes; shared candidates reviewed with no new repeated behavior. Browser animation playback remains unverified; no backend/data/dependency changes.

## [2026-10-25] Follow actual pipeline stages and show active stations
Added optional service-level PipelineProgress reporting at real conversion/Zone A/B/C/finalization boundaries without changing frozen algorithms. Existing locked, owner-only async job polling returns stage/station snapshots; web polling forwards them to the current guarded request/context. Shared PipelineDiagram shows complete/active/waiting steps and active station chips, with no fabricated station completion or percentage. Fixed the remaining reduced-motion stall using a slower moving sweep; browser transforms confirmed movement. Gallery controls exercise stages; browser preview verified A then B and moved station labels. TypeScript, 37 focused web checks and two focused backend checks passed; full backend/data regression not reconfirmed. Existing cancellation and synchronous fallback remain. Shared candidates reviewed: no new behavior copied in three places. zones-progress.test.cjs is a manual test entry point, not a runtime orphan.

## [2026-10-26] Research white surface palettes before changing the theme
Reviewed actual shell/result/setup tokens and official Material, Carbon, Atlassian and WCAG guidance. Proposed Neutral pearl, Cool mist and Warm porcelain with role-based shell/workspace/panel/inset assignments and fewer painted nested wrappers. Created a thread-local interactive comparison for setup and anomaly report; no website theme values changed. Checked candidate text/button/control-edge contrast mathematically and self-checked palette switching, scene changes and saved-state restoration. Browser screenshot review of this comparison was unavailable because local browser use became disabled. Palette choice remains open; do not treat proposal values as approved defaults.

## [2026-10-26] Apply Neutral pearl and stronger blue selection colors only
User selected Neutral pearl and requested implementation of colors only after finding the initial selection fill too faint. Updated existing light-theme surface, neutral text/border and selected-fill/foreground tokens in globals.css. Kept primary brand/status colors, dark mode, layout, sizes, shadows and behavior; did not add the proposed selection marker. All four existing light/dark surface/contrast checks passed; PostCSS parsed shared CSS. Shared candidates/orphans reviewed: no new duplication, imports or reference changes. Live browser appearance remains unverified. No commit or deployment performed.

## [2026-10-26] Match Tickets' nested surface sequence across the dashboard
Changed shared dashboard-workspace and Header default background from --surface to --surface-alt, producing gray shell → lighter workspace → white content panes. Kept History's run list white with an explicit existing --surface assignment. Existing Zones/result/Tickets/cards already consume these roles, so no per-page layout changes were needed. No highlight, geometry, scrollbar or workflow changes. TypeScript, 37 surface/history/gallery checks and two CSS parses passed. Shared-candidates/orphans rechecked: shared shell/Header resolve the repeated page role, with no new abstraction, imports or orphan references. Live browser appearance remains unchecked.

## [2026-10-26] Tighten and connect the result tabs
Researched official Carbon/Atlassian tabs guidance and found stacked pt-3 plus tab padding and a 16px content margin in ZoneResults. Removed the extra top padding, scoped a compact 40px tab row (44px coarse pointers), added one purposeful baseline, retained the active underline and strengthened its selected label. All five tab panels now begin 8px below navigation. Kept Neutral pearl surfaces, existing tab state, horizontal overflow, data/actions and shared Tab callers intact. Applies to Zones and History. TypeScript, 33 History/gallery checks, CSS parsing and targeted whitespace checks passed. Shared-candidates/orphans reviewed: one existing component owns the presentation; no new duplication, module or import changes. Browser visual verification remains unavailable.

## [2026-10-26] Simplify sidebar icons and stabilize the logo on toggle
Replaced five navigation glyphs with simpler installed Lucide alternatives at 20px/2.5 stroke and replaced detailed panel toggles with 18px chevrons. Increased collapsed width 52→64px and icon buttons 36→40px. Root cause of logo movement: different mark sizes/row insets plus centering within the animated outer width. Both branches now use the original 36px mark, matched brand-row anchors and fixed-width inner content. Added accessible collapsed link/expand names and active-route semantics. Kept metric-card icons, logo geometry, theme and routes unchanged. TypeScript, 26 gallery checks, both-mode SSR assertions and targeted whitespace checks passed. Shared candidates/orphans reviewed: existing Sidebar owns both modes, with no new module/dependency or orphan reference. Live browser transition playback remains unchecked.

## [2026-10-26] Simplify the selected reading highlight
Softened the review queue's selected fill by blending existing brand-soft with its panel surface and applied the existing dark-blue selection text. Removed the blue selection border while preserving transparent border geometry and the keyboard-only focus outline. No sidebar/global highlight, status badge, layout or interaction changes. Eleven History/theme checks, CSS parsing and whitespace validation passed. Shared candidates/orphans rechecked: no new duplication, imports or reference changes. Live browser appearance remains unchecked.

## [2026-10-26] Contain overview in a persistent map/details split
Implemented the approved map-left / detail-tabs-right layout in shared OverviewTab for Zones, History and gallery. Local panels retain state through opt-in TabPanel.keepMounted; map stays outside those panels. Station selection emphasizes its marker without resizing or refitting. Equal desktop heights and internal detail scrolling replace stacked station/quality sections; small screens stack. Quality details are single-column. Preserved all four metric icons. Follow-up screenshot refinement merges three lower cards into one compact Run details surface, removes duplicate local-tab links and keeps one neutral review action. TypeScript, 20 overview/map/station checks and CSS parsing passed; three overview checks passed again after the consolidation. Browser access disabled, so visual check unavailable. Reviewed shared candidates: no new rule-of-3 duplication. No production orphan introduced; overview-split.test.cjs is a manual test entry point. Also documented the preceding neutral review hierarchy/footer work in the component map.

## [2026-10-26] Connect overview navigation and summary surfaces
Removed the detached white navigation cap by matching the right pane backdrop. Aligned tab text with card text, unboxed Run details and aligned its labels/values in a shared grid; retained one purposeful action divider. Metric cards/icons and behavior unchanged. CSS parsing passed. Shared candidates/orphans reviewed: no new duplication or reference changes. User screenshot still showed the prior three-card markup; current source already consolidates it. Live browser verification unavailable.

## [2026-10-26] Restore overview panels at user request
Reverted the preceding surface-only refinement: white tab header, white rounded Run details panel, wrapping metadata rows, and no extra action divider. Existing split layout, metrics/icons and behavior remain. No reference changes or new shared-candidate duplication. Live visuals not checked.

## [2026-10-26] Make the overview details parent panel visible
Added space-2 inset to the existing white details container and rounded its inner content, enclosing tabs/cards within one visible full-height parent panel. Existing cards, split sizing and interactions retained. Shared candidates/orphans checked: no new duplication or references. CSS parsing checked; browser visuals unavailable.

## [2026-10-26] Unify overview sections and simplify quality findings
Applied shared inset/panel treatment across Overview, Station summary and Data quality. Station rows retain status/evidence with fewer repeated colored cues and explicit flagged-day counts. Quality uses separate hourly/daily/station totals, a visible interpolation note and nonzero findings first; one disclosure reveals zero-count checks. Preserved metric icons, split layout, selections and algorithms. Followed Carbon disclosure guidance. TypeScript, 18 focused checks and CSS parsing passed. Browser visual verification remains unavailable. Shared candidates/orphans reviewed: no new module, reference removal or third duplicate behavior.

## [2026-10-26] Remove overview section tab divider
Removed only the full-width border under the right-pane tabs. Active-tab indicator retained. Shared candidates/orphans reviewed: no duplication or reference changes. CSS parsing passed; live visuals not checked.

## [2026-10-26] Separate top navigation from content
Grouped Header visually with Sidebar using --bg; moved the rounded --surface-alt treatment into shared dashboard-content on existing page bodies and the shell specimen. Removed Tickets' conflicting header override. No provider, action or scrolling changes. Shared candidates updated; no new modules or orphaned references.

## [2026-10-26] Align shared topbar with sidebar brand
Removed the obsolete top workspace margin that pushed the breadcrumb/actions below the logo after navigation surface separation. One shared CSS change covers dashboard and gallery. CSS parsing and a targeted margin check passed. Shared candidates/orphans reviewed; no new duplication or references. Live visuals not checked.

## [2026-10-26] Give inner overview tabs a quieter selected state
Replaced the local blue underline with neutral rounded fill and a subtle hover state. Main tabs keep their underline; fixed padding/weight and visible keyboard focus remain. CSS parsing passed. Shared candidates/orphans checked: no new duplication or references. Live appearance not checked.

## [2026-10-26] Remove other-stations toggle
Station summary now always renders all severity-sorted rows. Deleted obsolete disclosure state/filter/control and updated its regression check. All 13 station-review checks passed. Shared candidates/orphans reviewed: no new duplication or reference changes. Live visuals not checked.

## [2026-10-26] Combine raw and cleaned tables under Data
Added one Data main tab with a neutral Raw/Cleaned switch, default Cleaned, explanatory text and a persistent shared table. Preserved search/filter state and prevented inactive cleaned filters affecting raw-state indicators. Updated regression coverage; TypeScript and all 11 history/render checks passed. Shared candidates/orphans reviewed: existing components reused, no orphan or new rule-of-three behavior. Browser visuals not checked.

## [2026-10-26] Simplify results navigation names
Applied Overview / Data / Nearby Stations / Review Readings and updated in-app references. Text-only change; existing internal IDs preserved. Shared candidates/orphans checked: no duplication or reference changes. No runtime tests needed; live visuals not checked.

## [2026-10-26] Move flagged table and downloads into Data
Added Flagged readings data view and Open in Data navigation near review filters. Replaced full-table disclosure/dialog and footer downloads with Data's neutral portalled Export disclosure. Retained all-row reviewed export scope and loading/save guards. Updated completion guidance, regression checks and component/reference map. TypeScript, 11 checks and CSS parsing passed. Shared candidates reviewed: existing DataTable reused, no third duplicate rule. Live visuals/keyboard playback not checked.

## [2026-10-26] Move nearby stations into Overview
Reduced main tabs to three and added Nearby stations beside the persistent map. Reused station selector/list component with compact distances, shared station selection and outline-only neighbor emphasis. Kept original map fills/radii/zoom and algorithm outputs. Updated gallery and dependency map; shared candidates reviewed, no new rule-of-three duplication. TypeScript and 22 focused checks passed; live visual/interaction testing not performed.

## [2026-10-26] Refresh data table for pearl theme
Replaced heavy table framing with a white surface, compact toolbar, soft separators and readable typography. Kept existing filtering, pagination and exports. Reviewed shared-candidates: existing compact-search candidate remains; no new repeated behavior.

## [2026-10-26] Fix table source encoding
Repaired invalid Windows-1252 bytes in DataTable.tsx while preserving existing UTF-8 content. Strict encoding scan and 11 render checks passed. No reference changes or new shared candidates.


## [2026-10-26] Fix double search focus and Export sizing
Applied one shared search focus rule across the website and gallery, preserving handlers. Reused secondary medium Button for the Data export trigger.


## [2026-10-26] Refine review decision area
Added a quiet pearl footer surface, shorter heading and tighter action grouping. Shared Zones/History component; no new imports, orphans or rule-of-3 duplication.


## [2026-10-26] Implement decision-first review footer
Moved notes right, judgments left and exposed existing save dialog from unsaved review guidance. TypeScript and focused review checks passed, including local save callback/hiding after save.


## [2026-10-26] Match review filter groups to Data
Added white rounded containers and neutral inset selection to both review filter groups. Added status group semantics. No imports or orphan changes; shared-candidates reviewed, same local .filters rule handles both groups.


## [2026-10-26] Remove visible flag type label
Kept accessible group naming and High/Low filters. Removed unused CSS; no new shared candidate.


## [2026-10-26] Swap note and review actions
Moved the note before the buttons in shared ReviewActions. Existing flex sizing/handlers unchanged. No new references, orphans or shared candidate.


## [2026-10-26] Reduce upload configuration clutter
Simplified selected-file header, grouped file rows and added readable HMDAS labels while retaining full filenames. CSV column help moved into native disclosure.


## [2026-10-26] Stop review save layout jumps
Removed in-flow routine save banners and reserved changing footer action slots. Added regression coverage for stable routine status and visible errors. Shared Zones/History callers inherit the fix.


## [2026-10-26] Remove upload helper block
Removed HMDAS guidance and CSV format disclosure as requested. Updated obsolete rendering assertions; no new shared candidate.


## [2026-10-26] Compact nearby-station guidance
Replaced footer paragraphs with existing heading InfoTip. Shared-candidates checked: reused help primitive instead of another tooltip.


## [2026-10-26] Quiet map background and station labels
Softened light map tiles, made labels contextual/neutral, preserved selected label and existing data/zoom behavior. Six map checks passed; browser appearance not checked. Design reference: https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/primary-design-principles-for-cartography


## [2026-10-26] Restore map names and closer framing
Permanent neutral station labels, slightly tighter fit padding and zoom cap. Existing marker/selection/resize behavior preserved. Shared-candidates checked; no import or orphan changes.


## [2026-10-26] Replace busy light basemap with colored Alidade Bright
Switched actual tile style, removed the fade filter and retained station names/closer framing. Provider attribution updated. No new shared candidate or orphan module; local-host authorization limit documented.


## [2026-10-26] Reduce data quality panel density
Removed repeated visible check descriptions in favor of shared help tooltips; compacted rows and grouped totals. No processing/data changes.


## [2026-10-26] Color station-summary warning count red
Applied existing danger tokens to warningCount only. No behavior, reference, orphan or shared-candidate changes.


## [2026-10-26] Refine Nearby stations and Station summary
Grouped nearby selector, clarified distance hierarchy, tightened summary rows and moved repeated instructions into shared accessible help. No new state or data changes.


## [2026-10-26] Align History with Zones theme
Integrated filters with saved-run panel, labelled date range, neutralized icons/separators and added review progress. Existing search/pagination/navigation logic retained.


## [2026-10-26] Enable History sort and automatic filtering
Added server-side latest/oldest ordering and connected shared Select. Removed Apply filters; debounced search and immediate date changes update SWR filters, preserving sort and resetting page. Added UI interaction and API query/validation regressions.


## [2026-10-26] Show retained Zones results in sidebar
Added subtle success badge/dot with an accessible description, using existing ZonesContext through dashboard layout. History sort/filter tests, sidebar checks, API History tests and TypeScript passed.


## [2026-10-26] Align History toolbar controls
Grouped sort with search and dates, removed duplicate visual cues and split date controls into matching fields. Reused existing components; no new shared candidate or orphan module.


## [2026-10-26] Standardize search and date field appearance
Shared Zones-inspired field chrome across seven search surfaces; removed per-page focus mutations and duplicate date-input outlines. Preserved local widths, search handlers, native date validation and filtering.


## [2026-10-26] Fix search behavior by context
Repaired Audit general search/count/export, fetched every ticket summary page for local search, searched all Data columns, normalized station/team/library text matching, and explicitly labeled the Raw preview scope. Added interaction/pagination/query regression checks; no migration or algorithm change.


## [2026-10-26] Surface station prefix matches in Data search
Rank station prefixes before pagination so N shows Napindan first while retaining substring matches. Clearing restores source order. TypeScript and 17 focused checks passed; live browser not checked.


## [2026-10-26] Replace substring matching with prefix filtering
Reproduced N incorrectly including Mandaluyong in a failing regression, then changed shared client matching to field/word prefixes and deleted ranking. Reference: https://mui.com/material-ui/react-autocomplete/#customization . No API/schema changes.


## [2026-10-26] Match History search to visible run names
Replaced broad hidden search_text contains query with displayed-title prefix and a null-title filename fallback. Regression covers h and pre-pagination query behavior. Tickets confirmed to use shared prefix matching.


## [2026-10-26] Apply Zones prefix rules to ticket numbers
Removed exact ticket-number matching. Plain numbers and TKT/# forms use shared prefix filtering, including combined number/station queries. History numeric run-name prefixes remain supported.


## [2026-10-26] Optimize prefix-search hot path
Added blank-query and lazy-field short circuits, removed eager prefix arrays, and normalized each query word once. Reproduced unnecessary field processing with a failing regression, then passed it. Synthetic 100k-comparison benchmark improved N from 473 to 140ms and date prefixes from 444 to 97ms with identical counts.


## [2026-10-26] Simplify reading-table headers
Removed shaded band; used readable label sizing, consistent height/insets and a single boundary line in shared DataTable CSS. No table data or interaction changes.


## [2026-10-26] Apply table-header styling across the dashboard
Unified Data, History list/details, Technicians loaded/skeleton, Audit and Nearby stations column headers through .table-heading. Removed filled bands and uppercase typography while preserving alignment and behavior.


## [2026-10-26] Match History column labels to Data
Pinned matching font size, weight and label color in scoped header selectors instead of relying on differing div/th defaults. Retained History column alignment and divider.


## [2026-10-26] Compact the saved-run detail page
Limited summary width, grouped metrics beside review progress, reduced section spacing and made empty linked-ticket content compact. Retained all metadata, files, counts, downloads and ticket links.


## [2026-10-26] Simplify expanded run metadata
Grouped source files/stations beside cleaning details, removed bold filename emphasis, aligned file sizes and de-emphasized version metadata. Retained complete filenames via title, cleaning facts, stations and native disclosure.


## [2026-10-26] Separate History canvas from content width
Extended the existing workspace background to fill the page and kept centered summary cards compact inside it, removing the floating background slab.


## [2026-10-26] Integrate summary back navigation into Header
Replaced standalone All runs link with an accessible icon-only back button before the breadcrumb, reusing the saved-results pattern.


## [2026-10-26] Refine header back-button appearance
Removed square borders, increased arrow legibility/hit area and tightened breadcrumb spacing on History summary/results navigation.


## [2026-10-26] Restore All runs above the summary
Moved the summary back link from Header.leading to its original position in the content column at user request.


## [2026-10-26] Research website typography and create font comparison
Audited current font sizes, font families, density overrides, chart labels, UI Library draft behavior and text contrast. Recorded multi-source findings in docs/typography-research.md; larger 16px/14px font comparison is a planning preview, with typeface selection pending. No website implementation changes.

## [2026-10-26] Approved Roboto website typography
Applied Roboto, 16px body/14px supporting text, density-independent roles and stronger neutral text across the website. Updated shared controls, login, navigation, charts/map and local UI Library. Fixed reviewed login contrast, short-screen modal scrolling and rem defaults in preview sliders. TypeScript and all 119 component/contrast regressions passed. Initial production build completed; final compile/typecheck passed but page-data collection reported missing generated route modules. Live browser/zoom review was blocked by UI automation's URL-confidence stop. See docs/typography-research.md.

## [2026-10-26] Remove reading-list status badges
Removed visible badges consistently across all review queue filters, per user clarification. Retained accessible status text and detail-panel status. Updated the existing regression; no new component or repeated behavior.

## [2026-10-26] Restore badges in Reviewed and All only
Applied the user's refined badge rule: compact Needs review rows; visible status badges in Reviewed and All. Focused regression passed. Existing shared component reused; no new imports, orphan references or duplicated behavior.

## [2026-10-26] Darken sidebar text
Changed sidebar labels and subtitle to primary theme text instead of gray supporting roles; kept active and status colors. Reused existing tokens and component, with no new duplicated behavior.

## [2026-10-26] Fix lingering map highlights and movement
Scoped blue station emphasis to summary/nearby views, distinguished neighbors with neutral outlines, and prevented viewport resets when only reading metadata/order changes. Added selection/clear, tab, coordinate and effect-remount regressions. TypeScript and focused tests passed; live animation playback unverified.

## [2026-10-26] Add visible flagged-station glow
Added a subtle 2.4-second red halo pulse to the shared map after the user clarified that actual glow was missing. Foreground marker sizes stay fixed; reduced-motion uses a steady halo. Ten map checks, CSS parsing and TypeScript passed. Live playback unverified. Existing component/CSS reused; no new module or orphan reference.


## [2026-10-26] Station warning count visibility
Made the shared Overview station-warning count a bold solid-red circular badge. CSS parsed and six overview checks passed; live visuals unverified. Reviewed shared-candidates/orphans: no new duplication or reference changes.

## [2026-10-26] Soften station warning counter
Replaced the rejected solid red circle with a smaller soft-red rounded badge, semibold red digits and a subtle outline. CSS parsed; live visuals unverified. Existing shared-candidates/orphans reviewed: no new abstraction or reference changes.

## [2026-10-26] Remove sidebar section label
Removed Workspace from expanded navigation. Branding recommendation only: keep logo/name, omit subtitle. Reviewed shared-candidates and orphans: no new duplication or reference changes. Cosmetic deletion only; no runtime tests run.



## [2026-10-26] Optimize History opening and simplify sidebar branding
Measured warm database reads, reused listed metadata for immediate summaries, skipped known-empty ticket requests, and prefetched immutable results on link intent. Replaced repeated aggregate existence checks with id-only reads and narrowed response columns. Removed sidebar subtitle per user request. TypeScript, 26 backend and 52 frontend checks passed; live database read verification performed, browser end-to-end timing not measured. Shared-candidates/orphans reviewed: existing hooks/components reused, no new module or rule-of-3 candidate. No migration or database write.

## [2026-10-26] Enlarge sidebar logo and match navigation icon colors
Increased the mark from 36px to 44px in both modes and matched nav icons to text, including selected and hover states. Existing component/tokens reused; shared-candidates and orphans checked, with no reference or rule-of-3 changes. Cosmetic change; live browser appearance not checked.


## [2026-10-26] Reduce sidebar navigation size
Reduced labels to the existing 14px font-xs role and icons to 18px in both modes. Retained branding sizes, row hit areas and matching colors. Shared-candidates/orphans checked: no new repetition or reference changes. Cosmetic-only; live browser appearance not checked.


## [2026-10-26] Plan familiar Tickets workspace revamp
Reviewed the supplied screenshot, ticket list/detail/dock/review code, lifecycle, SWR hooks, status mappings and Zones styling. Saved docs/TICKETS_WORKSPACE_PLAN.md with layout, information hierarchy, state/action rules, typography, colors, responsive behavior and verification criteria. Planning only; no application code or live data changed.


## [2026-10-26] Revert Tickets workspace redesign
Restored the prior Tickets UI and actions at the user's request; retained existing search, typography, theme and pagination work. Removed the temporary Tickets stylesheet and redesign-only state/hooks. Checked shared candidates and orphan references.


## [2026-10-26] Refine Tickets without adding navigation
Implemented the user's selected existing-layout cleanup: clearer queue rows, shared filters/counts, quiet ticket-only selection without blue streak, calmer metadata/section hierarchy and a single dock control. Retained original search/selection/lifecycle/confirmations/assignment/review behavior. Removed unused dock animation CSS; aligned skeletons. 37 component/search checks, TypeScript and CSS/token checks passed. Browser visuals and live mutations not exercised.

Final Tickets review: fixed a short-screen clipping risk by making the dock shrink within 55% of its detail pane instead of using a viewport-height limit. Four targeted ticket checks, CSS parsing and TypeScript passed after the correction.


## [2026-10-26] Make ticket management control easier to recognize
Added a subtle inset background and stronger icon/chevron to the existing dock toggle. Presentation-only; expansion/actions unchanged. CSS parsed and focused dock regression passed. Shared-candidates/orphans checked: no new behavior or references.


## [2026-10-26] Correct ticket dock background blending
Replaced the rejected gray fill with surface white and a visible neutral outline; strengthened the icon and dark chevron. Pure CSS, no new references or shared candidates. CSS parsing passed; browser appearance unverified.


## [2026-10-26] Integrate ticket dock with the detail panel
Removed the rejected framed full-width toggle and icon tile. Reused secondary Button for Manage/Review beside a flush Assignment/Inspection review footer. Focused dock regression, CSS and TypeScript checked; browser visuals unverified. No new references/orphan modules or shared extraction candidates.


## [2026-10-26] Clarify ticket report hierarchy
Grouped identity/date facts into one quiet band; strengthened main section headings and added subtle inter-section separators. Placed current inspection before assignment history and retained all report/evidence/action content. The new named-section/order test failed first, then all 32 component checks, CSS parsing and TypeScript passed. Existing modules reused; no orphan/reference changes. Live browser appearance unverified.


## [2026-10-26] Slim ticket queue; plan report density
Removed technician identity from left queue rows and combined station/time into one final line; tightened row spacing and loader. Existing assignment/detail/log identities retained. New queue regression was observed failing before implementation. Wrote a proposed report-density/reading-order plan; no right-pane changes applied in this step.


## [2026-10-26] Balance ticket rows and add faint separators
Restored moderate row spacing, moved update time beside ID/status to free station space, and added the requested faint line between tickets. Names remain absent; title/status/priority/time and interactions retained. Queue placement test observed failing before the change. No new runtime references or shared-candidate/orphan changes.


## [2026-10-26] Clean ticket separator corners
Replaced touching full-width row borders with inset decorative separators and a minimal gap from rounded selection fills. Shared-candidates/orphans unchanged: CSS-only existing module. CSS parsing checked; live browser appearance unverified.


## [2026-10-26] Revert separator spacing; clip only the excess
Restored faint border separators without added gaps/inset pseudo-elements. Rounded wrapper clipping trims the corner excess. CSS-only existing module; no orphan/shared-candidate changes. CSS parsed; live appearance unverified.


## [2026-10-26] Remove curved separator shape
Deleted wrapper rounding/clipping; retained only the plain 1px divider between tickets. CSS-only correction, no new references/candidates. CSS parsed; live appearance unverified.


## [2026-10-27] Shorten only ticket divider ends
Cut visible line endpoints back by --r-lg while preserving the original border height and all row spacing. No curved borders or wrapper shapes. CSS-only existing module; no reference/shared-candidate/orphan changes. CSS parsing checked; live appearance unverified.


## [2026-10-27] Apply ticket report density plan
Replaced oversized information bands with compact context/notices and grouped historical sections below current evidence. Exact dates retained; timestamp ages moved to tooltips. Tightened field/timeline gaps and skeleton. Grouping/notice tests failed before implementation and passed afterward; source review found no material issue. CSS/token and TypeScript checks passed; live browser unavailable.

## [2026-10-27] Ticket technician icon
Added the existing Users icon to the assignment Manage button; retained the control size and inherited text color. Checked shared candidates and orphan references; no new modules.

## [2026-10-27] Assigned avatars beside Manage
Replaced the newly added button glyph with existing technician initial avatars next to the button, per the user reference. Shared candidates/orphans checked; existing helper reused.

## [2026-10-27] Improve ticket detail readability
Restored clearer fact alignment, compact badges, date/time hierarchy, follow-up notice and section spacing using current theme tokens and the supplied old-layout reference. Retained History/evidence/actions. TypeScript and 35 render checks passed; no live visual check. Shared/orphan references reviewed.

## [2026-10-27] Indent ticket detail content
Added the approved small content indent beneath description/inspection/activity headings; retained fact-panel and heading alignment. Existing local helpers/CSS reused; no new modules.

## [2026-10-27] Fix missing ticket indentation
Found undefined --space-3; used the existing 8px + 4px primitives for indentation and section-heading padding. Spacing regression failed before the fix and all five theme checks passed afterward. No new modules/shared candidates/orphans.

## [2026-10-27] Increase ticket content indentation
Set the existing prose/activity inset to 24px per the user clarification; headings unchanged. No new modules or dependencies.

## [2026-10-27] Color priority badges
Updated the shared priority presentation to green Low, amber Medium and red High. Existing theme-aware badges reused; shared candidates/orphans checked, no new modules.

## [2026-10-27] Remove queue priority text
Removed High priority from ticket rows and its unused class at the user request; retained the filter and detail badge. Shared/orphan references checked.

## [2026-10-27] Stabilize ticket updates and controls
Fixed spinner-driven button width changes, animated ticket form entrances, delayed assignment-prompt cleanup, cross-ticket stale data, and review expansion carrying into management. Kept cached background content and guarded first detail render until report/files load. Added seven transition/cache/draft regressions; shared UI, theme and History render checks passed. Browser motion inspection unavailable (Work browser setting disabled). No API/mobile changes.

## [2026-10-27] Retire the unused local UI Library
Removed the development-only editor/preview routes, design catalogue/styles/specimens, fake API, gallery-only tests, unused Card family and library-only docs/scratch notes. Removed preview auth/framing exceptions, inert primitive attributes, alternate Sidebar storage option, raw context exports and chart override hooks while retaining operational behavior/colors. Moved shared regression data into web/tests/fixtures.ts and retained 13 feature render checks as components-render.test.cjs; History/Overview/ticket tests no longer depend on application preview code. Updated current map/setup guidance and rechecked shared candidates/orphans: all 36 remaining component modules have runtime callers; no new shared abstraction is needed. TypeScript, 117 web checks, diff whitespace checks and clean Turbopack production builds passed. Isolated production HTTP checks confirmed login 200, six protected entry routes redirecting to login, removed library routes 404 and DENY framing. The first shared build collided with a concurrent development server's output; restored that verified server with a fresh generated cache and confirmed development login 200/protected redirect. Removed temporary verification copy/build. No API/mobile/dependency/database changes made by this cleanup; unrelated existing edits and performance snapshots retained. Authenticated live API workflows were not retested; nothing deployed.

## [2026-10-27] History and shared realtime performance
Fixed demonstrated SSE idle subscription cancellation in the shared broker and deduplicated SSE/REST cookie refresh. Reduced initial History result work with existing Next/SWR facilities, immutable-cache-aware prefetch and deferred exports/tabs. Added behavioral regression tests; 118 frontend and 54 backend checks plus TypeScript pass. Isolated History bundle comparison 299→148 kB first load. Intermittent development stall cause remains unconfirmed; browser automation unavailable. Reviewed shared candidates/orphans; no dependency, migration or algorithm changes.

## [2026-10-27] Keep sidebar logo anchored on toggle
Matched brand slot dimensions and offsets in Sidebar, removing expanded-only padding. Existing 13 component render checks and TypeScript passed; production dashboard rebuilt for local use.

## [2026-10-27] Familiar sidebar toggle icons
Replaced chevrons with standard panel open/close icons from installed Lucide, preserving sizes, state and accessible labels; added native hints. Existing 13 component checks and TypeScript passed.

## [2026-10-27] Local production startup guidance
Documented API-first startup, dev versus production web commands, and avoiding simultaneous builds/dev writes to .next. Concurrent production builds caused missing generated manifest/page files during icon delivery; stopped the conflicting project build and cleared only generated output before rebuilding.

## [2026-10-27] Isolate development manifests from production builds
Traced repeated _buildManifest.js.tmp ENOENT to the live dev server sharing .next with production output; installed Next build clears that directory. Added development-only .next-dev output and Git exclusion; production build/start retain .next. Excluded dev cache globbing after review demonstrated stale validators could break later builds; direct route declarations remain available through next-env.d.ts. The directory-isolation regression failed before and all three config/security checks passed after; TypeScript and a production build passed while the existing development server served Zones, History and its manifest successfully. Updated infrastructure map/known-bug guidance. Shared candidates/orphans reviewed: existing config/test entry points, no new modules or duplication. No dependency/API/mobile/database changes; authenticated API workflows and browser interaction untested.

## [2026-10-27] Remove result-tab selection animation
Removed shared tab underline/color transitions and panel entry fade. Preserved selected state, accessible tab associations, content mounting and all handlers.

## [2026-10-27] Stable page-panel geometry and deployed map authentication fix
Unified main background-panel inset and constrained scroll geometry across dashboard routes; removed page fade and kept Audit corners clipped. Restored the original OSM light basemap after reproducing Stadia HTTP 401 with the hosted referrer; replacement tile returned HTTP 200 PNG. Updated the regression to fail on the unauthorized provider. No credentials, dependencies, schemas or detection algorithms changed.

## [2026-10-27] Build and evaluate synchronized local synthetic rainfall data
Added a separate eight-station hypothetical QC-area fixture, with matching September 1-30, 2023 hourly coverage, predefined fault labels and valid localized weather controls. Ran the actual HMDAS conversion and unchanged Zone A/B/C service: 240 assessed rows, no exclusions/interpolation; TP12/FN4/FP7/TN217. Saved full paired comparisons, separate high/low matrices, predictions, errors, spatial distances, versions and hashes plus reproduction/thesis guidance. Fixture assertions and all 15 existing zone-quality checks pass. Preserved the older fixture, algorithms, user edits and database. Reviewed shared candidates/orphans: second manual fixture, no new rule-of-3 refactor. Browser upload and real-data diagnostic accuracy are not established by this local service evaluation.

## [2026-10-27] Complete confusion matrices and controlled testing
Preserved the local fixture/labels and completed 22 extended check groups, 7 local HTTP cases and all 54 backend regression tests. Added repeat/order checks, 11 quality variants, independent metrics, subgroup breakdowns and full logs. Fresh-process/order runs reproduce all scores/flags; warm jitter changes scores but no classifications. Date mismatch explicitly leaves 120 rows unassessed. Produced and visually checked all five report pages plus four standalone matrix figures; retained all four missed faults and seven false alarms. Added reproduction and thesis discussion guidance. Rechecked shared candidates/orphans; no production code, thresholds, real data or database state changed. Browser UI, real authentication, production/mobile operation and independently labeled historical accuracy remain outside this synthetic evaluation.

## [2026-10-27] Reorganize controlled evaluation into editable IMRaD Word document
Created Rainfall_Anomaly_Evaluation_IMRaD.docx from existing evidence using bundled python-docx. Main headings are exactly Introduction, Methods, Results and Discussion; ten native Word tables retain all four confusion matrices, formulas, metrics, input/HTTP checks and eleven disagreements. Reopened OOXML and independently matched matrix counts to recorded JSON; no test reruns or measurement/label changes. Reviewed map/shared/orphan references and refreshed the fixture package checksum inventory. Canonical render_docx.py failed because LibreOffice soffice.exe is absent; the runtime has no bundled LibreOffice, installed Word registration or connected document session. Final Word page layout and official school-specific styling remain unverified. Existing PDFs, archives and production code remain unchanged.

## [2026-10-27] Simplify the IMRaD evaluation document
Created a separate plain-language Word version using the existing builder: one combined confusion matrix, four metrics with meanings, a short procedure and concise interpretation. Preserved the exact counts/metrics, false alarms/misses and synthetic-data limits; retained detailed documents and supporting evidence. Reopened and checked four main headings, two editable tables and recorded values. No pipeline rerun or production changes. Reviewed shared/orphan references; no new entry point. Native layout rendering remains unavailable.

## [2026-10-27] Retain Science Garden RIDF reference for detector improvements
Saved the user's PAGASA Science Garden image and a short interpretation note with selected 24-hour depths, source provenance, duration/unit checks and station-specific scope. Distinguished rare rainfall from measurement error; retained the existing synthetic labels and measured results. Reviewed shared/orphan references: documentation-only reference, no production module or duplicated behavior added. Image authenticity and RIDF accumulation-window equivalence remain unverified.

## [2026-10-27] Improve Zone C with measured rainfall differences and partial-low screening
The user explicitly authorized changing Zone C, superseding the earlier freeze for this task; preserved Zones A/B. Planned and archived the baseline before comparing development candidates, rejected a stricter trial that lost a detection, froze separate validation before selection, and implemented 5 mm/30% neighbor-excess checks plus partial deficits above 1 mm. Replaced advancing random jitter with canonical deterministic offsets. The exact 22.7 mm case now passes. Development TP12->13/FP7->3; separate validation TP19->24/FP13->11. Low validation false alarms rise 2->6 while five additional low faults are caught; all changed cases and remaining errors are retained. Added 13 meaningful Zone C/API regressions and passed all 67 backend tests, including original daily arithmetic. RIDF depths are used as coherent-rain controls rather than fault limits. Updated current architecture/rules and historical-reproduction warnings; shared/orphan references checked. No schema, dependency, frontend/mobile, database or algorithm A/B changes. Saved reports/history remain baseline; fresh runs use updated flags. Independent real-data labels and signed-in browser/deployment validation remain outstanding limits.

## [2026-10-27] Preserve evaluation evidence bytes for Git
Added narrowly scoped attributes after Git staging revealed autocrlf normalization changing the hashed CSV uploads and treating the PDF as text. Preserve both evidence folders byte-for-byte, mark the PDF binary and keep the three hashed source/plan files LF. Verify staged blobs against saved evidence before committing; no new runtime behavior or repeat application tests needed.

## [2026-10-28] Long-running detection reliability and native thread overhead

Removed client poll-count expiry while a job is processing, added bounded retry backoff and terminal status handling, retained accepted job ID through fallback, made waits cancellable and cleaned fetch abort listeners. Removed unverified cold-start rerun advice and protected running tabs against accidental unload. Native thread microbenchmark: 50 tiny LOF fits took 1.657s unrestricted versus 0.024s limited; service now limits/serializes only the existing detector invocation without changing algorithms. Shared-candidates reviewed: client status errors and retry handling each remain centralized; no new rule-of-3 candidate. Full-dataset and suite verification follows.

Full four-file/three-year local comparison (2,317,133 bytes, 4,336 daily rows): unrestricted native threads 62.519s; limited 43.780s (about 30% faster), with exact equality of scores, flags, cleaned readings, quality and station summaries. 139 frontend tests, TypeScript and production build pass. Full backend discovery ran 76 entries: 75 passed; test_zone_c_analysis cannot import analyze because its unrelated experiment source is absent in the working tree. Vercel MCP connected and verified production READY at f5803af; recent Zones logs empty, not evidence of backend health. Backend processing logs still require Render access.

Async HTTP flow verification: actual FastAPI routes with analyst dependency overridden in an isolated test process accepted four files with HTTP 202 in 0.021s, remained responsive to health/job reads, and returned 4,336 daily rows/four stations in 53.190s with history_saved=false. This used the actual pipeline and no database writes; browser/live Render verification is not claimed. Final React review confirmed existing processing guard/controller identity and unload-listener cleanup are preserved. No deployment or unrelated worktree changes were committed by this task.

Render verification (2026-10-28): workspace tea-da688ov10e5c73eh7om0 and single Singapore Free API srv-da68b3nqj5pc73eslg30 confirmed by user/discovery. Live source is f5803af; auto-deploy on main is enabled. Native metrics show CPU capped at0.15 and reaching that limit during the21:30–21:35UTC processing window, with memory around244MB of536.9MB. Upload was accepted21:29:54UTC and polling stopped21:33:56UTC while CPU remained busy afterward; no OOM/restart event was returned for that window. Recent direct uploads also returned401. Status-based upload fallback now clears a rejected cached direct token and uses the existing cookie/refresh path; added red/green regression. Router/service diagnostic loggers now inherit Uvicorn's configured INFO handlers so job start/done and stage-memory records appear in production. No hosting-plan or worker-count changes.

Isolated detection-only release verification: exported staged API/web source excluding pending algorithms, UI and experiments; all130frontend and70backend tests pass, including original four-CSV quality verification. Production build passes; only temporary export config set Turbopack root to allow shared dependency junction. No production configuration change.

## [2026-10-28] Remove failing hosted-font build dependency

Vercel8cc68ce failed with36Turbopack next/font/google Roboto query errors, confirmed via authenticated CLI build logs. Releasing the prior user-authorized bundled-font fix through next/font/local with the exact deployed Latin font bytes/licenses; component sizes/weights remain unchanged. This resolves the discovered release blocker without including pending skeleton/data/algorithm work. Shared candidates rechecked: font ownership stays in root layout.
