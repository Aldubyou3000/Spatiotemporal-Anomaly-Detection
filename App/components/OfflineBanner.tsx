import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Themed';
import { palette, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export default function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { backgroundColor: palette.warningSoft, borderColor: theme.status.warning + '33', paddingTop: Math.max(insets.top, 6) }]}>
      <View style={[styles.dot, { backgroundColor: theme.status.warning }]} />
      <Text style={[styles.text, { color: theme.text }]}>You’re offline — showing cached data.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
