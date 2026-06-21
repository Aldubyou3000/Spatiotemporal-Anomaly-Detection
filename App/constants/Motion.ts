import { Easing } from 'react-native-reanimated';

// ─── Easing curves ───────────────────────────────────────────────────────────
// iOS-standard / Material default — feels natural for almost everything.
export const ease    = Easing.bezier(0.25, 0.1, 0.25, 1);
export const easeOut = Easing.bezier(0.0,  0.0, 0.2,  1);
export const easeIn  = Easing.bezier(0.4,  0.0, 1,    1);

// ─── Duration tokens (ms) ────────────────────────────────────────────────────
// Snappy mobile standard (Material/iOS): micro-interactions ~100ms, most
// transitions 150–220ms. Kept on the short end of that range so the UI reads as
// fast and responsive, not drifting. Shorter still would look abrupt.
export const duration = {
  instant:  70,   // press feedback
  fast:     130,  // small state changes
  normal:   190,  // panel slides, fades
  entrance: 240,  // initial mount, hero animations
} as const;

// ─── Spring presets ──────────────────────────────────────────────────────────
// Higher stiffness + low mass = the spring reaches rest in fewer frames, so
// panels/thumbs snap into place rather than floating. Damping kept high enough
// to avoid wobble (a long overshoot reads as "sluggish" too).
export const spring = {
  // Snappy — tight, low-mass: button release, micro-interactions
  snappy:   { damping: 24, stiffness: 400, mass: 0.6 },
  // Gentle — quick but soft settle: card / panel entrance, sheets
  gentle:   { damping: 28, stiffness: 280, mass: 0.8 },
  // Grounded — clamps overshoot: form fields, modal sheets that must settle firmly
  grounded: { damping: 34, stiffness: 340, mass: 0.9, overshootClamping: true },
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
// Delay between successive list items appearing. Tight so the cascade resolves
// quickly — a wide stagger makes trailing items look like they're lagging in.
export const stagger = {
  list: 22,        // ticket cards
  field: 45,       // form fields
} as const;
