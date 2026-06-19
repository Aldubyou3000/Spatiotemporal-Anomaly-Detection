import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { palette, radius, spacing } from '@/constants/theme';
import { duration, press } from '@/constants/Motion';
import { useTheme } from '@/hooks/useTheme';
import Icon, { type IconName } from './Icon';
import { Text } from './Themed';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize    = 'sm' | 'md' | 'lg';

type ButtonProps = {
  label:    string;
  onPress:  () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?:    ButtonSize;
  icon?:    IconName;
  iconRight?: boolean;
  style?:     StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?:  ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SIZE_MAP: Record<ButtonSize, { padV: number; padH: number; fontSize: number; iconSize: number; height: number }> = {
  sm: { padV: 8,  padH: spacing.sm, fontSize: 14, iconSize: 15, height: 38 },
  md: { padV: 12, padH: spacing.md, fontSize: 16, iconSize: 17, height: 46 },
  lg: { padV: 14, padH: spacing.lg, fontSize: 16, iconSize: 18, height: 54 },
};

export default function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  size    = 'lg',
  icon,
  iconRight = false,
  style,
  textStyle,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const sz = SIZE_MAP[size];

  const scale   = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // ── Variant styles, theme-aware ────────────────────────────────────────────
  const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
    primary: {
      bg: palette.brand,
      text: palette.white,
    },
    secondary: {
      bg: 'transparent',
      text: palette.brand,
      border: palette.brand,
    },
    ghost: {
      bg: theme.surfaceMuted,
      text: theme.text,
    },
    danger: {
      bg: palette.dangerSoft,
      text: palette.danger,
      border: palette.danger + '33',
    },
  };

  const v = variantStyles[variant];
  const finalTextColor = isDisabled
    ? theme.textTertiary
    : v.text;
  const finalBg = isDisabled
    ? theme.surfaceMuted
    : v.bg;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={() => {
        scale.value   = withTiming(press.scaleDown, { duration: press.inDuration });
        opacity.value = withTiming(press.opacityDown, { duration: press.inDuration });
      }}
      onPressOut={() => {
        scale.value   = withSpring(1, press.outSpring);
        opacity.value = withTiming(1, { duration: duration.fast });
      }}
      onPress={onPress}
      style={[
        animStyle,
        styles.base,
        {
          backgroundColor: finalBg,
          borderColor: v.border ?? 'transparent',
          borderWidth: v.border ? 1 : 0,
          paddingVertical: sz.padV,
          paddingHorizontal: sz.padH,
          minHeight: sz.height,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={finalTextColor} />
      ) : (
        <View style={styles.inner}>
          {icon && !iconRight ? (
            <Icon name={icon} size={sz.iconSize} color={finalTextColor} style={{ marginRight: spacing.xs }} />
          ) : null}
          <Text style={[
            styles.label,
            {
              color: finalTextColor,
              fontSize: sz.fontSize,
            },
            textStyle,
          ]}>
            {label}
          </Text>
          {icon && iconRight ? (
            <Icon name={icon} size={sz.iconSize} color={finalTextColor} style={{ marginLeft: spacing.xs }} />
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
