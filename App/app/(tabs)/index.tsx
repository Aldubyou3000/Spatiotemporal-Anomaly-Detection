import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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

import AppScrollView from '@/components/AppScrollView';
import CloudBackground from '@/components/CloudBackground';
import BottomSheet from '@/components/BottomSheet';
import Icon from '@/components/Icon';
import StatusIcon from '@/components/StatusIcon';
import { Text } from '@/components/Themed';
import TicketDetailSheet from '@/components/TicketDetailSheet';
import TicketSkeleton from '@/components/TicketSkeleton';
import { duration, ease, spring, stagger } from '@/constants/Motion';
import { icons, type IconName } from '@/constants/icons';
import { elevation, palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTicketList } from '@/hooks/useTickets';
import { MaintenanceTicket } from '@/services/api';
import { STATUS_LABEL, PRIORITY_LABEL, statusColor, priorityColor, byImportance } from '@/constants/ticketStatus';

type TicketTab = 'assigned' | 'in-progress' | 'submitted' | 'follow_up' | 'closed';
type Segment = 'active' | 'archive';

// Which db statuses belong under each tab. 'created' is a synonym for assigned.
const TAB_STATUSES: Record<TicketTab, string[]> = {
  assigned:      ['created', 'assigned'],
  'in-progress': ['in-progress'],
  submitted:     ['pending_review'],
  follow_up:     ['follow_up'],
  closed:        ['verified', 'cancelled'],
};

const TAB_LABEL: Record<TicketTab, string> = {
  assigned:      'Assigned',
  'in-progress': 'In Progress',
  submitted:     'Submitted',
  follow_up:     'Follow-up',
  closed:        'Closed',
};

// The two-level filter: a segment scopes which status chips are shown.
//   active  → work the technician must act on
//   archive → states they only look back at
const SEGMENT_TABS: Record<Segment, TicketTab[]> = {
  active:  ['assigned', 'in-progress', 'follow_up'],
  archive: ['submitted', 'closed'],
};

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'active',  label: 'Active' },
  { key: 'archive', label: 'Archive' },
];

// Relative-time helper — mirrors the web (page.tsx fmtRelative).
function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Entrance animation wrapper ──────────────────────────────────────────────
// Accepts an optional style so the animated view can BE the shadowed surface.
// Animating opacity on a separate inner shadowed view makes the shadow render as
// a hard rectangular box mid-fade (both iOS soft-shadow + Android elevation). By
// casting the shadow from this same animated, opaque, rounded surface, no box.
//
// Plays the fade+slide ONCE per app session. A module-level flag (reset only on
// app restart, when the JS context tears down) guards it: the first time the
// feed paints we animate; every later tab return renders instantly in the final
// state. This is the Instagram/Facebook feel — using useFocusEffect here would
// replay the animation on every focus, which looks exactly like a reload.
//
// Each card snapshots the flag into a ref BEFORE any sibling's effect flips it,
// so all cards in one render pass share the same decision. Flipping the flag
// inside each effect without snapshotting raced: only the first card animated
// and the rest stayed at opacity:0 (invisible).
let hasAnimatedIn = false;

function FadeSlideIn({
  delay, children, style: outerStyle,
}: {
  delay: number;
  children: React.ReactNode;
  style?: object;
}) {
  // Locked in on first render; identical for every card mounting together.
  const shouldAnimate = useRef(!hasAnimatedIn).current;

  const opacity    = useSharedValue(shouldAnimate ? 0 : 1);
  const translateY = useSharedValue(shouldAnimate ? 10 : 0);

  useEffect(() => {
    if (!shouldAnimate) return; // already shown this session → stay instant
    opacity.value    = withDelay(delay, withTiming(1, { duration: duration.normal, easing: ease }));
    translateY.value = withDelay(delay, withSpring(0, spring.gentle));
    hasAnimatedIn = true; // safe to set after our own decision is captured
  }, []); // mount-only; never re-fires on tab focus

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[outerStyle, animStyle]}>{children}</Animated.View>;
}

// ─── Segmented control ───────────────────────────────────────────────────────
// Full-width frosted track with a solid white "thumb" that slides under the
// active half (iOS Settings / Material toggle style). Both tabs are equal-width
// (flex:1), so the thumb is just half the measured track width, offset by the
// active index — no per-tab measuring needed. Solid filled thumb keeps it
// visually distinct from the pill chips below.
function Segmented({
  value, onChange, activeCount,
}: {
  value: Segment;
  onChange: (s: Segment) => void;
  activeCount: number;
}) {
  const [trackW, setTrackW] = useState(0);
  const index = SEGMENTS.findIndex((s) => s.key === value);

  const SEG_PAD = 4;                                  // inner track padding
  const thumbW = trackW > 0 ? (trackW - SEG_PAD * 2) / SEGMENTS.length : 0;

  const thumbX = useSharedValue(0);
  useEffect(() => {
    thumbX.value = withSpring(SEG_PAD + thumbW * index, spring.snappy);
  }, [index, thumbW]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
    width: thumbW,
  }));

  return (
    <View
      style={styles.segTrack}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      {/* Sliding white thumb — rendered first so labels sit on top of it */}
      {thumbW > 0 && (
        <Animated.View style={[styles.segThumb, thumbStyle]} pointerEvents="none" />
      )}

      {SEGMENTS.map(({ key, label }) => {
        const isActive = value === key;
        const showCount = key === 'active' && activeCount > 0;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: false }}
            style={({ pressed }) => [
              styles.segTab,
              Platform.OS === 'ios' && pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[
                styles.segLabel,
                {
                  color: isActive ? palette.brand : 'rgba(255,255,255,0.85)',
                  fontWeight: isActive ? '700' : '600',
                },
              ]}
            >
              {label}
            </Text>
            {showCount && (
              <View style={[styles.segCount, {
                backgroundColor: isActive ? palette.brand : 'rgba(255,255,255,0.25)',
              }]}>
                <Text style={[styles.segCountText, { color: '#FFFFFF' }]}>
                  {activeCount}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [segment, setSegment]           = useState<Segment>('active');
  const [activeTab, setActiveTab]       = useState<TicketTab>('assigned');
  const [detailTicket, setDetailTicket] = useState<MaintenanceTicket | null>(null);
  const [search, setSearch]             = useState('');
  const [showTutorial, setShowTutorial] = useState(false);

  const { data: ticketsData, isLoading, isValidating, refetch, forceRefresh } = useTicketList();
  const tickets = ticketsData ?? [];

  // Soft revalidation on tab focus — TanStack respects staleTime, so this is
  // a no-op when data is fresh (< 30s old) and a quiet background fetch otherwise.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Switching segment moves the list to that segment's first status, so the
  // visible list never shows a tab whose chip has been hidden.
  const changeSegment = (seg: Segment) => {
    setSegment(seg);
    setActiveTab(SEGMENT_TABS[seg][0]);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  // Count per tab in a single pass.
  const counts = useMemo(() => {
    const c: Record<TicketTab, number> = {
      assigned: 0, 'in-progress': 0, submitted: 0, follow_up: 0, closed: 0,
    };
    const tabs = Object.keys(TAB_STATUSES) as TicketTab[];
    for (const t of tickets) {
      for (const tab of tabs) {
        if (TAB_STATUSES[tab].includes(t.dbStatus)) { c[tab]++; break; }
      }
    }
    return c;
  }, [tickets]);

  // "to do" count for the hero — work that still needs the technician.
  const totalActive = counts.assigned + counts['in-progress'] + counts.follow_up;

  // A non-empty query puts the screen in "search mode": the two-level tab/chip
  // filters are bypassed and the query runs globally across ALL tickets (Active
  // + Archive). Clearing the box reverts to the exact tab/chip the user was on.
  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  // Tickets to render. In search mode: every ticket matching the query, across
  // all statuses. Otherwise: the active tab's bucket. Both ordered by importance.
  const visibleTickets = useMemo(() => {
    const base = isSearching
      ? tickets.filter((t) => {
          const haystack = [
            t.title,
            t.stationId,
            `tkt-${t.ticketNumber}`,
            String(t.ticketNumber),
          ].join(' ').toLowerCase();
          return haystack.includes(query);
        })
      : tickets.filter((t) => TAB_STATUSES[activeTab].includes(t.dbStatus));
    return base.sort(byImportance);
  }, [tickets, activeTab, isSearching, query]);

  // ── Soft Card (Apple Wallet / Airbnb feel) ──────────────────────────────────
  // White surface, 1px faint border, 16px radius, NO shadow/elevation, generous
  // padding. Status/priority are ghost indicators (tinted text + dot), never
  // solid pills. The whole card taps into the detail sheet; an optional bottom
  // text-link hints the next action and also opens the sheet (where the CTA is).
  const renderCard = (ticket: MaintenanceTicket, i: number, inSearch = false) => {
    const dbId      = ticket._dbId ?? ticket.ticketId;
    const status    = ticket.dbStatus ?? 'assigned';
    const sc        = statusColor(status, theme.status);
    const priority  = ticket.priority ?? 'low';
    const pri       = priorityColor(priority, theme.status);
    const fuCount   = ticket.followUpCount ?? 0;

    const isClosed = status === 'verified' || status === 'cancelled';
    const titleColor = isClosed ? theme.textMuted : theme.text;

    // Muted metadata line: station · zone · TKT-N · time · revisits.
    const meta = [
      ticket.stationId,
      ticket.anomalyZone ? `Z-${ticket.anomalyZone}` : null,
      `TKT-${ticket.ticketNumber}`,
      fmtRelative(ticket.updatedAt),
      fuCount > 0 ? `Revisit ×${fuCount}` : null,
    ].filter(Boolean).join('  ·  ');

    return (
      <FadeSlideIn
        key={dbId}
        delay={i * stagger.list}
        style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}
      >
        <Pressable
          onPress={() => setDetailTicket(ticket)}
          android_ripple={{ color: theme.surfaceMuted }}
          style={({ pressed }) => [
            styles.cardInner,
            Platform.OS === 'ios' && pressed && { backgroundColor: theme.surfaceMuted },
          ]}
        >
          {/* Header: status avatar + title + ghost status / priority indicators */}
          <View style={styles.cardHead}>
            <View style={styles.avatar}>
              <StatusIcon status={status} size={46} color={sc.color} />
            </View>

            <View style={styles.cardHeadText}>
              <Text
                style={[styles.cardTitle, { color: titleColor }]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {ticket.title}
              </Text>

              {/* Status indicator. In the normal tabbed list it's a flat ghost
                  (dot + tinted text). In a GLOBAL search result the status is
                  the key context (rows span every tab), so it's promoted to a
                  filled soft-token pill for legibility. Priority stays ghost. */}
              <View style={styles.ghostRow}>
                {inSearch ? (
                  <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusPillText, { color: sc.color }]}>
                      {STATUS_LABEL[status] ?? status}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={[styles.ghostDot, { backgroundColor: sc.color }]} />
                    <Text style={[styles.ghostText, { color: sc.color }]}>
                      {STATUS_LABEL[status] ?? status}
                    </Text>
                    <Text style={[styles.ghostSep, { color: theme.textTertiary }]}>·</Text>
                  </>
                )}
                <Text style={[styles.ghostText, { color: pri.color }]}>
                  {PRIORITY_LABEL[priority] ?? priority}
                </Text>
              </View>
            </View>
          </View>

          {/* Metadata line — muted gray, middle dots */}
          <Text style={[styles.cardMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
          {/* No start/submit affordance on the list card — those actions live
              exclusively inside the ticket detail sheet. The card only opens it. */}
        </Pressable>
      </FadeSlideIn>
    );
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  const renderEmpty = () => {
    // A search with no matches is a global "no results" state (search spans all
    // tabs), not a per-tab empty. Consumer-app placeholder: icon → title → hint.
    const c = isSearching
      ? {
          icon: icons.search,
          title: 'No tickets found',
          sub: `We couldn't find any results matching "${search.trim()}". Check your spelling or asset code.`,
        }
      : ({
          'assigned':    { icon: icons.assigned,   title: 'Nothing assigned',     sub: 'Tickets assigned to you will appear here.' },
          'in-progress': { icon: icons.startWork,  title: 'Nothing in progress',  sub: 'Tickets you start working on will appear here.' },
          'submitted':   { icon: icons.reportDoc,  title: 'Nothing submitted',    sub: 'Reports awaiting analyst review will appear here.' },
          'follow_up':   { icon: icons.followUp,   title: 'No follow-ups',        sub: 'Tickets sent back for another visit will appear here.' },
          'closed':      { icon: icons.success,    title: 'No closed tickets',    sub: 'Verified and cancelled tickets will appear here.' },
        } as Record<TicketTab, { icon: IconName; title: string; sub: string }>)[activeTab];

    return (
      <View style={styles.empty}>
        <View style={[styles.emptyIconWrap, { backgroundColor: theme.surfaceMuted }]}>
          <Icon name={c.icon} size={26} color={theme.textSecondary} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{c.title}</Text>
        <Text style={[styles.emptySub, { color: theme.textMuted }]}>{c.sub}</Text>
      </View>
    );
  };

  const isEmpty = visibleTickets.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.isDark ? '#191C23' : '#F2F4F7' }]}>
      {/* Layered brand cloud at the top (decorative). */}
      <CloudBackground width={screenW} isDark={theme.isDark} />

      {/* ── Pinned header controls ────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name={icons.search} size={17} color={theme.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search tickets"
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
          onPress={() => setShowTutorial(true)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.helpBtn,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name={icons.help} size={19} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Two-level filter — hidden while searching */}
      {!isSearching && (
        <View style={styles.filterBlock}>
          <Segmented value={segment} onChange={changeSegment} activeCount={totalActive} />

          <View style={styles.chipRow}>
            {SEGMENT_TABS[segment].map((key) => {
              const isActive = activeTab === key;
              const count = counts[key];
              // Each chip carries its status's own hue (single source of truth:
              // statusColor). The representative db status for a tab is the first
              // in its TAB_STATUSES list.
              const hue = statusColor(TAB_STATUSES[key][0]).color;
              return (
                <Pressable
                  key={key}
                  onPress={() => setActiveTab(key)}
                  android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: false }}
                  style={({ pressed }) => [
                    styles.chip,
                    // Active = solid white pill; the status hue colors its text +
                    // count badge, so it reads as a meaningful, legible figure on
                    // any part of the gradient. Inactive = recessed translucent.
                    isActive
                      ? styles.chipActive
                      : styles.chipInactive,
                    Platform.OS === 'ios' && pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      isActive
                        ? { color: hue, fontWeight: '700' }
                        : styles.chipLabelInactive,
                    ]}
                    numberOfLines={1}
                  >
                    {TAB_LABEL[key]}
                  </Text>
                  {count > 0 ? (
                    <View style={[
                      styles.chipCount,
                      isActive ? { backgroundColor: hue } : styles.chipCountInactive,
                    ]}>
                      <Text style={[styles.chipCountText, isActive ? styles.chipCountTextActive : styles.chipCountTextInactive]}>
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Ticket list — transparent so the gradient shows through ─────────── */}
      <AppScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={[styles.scrollContent, { paddingTop: spacing.xs, flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !isLoading}
            onRefresh={forceRefresh}
            tintColor={palette.brand}
            colors={[palette.brand]}
          />
        }
      >
        <View style={{ flexGrow: 1 }}>
          {isLoading ? (
            <View style={styles.listPad}>
              <TicketSkeleton count={3} />
            </View>
          ) : isEmpty ? (
            renderEmpty()
          ) : (
            <View style={styles.listPad}>
              {visibleTickets.map((t, idx) => renderCard(t, idx, isSearching))}
            </View>
          )}
        </View>
      </AppScrollView>

      {/* App tutorial (placeholder) */}
      <BottomSheet
        visible={showTutorial}
        onClose={() => setShowTutorial(false)}
        title="App Tutorial"
        message="A guided walkthrough of the app is coming soon. It'll show you how to find assigned tickets, start work on site, and submit inspection reports."
        actions={[
          { label: 'Got it', variant: 'primary', onPress: () => {} },
        ]}
      />

      {/* Full ticket detail — also hosts the Start Working / Submit Report CTA */}
      <TicketDetailSheet
        ticket={detailTicket}
        onClose={() => setDetailTicket(null)}
        onAction={forceRefresh}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    // Horizontal gutters live on the inner blocks (filterBlock, listPad) so the
    // segmented underline and cards align. paddingBottom is handled by
    // AppScrollView (tabBarFootprint + 24px).
  },
  // Horizontal gutters for the card list + loading skeletons.
  listPad: { paddingHorizontal: spacing.md },

  // Search + tutorial top bar ─────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 42,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,   // white pill on grey backdrop — faint border for definition
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    paddingVertical: 0,
  },
  helpBtn: {
    width: 42, height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,   // matches the white search pill on grey
  },

  // Two-level filter ──────────────────────────────────────────────────────
  filterBlock: {
    // Pinned above the scrolling list — only the tickets scroll.
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Active / Archive — full-width frosted track with a sliding solid white
  // thumb (iOS Settings / Material toggle). Solid filled thumb keeps it
  // visually distinct from the pill chips below.
  segTrack: {
    flexDirection: 'row',
    position: 'relative',
    padding: 4,                       // == SEG_PAD in the component
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  segThumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: radius.sm + 1,
    backgroundColor: '#FFFFFF',
    ...elevation.sm,
  },
  segTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  segLabel: {
    fontSize: typography.calloutMed.size,   // 15
    lineHeight: typography.calloutMed.lineHeight,
    letterSpacing: -0.1,
  },
  segCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segCountText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },

  // Status chips — each sizes to its own label (content-width, left-aligned),
  // so the row reads as filter tags, not a second segmented toggle.
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md - 2,   // 14 — a touch roomier now that chips hug content
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    minHeight: 36,
  },
  // Active = solid white pill; status hue colors the label + count (inline).
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
  },
  // Inactive = darker blue overlay → reads as recessed into the gradient,
  // never as a second white pill. Hairline white edge for definition only.
  chipInactive: {
    backgroundColor: 'rgba(13,42,110,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  chipLabel: {
    fontSize: typography.calloutMed.size,   // 15
    lineHeight: typography.calloutMed.lineHeight,
  },
  chipLabelInactive: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  chipCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountInactive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  chipCountText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  chipCountTextActive: {
    color: '#FFFFFF',
  },
  chipCountTextInactive: {
    color: 'rgba(255,255,255,0.9)',
  },

  // ── Soft Card ──────────────────────────────────────────────────────────────
  // White surface, 16px radius, soft shadow (two-tone: lifts off the grey
  // backdrop, no border). Cards self-separate with marginBottom. overflow:hidden
  // clips the Android ripple and the inner pressed wash to the rounded corners.
  card: {
    borderRadius: radius.lg,             // 16
    marginBottom: spacing.sm + 2,        // 14px gap between cards
    ...elevation.md,
  },
  cardInner: {
    padding: spacing.md + 2,             // 18px generous internal padding
    gap: spacing.sm,
    borderRadius: radius.lg,             // match card; clips ripple/pressed wash
    overflow: 'hidden',                  // here (not on card) so iOS shadow shows
  },
  // Header: avatar + title/ghost-indicator column.
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',            // avatar pins to the top of the title
    gap: spacing.sm + 2,                 // 14px avatar → text
  },
  avatar: {
    width: 48, height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeadText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  // Ghost status indicator — colored dot + tinted text, no pill background.
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  ghostDot: { width: 7, height: 7, borderRadius: 3.5 },
  ghostText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  ghostSep: { fontSize: 13, marginHorizontal: 1 },
  // Soft-token status pill — search results only. Filled soft background +
  // status-colored label so the lifecycle stage reads at a glance across tabs.
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Muted metadata line — middle-dot separated.
  cardMeta: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },

  // Empty ─────────────────────────────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  emptyIconWrap: {
    width: 64, height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md + 4,
  },
  emptyTitle: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    marginBottom: spacing.xs,
  },
  emptySub: {
    fontSize: typography.body.size,          // bumped from callout → body for readability
    lineHeight: typography.body.lineHeight,
    textAlign: 'center',
    maxWidth: 260,
  },
});
