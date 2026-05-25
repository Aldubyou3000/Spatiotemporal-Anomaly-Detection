import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { palette, spacing, typography } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Theme toggle (header right) ─────────────────────────────────────────────
function ThemeToggleButton({
  isDarkMode, onPress, color,
}: {
  isDarkMode: boolean; onPress: () => void; color: string;
}) {
  const icon: IoniconName = isDarkMode ? 'sunny-outline' : 'moon-outline';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        marginRight: spacing.sm,
        padding: 8,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
export default function TabLayout() {
  const { isDarkMode, toggleTheme } = useAppContext();
  const theme = useTheme();

  const inactiveTint = isDarkMode ? '#3A4D6B' : '#9AAAC4';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   palette.brand,
        tabBarInactiveTintColor: inactiveTint,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor:  theme.border,
          borderTopWidth:  1,
          paddingTop:      6,
          height:          62,
        },
        tabBarLabelStyle: {
          fontSize:    typography.caption.size,
          fontWeight:  '600',
          letterSpacing: 0.1,
          marginBottom: 6,
        },
        headerStyle: {
          backgroundColor: theme.bg,
          shadowColor:     'transparent',
          elevation:       0,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        } as any,
        headerTintColor:    theme.text,
        headerTitleStyle:   {
          fontWeight: typography.subtitle.weight,
          fontSize:   typography.subtitle.size,
          letterSpacing: typography.subtitle.letterSpacing,
        },
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerRight: () => (
            <ThemeToggleButton
              isDarkMode={isDarkMode}
              onPress={toggleTheme}
              color={theme.text}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
