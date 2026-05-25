import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import Card from '@/components/Card';
import SectionHeader from '@/components/SectionHeader';
import { Text } from '@/components/Themed';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── InfoRow ─────────────────────────────────────────────────────────────────
function InfoRow({
  icon, label, value, last = false,
}: {
  icon: IoniconName; label: string; value: string; last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.rowIconWrap, { backgroundColor: theme.surfaceMuted }]}>
          <Ionicons name={icon} size={15} color={theme.textSecondary} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
      <Text
        style={[styles.rowValue, { color: theme.text }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Action row (themed toggle, settings entry) ──────────────────────────────
function ActionRow({
  icon, label, value, onPress, last = false,
}: {
  icon: IoniconName; label: string; value: string;
  onPress: () => void; last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.rowIconWrap, { backgroundColor: theme.surfaceMuted }]}>
          <Ionicons name={icon} size={15} color={theme.textSecondary} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, { color: theme.text }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} style={{ marginLeft: 6 }} />
      </View>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { technicianName, logout, profile, isDarkMode, toggleTheme } = useAppContext();
  const theme = useTheme();
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
    <View style={[styles.wrapper, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity ────────────────────────────────────────────────── */}
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: palette.brand }]}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{technicianName}</Text>
          <View style={styles.roleRow}>
            <Ionicons
              name="construct-outline"
              size={13}
              color={theme.textSecondary}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.role, { color: theme.textSecondary }]}>
              Field Technician
            </Text>
          </View>
        </View>

        {/* ── Account ─────────────────────────────────────────────────── */}
        <SectionHeader label="Account" />
        <Card>
          <InfoRow icon="at-outline"     label="Username" value={`@${profile?.username ?? '—'}`} />
          <InfoRow icon="mail-outline"   label="Email"    value={profile?.email ?? '—'} />
          {profile?.phone ? (
            <InfoRow icon="call-outline" label="Phone" value={profile.phone} />
          ) : null}
          <InfoRow icon="radio-outline"  label="Stations" value={stationDisplay} last />
        </Card>

        {/* ── Preferences ─────────────────────────────────────────────── */}
        <SectionHeader label="Preferences" spaced />
        <Card>
          <ActionRow
            icon={isDarkMode ? 'moon-outline' : 'sunny-outline'}
            label="Appearance"
            value={isDarkMode ? 'Dark' : 'Light'}
            onPress={toggleTheme}
            last
          />
        </Card>
      </ScrollView>

      {/* ── Sign out (anchored to bottom) ─────────────────────────────── */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.bg,
            borderTopColor: theme.border,
          },
        ]}
      >
        <Button
          label="Sign Out"
          variant="danger"
          size="lg"
          icon="log-out-outline"
          onPress={() => setShowLogoutSheet(true)}
        />
      </View>

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
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },

  // Identity ──────────────────────────────────────────────────────────────
  identity: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  avatar: {
    width: 72, height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    color: palette.white,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  name: {
    fontSize: typography.title.size,
    lineHeight: typography.title.lineHeight,
    fontWeight: typography.title.weight,
    letterSpacing: typography.title.letterSpacing,
    marginBottom: spacing.xxs + 2,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  role: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
  },

  // Rows ──────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 48,
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
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: typography.calloutMed.weight,
  },
  rowValue: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: spacing.md,
    maxWidth: 200,
  },

  // Footer ────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    // Leave room for the tab bar (~58) + safe area buffer
    paddingBottom: spacing.md + 58 + spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
