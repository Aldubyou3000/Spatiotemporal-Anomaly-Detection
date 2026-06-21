import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "reduce motion" preference.
 *
 * This is the standard, user-controllable signal for "keep things calm":
 *  - iOS  → Settings ▸ Accessibility ▸ Motion ▸ Reduce Motion
 *  - Android → Settings ▸ Accessibility ▸ Remove animations. On most OEM skins
 *    BATTERY SAVER also flips this on, so honoring it doubles as battery-saver
 *    + low-power degradation with no extra native module.
 *
 * When true, callers should present content in its FINAL state immediately —
 * skip entrance fades/slides — and simplify heavy decorative effects. This is
 * the "smooth and simple beats fancy and janky" path: a constrained device (or
 * a user who asked for less motion) gets an instant, lightweight UI instead of a
 * stuttering one.
 *
 * Reads `AccessibilityInfo` (core RN — always available) and subscribes to live
 * changes, so toggling the setting updates the app without a restart.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) setReduced(v); })
      .catch(() => { /* default: motion enabled */ });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
