import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

function Shimmer({ width, height, style }: { width: number | `${number}%`; height: number; style?: object }) {
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.9, { duration: 800 }), withTiming(0.4, { duration: 800 })), -1, false);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const theme = useTheme();
  const baseColor = theme.isDark ? theme.surfaceAlt : theme.borderStrong;
  return <Animated.View style={[{ width, height, borderRadius: 6, backgroundColor: baseColor }, animStyle, style]} />;
}

function Row() {
  const theme = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: 'transparent' }]}>
      <Shimmer width={44} height={44} style={{ borderRadius: 22 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Shimmer width="68%" height={14} />
        <Shimmer width="52%" height={11} />
      </View>
      <Shimmer width={12} height={12} style={{ borderRadius: 6 }} />
    </View>
  );
}

export default function ActivitySkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 0 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>
          <Row />
          {i < count - 1 ? <View style={[styles.divider, { backgroundColor: '#e5e7eb22' }]} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 44 + spacing.sm,
  },
});
