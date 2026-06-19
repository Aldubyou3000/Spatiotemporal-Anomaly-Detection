-- Migration: Store the analyst's follow-up note per inspection-report round
-- Run AFTER 0003. Safe to re-run (idempotent via IF NOT EXISTS).
-- Execute in the Supabase SQL editor.
--
-- Why: when an analyst requests a follow-up, the active report round is archived
-- (is_active = false) and the note is written to tickets.follow_up_notes — which
-- only ever holds the LATEST note. To show the full back-and-forth narrative on
-- the analyst dashboard (each round + the note that sent it back), we persist the
-- note onto the archived round itself. The backend writes this column going
-- forward; pre-existing archived rounds keep NULL (UI degrades gracefully).

ALTER TABLE public.inspection_reports
  ADD COLUMN IF NOT EXISTS follow_up_notes text;
