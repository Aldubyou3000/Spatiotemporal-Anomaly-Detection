import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'lucide-react-native';
import { setStatusBarStyle } from 'expo-status-bar';

import { useTabBarFootprint } from '@/constants/tabBar';
import { Text } from '@/components/Themed';
import Icon from '@/components/Icon';
import StatusIcon from '@/components/StatusIcon';
import TicketDetailSheet from '@/components/TicketDetailSheet';
import DateRangePopover, { type AnchorRect } from '@/components/DateRangePopover';
import { type DateRange } from '@/components/RangeCalendar';
import { activityMeta, isWithin24h, relativeTime } from '@/constants/activityEvents';
import { icons } from '@/constants/icons';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useActivitySeenAt } from '@/hooks/useActivitySeen';
import { useTheme } from '@/hooks/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { useActivityFeed, ticketDetailKey } from '@/hooks/useTickets';
import { markActivitySeen } from '@/lib/activitySeen';
import {
  ActivityItem,
  getTicketById,
  MaintenanceTicket,
} from '@/services/api';

// "New since you last looked" is tracked on-device via the shared activity-seen
// store (lib/activitySeen.ts): the epoch-ms of when the user last *left* this
// tab. Any item newer than that renders as unseen here, and drives the bottom-nav
// "new activity" dot. We stamp "now" on blur (see the focus effect below).

// The activity feed renders DIRECTLY — no entrance animation. A staggered
// fade/slide cascade on a virtualized list read as sluggish/low-fps (the eye
// catches the trailing rows arriving late), so rows just appear, like Telegram /
// inbox apps. Scrolling and tab-return are instant.

// A flattened render list: a section label or a notification row.
type Row =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'event';   key: string; item: ActivityItem; unseen: boolean };

// Split newest-first items into "New" (last 24h) and "Earlier", flagging each
// against the last-seen snapshot. Returns a flat list for the FlatList; empty
// buckets emit no header.
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
// memo'd: with the feed virtualized (FlatList recycles rows), this stops a row
// from re-rendering unless its own props change.
const NotificationRow = memo(function NotificationRow({
  item, unseen, opening, onPress,
}: {
  item: ActivityItem;
  unseen: boolean;
  opening: boolean;
  // Receives the item so the parent can pass ONE stable handler (no per-row
  // closure) — otherwise a fresh arrow each render defeats this memo and every
  // visible row re-renders on scroll.
  onPress: (item: ActivityItem) => void;
}) {
  const theme = useTheme();
  const meta  = activityMeta(item.event, item.actor, theme.status);

  const ticketRef = item.ticketNumber != null ? `TKT-${item.ticketNumber}` : 'Ticket';
  const title     = item.ticketTitle?.trim() || 'Untitled ticket';
  const when      = relativeTime(item.createdAt);

  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  return (
    <Pressable
      onPress={handlePress}
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
});

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ActivityScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarFootprint = useTabBarFootprint();

  // Neutral screen background for the scrolling feed — rows sit on this so the
  // grey text stays legible (the header above is a solid brand band).
  const screenBg = theme.isDark ? '#191C23' : '#F2F4F7';

  const qc = useQueryClient();
  const { data: itemsData, isLoading: loading, isValidating, refetch, forceRefresh } = useActivityFeed();
  const items = itemsData ?? [];

  const [opening, setOpening]           = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<MaintenanceTicket | null>(null);

  // Filters: free-text ticket search + a from–to date range.
  const [search, setSearch]       = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
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

  // Live "last looked at Activity" timestamp from the shared store. It stays
  // stable while this tab is open (so rows keep their "new" mark while you read),
  // and only advances when we stamp "now" on blur below.
  const lastSeen = useActivitySeenAt();

  // On focus: set status-bar tint + soft revalidation. On blur: stamp "now" so
  // the rows (and the bottom-nav dot) clear. No cloud here, so the bar sits on
  // the neutral screenBg → icons follow the theme. Status bar set imperatively
  // (see index.tsx note on expo/router#754).
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(theme.isDark ? 'light' : 'dark');
      refetch();
      return () => {
        markActivitySeen(Date.now());
      };
    }, [refetch, theme.isDark])
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

  const keyExtractor = useCallback((row: Row) => row.key, []);

  // One row of the virtualized feed: either a section overline or a notification
  // (with a hairline divider before the next event). Rendered directly — no
  // entrance animation — so the feed presents instantly on open.
  const renderItem = useCallback<ListRenderItem<Row>>(({ item: row, index: i }) => {
    if (row.kind === 'section') {
      return (
        <Text
          style={[
            styles.sectionLabel,
            { color: theme.text },     // visible primary colour, not faint grey
            i === 0 && styles.sectionLabelFirst,
          ]}
        >
          {row.label}
        </Text>
      );
    }
    // Hairline divider between consecutive rows; suppressed before a section
    // break or the very last row, so groups read as blocks.
    const next = rows[i + 1];
    const showDivider = next != null && next.kind === 'event';
    return (
      <View style={styles.feedRow}>
        <NotificationRow
          item={row.item}
          unseen={row.unseen}
          opening={opening === row.item.ticketId}
          onPress={openTicket}
        />
        {showDivider && (
          <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        )}
      </View>
    );
  }, [rows, theme.textTertiary, theme.divider, opening, openTicket]);

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* Pinned header — neutral surface; the brand accent lives on the search
          bar itself, not the header background. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, backgroundColor: screenBg }]}>
        {/* Filters — search pill + calendar icon button on one row. */}
        <View style={styles.filterBlock}>
          <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: searchFocused ? palette.brand : theme.border }]}>
            <Ionicons name="search" size={22} color={searchFocused ? palette.brand : theme.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by ticket"
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
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
            hitSlop={6}
            style={({ pressed }) => [
              styles.dateIconBtn,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityLabel={dateRange.start ? 'Date filter active — change date' : 'Filter by date'}
          >
            <Calendar
              size={21}
              color={dateRange.start ? palette.brand : theme.textSecondary}
              strokeWidth={2.25}
            />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={loading ? [] : rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={{ flex: 1, backgroundColor: screenBg }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarFootprint + 24 },
        ]}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={8}
        windowSize={7}
        // Spread row mounting across more, smaller batches so no single frame
        // stalls building a big chunk of rows during a fast fling.
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !loading}
            onRefresh={forceRefresh}
            tintColor={palette.brand}
            colors={[palette.brand]}
          />
        }
        ListEmptyComponent={
          loading ? (
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
          ) : null
        }
      />

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
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    // paddingBottom is set inline on the FlatList (tabBarFootprint + 24px).
  },

  // Pinned header — solid brand band (color + top inset set inline). Hosts the
  // white search pill + calendar button.
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Filters — search pill over date-range pill. Mirrors the dashboard's search
  // pill (white surface, hairline border) so the two screens read as one product.
  filterBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchBox: {
    flex: 1,
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
    fontWeight: '400',
    paddingVertical: 0,
  },
  dateIconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },

  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },

  // Flat full-bleed notification feed on the grey backdrop (no white panel).
  // Each row pulls to the screen edge (cancels the list's horizontal padding) so
  // its pressed/unseen wash spans full width. Applied per-row now that the feed
  // is a FlatList — the empty/loading states keep the padded, centered layout.
  feedRow: {
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
    // No feedRow / negative margin here — the header sits inside the list's
    // normal padding, so marginLeft:0 lines its left edge up with the
    // notification rows' leading edge (the avatar), instead of being pushed in.
    marginLeft: 0,
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
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
