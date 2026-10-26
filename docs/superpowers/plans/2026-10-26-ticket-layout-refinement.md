# Ticket Layout Refinement Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline.

**Goal:** Make Tickets easier to scan without replacing the existing split view or workflows.
**Architecture:** Refine the existing page, shared detail body and action dock. Use one local ticket CSS module, existing Select/Button/Badge and existing SWR/confirmation handlers.
**Tech Stack:** Next.js 15, React 19, TypeScript, CSS custom properties.
**Spec:** The user selected “Refine the existing layout” after the queue/detail/dock proposal in this chat. This supersedes the larger, unimplemented docs/TICKETS_WORKSPACE_PLAN.md proposal.

## Approved design
Keep two equal-height independently scrolling panes and the continuous detail body. Search then status/priority form one compact toolbar. Queue rows show ID/status, title, station, then technician/update time. Use a restrained rounded selection fill with no blue streak. Detail title/status lead; priority/zone become quiet text. Station/team precede quieter dates. Remove decorative section streaks and repeated heading rules. Keep follow-up instructions, reports, previous rounds, attachments, timeline and source links. Simplify the dock to one labelled header/chevron; retain its contents and default expansion for review.

## Alternatives
The user chose this refinement over adding Details/Inspection/Activity tabs. No automatic selection, new navigation or new draft guard is introduced.

## Global constraints
- Preserve search, filtering, ordering, deep links, all six statuses, assignments, validation, confirmations, PDF and cache invalidation.
- Keep Roboto 16px body / 14px supporting text and semantic light/dark tokens.
- No backend, mobile, detector, dependency or database changes; no commit requested.
- Shared detail/dock changes also reach their existing gallery consumers.

## Review focus
Long station/title/team strings must wrap or truncate without pushing time off-screen; full values remain available. Filters retain status counts. Pending-review controls remain discoverable. Dock expansion cannot hide all detail or make actions unreachable on short screens. Selected state remains distinct from keyboard focus.

## Tasks
- [x] Add focused rendering/interaction checks for queue content/filter counts and retained detail/dock controls. Watch new behavior assertions fail before implementing.
- [x] Refine page queue/filter markup and scoped selection styling; replace bespoke StatusDropdown with shared Select. Preserve existing selection and data handlers.
- [x] Refine shared detail hierarchy and dock header; no new tabs or workflow changes.
- [x] Run ticket/gallery checks, parse changed CSS, run TypeScript. Review the focused diff and update architecture map/shared-candidates/orphans/log.

## Evidence / rulings
- Work stays in the current workspace to preserve the user's existing local changes.
- Styling-only changes do not require tests that mirror individual CSS declarations. Rendering tests exercise retained content and accessible controls.
- Live browser access was previously unavailable; report this limitation rather than claiming visual verification.

Validation: two new PDF/dock assertions were observed failing before implementation, then passed. The final 37 focused tests, CSS parsing/token checks and TypeScript passed. No live browser or backend mutations were exercised. Removed now-unused global dock animation CSS after checking all callers.

Final review: one responsive risk found and fixed. Replaced the viewport-sized nonshrinking dock with a shrinkable flex container capped to 55% of its detail pane, keeping its header visible and body internally scrollable. No other material findings.
