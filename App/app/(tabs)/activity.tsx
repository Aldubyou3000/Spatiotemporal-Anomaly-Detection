import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

import AppScrollView from '@/components/AppScrollView';
import CloudBackground from '@/components/CloudBackground';
import { Text } from '@/components/Themed';
import Icon from '@/components/Icon';
import StatusIcon from '@/components/StatusIcon';
import TicketDetailSheet from '@/components/TicketDetailSheet';
import DateRangePopover, { type AnchorRect } from '@/components/DateRangePopover';
import { type DateRange } from '@/components/RangeCalendar';
import { activityMeta, isWithin24h, relativeTime } from '@/constants/activityEvents';
import { duration, ease, spring, stagger } from '@/constants/Motion';
import { icons } from '@/constants/icons';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { useActivityFeed, ticketDetailKey } from '@/hooks/useTickets';
import {
  ActivityItem,
  getTicketById,
  MaintenanceTicket,
} from '@/services/api';

// ─── Last-seen persistence (client-side "unread" cue) ─────────────────────────
// The backend has no read-state, so "new since you last looked" is tracked
// on-device: we store the epoch-ms of when the user last *left* this tab, and
// any item newer than that snapshot renders as unseen. Platform-branched the
// same way AppContext persists the theme (SecureStore native / localStorage web).
const ACTIVITY_LAST_SEEN_KEY = 'activity_last_seen';

async function readLastSeen(): Promise<number | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      raw = window.localStorage.getItem(ACTIVITY_LAST_SEEN_KEY);
    } else {
      raw = await SecureStore.getItemAsync(ACTIVITY_LAST_SEEN_KEY);
    }
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function writeLastSeen(ms: number): Promise<void> {
  try {
    const val = String(ms);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVITY_LAST_SEEN_KEY, val);
    } else {
      await SecureStore.setItemAsync(ACTIVITY_LAST_SEEN_KEY, val);
    }
  } catch {
    // Best-effort: a failed write just means dots linger one extra visit.
  }
}

// ─── Entrance wrapper (matches the dashboard's FadeSlideIn) ───────────────────
// Plays the fade+slide ONCE per app session via a module-level flag (reset only
// on app restart). First feed paint animates; every later tab return renders
// instantly in the final state.
//
// IMPORTANT: each row snapshots the flag into a ref at construction time, BEFORE
// any sibling's effect can flip it. All rows in one render pass therefore share
// the same decision (animate vs. instant). Flipping the flag inside each effect
// without snapshotting caused a race where only the first row animated and every
// later row stayed stuck at opacity:0 — i.e. invisible.
let hasAnimatedIn = false;

function FadeSlideIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  // Locked in on first render; identical for every row mounting together.
  const shouldAnimate = useRef(!hasAnimatedIn).current;

  const opacity    = useSharedValue(shouldAnimate ? 0 : 1);
  const translateY = useSharedValue(shouldAnimate ? 10 : 0);

  useEffect(() => {
    if (!shouldAnimate) return; // already shown this session → stay instant
    opacity.value    = withDelay(delay, withTiming(1, { duration: duration.normal, easing: ease }));
    translateY.value = withDelay(delay, withSpring(0, spring.gentle));
    hasAnimatedIn = true; // safe to set after our own decision is captured
  }, []); // mount-only; never re-fires on tab focus

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

// A flattened render list: a section label or a notification row.
type Row =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'event';   key: string; item: ActivityItem; unseen: boolean };

// Split newest-first items into "New" (last 24h) and "Earlier", flagging each
// against the last-seen snapshot. Returns a flat list so the staggered map and
// FadeSlideIn index stay simple; empty buckets emit no header.
function buildRows(items: ActivityItem[], lastSeen: number | null): Row[] {
  const fresh: ActivityItem[] = [];
  const older: ActivityItem[] = [];
  for (const it of items) (isWithin24h(it.createdAt) ? fresh : older).push(it);

  const isUnseen = (it: ActivityItem) =>
    lastSeen != null && new Date(it.createdAt).getTime() > lastSeen;

  const rows: Row[] = [];
  if (fresh.length) {
    rows.push({ kind: 'section', key: 's-new', label: 'New' });
    fresh.forEach((it) => rows.push({ kind: 'event', key: `e-${it.id}`, item: it, unseen: isUnseen(it) }));
  }
  if (older.length) {
    rows.push({ kind: 'section', key: 's-earlier', label: 'Earlier' });
    older.forEach((it) => rows.push({ kind: 'event', key: `e-${it.id}`, item: it, unseen: isUnseen(it) }));
  }
  return rows;
}

// ─── Notification row ─────────────────────────────────────────────────────────
function NotificationRow({
  item, unseen, opening, onPress,
}: {
  item: ActivityItem;
  unseen: boolean;
  opening: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const meta  = activityMeta(item.event, item.actor, theme.status);

  const ticketRef = item.ticketNumber != null ? `TKT-${item.ticketNumber}` : 'Ticket';
  const title     = item.ticketTitle?.trim() || 'Untitled ticket';
  const when      = relativeTime(item.createdAt);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unseen ? 'Unread, ' : ''}${meta.label}${meta.emphasis ? ' ' + meta.emphasis : ''}, ${ticketRef}, ${when}`}
      style={({ pressed }) => [
        styles.row,
        unseen && { backgroundColor: palette.brandSoft },
        pressed && { backgroundColor: theme.surfaceMuted },
      ]}
    >
      {/* Leading brand accent bar — position + color, so unread never relies on
          hue alone (a11y). Only painted for unseen rows. */}
      <View style={[styles.accent, unseen && { backgroundColor: theme.status.brand }]} />

      {/* Same StatusIcon treatment as the dashboard ticket card (big colored
          glyph on a transparent box), sized up a touch for the feed. */}
      <View style={styles.avatar}>
        <StatusIcon status={meta.status} size={46} color={meta.color} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label} numberOfLines={2}>
          <Text style={{ color: theme.textSecondary, fontWeight: '500' }}>{meta.label}</Text>
          {meta.emphasis ? (
            <Text style={{ color: theme.text, fontWeight: unseen ? '800' : '700' }}> {meta.emphasis}</Text>
          ) : null}
        </Text>

        <View style={styles.metaRow}>
          <Text style={[styles.ticketRef, { color: meta.color }]} numberOfLines={1}>{ticketRef}</Text>
          <Text style={[styles.metaSep, { color: theme.textTertiary }]}> · </Text>
          <Text style={[styles.metaTitle, { color: theme.textMuted }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.metaTime, { color: theme.textTertiary }]}> · {when}</Text>
        </View>
      </View>

      <View style={styles.rightSlot}>
        {opening ? (
          <ActivityIndicator size="small" color={theme.textTertiary} />
        ) : unseen ? (
          <View style={[styles.unreadDot, { backgroundColor: theme.status.brand }]} />
        ) : (
          <Icon name={icons.chevronRight} size={15} color={theme.textTertiary} />
        )}
      </View>
    </Pressable>
  );
}

// Compact date for the filter pill, e.g. "Jun 19".
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ActivityScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const qc = useQueryClient();
  const { data: itemsData, isLoading: loading, isValidating, refetch, forceRefresh } = useActivityFeed();
  const items = itemsData ?? [];

  const [opening, setOpening]           = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<MaintenanceTicket | null>(null);

  // Filters: free-text ticket search + a from–to date range.
  const [search, setSearch]       = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [dateOpen, setDateOpen]   = useState(false);
  const [anchor, setAnchor]       = useState<AnchorRect | null>(null);
  const dateBtnRef                = useRef<View>(null);

  // Measure the pill's on-screen rect, then open the popover anchored below it.
  const openDatePicker = useCallback(() => {
    dateBtnRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setDateOpen(true);
    });
  }, []);

  // Snapshot of last-seen, read once per focus. null = never visited (or first
  // run) → nothing is flagged unseen, so the whole list never lights up.
  const [lastSeen, setLastSeen] = useState<number | null>(null);

  // On focus: soft revalidation + snapshot last-seen. On blur: stamp "now".
  useFocusEffect(
    useCallback(() => {
      refetch();
      let active = true;
      readLastSeen().then((v) => { if (active) setLastSeen(v); });
      return () => {
        active = false;
        writeLastSeen(Date.now());
      };
    }, [refetch])
  );

  // Tapping a row opens that ticket's detail sheet.
  // Check the TanStack Query cache first — if the ticket was already loaded by
  // the list screen, the sheet opens instantly with no network call.
  const openTicket = useCallback(async (item: ActivityItem) => {
    const cached = qc.getQueryData<MaintenanceTicket>(ticketDetailKey(item.ticketId));
    if (cached) {
      setDetailTicket(cached);
      return;
    }
    setOpening(item.ticketId);
    try {
      const ticket = await getTicketById(item.ticketId);
      if (ticket) setDetailTicket(ticket);
    } catch {
      // getTicketById now throws on transient errors (404 still returns null).
      // A blip when tapping a row simply doesn't open the sheet — no crash; the
      // user can tap again. Avoids an unhandled rejection.
    } finally {
      setOpening(null);
    }
  }, [qc]);

  // Apply the ticket-search + date-range filters to the feed. Search matches the
  // TKT number or the ticket title; the date range is inclusive of whole days.
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startMs = dateRange.start
      ? new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), dateRange.start.getDate()).getTime()
      : null;
    const endMs = dateRange.end
      ? new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate(), 23, 59, 59, 999).getTime()
      : startMs != null
        ? new Date(dateRange.start!.getFullYear(), dateRange.start!.getMonth(), dateRange.start!.getDate(), 23, 59, 59, 999).getTime()
        : null;

    return items.filter((it) => {
      if (q) {
        const ref = it.ticketNumber != null ? `tkt-${it.ticketNumber}` : '';
        const title = (it.ticketTitle ?? '').toLowerCase();
        const num = it.ticketNumber != null ? String(it.ticketNumber) : '';
        if (!ref.includes(q) && !title.includes(q) && !num.includes(q)) return false;
      }
      if (startMs != null && endMs != null) {
        const t = new Date(it.createdAt).getTime();
        if (t < startMs || t > endMs) return false;
      }
      return true;
    });
  }, [items, search, dateRange]);

  const rows = useMemo(() => buildRows(filteredItems, lastSeen), [filteredItems, lastSeen]);
  const isEmpty = !loading && items.length === 0;
  const noMatches = !loading && items.length > 0 && filteredItems.length === 0;

  // Live unread count — items newer than the last-seen snapshot. Drives the
  // header's count line and the "Mark all read" affordance.
  const unreadCount = useMemo(() => {
    if (lastSeen == null) return 0;
    return items.reduce(
      (n, it) => (new Date(it.createdAt).getTime() > lastSeen ? n + 1 : n),
      0,
    );
  }, [items, lastSeen]);

  // Mark all read — stamp last-seen to now so every row clears its unread state
  // instantly (reuses the existing unread logic; no backend call). Persisted so
  // it survives navigating away and back.
  const markAllRead = useCallback(() => {
    const now = Date.now();
    setLastSeen(now);
    writeLastSeen(now);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.isDark ? '#191C23' : '#F2F4F7' }]}>
      {/* Layered brand cloud behind the header (decorative), matching the home tab.
          Lifted a touch so the strong top lobes clear the "Activity" title — it
          sits on the lighter lower scallop / grey, not the saturated blue. */}
      <CloudBackground width={screenW} isDark={theme.isDark} offsetY={-screenW * 0.18} />

      {/* Pinned header — large title + live unread count + mark-all-read action.
          Transparent so the cloud reads through; the feed scrolls in its own area
          below, not behind it. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: theme.text }]}>Activity</Text>

          {unreadCount > 0 && (
            <Pressable
              onPress={markAllRead}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Mark all activity as read"
              style={({ pressed }) => [
                styles.markRead,
                { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Icon name={icons.check} size={15} color={palette.brand} />
              <Text style={[styles.markReadText, { color: palette.brand }]}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {unreadCount > 0
            ? `${unreadCount} unread`
            : items.length > 0
              ? 'You’re all caught up'
              : 'Updates across your tickets'}
        </Text>

        {/* Filters — ticket search pill on top, date-range pill beneath. Styled
            to mirror the dashboard's search/help pills (white surface, hairline
            border, search icon, clear affordance). */}
        <View style={styles.filterBlock}>
          <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Icon name={icons.search} size={17} color={theme.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by ticket"
              placeholderTextColor={theme.textTertiary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Icon name={icons.removeItem} size={16} color={theme.textTertiary} />
              </Pressable>
            )}
          </View>

          <Pressable
            ref={dateBtnRef}
            collapsable={false}
            onPress={openDatePicker}
            style={({ pressed }) => [
              styles.dateBtn,
              {
                backgroundColor: dateRange.start ? palette.brandSoft : theme.surface,
                borderColor: dateRange.start ? palette.brand : theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Icon name={icons.calendar} size={16} color={dateRange.start ? palette.brand : theme.textSecondary} />
            <Text
              style={[styles.dateBtnText, { color: dateRange.start ? palette.brand : theme.textSecondary }]}
              numberOfLines={1}
            >
              {dateRange.start
                ? dateRange.end
                  ? `${fmtShort(dateRange.start)} – ${fmtShort(dateRange.end)}`
                  : fmtShort(dateRange.start)
                : 'Any date'}
            </Text>
            {dateRange.start ? (
              <Pressable
                onPress={() => setDateRange({ start: null, end: null })}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Icon name={icons.removeItem} size={15} color={palette.brand} />
              </Pressable>
            ) : (
              <Icon name={icons.chevronDown} size={15} color={theme.textTertiary} />
            )}
          </Pressable>
        </View>
      </View>

      <AppScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !loading}
            onRefresh={forceRefresh}
            tintColor={palette.brand}
            colors={[palette.brand]}
          />
        }
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.brand} />
          </View>
        ) : isEmpty ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: theme.surfaceMuted }]}>
              <Icon name={icons.tabActivityLine} size={26} color={theme.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No activity yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              Updates to your tickets — assignments, reports, approvals and follow-ups — will show up here.
            </Text>
          </View>
        ) : noMatches ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: theme.surfaceMuted }]}>
              <Icon name={icons.search} size={26} color={theme.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No matching activity</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
              No events match your filters. Try a different ticket or date range.
            </Text>
          </View>
        ) : (
          <View style={styles.feed}>
            {rows.map((row, i) => {
              if (row.kind === 'section') {
                return (
                  <Text
                    key={row.key}
                    style={[
                      styles.sectionLabel,
                      { color: theme.textTertiary },
                      i === 0 && styles.sectionLabelFirst,
                    ]}
                  >
                    {row.label}
                  </Text>
                );
              }
              // Hairline divider between consecutive rows; suppressed before a
              // section break or the very last row, so groups read as blocks.
              const next = rows[i + 1];
              const showDivider = next != null && next.kind === 'event';
              return (
                <FadeSlideIn key={row.key} delay={Math.min(i, 8) * stagger.list}>
                  <NotificationRow
                    item={row.item}
                    unseen={row.unseen}
                    opening={opening === row.item.ticketId}
                    onPress={() => openTicket(row.item)}
                  />
                  {showDivider && (
                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />
                  )}
                </FadeSlideIn>
              );
            })}
          </View>
        )}
      </AppScrollView>

      <TicketDetailSheet ticket={detailTicket} onClose={() => setDetailTicket(null)} />

      <DateRangePopover
        visible={dateOpen}
        anchor={anchor}
        value={dateRange}
        onClose={() => setDateOpen(false)}
        onApply={setDateRange}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const AVATAR = 48;       // dashboard uses 40; the feed sizes up for legibility

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    // paddingBottom is handled by AppScrollView (tabBarFootprint + 24px).
  },

  // Pinned header — owns its horizontal padding + a hairline-free bottom gap.
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  // Title row: large title left, mark-all-read action right, baseline-aligned.
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: typography.title.size,
    lineHeight: typography.title.lineHeight,
    fontWeight: typography.title.weight,
    letterSpacing: typography.title.letterSpacing,
  },
  // Subtle pill action — white surface, hairline border, brand label. Mirrors
  // the dashboard's help/search pills so the two screens feel like one product.
  markRead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  markReadText: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '500',
    marginTop: spacing.xxs,
  },

  // Filters — search pill over date-range pill. Mirrors the dashboard's search
  // pill (white surface, hairline border) so the two screens read as one product.
  filterBlock: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 42,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    paddingVertical: 0,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 42,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dateBtnText: {
    flex: 1,
    fontSize: typography.calloutMed.size,
    lineHeight: typography.calloutMed.lineHeight,
    fontWeight: '600',
  },

  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },

  // Flat full-bleed notification feed on the grey backdrop (no white panel).
  // Rows pull to the screen edge so their pressed/unseen wash spans full width.
  feed: {
    marginHorizontal: -spacing.md,
  },

  // Quiet overline header — uppercase, tracked, tertiary. Reads as a divider
  // label, not a heading that competes with the row text.
  sectionLabel: {
    fontSize: typography.overline.size,
    lineHeight: typography.overline.lineHeight,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xxs,
    marginLeft: spacing.md,
  },
  sectionLabelFirst: {
    marginTop: spacing.xs,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  // Leading 3px accent bar — only colored for unseen rows (position + hue).
  accent: {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 4,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: 'transparent',
  },

  // Avatar — IDENTICAL to the dashboard ticket card (index.tsx): a transparent
  // 40×40 box holding a big 38px colored StatusIcon glyph. No fill, no shadow.
  avatar: {
    width: AVATAR, height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  label: {
    fontSize: typography.bodyMed.size,      // 16 — legible at a quick glance
    lineHeight: typography.bodyMed.lineHeight,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  ticketRef: {
    fontSize: typography.caption.size,      // 13 — clearly smaller than the event phrase
    lineHeight: typography.caption.lineHeight,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  metaSep: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    flexShrink: 0,
  },
  metaTitle: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontWeight: '400',
    flexShrink: 1,
  },
  metaTime: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },

  rightSlot: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: 9, height: 9,
    borderRadius: 4.5,
  },
  // Hairline between consecutive rows, inset to start past the avatar so the
  // feed reads as one column (FB/inbox convention).
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + AVATAR + spacing.sm,
  },

  // Empty
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  emptyIconWrap: {
    width: 56, height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    marginBottom: spacing.xxs + 2,
  },
  emptySub: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    textAlign: 'center',
    maxWidth: 300,
  },
});
