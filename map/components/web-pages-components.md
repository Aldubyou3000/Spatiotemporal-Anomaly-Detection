# Component: Web pages & components (`web/src/app/(dashboard)/*`, `web/src/components/`)

The analyst-facing feature pages and their component building blocks. Pages compose components and call hooks; components are props-only (no direct API calls). Grouped here because the page↔component pairing is the unit of editing.

## Pages (`web/src/app/(dashboard)/`)
| Page | Role | Primary hooks | Notable components |
|------|------|---------------|--------------------|
| `zones/page.tsx` | CSV upload + pipeline results (tabs) | `ZonesContext` (local), `useTicketTechnicians` (workload) | `FileUpload`, `PipelineDiagram`, `OverviewTab`, `StationMap`, `StationChart`, `DataTable`, `NeighborGroupsTab`, `AnomalyReportTab`, `DateComparisonChart` |
| `tickets/page.tsx` | Split-view ticket board | `useTicketList`, `useTicketDetail`, `useTicketReport`, `useTicketAttachments` | `TicketDetailBody`, `TicketActionDock` |
| `reports/page.tsx` | Inspection reports + approval | `useReports`, `useTicketDetail` | `TicketDetailBody` (shared with tickets), `ReviewPanel` |
| `technicians/page.tsx` | Manage technician accounts | `useTechnicianProfiles` | Create-tech modal (`Modal` + `ConfirmDialog`) |
| `audit/page.tsx` | Audit log + filters | `useAuditLogs` | CSV export |

## Components (`web/src/components/`)
| Group | Files | Role |
|-------|-------|------|
| `ui/` | `Badge`, `Button`, `Card` (`CardHeader`/`CardTitle`/`CardBody` — available primitive, currently unused), `ConfirmDialog`, `Input`, `Modal`, `Skeleton` (`TicketRowSkeleton`, `TechRowSkeleton`, `AuditRowSkeleton`, `DetailSkeleton`), `Tabs`, `Toast`, `SentinelMark` (brand mark; chevron variant removed) | Generic primitives — props-only, no API calls. All destructive/consequential actions must go through `ConfirmDialog`. Currently guarded: logout, ticket status advance, technician reassign, report approval. |
| `dashboard/` | `Sidebar`, `Header`, `PageTransition` | Shell chrome. Sidebar nav uses `.nav-item` utility class with `data-active` for brand highlight. |
| `providers/` | `RealtimeProvider` | See [web-realtime.md](./web-realtime.md). |
| `zones/` | `FileUpload`, `PipelineDiagram`, `OverviewTab`, `StationMap` (free `tile.openstreetmap.org` light + `Esri World_Dark_Gray_Base` dark, no key; flagged `10px` red + dual halo `20/14px` vs typical `5px` dim, `station-label--flagged` red tint, `bringToFront()`), `StationChart`, `DataTable`, `NeighborGroupsTab`, `AnomalyReportTab`, `DateComparisonChart` | Pipeline result visualizations. `leaflet` for the map ( `react-leaflet` removed); `recharts` for charts. CSV preview is local (`lib/csv.ts`) — `papaparse` removed. |
| `tickets/` | `TicketDetailBody` (**shared by tickets + reports pages**), `TicketActionDock` (collapsible bottom panel: assignment + review slot), `ReviewPanel` (approve/follow-up, mounted inside the dock), `TechnicianWorkloadBadge` | The most coupled component group. Portal-dropdown pattern lives here. |

## Depends on
- `hooks/*` (pages), `lib/ticketStatus.ts`, `lib/technicianWorkload.ts`, `lib/csv.ts`
- `types/*`
- `leaflet`, `recharts`, `lucide-react`
- `ui/*` primitives

## Depends on it (reverse)
- Pages are the leaves of the route tree — only the layout wraps them.

## Key invariants
- Zones `OverviewTab` shows `incomplete_days` as a Daily exclusion and includes it in the cleaning summary. Hourly days need all 24 hours after allowed interpolation. `rows_filled` shows hourly estimates made before daily exclusions; interpolation-only runs must not claim that no cleaning was needed. New counters use `?? 0` against older API results.
- **Components don't call `lib/api/` directly.** Data flows through hooks or page-level handlers passed as props.
- **`TicketDetailBody` is shared.** Editing it affects both the Tickets and Reports pages.
- **Portal dropdowns**: any dropdown inside an `overflow: hidden` ancestor (the ticket detail panel) must use `createPortal(..., document.body)` with `position: fixed` coordinates from `getBoundingClientRect()`. Pattern in `ReviewPanel.tsx` (`AddTechPicker`) and `TicketActionDock.tsx`.
- **Status presentation**: import from `lib/ticketStatus.ts`, never re-declare inline.
- **`ConfirmDialog` before destructive actions** — enforced by convention; new destructive flows must add it.

## Open questions / debt
- Confirmed inbound references: the Zones page mounts `NeighborGroupsTab`; `AnomalyReportTab` imports and renders `StationChart` and `DateComparisonChart`. These are active components, not orphans (checked 2026-10-24).
- The component count under `ui/` and `tickets/` is growing — when a group exceeds ~12 files, consider splitting this page.

## Station review presentation (2026-10-22)
- `OverviewTab` renders Station Review Summary as compact rows: badge, high/low day counts, and one short guide. Warning/limited-data rows stay visible; other stations use a Show other stations toggle. Full evidence is in tooltips. No overall warning is neutral and always preserves the instruction to review daily flags. Insufficient data is never described as reliable.
- Overview, `AnomalyReportTab`, and `StationMap` share review status labels via `lib/stationReview.ts`. Removed fault/calibration diagnoses, Reliable, and No drift. Low readings means recorded 0–1 mm, not absent readings. The assessed-rainy-day run may span calendar gaps.
- Report daily comparisons no longer substitute a raw LOF number for a zero neighbor median: show the zero or unavailable comparison explicitly. High/low contexts remain separate. Empty report does not imply every day had enough data to assess; hooks execute before its early return.
- `web/tests/station-review.test.cjs` runs eight checks using installed TypeScript + React server rendering; mocks only the dynamic map for component rendering. Login and server HTTP availability were verified locally; authenticated browser upload was not performed.

## Pipeline activity indicator (2026-10-22)
`components/zones/PipelineDiagram.tsx` is mounted by the Zones page. Restores the original sequential visual A→B→C treatment: only the active card spins/sweeps, earlier cards show a check, and later cards wait. Visual stage changes occur at 3 and 6 seconds because the API returns only a final result. Zone C keeps animating until the response; fast responses can finish the visual sequence immediately. Timers clean up on stop/unmount. Inline grid/bar geometry and local keyframes prevent missing global styles; the explicitly requested underline continues sliding in reduced-motion mode too (only the header icon uses a pulse). Final result counts use real group keys and high-plus-low flags. No new verification was run, as requested.

## Compact station guide correction (2026-10-22)
Removed the long introduction, repeated two-column explanations, assessed-day paragraphs, and how-to article. Restored the earlier compact guide layout and collapsed other-station list, keeping neutral labels and truthful low-reading wording. Shared highReview/lowReview return brief visible guidance plus full evidence in tip; the report banner uses the same short copy. Backend thresholds are unchanged.

## Pipeline layout correction (2026-10-22)
The pipeline classes were absent from globals.css, leaving the three cards as unspaced block elements. Put critical grid/bar layout inline and animation/responsive styles in PipelineDiagram itself. No processing logic changed. User explicitly requested no verification; no tests, browser preview, or servers were run for this correction. Shared-candidates/orphans checked: no new duplication or reference changes.

## Original pipeline appearance restored (2026-10-22)
Restored the original tinted completed-card backgrounds, zone icons, white icon foreground via --brand-fg, numeric count badges, title help tooltips, and spacing. Zones page supplies its existing portalled InfoTip through renderTip. Only the active stage underline slides continuously left-to-right; prior stages have a full static underline and future stages wait. The reduced-motion rule no longer disables or replaces underline movement with opacity. Sequence remains visual A→B→C; actual response controls final completion. No tests, previews, or servers run per the user request.

## Anomaly review workspace (2026-10-24; supersedes the old report layout above)
- `AnomalyReportTab` shows a station-day queue and selected reading's comparison. Review tabs are Needs review / Reviewed / All; one separate High / Low toggle controls direction. Generic All does not change into All high/All low. The user clarified that review tabs should remain. Station/date search, badges and global review progress remain available.
- `ReviewActions` (local to the report) uses the existing ConfirmDialog before marking anomaly/not anomaly; optional notes and reviewer/time remain. After confirmation, the report opens the next pending reading in the selection. Parent-owned Undo survives this change and restores the previous decision and reading. Skip for now moves on without a decision. Dismissed events remain selectable in the queue and included in downloads.
- A History / Bar graph button switches a single chart area between StationChart and DateComparisonChart; both use the same height and only one is mounted. History retains the Compare neighbors overlay control. `Detection details` separates Selected day (reason and high-only LOF score) from Station pattern across all uploaded dates (assessed rainy-day count, average daily ratio vs group, high-reading frequency/peak or low-reading frequency/run). Nearby rainfall, Reading vs nearby, and Location fields were removed at the user's request; the chart comparison is unchanged. Detail facts now use aligned label/value rows with --font-base text, stronger values, --font-lg headings, subtle row dividers and subdued date/context suffixes. Width is limited to keep related content close; labels stack above values below 600px. Historical peaks stay separate from the selected reading; low flags do not attribute their cause to LOF, and run length means assessed rainy checks rather than consecutive calendar days.
- Create ticket remains a secondary station action using the existing page modal; no ticket is automatically created or cancelled by a review. The collapsed full data table remains, now includes low readings and analyst status/filter, and exports review metadata.
- `AnomalyReportTab.module.css` uses existing theme tokens and focus styles. Panels stack below 720px; the same-day chart scrolls horizontally at narrow widths to keep station names legible. No new dependency/global theme changes.
- Review props come from the Zones page: current Auth user, ZonesContext reviews, and `setReview`. This is run-scoped client state, not a server-backed approval workflow; see [web-state.md](./web-state.md).

### Hierarchy and flow refinement (2026-10-24)
The report opens with a short purpose/instruction and global reviewed/total progress across both high and low readings. Scoped All is labeled All high/All low to distinguish it from the global total. Queue heading, stronger station heading and rainfall size, and a Same-day rainfall/mm caption establish hierarchy. The decision prompt is How would you mark this reading? with equally weighted decisions and a quieter Skip for now. Completion offers Review remaining readings across filters/directions, or download guidance when all are reviewed. The review surface stays neutral: the temporary blue left accent was removed at the user's request. `DateComparisonChart` now uses value-derived labels, explicitly distinguishes 0.0 from No reading, and provides minimum-height baseline markers so zero/missing labels remain visible. System flags and downloads are unchanged.

Review footer placement: Add note sits on the left; both decision buttons and quieter Skip are grouped on the right. Expanding the note opens a full-width field above the action group; controls wrap on narrow screens. No review behavior changed.
The entire review section is the final section of the selected-reading card, after rainfall history and detection details, so evidence precedes the decision.
Both decision buttons use the existing primary blue Button variant for equal visibility; Skip remains a quiet ghost action. The section surface stays neutral without a blue side stripe.
Latest clarification: Needs review / Reviewed / All are restored, alongside exactly one High / Low toggle. The user wanted duplicated direction filtering removed, not the review tabs. The introductory instruction and bottom run-retention paragraph are removed. Existing loss-confirmation/beforeunload guards remain, and review storage/export behavior is unchanged. Chart display is now an inline History / Bar graph switch instead of stacked graphs or a history disclosure.

LOF help: AnomalyReportTab accepts `renderTip` and reuses the Zones page's existing portalled InfoTip, as PipelineDiagram already does. A help icon beside Detection score explains same-day nearby comparison, typical scores near -1, more-negative scores, the -3 vs -1 example, and the current high cutoff of -2 with other rainfall checks. It explicitly distinguishes the score from an accuracy percentage or confirmed fault. Without a renderer, the explanation is available as a native title. The page's InfoTip now supports focus/click/Enter/Space and Escape/blur dismissal, a tooltip role/description, and wider/larger text; it chooses below only when that side has more space. Keep LOF_HELP in sync if the frozen Zone C cutoff is ever intentionally revised.

Selected-reading header: date uses a semantic time element with larger base text, semibold weight and primary text color. The system flag has a separate spaced label/value, with a stronger High/Low value. No colored highlighting or extra badge; station name remains the main heading.

Average vs group and Highest in group now use the same InfoTip help icons. Average explains day-by-day comparisons averaged across checked rainy days for this station plus its nearby group, over the uploaded period. Highest explains strict highest frequency, excludes ties, and illustrates 25% as about one in four rainy days checked. Neither is presented as accuracy or an anomaly percentage. renderTip accepts an optional accessible label so each help icon describes its own metric.

Confirmed review decisions call the existing useToast success notification: Marked as anomaly / Marked as not anomaly, with station and date. The toast fires after onReview, not when opening/cancelling confirmation or skipping. The dashboard's existing ToastProvider keeps it visible during automatic advancement. The separate Undo banner is removed; a quiet Undo button sits beside the decision buttons, identifies the last station/date via title/accessibility label, and remains beside completion actions when no reading is selected.

Ticket detail subheadings: removed the decorative gray vertical mark from the shared TicketDetailBody SubHeading (Field Observations, Root Cause, and other subsection headings). The same helper renders in Tickets and Reports; labels and main section styling remain unchanged.
Ticket detail spacing now uses the same density-aware --pad-x/--pad-y inset for the header, metadata strip, callouts and content, with --gap-section between major sections. Removed leftover 14px finding/photo indents in current and prior rounds. Main section accents sit outside the text alignment; heading/body gaps, finding rows, status strip and approval padding follow a consistent smaller rhythm. Metadata uses minmax(0,1fr) columns and --gap-card. Shared Tickets/Reports rendering is affected; content, actions and ticket data are unchanged.

## Separate History page (2026-10-25)
Sidebar adds /history directly below Zones. History list is a compact, paginated table with submitted search and processing-date range (Manila timezone). /history/[id] shows one run's files/stations/quality summary, review counts and paginated linked tickets; assigned technicians are separate from latest report submitter/approval information. /history/[id]/results reuses ZoneResults and existing review/charts/CSV. It does not replace the current Zones session.
The old Zones page-local Results, CreateTicketModal and InfoTip moved intact into components/zones/ZoneResults.tsx, CreateTicketModal.tsx and InfoTip.tsx so both routes use one implementation. Ticket creation from a reading includes run ID/date and fixes the station input. Shared history components/styles use theme tokens, restrained tables and narrow-screen overflow/wrapping. Tickets accepts ?ticket= to open the actual detail and links back to the source run. History API calls go through hooks/page handlers; no direct Supabase access. See docs/PROCESSING_HISTORY.md and api-history.md.

## Manual save/title UX (2026-10-25)
RunSaveStatus is now props-only: neutral Not saved with Save to History, or saved title and History link. Global RunSaveController uses the existing Modal/Input/Button for a prefilled editable title and keeps the form/error on failed save. ConfirmDialog gains optional extraAction for the three-choice leave prompt. The controller uses useSaveHistoryRun, not direct API calls. History list/detail prioritize analyst titles with filename fallback; source files remain in details and search includes titles. Ticket creation from unsaved results opens the same save step first. No chart/review/export features removed.

History toolbar consistency (2026-10-25): replaced the full-width labelled form with the same compact header/control arrangement as Audit. Saved runs/count left; a fixed 220px search with icon, grouped 30px date inputs and aligned Search action on the right. Removed stacked labels, retained accessible field names and processing-date behavior, and wrapped controls below the heading on narrow screens. TypeScript and four History render checks passed. Browser preview remains unavailable in Work settings.

History list hierarchy polish (2026-10-25): moved Run first, with a readable linked title and a single-line ellipsis for long source filenames (full name remains in title/accessibility text). Kept station/file counts and explicitly labelled rainfall dates. Fixed table column proportions and consistent smaller cell padding stop long filenames stretching rows. Review totals now pair with Not started/remaining/Complete; the separate Open action is quieter, with neutral row hover and visible keyboard focus. Saved-run source/details/filter functionality remains. The History detail/ticket table is unaffected by run-table-only styling. TypeScript and 4 existing render checks passed; no browser visual QA available.

## Dashboard heading removal (2026-10-25)
Removed Header's separate page title/description block across Zones, History (including detail/results), Tickets, Technicians and Activity History. The topbar breadcrumb retains the page title as a visually unchanged h1 for accessibility. New Technician and Activity History Export now render with the topbar controls. Header accepts only title/actions; removed obsolete description/live/hideHeading props and the technician count computed solely for that description. Reports still redirects to Tickets. TypeScript, four existing History render checks and a five-tab Header render self-check passed. No application behavior, API, mobile or database changes; browser visual QA not run. Shared candidates/orphan references unchanged.
