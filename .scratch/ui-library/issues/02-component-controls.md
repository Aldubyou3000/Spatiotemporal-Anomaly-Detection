# Which component appearances can the visual editor change?

Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Assignee: unassigned
Blocked by: none
Parent: [AWS Sentinel UI Library](../map.md)

## Question

Should the editor expose only shared theme settings, or also component-specific appearance settings? Set the supported customization boundary and gallery coverage for the existing website: buttons, inputs/selects, badges, tabs, cards/panels, tables, dialogs, notifications, shell controls, charts and composed review/ticket interfaces. Include how variants and interaction states can be inspected together without changing live records.

The current recommendation presented to the user is shared colors, typography, spacing and corners plus component-specific appearance such as button sizes, table density and badge colors. This remains a proposal. Inventory the actual existing components and inline styling before deciding which settings can share a source of truth; do not create visual copies disconnected from production components.

## Comments

- 2026-10-25: User confirmed both a component gallery and visual controls. Asked whether controls should cover theme plus individual components, or theme settings only. Awaiting an answer.
