"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import type { UserProfile } from "@/types/auth";

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    authApi
      .me()
      .then((u) => {
        setUser(u);
        // Proactively seed direct Bearer token for zones uploads (needed for Vercel bypass).
        // Google OAuth users never called authApi.login, so zones would otherwise need to
        // fetch it on first upload (which adds a cold-start roundtrip). Seeding here makes
        // the first upload instant. Use a short delay so it doesn't block the initial render.
        if (typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app")) {
          authApi.directToken().catch(() => {/* ignore — zones will retry */});
        }
      })
      .catch(() => routerRef.current.replace("/login"))
      .finally(() => setLoading(false));
    // intentionally empty — runs once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // best-effort — server-side revocation may fail if session already expired
    }
    setUser(null);
    router.replace("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
