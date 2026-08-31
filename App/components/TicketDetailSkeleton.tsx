import { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const SCREEN_W = Dimensions.get('window').width;
const MOSAIC_TILE = (SCREEN_W - spacing.md * 2 - spacing.md * 2 - 4) / 2;

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

function PanelSkeleton({ children, style }: { children: React.ReactNode; style?: object }) {
  const theme = useTheme();
  return <View style={[styles.panel, { backgroundColor: theme.surface, shadowColor: theme.shadow }, style]}>{children}</View>;
}

export default function TicketDetailSkeleton() {
  return (
    <View style={styles.root}>
      {/* Panel A hero */}
      <PanelSkeleton>
        <Shimmer width="82%" height={22} style={{ marginBottom: 8 }} />
        <Shimmer width={80} height={12} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Shimmer width={96} height={26} style={{ borderRadius: 8 }} />
          <Shimmer width={110} height={26} style={{ borderRadius: 8 }} />
        </View>
      </PanelSkeleton>

      {/* Description */}
      <PanelSkeleton>
        <Shimmer width={96} height={12} style={{ marginBottom: 10 }} />
        <Shimmer width="100%" height={14} style={{ marginBottom: 6 }} />
        <Shimmer width="92%" height={14} style={{ marginBottom: 6 }} />
        <Shimmer width="76%" height={14} />
      </PanelSkeleton>

      {/* Detail rows */}
      <PanelSkeleton style={{ padding: 0, overflow: 'hidden' }}>
        <View style={styles.detailRow}>
          <Shimmer width={18} height={18} style={{ borderRadius: 9 }} />
          <Shimmer width={60} height={12} />
          <View style={{ flex: 1 }} />
          <Shimmer width={96} height={14} />
        </View>
        <View style={[styles.detailDivider, { backgroundColor: '#e5e7eb' }]} />
        <View style={styles.detailRow}>
          <Shimmer width={18} height={18} style={{ borderRadius: 9 }} />
          <Shimmer width={70} height={12} />
          <View style={{ flex: 1 }} />
          <Shimmer width={80} height={14} />
        </View>
      </PanelSkeleton>

      {/* Findings */}
      <PanelSkeleton>
        <Shimmer width={140} height={12} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Shimmer width={120} height={24} style={{ borderRadius: 999 }} />
          <Shimmer width={96} height={24} style={{ borderRadius: 999 }} />
        </View>
        <Shimmer width="100%" height={14} style={{ marginBottom: 6 }} />
        <Shimmer width="96%" height={14} style={{ marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Shimmer width={MOSAIC_TILE} height={MOSAIC_TILE} style={{ borderRadius: 8 }} />
          <Shimmer width={MOSAIC_TILE} height={MOSAIC_TILE} style={{ borderRadius: 8 }} />
        </View>
      </PanelSkeleton>

      {/* Attachments placeholder */}
      <PanelSkeleton style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16 }}>
          <Shimmer width={120} height={12} />
        </View>
        <View style={[styles.detailDivider, { backgroundColor: '#e5e7eb', marginLeft: 0 }]} />
        <View style={styles.detailRow}>
          <Shimmer width={36} height={36} style={{ borderRadius: 8 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Shimmer width={160} height={12} />
            <Shimmer width={60} height={10} />
          </View>
          <Shimmer width={15} height={15} style={{ borderRadius: 8 }} />
        </View>
      </PanelSkeleton>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  panel: {
    borderRadius: 14,
    padding: spacing.md,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 18 + spacing.sm,
  },
});
