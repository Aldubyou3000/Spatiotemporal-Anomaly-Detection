# Component: Processing History (`routers/history.py`, `services/history_service.py`, `schemas/history.py`)

Permanent analyst history of completed multi-file processing requests, separate from temporary execution jobs. See `docs/PROCESSING_HISTORY.md` for setup, retention and user workflow.

## Files and contract
- `routers/history.py`: analyst-only list/detail, saved results, versioned reviews and linked-ticket pagination under `/api/history`. UUID path validation; typed list/summary/result/review responses. Cookie review PATCH requires the existing auth router CSRF guard.
- `services/history_service.py`: builds immutable snapshots with source filename/byte-size/hash metadata and source-code processing fingerprint; persists atomically via `save_processing_run`; returns a visible unsaved state on storage failure. Uses compact flagged station/date identities to validate reviews/ticket dates without fetching large results.
- `schemas/history.py`: compact HistoryRun/List, SourceFile, strict ReviewChange (status/note/expected_revision only) and SavedReview. Server sets reviewer and timestamp.
- `docs/migrations/0008_processing_history.sql`: service-role-only snapshot/review tables, compact list view, idempotent snapshot RPC and revision-checked review RPC. Manual application required before API/web deployment.
- `api/tests/test_history.py`: snapshot integrity, auth/CSRF, actor validation, stale writes, zero-flag runs, failed saves/retry retention, ticket/run association, previous inspection visibility and mobile signal isolation.

## Dependencies
- `routers/zones.py` invokes `try_save_run` after either sync or async processing; ProcessResult now has optional run_id/history_saved/history_error. Unsaved job payload remains retryable through authenticated `POST /api/zones/jobs/{id}/save`, subject to existing cleanup/restart limitations. Polling/retry is restricted to the job creator.
- `tickets_service.py` validates optional run_id/station/reading_date on creation, selects the link fields and supports run filtering. Existing tickets stay unlinked.
- `reports_service.py` records authenticated approved_by on new approvals. History combines current ticket assignments/status with the latest **submitted** inspection, including archived follow-up rounds and known approval actor. Submission time is not an inspection date.
- `audit.log` publishes processing_run_saved / processing_review_saved into the existing single SSE producer. Mobile projection excludes history.
- Web `lib/api/history.ts` / `hooks/useHistory.ts` use SWR for permanent records; original active pipeline data remains in ZonesContext.

## Invariants and limits
- Original output is never changed by a review. Run retries never overwrite a saved snapshot. Every reprocess gets a new run ID.
- Reviews require an existing flagged station/day and expected revision. Tombstones preserve version after Undo; actor/time come from authenticated API and PostgreSQL, not client fields.
- No algorithm/Expo changes. No migration runner, backfill, permanent original-upload copy or durable processing queue was introduced.
- API still needs one worker/replica for SSE and temporary job state. A completed saved run survives restarts, in-progress/unsaved jobs do not.
- SQL/Supabase integration remains to be tested after manual migration; unit tests mock the database boundary.

## Setup diagnosis (2026-10-25)
Read-only checks against the locally configured Supabase project returned PGRST205 for processing_runs, processing_run_results, processing_reviews and processing_history. This confirms the History schema is unavailable in that project/schema cache; migration 0008 has not been made available there. Opened the existing migration for the user to apply through Supabase SQL editor. No database writes or code changes were performed.

## Analyst-controlled saving and titles (2026-10-25; supersedes automatic saves above)
Processing now returns an unsaved run ID without database/audit writes. Only POST /api/zones/jobs/{id}/save persists it, with a strict SaveRunRequest title (trimmed 1–120 characters). It uses the original server result and compact source metadata; the creator-only auth and CSRF checks remain. Migration 0009 adds processing_runs.title, appends it to the existing view and adds a three-argument save_processing_run RPC so missing title setup fails rather than silently dropping titles. Existing untitled runs fall back to filenames. Titles join search_text and saved snapshots expose history_title. Repeated saves return the canonical saved snapshot/title. Temporary job retention is one hour (opportunistic cleanup, existing max 50); raw uploads are not held in completed job entries. No schema migration was applied by this task.

## Review-save JSONB filter fix (2026-10-25)
`validate_reading` must pass a JSON-encoded string to PostgREST `contains` for the flagged_readings JSONB array. Passing a Python list of dicts hit the installed client's SQL-array branch and raised TypeError before HTTP execution. The shared validator covers review save/Undo and ticket links with reading dates. Encoding with json.dumps preserves exact station/day validation, including quoted station names. Added a real SyncPostgrestClient + MockTransport endpoint regression; all 20 History tests pass. The configured live client now validates the screenshot's saved reading and reaches the RPC's deliberately stale revision conflict without writing a decision. A separate SQL save probe was rolled back. API health/preflight passed and the running process uses --reload. Authenticated browser resubmission was not performed; no schema, privilege, algorithm or mobile changes. Shared candidates/orphans unchanged.


History list ordering (2026-10-26): GET /api/history accepts validated sort=latest|oldest (latest default). list_runs orders processed_at descending/ascending before range pagination, with id ascending as a stable tie-break. Search and Asia/Manila date boundaries are unchanged; no schema migration.


History prefix search (2026-10-26): list_runs now filters displayed title beginnings with case-insensitive LIKE; legacy null-title rows match their first source filename instead. Removed broad search_text matching that let hidden stations/files match a named run such as test. Quoted and LIKE-escaped patterns remain server-side before counts/pagination; no migration.


History read optimization (2026-10-26): list/detail select only HistoryRun response fields instead of internal search/creation columns. Review/ticket existence checks read processing_runs.id instead of recomputing all six aggregate counts in processing_history. Missing runs still return 404; review pagination, attribution, ticket inspections and revision validation remain. No schema or data change. Baseline warm reads: summary 0.174s; 3,029-row result ~0.6s (1.44MB).
