import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import BottomSheet from '@/components/BottomSheet';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { Text } from '@/components/Themed';
import { useAppContext } from '@/context/AppContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: IoniconName;
  label: string;
  value: string;
}) {
  const { isDarkMode } = useAppContext();
  const textColor = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const secondaryText = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const dividerColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={[styles.infoRow, { borderBottomColor: dividerColor }]}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={15} color={secondaryText} style={{ marginRight: 8 }} />
        <Text style={[styles.infoLabel, { color: secondaryText }]}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, { color: textColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { technicianName, logout, isDarkMode, profile, toggleTheme } = useAppContext();
  const [showLogoutSheet, setShowLogoutSheet] = useState(false);

  const bg = isDarkMode ? '#0A0F1E' : '#F5F7FA';
  const textColor = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const secondaryText = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const divider = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const avatarBg = '#1E6FD9';

  const stationDisplay =
    profile?.station_ids?.length ? profile.station_ids.join(', ') : 'None assigned';

  const initials = technicianName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={[styles.wrapper, { backgroundColor: bg }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: bg }]}
        contentContainerStyle={styles.content}
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <Text style={[styles.name, { color: textColor }]}>{technicianName}</Text>
          <View style={styles.roleRow}>
            <Ionicons name="construct-outline" size={13} color={secondaryText} style={{ marginRight: 5 }} />
            <Text style={[styles.role, { color: secondaryText }]}>Field Technician</Text>
          </View>
        </View>

        {/* Account info */}
        <Text style={[styles.sectionLabel, { color: secondaryText }]}>Account</Text>
        <Card style={styles.card}>
          <InfoRow icon="at-outline"           label="Username"          value={`@${profile?.username ?? '—'}`} />
          <InfoRow icon="mail-outline"         label="Email"             value={profile?.email ?? '—'} />
          {profile?.phone ? <InfoRow icon="call-outline" label="Phone" value={profile.phone} /> : null}
          <InfoRow icon="radio-outline"        label="Assigned Stations" value={stationDisplay} />
        </Card>

        {/* Preferences */}
        <Text style={[styles.sectionLabel, { color: secondaryText }]}>Preferences</Text>
        <Card style={[styles.card, { paddingVertical: 0 }]}>
          <Pressable
            onPress={toggleTheme}
            style={({ pressed }) => [
              styles.prefRow,
              { borderBottomWidth: 0, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.prefLeft}>
              <Ionicons
                name={isDarkMode ? 'moon' : 'sunny-outline'}
                size={16}
                color={secondaryText}
                style={{ marginRight: 10 }}
              />
              <Text style={[styles.infoLabel, { color: secondaryText }]}>Appearance</Text>
            </View>
            <View style={styles.prefRight}>
              <Text style={[styles.prefValue, { color: secondaryText }]}>
                {isDarkMode ? 'Dark' : 'Light'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={secondaryText} style={{ marginLeft: 4 }} />
            </View>
          </Pressable>
        </Card>
      </ScrollView>

      {/* Sign out button - Fixed at bottom */}
      <View style={[styles.logoutContainer, { backgroundColor: bg }]}>
        <Button
          label="Sign Out"
          onPress={() => setShowLogoutSheet(true)}
          variant="danger"
          style={styles.logoutBtn}
        />
      </View>

      <BottomSheet
        visible={showLogoutSheet}
        onClose={() => setShowLogoutSheet(false)}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        actions={[
          { label: 'Sign Out', variant: 'danger', onPress: logout },
          { label: 'Cancel', onPress: () => {} },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 18, paddingBottom: 18 },

  avatarSection: { alignItems: 'center', marginBottom: 28, paddingTop: 8 },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
  name: { fontSize: 19, fontWeight: '700', marginBottom: 4, letterSpacing: -0.2 },
  roleRow: { flexDirection: 'row', alignItems: 'center' },
  role: { fontSize: 13 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  card: { marginBottom: 20 },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 1,
  },
  infoLeft: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: 13, fontWeight: '500' },
  infoValue: { fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 16 },

  prefRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1,
  },
  prefLeft: { flexDirection: 'row', alignItems: 'center' },
  prefRight: { flexDirection: 'row', alignItems: 'center' },
  prefValue: { fontSize: 13 },

  logoutContainer: {
    padding: 18,
    paddingBottom: 18 + 58 + 12, // padding + tab bar height + extra space
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  logoutBtn: { width: '100%' },
});
