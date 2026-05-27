import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { duration, ease, spring } from '@/constants/Motion';
import { useAppContext } from '@/context/AppContext';
import {
  downloadTicketPdf,
  fetchInspectionPhotos,
  fetchReportForTicket,
  fetchTicketAttachments,
  MaintenanceTicket,
  TicketAttachment,
  TicketReportSummary,
} from '@/services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.82;

const PRIORITY_COLOR: Record<string, string> = {
  high: '#E53535', medium: '#F5A623', low: '#0DB976',
};
const PRIORITY_BG: Record<string, string> = {
  high: 'rgba(229,53,53,0.10)', medium: 'rgba(245,166,35,0.10)', low: 'rgba(13,185,118,0.10)',
};
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  assigned:      { label: 'Assigned',    color: '#1E9DFF', bg: 'rgba(30,157,255,0.10)' },
  'in-progress': { label: 'In Progress', color: '#9B6DFF', bg: 'rgba(155,109,255,0.10)' },
  completed:     { label: 'Completed',   color: '#0DB976', bg: 'rgba(13,185,118,0.10)' },
  verified:      { label: 'Verified',    color: '#0DB976', bg: 'rgba(13,185,118,0.10)' },
};

type Props = {
  ticket: MaintenanceTicket | null;
  onClose: () => void;
};

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  const { isDarkMode } = useAppContext();
  const labelColor = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const valueColor = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const rowBg = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)';

  return (
    <View style={[styles.detailRow, { backgroundColor: rowBg }]}>
      <View style={styles.detailIconWrap}>
        <Ionicons name={icon} size={15} color={labelColor} />
      </View>
      <View style={styles.detailText}>
        <Text style={[styles.detailLabel, { color: labelColor }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: valueColor }]}>{value}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const { isDarkMode } = useAppContext();
  const color = isDarkMode ? '#4A5E7A' : '#9BAABB';
  return <Text style={[styles.sectionHeader, { color }]}>{title}</Text>;
}

export default function TicketDetailSheet({ ticket, onClose }: Props) {
  const { isDarkMode } = useAppContext();

  const [report, setReport]                 = useState<TicketReportSummary | null>(null);
  const [photoUrls, setPhotoUrls]           = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos]   = useState(false);
  const [csvAttachments, setCsvAttachments] = useState<TicketAttachment[]>([]);
  const [viewerUri, setViewerUri]           = useState<string | null>(null);
  const [downloading, setDownloading]       = useState(false);
  const [exporting, setExporting]           = useState(false);

  const handleDownload = async () => {
    if (!viewerUri) return;
    setDownloading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Allow photo library access to save images.');
        return;
      }
      const filename = viewerUri.split('/').pop()?.split('?')[0] ?? 'photo.jpg';
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.downloadAsync(viewerUri, localUri);
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Photo saved to your gallery.');
    } catch {
      Alert.alert('Error', 'Could not save the photo.');
    } finally {
      setDownloading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!ticket?._dbId) return;
    setExporting(true);
    try {
      const slug = ticket.stationName.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
      await downloadTicketPdf(ticket._dbId, `ticket_${slug}.pdf`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not export PDF.');
    } finally {
      setExporting(false);
    }
  };

  const translateY = useSharedValue(PANEL_HEIGHT);
  const backdropO  = useSharedValue(0);

  const visible = !!ticket;

  useEffect(() => {
    if (visible) {
      backdropO.value  = withTiming(1, { duration: duration.normal, easing: ease });
      translateY.value = withSpring(0, spring.gentle);
    } else {
      backdropO.value  = withTiming(0, { duration: duration.fast, easing: ease });
      translateY.value = withTiming(PANEL_HEIGHT, { duration: duration.normal, easing: ease });
      setReport(null);
      setPhotoUrls([]);
      setCsvAttachments([]);
      setViewerUri(null);
    }
  }, [visible]);

  // Fetch report, photos + CSV attachments whenever a ticket opens
  useEffect(() => {
    if (!ticket?._dbId) return;
    let cancelled = false;

    const load = async () => {
      setLoadingPhotos(true);
      setReport(null);
      setPhotoUrls([]);
      setCsvAttachments([]);
      try {
        const [reportData, attachments] = await Promise.all([
          fetchReportForTicket(ticket._dbId!),
          fetchTicketAttachments(ticket._dbId!),
        ]);
        if (cancelled) return;
        setCsvAttachments(attachments);
        if (!reportData) return;
        setReport(reportData);
        const photos = await fetchInspectionPhotos(reportData.id);
        if (!cancelled) setPhotoUrls(photos.map((p) => p.photo_url));
      } catch {
        // silently ignore — attachments are supplementary
      } finally {
        if (!cancelled) setLoadingPhotos(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [ticket?._dbId]);

  const panelStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  const sheetBg   = isDarkMode ? '#0D1526' : '#F8FAFC';
  const titleCol  = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const secondary = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const divider   = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const handleCol = isDarkMode ? '#1E2D47' : '#CBD5E1';
  const closeBg   = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const thumbBg   = isDarkMode ? '#1A2540' : '#E8ECF2';

  if (!ticket) return null;

  const statusKey = ticket.dbStatus ?? 'assigned';
  const st        = STATUS_STYLE[statusKey] ?? STATUS_STYLE['assigned'];
  const pc        = PRIORITY_COLOR[ticket.priority ?? 'medium'];
  const pb        = PRIORITY_BG[ticket.priority ?? 'medium'];

  const isHistory = statusKey === 'completed' || statusKey === 'verified';
  const verified  = ticket.verificationStatus === 'Approved by Analyst';

  const scheduledFormatted = ticket.scheduledTime
    ? new Date(ticket.scheduledTime).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  const showPhotoSection = loadingPhotos || photoUrls.length > 0;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={viewerUri ? () => setViewerUri(null) : onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[styles.panel, { backgroundColor: sheetBg, height: PANEL_HEIGHT }, panelStyle]}
      >
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: handleCol }]} />

          {/* Header */}
          <View style={[styles.sheetHeader, { borderBottomColor: divider }]}>
            <View style={styles.sheetHeaderLeft}>
              <Text style={[styles.sheetTitle, { color: titleCol }]} numberOfLines={2}>
                {ticket.stationName}
              </Text>
              <Text style={[styles.sheetId, { color: secondary }]}>#{ticket.ticketId}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleExportPdf}
                style={({ pressed }) => [
                  styles.closeBtn,
                  { backgroundColor: closeBg, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                {exporting
                  ? <ActivityIndicator size="small" color={secondary} />
                  : <Ionicons name="share-outline" size={17} color={secondary} />
                }
              </Pressable>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeBtn,
                  { backgroundColor: closeBg, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Ionicons name="close" size={18} color={secondary} />
              </Pressable>
            </View>
          </View>

          {/* Scrollable body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Status + priority chips */}
            <View style={styles.chipsRow}>
              {isHistory ? (
                <View
                  style={[
                    styles.chip,
                    {
                      backgroundColor: verified
                        ? 'rgba(13,185,118,0.10)'
                        : 'rgba(245,166,35,0.10)',
                    },
                  ]}
                >
                  <Ionicons
                    name={verified ? 'checkmark-circle' : 'time-outline'}
                    size={12}
                    color={verified ? '#0DB976' : '#F5A623'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: verified ? '#0DB976' : '#F5A623' },
                    ]}
                  >
                    {verified ? 'Verified' : 'Pending Review'}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={[styles.chip, { backgroundColor: st.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                    <Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text>
                  </View>
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: pb, borderWidth: 1, borderColor: pc + '30' },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: pc }]}>
                      {(ticket.priority ?? 'medium').charAt(0).toUpperCase() +
                        (ticket.priority ?? 'medium').slice(1)}{' '}
                      Priority
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Description */}
            <SectionHeader title="Description" />
            <Text style={[styles.descText, { color: titleCol, marginBottom: 22 }]}>
              {ticket.flaggedAnomaly || 'No description provided.'}
            </Text>

            {/* Details */}
            <SectionHeader title="Details" />
            <View style={[styles.detailsCard, { borderColor: divider, borderWidth: 1 }]}>
              {ticket.anomalyZone ? (
                <DetailRow
                  icon="location-outline"
                  label="Anomaly Zone"
                  value={`Zone ${ticket.anomalyZone}`}
                />
              ) : null}
              {ticket.location ? (
                <DetailRow icon="business-outline" label="Station" value={ticket.location} />
              ) : null}
              {ticket.coordinates ? (
                <DetailRow
                  icon="navigate-outline"
                  label="Coordinates"
                  value={ticket.coordinates}
                />
              ) : null}
              {scheduledFormatted ? (
                <DetailRow
                  icon="calendar-outline"
                  label={isHistory ? 'Completed Date' : 'Scheduled Date'}
                  value={scheduledFormatted}
                />
              ) : null}
            </View>

            {/* CSV Attachments */}
            {csvAttachments.length > 0 && (
              <>
                <SectionHeader title="Data Attachments" />
                <View style={{ marginBottom: 22, gap: 8 }}>
                  {csvAttachments.map((att) => {
                    const kb = att.file_size ? Math.round(att.file_size / 1024) : null;
                    return (
                      <Pressable
                        key={att.id}
                        onPress={() => Linking.openURL(att.file_url)}
                        style={({ pressed }) => [
                          styles.csvChip,
                          {
                            backgroundColor: isDarkMode
                              ? 'rgba(30,157,255,0.08)'
                              : 'rgba(30,111,217,0.06)',
                            borderColor: isDarkMode
                              ? 'rgba(30,157,255,0.25)'
                              : 'rgba(30,111,217,0.20)',
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Ionicons name="document-text-outline" size={16} color="#1E9DFF" />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.csvName, { color: isDarkMode ? '#F0F4FF' : '#0D1B3E' }]} numberOfLines={1}>
                            {att.file_name}
                          </Text>
                          {kb !== null && (
                            <Text style={[styles.csvMeta, { color: secondary }]}>{kb} KB</Text>
                          )}
                        </View>
                        <Ionicons name="download-outline" size={16} color={secondary} />
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* Attachments */}
            {showPhotoSection && (
              <>
                <SectionHeader title="Attachments" />
                {loadingPhotos ? (
                  <ActivityIndicator
                    size="small"
                    color={secondary}
                    style={{ alignSelf: 'flex-start', marginBottom: 22 }}
                  />
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbRow}
                    style={{ marginBottom: 22 }}
                  >
                    {photoUrls.map((url, idx) => (
                      <Pressable
                        key={idx}
                        onPress={() => setViewerUri(url)}
                        style={({ pressed }) => [
                          styles.thumbWrap,
                          { backgroundColor: thumbBg, opacity: pressed ? 0.8 : 1 },
                        ]}
                      >
                        <Image
                          source={{ uri: url }}
                          style={styles.thumb}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* Inspection Report (history tickets) */}
            {isHistory && report && (
              <>
                <SectionHeader title="Inspection Report" />
                <View style={[styles.detailsCard, { borderColor: divider, borderWidth: 1, marginBottom: 16 }]}>
                  {report.sensor_working !== null && (
                    <DetailRow
                      icon={report.sensor_working ? 'wifi-outline' : 'wifi-off-outline'}
                      label="Sensor Working"
                      value={report.sensor_working ? 'Yes' : 'No'}
                    />
                  )}
                  {report.severity ? (
                    <DetailRow icon="warning-outline" label="Severity" value={
                      report.severity.charAt(0).toUpperCase() + report.severity.slice(1)
                    } />
                  ) : null}
                </View>

                {report.notes ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: secondary }]}>Field Observations</Text>
                    <Text style={[styles.descText, { color: titleCol, marginBottom: 16 }]}>
                      {report.notes}
                    </Text>
                  </>
                ) : null}

                {report.root_cause ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: secondary }]}>Root Cause</Text>
                    <Text style={[styles.descText, { color: titleCol, marginBottom: 16 }]}>
                      {report.root_cause}
                    </Text>
                  </>
                ) : null}
              </>
            )}

            {/* Analyst remarks */}
            {isHistory && (
              <>
                <SectionHeader title="Analyst Remarks" />
                <View
                  style={[
                    styles.reviewBlock,
                    {
                      backgroundColor: verified
                        ? 'rgba(13,185,118,0.06)'
                        : 'rgba(245,166,35,0.06)',
                      borderColor: verified
                        ? 'rgba(13,185,118,0.20)'
                        : 'rgba(245,166,35,0.20)',
                      borderWidth: 1,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons
                      name={verified ? 'checkmark-circle' : 'time-outline'}
                      size={14}
                      color={verified ? '#0DB976' : '#F5A623'}
                    />
                    <Text style={[styles.reviewStatusLabel, { color: verified ? '#0DB976' : '#F5A623' }]}>
                      {verified ? 'Approved by Analyst' : 'Pending Review'}
                    </Text>
                  </View>
                  {report?.analyst_notes ? (
                    <Text style={[styles.reviewText, { color: titleCol }]}>
                      {report.analyst_notes}
                    </Text>
                  ) : (
                    <Text style={[styles.reviewText, { color: secondary }]}>
                      {verified
                        ? 'No additional remarks were added.'
                        : 'This ticket is awaiting analyst review.'}
                    </Text>
                  )}
                </View>
              </>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>
        </Animated.View>

        {/* Full-screen photo viewer — inside the same Modal to avoid Android dual-Modal bug */}
        {viewerUri ? (
          <View style={[StyleSheet.absoluteFill, styles.viewer]}>
            <ScrollView
              style={styles.viewerZoom}
              contentContainerStyle={styles.viewerZoomContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
              bouncesZoom
            >
              <Image
                source={{ uri: viewerUri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            </ScrollView>
            {/* Top bar */}
            <View style={styles.viewerTopBar}>
              <Pressable
                onPress={() => setViewerUri(null)}
                style={({ pressed }) => [styles.viewerBackBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
                <Text style={styles.viewerBackLabel}>Back</Text>
              </Pressable>
              <Pressable
                onPress={handleDownload}
                style={({ pressed }) => [styles.viewerDownloadBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                {downloading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="download-outline" size={22} color="#fff" />
                }
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  sheetHeaderLeft: { flex: 1 },
  sheetTitle: {
    fontSize: 17, fontWeight: '600', lineHeight: 23, letterSpacing: -0.2,
  },
  sheetId: { fontSize: 12, marginTop: 4, fontWeight: '500', letterSpacing: 0.1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 24 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  chipText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },

  sectionHeader: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase',
  },

  descText: { fontSize: 15, lineHeight: 23 },

  detailsCard: { borderRadius: 12, overflow: 'hidden', marginBottom: 24 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 12,
  },
  detailIconWrap: { width: 18 },
  detailText: { flex: 1 },
  detailLabel: { fontSize: 12, fontWeight: '500', marginBottom: 2 },
  detailValue: { fontSize: 14, lineHeight: 19, fontWeight: '500' },

  thumbRow: { gap: 10, paddingRight: 4 },
  thumbWrap: { borderRadius: 12, overflow: 'hidden' },
  thumb: { width: 104, height: 80 },

  reviewBlock: { borderRadius: 12, padding: 14, marginBottom: 24 },
  reviewStatusLabel: { fontSize: 13, fontWeight: '600' },
  reviewText: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },

  // Full-screen viewer
  viewer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerZoom: {
    width: '100%',
    height: '100%',
  },
  viewerZoomContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  viewerTopBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  viewerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewerBackLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  viewerDownloadBtn: {
    padding: 4,
  },

  csvChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  csvName: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  csvMeta: { fontSize: 12, marginTop: 2 },
});
