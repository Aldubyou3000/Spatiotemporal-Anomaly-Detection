import { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { elevation, palette, radius, spacing, typography } from '@/constants/theme';
import { duration, ease, spring } from '@/constants/Motion';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Themed';

export type SheetAction = {
  label: string;
  subtitle?: string;
  onPress: () => void;
  variant?: 'default' | 'danger' | 'primary';
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title:   string;
  message?: string;
  actions: SheetAction[];
};

const PANEL_HEIGHT_ESTIMATE = 400; // safe over-estimate for off-screen translation

export default function BottomSheet({ visible, onClose, title, message, actions }: Props) {
  const theme = useTheme();

  const translateY = useSharedValue(PANEL_HEIGHT_ESTIMATE);
  const backdropO  = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropO.value  = withTiming(1, { duration: duration.normal, easing: ease });
      translateY.value = withSpring(0, spring.gentle);
    } else {
      backdropO.value  = withTiming(0, { duration: duration.fast, easing: ease });
      translateY.value = withTiming(PANEL_HEIGHT_ESTIMATE, { duration: duration.normal, easing: ease });
    }
  }, [visible]);

  const panelStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  const actionColor = (variant: SheetAction['variant']) => {
    if (variant === 'danger')  return palette.danger;
    if (variant === 'primary') return palette.brand;
    return theme.text;
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          styles.panel,
          { backgroundColor: theme.surface },
          elevation.lg,
          panelStyle,
        ]}
      >
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
          ) : null}
        </View>

        {/* Actions */}
        <View style={[styles.actionsWrap, { borderTopColor: theme.border }]}>
          {actions.map((action, i) => (
            <Pressable
              key={i}
              onPress={() => { onClose(); action.onPress(); }}
              style={({ pressed }) => [
                styles.actionRow,
                i < actions.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
                { opacity: pressed ? 0.55 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.actionLabel,
                  { color: actionColor(action.variant) },
                  (action.variant === 'primary' || action.variant === 'danger') && { fontWeight: '600' },
                ]}
              >
                {action.label}
              </Text>
              {action.subtitle ? (
                <Text style={[styles.actionSubtitle, { color: theme.textTertiary }]}>
                  {action.subtitle}
                </Text>
              ) : null}
            </Pressable>
          ))}
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
    marginBottom: spacing.xxs,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md + spacing.xxs,
  },
  title: {
    fontSize: typography.subtitle.size,
    lineHeight: typography.subtitle.lineHeight,
    fontWeight: typography.subtitle.weight,
    letterSpacing: typography.subtitle.letterSpacing,
    marginBottom: spacing.xxs + 2,
  },
  message: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight + 2,
  },
  actionsWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
  },
  actionSubtitle: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    marginTop: 2,
  },
});
