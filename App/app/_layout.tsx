import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { asyncStoragePersister } from '@/lib/persistedQueryClient';
import { queryClient } from '@/lib/queryClient';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import Button from '@/components/Button';
import Icon from '@/components/Icon';
import { Text } from '@/components/Themed';
import { icons } from '@/constants/icons';
import { duration, ease, spring, stagger } from '@/constants/Motion';
import { getTheme, palette, radius, spacing, typography } from '@/constants/theme';
import { AppProvider, useAppContext } from '@/context/AppContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';

// ─── Root ────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          // Match the API's refresh token lifetime (7 days). After this the
          // persisted cache is discarded and the app fetches fresh on next open.
          maxAge: 7 * 24 * 60 * 60 * 1000,
          // Persist ONLY the two list payloads to disk (ticket list + activity
          // feed). Ticket detail / report / photo / attachment queries are
          // memory-only: instant on reopen within a session, refetched once
          // after a cold launch. This keeps AsyncStorage small and cold-start
          // fast no matter how many tickets are opened over time.
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => {
              const [root, second] = query.queryKey as unknown[];
              return (
                (root === '/api/mobile/tickets' && second === undefined) ||
                root === '/api/mobile/activity'
              );
            },
          },
        }}
      >
        <AppProvider>
          <AppRoot />
        </AppProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

function AppRoot() {
  const { isLoggedIn, authLoading, isDarkMode } = useAppContext();
  const t = getTheme(isDarkMode);

  // OS status bar tint (clock / battery / notification icons) for the pre-tab
  // screens. Inside the tabs, each screen sets its own style because what sits
  // behind the bar differs per tab: Dashboard & Profile have the blue cloud
  // (always light icons), while Activity has the plain grey/dark bg (follows the
  // theme). expo's "auto" is NOT used — it reads the device OS color scheme, not
  // this app's in-app theme toggle, so it never matched.
  const loadingBarStyle = isDarkMode ? 'light' : 'dark';

  if (authLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: t.bg }]}>
        <StatusBar style={loadingBarStyle} />
        <ActivityIndicator size="large" color={palette.brand} />
      </View>
    );
  }

  if (!isLoggedIn) {
    // Login is a fixed white screen (see LoginScreen styles) regardless of
    // theme, so its status-bar icons are always dark.
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen />
      </>
    );
  }

  return (
    <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* OAuth deep-link landing — invisible: no header, no animation. Token
            capture happens in services/api.ts; this just redirects to root. */}
        <Stack.Screen
          name="oauth-callback"
          options={{ headerShown: false, animation: 'none' }}
        />
        <Stack.Screen
          name="ticket/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            headerShown: true,
            // title + header styling are set per-screen in ticket/[id].tsx
          }}
        />
        <Stack.Screen
          name="report"
          options={{
            presentation: 'card',
            animation: 'fade',
            animationDuration: 120,
            headerShown: true,
            title: 'Inspection Report',
            headerStyle: { backgroundColor: t.surface },
            headerTintColor: t.text,
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
  const { login, loginWithGoogle } = useAppContext();
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const passwordRef = useRef<TextInput>(null);

  // Refs hold live input values — no state update on each keystroke,
  // so the screen never re-renders while typing. This is the root cause of
  // secureTextEntry's masking delay being interrupted on Android/iOS.
  const usernameRef = useRef('');
  const passwordVal = useRef('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors]             = useState<{ username?: string; password?: string; general?: string }>({});
  const [loading, setLoading]           = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Staggered entrance — brand → input card → sign-in button → google button.
  // Each row's opacity + translateY are their own shared values (declared at the
  // top level, never inside a loop/conditional) so the Rules of Hooks hold.
  const o0 = useSharedValue(0); const y0 = useSharedValue(18); // brand
  const o1 = useSharedValue(0); const y1 = useSharedValue(12); // input card
  const o2 = useSharedValue(0); const y2 = useSharedValue(12); // (advances clock)
  const o3 = useSharedValue(0); const y3 = useSharedValue(10); // sign-in button
  const o4 = useSharedValue(0); const y4 = useSharedValue(10); // google button

  useEffect(() => {
    const rows: [typeof o0, typeof y0][] = [
      [o0, y0], [o1, y1], [o2, y2], [o3, y3], [o4, y4],
    ];
    // Reduce-motion / battery-saver: snap every row to its final state, no
    // animation. The login form just appears.
    if (reducedMotion) {
      rows.forEach(([o, y]) => { o.value = 1; y.value = 0; });
      return;
    }
    rows.forEach(([o, y], i) => {
      const delay = i * stagger.field;
      o.value = withDelay(delay, withTiming(1, { duration: duration.entrance, easing: ease }));
      y.value = withDelay(delay, withSpring(0, spring.gentle));
    });
  }, [reducedMotion]);

  // One useAnimatedStyle per row — called unconditionally, in stable order.
  // The username + password fields share one input card (usernameAnim), so the
  // o2/y2 values still advance the stagger clock for the rows below; there is
  // intentionally no separate passwordAnim view.
  const brandAnim    = useAnimatedStyle(() => ({ opacity: o0.value, transform: [{ translateY: y0.value }] }));
  const usernameAnim = useAnimatedStyle(() => ({ opacity: o1.value, transform: [{ translateY: y1.value }] }));
  const buttonAnim   = useAnimatedStyle(() => ({ opacity: o3.value, transform: [{ translateY: y3.value }] }));
  const googleAnim   = useAnimatedStyle(() => ({ opacity: o4.value, transform: [{ translateY: y4.value }] }));

  const validate = () => {
    const u = usernameRef.current.trim();
    const p = passwordVal.current;
    const e: typeof errors = {};
    if (!u) e.username = 'Username is required.';
    if (!p) e.password = 'Password is required.';
    else if (p.length < 6) e.password = 'Must be at least 6 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    setErrors({});
    if (!validate()) return;
    setLoading(true);
    try {
      await login(usernameRef.current.trim().toLowerCase(), passwordVal.current);
    } catch (e: any) {
      setErrors({ general: e?.message ?? 'Incorrect username or password.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrors({});
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      // User backing out of the browser is not an error — stay silent.
      if (e?.name !== 'OAuthCancelled') {
        setErrors({ general: e?.message ?? 'Google sign-in failed. Please try again.' });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const hasError = !!(errors.username || errors.password);

  return (
    <KeyboardAvoidingView
      style={[styles.loginOuter, { backgroundColor: '#FFFFFF' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.loginInner}>

        {/* ── Brand ──────────────────────────────────────────────────── */}
        <Animated.View style={[styles.brand, brandAnim]}>
          <View style={[styles.brandIcon, { backgroundColor: palette.brand }]}>
            <Icon name={icons.brandMark} size={28} color={palette.white} />
          </View>
          <Text style={styles.brandName}>SpatioTemporal</Text>
          <Text style={styles.brandSub}>Field Technician Portal</Text>
        </Animated.View>

        {/* ── General error banner ────────────────────────────────────── */}
        {errors.general ? (
          <View style={styles.errorBanner}>
            <Icon name={icons.errorFill} size={16} color={palette.danger} />
            <Text style={styles.errorBannerText}>{errors.general}</Text>
          </View>
        ) : null}

        {/* ── Unified input card ──────────────────────────────────────── */}
        <Animated.View style={usernameAnim}>
          <View style={[
            styles.inputCard,
            hasError && { borderColor: palette.danger },
          ]}>
            {/* Username row */}
            <View style={styles.inputRow}>
              <Icon name={icons.user} size={17} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={[styles.inputField, { color: theme.text }]}
                placeholder="Username"
                placeholderTextColor="#9CA3AF"
                onChangeText={(v) => { usernameRef.current = v; }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            {/* Hairline divider */}
            <View style={styles.inputDivider} />

            {/* Password row */}
            <View style={styles.inputRow}>
              <Icon name={icons.password} size={17} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                style={[
                  styles.inputField,
                  { color: theme.text, flex: 1 },
                  // System font prevents the jank/delay when toggling secureTextEntry.
                  // Custom fonts conflict with native dot-masking on iOS/Android.
                  !showPassword && { fontFamily: undefined },
                ]}
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                textContentType="password"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                onChangeText={(v) => { passwordVal.current = v; }}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.6 : 1 })}
              >
                <Icon
                  name={showPassword ? icons.eyeHide : icons.eyeShow}
                  size={18}
                  color="#9CA3AF"
                />
              </Pressable>
            </View>
          </View>

          {/* Inline field errors */}
          {(errors.username || errors.password) ? (
            <Text style={styles.fieldError}>
              {errors.username ?? errors.password}
            </Text>
          ) : null}
        </Animated.View>

        {/* ── Sign In button ───────────────────────────────────────────── */}
        <Animated.View style={[buttonAnim, { marginTop: spacing.md }]}>
          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={googleLoading}
            size="lg"
            style={{ borderRadius: 16 }}
            textStyle={{ fontWeight: '700' }}
          />
        </Animated.View>

        {/* ── Divider ──────────────────────────────────────────────────── */}
        <Animated.View style={[googleAnim, styles.dividerRow]}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </Animated.View>

        {/* ── Continue with Google ─────────────────────────────────────── */}
        <Animated.View style={googleAnim}>
          <Pressable
            onPress={handleGoogleLogin}
            disabled={loading || googleLoading}
            android_ripple={{ color: '#00000010', borderless: false }}
            style={({ pressed }) => [
              styles.googleButton,
              (loading || googleLoading) && { opacity: 0.6 },
              Platform.OS === 'ios' && pressed && { opacity: 0.7 },
            ]}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </Pressable>
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
    paddingTop: spacing.xxxl,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },

  // Brand ─────────────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xl + spacing.sm,
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
    fontWeight: '700',
    color: '#111827',
  },
  brandSub: {
    fontSize: typography.callout.size,
    lineHeight: typography.callout.lineHeight,
    fontWeight: '400',
    color: '#6B7280',
    marginTop: spacing.xxs + 2,
  },

  // Error banner ──────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: palette.danger + '33',
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

  // Unified input card ────────────────────────────────────────────────────
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    minHeight: 56,
  },
  inputIcon: {
    marginRight: spacing.xs,
  },
  inputDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginLeft: spacing.sm + 2 + 17 + spacing.xs, // aligns with text, past the icon
  },
  inputField: {
    flex: 1,
    fontSize: typography.body.size,
    lineHeight: typography.body.lineHeight,
    paddingVertical: 0,
  },
  fieldError: {
    color: palette.danger,
    fontSize: typography.caption.size,
    lineHeight: typography.caption.lineHeight,
    marginTop: spacing.xs - 2,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },

  // Divider ───────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: typography.caption.size,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // Google button ───────────────────────────────────────────────────────────
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: typography.body.size,
    fontWeight: '600',
    color: '#111827',
  },
});
