/**
 * Ticket status / priority presentation — the app's single source of truth.
 *
 * Mirrors the web's web/src/lib/ticketStatus.ts so the mobile app and the
 * analyst dashboard never disagree on a status's label, color, or ordering.
 * The web's abstract "tones" are resolved here to concrete { color, bg } pairs
 * from the app palette, so callers don't repeat the mapping. Tones are
 * theme-independent (same in light/dark) — only surface/text come from useTheme.
 *
 * This replaces the duplicated, drifted local maps that used to live in
 * (tabs)/index.tsx and TicketDetailSheet.tsx (which had assigned=cyan,
 * in-progress=purple, and follow_up sharing pending_review's amber — all wrong
 * vs the web).
 */

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { palette, lightStatus, type StatusHues } from './theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type DbStatus =
  | 'created'        // synonym for assigned (pre-dispatch); treated as assigned
  | 'assigned'
  | 'in-progress'
  | 'pending_review'
  | 'follow_up'
  | 'verified'
  | 'cancelled';

type ColorPair = { color: string; bg: string };

// ── Labels ───────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<string, string> = {
  created: 'Assigned',
  assigned: 'Assigned',
  'in-progress': 'In Progress',
  pending_review: 'Pending Review',
  follow_up: 'Follow-up Required',
  verified: 'Verified',
  cancelled: 'Cancelled',
};

// ── Status color — one distinct tone per status, matching the web canon ───────
// assigned   → brand (blue)    queued, not started
// in-progress→ info (cyan)     actively working
// pending    → warning (amber) awaiting analyst review
// follow_up  → danger (red)    sent back, action required
// verified   → success (green) closed, done
// cancelled  → neutral (grey)  closed, inert

// Each status maps to a hue *key* + its soft tint. The soft tints (10% alpha)
// read well on both light and dark, so they're theme-independent. The solid hue
// is keyed so a caller with theme access can swap in the dark-brightened hue
// (theme.status[key]) for legible chips on near-black surfaces — matching the
// web, which also brightens status colors in dark mode.
type HueKey = keyof StatusHues;

const STATUS_HUE: Record<string, { key: HueKey; bg: string }> = {
  created:        { key: 'brand',   bg: palette.brandSoft },
  assigned:       { key: 'brand',   bg: palette.brandSoft },
  'in-progress':  { key: 'info',    bg: palette.infoSoft },
  pending_review: { key: 'warning', bg: palette.warningSoft },
  follow_up:      { key: 'danger',  bg: palette.dangerSoft },
  verified:       { key: 'success', bg: palette.successSoft },
  cancelled:      { key: 'neutral', bg: palette.neutralSoft },
};

/**
 * Resolve a status's { color, bg }. Pass the active theme's `status` hues to get
 * the theme-correct (dark-brightened) foreground; omit it for the canonical
 * light hue (back-compatible default).
 */
export function statusColor(
  status: string | null | undefined,
  hues: StatusHues = lightStatus,
): ColorPair {
  const entry = STATUS_HUE[status ?? 'assigned'] ?? STATUS_HUE.assigned;
  return { color: hues[entry.key], bg: entry.bg };
}

// ── Status → avatar glyph (filled, Ionicons) ──────────────────────────────────
// Solid Ionicons glyph per status, rendered by <StatusIcon> inside the soft-
// colored circle that anchors each ticket card. Filled (not Feather outline) so
// the status badge reads as a confident, modern token. One representative shape
// per lifecycle stage. Typed to Ionicons' glyph union so a bad name is caught.
// A cohesive set of filled, circle-contained marks (per Cloudscape's "state in
// a containing shape" guidance + Atlassian's category-by-color model): one
// solid glyph per lifecycle stage, every one a circle so the row reads as a
// single system. Hue (statusColor) carries the category; the glyph carries the
// specific state.
const STATUS_GLYPH: Record<string, IoniconName> = {
  created:        'add-circle',              // new — just landed in the queue
  assigned:       'add-circle',              // queued, awaiting action
  'in-progress':  'sync-circle',             // work underway (spinner ring)
  pending_review: 'ellipsis-horizontal-circle', // awaiting analyst review ("…")
  follow_up:      'arrow-undo-circle',       // bounced back for another visit
  verified:       'checkmark-circle',        // closed, done
  cancelled:      'close-circle',            // closed, dismissed
};

/** Filled Ionicons glyph for a status's avatar. Falls back to "new". */
export function statusGlyph(status: string | null | undefined): IoniconName {
  return STATUS_GLYPH[status ?? 'assigned'] ?? 'add-circle';
}

// ── Priority — a badge on EVERY ticket for consistency. High is the loud one
// (red); medium is a muted amber; low is quiet grey so it never competes with
// the status pill. (Differs from the web, which shows High only.) ─────────────

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export function priorityColor(
  priority: string | null | undefined,
  hues: StatusHues = lightStatus,
): ColorPair {
  if (priority === 'high')   return { color: hues.danger,  bg: palette.dangerSoft };
  if (priority === 'medium') return { color: hues.warning, bg: palette.warningSoft };
  return { color: hues.neutral, bg: palette.neutralSoft }; // low / null
}

// ── Ordering — action-required first, then most-recent within each group ──────

export const STATUS_RANK: Record<string, number> = {
  pending_review: 0,
  follow_up: 1,
  'in-progress': 2,
  assigned: 3,
  created: 3,
  verified: 4,
  cancelled: 5,
};

interface SortableTicket {
  dbStatus: string;
  updatedAt: string;
}

/** Sort comparator: rank ascending, then newest-updated first. Non-mutating. */
export function byImportance(a: SortableTicket, b: SortableTicket): number {
  const ra = STATUS_RANK[a.dbStatus] ?? 99;
  const rb = STATUS_RANK[b.dbStatus] ?? 99;
  if (ra !== rb) return ra - rb;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
