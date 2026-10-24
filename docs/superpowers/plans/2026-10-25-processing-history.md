# Processing History Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Add a separate History sidebar page containing saved processing runs, persistent analyst reviews and explicit links to tickets and inspection reports.

**Architecture:** FastAPI saves successful pipeline snapshots in Supabase, with compact metadata separate from the large result. Reviews are independent versioned records. Tickets carry an optional run ID and reading date; existing tickets remain unlinked. History uses SWR and existing results/ticket UI.

**Tech Stack:** Existing FastAPI, PostgreSQL/Supabase, Next.js, React, SWR and CSS tokens. No new dependencies.

**Spec:** User-approved plan in this conversation, amended to a separate sidebar page. Each multi-file processing request is one run. Shared analyst history, newest first; search/date filter; details show processing summary, reviews and linked tickets. Open results reuses existing evidence/review/export UI. Assigned technicians and report submitters are distinct. Submitted date is not an inspection date. Original detection results remain immutable.

## Constraints and implementation decisions
- Do not modify frozen Zone algorithms or the Expo app.
- Preserve current uncommitted feature work in this checkout; no commits or deployment are part of this request.
- Save result JSON separately from list metadata; retain source filenames, byte sizes and SHA-256 fingerprints, not an extra duplicate of original uploads.
- Database migration is manual. Saving failure must be visible and retryable without falsely claiming persistence. Existing in-process jobs are not a durable job queue.
- Save reviews with server-authenticated actor/time and per-reading optimistic concurrency; undo is another recorded change, not forged historical authorship.
- Reuse existing tickets/reports for findings, photos, previous rounds and approvals. Do not infer old ticket/run associations by station name.

## Review focus
- Storage outage or missing migration: results remain usable/downloadable, clearly unsaved, server-held save retry available while job exists.
- Reload and navigation: saved results/reviews reopen; current local run is not replaced by browsing old results.
- Two analysts editing the same reading: reject stale saves and refresh; never silently replace another decision.
- No flags/insufficient data: save the run, zero review count; no accuracy claim.
- Multi-file runs/retries: unique run identity, atomic idempotent snapshot save, explicit validated ticket links.

## Tasks
- [x] 1. Persistence/API: migration, history schema/service/router, server snapshot save for sync/async pipeline, authenticated retry, versioned reviews, linked tickets, audit/SSE. Tests cover original result preservation, failed saves, review validation and ticket/run validation.
- [x] 2. Shared web UI and integration: extract existing results/modal without redesign, saved-review hook, await saves before advancing/toasting, save status/retry, preserve exports and undo. Typecheck and review regression tests.
- [x] 3. History routes/sidebar: compact paginated search/date list, run summary and linked tickets/inspection submitters, reopen shared results, ticket deep-link. Render checks and responsive/theme preview where available.
- [x] 4. Whole-feature checks/review, document migration/setup and map changes.

## Progress
- Initial inspection: no run persistence or ticket/run foreign key currently exists. Reviews are local to ZonesContext. Existing report records expose submitted_at (not actual inspection time).

- Persistence/API, shared results/reviews and separate History routes are implemented in the existing checkout, preserving pre-existing uncommitted work.
- Verification: 39/39 backend tests (including actual dataset), 27/27 frontend checks, TypeScript passes. Raw output and original high/low flags remain intact.
- Review fixes: authenticated CSRF-protected review writes, latest submitted report retained during follow-up, current revision checked before Undo, late save retry guarded against resetting/replacing a different run.
- Database: migration 0008 created but not applied; no local PostgreSQL server available. Live Supabase round trip remains a manual follow-up after setup.
- Browser preview: unavailable because local browser use is disabled in Work settings; real pages passed server-rendered assertions. Temporary preview server stopped, no temporary files left.
- Build: first attempt blocked by sandbox spawn EPERM and outside-sandbox approval initially unavailable due usage. After user resumed, normal approval succeeded; initial approved production build passed; final rebuild follows the reviewed concurrency fix.

- Independent read-only review completed after the usage interruption. One P2 finding: open confirmation could use a newer SWR baseline and overwrite another analyst. Fixed by retaining the original handler/note at confirmation opening; regression reproduced RED then passed GREEN. Dirty note drafts are preserved when saved notes change.
- Review scope limits: live PostgreSQL/Supabase, browser interaction and deployment remain unverified; the reviewer did not rerun suites. No other important defects identified by inspection.

- Final verification: production build passed after the concurrency fix; TypeScript passed; backend 39/39 and frontend 27/27. Whitespace check passed, and no frozen Zone/Expo files changed. Migration and live database/browser checks remain explicitly unperformed. No commits, pushes or deployment made.
