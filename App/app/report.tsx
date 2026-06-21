import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import AppScrollView from '@/components/AppScrollView';
import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import ConfirmSheet from '@/components/ConfirmSheet';
import SuccessSheet from '@/components/SuccessSheet';
import Card from '@/components/Card';
import Pill from '@/components/Pill';
import Icon, { type IconName } from '@/components/Icon';
import SectionHeader from '@/components/SectionHeader';
import { Text } from '@/components/Themed';
import { icons } from '@/constants/icons';
import { elevation, palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTicketDetail } from '@/hooks/useTickets';
import {
  MaintenanceTicket,
  submitInspectionReport,
  uploadInspectionPhoto,
} from '@/services/api';

// ─── Constants ───────────────────────────────────────────────────────────────
const PRIORITY = {
  high:   { label: 'High',   color: palette.danger,  bg: palette.dangerSoft },
  medium: { label: 'Medium', color: palette.warning, bg: palette.warningSoft },
  low:    { label: 'Low',    color: palette.success, bg: palette.successSoft },
} as const;

const MAX_PHOTOS = 5;

// Photo grid tile math: 2-column square matrix inside the report card.
// screenWidth − (2 × 16 screen pad) − (2 × 16 card pad) − (1 × 8 gap) ÷ 2.
const PHOTO_COLS = 2;
const PHOTO_GAP = spacing.xs; // 8
const PHOTO_TILE = Math.floor(
  (Dimensions.get('window').width - spacing.md * 2 - spacing.md * 2 - PHOTO_GAP * (PHOTO_COLS - 1)) / PHOTO_COLS,
);

interface PhotoEntry { uri: string; mime: string }

// ─── Segmented track control ─────────────────────────────────────────────────
// A unified track (soft grey, 8px radius) with the active option rendered as a
// floating white capsule + soft shadow (Stripe/Linear style). Only the active
// label carries the semantic color; the track itself stays unified.
function ToggleGroup<T extends string | boolean>({
  options, value, onChange,
}: {
  options: { value: T; label: string; color: string; icon?: IconName }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segTrack, { backgroundColor: theme.surfaceAlt }]}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(active ? null : opt.value)}
            style={({ pressed }) => [
              styles.segItem,
              // Active = floating white capsule with a soft shadow. Inactive =
              // transparent (sits flat on the track).
              active && [styles.segItemActive, { backgroundColor: theme.surface, shadowColor: theme.shadow }],
              pressed && !active && { opacity: 0.6 },
            ]}
          >
            {opt.icon ? (
              <Icon
                name={opt.icon}
                size={15}
                color={active ? opt.color : theme.textSecondary}
                style={{ marginRight: spacing.xxs + 1 }}
              />
            ) : null}
            <Text
              style={[
                styles.segLabel,
                { color: active ? opt.color : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ReportScreen() {
  const router  = useRouter();
  const theme   = useTheme();
  const params  = useLocalSearchParams();
  const ticketId = (params.id ?? params.ticketId) as string | undefined;

  // Seed from TicketDetailSheet — renders ticket context instantly.
  const seed: MaintenanceTicket | null = params.seed
    ? JSON.parse(params.seed as string) as MaintenanceTicket
    : null;
  const { data: ticket, isLoading: loading, isError } = useTicketDetail(ticketId ?? null, seed);

  const [notes, setNotes]                     = useState('');
  const [severity, setSeverity]               = useState<'low' | 'medium' | 'high' | null>(null);
  const [rootCause, setRootCause]             = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [issueResolved, setIssueResolved]     = useState<boolean | null>(null);
  const [photos, setPhotos]                   = useState<PhotoEntry[]>([]);
  const [submitting, setSubmitting]           = useState(false);
  const [notesError, setNotesError]           = useState('');
  const [showPhotoSheet, setShowPhotoSheet]     = useState(false);
  const [showSuccessSheet, setShowSuccessSheet] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  // Hero: the AI/system anomaly text can be a wall of prose. Collapse to 2 lines
  // by default; the tech expands it only if they need the full analysis.
  const [descExpanded, setDescExpanded]       = useState(false);

  const addPhoto = (uri: string, mime: string) => {
    setPhotos((prev) => {
      if (prev.length >= MAX_PHOTOS) return prev;
      return [...prev, { uri, mime }];
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Camera access is needed.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!r.canceled) addPhoto(r.assets[0].uri, r.assets[0].mimeType ?? 'image/jpeg');
  };

  const launchGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    // 'limited' = Android 13+ partial photo access — still lets us pick photos.
    if (status !== 'granted' && status !== 'limited') {
      Alert.alert(
        'Gallery access required',
        'Please allow photo library access in your device settings.',
      );
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!r.canceled) {
      r.assets.forEach((a) => addPhoto(a.uri, a.mimeType ?? 'image/jpeg'));
    }
  };

  const doSubmit = async () => {
    if (!ticket) return;
    setNotesError('');
    setSubmitting(true);
    try {
      const { reportId } = await submitInspectionReport(
        ticket._dbId ?? ticket.ticketId,
        notes.trim(),
        severity,
        rootCause.trim() || null,
        correctiveAction.trim() || null,
        issueResolved,
      );
      let failed = 0;
      for (const p of photos) {
        try { await uploadInspectionPhoto(reportId, p.uri, p.mime); } catch { failed++; }
      }
      if (failed > 0) {
        Alert.alert(
          'Some photos failed to upload',
          `${failed} of ${photos.length} photo${photos.length > 1 ? 's' : ''} could not be uploaded. The report was saved — please check your connection and try again.`,
        );
      }
      setShowSuccessSheet(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit the report.';
      Alert.alert('Submission failed', msg + '\n\nCheck your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!ticket) return;
    if (!notes.trim()) { setNotesError('Field observations are required.'); return; }
    setShowConfirmSubmit(true);
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.surfaceAlt }]}>
        <ActivityIndicator color={palette.brand} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading ticket…</Text>
      </View>
    );
  }
  if (!ticket) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.surfaceAlt }]}>
        <Icon name={icons.error} size={36} color={palette.danger} />
        <Text style={[styles.errorTitle, { color: palette.danger }]}>
          {isError ? "Couldn't load ticket" : 'Ticket not found'}
        </Text>
      </View>
    );
  }

  const pr = PRIORITY[(ticket.priority ?? 'medium') as keyof typeof PRIORITY];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.surfaceAlt }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        extraBottomPad={0}
      >
        {/* ── Ticket summary ──────────────────────────────────────────── */}
        <SectionHeader label="Ticket" />
        <Card style={styles.section}>
          <Text style={[styles.ticketTitle, { color: theme.text }]}>{ticket.stationName}</Text>
          {ticket.flaggedAnomaly ? (
            <Pressable
              onPress={() => setDescExpanded((v) => !v)}
              style={({ pressed }) => [styles.descBlock, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View>
                <Text
                  style={[styles.ticketDesc, { color: theme.textSecondary }]}
                  numberOfLines={descExpanded ? undefined : 2}
                >
                  {ticket.flaggedAnomaly}
                </Text>
                {/* Collapsed: a smooth white→transparent fade over the last line
                    instead of a hard cut. (theme.surface is the card bg.) */}
                {!descExpanded && (
                  <LinearGradient
                    colors={['transparent', theme.surface]}
                    style={styles.descFade}
                    pointerEvents="none"
                  />
                )}
              </View>
              {/* Sleek low-profile chevron — signifies the container expands.
                  Rotated 180° when expanded (no separate up-glyph needed). */}
              <View style={styles.descChevron}>
                <Icon
                  name={icons.chevronDown}
                  size={16}
                  color={theme.textTertiary}
                  style={descExpanded ? { transform: [{ rotate: '180deg' }] } : undefined}
                />
              </View>
            </Pressable>
          ) : null}

          <View style={styles.ticketChips}>
            {ticket.priority ? (
              <Pill label={`${pr.label} Priority`} color={pr.color} bg={pr.bg} outline />
            ) : null}
            {ticket.anomalyZone ? (
              <Pill label={`Zone ${ticket.anomalyZone}`} color={palette.accent} bg={palette.accentSoft} />
            ) : null}
          </View>

          {ticket.coordinates ? (
            <View style={[styles.coordRow, { borderTopColor: theme.border }]}>
              <Icon name={icons.coordinates} size={14} color={theme.textSecondary} />
              <Text style={[styles.coordText, { color: theme.textSecondary }]}>{ticket.coordinates}</Text>
            </View>
          ) : null}
        </Card>

        {/* ── Follow-up callout ──────────────────────────────────────── */}
        {ticket.isFollowUp && (
          <View style={{ marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: palette.warningSoft, borderWidth: 1, borderColor: theme.status.warning + '4D' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.status.warning, marginBottom: 4 }}>
              Follow-up visit{(ticket.followUpCount ?? 0) > 1 ? ` #${ticket.followUpCount}` : ''} — analyst instructions
            </Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
              {ticket.followUpNotes || 'No additional instructions provided.'}
            </Text>
          </View>
        )}

        {/* ── Report fields — one unified card; sections separated by 0.5px
            hairline dividers (seamless settings-list look, no input boxes). ── */}
        <SectionHeader label="Inspection Report" spaced />
        <Card style={[styles.section, styles.formCard]}>

          {/* Field observations */}
          <View style={[styles.fieldBlock, { borderBottomColor: theme.divider }]}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>
              Field Observations <Text style={{ color: palette.danger }}>*</Text>
            </Text>
            <TextInput
              style={[styles.bareInput, styles.bareMultiline, { color: theme.text }]}
              multiline
              placeholder="Describe what you observed on site…"
              placeholderTextColor={theme.textTertiary}
              value={notes}
              onChangeText={(v) => { setNotes(v); if (v.trim()) setNotesError(''); }}
              textAlignVertical="top"
            />
            {notesError ? (
              <View style={styles.errorRow}>
                <Icon name={icons.errorFill} size={13} color={palette.danger} />
                <Text style={styles.errorText}>{notesError}</Text>
              </View>
            ) : null}
          </View>

          {/* Severity */}
          <View style={[styles.fieldBlock, { borderBottomColor: theme.divider }]}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Severity</Text>
            <ToggleGroup
              value={severity}
              onChange={setSeverity}
              options={[
                { value: 'low',    label: 'Low',    color: palette.success },
                { value: 'medium', label: 'Medium', color: palette.warning },
                { value: 'high',   label: 'High',   color: palette.danger  },
              ]}
            />
          </View>

          {/* Root cause */}
          <View style={[styles.fieldBlock, { borderBottomColor: theme.divider }]}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>
              Root Cause{' '}
              <Text style={[styles.fieldOptional, { color: theme.textTertiary }]}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.bareInput, { color: theme.text }]}
              placeholder="e.g. clogged gauge, cable fault, sediment build-up"
              placeholderTextColor={theme.textTertiary}
              value={rootCause}
              onChangeText={setRootCause}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Corrective action & recommendations */}
          <View style={[styles.fieldBlock, { borderBottomColor: theme.divider }]}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>
              Corrective Action & Recommendations{' '}
              <Text style={[styles.fieldOptional, { color: theme.textTertiary }]}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.bareInput, styles.bareMultiline, { color: theme.text }]}
              multiline
              placeholder="Describe what you did to fix the issue, and any recommendations for future maintenance…"
              placeholderTextColor={theme.textTertiary}
              value={correctiveAction}
              onChangeText={setCorrectiveAction}
              textAlignVertical="top"
            />
          </View>

          {/* Issue resolved — last block, no divider */}
          <View style={styles.fieldBlockLast}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>Issue Resolved?</Text>
            <ToggleGroup
              value={issueResolved}
              onChange={setIssueResolved}
              options={[
                { value: true,  label: 'Yes — Fixed',      color: palette.success, icon: icons.success },
                { value: false, label: 'No — Needs Work',  color: palette.danger,  icon: icons.cancelled },
              ]}
            />
          </View>
        </Card>

        {/* ── Photo evidence ─────────────────────────────────────────── */}
        <SectionHeader label="Photo Evidence" spaced />
        <Card style={styles.section}>
          <Text style={[styles.photoCount, { color: theme.textSecondary }]}>
            {photos.length} / {MAX_PHOTOS} photos
          </Text>

          {/* Uniform square grid: each photo is a square; the Add-Photo trigger
              is the final square tile in the sequence (until MAX is reached). */}
          <View style={styles.photoGrid}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoTile}>
                <Image source={{ uri: p.uri }} style={styles.photoImg} resizeMode="cover" />
                <Pressable
                  onPress={() => removePhoto(i)}
                  style={({ pressed }) => [styles.thumbRemove, { opacity: pressed ? 0.7 : 1 }]}
                  hitSlop={8}
                >
                  <Icon name={icons.close} size={13} color={palette.white} />
                </Pressable>
              </View>
            ))}

            {photos.length < MAX_PHOTOS && (
              <Pressable
                onPress={() => setShowPhotoSheet(true)}
                style={({ pressed }) => [
                  styles.photoTile,
                  styles.addTile,
                  { backgroundColor: palette.brandSoft, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name={icons.camera} size={24} color={palette.brand} />
              </Pressable>
            )}
          </View>
        </Card>

        {/* ── Submit ──────────────────────────────────────────────────── */}
        <View style={styles.submitWrap}>
          <Button
            label={submitting ? 'Submitting…' : 'Submit Report'}
            onPress={handleSubmit}
            loading={submitting}
            icon={submitting ? undefined : icons.send}
            iconRight
          />
        </View>
      </AppScrollView>

      {/* Photo source sheet */}
      <BottomSheet
        visible={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        title="Attach Photo"
        actions={[
          { label: 'Take Photo', variant: 'primary', onPress: launchCamera },
          {
            label: 'Choose from Gallery',
            subtitle: `Select up to ${MAX_PHOTOS - photos.length} photo${MAX_PHOTOS - photos.length === 1 ? '' : 's'} at once`,
            onPress: launchGallery,
          },
          { label: 'Cancel', onPress: () => {} },
        ]}
      />

      {/* Submit confirmation */}
      <ConfirmSheet
        visible={showConfirmSubmit}
        title={ticket?.isFollowUp ? 'Submit Follow-up?' : 'Submit Report?'}
        message={
          ticket?.isFollowUp
            ? 'Your updated findings will be sent to the analyst for review.'
            : 'Your findings will be submitted for analyst review. This cannot be undone.'
        }
        confirmLabel="Submit"
        cancelLabel="Go back"
        onConfirm={() => { setShowConfirmSubmit(false); doSubmit(); }}
        onCancel={() => setShowConfirmSubmit(false)}
      />

      {/* Success sheet */}
      <SuccessSheet
        visible={showSuccessSheet}
        title="Report Submitted"
        message="Your report was sent to the analyst for review."
        onAction={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
  },
  errorTitle: {
    fontSize: typography.subtitle.size,
    fontWeight: typography.subtitle.weight,
  },

  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },

  section: { marginBottom: 0 },

  // Ticket summary ─────────────────────────────────────────────────────────
  ticketTitle: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    letterSpacing: typography.subtitle.letterSpacing,
    marginBottom: spacing.xxs + 2,
  },
  descBlock: {
    marginBottom: spacing.sm,
  },
  ticketDesc: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight + 2,
  },
  // White→transparent fade pinned over the bottom of the collapsed text.
  descFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
  },
  // Low-profile centered chevron beneath the description.
  descChevron: {
    alignItems: 'center',
    paddingTop: spacing.xxs,
  },
  ticketChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  coordText: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
  },

  // Unified form card — sections inside are separated by hairline dividers, so
  // the card itself has no inner padding (each block owns its padding).
  formCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  // A seamless section row: vertical padding + a 0.5px bottom divider. The last
  // block drops the divider.
  fieldBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldBlockLast: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  fieldOptional: {
    fontSize: typography.caption.size,
    fontWeight: '400',
  },

  // Bare inputs — no fill, no border, no radius. Just text on the card surface,
  // so the entry reads as part of the seamless list.
  // Borderless, document-style input. multiline TextInputs grow with their
  // content natively; we only set a small minHeight floor so an empty field
  // reads as one clean line (pristine), not a tall empty box — it expands
  // fluidly from there as the tech types.
  bareInput: {
    padding: 0,
    paddingTop: 2,            // optical: nudges first line off the microheader
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    fontWeight: '400',
    minHeight: typography.body.lineHeight + 4,   // ~one line, then grows
  },
  // The two long-form entries start at a comfortable two-ish lines, then expand.
  bareMultiline: {
    minHeight: typography.body.lineHeight * 2 + 4,
  },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  errorText: {
    color: palette.danger,
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontWeight: '500',
  },

  // Segmented track control ──────────────────────────────────────────────────
  segTrack: {
    flexDirection: 'row',
    borderRadius: radius.sm,   // 8
    padding: 3,                // inset so the active capsule floats within
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.xs,   // 6 — capsule corners nest inside the 8 track
    minHeight: 38,
  },
  segItemActive: {
    ...elevation.sm,
  },
  segLabel: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '600',
  },

  // Photo ──────────────────────────────────────────────────────────────────
  photoCount: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  // Uniform square grid — photos + the inline Add-Photo tile, wrapping rows.
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PHOTO_GAP,
  },
  photoTile: {
    width: PHOTO_TILE,
    height: PHOTO_TILE,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImg: { width: '100%', height: '100%' },
  // Inline Add tile — soft brand-blue square, centered camera, no text wrapper.
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modern native delete: dark semi-transparent circle + white X, inset in the
  // top-right corner of the tile.
  thumbRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(17,24,39,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Submit ─────────────────────────────────────────────────────────────────
  submitWrap: {
    marginTop: spacing.lg,
  },
});
