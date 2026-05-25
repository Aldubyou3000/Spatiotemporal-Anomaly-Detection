import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAppContext } from '@/context/AppContext';

function ShimmerBox({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const { isDarkMode } = useAppContext();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0.4, { duration: 700 }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const baseColor = isDarkMode ? '#1E2D47' : '#E2E8F0';

  return (
    <Animated.View
      style={[{ width, height, borderRadius: 6, backgroundColor: baseColor }, animStyle, style]}
    />
  );
}

function SkeletonCard() {
  const { isDarkMode } = useAppContext();
  const bg = isDarkMode ? '#131929' : '#ffffff';
  const border = isDarkMode ? '#1E2D47' : '#E8ECF2';

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      {/* Status + priority row */}
      <View style={styles.topRow}>
        <ShimmerBox width={80} height={22} style={{ borderRadius: 999 }} />
        <ShimmerBox width={56} height={22} style={{ borderRadius: 999 }} />
      </View>
      {/* Title */}
      <ShimmerBox width="70%" height={14} style={{ marginBottom: 8 }} />
      {/* Description lines */}
      <ShimmerBox width="100%" height={11} style={{ marginBottom: 6 }} />
      <ShimmerBox width="55%" height={11} style={{ marginBottom: 14 }} />
      {/* Meta chips */}
      <View style={styles.metaRow}>
        <ShimmerBox width={60} height={10} />
        <ShimmerBox width={72} height={10} />
      </View>
      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: border }]} />
      {/* Action button */}
      <ShimmerBox width="100%" height={38} style={{ borderRadius: 10 }} />
    </View>
  );
}

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
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginBottom: 12,
  },
});
