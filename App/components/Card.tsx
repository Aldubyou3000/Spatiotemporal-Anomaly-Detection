import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** Reduce internal padding for nested or compact cards. */
  compact?: boolean;
  /** Remove background — useful when grouping rows without a visible container. */
  transparent?: boolean;
}>;

export default function Card({ children, style, compact = false, transparent = false }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: transparent ? 'transparent' : theme.surface,
          borderColor: theme.border,
          borderWidth: transparent ? 0 : StyleSheet.hairlineWidth,
          padding: compact ? spacing.sm : spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: radius.lg,
  },
});
