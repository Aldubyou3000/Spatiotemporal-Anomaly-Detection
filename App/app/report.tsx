import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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
import { Text } from '@/components/Themed';
import { useAppContext } from '@/context/AppContext';
import { getTicketById, MaintenanceTicket, submitInspectionReport, uploadInspectionPhoto } from '@/services/supabaseApi';

const PRIORITY_COLOR: Record<string, string> = {
  high: '#E53535', medium: '#F5A623', low: '#0DB976',
};

export default function ReportScreen() {
  const router = useRouter();
  const { isDarkMode } = useAppContext();
  const params = useLocalSearchParams();
  const ticketId = (params.id ?? params.ticketId) as string | undefined;

  const [ticket, setTicket] = useState<MaintenanceTicket | null>(null);
  const [notes, setNotes] = useState('');
  const [sensorWorking, setSensorWorking] = useState<boolean | null>(null);
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | null>(null);
  const [rootCause, setRootCause] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState('image/jpeg');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
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
      setNotesError('Field observations are required before submitting.');
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
        rootCause.trim() || null
      );
      if (photoUri) await uploadInspectionPhoto(reportId, photoUri, photoMime);
      setShowSuccessSheet(true);
    } catch {
      Alert.alert('Submission failed', 'Could not submit the report. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const bg = isDarkMode ? '#0A0F1E' : '#F5F7FA';
  const inputBg = isDarkMode ? '#0D1422' : '#ffffff';
  const textColor = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const secondaryText = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const borderColor = isDarkMode ? '#1E2D47' : '#E8ECF2';

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: bg }]}>
        <Text style={{ color: secondaryText }}>Loading ticket…</Text>
      </View>
    );
  }
  if (!ticket) {
    return (
      <View style={[styles.centered, { backgroundColor: bg }]}>
        <Ionicons name="alert-circle-outline" size={32} color="#E53535" style={{ marginBottom: 8 }} />
        <Text style={{ color: '#E53535', fontWeight: '600' }}>Ticket not found.</Text>
      </View>
    );
  }

  const pc = PRIORITY_COLOR[ticket.priority ?? 'medium'];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { backgroundColor: bg }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Ticket summary */}
          <Text style={[styles.sectionLabel, { color: secondaryText }]}>Ticket</Text>
          <Card style={styles.card}>
            <Text style={[styles.ticketTitle, { color: textColor }]}>{ticket.stationName}</Text>
            <Text style={[styles.ticketDesc, { color: secondaryText }]}>{ticket.flaggedAnomaly}</Text>

            <View style={styles.ticketMeta}>
              {ticket.coordinates ? (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={13} color={secondaryText} style={{ marginRight: 4 }} />
                  <Text style={[styles.metaText, { color: secondaryText }]}>{ticket.coordinates}</Text>
                </View>
              ) : null}
              {ticket.priority ? (
                <View style={[styles.priorityBadge, { backgroundColor: `${pc}12`, borderColor: `${pc}30` }]}>
                  <Text style={[styles.priorityText, { color: pc }]}>
                    {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)} Priority
                  </Text>
                </View>
              ) : null}
              {ticket.anomalyZone ? (
                <View style={[styles.zoneBadge]}>
                  <Text style={[styles.zoneText]}>Zone {ticket.anomalyZone}</Text>
                </View>
              ) : null}
            </View>
          </Card>

          {/* Field observations */}
          <Text style={[styles.sectionLabel, { color: secondaryText }]}>Field Observations</Text>
          <Card style={styles.card}>
            <TextInput
              style={[
                styles.notesInput,
                { backgroundColor: inputBg, color: textColor, borderColor: notesError ? '#E53535' : borderColor },
              ]}
              multiline
              placeholder="Describe what you observed on site…"
              placeholderTextColor={isDarkMode ? '#2A3A52' : '#A8B4CC'}
              value={notes}
              onChangeText={(v) => { setNotes(v); if (v.trim()) setNotesError(''); }}
              textAlignVertical="top"
            />
            {notesError ? (
              <View style={styles.fieldErrorRow}>
                <Ionicons name="alert-circle-outline" size={13} color="#E53535" style={{ marginRight: 4 }} />
                <Text style={styles.fieldError}>{notesError}</Text>
              </View>
            ) : null}

            {/* Sensor status */}
            <Text style={[styles.fieldLabel, { color: secondaryText }]}>Is the sensor working?</Text>
            <View style={styles.toggleRow}>
              {([true, false] as const).map((val) => {
                const active = sensorWorking === val;
                const c = val ? '#0DB976' : '#E53535';
                return (
                  <Pressable
                    key={String(val)}
                    onPress={() => setSensorWorking(active ? null : val)}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        borderColor: active ? c : borderColor,
                        backgroundColor: active ? `${c}10` : 'transparent',
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name={val ? 'checkmark-circle-outline' : 'close-circle-outline'}
                      size={15}
                      color={active ? c : secondaryText}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={{ color: active ? c : secondaryText, fontWeight: '600', fontSize: 14 }}>
                      {val ? 'Yes' : 'No'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Severity */}
            <Text style={[styles.fieldLabel, { color: secondaryText }]}>Severity</Text>
            <View style={styles.toggleRow}>
              {(['low', 'medium', 'high'] as const).map((level) => {
                const active = severity === level;
                const c = PRIORITY_COLOR[level];
                return (
                  <Pressable
                    key={level}
                    onPress={() => setSeverity(active ? null : level)}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        borderColor: active ? c : borderColor,
                        backgroundColor: active ? `${c}10` : 'transparent',
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? c : secondaryText, fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>
                      {level}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Root cause */}
            <Text style={[styles.fieldLabel, { color: secondaryText }]}>
              Root Cause <Text style={{ fontWeight: '400' }}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.shortInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
              placeholder="e.g. sensor malfunction, clogged gauge…"
              placeholderTextColor={isDarkMode ? '#2A3A52' : '#A8B4CC'}
              value={rootCause}
              onChangeText={setRootCause}
              textAlignVertical="top"
              multiline
            />
          </Card>

          {/* Photo */}
          <Text style={[styles.sectionLabel, { color: secondaryText }]}>
            Photo <Text style={{ fontWeight: '400', textTransform: 'none' }}>(optional)</Text>
          </Text>
          <Card style={styles.card}>
            {photoUri ? (
              <View>
                <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                <Pressable
                  onPress={() => { setPhotoUri(null); setPhotoMime('image/jpeg'); }}
                  style={({ pressed }) => [styles.removePhotoBtn, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name="trash-outline" size={13} color="#E53535" style={{ marginRight: 5 }} />
                  <Text style={styles.removePhotoBtnText}>Remove photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowPhotoSheet(true)}
                style={({ pressed }) => [styles.photoPickerBtn, { borderColor, opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="camera-outline" size={26} color={secondaryText} style={{ marginBottom: 8 }} />
                <Text style={{ color: textColor, fontSize: 14, fontWeight: '600' }}>Attach a photo</Text>
                <Text style={{ color: secondaryText, fontSize: 12, marginTop: 4 }}>
                  Camera or gallery
                </Text>
              </Pressable>
            )}
          </Card>

          <Button
            label={submitting ? 'Submitting…' : 'Submit Verification Report'}
            onPress={handleSubmit}
            loading={submitting}
            style={styles.submitBtn}
          />
        </ScrollView>
      </View>

      <BottomSheet
        visible={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        title="Attach Photo"
        actions={[
          { label: 'Take Photo', variant: 'primary', onPress: launchCamera },
          { label: 'Choose from Gallery', onPress: launchGallery },
          { label: 'Cancel', onPress: () => {} },
        ]}
      />

      <BottomSheet
        visible={showSuccessSheet}
        onClose={() => {}}
        title="Report Submitted"
        message="Your report has been sent to the analyst for review."
        actions={[
          { label: 'Done', variant: 'primary', onPress: () => router.back() },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 18, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  card: { marginBottom: 18 },

  ticketTitle: { fontSize: 16, fontWeight: '700', marginBottom: 5, lineHeight: 22 },
  ticketDesc: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  ticketMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  metaChip: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12 },
  priorityBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  zoneBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(155,109,255,0.08)', borderWidth: 1, borderColor: 'rgba(155,109,255,0.25)' },
  zoneText: { fontSize: 11, fontWeight: '700', color: '#9B6DFF' },

  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 18, marginBottom: 4 },
  fieldErrorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  fieldError: { color: '#E53535', fontSize: 12, fontWeight: '500' },

  notesInput: {
    minHeight: 100, borderRadius: 10, borderWidth: 1,
    padding: 12, fontSize: 14, marginTop: 4,
  },
  shortInput: {
    minHeight: 64, borderRadius: 10, borderWidth: 1,
    padding: 12, fontSize: 14, marginTop: 8,
  },

  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },

  photo: { width: '100%', height: 200, borderRadius: 10 },
  photoPickerBtn: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 28, alignItems: 'center',
  },
  removePhotoBtn: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, backgroundColor: 'rgba(229,53,53,0.07)',
    borderWidth: 1, borderColor: 'rgba(229,53,53,0.2)',
  },
  removePhotoBtnText: { color: '#E53535', fontWeight: '600', fontSize: 12 },

  submitBtn: { marginTop: 4 },
});
