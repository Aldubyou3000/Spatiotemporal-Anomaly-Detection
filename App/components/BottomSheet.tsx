import { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { duration, ease, spring } from '@/constants/Motion';
import { useAppContext } from '@/context/AppContext';
import { Text } from './Themed';

export type SheetAction = {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'danger' | 'primary';
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  actions: SheetAction[];
};

const PANEL_HEIGHT = 300; // safe over-estimate; panel is position:absolute bottom:0

export default function BottomSheet({ visible, onClose, title, message, actions }: Props) {
  const { isDarkMode } = useAppContext();

  const translateY  = useSharedValue(PANEL_HEIGHT);
  const backdropO   = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropO.value  = withTiming(1, { duration: duration.normal, easing: ease });
      translateY.value = withSpring(0, spring.gentle);
    } else {
      backdropO.value  = withTiming(0, { duration: duration.fast, easing: ease });
      translateY.value = withTiming(PANEL_HEIGHT, { duration: duration.normal, easing: ease });
    }
  }, [visible]);

  const panelStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  const sheetBg  = isDarkMode ? '#131929' : '#ffffff';
  const titleCol = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const msgCol   = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const divider  = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const handleCol = isDarkMode ? '#2A3A52' : '#D1D9E8';

  const actionColor = (variant: SheetAction['variant']) => {
    if (variant === 'danger')  return '#E53535';
    if (variant === 'primary') return '#1E6FD9';
    return titleCol;
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[styles.panel, { backgroundColor: sheetBg }, panelStyle]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: handleCol }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: titleCol }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: msgCol }]}>{message}</Text>
          ) : null}
        </View>

        {/* Actions */}
        <View style={[styles.actionsWrap, { borderTopColor: divider }]}>
          {actions.map((action, i) => (
            <Pressable
              key={i}
              onPress={() => { onClose(); action.onPress(); }}
              style={({ pressed }) => [
                styles.actionRow,
                i < actions.length - 1 && { borderBottomWidth: 1, borderBottomColor: divider },
                { opacity: pressed ? 0.55 : 1 },
              ]}
            >
              <Text style={[
                styles.actionLabel,
                { color: actionColor(action.variant) },
                action.variant === 'primary' && { fontWeight: '700' },
                action.variant === 'danger'  && { fontWeight: '600' },
              ]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 18,
  },
  title: {
    fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginBottom: 5,
  },
  message: {
    fontSize: 14, lineHeight: 20,
  },
  actionsWrap: {
    borderTopWidth: 1,
  },
  actionRow: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 15,
  },
});
