import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ─── Cloud (overlapping solid brand circles) ─────────────────────────────────
// One cloud = same-colour brand-blue discs overlapping into ONE seamless solid
// silhouette at the top of a screen. No BlurView (that rectangle was the
// "square"). Discs bleed off the top + sides, so only the scalloped bottom shows.
// Fractions of width = scales to any screen. Four of these stack in different
// brand shades to form a layered cloud (strongest on top, lightest at bottom).
const CLOUD_BASE = [
  // top row — bleeds off-screen top + sides
  { d: 0.86, x: -0.42, y: -0.34 },
  { d: 0.94, x:  0.04, y: -0.40 },
  { d: 0.92, x:  0.50, y: -0.38 },
  { d: 0.86, x:  0.96, y: -0.30 },
  // bottom row — even scallop, full width, bleeds off both sides
  { d: 0.60, x: -0.34, y: -0.04 },
  { d: 0.60, x: -0.02, y:  0.00 },
  { d: 0.60, x:  0.30, y: -0.02 },
  { d: 0.60, x:  0.62, y:  0.00 },
  { d: 0.60, x:  0.94, y: -0.02 },
];

function Cloud({ width, color, lite }: { width: number; color: string; lite: boolean }) {
  const W = width;
  const H = W * 1.10;
  return (
    <View style={{ width, height: H }} pointerEvents="none">
      {CLOUD_BASE.map((c, i) => {
        const d = W * c.d;
        return (
          // Each disc is a clipped circle (overflow:hidden + borderRadius) holding
          // a gradient that fades to dark toward its bottom edge. Clipped to the
          // circle, this reads as an inner shadow on every lobe — so the bumps look
          // puffy/3D and overlapping discs cast soft shadows into one another.
          //
          // LITE mode (reduce-motion / battery-saver / low-end) drops the gradient
          // overlay: the cloud keeps its exact silhouette + position, but each disc
          // becomes a single flat clipped circle. That halves the cloud's layer
          // count (no per-disc gradient shader to composite) and cuts overdraw on
          // weak GPUs — the "simplify heavy effects on constrained hardware" path.
          <View
            key={i}
            style={{
              position: 'absolute',
              top: W * c.y,
              left: W * c.x,
              width: d,
              height: d,
              borderRadius: d / 2,
              overflow: lite ? 'visible' : 'hidden',
              backgroundColor: color,
            }}
          >
            {!lite && (
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.10)']}
                locations={[0.78, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// The layered cloud: 4 brand shades, strongest on TOP → lightest at the bottom
// (rendered in this order, so the last paints on top). Y is a locked even
// staircase (+0.16 W steps). X is shared within pairs (zigzag) — lightest+brand
// = -0.180 W, light+strong = -0.355 W — dialed in by hand. Positions are shared
// across themes; only the shades differ. Dark uses deeper, muted blues so the
// cloud reads as a subtle ambient glow against the near-black background instead
// of bright blobs.
const CLOUD_POS = [
  { x: -0.180, y:  0.214 },  // lightest (bottom)
  { x: -0.355, y:  0.054 },  // light
  { x: -0.180, y: -0.106 },  // brand
  { x: -0.355, y: -0.266 },  // strong (top)
];
const CLOUD_SHADES = {
  light: ['#9CBBFF', '#6B96FF', '#3B6FE8', '#2A5ED4'],
  dark:  ['#42588C', '#37497A', '#2E3D69', '#273457'],
};

// Drop-in decorative background: the layered cloud pinned to the top of a screen.
// pointerEvents disabled so it's inert. No fixed height/clip — it comes from the
// Cloud itself (fractions of width), so it scales to any screen.
//
//   offsetY — pixels to nudge the whole stack up (negative) or down. Full screen
//             width is kept so the cloud always bleeds off both sides; raising it
//             just hides more of the scallop. Home leaves it at 0 (scallop behind
//             the search bar); Profile and Activity pass a negative offset so the
//             scallop sits where each screen wants it.
// memo'd: props (width/isDark/offsetY) are stable, but the parent screens
// re-render on every keystroke, scroll and refetch. Without memo the 36 gradient
// views rebuilt every time; now the cloud only re-renders when a prop changes.
function CloudBackground({
  width,
  isDark,
  offsetY = 0,
  lite = false,
}: {
  width: number;
  isDark: boolean;
  offsetY?: number;
  /** Drop the per-disc gradient overlays — same shape/position, fewer composited
   *  layers. Pass the reduce-motion / low-power flag here. */
  lite?: boolean;
}) {
  const shades = isDark ? CLOUD_SHADES.dark : CLOUD_SHADES.light;
  return (
    <View style={[styles.cloudLayer, { top: offsetY }]} pointerEvents="none">
      {CLOUD_POS.map((l, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: [{ translateX: width * l.x }, { translateY: width * l.y }],
          }}
        >
          <Cloud width={width} color={shades[i]} lite={lite} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cloudLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});

export default memo(CloudBackground);
