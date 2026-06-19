import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { elevation, radius, spacing } from '@/constants/theme';
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

  // Two-tone: a white surface that lifts off the grey screen backdrop with a
  // soft diffused shadow (no border). `transparent` opts out entirely.
  return (
    <View
      style={[
        styles.card,
        transparent
          ? { backgroundColor: 'transparent' }
          : { ...elevation.md, backgroundColor: theme.surface, shadowColor: theme.shadow },
        { padding: compact ? spacing.sm : spacing.md },
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
    borderRadius: radius.lg,   // 16
  },
});
