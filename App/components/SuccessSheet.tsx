import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { duration, ease, spring } from '@/constants/Motion';
import { elevation, radius, spacing, typography } from '@/constants/theme';
import { icons } from '@/constants/icons';
import { useTheme } from '@/hooks/useTheme';
import Button from './Button';
import Icon from './Icon';
import { Text } from './Themed';

type Props = {
  visible:      boolean;
  title:        string;
  message:      string;
  actionLabel?: string;
  onAction:     () => void;
};

const PANEL_OFFSET = 480;

export default function SuccessSheet({
  visible,
  title,
  message,
  actionLabel = 'Done',
  onAction,
}: Props) {
  const theme = useTheme();

  const translateY = useSharedValue(PANEL_OFFSET);
  const backdropO  = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropO.value  = withTiming(1, { duration: duration.normal, easing: ease });
      translateY.value = withSpring(0, spring.gentle);
    } else {
      backdropO.value  = withTiming(0, { duration: duration.fast, easing: ease });
      translateY.value = withTiming(PANEL_OFFSET, { duration: duration.normal, easing: ease });
    }
  }, [visible]);

  const panelStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      <Animated.View
        style={[styles.panel, { backgroundColor: theme.surface }, elevation.lg, panelStyle]}
      >
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />

        {/* Icon badge */}
        <View style={styles.badgeWrap}>
          <View style={[styles.badge, { backgroundColor: theme.status.success + '1A' }]}>
            <Icon name={icons.check} size={36} color={theme.status.success} />
          </View>
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
        </View>

        {/* CTA */}
        <View style={styles.buttonWrap}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingBottom: spacing.xxxl,
  },
  handle: {
    width: 36, height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  badgeWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl + spacing.sm,
    paddingBottom: spacing.lg,
  },
  badge: {
    width: 76, height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    letterSpacing: typography.subtitle.letterSpacing,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight + 2,
    textAlign: 'center',
  },
  buttonWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
});
