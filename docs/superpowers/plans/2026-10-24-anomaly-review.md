# Anomaly Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved UI proposal in the existing checkout. No automatic commit or deployment.

**Goal:** Let analysts review individual flagged station-days and preserve their decisions in CSV downloads without changing detector output.

**Architecture:** Keep results and run-scoped reviews in ZonesContext. Use one shared helper for event identity/export and the existing themed controls/charts for a compact queue/detail report. No backend/database migration or mobile changes.

**Tech Stack:** Existing Next.js / React / TypeScript, CSS tokens, Node test runner.

**Spec:** The user's accepted two-panel review proposal in this conversation: Needs review / Reviewed / All, High/Low and station/date filters, one-day comparison, optional history/note, reversible decisions, manual ticket creation, retained table and downloads.

## Constraints and scope
- Keep original rainfall, LOF scores, and high/low flags intact; review is a separate analyst judgment.
- Reviews are keyed by station and date within one result, never carried to another run; survive dashboard navigation, not reload/logout. State this in the UI.
- Missing decisions are Needs review only on flagged readings, not on every normal or unassessed row.
- Retain same-day comparison, history with neighbor overlay, ticket action, technical data table, raw/cleaned views, all-row CSV and flagged-only CSV.
- Use existing Button/Badge/Select/ConfirmDialog, theme tokens and responsive styling; no dependency changes.

## Review focus
- A zero neighbor median is displayed as zero, never an infinite ratio or raw LOF substitute.
- Low and high readings both appear in review/export; dismissal does not erase original detection.
- A reviewed row remains selected until Next pending, allowing Undo without an unexpected selection jump.
- Filters with no matches, no flags, and missing neighbors have explicit empty states; mobile columns stack.
- New results/reset clear reviews; all exports include reviewer identity, timestamp, note and separate review status.

## Tasks
1. [x] Write failing Node tests for station/day keys, high/low event selection, next-pending navigation and immutable export including dismissed/pending rows. Check run isolation using the real provider in a synthetic browser fixture.
2. [x] Add `web/src/lib/anomalyReview.ts` types/helpers and run-scoped reviews/reset in ZonesContext; pass review callbacks from the Zones page.
3. [x] Replace report internals with queue/detail workflow; preserve charts/history/tickets, notes, confirmation, Undo, Next pending and empty states. Add scoped responsive styles.
4. [x] Make both full-result and flagged-only CSV exports use review metadata; retain the collapsed table and include low flags and review status. Protect formula-like spreadsheet note text.
5. [x] Update report rendering checks and run both web suites plus TypeScript. Review the diff and update map pages/shared candidates/orphans/log. Use a temporary synthetic preview to check interactions and actual downloads; remove its files and stop its server afterward. No application server, detector, database or deployment changes.

## Outcome and limits
- Five helper/export tests and nine rendering/wording tests passed; TypeScript passed. Synthetic browser checks covered decisions, optional notes, Undo, Next pending, date filtering, navigation retention, new-run isolation, low readings, history overlays, dark theme, narrow layout, and a real downloaded CSV retaining a dismissed system flag.
- Read-only independent code review found no critical/important issues. Small cleanup removed duplicate export enrichment. No deferred blocking issues.
- Reviews are deliberately client/run-scoped. They are not shared, durable database records or independently verified ground truth. Full authenticated pipeline upload and production deployment were not tested. No automatic commit/push.
