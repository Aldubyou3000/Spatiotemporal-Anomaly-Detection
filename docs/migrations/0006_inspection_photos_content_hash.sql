-- Migration: Add content_hash for inspection_photos deduplication
-- Run AFTER 0005. Safe to re-run (idempotent).
-- Execute in the Supabase SQL editor.
--
-- WHY: Repeated report submissions (idempotent report reuse) and retries
-- re-upload the same bytes with a new uuid path. Without dedup the 5-photo
-- count fills with duplicates and tail photos fail with "Maximum 5 reached".
-- Storing sha256 allows the backend to return the existing row on duplicate
-- bytes without consuming a slot.

ALTER TABLE public.inspection_photos
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Index for dedup lookup: report_id + content_hash
CREATE INDEX IF NOT EXISTS idx_inspection_photos_report_hash
  ON public.inspection_photos (report_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- Optional unique to enforce at DB level (allows many NULLs, only one per hash)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'inspection_photos'
      AND indexname = 'uniq_inspection_photos_report_hash'
  ) THEN
    CREATE UNIQUE INDEX uniq_inspection_photos_report_hash
      ON public.inspection_photos (report_id, content_hash)
      WHERE content_hash IS NOT NULL;
  END IF;
END $$;

-- Backfill nulls to empty (no-op, just ensure column exists)
-- Existing rows keep NULL hash and are not deduped; new uploads will have hash.
