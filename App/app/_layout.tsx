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

import Button from '@/components/Button';
import { Text } from '@/components/Themed';
import { duration, ease, spring, stagger } from '@/constants/Motion';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { AppProvider, useAppContext } from '@/context/AppContext';
import { useTheme } from '@/hooks/useTheme';

// ─── Root ────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <AppProvider>
      <AppRoot />
    </AppProvider>
  );
}

function AppRoot() {
  const { isLoggedIn, authLoading, isDarkMode } = useAppContext();
  const bg = isDarkMode ? '#0A0F1E' : '#F5F7FA';

  if (authLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={palette.brand} />
      </View>
    );
  }

  if (!isLoggedIn) return <LoginScreen />;

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
            headerStyle: { backgroundColor: isDarkMode ? '#131929' : '#FFFFFF' },
            headerTintColor: isDarkMode ? '#F0F4FF' : '#0D1B3E',
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '600', fontSize: 17 },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

// ─── Login ───────────────────────────────────────────────────────────────────
function LoginScreen() {
  const { login } = useAppContext();
  const theme = useTheme();
  const passwordRef = useRef<TextInput>(null);

  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [errors, setErrors]             = useState<{ username?: string; password?: string; general?: string }>({});
  const [loading, setLoading]           = useState(false);

  // Staggered entrance — brand → fields → button
  const items = [
    { o: useSharedValue(0), y: useSharedValue(18) }, // brand
    { o: useSharedValue(0), y: useSharedValue(12) }, // username
    { o: useSharedValue(0), y: useSharedValue(12) }, // password
    { o: useSharedValue(0), y: useSharedValue(12) }, // remember
    { o: useSharedValue(0), y: useSharedValue(10) }, // button
  ];

  useEffect(() => {
    items.forEach((item, i) => {
      const delay = i * stagger.field;
      item.o.value = withDelay(delay, withTiming(1, { duration: duration.entrance, easing: ease }));
      item.y.value = withDelay(delay, withSpring(0, spring.gentle));
    });
  }, []);

  const animStyle = (i: number) =>
    useAnimatedStyle(() => ({
      opacity: items[i].o.value,
      transform: [{ translateY: items[i].y.value }],
    }));

  const validate = () => {
    const e: typeof errors = {};
    if (!username.trim()) e.username = 'Username is required.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 6) e.password = 'Must be at least 6 characters.';
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
      style={[styles.loginOuter, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.loginInner}>

        {/* ── Brand ──────────────────────────────────────────────────── */}
        <Animated.View style={[styles.brand, animStyle(0)]}>
          <View style={[styles.brandIcon, { backgroundColor: palette.brand }]}>
            <Ionicons name="pulse" size={28} color={palette.white} />
          </View>
          <Text style={[styles.brandName, { color: theme.text }]}>
            SpatioTemporal
          </Text>
          <Text style={[styles.brandSub, { color: theme.textSecondary }]}>
            Field Technician Portal
          </Text>
        </Animated.View>

        {/* General error */}
        {errors.general ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={palette.danger} />
            <Text style={styles.errorBannerText}>{errors.general}</Text>
          </View>
        ) : null}

        {/* ── Username ───────────────────────────────────────────────── */}
        <Animated.View style={animStyle(1)}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            Username
          </Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: theme.surface,
                borderColor: errors.username ? palette.danger : theme.borderStrong,
              },
            ]}
          >
            <Ionicons name="person-outline" size={17} color={theme.textTertiary} style={{ marginRight: spacing.xs }} />
            <TextInput
              style={[styles.inputField, { color: theme.text }]}
              placeholder="e.g. john_doe"
              placeholderTextColor={theme.textTertiary}
              value={username}
              onChangeText={(v) => { setUsername(v); setErrors((p) => ({ ...p, username: undefined })); }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>
          {errors.username ? (
            <Text style={styles.fieldError}>{errors.username}</Text>
          ) : null}
        </Animated.View>

        {/* ── Password ───────────────────────────────────────────────── */}
        <Animated.View style={[animStyle(2), { marginTop: spacing.md }]}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            Password
          </Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: theme.surface,
                borderColor: errors.password ? palette.danger : theme.borderStrong,
              },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={17} color={theme.textTertiary} style={{ marginRight: spacing.xs }} />
            <TextInput
              ref={passwordRef}
              style={[styles.inputField, { color: theme.text, flex: 1 }]}
              placeholder="Enter your password"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showPassword}
              textContentType="password"
              value={password}
              onChangeText={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: undefined })); }}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <Pressable
              onPress={() => setShowPassword((s) => !s)}
              hitSlop={12}
              style={({ pressed }) => ({ paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          </View>
          {errors.password ? (
            <Text style={styles.fieldError}>{errors.password}</Text>
          ) : null}
        </Animated.View>

        {/* ── Remember ───────────────────────────────────────────────── */}
        <Animated.View style={animStyle(3)}>
          <Pressable
            onPress={() => setRememberMe((r) => !r)}
            style={styles.rememberRow}
            hitSlop={8}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: rememberMe ? palette.brand : theme.borderStrong,
                  backgroundColor: rememberMe ? palette.brand : 'transparent',
                },
              ]}
            >
              {rememberMe ? <Ionicons name="checkmark" size={12} color={palette.white} /> : null}
            </View>
            <Text style={[styles.rememberLabel, { color: theme.textSecondary }]}>
              Remember me
            </Text>
          </Pressable>
        </Animated.View>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <Animated.View style={animStyle(4)}>
          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            size="lg"
          />
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  loginOuter: { flex: 1, justifyContent: 'center' },
  loginInner: {
    paddingHorizontal: spacing.lg + 4,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },

  // Brand ─────────────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xl + spacing.xs,
  },
  brandIcon: {
    width: 64, height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandName: {
    fontSize: typography.title.size,
    lineHeight: typography.title.lineHeight,
    fontWeight: typography.title.weight,
    letterSpacing: typography.title.letterSpacing,
  },
  brandSub: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    marginTop: spacing.xxs + 2,
  },

  // Error banner ──────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(229,53,53,0.20)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    flex: 1,
    color: palette.danger,
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '500',
  },

  // Fields ────────────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    minHeight: 50,
  },
  inputField: {
    flex: 1,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.xs,
  },
  fieldError: {
    color: palette.danger,
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    marginTop: spacing.xs - 2,
    fontWeight: '500',
  },

  // Remember ──────────────────────────────────────────────────────────────
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  checkbox: {
    width: 20, height: 20,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberLabel: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '500',
  },
});
