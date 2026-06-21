import type { View } from 'react-native';

/**
 * Cross-component handle to the floating tab-bar capsule.
 *
 * The tab bar is rendered in `app/(tabs)/_layout.tsx`, but the spotlight tour
 * lives on the Dashboard — so the bar exposes its node here for the tour to
 * `measureInWindow`. Measuring the real element (rather than computing its rect
 * from layout constants + screen height) keeps the 'nav' highlight pixel-accurate
 * and on the same coordinate path as the other targets.
 */
export const navTargetRef = { current: null as View | null };
