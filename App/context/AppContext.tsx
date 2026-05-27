import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiGetMe, apiLogin, apiLogout, clearTokens, getAccessToken, UserProfile } from '@/services/api';

type AppContextType = {
  isLoggedIn: boolean;
  isDarkMode: boolean;
  authLoading: boolean;
  technicianName: string;
  profile: UserProfile | null;
  login: (credential: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleTheme: () => void;
};

const fallbackAppContext: AppContextType = {
  isLoggedIn: false,
  isDarkMode: false,
  authLoading: true,
  technicianName: 'Technician',
  profile: null,
  login: async () => {},
  logout: async () => {},
  toggleTheme: () => {},
};

const AppContext = createContext<AppContextType>(fallbackAppContext);

const THEME_KEY = 'app_isDarkMode';

async function readTheme(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.localStorage.getItem(THEME_KEY) === 'true';
  }
  try {
    return (await SecureStore.getItemAsync(THEME_KEY)) === 'true';
  } catch {
    return false;
  }
}

async function writeTheme(isDark: boolean): Promise<void> {
  const val = isDark ? 'true' : 'false';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_KEY, val);
    return;
  }
  try {
    await SecureStore.setItemAsync(THEME_KEY, val);
  } catch { /* ignore */ }
}

export function AppProvider({ children }: PropsWithChildren<{}>) {
  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const [savedDark, token] = await Promise.all([readTheme(), getAccessToken()]);
      if (!mounted) return;
      setIsDarkMode(savedDark);

      if (token) {
        const me = await apiGetMe();
        if (mounted) setProfile(me);
      }

      if (mounted) setAuthLoading(false);
    }

    init();
    return () => { mounted = false; };
  }, []);

  const login = async (credential: string, password: string) => {
    const user = await apiLogin(credential, password);
    setProfile(user);
  };

  const logout = async () => {
    await apiLogout();
    setProfile(null);
  };

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    writeTheme(next);
  };

  const value = useMemo(
    () => ({
      isLoggedIn: !!profile,
      isDarkMode,
      authLoading,
      technicianName: profile?.full_name ?? 'Technician',
      profile,
      login,
      logout,
      toggleTheme,
    }),
    [profile, isDarkMode, authLoading],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext) ?? fallbackAppContext;
}
