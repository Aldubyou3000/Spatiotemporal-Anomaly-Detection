import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useAppContext } from '@/context/AppContext';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export default function Card({ children, style }: CardProps) {
  const { isDarkMode } = useAppContext();
  const backgroundColor = isDarkMode ? '#131929' : '#ffffff';
  const borderColor = isDarkMode ? '#1E2D47' : '#E8ECF2';

  return (
    <View style={[styles.card, { backgroundColor, borderColor }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
});
