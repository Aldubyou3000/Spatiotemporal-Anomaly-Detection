/**
 * Canonical technician-workload presentation — the single source of truth for
 * how a technician's active ticket load is colored, labelled, and sorted across
 * every analyst assignment surface (create-ticket step 2, the add-technician
 * pickers, and the Technicians page).
 *
 * Workload is the analyst's anti-overload signal at manual-dispatch time: "how
 * busy is this person already?". Thresholds are deliberately tuned for a small
 * field team where absolute counts are low.
 *
 * Import the tone/label/comparator from here — never re-declare inline, so the
 * load colors can never disagree between two surfaces.
 */

import type { Technician } from "@/types/tickets";

type BadgeTone =
  | "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "accent" | "teal";

// ── Load thresholds → tone ───────────────────────────────────────────────────
// 0      → idle      (neutral grey — free to take work)
// 1–3    → light     (green — comfortable)
// 4–6    → busy      (amber — getting loaded)
// 7+     → heavy     (red — likely overloaded)

export function workloadTone(count: number): BadgeTone {
  if (count <= 0) return "neutral";
  if (count <= 3) return "success";
  if (count <= 6) return "warning";
  return "danger";
}

/** Short qualitative word for the load level (for tooltips / a11y labels). */
export function workloadLevel(count: number): "idle" | "light" | "busy" | "heavy" {
  if (count <= 0) return "idle";
  if (count <= 3) return "light";
  if (count <= 6) return "busy";
  return "heavy";
}

/** Headline label, e.g. "0 active", "3 active". */
export function workloadLabel(count: number): string {
  return `${count} active`;
}

// ── Per-status breakdown line ────────────────────────────────────────────────
// e.g. "2 assigned · 1 in review". Only non-zero buckets are shown; order
// follows the lifecycle. Returns "" when there is nothing active to break down.

const BREAKDOWN_ORDER: { key: keyof NonNullable<Technician["workload_by_status"]>; label: string }[] = [
  { key: "assigned", label: "assigned" },
  { key: "in-progress", label: "in progress" },
  { key: "pending_review", label: "in review" },
  { key: "follow_up", label: "follow-up" },
];

export function workloadBreakdown(tech: Pick<Technician, "workload_by_status">): string {
  const by = tech.workload_by_status;
  if (!by) return "";
  const parts = BREAKDOWN_ORDER
    .filter(({ key }) => (by[key] ?? 0) > 0)
    .map(({ key, label }) => `${by[key]} ${label}`);
  return parts.join(" · ");
}

/** Safe accessor — older/stale payloads may omit the count. */
export function activeCount(tech: Pick<Technician, "active_ticket_count">): number {
  return tech.active_ticket_count ?? 0;
}

// ── Least-busy-first comparator ──────────────────────────────────────────────
// Ascending active count, then alphabetical by name as a stable tiebreaker so
// the lightest-loaded technicians surface first. Non-mutating — call via
// `[...techs].sort(byWorkload)`.

export function byWorkload(
  a: Pick<Technician, "active_ticket_count" | "full_name">,
  b: Pick<Technician, "active_ticket_count" | "full_name">,
): number {
  const delta = activeCount(a) - activeCount(b);
  if (delta !== 0) return delta;
  return a.full_name.localeCompare(b.full_name);
}
