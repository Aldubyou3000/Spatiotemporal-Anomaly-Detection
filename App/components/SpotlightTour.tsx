/**
 * SpotlightTour — a guided coachmark walkthrough.
 *
 * Renders a dimmed full-screen overlay with a rounded "hole" cut over a real UI
 * element, plus a tooltip card (title, body, progress dots, Skip / Next). It's
 * instructional: the user taps Next (or anywhere on the dim area) to advance —
 * the real element underneath is highlighted, not interacted with.
 *
 * The hole is rendered STATICALLY (it just moves to each target on step change),
 * NOT animated frame-by-frame — animating an SVG <Mask> via reanimated re-renders
 * the whole mask every frame and is janky on Android. Snapping is smooth + exact.
 *
 * Renders as a full-screen Modal so the dim scrim covers EVERYTHING — including
 * the floating tab bar (which the navigator draws on top of the screen, so an
 * in-screen overlay couldn't dim it).
 *
 * Coordinate handling: the host screen measures each target's window position and
 * adds the safe-area top inset back on Android — RN 0.83's measureInWindow
 * subtracts the status-bar height under edge-to-edge (facebook/react-native#19497,
 * fixed in 0.86). The Modal's origin is the physical screen top, so the corrected
 * coordinates line the hole up exactly on the real element.
 *
 * Steps whose target can't be measured (e.g. the first card when the list is
 * empty) are skipped automatically.
 */
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, LayoutChangeEvent, Modal, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { palette, radius, spacing, typography } from '@/constants/theme';
import { TOUR_STEPS, type TourTargetKey } from '@/constants/tourSteps';
import { useTheme } from '@/hooks/useTheme';
import Button from './Button';
import { Text } from './Themed';

const PAD = 6;   // spotlight padding around the target
const GAP = 14;  // gap between the hole and the tooltip card

type Box = { x: number; y: number; width: number; height: number };

type Props = {
  visible: boolean;
  /** Resolve a target's rect in WINDOW coordinates, or null if it isn't on screen. */
  measure: (key: TourTargetKey) => Promise<Box | null>;
  /** Called on Skip or after the last step (parent hides the tour + marks it seen). */
  onClose: () => void;
};

export default function SpotlightTour({ visible, measure, onClose }: Props) {
  const theme = useTheme();

  const [index, setIndex]     = useState(0);
  const [box, setBox]         = useState<Box | null>(null);   // hole in window coords
  const [overlay, setOverlay] = useState({ w: 0, h: 0 });     // overlay size (onLayout)

  const step   = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  // Walk to step `i`, skipping any whose target can't be measured.
  const goTo = useCallback(async (i: number) => {
    if (i >= TOUR_STEPS.length) { onClose(); return; }
    const rect = await measure(TOUR_STEPS[i].target);
    if (!rect) { goTo(i + 1); return; }
    setIndex(i);
    setBox({
      x: rect.x - PAD,
      y: rect.y - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
    });
  }, [measure, onClose]);

  const goNext = useCallback(() => { goTo(index + 1); }, [goTo, index]);

  // On open: start at the first step (after a frame so the targets are settled).
  useEffect(() => {
    if (!visible) return;
    setIndex(0);
    setBox(null);
    const raf = requestAnimationFrame(() => goTo(0));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setOverlay({ w: width, h: height });
  }, []);

  if (!step) return null;

  const svgH = overlay.h || 0;   // measured overlay height — used for tooltip placement
  const holeRadius = box ? Math.min(step.radius ?? radius.md, box.height / 2) : radius.md;

  // Dim layer is sized to the FULL physical screen (+ a small overscan), NOT the
  // measured overlay — on Android edge-to-edge the measured size excludes the
  // nav-bar strip (bottom) and a gesture inset (right), leaving un-dimmed edges.
  const screen = Dimensions.get('screen');
  const dimW = screen.width + 64;
  const dimH = screen.height + 64;

  // Tooltip sits below the hole when the target is in the top half of the screen,
  // above it otherwise — so it never covers the highlight or runs off-screen.
  const placeBelow = box ? box.y + box.height / 2 < svgH / 2 : true;
  const tooltipPos = box
    ? placeBelow
      ? { top: box.y + box.height + GAP }
      : { bottom: svgH - box.y + GAP }
    : { top: 0 };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill} onLayout={onOverlayLayout} collapsable={false}>
        {/* Tap the dim area to advance */}
        <Pressable style={StyleSheet.absoluteFill} onPress={goNext} />

        {/* Dim scrim with the spotlight hole cut out (non-interactive) */}
        {box && (
          <Svg width={dimW} height={dimH} style={styles.scrim} pointerEvents="none">
            <Defs>
              <Mask id="spotlight">
                <Rect x={0} y={0} width={dimW} height={dimH} fill="white" />
                <Rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  rx={holeRadius}
                  ry={holeRadius}
                  fill="black"
                />
              </Mask>
            </Defs>
            <Rect x={0} y={0} width={dimW} height={dimH} fill="rgba(0,0,0,0.72)" mask="url(#spotlight)" />
          </Svg>
        )}

        {/* Tooltip card */}
        {box && (
          <View style={[styles.tooltip, tooltipPos, { backgroundColor: theme.surface }]}>
            <Text style={[styles.title, { color: theme.text }]}>{step.title}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{step.body}</Text>

            <View style={styles.footer}>
              {/* Progress dots */}
              <View style={styles.dots}>
                {TOUR_STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      { backgroundColor: i === index ? palette.brand : theme.border },
                      i === index && styles.dotActive,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.actions}>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip</Text>
                </Pressable>
                <Button
                  label={isLast ? 'Done' : 'Next'}
                  onPress={goNext}
                  size="sm"
                  style={styles.nextBtn}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Anchored top-left; the dim is oversized past the screen edges so there's
  // never an un-dimmed strip on the right / bottom.
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  tooltip: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.md,
    // Lift the card off the dim scrim.
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  title: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    letterSpacing: typography.subtitle.letterSpacing,
    marginBottom: spacing.xxs,
  },
  body: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight + 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6, height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,           // active dot stretches into a pill
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  skipText: {
    fontSize: typography.callout.size,
    fontWeight: '600',
  },
  nextBtn: {
    width: 'auto',               // override Button's full-width default → fit content
    paddingHorizontal: spacing.lg,
  },
});
