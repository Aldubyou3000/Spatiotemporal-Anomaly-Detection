# Component: API technicians (`routers/technicians.py`, `services/technicians_service.py`, `schemas/technicians.py`)

Analyst-only management of technician accounts: list, create, enable/disable. Toggle-active exists in the API but is **not exposed in the analyst UI** (admin-only operation per TECHSTACK.md).

## What it does
- `GET /api/technicians` — list technician accounts.
- `POST /api/technicians` — create technician account (analyst only). Creates the Supabase Auth user and the `profiles` row.
- `PATCH /api/technicians/{id}/toggle-active` — enable/disable an account. API exists; not surfaced in the web UI.

## Depends on
- `core/dependencies.py` → `require_analyst`, `get_supabase`
- `core/config.py` → `settings`
- `core/errors.py` → `friendly_db_error` (e.g. `profiles_username_key` collision → "username taken")
- `services/audit_service.py` → `audit` (`account_created`, `account_enabled`, `account_disabled`)
- `schemas/technicians.py` → `TechnicianCreate`

## Depends on it (reverse)
- `web/src/lib/api/technicians.ts` → `useTechnicians.ts` (`useTechnicianProfiles` for the Technicians page; `useTicketTechnicians` for assignment dropdowns on Tickets/Zones)
- Real-time: account mutations emit `technicians` SSE signals

## Key invariants
- `toggle-active` is the soft-delete mechanism — disabled accounts (`is_active=false`) are rejected at `_verify_and_load_profile()` in `core/dependencies.py` (403).
- Creating a technician creates a Supabase Auth user — credential delivery is the analyst's responsibility (no email confirmation flow in code).

## Open questions / debt
- `toggle-active` has no UI — intentional admin-only, but means there is no path to re-enable a disabled account from the dashboard.
- `useTicketTechnicians` (a summary projection for assignment dropdowns) is shared between the Tickets and Zones pages under one SWR key — see [web-state.md](./web-state.md) for the cache-key contract.
