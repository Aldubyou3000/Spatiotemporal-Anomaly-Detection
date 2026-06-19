/**
 * Floating tab-bar geometry — the single source of truth for the bar's size and
 * the "scroll-under" footprint every tab screen must reserve.
 *
 * The bar is absolutely positioned (see app/(tabs)/_layout.tsx), so it floats
 * OVER the content layer instead of occupying layout space. For the last list
 * item to come to rest fully above the floating capsule (and stay tappable),
 * each scroll view pads its bottom by `useTabBarFootprint()`:
 *
 *     card height  +  top margin  +  bottom margin  +  device safe-area bottom
 *
 * Keep TAB_BAR_CARD_HEIGHT in lock-step with the real rendered capsule height in
 * _layout.tsx. It is fixed (not measured) so the footprint is deterministic and
 * available before first paint — no layout flash. The capsule's own content
 * (icon 24 + gap 3 + label 14 + stack padding 8×2 = ~57, plus card padding
 * 12×2 = 24) lands at ~64; we pin it explicitly here and on the card.
 */

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from './theme';

/** Fixed height of the capsule card itself (excludes margins / safe area). */
export const TAB_BAR_CARD_HEIGHT = 64;

/** Gap above the capsule, between it and the content scrolling behind. */
export const TAB_BAR_TOP_MARGIN = spacing.xs;   // 8

/** Minimum gap below the capsule when the device has no bottom safe-area. */
export const TAB_BAR_BOTTOM_MARGIN = spacing.lg; // 24

/**
 * Total vertical space the floating bar occupies from the screen's bottom edge.
 * Add this as `paddingBottom` to any scroll content (or as a footer offset) so
 * content scrolls fully clear of the capsule. Reads the live safe-area inset so
 * it's correct on notched / gesture-bar devices and plain screens alike.
 */
export function useTabBarFootprint(): number {
  const insets = useSafeAreaInsets();
  const bottomMargin = Math.max(insets.bottom, TAB_BAR_BOTTOM_MARGIN);
  return TAB_BAR_CARD_HEIGHT + TAB_BAR_TOP_MARGIN + bottomMargin;
}
