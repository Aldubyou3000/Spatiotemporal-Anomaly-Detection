/**
 * Canonical ticket status/priority presentation — the single source of truth
 * for labels, colors, and list ordering across the ticketing system.
 *
 * Both the ticket list page and the shared TicketDetailBody import from here so
 * a status can never show one color in the list and a different color in the
 * detail panel.
 *
 * Color philosophy (kept deliberately restrained — color carries meaning, not
 * decoration):
 *   - Each status maps to ONE distinct tone, and no two active states share a
 *     color (In Progress ≠ Pending Review).
 *   - The two states that demand analyst action — Pending Review and
 *     Follow-up Required — get the most salient warm tones (amber / red).
 *   - Closed states (Verified, Cancelled) recede: green and grey.
 *   - Priority and zone are SECONDARY signals; they are intentionally muted in
 *     list rows so a wall of colored chips doesn't drown out the status.
 */

import type { TicketStatus, TicketPriority } from "@/types/tickets";

type BadgeTone =
  | "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "accent" | "teal";

// ── Human-readable labels ────────────────────────────────────────────────────

export const STATUS_LABEL: Record<TicketStatus, string> = {
  assigned: "Assigned",
  "in-progress": "In Progress",
  pending_review: "Pending Review",
  follow_up: "Follow-up Required",
  verified: "Verified",
  cancelled: "Cancelled",
};

// ── Status color — one distinct tone per status ──────────────────────────────
// info (cyan)  → work is actively happening
// warning      → needs analyst review (action required)
// danger       → follow-up required (action required, stronger)
// brand        → queued / assigned, not yet started
// success      → done & verified
// neutral      → cancelled / inert

export const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  assigned: "brand",
  "in-progress": "info",
  pending_review: "warning",
  follow_up: "danger",
  verified: "success",
  cancelled: "neutral",
};

// ── Priority — muted by default; only "high" earns a warm color ──────────────
// Low/medium are background noise in a list; surfacing them in color competes
// with the status. High priority is the only level worth a colored chip.

export const PRIORITY_TONE: Record<TicketPriority, BadgeTone> = {
  low: "neutral",
  medium: "neutral",
  high: "danger",
};

// Severity (inspection findings) uses the same restrained scale as priority.
export const SEVERITY_TONE: Record<string, BadgeTone> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

// ── List ordering ────────────────────────────────────────────────────────────
// Lower rank sorts higher (closer to the top). The two action-required states
// lead; then active work; then queued; then closed.

const STATUS_RANK: Record<TicketStatus, number> = {
  pending_review: 0, // analyst must review — most important
  follow_up: 1,      // sent back, awaiting re-inspection
  "in-progress": 2,  // technician actively working
  assigned: 3,       // queued, not started
  verified: 4,       // closed — done
  cancelled: 5,      // closed — inert
};

/**
 * Statuses awaiting the analyst's review decision — drives the "Needs Review"
 * group/count on the Tickets page AND must match the sidebar badge.
 *
 * ONLY `pending_review` qualifies: a `follow_up` ticket has already been
 * reviewed and sent back, so the ball is now in the technician's court — it is
 * not awaiting analyst action. (The sidebar badge counts `reports.pending`,
 * which is also pending_review only, so both numbers agree.)
 *
 * Note: `follow_up` still sorts near the top via STATUS_RANK so it stays
 * visible — it just isn't counted as "needs YOUR review".
 */
export const NEEDS_REVIEW = new Set<TicketStatus>(["pending_review"]);

interface SortableTicket {
  status: TicketStatus;
  updated_at: string;
}

/**
 * Sort comparator: action-required statuses first (by STATUS_RANK), then within
 * each status group the most recently updated ticket leads. Non-mutating — call
 * via `[...items].sort(byImportance)`.
 */
export function byImportance(a: SortableTicket, b: SortableTicket): number {
  const rankDelta = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rankDelta !== 0) return rankDelta;
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}
