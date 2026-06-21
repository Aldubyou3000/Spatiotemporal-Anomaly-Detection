import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import RangeCalendar, { type DateRange } from '@/components/RangeCalendar';
import { Text } from '@/components/Themed';
import { duration, ease } from '@/constants/Motion';
import { icons } from '@/constants/icons';
import Icon from '@/components/Icon';
import { elevation, palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export type AnchorRect = { x: number; y: number; width: number; height: number };

const PANEL_W_INSET = spacing.md; // left/right margin from screen edge

// Quick presets — start/end at local day boundaries.
function preset(kind: 'today' | 'week' | 'month'): DateRange {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === 'today') return { start: end, end };
  if (kind === 'week') {
    const s = new Date(end); s.setDate(end.getDate() - 6);
    return { start: s, end };
  }
  const s = new Date(end); s.setDate(end.getDate() - 29);
  return { start: s, end };
}

type Props = {
  visible: boolean;
  anchor: AnchorRect | null;
  value: DateRange;
  onClose: () => void;
  onApply: (range: DateRange) => void;
};

export default function DateRangePopover({ visible, anchor, value, onClose, onApply }: Props) {
  const theme = useTheme();
  const [draft, setDraft] = useState<DateRange>(value);
  useEffect(() => { if (visible) setDraft(value); }, [visible]);

  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withTiming(visible ? 1 : 0, { duration: visible ? duration.normal : duration.fast, easing: ease });
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ scale: 0.96 + o.value * 0.04 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: o.value }));

  const summary = draft.start
    ? draft.end
      ? `${fmt(draft.start)} — ${fmt(draft.end)}`
      : `${fmt(draft.start)} — pick end`
    : 'Select a range';

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={styles.centeredWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.panel,
            { backgroundColor: theme.surface, borderColor: theme.border },
            elevation.lg,
            panelStyle,
          ]}
        >
          {/* Header */}
          <View style={[styles.panelHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.panelTitle, { color: theme.text }]}>Filter by date</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.6 : 1 }]}
              accessibilityLabel="Close"
            >
              <Icon name={icons.close} size={16} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {/* Presets */}
            <View style={styles.presetRow}>
              {([['Today', 'today'], ['7 days', 'week'], ['30 days', 'month']] as const).map(([label, kind]) => (
                <Pressable
                  key={kind}
                  onPress={() => setDraft(preset(kind))}
                  style={({ pressed }) => [
                    styles.preset,
                    { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.presetText, { color: theme.textSecondary }]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <RangeCalendar value={draft} onChange={setDraft} />
          </View>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Text style={[styles.summary, { color: draft.start ? palette.brand : theme.textTertiary }]} numberOfLines={1}>
              {summary}
            </Text>
            <View style={styles.footerBtns}>
              <Pressable
                onPress={() => setDraft({ start: null, end: null })}
                style={({ pressed }) => [styles.btn, styles.btnGhost, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.btnText, { color: theme.textSecondary }]}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={() => { onApply(draft); onClose(); }}
                style={({ pressed }) => [styles.btn, { backgroundColor: palette.brand, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' },
  centeredWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: PANEL_W_INSET,
  },
  panel: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: {
    fontSize: typography.bodyBold.size,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  preset: {
    flex: 1,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontSize: typography.caption.size,
    fontWeight: '600',
  },
  footer: {
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  summary: {
    fontSize: typography.callout.size,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1 },
  btnText: { fontSize: typography.bodyBold.size, fontWeight: '700' },
});
