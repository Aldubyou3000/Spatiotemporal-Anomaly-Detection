/**
 * Full-page ticket detail. Opened from the sheet's Expand button (or directly).
 * Renders the SAME <TicketDetailContent> the bottom sheet uses, so the peek and
 * the full page are always consistent — just with more room and a real back
 * button / scroll. Loads the full ticket (with all report rounds) by id.
 */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ConfirmSheet from '@/components/ConfirmSheet';
import Icon from '@/components/Icon';
import { Text } from '@/components/Themed';
import TicketDetailContent from '@/components/TicketDetailContent';
import PhotoGallery from '@/components/PhotoGallery';
import { icons } from '@/constants/icons';
import { palette, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { ticketDetailKey, TICKET_LIST_KEY, useTicketDetail } from '@/hooks/useTickets';
import { downloadTicketPdf, MaintenanceTicket, ReportPhoto, updateTicketStatus } from '@/services/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type ViewerState = { photos: ReportPhoto[]; index: number } | null;

async function savePhoto(url: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission required', 'Allow photo library access to save photos.');
    return;
  }
  const ext = url.split('?')[0].split('.').pop() ?? 'jpg';
  const dest = `${FileSystem.cacheDirectory}photo_${Date.now()}.${ext}`;
  const { uri } = await FileSystem.downloadAsync(url, dest);
  await MediaLibrary.saveToLibraryAsync(uri);
  Alert.alert('Saved', 'Photo saved to your camera roll.');
}

// ─── Lightbox modal ───────────────────────────────────────────────────────────
function PhotoViewer({ viewer, onClose }: { viewer: ViewerState; onClose: () => void }) {
  const insets    = useSafeAreaInsets();
  const [curIndex, setCurIndex] = useState(viewer?.index ?? 0);
  const [saving, setSaving]     = useState(false);
  // Chrome is visible by default and never auto-hides. A tap on an image that
  // already fits the screen toggles it (tall images consume taps for zoom).
  const [chromeVisible, setChromeVisible] = useState(true);

  useEffect(() => {
    if (viewer) { setCurIndex(viewer.index); setChromeVisible(true); }
  }, [viewer?.index]);

  if (!viewer) return null;
  const { photos } = viewer;
  const currentUrl = photos[curIndex]?.photo_url;

  const toggleChrome = () => setChromeVisible((v) => !v);

  const handleDownload = async () => {
    if (!currentUrl || saving) return;
    setSaving(true);
    try {
      await savePhoto(currentUrl);
    } catch {
      Alert.alert('Error', 'Could not save photo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* A Modal renders in its OWN native window, OUTSIDE the app's root
          GestureHandlerRootView — so RNGH gestures inside it are dead without a
          fresh root here. Each Modal with gesture-handler content needs its own. */}
      <GestureHandlerRootView style={styles.viewerRoot}>
        <PhotoGallery
          photos={photos}
          width={SCREEN_W}
          height={SCREEN_H}
          initialIndex={viewer.index}
          onIndexChange={(i) => { setCurIndex(i); setChromeVisible(true); }}
          onTap={toggleChrome}
        />

        {/* Chrome rendered AFTER gallery — higher z-order. box-none lets touches
            pass through to the gallery except on the actual Pressable buttons. */}
        {chromeVisible && (
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
            {/* Scrim darkens the top so white icons read on bright photos. */}
            <View style={[styles.viewerTopScrim, { height: insets.top + 64, pointerEvents: 'none' }]} />
            <View style={[styles.viewerTopBar, { paddingTop: insets.top + 10, pointerEvents: 'box-none' }]}>
              <Pressable
                onPress={onClose}
                hitSlop={20}
                style={({ pressed }) => [styles.viewerNavBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Icon name={icons.chevronLeft} size={22} color="#fff" />
              </Pressable>

              {photos.length > 1 && (
                <Text style={[styles.viewerCounter, { pointerEvents: 'none' }]}>
                  {curIndex + 1} / {photos.length}
                </Text>
              )}

              <Pressable
                onPress={handleDownload}
                hitSlop={20}
                disabled={saving}
                style={({ pressed }) => [styles.viewerNavBtn, { opacity: pressed || saving ? 0.6 : 1 }]}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Icon name={icons.share} size={19} color="#fff" />}
              </Pressable>
            </View>

            {photos.length > 1 && (
              <View style={[styles.viewerDots, { paddingBottom: insets.bottom + 20, pointerEvents: 'none' }]}>
                {photos.map((_, i) => (
                  <View key={i} style={i === curIndex ? styles.viewerDotActive : styles.viewerDotInactive} />
                ))}
              </View>
            )}
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TicketPage() {
  const theme  = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();
  const params = useLocalSearchParams();
  const id = (params.id ?? params.ticketId) as string | undefined;

  // Seed from the card that opened this page — renders instantly while the
  // full detail (with reports/photos) loads in the background.
  const seed: MaintenanceTicket | null = params.seed
    ? JSON.parse(params.seed as string) as MaintenanceTicket
    : null;

  const { data: ticket, isLoading: loading, isError } = useTicketDetail(id ?? null, seed);

  const [exporting, setExporting]   = useState(false);
  const [working, setWorking]       = useState(false);
  const [viewer, setViewer]         = useState<ViewerState>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleExportPdf = async () => {
    if (!ticket?._dbId) return;
    setExporting(true);
    try {
      const slug = `${ticket.stationId}_${ticket.title}`.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
      await downloadTicketPdf(ticket._dbId, `ticket_${slug}.pdf`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not export PDF.');
    } finally {
      setExporting(false);
    }
  };

  // ── Primary action — same logic as the bottom sheet's pinned CTA, so the full
  // page exposes the identical Start Working / Submit Report action. ───────────
  const status       = ticket?.dbStatus ?? 'assigned';
  const isStartable   = status === 'assigned' || status === 'created' || status === 'follow_up';
  const isInProgress  = status === 'in-progress';
  const startLabel    = status === 'follow_up' ? 'Start Re-visit' : 'Start Working';

  const handleStartWorking = () => {
    if (!ticket) return;
    setShowConfirm(true);
  };

  const doStartWorking = async () => {
    if (!ticket) return;
    setShowConfirm(false);
    setWorking(true);
    try {
      await updateTicketStatus(ticket._dbId ?? ticket.ticketId, 'in-progress');
      qc.invalidateQueries({ queryKey: id ? ticketDetailKey(id) : TICKET_LIST_KEY });
      qc.invalidateQueries({ queryKey: TICKET_LIST_KEY });
    } catch {
      Alert.alert('Error', 'Could not update status. Try again.');
    } finally {
      setWorking(false);
    }
  };

  const handleSubmitReport = () => {
    if (!ticket) return;
    router.push({
      pathname: '/report',
      params: { id: ticket._dbId ?? ticket.ticketId, title: ticket.title, seed: JSON.stringify(ticket) },
    } as any);
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.surfaceAlt }]}>
        <Stack.Screen
          options={{
            title: ticket ? `TKT-${ticket.ticketNumber}` : 'Ticket',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '700', fontSize: 17 },
            headerRight: () =>
              ticket ? (
                <Pressable
                  onPress={handleExportPdf}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                >
                  {exporting
                    ? <ActivityIndicator size="small" color={theme.textSecondary} />
                    : <Icon name={icons.share} size={20} color={theme.text} />}
                </Pressable>
              ) : null,
          }}
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.brand} size="large" />
          </View>
        ) : !ticket ? (
          <View style={styles.center}>
            <Icon name={icons.error} size={32} color={theme.textTertiary} />
            <Text style={[styles.missing, { color: theme.textSecondary }]}>
              {isError ? "Couldn't load this ticket. Check your connection." : 'Ticket not found.'}
            </Text>
            <Pressable onPress={() => router.back()} style={styles.backLink}>
              <Text style={{ color: palette.brand, fontWeight: '600' }}>Go back</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <TicketDetailContent
              ticket={ticket}
              onOpenPhoto={(photos, index) => setViewer({ photos, index })}
            />
          </ScrollView>
        )}

        {/* Pinned primary action — mirrors the bottom sheet's CTA so the full
            view exposes the same Start Working / Submit Report action. */}
        {ticket && (isStartable || isInProgress) && (
          <View style={[
            styles.footer,
            { borderTopColor: theme.border, backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}>
            <Pressable
              onPress={isInProgress ? handleSubmitReport : handleStartWorking}
              disabled={working}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: palette.brand, opacity: working || pressed ? 0.85 : 1 },
              ]}
            >
              {working ? (
                <ActivityIndicator size="small" color={palette.white} />
              ) : (
                <>
                  <Icon
                    name={isInProgress ? icons.submitReport : icons.startWork}
                    size={17}
                    color={palette.white}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.ctaText}>
                    {isInProgress ? 'Submit Report' : startLabel}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>

      <PhotoViewer viewer={viewer} onClose={() => setViewer(null)} />

      <ConfirmSheet
        visible={showConfirm}
        title={ticket?.isFollowUp ? 'Start Re-visit?' : 'Start Working?'}
        message={
          ticket?.isFollowUp
            ? "Follow-up inspection — confirm when you're on site."
            : "This marks the ticket as In Progress. Only confirm when you're on site."
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        icon={icons.startWork}
        onConfirm={doStartWorking}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  missing: { fontSize: 15 },
  backLink: { marginTop: 4, padding: 8 },
  // TicketDetailContent owns its own 16px horizontal + top/bottom padding now.
  content: { paddingBottom: spacing.lg },

  // Pinned primary-action footer — matches the bottom sheet's CTA spec.
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: radius.md,
  },
  ctaText: { color: palette.white, fontSize: 16, fontWeight: '700', lineHeight: 22 },

  // Photo viewer — Messenger-style floating glass chrome over a black canvas.
  viewerRoot: { flex: 1, backgroundColor: '#000' },

  // Scrim behind the top bar so white icons stay legible on bright photos.
  viewerTopScrim: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  // Top bar: circular buttons + centered counter, sitting over the scrim.
  viewerTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: 10,
  },
  viewerNavBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  viewerCounter: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Bottom dots: floating pill, no full-width bar.
  viewerDots: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 14,
  },
  viewerDotActive:   { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  viewerDotInactive: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.4)' },
});
