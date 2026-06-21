import { Bell, LayoutGrid, UserRound } from 'lucide-react-native';
import { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { duration, ease, spring } from '@/constants/Motion';
import { palette, radius, spacing } from '@/constants/theme';
import {
  TAB_BAR_BOTTOM_MARGIN,
  TAB_BAR_CARD_HEIGHT,
  TAB_BAR_TOP_MARGIN,
} from '@/constants/tabBar';
import { useTheme } from '@/hooks/useTheme';
import { useUnseenActivity } from '@/hooks/useUnseenActivity';
import { navTargetRef } from '@/lib/tourTargets';

// Sliding indicator spring — retargets from live position on fast switches.
// No overshootClamping so mid-flight reversals spring back smoothly.
const SLIDE_SPRING = {
  damping:   22,
  stiffness: 170,
  mass:      0.7,
} as const;

// ─── Single tab button ────────────────────────────────────────────────────────
function TabButton({
  route,
  options,
  focused,
  showBadge,
  onPress,
  onLongPress,
}: {
  route: BottomTabBarProps['state']['routes'][number];
  options: BottomTabNavigationOptions;
  focused: boolean;
  showBadge: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();

  const activeColor   = theme.status.brand;
  // Inactive tabs use the PRIMARY text colour (black in light / white in dark) —
  // the old textTertiary grey looked washed out. The selected tab still stands
  // out via the brand colour + the sliding indicator bar.
  const inactiveColor = theme.text;

  const progress = useSharedValue(focused ? 1 : 0);
  const scale    = useSharedValue(focused ? 1.05 : 1);

  // Drive the focus animation from an effect, not the render body. Mutating a
  // shared value during render re-fires the spring/timing on EVERY re-render
  // (theme reads, parent re-renders), restarting it mid-flight — that was the
  // tab-switch stutter. An effect keyed on `focused` runs the transition once,
  // exactly when focus actually changes.
  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: duration.fast, easing: ease });
    scale.value    = withSpring(focused ? 1.05 : 1, spring.snappy);
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveColor, activeColor]),
  }));

  const label  = typeof options.title === 'string' ? options.title : route.name;
  const iconEl = options.tabBarIcon?.({ focused, color: focused ? activeColor : inactiveColor, size: 22 });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabBtn}
    >
      <View style={styles.stack}>
        {/* Fixed icon box so every glyph sits on the same horizontal rhythm */}
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.iconBox, iconStyle]}>
            {iconEl}
          </Animated.View>
          {/* "New activity" dot — Facebook-style notice on the tab's icon */}
          {showBadge && (
            <View style={[styles.badge, { borderColor: theme.surface }]} pointerEvents="none" />
          )}
        </View>
        <Animated.Text
          numberOfLines={1}
          style={[styles.label, focused && styles.labelActive, labelStyle]}
        >
          {label}
        </Animated.Text>
      </View>
    </Pressable>
  );
}

// ─── Custom tab bar ───────────────────────────────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const hasUnseenActivity = useUnseenActivity();

  const bottomMargin = Math.max(insets.bottom, TAB_BAR_BOTTOM_MARGIN);

  const [rowWidth, setRowWidth] = useState(0);
  const tabCount  = state.routes.length;
  const cellWidth = rowWidth > 0 ? rowWidth / tabCount : 0;

  // Shared target drives the sliding indicator; useDerivedValue animates from
  // current position so fast switches reverse smoothly without teleporting.
  // Update `target` in an effect (not the render body) so it only changes when
  // the active index or measured cell width actually changes — writing it on
  // every render kept nudging the derived spring.
  const target = useSharedValue(0);
  useEffect(() => {
    target.value = cellWidth > 0 ? state.index * cellWidth : 0;
  }, [state.index, cellWidth]);

  const slideX = useDerivedValue(() => withSpring(target.value, SLIDE_SPRING));

  const slideStyle = useAnimatedStyle(() => ({
    width:     cellWidth,
    opacity:   cellWidth > 0 ? 1 : 0,
    transform: [{ translateX: slideX.value }],
  }));

  const onRowLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.barOuter, { paddingBottom: bottomMargin }]}
    >
      <View
        ref={(n) => { navTargetRef.current = n; }}
        collapsable={false}
        pointerEvents="auto"
        style={[
          styles.barCard,
          {
            backgroundColor: theme.surface,   // #FFFFFF light / dark surface
            borderColor:     theme.border,
          },
        ]}
      >
        <View style={styles.tabsRow} onLayout={onRowLayout}>
          {/* Sliding pill indicator — top edge, brand color, narrow */}
          <Animated.View pointerEvents="none" style={[styles.slideTrack, slideStyle]}>
            <View style={[styles.indicator, { backgroundColor: theme.status.brand }]} />
          </Animated.View>

          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused     = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TabButton
                key={route.key}
                route={route}
                options={options}
                focused={focused}
                showBadge={route.name === 'activity' && hasUnseenActivity}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute' },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          // lucide SVG icons: a tunable bold outline (strokeWidth 2.25 vs lucide's
          // default 2). Inactive = outline only (fill:none); active = filled with
          // the brand colour. fill doesn't affect the icon's size, so this never
          // shifts the layout.
          tabBarIcon: ({ focused, color, size }) => (
            <LayoutGrid color={color} size={size} strokeWidth={2.25} fill={focused ? color : 'none'} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused, color, size }) => (
            <Bell color={color} size={size} strokeWidth={2.25} fill={focused ? color : 'none'} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          // UserRound (not User): its round head meets the semicircle shoulders
          // cleanly, so the FILLED active state is one cohesive silhouette with no
          // stray edge pixel the squared `User` glyph produced when filled.
          tabBarIcon: ({ focused, color, size }) => (
            <UserRound color={color} size={size} strokeWidth={2.25} fill={focused ? color : 'none'} />
          ),
        }}
      />
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const INDICATOR_W = 24;
const INDICATOR_H = 3;

const styles = StyleSheet.create({
  // Full-width absolute wrapper — touches pass through empty space beside capsule
  barOuter: {
    position:          'absolute',
    left:              0,
    right:             0,
    bottom:            0,
    paddingHorizontal: spacing.lg,   // 24 — how far the capsule is pulled in from edges
    paddingTop:        TAB_BAR_TOP_MARGIN,
  },

  // The floating pill — white, hairline border, ultra-soft upward shadow
  barCard: {
    height:        TAB_BAR_CARD_HEIGHT,   // 64 — fixed so footprint is deterministic
    flexDirection: 'row',
    borderRadius:  radius.pill,           // full pill ends
    borderWidth:   StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor:   '#000000',
        shadowOffset:  { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius:  8,
      },
      android: { elevation: 2 },
    }),
  },

  // Row measured for cell-width calculation (indicator positioning)
  tabsRow: {
    flex:          1,
    flexDirection: 'row',
  },

  // Cell-wide animated track; the visible bar is centered inside it
  slideTrack: {
    position:       'absolute',
    top:            0,
    left:           0,
    height:         INDICATOR_H,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Each tab cell — equal flex, icon+label centered
  tabBtn: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Vertical icon-over-label stack
  stack: {
    alignSelf:      'stretch',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            1,
  },

  // Wraps the icon so the "new activity" badge can pin to its top-right corner.
  iconWrap: {
    position: 'relative',
  },
  // Facebook-style red dot — sits on the icon's top-right with a ring in the bar
  // colour so it reads clearly against the glyph.
  badge: {
    position:     'absolute',
    top:          -2,
    right:        -2,
    width:        10,
    height:       10,
    borderRadius: 5,
    backgroundColor: palette.danger,
    borderWidth:  1.5,
  },

  // Fixed box normalises glyph widths — all icons sit on the same rhythm
  iconBox: {
    width:          26,
    height:         26,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Label — spans cell width so bold↔normal switch never shifts layout
  label: {
    alignSelf:     'stretch',
    fontSize:      12,
    fontWeight:    '500',
    letterSpacing: 0.1,
    lineHeight:    16,
    textAlign:     'center',
  },
  labelActive: {
    fontWeight: '700',
  },

  // The visible sliding pill — brand-colored, pill-shaped, narrow
  indicator: {
    width:        INDICATOR_W,
    height:       INDICATOR_H,
    borderRadius: radius.pill,
  },
});
