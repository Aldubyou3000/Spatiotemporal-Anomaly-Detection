-- Migration: Add sequential ticket_number to tickets table
-- Run AFTER 0002. Safe to re-run (idempotent via DO blocks).
-- Execute in the Supabase SQL editor.

-- ─── 1. Add ticket_number column as identity (auto-increment) ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'ticket_number'
  ) THEN
    ALTER TABLE tickets
      ADD COLUMN ticket_number BIGINT GENERATED ALWAYS AS IDENTITY;
  END IF;
END $$;

-- ─── 2. Backfill existing rows in creation order ───────────────────────────────
-- Assigns sequential numbers 1, 2, 3... ordered by created_at to all rows
-- that somehow still have NULL (only relevant if column was just added).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tickets WHERE ticket_number IS NULL LIMIT 1
  ) THEN
    WITH numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
      FROM tickets
      WHERE ticket_number IS NULL
    )
    UPDATE tickets t
    SET ticket_number = n.rn
    FROM numbered n
    WHERE t.id = n.id;
  END IF;
END $$;

-- ─── 3. Enforce uniqueness and NOT NULL ────────────────────────────────────────
DO $$
BEGIN
  -- NOT NULL constraint
  BEGIN
    ALTER TABLE tickets ALTER COLUMN ticket_number SET NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Unique index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'tickets' AND indexname = 'tickets_ticket_number_key'
  ) THEN
    CREATE UNIQUE INDEX tickets_ticket_number_key ON tickets (ticket_number);
  END IF;
END $$;
