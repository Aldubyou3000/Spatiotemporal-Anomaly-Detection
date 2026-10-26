# Overview split implementation plan

**Goal:** Implement the user's approved persistent map / tabbed details layout, reducing whole-page scrolling.
**Architecture:** Reuse OverviewTab's existing metrics, station review and quality sections. Keep StationMap outside the local tabs, connect station selection through optional props, and constrain the shared Zones/History overview to the available viewport.
**Stack:** Existing React, CSS modules, shared Tabs, Leaflet; no dependencies.
**Design:** Approved in chat: roughly 55/45 map/details; Overview, Station summary, Data quality; visible warning count; neutral pearl surfaces; existing large metric icons; internal detail scrolling; stacked small-screen fallback.

- [x] Add regression coverage for section navigation, warning visibility, station selection, and persistent map identity.
- [x] Update OverviewTab and its CSS, and scope ZoneResults viewport sizing to this tab. Preserve existing summary/quality semantics and metric icons; keep quality guidance discoverable.
- [x] Extend StationMap with optional selectedStationId, highlighting the selected marker without fitting bounds again. Keep existing callers compatible.
- [x] Run focused overview/map regression checks and TypeScript; update component map and log. No commits or unrelated changes.

Follow-up from the user's screenshot: consolidate date/quality/next-step cards into one compact Run details section; remove redundant links to the local tabs, retain one neutral Review flagged readings action. Existing metrics/icons stay untouched. Browser access is disabled, so visual verification remains pending.

Review focus: empty stations, hidden sections preserving state, unavailable coordinates, small screens / zoom, selection must not reset map zoom.
