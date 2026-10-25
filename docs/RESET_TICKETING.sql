-- RESET_TICKETING.sql
-- Total reset for the ticketing system — next ticket will be #1.
-- Run this in the Supabase SQL Editor (SQL Editor → New query → Run).
-- Uses the service-role connection the editor already has, so RLS/rules are bypassed.
--
-- What it does:
--   1. Wipes all child tables (photos, attachments, reports, junction) first
--      to satisfy foreign keys, then wipes tickets.
--   2. Restarts the ticket_number identity sequence so the next insert is 1.
--   3. Optionally leaves audit_log intact (commented). Uncomment the last block
--      if you also want to wipe ticket-related audit history.
--
-- Safe to re-run. Wrapped in a transaction so it either fully succeeds or rolls back.
-- Takes <1s even with thousands of rows.

BEGIN;

-- ── 1. Child tables (FK → tickets / inspection_reports) ─────────────────────
-- Order matters: photos depend on inspection_reports, so delete them first.

DELETE FROM public.inspection_photos WHERE true;
DELETE FROM public.ticket_attachments WHERE true;  -- if table not present, this line errors — see note below
DELETE FROM public.inspection_reports WHERE true;
DELETE FROM public.ticket_technicians WHERE true;

-- ── 2. Parent table — tickets ────────────────────────────────────────────────
DELETE FROM public.tickets WHERE true;

-- ── 3. Restart the ticket_number identity sequence to 1 ─────────────────────
-- tickets.ticket_number is GENERATED ALWAYS AS IDENTITY (migration 0003).
-- Postgres creates an internal sequence; TRUNCATE ... RESTART IDENTITY would
-- also reset it, but DELETE requires an explicit ALTER SEQUENCE.

-- Primary sequence name (standard for GENERATED ALWAYS AS IDENTITY)
DO $$
BEGIN
  -- Try the canonical identity sequence name first
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'tickets_ticket_number_seq') THEN
    EXECUTE 'ALTER SEQUENCE public.tickets_ticket_number_seq RESTART WITH 1';
  END IF;

  -- Fallback: resolve via pg_get_serial_sequence (covers SERIAL / alternative naming)
  PERFORM setval(
    pg_get_serial_sequence('public.tickets', 'ticket_number'),
    1,
    false  -- next nextval() returns 1
  );
EXCEPTION WHEN OTHERS THEN
  -- Sequence may not exist if column is not identity on older clones — ignore
  RAISE NOTICE 'ticket_number sequence reset skipped: %', SQLERRM;
END $$;

COMMIT;

-- ── Verification (run after, or as separate query) ──────────────────────────
-- SELECT COUNT(*) AS tickets_remaining FROM public.tickets;
-- SELECT COUNT(*) AS technicians_remaining FROM public.ticket_technicians;
-- SELECT COUNT(*) AS reports_remaining FROM public.inspection_reports;
-- SELECT COUNT(*) AS photos_remaining FROM public.inspection_photos;
-- SELECT COUNT(*) AS attachments_remaining FROM public.ticket_attachments;
-- SELECT last_value, is_called FROM public.tickets_ticket_number_seq;
-- -- Next insert should get ticket_number = 1 (is_called = false means next is 1)

-- ── Optional: also wipe ticket-related audit history ────────────────────────
-- Uncomment if you want audit_log to also reset (audit_log has deny-all RLS +
-- no-update/no-delete rules, so this must run as service_role / in the
-- SQL editor, and requires temporarily disabling the rules).
--
-- BEGIN;
-- ALTER TABLE public.audit_log DISABLE RULE audit_log_no_delete;
-- DELETE FROM public.audit_log WHERE entity_type IN ('ticket', 'inspection_report', 'ticket_technicians', 'inspection_photos', 'ticket_attachments');
-- -- To nuke ALL audit history instead: DELETE FROM public.audit_log WHERE true;
-- ALTER TABLE public.audit_log ENABLE RULE audit_log_no_delete;
-- COMMIT;

-- ── Notes ────────────────────────────────────────────────────────────────────
-- • If your project never created ticket_attachments (older schema), the
--   DELETE FROM public.ticket_attachments line will error. Either comment it
--   out or guard it:
--     DO $$ BEGIN DELETE FROM public.ticket_attachments WHERE true; EXCEPTION WHEN undefined_table THEN NULL; END $$;
-- • Storage objects (Supabase Storage bucket files for photo uploads) are NOT
--   deleted by this script — only the DB rows. To also clear Storage, run
--   via the Python script (api/scripts/reset_ticketing.py) with --include-storage,
--   or delete the bucket prefix manually in the Supabase dashboard.
-- • After running, create a test ticket from the dashboard (Zones → Create Ticket)
--   and confirm its displayed number is #1.
