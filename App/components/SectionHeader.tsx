import { StyleSheet, View } from 'react-native';

import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Themed';

type SectionHeaderProps = {
  label: string;
  /** Add extra top margin to break up sections more strongly. */
  spaced?: boolean;
};

export default function SectionHeader({ label, spaced = false }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, spaced && { marginTop: spacing.md }]}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    minHeight: 18,
  },
  label: {
    fontSize: typography.overline.size,
    lineHeight: typography.overline.lineHeight,
    fontWeight: typography.overline.weight,
    letterSpacing: typography.overline.letterSpacing,
  },
});
