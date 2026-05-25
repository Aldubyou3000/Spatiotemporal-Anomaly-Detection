import { Easing } from 'react-native-reanimated';

// Standard easing — material/iOS standard curve
export const ease = Easing.bezier(0.25, 0.1, 0.25, 1);
export const easeOut = Easing.bezier(0.0, 0.0, 0.2, 1);
export const easeIn = Easing.bezier(0.4, 0.0, 1, 1);

// Duration tokens
export const duration = {
  fast: 160,
  normal: 240,
  entrance: 320,
} as const;

// Spring presets
export const spring = {
  // Snappy — button presses, small interactive elements
  snappy: { damping: 22, stiffness: 300, mass: 0.8 },
  // Gentle — cards, panels sliding in
  gentle: { damping: 26, stiffness: 200, mass: 1 },
  // Grounded — no overshoot, for things that must settle firmly
  grounded: { damping: 32, stiffness: 280, mass: 1, overshootClamping: true },
} as const;
