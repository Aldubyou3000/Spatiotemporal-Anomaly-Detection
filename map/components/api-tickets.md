# Component: API tickets (`routers/tickets.py`, `services/tickets_service.py`, `schemas/tickets.py`)

The most surface-heavy backend domain: full ticket CRUD plus multi-technician assignment, follow-up, cancel, attachments, and PDF export. All endpoints require the `analyst` role.

## What it does
- List (paginated, filter by status/priority/station_id), get, create, update.
- Multi-technician assignment via the `ticket_technicians` junction: add/remove (soft-delete via `removed_at`).
- Lifecycle transitions: follow-up (notes required), cancel (reason required, only from `assigned`).
- Attachments: list + upload (≤20 MB). PDF report generation via `reportlab` streamed back.

## Files
| File | Role |
|------|------|
| `routers/tickets.py` | HTTP only. Imports `_signed_url` from `.mobile` (cross-router — see [shared-candidates](../shared-candidates.md)). Builds the PDF here. |
| `services/tickets_service.py` | Supabase queries. Defines `TERMINAL_STATUSES`, the `_SELECT_LIST`/`_SELECT_DETAIL` column sets, `_join_technicians` (flattens the junction into `technicians[]` + `technicians_history[]`). Encodes reassign/remove guards and workload counting. |
| `schemas/tickets.py` | Pydantic models: `TicketCreate`, `TicketUpdate`, `TicketDetail`, `TicketListResponse`, `TechnicianAssignRequest`, `FollowUpRequest`, `CancelRequest`, `TechnicianListItem`. |

## Depends on
- `core/dependencies.py` → `require_analyst`, `get_supabase`, `_client_ip`
- `services/audit_service.py` → `audit` (every mutation)
- `schemas/tickets.py`
- `routers/mobile.py` → `_signed_url` (shared-candidate)
- `reportlab` (PDF)

## Depends on it (reverse)
- `web/src/lib/api/tickets.ts` → `useTickets.ts` hooks → Tickets page, Reports page, Zones page (workload badges)
- `web/src/components/tickets/TicketDetailBody.tsx` (shared by Tickets + Reports pages), `TicketActionDock`, `ReviewPanel`
- `App/services/api.ts` → technician's own ticket list/detail (via `/api/mobile/tickets/*`, not these endpoints — see [api-mobile.md](./api-mobile.md))
- Real-time: every ticket mutation emits a `tickets` SSE signal (and `reports` when it touches the parent report)

## Key invariants
- Ticket lifecycle: `assigned → in-progress → pending_review → verified`; analyst branches to `follow_up` (from `pending_review`) or `cancelled` (from `assigned`). Enforced here **and** mirrored in the mobile app.
- `ticket_technicians` rows are soft-deleted (`removed_at`), not hard-deleted — preserves history for `technicians_history[]`.
- Workload counting excludes `TERMINAL_STATUSES` (`verified`, `cancelled`).
- Attachments cap: 20 MB.

## Open questions / debt
- The cross-router `_signed_url` import is the top shared-candidate (see [shared-candidates.md](../shared-candidates.md) §1).
- PDF generation runs inline in the router (not in a service or threadpool) — for very large tickets this could block the event loop; currently acceptable because ticket data is small.
- `ticket_viewed` audit event exists in the catalogue but does not map to a real-time signal (view-only, no state change).
