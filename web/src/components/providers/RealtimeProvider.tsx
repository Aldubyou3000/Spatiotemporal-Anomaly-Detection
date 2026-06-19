"use client";

import { useRealtimeSync } from "@/hooks/useRealtimeSync";

/**
 * Mounts the single dashboard-wide EventSource. Rendered once at the dashboard
 * root (inside SWRConfig so revalidations hit the same cache, and inside
 * AuthProvider so we only connect within the authenticated shell). Renders no
 * UI — it exists so the realtime connection survives navigation between pages.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
  return <>{children}</>;
}
