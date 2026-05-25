import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useAppContext } from '@/context/AppContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabLayout() {
  const { isDarkMode, toggleTheme } = useAppContext();

  const activeTint   = '#1E6FD9';
  const inactiveTint = isDarkMode ? '#3A4D6B' : '#9AAAC4';
  const tabBarBg     = isDarkMode ? '#0D1422' : '#ffffff';
  const headerBg     = isDarkMode ? '#0A0F1E' : '#F5F7FA';
  const headerTint   = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const borderColor  = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopColor: borderColor,
          borderTopWidth: 1,
          paddingTop: 6,
          height: 58,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 6,
        },
        headerStyle: {
          backgroundColor: headerBg,
          shadowColor: 'transparent',
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        } as any,
        headerTintColor: headerTint,
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerRight: () => (
            <ThemeToggleButton isDarkMode={isDarkMode} onPress={toggleTheme} color={headerTint} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={21}
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
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

function ThemeToggleButton({
  isDarkMode,
  onPress,
  color,
}: {
  isDarkMode: boolean;
  onPress: () => void;
  color: string;
}) {
  const icon: IoniconName = isDarkMode ? 'sunny-outline' : 'moon-outline';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({ marginRight: 14, padding: 6, opacity: pressed ? 0.55 : 1 })}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}
