# How do previewed styles become saved website styles?

Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Assignee: Aldubyou3000
Blocked by: none
Parent: [AWS Sentinel UI Library](../map.md)

## Question

When the user finishes editing, should styles be exported for application to shared source defaults, saved centrally for every website user, or retained only in the current browser? Decide the preview, apply, persistence and reset boundaries, including whether light/dark and compact/roomy settings are separate profiles.

The current recommendation presented to the user is live preview plus configuration export for applying shared defaults. This is a proposal, not a decision. Central publishing has different access-control and storage requirements from source export or browser preferences.

## Comments

- 2026-10-25: Asked the user to choose among preview/export, immediate shared saving, and browser-only saving. Awaiting an answer.
- 2026-10-25: User clarified: "this is only for designing" and "this will only stay locally." The publication/deployment framing was unnecessary.

## Answer

This is a local design playground. The gallery and visual editor are for experimenting with the website's component appearance on the user's machine. There is no shared publishing, database-backed design settings or deployment workflow in this effort. Use local browser preferences for any retained design drafts; no export/apply step is required to use the playground. Changes to application source remain ordinary development work rather than a website publishing feature.

Separate light/dark or density presets are optional preview conveniences, not a prerequisite to settling a publishing system that is now out of scope.
