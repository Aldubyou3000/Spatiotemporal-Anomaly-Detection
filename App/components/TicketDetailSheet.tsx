/**
 * TicketDetailSheet — the quick "peek" bottom sheet for a ticket. It renders the
 * shared <TicketDetailContent> (the same body the full-page route uses), so the
 * sheet and the full page can never present a ticket differently.
 *
 * The header offers Expand (→ full-page route), Share (PDF), and Close.
 */

import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
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
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ConfirmSheet from '@/components/ConfirmSheet';
import Icon, { type IconName } from '@/components/Icon';
import { Text } from '@/components/Themed';
import TicketDetailContent from '@/components/TicketDetailContent';
import PhotoGallery from '@/components/PhotoGallery';
import { icons } from '@/constants/icons';
import { duration, ease, spring } from '@/constants/Motion';
import { palette, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { downloadTicketPdf, MaintenanceTicket, ReportPhoto, updateTicketStatus } from '@/services/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_H * 0.86;

type ViewerState = { photos: ReportPhoto[]; index: number } | null;

// ─── Photo lightbox ───────────────────────────────────────────────────────────
// Plain horizontal ScrollView with pagingEnabled for swiping — unlike FlatList
// it does NOT intercept gestures from child ScrollViews, so pinch-to-zoom works.
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

  // Rendered as an absoluteFill overlay INSIDE the sheet's own Modal — NOT as a
  // second Modal. Two stacked Modals on Android swallow touches and break RNGH
  // gestures (the dual-Modal bug). But the sheet IS a Modal, so its content sits
  // OUTSIDE the app-root GestureHandlerRootView — we therefore need a fresh
  // GHRootView here so swipe/pinch/tap inside the gallery actually fire.
  return (
    <GestureHandlerRootView style={[StyleSheet.absoluteFill, styles.viewerRoot]}>
      <PhotoGallery
        photos={photos}
        width={SCREEN_W}
        height={SCREEN_H}
        initialIndex={viewer.index}
        onIndexChange={(i) => { setCurIndex(i); setChromeVisible(true); }}
        onTap={toggleChrome}
      />

      {/* Chrome overlay — rendered AFTER gallery so it's on top */}
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
  );
}

// ─── Sheet ────────────────────────────────────────────────────────────────────
type Props = {
  ticket: MaintenanceTicket | null;
  onClose: () => void;
  /** Fired after a successful status change so the list can refetch. */
  onAction?: () => void;
};

export default function TicketDetailSheet({ ticket, onClose, onAction }: Props) {
  const theme  = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [viewer, setViewer]       = useState<ViewerState>(null);
  const [exporting, setExporting] = useState(false);
  const [working, setWorking]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const translateY = useSharedValue(PANEL_HEIGHT);
  const backdropO  = useSharedValue(0);
  const visible = !!ticket;

  const [mounted, setMounted] = useState(false);
  const lastTicket = useRef<MaintenanceTicket | null>(null);
  if (ticket) lastTicket.current = ticket;
  const shown = ticket ?? lastTicket.current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdropO.value  = withTiming(1, { duration: duration.normal, easing: ease });
      translateY.value = withSpring(0, spring.gentle);
    } else if (mounted) {
      backdropO.value  = withTiming(0, { duration: duration.fast, easing: ease });
      translateY.value = withTiming(
        PANEL_HEIGHT,
        { duration: duration.normal, easing: ease },
        (finished) => { if (finished) runOnJS(setMounted)(false); },
      );
      setViewer(null);
    }
  }, [visible]);

  const panelStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  if (!shown) return null;
  const t = shown;

  const handleExpand = () => {
    onClose();
    router.push({ pathname: '/ticket/[id]', params: { id: t._dbId ?? t.ticketId, seed: JSON.stringify(t) } } as any);
  };

  const handleExportPdf = async () => {
    if (!t._dbId) return;
    setExporting(true);
    try {
      const slug = `${t.stationId}_${t.title}`.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
      await downloadTicketPdf(t._dbId, `ticket_${slug}.pdf`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not export PDF.');
    } finally {
      setExporting(false);
    }
  };

  // ── Primary action — moved here from the list row (Messenger paradigm) ───────
  const status      = t.dbStatus ?? 'assigned';
  const isStartable = status === 'assigned' || status === 'created' || status === 'follow_up';
  const isInProgress = status === 'in-progress';
  const startLabel  = status === 'follow_up' ? 'Start Re-visit' : 'Start Working';

  const handleStartWorking = () => setShowConfirm(true);

  const doStartWorking = async () => {
    setShowConfirm(false);
    setWorking(true);
    try {
      await updateTicketStatus(t._dbId ?? t.ticketId, 'in-progress');
      onAction?.();
      onClose();
    } catch {
      Alert.alert('Error', 'Could not update status. Try again.');
    } finally {
      setWorking(false);
    }
  };

  const handleSubmitReport = () => {
    onClose();
    router.push({
      pathname: '/report',
      params: { id: t._dbId ?? t.ticketId, title: t.title, seed: JSON.stringify(t) },
    } as any);
  };

  const HeaderBtn = ({ icon, onPress, busy }: { icon: IconName; onPress: () => void; busy?: boolean }) => (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.headerBtn, { backgroundColor: theme.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}
    >
      {busy
        ? <ActivityIndicator size="small" color={theme.textSecondary} />
        : <Icon name={icon} size={17} color={theme.textSecondary} />}
    </Pressable>
  );

  return (
    <>
      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.panel, { backgroundColor: theme.bg, height: PANEL_HEIGHT }, panelStyle]}>
          <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerActions}>
              <HeaderBtn icon={icons.expand} onPress={handleExpand} />
              <HeaderBtn icon={icons.share} onPress={handleExportPdf} busy={exporting} />
              <HeaderBtn icon={icons.close} onPress={onClose} />
            </View>
          </View>

          {/* Shared body — soft-grey backdrop so the white panels lift off it. */}
          <ScrollView
            style={{ flex: 1, backgroundColor: theme.surfaceAlt }}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <TicketDetailContent
              ticket={t}
              onOpenPhoto={(photos, index) => setViewer({ photos, index })}
            />
          </ScrollView>

          {/* Pinned primary action — solid brand CTA (the only loud button in the
              experience now that the list rows are flat). */}
          {(isStartable || isInProgress) && (
            <View style={[
              styles.footer,
              { borderTopColor: theme.border, backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom, spacing.md) },
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
        </Animated.View>

        {/* Photo viewer is an absoluteFill overlay INSIDE this same Modal (not a
            second Modal) — avoids the Android dual-Modal touch/gesture bug. */}
        <PhotoViewer viewer={viewer} onClose={() => setViewer(null)} />
      </Modal>

      {/* Start-working confirmation — separate Modal (not nested) so Android
          touch/gesture handling is unaffected. */}
      <ConfirmSheet
        visible={showConfirm}
        title={t.isFollowUp ? 'Start Re-visit?' : 'Start Working?'}
        message={
          t.isFollowUp
            ? "Follow-up inspection — confirm when you're on site."
            : "This marks the ticket as In Progress. Only confirm when you're on site."
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={doStartWorking}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },

  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, borderBottomWidth: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },

  // TicketDetailContent owns its own 16px horizontal + top/bottom padding now.
  bodyContent: { paddingBottom: spacing.xl },

  // Pinned primary-action footer
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
    borderRadius: radius.md,   // 12
  },
  ctaText: { color: palette.white, fontSize: 16, fontWeight: '700', lineHeight: 22 },

  // Photo viewer — absoluteFill overlay above the sheet panel (zIndex/elevation
  // must beat the panel's elevation:16 so it covers the whole sheet).
  viewerRoot: { backgroundColor: '#000', zIndex: 100, elevation: 100 },

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
