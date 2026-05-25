import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { duration, ease, spring } from '@/constants/Motion';

import Button from '@/components/Button';
import { Text } from '@/components/Themed';
import { AppProvider, useAppContext } from '@/context/AppContext';

export default function RootLayout() {
  return (
    <AppProvider>
      <AppRoot />
    </AppProvider>
  );
}

function AppRoot() {
  const { isDarkMode, isLoggedIn, authLoading } = useAppContext();
  const bg = isDarkMode ? '#0A0F1E' : '#F5F7FA';

  if (authLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color="#1E6FD9" />
      </View>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return (
    <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="report"
          options={{
            presentation: 'card',
            animation: 'fade',
            animationDuration: 120,
            headerShown: true,
            title: 'Inspection Report',
            headerStyle: { backgroundColor: isDarkMode ? '#131929' : '#ffffff' },
            headerTintColor: isDarkMode ? '#F0F4FF' : '#0D1B3E',
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Login Screen
// ---------------------------------------------------------------------------

function LoginScreen() {
  const { login, isDarkMode } = useAppContext();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Each element: [opacity, translateY] — staggered 60ms apart
  const brandO  = useSharedValue(0); const brandY  = useSharedValue(16);
  const field1O = useSharedValue(0); const field1Y = useSharedValue(12);
  const field2O = useSharedValue(0); const field2Y = useSharedValue(12);
  const field3O = useSharedValue(0); const field3Y = useSharedValue(12);
  const btnO    = useSharedValue(0); const btnY    = useSharedValue(10);

  useEffect(() => {
    const t = { duration: duration.entrance, easing: ease };
    const tFast = { duration: duration.normal, easing: ease };
    brandO.value  = withDelay(0,   withTiming(1, t));
    brandY.value  = withDelay(0,   withSpring(0, spring.gentle));
    field1O.value = withDelay(80,  withTiming(1, tFast));
    field1Y.value = withDelay(80,  withSpring(0, spring.gentle));
    field2O.value = withDelay(140, withTiming(1, tFast));
    field2Y.value = withDelay(140, withSpring(0, spring.gentle));
    field3O.value = withDelay(190, withTiming(1, tFast));
    field3Y.value = withDelay(190, withSpring(0, spring.gentle));
    btnO.value    = withDelay(240, withTiming(1, tFast));
    btnY.value    = withDelay(240, withSpring(0, spring.gentle));
  }, []);

  const brandStyle  = useAnimatedStyle(() => ({ opacity: brandO.value,  transform: [{ translateY: brandY.value }] }));
  const field1Style = useAnimatedStyle(() => ({ opacity: field1O.value, transform: [{ translateY: field1Y.value }] }));
  const field2Style = useAnimatedStyle(() => ({ opacity: field2O.value, transform: [{ translateY: field2Y.value }] }));
  const field3Style = useAnimatedStyle(() => ({ opacity: field3O.value, transform: [{ translateY: field3Y.value }] }));
  const btnStyle    = useAnimatedStyle(() => ({ opacity: btnO.value,    transform: [{ translateY: btnY.value }] }));

  const bg = isDarkMode ? '#0A0F1E' : '#F5F7FA';
  const textColor = isDarkMode ? '#F0F4FF' : '#0D1B3E';
  const secondaryText = isDarkMode ? '#7A8BAA' : '#6B7A99';
  const inputBorder = isDarkMode ? '#1E2D47' : '#D1D9E8';
  const inputBg = isDarkMode ? '#0F1929' : '#ffffff';

  const validate = () => {
    const e: typeof errors = {};
    if (!username.trim()) e.username = 'Username is required.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 6) e.password = 'At least 6 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    setErrors({});
    if (!validate()) return;
    setLoading(true);
    try {
      await login(username.trim().toLowerCase(), password);
    } catch (e: any) {
      setErrors({ general: e?.message ?? 'Incorrect username or password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.outer, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>

        {/* Brand */}
        <Animated.View style={[styles.brand, brandStyle]}>
          <View style={[styles.brandIcon, { backgroundColor: '#1E6FD9' }]}>
            <Ionicons name="radio" size={26} color="#ffffff" />
          </View>
          <Text style={[styles.brandName, { color: textColor }]}>SpatioTemporal</Text>
          <Text style={[styles.brandSub, { color: secondaryText }]}>Field Technician Portal</Text>
        </Animated.View>

        {/* General error */}
        {errors.general ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{errors.general}</Text>
          </View>
        ) : null}

        {/* Username */}
        <Animated.View style={field1Style}>
          <Text style={[styles.label, { color: secondaryText }]}>Username</Text>
          <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: errors.username ? '#E53535' : inputBorder }]}>
            <TextInput
              style={[styles.inputField, { color: textColor }]}
              placeholder="e.g. john_doe"
              placeholderTextColor={isDarkMode ? '#2A3A52' : '#A8B4CC'}
              value={username}
              onChangeText={(v) => { setUsername(v); setErrors((p) => ({ ...p, username: undefined })); }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>
          {errors.username ? <Text style={styles.fieldError}>{errors.username}</Text> : null}
        </Animated.View>

        {/* Password */}
        <Animated.View style={[field2Style, { marginTop: 20 }]}>
          <Text style={[styles.label, { color: secondaryText }]}>Password</Text>
          <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: errors.password ? '#E53535' : inputBorder }]}>
            <TextInput
              ref={passwordRef}
              style={[styles.inputField, { color: textColor, flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={isDarkMode ? '#2A3A52' : '#A8B4CC'}
              secureTextEntry={!showPassword}
              textContentType="password"
              value={password}
              onChangeText={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: undefined })); }}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={12} style={{ paddingHorizontal: 4 }}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={secondaryText}
              />
            </Pressable>
          </View>
          {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
        </Animated.View>

        {/* Remember me */}
        <Animated.View style={field3Style}>
          <Pressable
            onPress={() => setRememberMe((r) => !r)}
            style={[styles.rememberRow, { marginTop: 16, marginBottom: 28 }]}
            hitSlop={6}
          >
            <View style={[
              styles.checkbox,
              {
                borderColor: rememberMe ? '#1E6FD9' : inputBorder,
                backgroundColor: rememberMe ? '#1E6FD9' : 'transparent',
              },
            ]}>
              {rememberMe ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
            </View>
            <Text style={[styles.rememberLabel, { color: secondaryText }]}>Remember me</Text>
          </Pressable>
        </Animated.View>

        <Animated.View style={btnStyle}>
          <Button label="Sign In" onPress={handleLogin} loading={loading} />
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  outer: { flex: 1, justifyContent: 'center' },
  inner: { paddingHorizontal: 28, maxWidth: 420, width: '100%', alignSelf: 'center' },

  brand: { alignItems: 'center', marginBottom: 40 },
  brandIcon: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  brandName: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  brandSub: { fontSize: 13, marginTop: 4 },

  errorBanner: {
    backgroundColor: 'rgba(229,53,53,0.07)',
    borderWidth: 1, borderColor: 'rgba(229,53,53,0.2)',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorBannerText: { color: '#E53535', fontSize: 13, fontWeight: '500' },

  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginBottom: 8, textTransform: 'uppercase' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 3,
  },
  inputField: { flex: 1, fontSize: 15 },
  fieldError: { color: '#E53535', fontSize: 12, marginTop: 5, fontWeight: '500' },

  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 19, height: 19, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  rememberLabel: { fontSize: 13, fontWeight: '500' },
});
