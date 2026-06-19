import { forwardRef } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';

import { useTabBarFootprint } from '@/constants/tabBar';

type AppScrollViewProps = ScrollViewProps & {
  /**
   * Extra padding added on top of the tab-bar footprint.
   * Defaults to 24 so the last item breathes above the capsule.
   * Pass 0 to take full manual control via contentContainerStyle.
   */
  extraBottomPad?: number;
};

/**
 * Drop-in ScrollView with app-wide scroll defaults baked in:
 *   • bounces={false}           — no iOS rubber-band physics
 *   • overScrollMode="never"    — no Android blue glow
 *   • showsVertical/HorizontalScrollIndicator={false}
 *   • paddingBottom auto-set to tabBarFootprint + extraBottomPad
 *
 * Any prop you pass explicitly overrides the default, so special-case
 * scrollers (e.g. a zoomable image viewer) can still opt back in.
 */
const AppScrollView = forwardRef<ScrollView, AppScrollViewProps>(
  ({ extraBottomPad = 24, contentContainerStyle, ...rest }, ref) => {
    const footprint = useTabBarFootprint();

    return (
      <ScrollView
        ref={ref}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          { paddingBottom: footprint + extraBottomPad },
          contentContainerStyle,
        ]}
        {...rest}
      />
    );
  },
);

AppScrollView.displayName = 'AppScrollView';
export default AppScrollView;
