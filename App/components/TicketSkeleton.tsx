import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// ─── Shimmer building block ──────────────────────────────────────────────────
function ShimmerBox({
  width, height, style,
}: {
  width: number | `${number}%`;
  height: number;
  style?: object;
}) {
  const theme = useTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 800 }),
        withTiming(0.4, { duration: 800 }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const baseColor = theme.isDark ? '#1E2D47' : '#E2E8F0';

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: 6, backgroundColor: baseColor },
        animStyle,
        style,
      ]}
    />
  );
}

// ─── Skeleton card ───────────────────────────────────────────────────────────
function SkeletonCard() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/* Status + priority row */}
      <View style={styles.topRow}>
        <ShimmerBox width={88} height={22} style={{ borderRadius: radius.pill }} />
        <ShimmerBox width={64} height={22} style={{ borderRadius: radius.pill }} />
      </View>
      {/* Title */}
      <ShimmerBox width="68%" height={16} style={{ marginBottom: spacing.xs }} />
      {/* Description lines */}
      <ShimmerBox width="100%" height={12} style={{ marginBottom: 6 }} />
      <ShimmerBox width="56%" height={12} style={{ marginBottom: spacing.md }} />
      {/* Meta chips */}
      <View style={styles.metaRow}>
        <ShimmerBox width={60} height={10} />
        <ShimmerBox width={72} height={10} />
      </View>
      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      {/* Action button */}
      <ShimmerBox width="100%" height={40} style={{ borderRadius: radius.sm + 2 }} />
    </View>
  );
}

// ─── Public component ────────────────────────────────────────────────────────
export default function TicketSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
});
