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
| `inspection_photos` | Report photo paths; nullable `content_hash` for per-report SHA-256 deduplication | `routers/mobile.py`, signed-photo analyst routes |
| `oauth_states` | Server-side PKCE state/verifier, optional mobile return URL, expiry; deny-all RLS, service-role access | `services/auth_service.py` (web and mobile OAuth) |

(Storage buckets for CSV uploads + inspection photos are accessed via signed URLs through the service-role key — see [shared-candidates.md](../shared-candidates.md) §1.)

## Migrations (`docs/migrations/`)
| File | Adds | Run order |
|------|------|-----------|
| `0001_security_hardening.sql` | Initial `audit_log` table + hardened RPC | 1 |
| `0002_audit_log_full.sql` | Full `audit_log` schema (ALTERs the 0001 table; preserves rows) | 2 |
| `0003_ticket_number.sql` | `tickets.ticket_number` as identity (auto-increment) via `DO $$ … $$` | 3 |
| `0004_report_follow_up_notes.sql` | Per-round follow-up note persistence (so the dashboard can show the full back-and-forth narrative, not just the latest note) | 4 |
| `0005_lockdown_rpc_grants.sql` | Locks down `SECURITY DEFINER` function execute grants (Supabase security advisor fix; `rls_auto_enable` was the most serious exposure) | 5 |
| `0006_inspection_photos_content_hash.sql` | Nullable photo hash plus per-report lookup/unique indexes; existing NULL hashes are not backfilled | 6 |
| `0007_oauth_states.sql` | PKCE state table, expiry index, deny-all RLS, service-role-only cleanup function | 7 |

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
- Files 0006/0007 are present in the repo; application to live Supabase was not verified. Mobile photo upload falls back without hash deduplication if the column is missing; OAuth falls back to local file/memory if the state table is unavailable. Zone jobs use neither table and remain process-local.

## Migration 0008: processing history (2026-10-25)
processing_runs stores compact metadata and flagged identities; processing_run_results stores the original result JSON; processing_reviews stores per-reading decisions/revisions (including cleared-decision tombstones). processing_history is a security-invoker summary view with live review/ticket counts. New tables/views/RPCs are service-role-only; RLS is enabled. save_processing_run is atomic/idempotent; save_processing_review uses an expected revision and database timestamp. Adds tickets.run_id / reading_date and inspection_reports.approved_by nullable foreign keys. **Not applied by this task**: run docs/migrations/0008_processing_history.sql manually before deploying API/web, since ticket selects and report approvals depend on it. Existing runs/tickets are not backfilled.

## Migration 0009: History titles (2026-10-25)
Adds nullable processing_runs.title with a 1–120 trimmed-character check (nullable for existing records). Appends title to processing_history without changing existing column order. Adds the service-role-only save_processing_run(jsonb,jsonb,text) overload, with explicit title validation and unchanged atomic/idempotent behavior; the old 0008 function remains for rollout compatibility. Run 0008 first if not already applied, then 0009 before deploying updated API/web. No live application performed.
