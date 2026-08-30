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
  // A solid placeholder grey that reads on the white card in both themes.
  const baseColor = theme.isDark ? theme.surfaceAlt : theme.borderStrong;

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

// ─── Skeleton card — mirrors TicketCard (avatar 48 + title + ghost row + meta) ──
function SkeletonCard() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, shadowColor: theme.shadow },
      ]}
    >
      <View style={styles.cardInner}>
        {/* Header: avatar + title + ghost indicator */}
        <View style={styles.cardHead}>
          <ShimmerBox width={48} height={48} style={{ borderRadius: 24 }} />
          <View style={styles.cardHeadText}>
            <ShimmerBox width="84%" height={16} style={{ marginBottom: 6 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShimmerBox width={7} height={7} style={{ borderRadius: 3.5 }} />
              <ShimmerBox width={64} height={12} />
              <ShimmerBox width={10} height={12} style={{ opacity: 0.3 }} />
              <ShimmerBox width={54} height={12} />
            </View>
          </View>
        </View>
        {/* Muted metadata line */}
        <ShimmerBox width="68%" height={12} />
      </View>
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
    marginBottom: spacing.sm + 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardInner: {
    padding: spacing.md + 2,
    gap: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  },
  cardHeadText: {
    flex: 1,
    gap: 4,
  },
});
