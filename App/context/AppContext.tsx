import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiGetMe, apiLogin, apiLogout, getAccessToken, UserProfile } from '@/services/api';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { queryClient } from '@/lib/queryClient';
import { ACTIVITY_KEY, TICKET_LIST_KEY } from '@/hooks/useTickets';

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

  // One real-time connection for the whole authenticated session. Each nudge
  // invalidates all ticket and activity queries — TanStack Query refetches
  // stale entries quietly in the background with no spinner.
  const invalidateTickets = useCallback(() => {
    // Prefix match: ['/api/mobile/tickets'] covers the list AND every open
    // ticket's report/attachments detail key, so a live change refreshes an
    // open ticket too. Photos hang off the reports prefix. Cached screens swap
    // to fresh data with no spinner (stale-while-revalidate).
    queryClient.invalidateQueries({ queryKey: TICKET_LIST_KEY });
    queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY });
    queryClient.invalidateQueries({ queryKey: ['/api/mobile/reports'] });
  }, []);
  useRealtimeSync({ enabled: !!profile, onNudge: invalidateTickets });

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
    try {
      await apiLogout();
    } catch {
      // apiLogout already clears tokens; nothing to do here
    } finally {
      setProfile(null);
      // Clear persisted cache so stale data from this session doesn't
      // leak into the next login (different user or expired tokens).
      queryClient.clear();
    }
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
