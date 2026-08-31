# Component: Web pages & components (`web/src/app/(dashboard)/*`, `web/src/components/`)

The analyst-facing feature pages and their component building blocks. Pages compose components and call hooks; components are props-only (no direct API calls). Grouped here because the page↔component pairing is the unit of editing.

## Pages (`web/src/app/(dashboard)/`)
| Page | Role | Primary hooks | Notable components |
|------|------|---------------|--------------------|
| `zones/page.tsx` | CSV upload + pipeline results (tabs) | `ZonesContext` (local), `useTicketTechnicians` (workload) | `FileUpload`, `OverviewTab`, `StationMap`, `StationChart`, `DataTable`, `NeighborGroupsTab`, `AnomalyReportTab`, `DateComparisonChart` |
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
| `zones/` | `FileUpload`, `OverviewTab`, `StationMap` (free `tile.openstreetmap.org` light + `Esri World_Dark_Gray_Base` dark, no key; flagged `10px` red + dual halo `20/14px` vs typical `5px` dim, `station-label--flagged` red tint, `bringToFront()`), `StationChart`, `DataTable`, `NeighborGroupsTab`, `AnomalyReportTab`, `DateComparisonChart` | Pipeline result visualizations. `leaflet` for the map ( `react-leaflet` removed); `recharts` for charts. CSV preview is local (`lib/csv.ts`) — `papaparse` removed. |
| `tickets/` | `TicketDetailBody` (**shared by tickets + reports pages**), `TicketActionDock` (collapsible bottom panel: assignment + review slot), `ReviewPanel` (approve/follow-up, mounted inside the dock), `TechnicianWorkloadBadge` | The most coupled component group. Portal-dropdown pattern lives here. |

## Depends on
- `hooks/*` (pages), `lib/ticketStatus.ts`, `lib/technicianWorkload.ts`, `lib/csv.ts`
- `types/*`
- `leaflet`, `recharts`, `lucide-react`
- `ui/*` primitives

## Depends on it (reverse)
- Pages are the leaves of the route tree — only the layout wraps them.

## Key invariants
- **Components don't call `lib/api/` directly.** Data flows through hooks or page-level handlers passed as props.
- **`TicketDetailBody` is shared.** Editing it affects both the Tickets and Reports pages.
- **Portal dropdowns**: any dropdown inside an `overflow: hidden` ancestor (the ticket detail panel) must use `createPortal(..., document.body)` with `position: fixed` coordinates from `getBoundingClientRect()`. Pattern in `ReviewPanel.tsx` (`AddTechPicker`) and `TicketActionDock.tsx`.
- **Status presentation**: import from `lib/ticketStatus.ts`, never re-declare inline.
- **`ConfirmDialog` before destructive actions** — enforced by convention; new destructive flows must add it.

## Open questions / debt
- Some `zones/` components (e.g. `DateComparisonChart`, `NeighborGroupsTab`, `StationChart`) need inbound-ref verification — see [orphans.md](../orphans.md). Likely mounted from the zones page tab bar but unconfirmed.
- The component count under `ui/` and `tickets/` is growing — when a group exceeds ~12 files, consider splitting this page.
