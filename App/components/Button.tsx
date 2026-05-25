import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { palette, radius, spacing, typography } from '@/constants/theme';
import { duration, press, spring } from '@/constants/Motion';
import { useTheme } from '@/hooks/useTheme';
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
  icon?:    React.ComponentProps<typeof Ionicons>['name'];
  iconRight?: boolean;
  style?:     StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?:  ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SIZE_MAP: Record<ButtonSize, { padV: number; padH: number; fontSize: number; iconSize: number; height: number }> = {
  sm: { padV: 8,  padH: spacing.sm, fontSize: 13, iconSize: 14, height: 36 },
  md: { padV: 12, padH: spacing.md, fontSize: 15, iconSize: 16, height: 44 },
  lg: { padV: 14, padH: spacing.lg, fontSize: 15, iconSize: 18, height: 52 },
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
      border: 'rgba(229,53,53,0.20)',
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
            <Ionicons name={icon} size={sz.iconSize} color={finalTextColor} style={{ marginRight: spacing.xs }} />
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
            <Ionicons name={icon} size={sz.iconSize} color={finalTextColor} style={{ marginLeft: spacing.xs }} />
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
    fontWeight: typography.bodyBold.weight,
    letterSpacing: 0.1,
  },
});
