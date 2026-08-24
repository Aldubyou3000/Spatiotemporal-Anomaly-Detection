# Component: API reports (`routers/reports.py`, `services/reports_service.py`, `schemas/reports.py`)

Inspection report review surface for analysts. Submission happens via the mobile endpoints (`/api/mobile/reports`) — these are the analyst-facing read/approve endpoints.

## What it does
- `GET /api/reports` — all reports grouped by status (analyst only).
- `GET /api/reports/{id}` — single report.
- `GET /api/reports/{id}/photos` — inspection photos via fresh signed URLs.
- `PATCH /api/reports/{id}/approve` — approve report, mark parent ticket `verified` (analyst only).

## Depends on
- `core/dependencies.py` → `require_analyst`, `get_supabase`
- `services/audit_service.py` → `audit`
- `services/reports_service.py` → `list_reports`, `get_report`, `approve_report`
- `routers/mobile.py` → `_signed_url` (shared-candidate)
- `schemas/reports.py` → `ReportApprove`

## Depends on it (reverse)
- `web/src/lib/api/reports.ts` → `useReports.ts` (`optimisticApprove`)
- `web/src/components/tickets/ReviewPanel.tsx` — the analyst approve/follow-up decision surface
- Real-time: `report_approved` emits both `reports` and `tickets` signals (approving verifies the parent ticket)

## Key invariants
- Approving a report transitions the parent ticket `pending_review → verified`. This cross-domain state change is why the audit→signal map emits a `tickets` signal too.
- Photos are always served through freshly-minted signed URLs — never long-lived URLs.

## Open questions / debt
- The `approve` mutation updates two tables (report + ticket) — confirm it's atomic or wrapped in a transaction-equivalent at the Supabase level (PostgREST does not provide multi-table transactions). If a partial failure is possible, the report could be marked approved while the ticket stays `pending_review`. Worth a code review.
