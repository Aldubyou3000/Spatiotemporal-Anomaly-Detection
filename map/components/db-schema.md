# Component: Database schema & migrations (`docs/migrations/`, Supabase)

The Supabase (Postgres + Auth + Storage) backend. **No automated migration runner** — each SQL file is applied by hand in the Supabase SQL editor, in numbered order. Tables and columns referenced in code live here; this page is the index for the data model.

## Tables referenced in code
Inferred from `services/*_service.py` `_SELECT_*` strings and router queries:

| Table | Purpose | Touched by |
|-------|---------|-----------|
| `profiles` | User accounts: `id`, `role` (`analyst`/`technician`), `full_name`, `username`, `email`, `phone`, `station_ids`, `is_active` | `core/dependencies.py` (every auth check), `services/technicians_service.py` |
| `tickets` | Maintenance tickets: `id`, `ticket_number` (sequential identity), `title`, `description`, `station_id`, `status`, `priority`, `anomaly_zone`, `anomaly_data`, `analyst_id`, `technician_id`, `follow_up_count`, `last_follow_up_at`, `follow_up_notes`, `cancelled_at`, `cancellation_reason`, lifecycle timestamps, `created_at`/`updated_at` | `services/tickets_service.py`, `services/reports_service.py` |
| `ticket_technicians` | Junction (multi-technician assignment): `user_id`, `assigned_at`, `removed_at` (soft-delete), → `profiles` | `services/tickets_service.py` (`_join_technicians`) |
| `inspection_reports` | Submitted reports; `is_active` distinguishes the current round from archived follow-up rounds | `services/reports_service.py`, `services/tickets_service.py` |
| `audit_log` | Append-only, SHA-256 hash-chained. **Deny-all RLS** — only service-role writes/reads. `chain_hash`, `created_at`, event fields | `services/audit_service.py`, `routers/audit.py` |

(Storage buckets for CSV uploads + inspection photos are accessed via signed URLs through the service-role key — see [shared-candidates.md](../shared-candidates.md) §1.)

## Migrations (`docs/migrations/`)
| File | Adds | Run order |
|------|------|-----------|
| `0001_security_hardening.sql` | Initial `audit_log` table + hardened RPC | 1 |
| `0002_audit_log_full.sql` | Full `audit_log` schema (ALTERs the 0001 table; preserves rows) | 2 |
| `0003_ticket_number.sql` | `tickets.ticket_number` as identity (auto-increment) via `DO $$ … $$` | 3 |
| `0004_report_follow_up_notes.sql` | Per-round follow-up note persistence (so the dashboard can show the full back-and-forth narrative, not just the latest note) | 4 |
| `0005_lockdown_rpc_grants.sql` | Locks down `SECURITY DEFINER` function execute grants (Supabase security advisor fix; `rls_auto_enable` was the most serious exposure) | 5 |

All migrations are **idempotent** (`IF NOT EXISTS` / `DO $$ … $$` guards) and safe to re-run.

## Depends on
- Supabase project (URL + service-role key + anon key + JWT secret in `api/.env`)
- Applied by humans in the Supabase SQL editor — **no CI migration step**.

## Depends on it (reverse)
- Every `services/*_service.py` (via Supabase queries through `get_supabase()`)
- `services/audit_service.py` writes via service-role key (bypasses RLS)
- `services/technicians_service.py` also creates Supabase **Auth** users (separate from the `profiles` row)

## Key invariants
- **RLS is the database-level role gate**; FastAPI `require_analyst` / `require_technician_mobile` is the application-level one. Both must agree. `audit_log` is the exception — deny-all to anon/authed, service-role only.
- **Code that depends on a new column/table will fail with a Supabase error until the migration is run** (e.g. "column does not exist"). Flag this to the user whenever a change requires a migration.
- Migrations must be written idempotent and ordered. Adding a new one means re-running is safe and the numeric order is the apply order.

## Open questions / debt
- No schema diagram exists in the repo. The table list above is inferred from `_SELECT_*` strings — confirm against the live Supabase schema if precision matters.
- `0002` ALTERs `0001`'s table rather than replacing it — fragile if the two ever drift apart. The header comment documents this.
- There is no migration that records the `ticket_technicians` junction or `inspection_reports` table creation — these predate the tracked migration set (likely created by Supabase initial schema or an earlier untracked step). Worth documenting their origin if known.
