import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Pill from '@/components/Pill';
import SectionHeader from '@/components/SectionHeader';
import { Text } from '@/components/Themed';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import {
  getTicketById,
  MaintenanceTicket,
  submitInspectionReport,
  uploadInspectionPhoto,
} from '@/services/supabaseApi';

// ─── Constants ───────────────────────────────────────────────────────────────
const PRIORITY = {
  high:   { label: 'High',   color: palette.danger,  bg: palette.dangerSoft },
  medium: { label: 'Medium', color: palette.warning, bg: palette.warningSoft },
  low:    { label: 'Low',    color: palette.success, bg: palette.successSoft },
} as const;

// ─── Toggle group (used for sensor + severity) ───────────────────────────────
function ToggleGroup<T extends string | boolean>({
  options, value, onChange,
}: {
  options: { value: T; label: string; color: string; icon?: React.ComponentProps<typeof Ionicons>['name'] }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggleRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(active ? null : opt.value)}
            style={({ pressed }) => [
              styles.toggleBtn,
              {
                backgroundColor: active ? opt.color + '12' : theme.surface,
                borderColor: active ? opt.color : theme.borderStrong,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            {opt.icon ? (
              <Ionicons
                name={opt.icon}
                size={15}
                color={active ? opt.color : theme.textSecondary}
                style={{ marginRight: spacing.xxs + 1 }}
              />
            ) : null}
            <Text
              style={[
                styles.toggleLabel,
                { color: active ? opt.color : theme.textSecondary },
              ]}
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
  const router = useRouter();
  const theme  = useTheme();
  const params = useLocalSearchParams();
  const ticketId = (params.id ?? params.ticketId) as string | undefined;

  const [ticket, setTicket]               = useState<MaintenanceTicket | null>(null);
  const [notes, setNotes]                 = useState('');
  const [sensorWorking, setSensorWorking] = useState<boolean | null>(null);
  const [severity, setSeverity]           = useState<'low' | 'medium' | 'high' | null>(null);
  const [rootCause, setRootCause]         = useState('');
  const [photoUri, setPhotoUri]           = useState<string | null>(null);
  const [photoMime, setPhotoMime]         = useState('image/jpeg');
  const [loading, setLoading]             = useState(true);
  const [submitting, setSubmitting]       = useState(false);
  const [notesError, setNotesError]       = useState('');
  const [showPhotoSheet, setShowPhotoSheet]     = useState(false);
  const [showSuccessSheet, setShowSuccessSheet] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ticketId) return;
      const found = await getTicketById(ticketId);
      if (mounted) {
        setTicket(found);
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [ticketId]);

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Camera access is needed.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!r.canceled) { setPhotoUri(r.assets[0].uri); setPhotoMime(r.assets[0].mimeType ?? 'image/jpeg'); }
  };

  const launchGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Photo library access is needed.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!r.canceled) { setPhotoUri(r.assets[0].uri); setPhotoMime(r.assets[0].mimeType ?? 'image/jpeg'); }
  };

  const handleSubmit = async () => {
    if (!ticket) return;
    if (!notes.trim()) {
      setNotesError('Field observations are required.');
      return;
    }
    setNotesError('');
    setSubmitting(true);
    try {
      const { reportId } = await submitInspectionReport(
        ticket._dbId ?? ticket.ticketId,
        notes.trim(),
        sensorWorking,
        severity,
        rootCause.trim() || null,
      );
      if (photoUri) await uploadInspectionPhoto(reportId, photoUri, photoMime);
      setShowSuccessSheet(true);
    } catch {
      Alert.alert('Submission failed', 'Could not submit the report. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={palette.brand} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading ticket…
        </Text>
      </View>
    );
  }
  if (!ticket) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Ionicons name="alert-circle-outline" size={36} color={palette.danger} />
        <Text style={[styles.errorTitle, { color: palette.danger }]}>
          Ticket not found
        </Text>
      </View>
    );
  }

  const pr = PRIORITY[(ticket.priority ?? 'medium') as keyof typeof PRIORITY];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Ticket summary ──────────────────────────────────────────── */}
        <SectionHeader label="Ticket" />
        <Card style={styles.section}>
          <Text style={[styles.ticketTitle, { color: theme.text }]}>
            {ticket.stationName}
          </Text>
          <Text style={[styles.ticketDesc, { color: theme.textSecondary }]}>
            {ticket.flaggedAnomaly}
          </Text>

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
              <Ionicons name="navigate-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.coordText, { color: theme.textSecondary }]}>
                {ticket.coordinates}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* ── Field observations ──────────────────────────────────────── */}
        <SectionHeader label="Field Observations" spaced />
        <Card style={styles.section}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            What did you observe? <Text style={{ color: palette.danger }}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.textarea,
              {
                backgroundColor: theme.surfaceAlt,
                color: theme.text,
                borderColor: notesError ? palette.danger : theme.borderStrong,
              },
            ]}
            multiline
            placeholder="Describe what you saw on site…"
            placeholderTextColor={theme.textTertiary}
            value={notes}
            onChangeText={(v) => { setNotes(v); if (v.trim()) setNotesError(''); }}
            textAlignVertical="top"
          />
          {notesError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={13} color={palette.danger} />
              <Text style={styles.errorText}>{notesError}</Text>
            </View>
          ) : null}

          {/* Sensor status */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Is the sensor working?
            </Text>
            <ToggleGroup
              value={sensorWorking}
              onChange={setSensorWorking}
              options={[
                { value: true,  label: 'Yes', color: palette.success, icon: 'checkmark-circle-outline' },
                { value: false, label: 'No',  color: palette.danger,  icon: 'close-circle-outline' },
              ]}
            />
          </View>

          {/* Severity */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Severity
            </Text>
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
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Root cause{' '}
              <Text style={[styles.fieldOptional, { color: theme.textTertiary }]}>
                (optional)
              </Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceAlt,
                  color: theme.text,
                  borderColor: theme.borderStrong,
                },
              ]}
              placeholder="e.g. sensor malfunction, clogged gauge"
              placeholderTextColor={theme.textTertiary}
              value={rootCause}
              onChangeText={setRootCause}
              multiline
              textAlignVertical="top"
            />
          </View>
        </Card>

        {/* ── Photo ──────────────────────────────────────────────────── */}
        <SectionHeader label="Photo Evidence" spaced />
        <Card style={styles.section}>
          {photoUri ? (
            <View>
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
              <Pressable
                onPress={() => { setPhotoUri(null); setPhotoMime('image/jpeg'); }}
                style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="trash-outline" size={14} color={palette.danger} />
                <Text style={styles.removeBtnText}>Remove photo</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowPhotoSheet(true)}
              style={({ pressed }) => [
                styles.photoPicker,
                {
                  borderColor: theme.borderStrong,
                  backgroundColor: theme.surfaceMuted,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={[styles.photoIconWrap, { backgroundColor: palette.brandSoft }]}>
                <Ionicons name="camera-outline" size={22} color={palette.brand} />
              </View>
              <Text style={[styles.photoTitle, { color: theme.text }]}>
                Attach a photo
              </Text>
              <Text style={[styles.photoSub, { color: theme.textSecondary }]}>
                Camera or gallery — optional
              </Text>
            </Pressable>
          )}
        </Card>

        {/* ── Submit ──────────────────────────────────────────────────── */}
        <View style={styles.submitWrap}>
          <Button
            label={submitting ? 'Submitting…' : 'Submit Report'}
            onPress={handleSubmit}
            loading={submitting}
            icon={submitting ? undefined : 'paper-plane-outline'}
            iconRight
          />
        </View>
      </ScrollView>

      {/* Photo source sheet */}
      <BottomSheet
        visible={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        title="Attach Photo"
        actions={[
          { label: 'Take Photo',           variant: 'primary', onPress: launchCamera },
          { label: 'Choose from Gallery',                       onPress: launchGallery },
          { label: 'Cancel',                                    onPress: () => {} },
        ]}
      />

      {/* Success sheet */}
      <BottomSheet
        visible={showSuccessSheet}
        onClose={() => {}}
        title="Report Submitted"
        message="Your report was sent to the analyst for review."
        actions={[
          { label: 'Done', variant: 'primary', onPress: () => router.back() },
        ]}
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

  section: { marginBottom: 0 }, // SectionHeader provides spacing

  // Ticket summary ─────────────────────────────────────────────────────────
  ticketTitle: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    letterSpacing: typography.subtitle.letterSpacing,
    marginBottom: spacing.xxs + 2,
  },
  ticketDesc: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight + 2,
    marginBottom: spacing.sm,
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

  // Form fields ────────────────────────────────────────────────────────────
  fieldGroup: { marginTop: spacing.md },
  fieldLabel: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  fieldOptional: {
    fontSize: typography.caption.size,
    fontWeight: '400',
  },

  textarea: {
    minHeight: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
  },
  input: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
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

  // Toggle group ───────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  toggleLabel: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '600',
  },

  // Photo ──────────────────────────────────────────────────────────────────
  photo: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
  },
  photoPicker: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  photoIconWrap: {
    width: 48, height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  photoTitle: {
    fontSize: typography.bodyBold.size,
    lineHeight: typography.bodyBold.lineHeight,
    fontWeight: typography.bodyBold.weight,
  },
  photoSub: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    marginTop: 2,
  },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.dangerSoft,
  },
  removeBtnText: {
    color: palette.danger,
    fontWeight: '600',
    fontSize: typography.caption.size,
  },

  // Submit ─────────────────────────────────────────────────────────────────
  submitWrap: {
    marginTop: spacing.lg,
  },
});
