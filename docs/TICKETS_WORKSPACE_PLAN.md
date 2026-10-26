# Tickets workspace revamp — proposed, not implemented

Date: 2026-10-26

## Goal

Help the analyst answer three questions quickly: which ticket needs attention, what happened at the station, and what action is available now. Reuse the Zones workspace's neutral background, white content surfaces, compact navigation, selection treatment and clear decision area.

## Current problems verified in the code

- Search, priority and status each occupy a separate toolbar row with different heights.
- The ticket row puts station, technician and relative update time on one line. The station cannot shrink, so long identifiers squeeze out the technician.
- The desktop starts with a large empty detail panel. Clicking the selected row also deselects it.
- Details, inspection findings, old rounds, files and activity form one long scroll. Assignment controls and analyst decisions share an expandable bottom dock.
- Four equally wide metadata columns give dates the same prominence as the station and assigned team.
- Follow-up uses the red status badge but an amber detail callout. Priority, severity and status can appear as competing colored labels.

## Proposed layout

Desktop keeps the existing list/detail pattern. The list is approximately 340–380px wide, depending on available space, and the detail uses the remaining width. Use the existing spacing tokens for a 16px gutter and 16–24px panel insets. Keep scrolling inside the queue and active detail section, with stable scrollbar space.

```text
Ticket list                       Selected ticket
Search                            TKT-29 · Revisit Needed       PDF
Status              Priority      Ticket title
                                  Station · assigned team · priority
TKT-29       Revisit Needed        Details | Inspection | Activity
Ticket title
Station                           Relevant content for this section
Technician +1       Updated 10h
                                  Contextual action area when needed
TKT-26          In Progress
...
```

Do not stretch paragraphs across the full detail width. On wide screens, the Details section uses a broad description/evidence column and a narrower related-information column for the team, source run and dates. Stack those groups when space is limited. Let content determine section height; avoid large blank cards or evenly distributed four-column metadata.

### Ticket list

- One search field, followed by Status and Priority side by side. Same input height and alignment as Zones. Retain ticket-number/title/station search, exact filtering, status counts and Clear behavior.
- Do not add a second set of status tabs or summary cards that repeat these filters.
- Row order: ticket ID and status; title (up to two lines); station; technician/team count and update age.
- Station and technician are distinct lines. Full identifiers/names remain available in the detail view; truncated queue text has an accessible full label.
- Status is the primary colored badge. Show high priority as explicitly labelled compact text/icon, not another equally prominent status-like block. Full priority is always available in Details.
- Retain existing importance ordering. Ready for Review leads, followed by Revisit Needed, In Progress, Assigned, Verified and Cancelled. Revisit Needed must not count as awaiting analyst review.
- Use the same restrained blue selection fill as Zones. Icon color follows text. Keyboard focus remains visibly distinct from selection.

### Selected ticket header

- Ticket ID and one status badge form the supporting line.
- Ticket title is the strongest text, with wrapping for long titles.
- Station and assigned team appear immediately below. PDF remains a quiet labelled action at the right, wrapping below on narrow screens.
- Keep current status visible while scrolling. Do not repeat identical status banners in every section.
- Show follow-up instructions or a cancellation reason in the relevant section with the canonical status tone and a clear label.

### Three detail sections

| Section | Information and controls |
| --- | --- |
| Details | Original description; available anomaly/rainfall evidence with units and source zone; selected reading date if recorded; station; priority; assigned technicians and Manage technicians; linked source run; data files; created/updated dates. |
| Inspection | Current submitted report, round and submission time; actual submitter when available; issue resolved/unresolved and severity; field observations; root cause; corrective action/recommendations; inspection photos; analyst remarks/approval; previous rounds collapsed underneath. |
| Activity | Available ticket milestones and assignment history, ordered chronologically with exact timestamps where recorded. Keep this a ticket timeline, not a claim to expose the complete Audit Log. |

Use the existing Tabs primitive and Zones' local section styling: compact navigation with readable labels and a neutral selected fill. Preserve content/drafts across section switches. Avoid a second toolbar for each section.

Inspection evidence stays together: photos belong beside the report, while uploaded source/data files belong in Details. Previous rounds stay available in Inspection; archived reports must never become the active approval target.

Never infer a report's author from the currently assigned technician. Show a person's name or event timestamp only when the API supplies that attribution. Unknown legacy values remain explicitly unavailable. Keep any currently available information even when it is moved to another section.

## Selection and next action

- Desktop first visit: automatically open the first visible ticket in the existing importance order. A valid `?ticket=` deep link takes precedence, including a ticket outside the list filters.
- Clicking the current ticket keeps it open rather than creating an empty pane.
- Default to Inspection for a newly selected Ready for Review ticket; default to Details for other statuses. A verified ticket's inspection remains one click away.
- Live updates do not automatically switch the selected ticket or section. If a report becomes ready, show its status and an unobtrusive section indicator.
- After an action changes the ticket's status, keep its detail visible so the analyst can see the result. If it no longer matches the filters, explain that briefly rather than silently selecting another ticket.
- If the analyst has unsaved remarks, follow-up instructions or assignment edits, guard ticket changes and navigation. Confirmation cancellation and failed saves retain the draft.
- Empty filtered results show a concise explanation and Clear filters. An empty database shows a short path to create tickets from Zones. Do not fill empty space with invented metrics or instructions.

| Ticket status | Visible next step |
| --- | --- |
| Assigned | Manage technicians; Cancel ticket as a secondary consequential action with reason and confirmation. |
| In Progress | Work-in-progress context and Manage technicians; no analyst approval before a submitted report. |
| Ready for Review | Inspection opens first. A clearly separated review area follows the findings, offering Approve & verify or Request follow-up. Approval remarks remain optional; follow-up instructions remain required. Existing staged reassignment and confirmations are retained. |
| Revisit Needed | Follow-up instructions and assigned team are prominent. Make clear that the technician is expected to revisit. |
| Verified | Approved report, analyst remarks and PDF. No active assignment/approval controls. |
| Cancelled | Cancellation reason, available history and PDF. No active workflow controls. |

Keep review decisions separate from technician management. Reuse the existing review form and assignment handlers, but replace the oversized combined action dock with an explicitly labelled review surface and a compact Manage technicians disclosure. On larger screens, the action buttons may remain visible at the bottom of Inspection without covering evidence. On short screens they flow naturally below the form. No flashing action-dock animation.

## Typography, colors and spacing

- Ticket detail title: existing 20px heading role, semibold.
- Section headings and ticket-list titles: 16px, medium/semibold.
- Main descriptions, inspection text and form controls: 16px, comfortable 1.5–1.6 line height.
- IDs, dates, supporting labels, counts and badges: existing 14px role. Keep dark enough to read; no faint gray essential information.
- Icons: approximately 16–18px, matching adjacent text. Do not change the sidebar's newly approved sizing.
- Use one spacing rhythm: 8px within related controls/text, 16px between groups, up to 24px between major content sections. Match section/header/footer edges.
- Keep the website's neutral shell → pale workspace → white content hierarchy. Separate groups using spacing, headings and subtle surfaces; avoid decorative vertical bars, shadows and a border around every fact.
- Import existing STATUS_LABEL/STATUS_TONE, PRIORITY_TONE and SEVERITY_TONE. Assigned stays blue; In Progress cyan; Ready for Review amber; Revisit Needed red; Verified green; Cancelled neutral. The same status uses the same tone in list, detail and callouts.
- Selection uses the brand fill independently of status. Use words as well as color. Severity is labelled as severity and priority as priority so they cannot be mistaken for workflow status.

## Responsive and loading behavior

- Around 1024px and narrower, use a list-first flow rather than squeezing two panels. Opening a ticket shows its detail with Back to tickets; retain queue filters and scroll position.
- Detail metadata and columns wrap/stack; long station IDs and descriptions must not force horizontal overflow.
- Keyboard navigation, labelled icon actions, visible focus, semantic tabs and accessible loading/error feedback are required.
- Reuse SWR and SSE. Existing cached detail remains visible during refresh; initial requests use local skeletons.
- Each resource has its own loading/error state: a failed report must not be presented as No report submitted, and a file error must not hide the ticket.
- Prevent old ticket/report data from appearing under a newly selected ID. Load only the selected ticket's resources; do not prefetch every report or photo in the queue.
- Approval stays unavailable while the active report is missing, loading or failed. After successful actions, update the existing caches and live counts.

## Implementation scope and order

1. Adjust the Tickets page's queue, toolbar, selection rules and responsive layout, using a local CSS module and existing primitives.
2. Reorganize TicketDetailBody into the three sections, retaining PDF, evidence, files, photos/lightbox, current/prior reports, remarks and timeline.
3. Reposition TicketActionDock/ReviewPanel responsibilities while retaining current validation, confirmations, assignment reasons, workload guidance, minimum-one-technician rule and status restrictions.
4. Check all shared callers and the UI Library specimen. Update fixture states for all six statuses, long names, multi-technician teams and multiple rounds.
5. Verify search/filter/counts, deep links, initial selection, drafts, live status changes, loading/errors, PDF/source links and all mutations. Type-check and run focused UI/behavior regressions. Visually inspect light/dark at laptop, desktop and narrow widths, including 200% zoom and short-height layouts.

Primary files: `web/src/app/(dashboard)/tickets/page.tsx`, `components/tickets/TicketDetailBody.tsx`, `TicketActionDock.tsx`, `ReviewPanel.tsx`, and a local Tickets CSS module. Review the existing `hooks/useTickets.ts` cache behavior and `lib/ticketStatus.ts` mappings; use them rather than adding parallel fetching or status definitions. Any added visual component must be represented in the existing UI Library inventory.

No new database schema, mobile flow, ticket lifecycle or detector change is needed for this design. UI tests should prove preserved workflow behavior rather than checking arbitrary CSS numbers.

## Acceptance criteria

- A first-time analyst can identify the station, ticket status, assigned team and available next action without opening a hidden combined dock.
- The desktop does not start with an empty detail pane when tickets exist; mobile retains a usable list-first flow.
- Ticket titles/stations/technicians no longer compete on one squeezed metadata line.
- Details, current inspection, old rounds and activity are clearly distinguishable and all existing important features remain accessible.
- No draft loss or selection jump occurs during filtering, section changes or live updates.
- Color meanings and surface styling match Zones in both themes.
- Long content uses the available width sensibly without sprawling paragraphs, fixed-height empty cards or overlapping sticky actions.

Planning basis: source/component-map review and the supplied screenshot. No application code changed or browser mockup tested for this proposal.
