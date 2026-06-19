import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { duration, ease, spring } from '@/constants/Motion';
import { elevation, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import Button from './Button';
import Icon, { type IconName } from './Icon';
import { Text } from './Themed';

type Props = {
  visible:       boolean;
  title:         string;
  message:       string;
  confirmLabel?: string;
  cancelLabel?:  string;
  icon?:         IconName;
  tint?:         string;
  onConfirm:     () => void;
  onCancel:      () => void;
};

export default function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  icon,
  tint,
  onConfirm,
  onCancel,
}: Props) {
  const theme  = useTheme();
  const accent = tint ?? theme.status.brand;

  const scale     = useSharedValue(0.95);
  const opacity   = useSharedValue(0);
  const backdropO = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropO.value = withTiming(1, { duration: duration.normal, easing: ease });
      opacity.value   = withTiming(1, { duration: duration.fast,   easing: ease });
      scale.value     = withSpring(1, spring.snappy);
    } else {
      backdropO.value = withTiming(0, { duration: duration.fast, easing: ease });
      opacity.value   = withTiming(0, { duration: duration.fast, easing: ease });
      scale.value     = withTiming(0.96, { duration: duration.fast, easing: ease });
    }
  }, [visible]);

  const cardStyle     = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      </Animated.View>

      <View style={styles.centeredWrap} pointerEvents="box-none">
        <Animated.View style={[styles.card, { backgroundColor: theme.surface }, elevation.md, cardStyle]}>

          {/* Icon + headline inline — icon is semantic, not decorative */}
          <View style={styles.titleRow}>
            {icon ? <Icon name={icon} size={18} color={accent} /> : null}
            <Text style={[styles.title, { color: theme.text, flex: 1 }]}>{title}</Text>
          </View>

          {/* Supporting copy — explains consequences */}
          <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>

          {/* Primary CTA */}
          <Button
            label={confirmLabel}
            onPress={onConfirm}
            style={{ backgroundColor: accent, marginTop: spacing.lg }}
            size="md"
          />

          {/* Dismiss — clearly tertiary */}
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.45 : 1 }]}
            hitSlop={16}
          >
            <Text style={[styles.cancelLabel, { color: theme.textTertiary }]}>{cancelLabel}</Text>
          </Pressable>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  centeredWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  cancelBtn: {
    alignSelf: 'center',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  cancelLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});
