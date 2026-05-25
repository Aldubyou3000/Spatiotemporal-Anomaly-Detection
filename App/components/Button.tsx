import { ActivityIndicator, Pressable, StyleProp, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { spring } from '@/constants/Motion';
import { Text } from './Themed';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const VARIANT: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary:   { bg: '#1E6FD9', text: '#ffffff' },
  secondary: { bg: 'transparent', text: '#1E6FD9', border: '#1E6FD9' },
  ghost:     { bg: 'rgba(255,255,255,0.05)', text: '#7A8BAA', border: 'rgba(255,255,255,0.08)' },
  danger:    { bg: 'rgba(229,53,53,0.08)', text: '#E53535', border: 'rgba(229,53,53,0.25)' },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  textStyle,
}: ButtonProps) {
  const v = VARIANT[variant];
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 80 });
        opacity.value = withTiming(0.85, { duration: 80 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, spring.snappy);
        opacity.value = withTiming(1, { duration: 120 });
      }}
      onPress={onPress}
      style={[
        animStyle,
        styles.button,
        {
          backgroundColor: isDisabled ? '#1E293B' : v.bg,
          borderColor: v.border ?? 'transparent',
          borderWidth: v.border ? 1 : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <Text style={[styles.label, { color: isDisabled ? '#475569' : v.text }, textStyle]}>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
