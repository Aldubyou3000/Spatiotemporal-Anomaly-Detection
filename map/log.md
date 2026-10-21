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
