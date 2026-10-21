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
- Some `zones/` components (e.g. `DateComparisonChart`, `NeighborGroupsTab`, `StationChart`) need inbound-ref verification — see [orphans.md](../orphans.md). Likely mounted from the zones page tab bar but unconfirmed.
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
