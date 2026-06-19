/**
 * PhotoGallery — full-screen swipeable photo pager with pinch/double-tap zoom,
 * Messenger-style handling of long (tall) and wide images.
 *
 * Image sizing model:
 *   Each photo is measured (Image.getSize) and laid out at FILL-WIDTH size
 *   (imgW = screen width, imgH = width / ratio). `scale` then multiplies that.
 *
 *   - fitScale = the scale that makes the WHOLE image fit on screen.
 *       wide/normal image (imgH <= screen height) → fitScale = 1.
 *       tall image (imgH > screen height)         → fitScale = height / imgH (< 1).
 *   - The DEFAULT resting scale of every image is its fitScale, so a tall image
 *     opens fully visible (zoomed out), all content shown — not a cropped sliver.
 *   - A single TAP on a tall image toggles fit (fitScale) ↔ fill (1, original
 *     width). On an image that already fits (fitScale === 1) a tap instead
 *     toggles the chrome (handled by the parent via onTap).
 *   - Pinch/double-tap zoom further, up to MAX_SCALE. The scale floor is always
 *     fitScale, so you can never shrink past "whole image visible".
 *
 * Gesture architecture:
 *   Simultaneous(pinch, Race(pan, Exclusive(doubleTap, singleTap)))
 *
 * Platform notes:
 *   - A native horizontal ScrollView claims multi-touch, killing pinch — so ALL
 *     paging + zoom live in this single RNGH tree.
 *   - Must sit under a GestureHandlerRootView; a <Modal> renders outside the
 *     app-root one, so a Modal hosting this needs its own GestureHandlerRootView.
 *   - pointerEvents goes in style={}, not as a JSX prop (ignored RN 0.83+).
 */

import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE      = 5;     // pinch ceiling (multiplied onto fill-width size)
const FIT_PADDING    = 0.82;  // fit-view leaves ~18% margin around the image
const SWIPE_FRACTION = 0.25;  // fraction of width to flip a page
const SWIPE_VEL      = 400;   // px/s fast-flick threshold

export type GalleryPhoto = { id?: string | number; photo_url: string };

// module-level cache of measured aspect ratios (w/h), keyed by uri
const ratioCache = new Map<string, number>();

export default function PhotoGallery({
  photos,
  width,
  height,
  initialIndex,
  onIndexChange,
  onTap,
}: {
  photos: GalleryPhoto[];
  width: number;
  height: number;
  initialIndex: number;
  onIndexChange?: (i: number) => void;
  // Called on a single tap ONLY when the active image already fits (fitScale==1).
  // Tall images consume the tap to toggle fit↔fill instead.
  onTap?: () => void;
}) {
  const count = photos.length;

  const pageIndex  = useSharedValue(initialIndex);
  const pagerX     = useSharedValue(-initialIndex * width);
  const scale      = useSharedValue(1);
  const tx         = useSharedValue(0);
  const ty         = useSharedValue(0);
  const baseScale  = useSharedValue(1);
  const baseTx     = useSharedValue(0);
  const baseTy     = useSharedValue(0);
  const basePagerX = useSharedValue(-initialIndex * width);

  // Geometry of the ACTIVE image at fill-width.
  const activeImgH = useSharedValue(height); // rendered height at scale 1
  const fitScale   = useSharedValue(1);      // scale that fits the whole image

  // JS-side caches keyed by page index (the per-page useEffect won't re-fire on
  // a swipe, so we restore geometry from here on settle).
  const heightsRef = useRef<number[]>([]);
  const fitRef     = useRef<number[]>([]);

  // ── worklet helpers ──────────────────────────────────────────────────────
  // Horizontal pan room: image is fill-width, so horizontal overflow exists only
  // once scaled past 1.
  const maxX = (s: number): number => {
    'worklet';
    return Math.max((width * (s - 1)) / 2, 0);
  };
  // Vertical pan room: overflow of the scaled image past the screen, halved.
  const maxY = (s: number): number => {
    'worklet';
    return Math.max((activeImgH.value * s - height) / 2, 0);
  };
  const clampTo = (v: number, hi: number): number => {
    'worklet';
    return Math.min(Math.max(v, -hi), hi);
  };

  // Animate back to the image's natural resting state: fit-to-screen, centered.
  const resetToFit = () => {
    'worklet';
    scale.value = withTiming(fitScale.value, { duration: 220 });
    tx.value    = withTiming(0, { duration: 220 });
    ty.value    = withTiming(0, { duration: 220 });
  };

  // JS-thread: page settled → restore the new image's geometry + resting scale,
  // then notify the parent (counter/dots).
  const onSettle = (next: number) => {
    activeImgH.value = heightsRef.current[next] ?? height;
    const f = fitRef.current[next] ?? 1;
    fitScale.value   = f;
    scale.value      = f;     // open the new page at its fit scale
    tx.value         = 0;
    ty.value         = 0;
    if (onIndexChange) onIndexChange(next);
  };

  const goPage = (target: number) => {
    'worklet';
    const next = Math.min(Math.max(target, 0), count - 1);
    pageIndex.value = next;
    // withTiming (not withSpring) → clean ease, no overshoot/bounce on settle.
    pagerX.value = withTiming(-next * width, { duration: 220 });
    scheduleOnRN(onSettle, next);
  };

  // Called from PhotoPage once its image is measured. Cache geometry; if it's the
  // page currently shown, apply it live (and rest at fit scale).
  const reportSize = (idx: number, imgH: number, f: number) => {
    heightsRef.current[idx] = imgH;
    fitRef.current[idx]     = f;
    if (idx === pageIndex.value) {
      activeImgH.value = imgH;
      fitScale.value   = f;
      // Only snap to fit if the user hasn't already zoomed this page.
      if (scale.value <= 1.01) scale.value = f;
    }
  };

  // ── pinch ────────────────────────────────────────────────────────────────
  const pinch = Gesture.Pinch()
    .onStart(() => {
      baseScale.value = scale.value;
    })
    .onUpdate((e) => {
      // Floor at fitScale (never shrink past whole-image-visible), ceil at MAX.
      scale.value = Math.min(Math.max(baseScale.value * e.scale, fitScale.value), MAX_SCALE);
    })
    .onEnd(() => {
      // Settle to the nearest of: fit (whole image) or current zoom, with clamps.
      if (scale.value < fitScale.value + 0.02) {
        resetToFit();
      } else {
        tx.value = withTiming(clampTo(tx.value, maxX(scale.value)));
        ty.value = withTiming(clampTo(ty.value, maxY(scale.value)));
      }
    });

  // Per-gesture mode latch (set on first move): 1 = drag photo, 2 = swipe pages.
  const dragMode = useSharedValue<0 | 1 | 2>(0);

  // ── pan — drag the image when it overflows, else swipe pages ─────────────
  const pan = Gesture.Pan()
    .averageTouches(true)
    .minDistance(5)
    .onStart(() => {
      baseTx.value     = tx.value;
      baseTy.value     = ty.value;
      basePagerX.value = pagerX.value;
      dragMode.value   = 0;
    })
    .onUpdate((e) => {
      const my = maxY(scale.value);
      const overflowsX = maxX(scale.value) > 0;

      if (dragMode.value === 0) {
        if (overflowsX || my > 0) {
          // Image overflows. If it overflows vertically but not horizontally
          // (tall image), let a clearly-horizontal drag flip the page instead.
          if (my > 0 && !overflowsX) {
            dragMode.value = Math.abs(e.translationY) >= Math.abs(e.translationX) ? 1 : 2;
          } else {
            dragMode.value = 1;
          }
        } else {
          dragMode.value = 2; // fully on-screen → page swipe
        }
      }

      if (dragMode.value === 1) {
        tx.value = clampTo(baseTx.value + e.translationX, maxX(scale.value));
        ty.value = clampTo(baseTy.value + e.translationY, my);
      } else {
        const lo = -(count - 1) * width;
        pagerX.value = Math.min(Math.max(basePagerX.value + e.translationX, lo), 0);
      }
    })
    .onEnd((e) => {
      if (dragMode.value !== 2) return; // image-drag, not a page flip
      const dx   = e.translationX;
      const fast = Math.abs(e.velocityX) > SWIPE_VEL;
      let target = pageIndex.value;
      if (dx < -width * SWIPE_FRACTION || (fast && e.velocityX < 0)) target++;
      if (dx >  width * SWIPE_FRACTION || (fast && e.velocityX > 0)) target--;
      goPage(target);
    });

  // ── double-tap: jump to fill-width (1) ↔ fit, centered on the tap ─────────
  const zoomAround = (px: number, py: number, target: number) => {
    'worklet';
    const fx = px - width  / 2;
    const fy = py - height / 2;
    scale.value = withTiming(target, { duration: 220 });
    tx.value    = withTiming(clampTo(-fx * (target - 1), maxX(target)), { duration: 220 });
    ty.value    = withTiming(clampTo(-fy * (target - 1), maxY(target)), { duration: 220 });
  };

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .maxDeltaX(10)
    .maxDeltaY(10)
    .onEnd((e) => {
      'worklet';
      // If currently above fill (1), drop to fit; otherwise zoom to fill (or 2× of
      // fit for already-fill images so double-tap always magnifies something).
      if (scale.value > 1.01) {
        resetToFit();
      } else {
        const target = fitScale.value < 0.999 ? 1 : 2;
        zoomAround(e.x, e.y, target);
      }
    });

  // ── single-tap ─────────────────────────────────────────────────────────────
  // Tall image: each tap does BOTH — toggle fit↔fill zoom AND toggle the chrome,
  // so neither the zoom nor the UI is ever unreachable (the previous version only
  // zoomed and the chrome could never be toggled). Fitting image: tap = chrome.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .maxDeltaX(10)
    .maxDeltaY(10)
    .onEnd((e) => {
      'worklet';
      if (fitScale.value < 0.999) {
        if (scale.value > fitScale.value + 0.02) {
          resetToFit();
        } else {
          zoomAround(e.x, e.y, 1);
        }
      }
      // Always toggle chrome on a tap — including on tall images.
      if (onTap) scheduleOnRN(onTap);
    });

  const composed = Gesture.Simultaneous(
    pinch,
    Gesture.Race(
      pan,
      Gesture.Exclusive(doubleTap, singleTap),
    ),
  );

  // Reset to fit when the page changes (belt-and-suspenders alongside onSettle).
  useAnimatedReaction(
    () => pageIndex.value,
    (cur, prev) => {
      if (prev != null && cur !== prev) {
        scale.value = fitScale.value;
        tx.value = 0;
        ty.value = 0;
      }
    },
  );

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pagerX.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.clip, { width, height }]}>
        <Animated.View style={[styles.strip, { width: width * count, height }, stripStyle]}>
          {photos.map((p, i) => (
            <PhotoPage
              key={p.id ?? i}
              uri={p.photo_url}
              width={width}
              height={height}
              scale={scale}
              tx={tx}
              ty={ty}
              pageIdx={i}
              activeIdx={pageIndex}
              onMeasured={reportSize}
            />
          ))}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

// ── PhotoPage — measures its image, sizes it to fill width, applies zoom ─────
function PhotoPage({
  uri, width, height, scale, tx, ty, pageIdx, activeIdx, onMeasured,
}: {
  uri: string;
  width: number;
  height: number;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  pageIdx: number;
  activeIdx: SharedValue<number>;
  onMeasured: (idx: number, imgH: number, fitScale: number) => void;
}) {
  // ratio = w / h. Fall back to screen ratio (no scale-down) until measured.
  const [ratio, setRatio] = useState<number | null>(ratioCache.get(uri) ?? null);

  useEffect(() => {
    if (ratioCache.has(uri)) {
      setRatio(ratioCache.get(uri)!);
      return;
    }
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (!alive || !w || !h) return;
        const r = w / h;
        ratioCache.set(uri, r);
        setRatio(r);
      },
      () => { /* keep fallback on error */ },
    );
    return () => { alive = false; };
  }, [uri]);

  // Fill width; height from aspect ratio. Tall images exceed the screen height.
  const imgW = width;
  const imgH = ratio ? width / ratio : height;
  // Scale that makes the whole image fit on screen with margin (< 1 for tall
  // images). FIT_PADDING pulls it in further so a long image opens comfortably
  // zoomed out with breathing room, not edge-to-edge.
  const fitScale = imgH > height ? (height / imgH) * FIT_PADDING : 1;

  useEffect(() => {
    onMeasured(pageIdx, imgH, fitScale);
  }, [imgH, fitScale, pageIdx]);

  const zoomStyle = useAnimatedStyle(() => {
    const active = activeIdx.value === pageIdx;
    return {
      transform: [
        { translateX: active ? tx.value    : 0 },
        { translateY: active ? ty.value    : 0 },
        { scale:      active ? scale.value : fitScale },
      ],
    };
  });

  return (
    <View style={[styles.page, { width, height }]}>
      <Animated.View style={[styles.center, { width, height }, zoomStyle]}>
        <Image
          source={{ uri }}
          style={{ width: imgW, height: imgH }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip:   { overflow: 'hidden' },
  strip:  { flexDirection: 'row' },
  page:   { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
