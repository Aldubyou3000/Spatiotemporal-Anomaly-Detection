# How is the local design playground opened and kept local?

Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Assignee: unassigned
Blocked by: 01
Parent: [AWS Sentinel UI Library](../map.md)

Depends on: [How do previewed styles become saved website styles?](01-saving-and-publishing.md)

## Question

Given the user's local-only scope, what is the simplest way to open the playground locally and keep it out of deployed builds? Investigate an existing local development route versus a separate local preview entry. Reuse the existing app shell/component providers where useful. Do not introduce publishing permissions, new user roles or deployment settings. Treat routine technical routing choices as implementation decisions rather than asking the user about infrastructure.
