/**
 * DateRangePopover — an inline dropdown panel anchored UNDER the date pill (not a
 * bottom sheet). Hosts <RangeCalendar> plus presets + Clear/Apply.
 *
 * RN views get clipped by ancestor overflow, so the panel renders inside a
 * transparent Modal and is positioned with absolute `top` derived from the
 * anchor's on-screen rect (measureInWindow) — the established pattern for
 * dropdowns that must escape a clipping parent. Tapping the backdrop dismisses.
 */

import { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import RangeCalendar, { type DateRange } from '@/components/RangeCalendar';
import { Text } from '@/components/Themed';
import { duration, ease } from '@/constants/Motion';
import { elevation, palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export type AnchorRect = { x: number; y: number; width: number; height: number };

const SCREEN_H = Dimensions.get('window').height;
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
    transform: [{ translateY: (1 - o.value) * -8 }, { scale: 0.98 + o.value * 0.02 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: o.value }));

  // Position just below the anchor; clamp so the panel never runs off-screen.
  const top = anchor ? anchor.y + anchor.height + 6 : 120;

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

      <Animated.View
        style={[
          styles.panel,
          { top, backgroundColor: theme.surface, borderColor: theme.border, maxHeight: SCREEN_H - top - spacing.lg },
          elevation.lg,
          panelStyle,
        ]}
      >
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
    </Modal>
  );
}

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: {
    position: 'absolute',
    left: PANEL_W_INSET,
    right: PANEL_W_INSET,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  preset: {
    flex: 1,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontSize: typography.caption.size,
    fontWeight: '600',
  },
  footer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
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
