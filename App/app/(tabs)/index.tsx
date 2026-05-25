import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import BottomSheet from '@/components/BottomSheet';
import Card from '@/components/Card';
import Pill from '@/components/Pill';
import { Text } from '@/components/Themed';
import TicketDetailSheet from '@/components/TicketDetailSheet';
import TicketSkeleton from '@/components/TicketSkeleton';
import { duration, ease, spring, stagger } from '@/constants/Motion';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import {
  fetchActiveTickets,
  fetchInProgressTickets,
  fetchTicketHistory,
  MaintenanceTicket,
  updateTicketStatus,
} from '@/services/supabaseApi';

type TicketTab = 'active' | 'in-progress' | 'history';

// ─── Status / priority mapping ───────────────────────────────────────────────
const PRIORITY = {
  high:   { label: 'High',   color: palette.danger,  bg: palette.dangerSoft },
  medium: { label: 'Medium', color: palette.warning, bg: palette.warningSoft },
  low:    { label: 'Low',    color: palette.success, bg: palette.successSoft },
} as const;

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  assigned:      { label: 'Assigned',    color: palette.info,   bg: palette.infoSoft },
  'in-progress': { label: 'In Progress', color: palette.accent, bg: palette.accentSoft },
};

// ─── Entrance animation wrapper ──────────────────────────────────────────────
function FadeSlideIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(10);

  useFocusEffect(
    useCallback(() => {
      opacity.value    = 0;
      translateY.value = 10;
      opacity.value    = withDelay(delay, withTiming(1, { duration: duration.normal, easing: ease }));
      translateY.value = withDelay(delay, withSpring(0, spring.gentle));
    }, [delay])
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

// ─── Greeting helper ─────────────────────────────────────────────────────────
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const router = useRouter();
  const theme  = useTheme();
  const { technicianName } = useAppContext();

  const [activeTab, setActiveTab]                 = useState<TicketTab>('active');
  const [activeTickets, setActiveTickets]         = useState<MaintenanceTicket[]>([]);
  const [inProgressTickets, setInProgressTickets] = useState<MaintenanceTicket[]>([]);
  const [historyTickets, setHistoryTickets]       = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading]                     = useState(false);
  const [refreshing, setRefreshing]               = useState(false);
  const [markingId, setMarkingId]                 = useState<string | null>(null);
  const [confirmTicket, setConfirmTicket]         = useState<MaintenanceTicket | null>(null);
  const [detailTicket, setDetailTicket]           = useState<MaintenanceTicket | null>(null);

  const loadTickets = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [active, inProg, history] = await Promise.all([
        fetchActiveTickets(),
        fetchInProgressTickets(),
        fetchTicketHistory(),
      ]);
      setActiveTickets(active);
      setInProgressTickets(inProg);
      setHistoryTickets(history);
    } catch {
      Alert.alert('Error', 'Could not load tickets. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadTickets(); }, [loadTickets]));

  const confirmStartWorking = async () => {
    if (!confirmTicket) return;
    const dbId = confirmTicket._dbId ?? confirmTicket.ticketId;
    setMarkingId(dbId);
    try {
      await updateTicketStatus(dbId, 'in-progress');
      await loadTickets();
    } catch {
      Alert.alert('Error', 'Could not update status. Try again.');
    } finally {
      setMarkingId(null);
    }
  };

  const openReport = (ticket: MaintenanceTicket) => {
    router.push({
      pathname: '/report',
      params: { id: ticket._dbId ?? ticket.ticketId, title: ticket.stationName },
    } as any);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const segmentBg     = theme.isDark ? '#0F1525' : '#EAEEF4';
  const segmentActive = theme.surface;
  const firstName     = technicianName.split(' ')[0];
  const totalActive   = activeTickets.length + inProgressTickets.length;

  // ── Active / In-Progress card ──────────────────────────────────────────────
  const renderActiveCard = (ticket: MaintenanceTicket, i: number) => {
    const dbId       = ticket._dbId ?? ticket.ticketId;
    const inProgress = ticket.dbStatus === 'in-progress';
    const marking    = markingId === dbId;
    const st         = STATUS_STYLE[ticket.dbStatus ?? 'assigned'] ?? STATUS_STYLE['assigned'];
    const pr         = PRIORITY[(ticket.priority ?? 'medium') as keyof typeof PRIORITY];

    return (
      <FadeSlideIn key={ticket.ticketId} delay={i * stagger.list}>
        <Pressable
          onPress={() => setDetailTicket(ticket)}
          style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
        >
          <Card style={styles.card}>
            {/* Status + priority row */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.pillsRow}>
                <Pill label={st.label} color={st.color} bg={st.bg} dot />
                <Pill label={pr.label} color={pr.color} bg={pr.bg} outline />
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </View>

            {/* Title */}
            <Text
              style={[styles.cardTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {ticket.stationName}
            </Text>

            {/* Description */}
            <Text
              style={[styles.cardDesc, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {ticket.flaggedAnomaly}
            </Text>

            {/* Meta */}
            {(ticket.anomalyZone || ticket.scheduledTime) ? (
              <View style={styles.metaRow}>
                {ticket.anomalyZone ? (
                  <View style={styles.metaChip}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={theme.textSecondary}
                    />
                    <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                      Zone {ticket.anomalyZone}
                    </Text>
                  </View>
                ) : null}
                {ticket.scheduledTime ? (
                  <View style={styles.metaChip}>
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color={theme.textSecondary}
                    />
                    <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                      {new Date(ticket.scheduledTime).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Action */}
            {inProgress ? (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); openReport(ticket); }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: palette.brand, opacity: pressed ? 0.86 : 1 },
                ]}
              >
                <Ionicons name="document-text-outline" size={15} color={palette.white} style={{ marginRight: 6 }} />
                <Text style={[styles.actionBtnText, { color: palette.white }]}>Submit Report</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); setConfirmTicket(ticket); }}
                disabled={marking}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: palette.brandSoft,
                    opacity: marking || pressed ? 0.7 : 1,
                  },
                ]}
              >
                {marking ? (
                  <ActivityIndicator size="small" color={palette.brand} />
                ) : (
                  <>
                    <Ionicons name="play-circle-outline" size={15} color={palette.brand} style={{ marginRight: 6 }} />
                    <Text style={[styles.actionBtnText, { color: palette.brand }]}>Start Working</Text>
                  </>
                )}
              </Pressable>
            )}
          </Card>
        </Pressable>
      </FadeSlideIn>
    );
  };

  // ── History card ───────────────────────────────────────────────────────────
  const renderHistoryCard = (ticket: MaintenanceTicket, i: number) => {
    const verified    = ticket.verificationStatus === 'Approved by Analyst';
    const statusColor = verified ? palette.success : palette.warning;
    const statusBg    = verified ? palette.successSoft : palette.warningSoft;
    const statusLabel = verified ? 'Verified' : 'Pending Review';
    const statusIcon: React.ComponentProps<typeof Ionicons>['name'] =
      verified ? 'checkmark-circle' : 'time-outline';

    return (
      <FadeSlideIn key={ticket.ticketId} delay={i * stagger.list}>
        <Pressable
          onPress={() => setDetailTicket(ticket)}
          style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
        >
          <Card style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Pill label={statusLabel} color={statusColor} bg={statusBg} icon={statusIcon} />
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </View>

            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {ticket.stationName}
            </Text>
            <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={2}>
              {ticket.flaggedAnomaly}
            </Text>

            <Text style={[styles.historyFooter, { color: theme.textTertiary }]}>
              {verified ? 'Approved by analyst' : 'Awaiting analyst review'}
            </Text>
          </Card>
        </Pressable>
      </FadeSlideIn>
    );
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  const renderEmpty = () => {
    const cfg: Record<TicketTab, { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }> = {
      'active':      { icon: 'checkmark-done-outline',  title: 'All clear',             sub: 'No active tickets assigned to you right now.' },
      'in-progress': { icon: 'time-outline',            title: 'Nothing in progress',   sub: 'Tickets you start working on will appear here.' },
      'history':     { icon: 'receipt-outline',         title: 'No history yet',        sub: 'Completed tickets will appear here.' },
    };
    const c = cfg[activeTab];

    return (
      <View style={styles.empty}>
        <View style={[styles.emptyIconWrap, { backgroundColor: theme.surfaceMuted }]}>
          <Ionicons name={c.icon} size={26} color={theme.textSecondary} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{c.title}</Text>
        <Text style={[styles.emptySub, { color: theme.textSecondary }]}>{c.sub}</Text>
      </View>
    );
  };

  const list = activeTab === 'active'
    ? activeTickets
    : activeTab === 'in-progress' ? inProgressTickets : historyTickets;
  const isEmpty = list.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTickets(true)}
            tintColor={palette.brand}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero greeting ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <Text style={[styles.heroGreeting, { color: theme.textSecondary }]}>
            {greeting()},
          </Text>
          <Text style={[styles.heroName, { color: theme.text }]}>
            {firstName}
          </Text>
          <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
            {totalActive > 0
              ? `You have ${totalActive} ticket${totalActive > 1 ? 's' : ''} to review.`
              : "You're all caught up."}
          </Text>
        </View>

        {/* ── Segmented control ────────────────────────────────────────── */}
        <View style={[styles.segment, { backgroundColor: segmentBg }]}>
          {([
            { key: 'active',      label: 'Active',      count: activeTickets.length },
            { key: 'in-progress', label: 'In Progress', count: inProgressTickets.length },
            { key: 'history',     label: 'History',     count: 0 },
          ] as { key: TicketTab; label: string; count: number }[]).map(({ key, label, count }) => {
            const isActive = activeTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setActiveTab(key)}
                style={[
                  styles.segBtn,
                  isActive && [styles.segBtnActive, { backgroundColor: segmentActive }],
                ]}
              >
                <Text
                  style={[
                    styles.segLabel,
                    {
                      color: isActive ? theme.text : theme.textSecondary,
                      fontWeight: isActive ? '600' : '500',
                    },
                  ]}
                >
                  {label}
                </Text>
                {count > 0 ? (
                  <View
                    style={[
                      styles.segCount,
                      { backgroundColor: isActive ? palette.brand : theme.surfaceMuted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segCountText,
                        { color: isActive ? palette.white : theme.textSecondary },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* ── List / empty / loading ────────────────────────────────────── */}
        {loading ? (
          <TicketSkeleton count={3} />
        ) : isEmpty ? (
          renderEmpty()
        ) : activeTab === 'history' ? (
          list.map(renderHistoryCard)
        ) : (
          list.map(renderActiveCard)
        )}
      </ScrollView>

      {/* Confirm start-working */}
      <BottomSheet
        visible={!!confirmTicket}
        onClose={() => setConfirmTicket(null)}
        title="Start Working?"
        message="This marks the ticket as In Progress. Only confirm when you're on site."
        actions={[
          { label: 'Confirm', variant: 'primary', onPress: confirmStartWorking },
          { label: 'Cancel',  onPress: () => {} },
        ]}
      />

      {/* Full ticket detail */}
      <TicketDetailSheet
        ticket={detailTicket}
        onClose={() => setDetailTicket(null)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },

  // Hero ──────────────────────────────────────────────────────────────────
  hero: {
    marginBottom: spacing.lg,
  },
  heroGreeting: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: typography.calloutMed.weight,
  },
  heroName: {
    fontSize: typography.display.size,
    lineHeight: typography.display.lineHeight,
    fontWeight: typography.display.weight,
    letterSpacing: typography.display.letterSpacing,
    marginTop: 2,
  },
  heroSubtitle: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    marginTop: spacing.xs,
  },

  // Segmented control ─────────────────────────────────────────────────────
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
  },
  segBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segLabel: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
  },
  segCount: {
    minWidth: 20,
    paddingHorizontal: 6,
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

  // Card ──────────────────────────────────────────────────────────────────
  card: {
    marginBottom: spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    letterSpacing: typography.subtitle.letterSpacing,
    marginBottom: spacing.xxs + 2,
  },
  cardDesc: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    marginBottom: spacing.sm,
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.weight,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },

  actionBtn: {
    flexDirection: 'row',
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  actionBtnText: {
    fontSize: typography.callout.size,
    fontWeight: '600',
    lineHeight: typography.callout.lineHeight,
  },

  historyFooter: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    marginTop: 2,
  },

  // Empty ─────────────────────────────────────────────────────────────────
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
    maxWidth: 280,
  },
});
