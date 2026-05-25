import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';

import { radius, spacing, typography } from '@/constants/theme';
import { Text } from './Themed';

type PillProps = {
  label: string;
  color: string;
  /** Tinted background (~10% opacity of color). */
  bg?: string;
  /** Show a colored dot to the left of the label. */
  dot?: boolean;
  /** Show a vector icon to the left of the label. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Outline pill instead of filled. */
  outline?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Pill({
  label, color, bg, dot = false, icon, outline = false, style,
}: PillProps) {
  const backgroundColor = outline ? 'transparent' : (bg ?? color + '1A');

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor,
          borderColor: outline ? color + '4D' : 'transparent',
          borderWidth: outline ? 1 : 0,
        },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      {icon ? <Ionicons name={icon} size={11} color={color} style={{ marginRight: 4 }} /> : null}
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6, height: 6,
    borderRadius: 3,
    marginRight: spacing.xxs + 1,
  },
  label: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.captionBold.weight,
    letterSpacing: typography.caption.letterSpacing,
  },
});
