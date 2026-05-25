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
import TicketDetailSheet from '@/components/TicketDetailSheet';
import TicketSkeleton from '@/components/TicketSkeleton';
import { Text } from '@/components/Themed';
import { duration, ease, spring } from '@/constants/Motion';
import { useAppContext } from '@/context/AppContext';
import {
  fetchActiveTickets,
  fetchInProgressTickets,
  fetchTicketHistory,
  MaintenanceTicket,
  updateTicketStatus,
} from '@/services/supabaseApi';

type TicketTab = 'active' | 'in-progress' | 'history';

const PRIORITY_COLOR: Record<string, string> = {
  high: '#E53535', medium: '#F5A623', low: '#0DB976',
};
const PRIORITY_BG: Record<string, string> = {
  high: 'rgba(229,53,53,0.08)', medium: 'rgba(245,166,35,0.08)', low: 'rgba(13,185,118,0.08)',
};
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  assigned:      { label: 'Assigned',    color: '#1E9DFF', bg: 'rgba(30,157,255,0.08)' },
  'in-progress': { label: 'In Progress', color: '#9B6DFF', bg: 'rgba(155,109,255,0.08)' },
};

function FadeSlideIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(8);

  useFocusEffect(
    useCallback(() => {
      opacity.value    = 0;
      translateY.value = 8;
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

export default function DashboardScreen() {
  const router = useRouter();
  const { isDarkMode, technicianName } = useAppContext();

  const [activeTab, setActiveTab]             = useState<TicketTab>('active');
  const [activeTickets, setActiveTickets]     = useState<MaintenanceTicket[]>([]);
  const [inProgressTickets, setInProgressTickets] = useState<MaintenanceTicket[]>([]);
  const [historyTickets, setHistoryTickets]   = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [refreshing, setRefreshing]           = useState(false);
  const [markingId, setMarkingId]             = useState<string | null>(null);
  const [confirmTicket, setConfirmTicket]     = useState<MaintenanceTicket | null>(null);
  const [detailTicket, setDetailTicket]       = useState<MaintenanceTicket | null>(null);

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

  const bg           = isDarkMode ? '#0A0F1E' : '#F5F7FA';
  const textColor    = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const secondaryText = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const divider      = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const segBg        = isDarkMode ? '#131929' : '#E8ECF2';
  const segActive    = isDarkMode ? '#1E2D47' : '#ffffff';

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = technicianName.split(' ')[0];

  // ── Active / In-Progress card ──────────────────────────────────────────────
  const renderActiveTicket = (ticket: MaintenanceTicket, i: number) => {
    const dbId       = ticket._dbId ?? ticket.ticketId;
    const inProgress = ticket.dbStatus === 'in-progress';
    const marking    = markingId === dbId;
    const st         = STATUS_STYLE[ticket.dbStatus ?? 'assigned'] ?? STATUS_STYLE['assigned'];
    const pc         = PRIORITY_COLOR[ticket.priority ?? 'medium'];
    const pb         = PRIORITY_BG[ticket.priority ?? 'medium'];

    return (
      <FadeSlideIn key={ticket.ticketId} delay={i * 50}>
        <Pressable
          onPress={() => setDetailTicket(ticket)}
          style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
        >
          <Card style={styles.card}>
            {/* Status + priority row */}
            <View style={styles.topRow}>
              <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                <Text style={[styles.statusLabel, { color: st.color }]}>{st.label}</Text>
              </View>
              <View style={[styles.priorityPill, { backgroundColor: pb, borderColor: pc + '30' }]}>
                <Text style={[styles.priorityLabel, { color: pc }]}>
                  {(ticket.priority ?? 'medium').charAt(0).toUpperCase() +
                    (ticket.priority ?? 'medium').slice(1)}
                </Text>
              </View>
              <View style={styles.topRowSpacer} />
              <Ionicons name="chevron-forward" size={14} color={secondaryText} />
            </View>

            {/* Title — 1 line keeps list scannable */}
            <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>
              {ticket.stationName}
            </Text>

            {/* Description — 2 lines; full content available in detail sheet */}
            <Text style={[styles.cardDesc, { color: secondaryText }]} numberOfLines={2}>
              {ticket.flaggedAnomaly}
            </Text>

            {/* Meta chips */}
            <View style={styles.metaRow}>
              {ticket.anomalyZone ? (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={11} color={secondaryText} style={{ marginRight: 3 }} />
                  <Text style={[styles.metaText, { color: secondaryText }]}>Zone {ticket.anomalyZone}</Text>
                </View>
              ) : null}
              {ticket.scheduledTime ? (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={11} color={secondaryText} style={{ marginRight: 3 }} />
                  <Text style={[styles.metaText, { color: secondaryText }]}>
                    {new Date(ticket.scheduledTime).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: divider }]} />

            {/* Action button — stops propagation so it doesn't open the sheet */}
            {inProgress ? (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); openReport(ticket); }}
                style={({ pressed }) => [
                  styles.actionBtn, styles.actionBtnPrimary,
                  { opacity: pressed ? 0.82 : 1 },
                ]}
              >
                <Ionicons name="document-text" size={14} color="#fff" style={{ marginRight: 6 }} />
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>Submit Report</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); setConfirmTicket(ticket); }}
                disabled={marking}
                style={({ pressed }) => [
                  styles.actionBtn, styles.actionBtnOutline,
                  { borderColor: '#1E9DFF', opacity: marking || pressed ? 0.6 : 1 },
                ]}
              >
                {marking
                  ? <ActivityIndicator size="small" color="#1E9DFF" />
                  : <Text style={[styles.actionBtnText, { color: '#1E9DFF' }]}>Start Working</Text>
                }
              </Pressable>
            )}
          </Card>
        </Pressable>
      </FadeSlideIn>
    );
  };

  // ── History card ───────────────────────────────────────────────────────────
  const renderHistoryTicket = (ticket: MaintenanceTicket, i: number) => {
    const verified    = ticket.verificationStatus === 'Approved by Analyst';
    const statusColor = verified ? '#0DB976' : '#F5A623';
    const statusBg    = verified ? 'rgba(13,185,118,0.08)' : 'rgba(245,166,35,0.08)';

    return (
      <FadeSlideIn key={ticket.ticketId} delay={i * 50}>
        <Pressable
          onPress={() => setDetailTicket(ticket)}
          style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
        >
          <Card style={styles.card}>
            <View style={styles.topRow}>
              <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
                <Ionicons
                  name={verified ? 'checkmark-circle' : 'time-outline'}
                  size={12}
                  color={statusColor}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.statusLabel, { color: statusColor }]}>
                  {verified ? 'Verified' : 'Pending Review'}
                </Text>
              </View>
              <View style={styles.topRowSpacer} />
              <Ionicons name="chevron-forward" size={14} color={secondaryText} />
            </View>

            <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>
              {ticket.stationName}
            </Text>
            <Text style={[styles.cardDesc, { color: secondaryText }]} numberOfLines={2}>
              {ticket.flaggedAnomaly}
            </Text>
            <Text style={[styles.historyFooter, { color: secondaryText }]}>
              {verified ? 'Approved by analyst' : 'Awaiting analyst review'}
            </Text>
          </Card>
        </Pressable>
      </FadeSlideIn>
    );
  };

  const current = activeTab === 'active'
    ? activeTickets
    : activeTab === 'in-progress'
    ? inProgressTickets
    : historyTickets;
  const isEmpty = current.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTickets(true)}
            tintColor="#1E6FD9"
          />
        }
      >
        {/* Greeting */}
        <View style={styles.hero}>
          <Text style={[styles.greetingText, { color: secondaryText }]}>{greeting()},</Text>
          <Text style={[styles.heroName, { color: textColor }]}>{firstName}</Text>
          <Text style={[styles.heroSub, { color: secondaryText }]}>
            {activeTickets.length + inProgressTickets.length > 0
              ? `${activeTickets.length + inProgressTickets.length} ticket${
                  activeTickets.length + inProgressTickets.length > 1 ? 's' : ''
                } assigned to you`
              : 'No active tickets right now.'}
          </Text>
        </View>

        {/* Segment control */}
        <View style={[styles.segment, { backgroundColor: segBg }]}>
          {(
            [
              { key: 'active',      label: 'Active',      count: activeTickets.length },
              { key: 'in-progress', label: 'In Progress', count: inProgressTickets.length },
              { key: 'history',     label: 'History',     count: 0 },
            ] as { key: TicketTab; label: string; count: number }[]
          ).map(({ key, label, count }) => (
            <Pressable
              key={key}
              onPress={() => setActiveTab(key)}
              style={[
                styles.segBtn,
                activeTab === key && [styles.segBtnActive, { backgroundColor: segActive }],
              ]}
            >
              <Text
                style={[
                  styles.segLabel,
                  {
                    color: activeTab === key ? '#1E6FD9' : secondaryText,
                    fontWeight: activeTab === key ? '700' : '500',
                  },
                ]}
              >
                {count > 0 ? `${label} (${count})` : label}
              </Text>
              <View
                style={[
                  styles.segUnderline,
                  { backgroundColor: activeTab === key ? '#1E6FD9' : 'transparent' },
                ]}
              />
            </Pressable>
          ))}
        </View>

        {/* List / empty state */}
        {loading ? (
          <TicketSkeleton count={3} />
        ) : isEmpty ? (
          <View style={[styles.empty, { borderColor: divider }]}>
            <Ionicons
              name={
                activeTab === 'active'      ? 'checkmark-circle-outline' :
                activeTab === 'in-progress' ? 'time-outline' :
                'receipt-outline'
              }
              size={36}
              color={secondaryText}
              style={{ marginBottom: 12 }}
            />
            <Text style={[styles.emptyTitle, { color: textColor }]}>
              {activeTab === 'active'      ? 'All clear' :
               activeTab === 'in-progress' ? 'Nothing in progress' :
               'No history yet'}
            </Text>
            <Text style={[styles.emptySub, { color: secondaryText }]}>
              {activeTab === 'active'
                ? 'No active tickets assigned to you.'
                : activeTab === 'in-progress'
                ? 'Start working on an assigned ticket to see it here.'
                : 'Completed tickets will appear here.'}
            </Text>
          </View>
        ) : activeTab === 'history' ? (
          historyTickets.map(renderHistoryTicket)
        ) : (
          current.map(renderActiveTicket)
        )}
      </ScrollView>

      {/* Confirm start-working sheet */}
      <BottomSheet
        visible={!!confirmTicket}
        onClose={() => setConfirmTicket(null)}
        title="Start Working?"
        message="This will mark the ticket as In Progress. Only confirm when you're on site."
        actions={[
          { label: 'Confirm', variant: 'primary', onPress: confirmStartWorking },
          { label: 'Cancel',  onPress: () => {} },
        ]}
      />

      {/* Full ticket detail sheet */}
      <TicketDetailSheet
        ticket={detailTicket}
        onClose={() => setDetailTicket(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 18, paddingBottom: 40 },

  hero: { marginBottom: 20 },
  greetingText: { fontSize: 13, fontWeight: '500' },
  heroName: { fontSize: 24, fontWeight: '700', marginTop: 2, marginBottom: 4, letterSpacing: -0.3 },
  heroSub: { fontSize: 13, lineHeight: 19 },

  segment: {
    flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 16,
  },
  segBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    alignItems: 'center', gap: 5,
  },
  segBtnActive: {
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  segLabel: { fontSize: 13 },
  segUnderline: { height: 2, width: 20, borderRadius: 1 },

  card: { marginBottom: 10 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  topRowSpacer: { flex: 1 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusLabel: { fontSize: 11, fontWeight: '600' },
  priorityPill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  priorityLabel: { fontSize: 11, fontWeight: '600' },

  cardTitle: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginBottom: 5 },
  cardDesc: { fontSize: 13, lineHeight: 19, marginBottom: 10 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  metaChip: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 11 },

  divider: { height: 1, marginBottom: 12 },

  actionBtn: {
    flexDirection: 'row', paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: '#1E6FD9' },
  actionBtnOutline: { borderWidth: 1, backgroundColor: 'transparent' },
  actionBtnText: { fontSize: 13, fontWeight: '600' },

  historyFooter: { fontSize: 12, marginTop: 2 },

  empty: {
    alignItems: 'center', paddingVertical: 52, paddingHorizontal: 24,
    marginTop: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
