import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/services/supabase';
import type { Session, User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: 'analyst' | 'technician';
  phone: string | null;
  station_ids: string[];
  is_active: boolean;
}

type AppContextType = {
  isLoggedIn: boolean;
  isDarkMode: boolean;
  authLoading: boolean;
  technicianName: string;
  user: User | null;
  profile: UserProfile | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleTheme: () => void;
};

const fallbackAppContext: AppContextType = {
  isLoggedIn: false,
  isDarkMode: false,
  authLoading: true,
  technicianName: 'Technician',
  user: null,
  profile: null,
  login: async () => {},
  logout: async () => {},
  toggleTheme: () => {},
};

const AppContext = createContext<AppContextType>(fallbackAppContext);

async function readTheme(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.localStorage.getItem('maintenanceApp:isDarkMode') === 'true';
  }
  try {
    const SecureStore = await import('expo-secure-store');
    return (await SecureStore.getItemAsync('maintenanceApp:isDarkMode')) === 'true';
  } catch {
    return false;
  }
}

async function writeTheme(isDark: boolean): Promise<void> {
  const val = isDark ? 'true' : 'false';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem('maintenanceApp:isDarkMode', val);
    return;
  }
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync('maintenanceApp:isDarkMode', val);
  } catch {
    // silently ignore
  }
}

function isEmail(credential: string): boolean {
  return credential.includes('@');
}

async function resolveCredentialToEmail(credential: string): Promise<string> {
  const trimmedCred = credential.trim().toLowerCase();
  
  if (isEmail(trimmedCred)) {
    return trimmedCred;
  }
  
  // Resolve username to email via RPC
  const { data, error } = await supabase.rpc('get_email_by_username', {
    p_username: trimmedCred,
  });
  
  if (error || !data) {
    throw new Error('Username not found. Check with your analyst.');
  }
  
  return data as string;
}

async function loadProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

export function AppProvider({ children }: PropsWithChildren<{}>) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      const savedDark = await readTheme();
      if (isMounted) setIsDarkMode(savedDark);

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (isMounted) {
        setSession(currentSession);
        if (currentSession?.user) {
          const p = await loadProfile(currentSession.user.id);
          if (isMounted) setProfile(p);
        }
        setAuthLoading(false);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      if (newSession?.user) {
        const p = await loadProfile(newSession.user.id);
        if (isMounted) setProfile(p);
      } else {
        setProfile(null);
      }
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (credential: string, password: string) => {
    const email = await resolveCredentialToEmail(credential);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    writeTheme(next);
  };

  const value = useMemo(
    () => ({
      isLoggedIn: !!session,
      isDarkMode,
      authLoading,
      technicianName: profile?.full_name ?? session?.user?.email ?? 'Technician',
      user: session?.user ?? null,
      profile,
      login,
      logout,
      toggleTheme,
    }),
    [session, isDarkMode, authLoading, profile]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext) ?? fallbackAppContext;
}
