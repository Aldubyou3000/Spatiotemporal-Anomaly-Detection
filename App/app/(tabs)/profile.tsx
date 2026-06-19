import { useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppScrollView from '@/components/AppScrollView';
import CloudBackground from '@/components/CloudBackground';
import BottomSheet from '@/components/BottomSheet';
import Card from '@/components/Card';
import Icon, { type IconName } from '@/components/Icon';
import { Text } from '@/components/Themed';
import { icons } from '@/constants/icons';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';

// ─── Section label — elegant, low-key tracking ────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{label}</Text>;
}

// ─── Static info row (label primary, value secondary) ─────────────────────────
function InfoRow({
  icon, label, value, last = false,
}: {
  icon: IconName; label: string; value: string; last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowIconWrap, { backgroundColor: theme.surfaceAlt }]}>
          <Icon name={icon} size={15} color={theme.textSecondary} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, { color: theme.textMuted }]} numberOfLines={1}>{value}</Text>
      {!last && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
    </View>
  );
}

// ─── Actionable row — value + chevron, pressable ──────────────────────────────
function ActionRow({
  icon, label, value, onPress, last = false,
}: {
  icon: IconName; label: string; value?: string;
  onPress: () => void; last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#00000011', borderless: false }}
      style={({ pressed }) => [styles.row, Platform.OS === 'ios' && { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.rowIconWrap, { backgroundColor: theme.surfaceAlt }]}>
          <Icon name={icon} size={15} color={theme.textSecondary} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={[styles.rowValue, { color: theme.textMuted }]}>{value}</Text> : null}
        <Icon name={icons.chevronRight} size={16} color={theme.textTertiary} style={{ marginLeft: 6 }} />
      </View>
      {!last && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { technicianName, logout, profile, isDarkMode, toggleTheme } = useAppContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);

  const stationDisplay = profile?.station_ids?.length
    ? profile.station_ids.join(', ')
    : 'None assigned';

  const initials = technicianName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.isDark ? '#191C23' : '#F2F4F7' }]}>
      {/* Lifted so the scallop bottoms out around the middle of the avatar — the
          name and role sit on plain grey below it. */}
      <CloudBackground width={screenW} isDark={theme.isDark} offsetY={-screenW * 0.4} />
      <AppScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        {/* ── Identity ────────────────────────────────────────────────── */}
        <View style={styles.identity}>
          {/* Opaque surface fill (not translucent brandSoft) so the avatar lifts
              cleanly off the blue cloud behind it instead of blending in. */}
          <View style={[styles.avatar, { backgroundColor: theme.surface, borderColor: palette.brand + '33' }]}>
            <Text style={[styles.avatarText, { color: palette.brand }]}>{initials || '?'}</Text>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{technicianName}</Text>
          <View style={styles.roleRow}>
            <Icon name={icons.technician} size={13} color={theme.textMuted} style={{ marginRight: 5 }} />
            <Text style={[styles.role, { color: theme.textMuted }]}>Field Technician</Text>
          </View>
        </View>

        {/* ── Account ─────────────────────────────────────────────────── */}
        <SectionLabel label="ACCOUNT" />
        <Card style={styles.listCard}>
          <InfoRow icon={icons.username} label="Username" value={`@${profile?.username ?? '—'}`} />
          <InfoRow icon={icons.email}    label="Email"    value={profile?.email ?? '—'} />
          {profile?.phone ? (
            <InfoRow icon={icons.phone} label="Phone" value={profile.phone} />
          ) : null}
          <ActionRow icon={icons.stations} label="Stations" value={stationDisplay} onPress={() => {}} last />
        </Card>

        {/* ── Preferences (separated by whitespace) ───────────────────── */}
        <View style={styles.sectionGap}>
          <SectionLabel label="PREFERENCES" />
          <Card style={styles.listCard}>
            <ActionRow
              icon={isDarkMode ? icons.themeDark : icons.themeLight}
              label="Appearance"
              value={isDarkMode ? 'Dark' : 'Light'}
              onPress={toggleTheme}
              last
            />
          </Card>
        </View>

        {/* ── Sign out — red-text ghost button ────────────────────────── */}
        <Pressable
          onPress={() => setShowLogoutSheet(true)}
          android_ripple={{ color: palette.danger + '22', borderless: false }}
          style={({ pressed }) => [styles.signOut, Platform.OS === 'ios' && { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name={icons.logout} size={16} color={palette.danger} style={{ marginRight: 8 }} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </AppScrollView>

      <BottomSheet
        visible={showLogoutSheet}
        onClose={() => setShowLogoutSheet(false)}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        actions={[
          { label: 'Sign Out', variant: 'danger', onPress: logout },
          { label: 'Cancel',   onPress: () => {} },
        ]}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
  },

  // Identity ──────────────────────────────────────────────────────────────
  identity: {
    alignItems: 'center',
    marginTop: spacing.lg,    // sits the avatar within the cloud's lower scallop
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 88, height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
  },
  name: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    marginBottom: spacing.xxs + 2,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  role: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '500',
  },

  // Section label ───────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  sectionGap: {
    marginTop: spacing.lg,   // whitespace separation between sections
  },

  // Rows ──────────────────────────────────────────────────────────────────
  listCard: {
    padding: 0,
    overflow: 'hidden',  // clips dividers flush to the rounded border
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
    position: 'relative',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  rowIconWrap: {
    width: 28, height: 28,
    borderRadius: radius.xs + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  rowLabel: {
    fontSize: typography.bodyMed.size,      // 16 — matches readability of main app
    lineHeight: typography.bodyMed.lineHeight,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: typography.callout.size,      // 15 — clearly smaller than label
    lineHeight: typography.callout.lineHeight,
    fontWeight: '400',                      // data values = regular weight
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: spacing.md,
    maxWidth: 210,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
  },

  // Sign out — transparent ghost, red text ──────────────────────────────────
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  signOutText: {
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    fontWeight: '600',
    color: palette.danger,
  },
});
