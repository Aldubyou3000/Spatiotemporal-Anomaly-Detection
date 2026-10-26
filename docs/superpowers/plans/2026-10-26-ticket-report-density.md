# Ticket Report Density and Reading Order — Implementation Record

> **For agentic workers:** Use superpowers:executing-plans when the user requests implementation. Implemented on 2026-10-27; live visual checks remain pending.

**Goal:** Make the selected ticket easier to understand through closer grouping, less accumulated padding and clear priorities, preserving the two-panel workspace.
**Architecture:** Refine TicketDetailBody, its existing Section/Prop/Prose helpers, Tickets.module.css and the existing dock. No extra tabs, outer cards, libraries or business-state changes.
**Tech Stack:** Next.js 15, React 19, CSS custom properties, existing shared controls.
**Spec:** The user confirmed the current screen feels scattered/oversized and requested slimmer left ticket rows plus a plan for the actual report pane. The row cleanup is implemented separately; this document proposes the right-pane work.

## Diagnosis
The panel spreads related facts across a full-width metadata band, individual rows and separate sections. Multiple layers contribute spacing: wrapper inset, metadata inset, section padding, heading margin and field padding. The page consequently gives administrative facts and current inspection similar space/attention. Shrinking readable text would not solve that grouping problem.

## Recommended layout
Retain a continuous detail pane, with three clearly ordered content groups:

1. **Ticket context — what happened.** ID/status, title and station lead. Keep priority/zone secondary. Put the original description and recorded reading evidence close together; keep evidence units. Replace the tall metadata band with compact label/value facts, preserving assigned team and created/updated timestamps. PDF/source links stay quiet supporting actions.
2. **Current inspection — what was found.** One section heading followed by observations, root cause and corrective action. Label each field consistently and keep its content directly beneath it. Show recorded resolution/severity and approval remarks without turning every field into a card. Follow-up instructions appear beside the current work context, rather than separated by several unrelated facts. Empty/missing reports remain honest; do not invent findings or action guidance.
3. **Supporting record — what happened earlier.** Keep prior rounds, previous assignments, attachments and activity below current evidence. Preserve the existing previous-round disclosure and photo/file controls. Make timeline entries compact; keep full exact timestamps and recorded actor names here. These names provide accountability and are distinct from the removed queue-row technician names.

Keep the integrated Assignment/Manage and review footer. Do not repeat the same management controls in the header and content. Pending-review actions continue to operate on the current report only. Keep the shrinkable pane-relative dock cap and internal scrolling.

## Spacing and typography — proposed implementation targets
- Preserve Roboto and the existing 16px body / 14px supporting / 20px title roles.
- Use 18px for major headings, 16px medium-weight field labels; avoid making every label bold.
- Around 4px between label and value, 8px within related facts, 16px between field groups, up to 24px between major groups. Use existing spacing tokens; prevent wrapper and child padding from doubling those gaps.
- Keep prose around 60–75 characters per line. Keep section edges aligned with the pane; do not create a narrow centered card surrounded by empty space.
- Compact facts may share a row when they fit and must wrap at narrow widths. Long station IDs/names must not push actions out of view.
- White content surface, dark readable text, restrained neutral grouping. Keep thin separators only at major boundaries. No blue streaks, colored icon tiles, heavy outlines, shadows or alternating boxed panels.
- Natural content height; do not stretch short sections to fill empty space.

## Alternatives considered
**Recommended:** compact the current continuous pane and reorder related information. This matches the chosen split view and avoids extra navigation.
**Not proposed for this pass:** Details/Inspection/Activity tabs. They reduce visible content but add navigation and conceal context needed while reviewing. Also avoid a new right-side metadata column: it increases horizontal travel and competes with the existing left queue.

## Implementation tasks
- [x] In TicketDetailBody.tsx, consolidate nearby context facts and remove repeated station/assignment/date presentation where it conveys the same information. Preserve every existing fact in an appropriate location.
- [x] Put active inspection evidence ahead of historical material; retain all current/prior report, file/photo and approval content. Use existing helpers rather than introducing a parallel detail renderer.
- [x] In Tickets.module.css, reduce accumulated insets and per-field padding. Apply reading-width limits to prose only; keep outer alignment and responsive wrapping.
- [x] Tighten ActivityTimeline item spacing without dropping actors, event text or timestamps. Keep the integrated dock and all reason/confirmation behavior.
- [x] Update matching DetailSkeleton/gallery fixtures. Extend rendering checks for current versus prior report, pending/follow-up/verified/cancelled states, long identifiers and all retained fields/actions. Run focused checks and TypeScript.
- [ ] Visually review the complete pane at desktop, laptop and short/narrow layouts in light/dark, including expanded dock and 200% zoom, when browser access is available. Confirm body and action scrolling stay reachable before claiming visual success.

## Acceptance criteria
An analyst can read the ticket problem, current field findings and available action in that order. Related facts sit close together. The page has fewer tall bands and duplicated gaps, without smaller body text or lost information. No new API calls, status transitions, data migrations or mobile changes.

## Delivered scope (2026-10-27)
The prior left queue work remains intact: no technician names, moderate spacing, straight shortened separators, update time beside ID/status. Right-pane metadata now wraps naturally near the left edge instead of stretching station/team across a tinted band. Follow-up/cancellation text uses compact named notices without large full-width backgrounds. Exact created/updated date/time remains visible; derived relative age is retained in the time tooltip. Current evidence and attachments precede one History section with previous rounds, past assignments and a tighter activity timeline. h3/h4 heading levels distinguish major groups from fields. Existing assignment/review dock and all mutation/confirmation handlers are unchanged.

Two new grouping/notice tests were observed failing before implementation. Component tests cover all six statuses and retained evidence/file links. CSS/token checks and TypeScript passed. A focused source review found no material issue; live appearance, zoom and browser interactions remain unverified because browser access is unavailable.
