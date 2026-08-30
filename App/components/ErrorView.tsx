import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Themed';
import Icon from '@/components/Icon';
import { icons } from '@/constants/icons';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export default function ErrorView({
  message,
  onRetry,
  title = 'Failed to load',
}: {
  message?: string;
  onRetry?: () => void;
  title?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceAlt }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.surfaceMuted }]}>
        <Icon name={icons.errorFill} size={22} color={palette.danger} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.msg, { color: theme.textSecondary }]}>{message}</Text>
      ) : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Icon name={icons.followUp} size={14} color={theme.textSecondary} />
          <Text style={[styles.btnText, { color: theme.text }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.subtitle.size,
    fontWeight: typography.subtitle.weight,
    textAlign: 'center',
  },
  msg: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    textAlign: 'center',
    maxWidth: 300,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnText: {
    fontSize: typography.callout.size,
    fontWeight: '600',
  },
});
