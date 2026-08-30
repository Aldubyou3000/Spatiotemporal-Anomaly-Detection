/**
 * Preset reason chips for ticket mutations.
 * Strings are user-facing — sent verbatim as the `reason` field.
 * Keep labels short (<= 32 chars) so chips wrap cleanly at 248px sidebar.
 */

export const CANCELLATION_REASONS = [
  "Duplicate ticket",
  "Created in error",
  "False positive — pipeline artifact",
  "Station decommissioned",
  "Issue resolved remotely",
  "Other",
] as const;

export const REMOVAL_REASONS = [
  "Technician unavailable",
  "Workload rebalancing",
  "Skill mismatch",
  "Assigned in error",
  "Personal emergency",
  "Other",
] as const;

export const ASSIGNMENT_REASONS = [
  "Additional support needed",
  "Specialist required",
  "Workload distribution",
  "Replacement for coverage",
  "Proximity to station",
  "Other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];
export type RemovalReason = (typeof REMOVAL_REASONS)[number];
export type AssignmentReason = (typeof ASSIGNMENT_REASONS)[number];
