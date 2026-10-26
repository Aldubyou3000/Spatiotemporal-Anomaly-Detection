# Component: Web state & data (`web/src/context/`, `web/src/hooks/`, `web/src/lib/api/`, `web/src/types/`, `web/src/lib/`)

The data layer for the analyst dashboard: React Context for cross-navigation state, **SWR** for all server data, raw fetch wrappers under `lib/api/`, and the canonical presentation modules. Layer rule: **pages call hooks, never `lib/api/` directly**.

## Context providers (`web/src/context/`)
| Context | Holds | Notes |
|---------|-------|-------|
| `AuthContext.tsx` | `user`, `loading`, `logout()` — redirects to `/login` on failure | Outermost in dashboard layout |
| `ThemeContext.tsx` | `theme`, `setTheme()` — persisted to `localStorage`, written to `data-theme` on `<html>` | |
| `ZonesContext.tsx` | Pipeline files, `running`, persistent request `abortRef`, `result`, run-scoped analyst `reviews` / `setReview`, `error`, `configOpen`, and `resetSession()` | **Local computation, not server data** — do not SWR-ify; replacing/resetting a result atomically clears reviews |

## SWR hooks (`web/src/hooks/`)
One file per domain. Cache keys are the contract — matchers in `useRealtimeSync` mirror them.

| Hook file | Exports | Key conventions |
|-----------|---------|-----------------|
| `useTickets.ts` | `useTicketList`, `useTicketDetail`, `useTicketReport`, `useTicketAttachments`, `invalidateTicketLists`, `invalidateReports` | List key `/api/tickets`; detail `/api/tickets/{id}`; etc. |
| `useTechnicians.ts` | `useTicketTechnicians` (summary, **shared key** across Tickets + Zones), `useTechnicianProfiles` (full, Technicians page) | |
| `useReports.ts` | `useReports` | |
| `useAuditLogs.ts` | `useAuditLogs` (paginated), `useAuditStats` | |
| `useRealtimeSync.ts` | Mounts the single `EventSource` → `globalMutate(keyMatcher)` | See [web-realtime.md](./web-realtime.md) |

Mutation pattern: call API directly → `mutate()` or `invalidateTicketLists()` → no manual `setState` for server data.

## Raw fetch wrappers (`web/src/lib/api/`)
One file per domain (`auth`, `zones`, `tickets`, `reports`, `technicians`, `audit`), **all through `client.ts`**:
- `client.ts` — base fetch: `credentials: "include"` via `apiBase()` (`vercel.app` → `window.location.origin` → same-origin proxied; localhost → `NEXT_PUBLIC_API_URL`), sends `X-CSRF-Token` from the `csrf_token` cookie on mutations, **silent refresh on 401** (single-flight, retry once), then throws. Also exports `setDirectToken`/`getDirectToken`/`DIRECT_BASE` for zones 4-file bypass. Parallel to `App/services/api.ts` on mobile (cookie vs Bearer — see [shared-candidates.md](../shared-candidates.md) §3).
- `auth.ts` — `login`, `logout`, `me` (refresh handled internally by `client.ts`).
- `tickets.ts` — `list`, `get`, `create`, `listTechnicians`, `assignTechnicians`, `removeTechnician`, `requestFollowUp`, `cancelTicket`, `attachments`, `uploadAttachment`, `report`, `downloadPdf`.
- `reports.ts` — `list`, `approve`.
- `technicians.ts` — `list`, `create`.
- `audit.ts` — `list`, `stats`, `exportUrl` (chain `verifyIntegrity` removed — no UI consumer).
- `zones.ts` — async upload for all selected files, then `pollJob`: up to 120 attempts, a 1.5-second delay plus request time per attempt (not a hard 180-second deadline). On Vercel, `ensureDirectToken()` requests `/api/auth/direct-token` when necessary, then uses Bearer direct upload/polling; cookie/proxy and legacy sync fallbacks remain. Polling retries transient failures; a missing job surfaces as an error. See [api-zones.md](./api-zones.md).
- `cn.ts` — classname joiner.

## Types (`web/src/types/`)
TypeScript interfaces mirroring backend Pydantic schemas (`auth`, `tickets`, `reports`, `technicians`, `zones`). Shared across components, hooks, and api.

`zones.ExclusionDetails.incomplete_days` is optional on the web (defaults to zero in the view) for older API results; the backend schema defaults it to zero. `QualityReport.rows_filled` counts hourly estimates before daily exclusion, not retained daily rows. See [api-zones.md](./api-zones.md).

## Canonical presentation (`web/src/lib/`)
| File | Role |
|------|------|
| `ticketStatus.ts` | **Single source of truth** for ticket status/priority labels, badge tones, sort order, `TERMINAL`/`NEEDS_REVIEW` sets. Import from here, never re-declare inline. Parallel exists at `App/constants/ticketStatus.ts` (see [shared-candidates.md](../shared-candidates.md) §4). |
| `csv.ts` | CSV helpers (likely for client-side preview/parse). |
| `technicianWorkload.ts` | Workload signal computation for badges. |

## Depends on
- `swr`
- Backend `/api/*` endpoints (each hook maps to one domain router)
- `components/providers/RealtimeProvider` (consumes `useRealtimeSync`)

## Depends on it (reverse)
- Every `(dashboard)` page composes hooks + components from these modules.
- `lib/ticketStatus.ts` is imported by the Tickets page, Reports page, and `TicketDetailBody`/`TicketActionDock`.

## Key invariants
- UI Library editor/preview state was removed on 2026-10-27. AuthContext and ThemeContext objects are private again; operational providers and hooks retain their behavior. Test-only sample data lives in `web/tests/fixtures.ts`, outside application source and bundles.
- **Pages use hooks, not `lib/api/`.** Bypassing hooks breaks real-time (the SSE matcher won't know the cache key) and optimistic update patterns.
- **Cache keys are the real-time contract.** Adding a new SWR key requires a matching matcher in `useRealtimeSync.ts` or live updates silently miss it.
- `useTicketTechnicians` deliberately shares one SWR key across the Tickets and Zones pages — don't fork the key or the workload badges on Zones and the assignment dropdown on Tickets will disagree.

## Open questions / debt
- `useRealtimeSync` debounces the `audit` resource ~1.5s client-side to absorb bursts. Other resources are not debounced — a rapid burst of ticket updates could trigger many revalidations. Currently fine given low concurrency.

## Station review presentation helper (2026-10-22)
`lib/stationReview.ts` owns the four review status labels/tones, overall high/low priority, and short visible guidance with detailed evidence in tooltips. Used by overview, report, and map; normal is neutral and missing assessments are insufficient. Existing API status strings are preserved, so no response migration is required. `types/zones.ts` documents strictly-highest frequency and assessed-rainy-day runs. Frontend checks: `node tests/station-review.test.cjs` from web/.

## Pipeline activity (2026-10-22)
Superseded visual stage simulation with real `PipelineProgress` snapshots in ZonesProvider. `zonesApi.process` forwards owner-authenticated job-poll progress through an optional onProgress callback; the page accepts it only for the current non-aborted controller. The diagram derives completed/current/waiting states directly from server stages, with active station IDs. New runs begin preparing; Stop/reset/final cleanup clear progress. `abortRef` lives in ZonesProvider so Stop still targets browser requests after navigation; it does not cancel the API job. Page success/error/finally handlers check controller identity so cancelled requests cannot alter a later run. New runs clear the previous result immediately. Older synchronous responses remain compatible, with indeterminate activity until results arrive.

## Human review state and downloads (2026-10-24)
- `lib/anomalyReview.ts` owns station/date JSON keys, `AnomalyReview` / `AnomalyReviews`, decision labels, high/low queue selection, next-pending navigation, and `exportReviewedReadings`. It never changes rainfall, LOF, or system flags.
- Reviews record `anomaly` / `not_anomaly`, optional note, reviewer ID/name, and UTC timestamp. Absent review means `needs_review` only for a flagged reading; export uses `not_flagged` for other rows, which is not a sensor-accuracy assertion.
- ZonesProvider stores `{result, reviews}` together; `setResult` and Reset clear reviews atomically. `setReview` accepts only flagged keys in the current result. Data survives dashboard navigation, not refresh/logout/provider unmount. No database writes, shared review history, retraining or audit events were added.
- A browser beforeunload handler warns while reviews exist; the Zones page confirms before changing files or rerunning, and its Reset dialog names review loss. Download is the retention mechanism. The repeated run-retention paragraph in the report was removed at the user's request; the guards remain.
- Results CSV exports all station-days with review columns. The collapsed flagged-only table exports both high/low cases with the same metadata, including dismissed and pending rows. Cleaned CSV remains unchanged. `lib/csv.ts` now escapes formula-like text (including analyst notes) and carriage returns while keeping numeric rainfall numeric.
- Checks: `node tests/anomaly-review.test.cjs` and `node tests/station-review.test.cjs` from web/. The latter renders the real report with CSS modules stubbed only for server rendering.
- Report-local Undo state survives automatic advancement. Its button is beside the decision buttons (or completion actions), replacing the former banner above the panel. It restores the exact prior review record (or clears it), returns to that station/day and direction, and resets text/station filters so the restored reading is visible. No additional persistence was added.
- The report's local `showHistory` selects one graph without changing the selected station-day, reviews or export data. Restored local `reviewFilter` handles Needs review / Reviewed / All independently from High / Low; advancing resumes Needs review, and Undo returns to the appropriate review tab.

## Persistent History (2026-10-25; supersedes session-only review retention above)
The active pipeline result remains local in ZonesContext, but successful API responses now reference a permanent saved run. lib/api/history.ts and hooks/useHistory.ts provide SWR list/detail/result/review/ticket queries. Both Zones and reopened saved results use useHistoryReviews; server revision, actor and time govern saves. Failed/stale writes leave decisions intact, reload reviews and show an error; controls advance/toast only after acknowledgment. A saving lock blocks duplicate writes and beforeunload protects in-flight saves. Undo checks the applied revision before reversing it and records a new server-authenticated change. Results exports wait for saved reviews to load/save. Legacy results without run_id retain the local fallback; new unsaved results stay downloadable and offer server-side retry, with review/ticket creation unavailable until saved. Reset/file changes/rerun warn about unsaved results; saved runs remain in History.

History retry safety: setResult accepts an optional expectedRunId; a late Retry saving response cannot resurrect a reset run or replace a newer run. A regression check covers both cases.

Concurrent confirmation fix: ReviewActions captures the note and save handler at confirmation opening. Its handler retains the SWR revision snapshot; a live update while the dialog is open cannot upgrade that baseline and overwrite another analyst silently. Dirty note drafts survive incoming saved-note changes. history-render.test.cjs reproduces the two-render confirmation race.

Live-update selection stability (2026-10-25): AnomalyReportTab now pins its initial reading key so an SSE-driven review update cannot replace the selected editor through the pending-list fallback. Its draft survives the review's status changing elsewhere; confirmed writes still use the captured revision handler. Explicit filters/Skip/save/Undo control subsequent selection. See web-pages-components.md for queue scrolling and stable action geometry.

## Manual save coordination (2026-10-25)
ZonesContext now holds saveRequest/leaveRequest plus requestSave/guardUnsaved/cancel methods. A single RunSaveController under ToastProvider coordinates title entry and Save/Discard/Keep working; useSaveHistoryRun performs explicit API mutation, blocks double saves, keeps failures visible and invalidates History only on success. Save before ticket creation resumes the original action only after acknowledgment. Existing run-ID guard prevents late responses replacing another run. Unsaved resets/reruns/file changes and internal anchor navigation are guarded centrally; beforeunload remains native. Saved results continue using server-backed useHistoryReviews; new unsaved runs remain previews until saved.

## Zones view composition (2026-10-25)
No new durable process state: running/result select processing/results/setup. Existing configOpen now controls the result configuration dialog; setup always displays configuration. Merely opening/closing leaves result/reviews untouched and CurrentResults mounted. Approved file changes invalidate the old result, accepted reruns clear it on start, and global leave/save requests temporarily suspend the configuration dialog so confirmations retain priority. Stop preserves files and abort-controller identity checks reject late responses. Process errors return to visible setup with retry/error retained. No API, provider persistence or review revision semantics changed. See docs/ZONES_WORKSPACE_PLAN.md and tests/zones-workspace.test.cjs.

## Non-destructive dashboard navigation (2026-10-25)
guardUnsaved accepts an optional allowContinue flag stored on leaveRequest. RunSaveController sets it only for links within the shared dashboard routes (Zones, History, Tickets, Reports, Technicians, Audit). Their reminder offers Continue without saving; continuing navigates without resetSession, so files/result/reviews remain in ZonesContext. Keep working cancels navigation; Save proceeds only after persistence succeeds. Destructive replacements/reset and links leaving the shared provider retain save/discard behavior. Browser refresh/close protection remains native; the run is still memory-only until saved. No browser storage or automatic save introduced.

Reminder wording update (2026-10-25): safe continuation is now labeled Don’t save and cancellation Cancel, following the familiar unsaved-document pattern. The shorter labels change no behavior: Don’t save retains the session run, while Discard remains the destructive-replacement label. Save remains acknowledgment-gated and keeps failure feedback.

Navigation reminder scope correction (2026-10-25): the global click handler checks the current pathname at click time and only prompts when leaving /zones. Retained unsaved runs no longer cause reminders while browsing History records, Tickets, Reports, Technicians or Audit. Returning to Zones restores its leave reminder. Session retention, destructive guards and native unload protection are unchanged.


Review feedback geometry (2026-10-26): routine ReviewSaveStatus announcements are sr-only across loading/saving/saved; errors remain visible. Persistence/revision handling is unchanged.


History sorting/filter flow (2026-10-26): HistoryFilters now includes latest/oldest sort; historyApi passes it in the list query and existing SWR key includes the complete filter object. Page debounce updates query state only (fetching remains in useHistoryList). Dates/sort apply immediately; query changes reset offset.


Search completeness (2026-10-26): ticketsApi.listAll follows existing 100-row pages inside the SWR fetcher, so the board search/filter counts include tickets beyond the first 50. Empty pages stop pagination and errors propagate. Existing cache keys/invalidation remain. AuditFilters.search is shared by list/export. matchesSearch is a presentation-only helper imported by table/review/board/team/library.


Search normalization (2026-10-26): lib/search.ts exports normalizeSearch for shared matching and table ranking. Same case/space/underscore/hyphen handling applies to relevance ordering.


Search correction (2026-10-26): normalizeSearch is private again; matchesSearch compares prefixes of whole field values and word tokens. No substring fallback or ranking. Server History/Audit retain their existing endpoint semantics.


Ticket search (2026-10-26): lib/search.ts adds matchesTicketSearch with typed ticket fields and optional TKT/# prefix stripping; Ticket page uses it directly. Number prefixes are strings through matchesSearch, no exact Number conversion. Both helpers are covered by search.test.cjs.


Search hot path (2026-10-26): removed eager flatMap/map construction for every row. Query normalization is outside field comparisons; lazy field/word matching avoids unused values. Public signatures, numeric prefixes and token semantics are retained.


History navigation cache (2026-10-26): useHistoryList exposes selectRun to seed the clicked run's summary in the provider-scoped SWR cache without overwriting an existing entry. useHistoryRun revalidates on mount while the page retains cached content. useHistoryTickets supports disabled reads and forbids previous-run data; summary disables it only for known zero ticket counts. useHistoryResults supports opt-in prefetch using its existing immutable key, shared with the results page. Reviews remain independently loaded/versioned rather than prefetched.

Priority badge colors (2026-10-27): canonical PRIORITY_TONE now maps low=success (green), medium=warning (amber), high=danger (red). Existing TicketDetailBody consumes the shared mapping and theme-aware Badge. Status tones/order are unchanged.

Ticket cache stability (2026-10-27): ticket list/detail/report/attachment hooks set keepPreviousData=false per key, preventing another ticket or filter's data from briefly appearing. Same-key cached data remains during revalidation; board skeletons apply only without usable data, and detail waits for initial report/files. Cache key shapes and SSE invalidation are unchanged.

## History performance (2026-10-27)
`usePrefetchHistoryResults` starts SWR preload directly on navigation intent, first checking the provider cache for the immutable snapshot. Repeated intent shares the pending preload; revisits reuse cached results. Summaries/reviews still revalidate. `client.ts` exports its existing `refreshSession` for SSE and REST to share one in-flight rotation.
