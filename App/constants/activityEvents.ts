/**
 * Activity-event presentation — maps an audit event name to a technician-facing
 * label, icon, and color. Mirrors the web's EVENT_META (audit/page.tsx) but is
 * written from the *technician's* point of view ("You submitted a report",
 * "Report approved") and resolves to the app palette + filled Ionicons glyphs
 * (matching the dashboard's solid status-icon look).
 *
 * The backend only ever sends the lifecycle events in _ACTIVITY_EVENTS
 * (api/app/routers/mobile.py); anything unmapped falls back gracefully.
 */

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { lightStatus, type StatusHues } from './theme';
import { statusColor, statusGlyph } from './ticketStatus';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type Actor = 'you' | 'analyst' | 'system';

export interface ActivityMeta {
  /** Short verb phrase, e.g. "Report approved". */
  label: string;
  /** Optional bold fragment appended after `label` (e.g. status value). */
  emphasis?: string;
  /** The ticket status this event maps to — feed it to <StatusIcon> so the
   *  avatar renders identically to the dashboard's status avatar. */
  status: string;
  /** Filled Ionicons glyph — pulled straight from the dashboard (statusGlyph). */
  glyph: IoniconName;
  color: string;
  bg: string;
}

interface EventDef {
  /** Leading, lighter-weight phrase. */
  label: (actor: Actor) => string;
  /** Trailing, bold fragment — the salient noun/verb the eye should catch. */
  emphasis?: (actor: Actor) => string;
  /**
   * The ticket STATUS this event maps to — its glyph AND color are read from the
   * dashboard's single source of truth (statusGlyph / statusColor in
   * ticketStatus.ts), so the feed and the ticket cards never disagree.
   * Use 'cancelled' (neutral grey) for events that don't change status (edit,
   * file/photo upload) so they stay quiet.
   */
  status: string;
}

// One entry per event the backend forwards. The row title reads
// "<label> <**emphasis**>", e.g. "You submitted a " + "report" (bold). `label`
// (and `emphasis`) are functions of actor so the same event reads naturally
// whether the technician or the analyst performed it.
// Each event names the ticket STATUS it represents; the glyph + color are read
// from the dashboard (statusGlyph / statusColor), so a feed row uses the SAME
// icon and color as that ticket's status chip on the dashboard and website.
// Events that don't change status (edit, file/photo upload) map to 'cancelled'
// → neutral grey, so they stay quiet and never borrow a status color.
const EVENT_DEF: Record<string, EventDef> = {
  ticket_created:        { label: () => 'Ticket', emphasis: () => 'created', status: 'assigned' },
  technician_assigned:   { label: () => 'Assigned', emphasis: () => 'to you', status: 'assigned' },
  ticket_status_changed: { label: (a) => (a === 'you' ? 'You updated the' : 'Updated'), emphasis: () => 'status', status: 'in-progress' },
  ticket_updated:        { label: (a) => (a === 'you' ? 'You edited the' : 'Edited the'), emphasis: () => 'ticket', status: 'cancelled' }, // neutral — no status change
  report_submitted:      { label: (a) => (a === 'you' ? 'You submitted a' : 'Submitted a'), emphasis: () => 'report', status: 'pending_review' },
  report_approved:       { label: () => 'Report', emphasis: () => 'approved', status: 'verified' },
  follow_up_requested:   { label: () => 'Follow-up', emphasis: () => 'requested', status: 'follow_up' },
  ticket_cancelled:      { label: () => 'Ticket', emphasis: () => 'cancelled', status: 'cancelled' },
  file_uploaded:         { label: (a) => (a === 'you' ? 'You uploaded a' : 'Uploaded a'), emphasis: () => 'file', status: 'cancelled' },  // neutral — no status change
  photo_uploaded:        { label: (a) => (a === 'you' ? 'You added' : 'Added'), emphasis: () => 'photos', status: 'cancelled' },          // neutral — no status change
};

/**
 * Resolve an event's presentation. Pass the active theme's `status` hues for the
 * theme-correct (dark-brightened) icon color; omit for the canonical light hue.
 */
export function activityMeta(event: string, actor: Actor, hues: StatusHues = lightStatus): ActivityMeta {
  const def = EVENT_DEF[event];
  // Glyph + color come straight from the dashboard's status canon, so the feed
  // and the ticket cards are guaranteed to match.
  const status = def?.status ?? 'cancelled';
  const { color, bg } = statusColor(status, hues);
  return {
    label: def ? def.label(actor) : event.replace(/_/g, ' '),
    emphasis: def?.emphasis?.(actor),
    status,
    glyph: statusGlyph(status),
    color,
    bg,
  };
}

// ── Date grouping ────────────────────────────────────────────────────────────
// Groups timestamps into Today / Yesterday / "Mon DD, YYYY" buckets.

export function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);

  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  // Within the last week → weekday name ("Monday"); older → "June 3".
  if (dayDiff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// Compact, Facebook-style relative time for a notification row:
// "Just now", "5m", "3h", "2d", "3w", then an absolute date for anything older.
export function relativeTime(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60); if (min < 60) return `${min}m`;
  const hr  = Math.floor(min / 60); if (hr  < 24) return `${hr}h`;
  const day = Math.floor(hr  / 24); if (day < 7)  return `${day}d`;
  const wk  = Math.floor(day / 7);  if (wk  < 5)  return `${wk}w`;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

// True when the timestamp is inside the rolling last-24h "New" window.
export const isWithin24h = (iso: string) => Date.now() - new Date(iso).getTime() < 86_400_000;
