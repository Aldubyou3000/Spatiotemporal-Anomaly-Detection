"""
reset_ticketing.py — Total reset for the ticketing system via service-role key.

Deletes all ticketing rows and restarts ticket_number identity so the next
ticket created will be #1.  Equivalent to docs/RESET_TICKETING.sql but runnable
from the terminal without opening the Supabase dashboard.

Usage:
  # Dry run — shows counts, does nothing
  python api/scripts/reset_ticketing.py --dry-run

  # Full reset (DB rows only, keeps Storage objects + audit_log)
  python api/scripts/reset_ticketing.py --confirm

  # Also wipe ticket-related audit history and Storage photo objects
  python api/scripts/reset_ticketing.py --confirm --include-audit --include-storage

Requires: api/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
          (same env file the FastAPI server uses). Never use the anon key.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Load api/.env regardless of cwd
try:
    from dotenv import load_dotenv

    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass  # python-dotenv not installed; rely on shell env

from supabase import create_client, Client


TABLES_IN_DELETE_ORDER = [
    "inspection_photos",
    "ticket_attachments",
    "inspection_reports",
    "ticket_technicians",
    "tickets",
]

# Tables that the SQL fallback resets via ALTER SEQUENCE (identity column)
IDENTITY_TABLE = "tickets"
IDENTITY_COLUMN = "ticket_number"


def get_service_client() -> Client:
    url = os.getenv("SUPABASE_URL") or os.getenv("SUPABASE_URL".lower())
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n"
            "  - Put them in api/.env (same file the API uses), or\n"
            "  - Export them in your shell before running this script.\n"
            f"  Looked for env file at: {Path(__file__).resolve().parents[1] / '.env'}",
            file=sys.stderr,
        )
        sys.exit(1)
    # service_role bypasses RLS — required for deletes + sequence reset
    return create_client(url, key)


def count_rows(sb: Client, table: str) -> int | str:
    try:
        # Use "*" for tables without an "id" column (e.g. ticket_technicians)
        res = sb.table(table).select("*", count="exact").limit(1).execute()  # type: ignore[arg-type]
        return res.count or 0  # type: ignore[attr-defined]
    except Exception as e:
        return f"error: {e}"


def delete_all(sb: Client, table: str) -> int:
    """Delete all rows from table. Returns deleted count or raises."""
    try:
        # Supabase PostgREST requires a filter on delete — .delete() without .eq/.neq is rejected.
        # Use a filter that matches every row but uses a column that table actually has.
        # Strategy per table shape (tickets/id vs ticket_technicians/ticket_id, etc.)
        strategies = []
        if table == "ticket_technicians":
            strategies = [
                lambda: sb.table(table).delete().neq("ticket_id", "00000000-0000-0000-0000-000000000000").execute(),
                lambda: sb.table(table).delete().not_.is_("ticket_id", "null").execute(),
            ]
        elif table == "inspection_photos":
            strategies = [
                lambda: sb.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute(),
                lambda: sb.table(table).delete().not_.is_("report_id", "null").execute(),
                lambda: sb.table(table).delete().gte("created_at", "1970-01-01").execute(),
            ]
        elif table == "ticket_attachments":
            strategies = [
                lambda: sb.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute(),
                lambda: sb.table(table).delete().not_.is_("ticket_id", "null").execute(),
            ]
        else:
            # tickets, inspection_reports — have id
            strategies = [
                lambda: sb.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute(),
                lambda: sb.table(table).delete().gte("created_at", "1970-01-01").execute(),
                lambda: sb.table(table).delete().not_.is_("id", "null").execute(),
            ]
        last_err = None
        for strat in strategies:
            try:
                res = strat()
                if hasattr(res, "data") and res.data is not None:
                    return len(res.data)
                return 0
            except Exception as e:
                last_err = e
                continue
        raise last_err  # type: ignore[misc]
    except Exception as e:
        msg = str(e)
        if "does not exist" in msg or "42P01" in msg:
            print(f"  [skip] table {table} does not exist — skipping")
            return 0
        raise


def reset_identity_via_rpc(sb: Client) -> None:
    """
    Restart tickets.ticket_number identity sequence to 1.

    Tries:
      1. Direct SQL via rpc (if you have a sql/exec_sql helper)
      2. PostgREST rpc to a stored function if present
      3. Falls back to instructions for manual SQL Editor reset.

    The most reliable path is the SQL Editor (docs/RESET_TICKETING.sql).
    This function attempts a direct postgrest query using the Supabase
    REST API's rpc endpoint; if no helper function exists it prints manual
    instructions instead of failing silently.
    """
    # Attempt 1: try to call a generic exec_sql rpc if the project has one
    # (Supabase does not create this by default — we probe gracefully)
    sql = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'tickets_ticket_number_seq') THEN
    EXECUTE 'ALTER SEQUENCE public.tickets_ticket_number_seq RESTART WITH 1';
  END IF;
  PERFORM setval(
    pg_get_serial_sequence('public.tickets', 'ticket_number'),
    1,
    false
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sequence reset skipped: %', SQLERRM;
END $$;
""".strip()

    # Try rpc("exec_sql") — common helper some projects add. We attempt it
    # but expect it to 404 on stock Supabase; that's fine.
    for fn in ("exec_sql", "exec", "run_sql"):
        try:
            sb.rpc(fn, {"sql": sql}).execute()
            print(f"  [ok] sequence restarted via rpc('{fn}')")
            return
        except Exception:
            continue

    # No rpc helper — print manual step (delete already ran, so next ticket
    # will still get max+1 unless sequence is reset; we warn).
    print("  [warn] Could not restart ticket_number sequence via API (no exec_sql rpc).")
    print("         Run this ONE line in Supabase SQL Editor to finish the reset:")
    print("           ALTER SEQUENCE public.tickets_ticket_number_seq RESTART WITH 1;")
    print("           SELECT setval(pg_get_serial_sequence('public.tickets','ticket_number'), 1, false);")
    print("         Or just run docs/RESET_TICKETING.sql which does it atomically.")


def main() -> None:
    p = argparse.ArgumentParser(description="Reset ticketing system — next ticket will be #1")
    p.add_argument("--confirm", action="store_true", help="Actually delete (required)")
    p.add_argument("--dry-run", action="store_true", help="Show counts only, no deletes")
    p.add_argument("--include-audit", action="store_true", help="Also delete audit_log rows for ticketing entities")
    p.add_argument("--include-storage", action="store_true", help="Also delete Supabase Storage objects under inspection-photos/")
    p.add_argument("--yes", action="store_true", help="Skip 'type YES' prompt (for automation)")
    args = p.parse_args()

    if not args.confirm and not args.dry_run:
        # Default to dry-run if no flag given — safer than accidental wipe
        print("No --confirm or --dry-run given — defaulting to --dry-run (no changes).")
        args.dry_run = True

    sb = get_service_client()

    print("Ticketing reset — connecting to:", os.getenv("SUPABASE_URL", "")[:42] + "...")
    print()

    # Show before counts
    print("Current counts (before):")
    before: dict[str, int | str] = {}
    for t in TABLES_IN_DELETE_ORDER:
        c = count_rows(sb, t)
        before[t] = c
        print(f"  {t:22s} {c}")
    # Also show ticket_number sequence state if we can
    try:
        res = sb.table("tickets").select("ticket_number").order("ticket_number", desc=True).limit(1).execute()
        data = getattr(res, "data", None) or []
        max_num = data[0].get("ticket_number") if data else None  # type: ignore[union-attr]
        print(f"  {'max ticket_number':22s} {max_num}")
    except Exception:
        pass
    print()

    if args.dry_run:
        print("Dry run — no rows deleted.")
        print("Run with --confirm to actually wipe (will prompt for YES).")
        if before.get("tickets", 0) == 0:
            print("  Note: tickets already at 0 — sequence may still need reset for #1.")
        print()
        print("To get ticket_number #1 on next insert, ensure sequence is at 1:")
        print("  ALTER SEQUENCE public.tickets_ticket_number_seq RESTART WITH 1;")
        return

    # Confirm
    if not args.yes:
        print("THIS WILL PERMANENTLY DELETE ALL TICKETING DATA:")
        for t in TABLES_IN_DELETE_ORDER:
            print(f"  - {t} ({before.get(t, '?')} rows)")
        if args.include_audit:
            print("  - audit_log (ticket-related rows)")
        if args.include_storage:
            print("  - Storage bucket objects under inspection-photos/")
        print()
        ans = input("Type YES to confirm: ").strip()
        if ans != "YES":
            print("Aborted — type exactly YES to confirm.")
            sys.exit(1)

    print()
    print("Deleting (children first, then tickets)...")
    for t in TABLES_IN_DELETE_ORDER:
        try:
            n = delete_all(sb, t)
            print(f"  [ok] {t}: deleted {n} rows (before count was {before.get(t, '?')})")
        except Exception as e:
            print(f"  [error] {t}: {e}", file=sys.stderr)
            # Continue to next table — FK order means later tables may still succeed
    print()

    print("Restarting ticket_number sequence to 1...")
    reset_identity_via_rpc(sb)
    print()

    if args.include_audit:
        print("Deleting ticket-related audit_log rows...")
        try:
            # audit_log has RULE no delete — this only works if rule is disabled
            # via SQL Editor. Via API it will silently do nothing (rule = DO INSTEAD NOTHING).
            # We attempt it anyway and warn if zero rows affected due to rule.
            sb.table("audit_log").delete().in_("entity_type", ["ticket", "inspection_report", "ticket_technicians", "inspection_photos", "ticket_attachments"]).execute()
            print("  [attempted] audit_log delete via API — check SQL Editor if RLS/rule blocks it")
            print("  If audit rows remain, run in SQL Editor:")
            print("    ALTER TABLE public.audit_log DISABLE RULE audit_log_no_delete;")
            print("    DELETE FROM public.audit_log WHERE entity_type IN ('ticket','inspection_report','ticket_technicians');")
            print("    ALTER TABLE public.audit_log ENABLE RULE audit_log_no_delete;")
        except Exception as e:
            print(f"  [error] audit_log: {e}")

    if args.include_storage:
        print("Deleting Storage objects (inspection-photos bucket)...")
        try:
            # List and remove objects under inspection-photos/ prefix
            # Supabase storage API: sb.storage.from_("inspection-photos").list()
            for bucket in ("inspection-photos", "ticket-attachments", "inspection_reports"):
                try:
                    objs = sb.storage.from_(bucket).list()
                    if objs:
                        paths = [o["name"] for o in objs if "name" in o]
                        if paths:
                            sb.storage.from_(bucket).remove(paths)
                            print(f"  [ok] bucket {bucket}: removed {len(paths)} objects")
                        else:
                            print(f"  [skip] bucket {bucket}: empty")
                    else:
                        print(f"  [skip] bucket {bucket}: empty or not found")
                except Exception as be:
                    print(f"  [skip] bucket {bucket}: {be}")
        except Exception as e:
            print(f"  [error] storage: {e}")

    # Show after counts
    print()
    print("Counts after reset:")
    for t in TABLES_IN_DELETE_ORDER:
        c = count_rows(sb, t)
        print(f"  {t:22s} {c}")
    print()
    print("Done. Next ticket created via POST /api/tickets will be ticket_number #1.")
    print("Verify: create a test ticket from the dashboard and check its number.")
    print("If it is not #1, run docs/RESET_TICKETING.sql in the Supabase SQL Editor")
    print("to force the sequence restart (the API path cannot always reset sequences).")


if __name__ == "__main__":
    main()
