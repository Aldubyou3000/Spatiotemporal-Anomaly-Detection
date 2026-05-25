import { Easing } from 'react-native-reanimated';

// ─── Easing curves ───────────────────────────────────────────────────────────
// iOS-standard / Material default — feels natural for almost everything.
export const ease    = Easing.bezier(0.25, 0.1, 0.25, 1);
export const easeOut = Easing.bezier(0.0,  0.0, 0.2,  1);
export const easeIn  = Easing.bezier(0.4,  0.0, 1,    1);

// ─── Duration tokens (ms) ────────────────────────────────────────────────────
// Keep within 200–350ms for premium feel; longer = sluggish, shorter = jarring.
export const duration = {
  instant:  80,   // press feedback
  fast:     160,  // small state changes
  normal:   240,  // panel slides, fades
  entrance: 320,  // initial mount, hero animations
} as const;

// ─── Spring presets ──────────────────────────────────────────────────────────
export const spring = {
  // Snappy — tight, low-mass: button release, micro-interactions
  snappy:   { damping: 22, stiffness: 320, mass: 0.7 },
  // Gentle — softer settle: card / panel entrance
  gentle:   { damping: 26, stiffness: 200, mass: 1 },
  // Grounded — clamps overshoot: form fields, modal sheets that must settle firmly
  grounded: { damping: 32, stiffness: 280, mass: 1, overshootClamping: true },
} as const;

// ─── Press feedback ──────────────────────────────────────────────────────────
// Standard scale-down for tappable surfaces. Reanimated v3 timing values.
export const press = {
  scaleDown: 0.97,
  opacityDown: 0.86,
  inDuration: duration.instant,
  outSpring: spring.snappy,
} as const;

// ─── Stagger ─────────────────────────────────────────────────────────────────
// Delay between successive list items appearing.
export const stagger = {
  list: 40,        // ticket cards
  field: 60,       // form fields
} as const;
