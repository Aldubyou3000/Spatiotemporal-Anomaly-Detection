import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type ListRenderItem,
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

import { Ionicons } from '@expo/vector-icons';
import { CircleQuestionMark } from 'lucide-react-native';
import { setStatusBarStyle } from 'expo-status-bar';

import { useTabBarFootprint } from '@/constants/tabBar';
import CloudBackground from '@/components/CloudBackground';
import Icon from '@/components/Icon';
import SpotlightTour from '@/components/SpotlightTour';
import StatusIcon from '@/components/StatusIcon';
import { Text } from '@/components/Themed';
import TicketDetailSheet from '@/components/TicketDetailSheet';
import TicketSkeleton from '@/components/TicketSkeleton';
import { easeOut, spring } from '@/constants/Motion';
import { icons, type IconName } from '@/constants/icons';
import { elevation, palette, radius, spacing, typography } from '@/constants/theme';
import { type TourTargetKey } from '@/constants/tourSteps';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { useTicketList } from '@/hooks/useTickets';
import { navTargetRef } from '@/lib/tourTargets';
import { readTutorialSeen, writeTutorialSeen } from '@/lib/tutorialSeen';
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

// Per-card entrance duration. Short + ease-out so the cascade feels snappy, not
// a slow drift. Paired with a tight CARD_STAGGER below so even the last visible
// card has fully arrived quickly.
const ENTRANCE_MS = 190;
const CARD_STAGGER = 22; // ms between successive cards (snappy, not a slow drift)

function FadeSlideIn({
  delay, children, style: outerStyle,
}: {
  delay: number;
  children: React.ReactNode;
  style?: object;
}) {
  const reducedMotion = useReducedMotion();
  // Locked in on first render; identical for every card mounting together.
  const firstPaint = useRef(!hasAnimatedIn).current;
  // Animate only on the session's first paint AND when motion is allowed. Under
  // reduce-motion / battery-saver the card renders in its final state instantly.
  const shouldAnimate = firstPaint && !reducedMotion;

  // Cards that don't animate (every tab return after the first paint, every card
  // recycled in during scroll, and all cards under reduce-motion) render as a
  // PLAIN View — never an Animated.View. Keeping a recycled card on Reanimated's
  // worklet path for its whole life churns the animation pool as the virtualized
  // list scrolls. Only the first screenful, on the very first paint, animates.
  if (!shouldAnimate) {
    return <View style={outerStyle}>{children}</View>;
  }
  return <FadeSlideInAnimated delay={delay} style={outerStyle}>{children}</FadeSlideInAnimated>;
}

// The animated variant — only ever mounted for the first screenful on first
// paint. Hooks live here so the static path above calls no Reanimated hooks.
function FadeSlideInAnimated({
  delay, children, style: outerStyle,
}: {
  delay: number;
  children: React.ReactNode;
  style?: object;
}) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    // Timing curve on both axes (no spring) so cost is identical at any refresh
    // rate. An ease-OUT curve (fast start, gentle settle) reads as snappier and
    // smoother than the symmetric `ease` — the card arrives quickly instead of
    // appearing to drift in. Short distance (8px) + short duration keeps motion
    // minimal so there's no perceived blur/lag on the trailing cards.
    opacity.value    = withDelay(delay, withTiming(1, { duration: ENTRANCE_MS, easing: easeOut }));
    translateY.value = withDelay(delay, withTiming(0, { duration: ENTRANCE_MS, easing: easeOut }));
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

// ─── Ticket card ─────────────────────────────────────────────────────────────
// Soft Card (Apple Wallet / Airbnb feel): white surface, 16px radius, soft
// shadow. The whole card opens the detail sheet.
//
// memo'd so a virtualized scroll recycle / a parent re-render (search typing,
// segment switch) doesn't re-render every card — only ones whose own props
// change. Reads `theme` via useTheme (stable ref, see hooks/useTheme.ts) and
// takes ONE stable onPress(ticket) handler instead of a per-card closure, so the
// memo isn't defeated by a fresh arrow each render.
const TicketCard = memo(function TicketCard({
  ticket, index, inSearch, onPress,
}: {
  ticket: MaintenanceTicket;
  index: number;
  inSearch: boolean;
  onPress: (ticket: MaintenanceTicket) => void;
}) {
  const theme = useTheme();

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

  const handlePress = useCallback(() => onPress(ticket), [onPress, ticket]);

  return (
    <FadeSlideIn
      // Cap the stagger at the first 8 cards — beyond that the delay would only
      // grow without being seen (later cards are off-screen until scrolled to).
      delay={Math.min(index, 8) * CARD_STAGGER}
      style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}
    >
      <Pressable
        onPress={handlePress}
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
});

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarFootprint = useTabBarFootprint();
  const reducedMotion = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const [segment, setSegment]           = useState<Segment>('active');
  const [activeTab, setActiveTab]       = useState<TicketTab>('assigned');
  const [detailTicket, setDetailTicket] = useState<MaintenanceTicket | null>(null);
  const [search, setSearch]             = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [tourVisible, setTourVisible]   = useState(false);

  // Spotlight-tour targets — measured by <SpotlightTour> via measureInWindow.
  const searchRef  = useRef<View>(null);
  const filtersRef = useRef<View>(null);
  const listRef    = useRef<View>(null);
  const helpRef    = useRef<View>(null);
  const tourStarted = useRef(false);

  const { data: ticketsData, isLoading, isValidating, refetch, forceRefresh } = useTicketList();
  const tickets = ticketsData ?? [];

  // Soft revalidation on tab focus — TanStack respects staleTime, so this is
  // a no-op when data is fresh (< 30s old) and a quiet background fetch otherwise.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // Status-bar icons: the brand-blue cloud sits behind the bar here, so always
  // light (white) icons. Set imperatively on focus — the declarative <StatusBar>
  // component gets clobbered by expo-router's re-render (expo/router#754), so a
  // direct native call on every focus is the reliable path.
  useFocusEffect(useCallback(() => { setStatusBarStyle('light'); }, []));

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

  // Stable open handler passed to every card — one reference for the whole list
  // so TicketCard's memo holds during scroll (a per-card arrow would defeat it).
  const openTicket = useCallback((ticket: MaintenanceTicket) => {
    setDetailTicket(ticket);
  }, []);

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

  // ── Guided tour ────────────────────────────────────────────────────────────
  // Resolve a tour target to a window-coord rect (or null → step is skipped).
  const measureTarget = useCallback(
    (key: TourTargetKey): Promise<{ x: number; y: number; width: number; height: number } | null> => {
      // Android RN (0.77–0.85, this app is on 0.83) has a known bug where
      // measureInWindow subtracts the status-bar height from Y under edge-to-edge
      // (facebook/react-native#19497, #50509 — fixed in 0.86). Add it back so the
      // highlight lands on the real element, not the status bar above it.
      const yFix = Platform.OS === 'android' ? insets.top : 0;

      const measureNode = (node: View | null) =>
        new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
          if (!node) return resolve(null);
          node.measureInWindow((x, y, width, height) => {
            resolve(width || height ? { x, y: y + yFix, width, height } : null);
          });
        });

      if (key === 'search')  return measureNode(searchRef.current);
      if (key === 'filters') return measureNode(filtersRef.current);
      if (key === 'help')    return measureNode(helpRef.current);
      if (key === 'nav')     return measureNode(navTargetRef.current);   // real tab bar
      if (key === 'card') {
        // No card to point at when the list is empty → skip this step.
        if (visibleTickets.length === 0) return Promise.resolve(null);
        return new Promise((resolve) => {
          const node = listRef.current;
          if (!node) return resolve(null);
          node.measureInWindow((x, y, width, height) => {
            if (!width && !height) return resolve(null);
            // Highlight just the first card's region at the top of the list.
            resolve({
              x: x + spacing.md,
              y: y + yFix + spacing.xs,
              width: width - spacing.md * 2,
              height: Math.min(height - spacing.xs, 104),
            });
          });
        });
      }
      return Promise.resolve(null);
    },
    [visibleTickets.length, insets.top],
  );

  // First launch: once tickets have loaded, show the tour if it hasn't been seen.
  useEffect(() => {
    if (tourStarted.current || isLoading) return;
    tourStarted.current = true;
    readTutorialSeen().then((seen) => {
      if (!seen) requestAnimationFrame(() => setTourVisible(true));
    });
  }, [isLoading]);

  const closeTour = useCallback(() => {
    setTourVisible(false);
    writeTutorialSeen(true);
  }, []);

  // FlatList adapters — windows the card list so off-screen cards (and their
  // FadeSlideIn shared values) never mount, bounding the Reanimated pool.
  const keyExtractor = useCallback(
    (t: MaintenanceTicket) => t._dbId ?? t.ticketId,
    [],
  );
  const renderItem = useCallback<ListRenderItem<MaintenanceTicket>>(
    ({ item, index }) => (
      <TicketCard ticket={item} index={index} inSearch={isSearching} onPress={openTicket} />
    ),
    [isSearching, openTicket],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.isDark ? '#191C23' : '#F2F4F7' }]}>
      {/* Layered brand cloud at the top (decorative). Status-bar tint is set
          imperatively in the useFocusEffect above. */}
      <CloudBackground width={screenW} isDark={theme.isDark} lite={reducedMotion} />

      {/* ── Pinned header controls ────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View ref={searchRef} collapsable={false} style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: searchFocused ? palette.brand : theme.border }]}>
          <Ionicons name="search" size={22} color={searchFocused ? palette.brand : theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search tickets"
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
          ref={helpRef}
          collapsable={false}
          onPress={() => setTourVisible(true)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.helpBtn,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <CircleQuestionMark size={22} color={theme.textSecondary} strokeWidth={2.25} />
        </Pressable>
      </View>

      {/* Two-level filter — hidden while searching */}
      {!isSearching && (
        <View ref={filtersRef} collapsable={false} style={styles.filterBlock}>
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
                        ? { color: hue }
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
      {/* Wrapped in a measurable View so the tour can spotlight the first card. */}
      <View ref={listRef} collapsable={false} style={{ flex: 1 }}>
      <FlatList
        data={isLoading ? [] : visibleTickets}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={[
          styles.listPad,
          { paddingTop: spacing.xs, paddingBottom: tabBarFootprint + 24, flexGrow: 1 },
        ]}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={8}
        windowSize={7}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl
            refreshing={isValidating && !isLoading}
            onRefresh={forceRefresh}
            tintColor={palette.brand}
            colors={[palette.brand]}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <TicketSkeleton count={3} />
          ) : (
            renderEmpty()
          )
        }
      />
      </View>

      {/* Guided spotlight tour — auto-shows on first launch, replayable via ? */}
      <SpotlightTour visible={tourVisible} measure={measureTarget} onClose={closeTour} />

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
  // Horizontal gutters for the card list + loading skeletons. Applied to the
  // FlatList contentContainer; paddingBottom (tabBarFootprint + 24) is set inline.
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
    fontWeight: '400',
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
    // 1px TRANSPARENT border (invisible on the white pill) so the active chip's
    // box is exactly as wide as the inactive chip's 1px border. With borderWidth:0
    // here, activating a chip shrank it by 2px and shifted its neighbours.
    borderWidth: 1,
    borderColor: 'transparent',
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
    // Constant weight for active AND inactive — bold text is wider, so changing
    // weight on selection reflowed the row. The active chip stands out via its
    // white pill + hue-coloured text instead, not a heavier font.
    fontWeight: '600',
  },
  chipLabelInactive: {
    color: 'rgba(255,255,255,0.85)',
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
