"use client";

import { SWRConfig } from "swr";
import { AuthProvider } from "@/context/AuthContext";
import { ZonesProvider } from "@/context/ZonesContext";
import { RealtimeProvider } from "@/components/providers/RealtimeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { PageTransition } from "@/components/dashboard/PageTransition";
import { OfflineBanner } from "@/components/ui/OfflineBanner";

function shouldRetryOnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Never retry auth / validation / not-found — only transient network/server.
  if (/Session expired|Not authenticated|Invalid or expired token|Account is disabled|CSRF/i.test(msg)) return false;
  // SWR error object's message is "Request failed" for 5xx; let it retry.
  return true;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ZonesProvider>
        <SWRConfig value={{
          dedupingInterval: 4000,
          revalidateOnFocus: false,
          revalidateOnReconnect: true,
          revalidateIfStale: true,
          keepPreviousData: true,
          errorRetryCount: 3,
          onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
            if (retryCount >= 3) return;
            if (!shouldRetryOnError(error)) return;
            // Exponential backoff: 700ms, 2s, 4s
            const timeout = Math.min(700 * Math.pow(2.8, retryCount), 4000);
            setTimeout(() => revalidate({ retryCount }), timeout);
          },
        }}>
          <RealtimeProvider>
            <ToastProvider>
              <div className="h-screen flex bg-bg text-text relative overflow-hidden">
                <div aria-hidden className="fixed inset-0 grid-bg opacity-40 pointer-events-none" />
                <Sidebar />
                <main className="flex-1 min-w-0 flex flex-col relative z-10 overflow-hidden">
                  <OfflineBanner />
                  <PageTransition>{children}</PageTransition>
                </main>
              </div>
            </ToastProvider>
          </RealtimeProvider>
        </SWRConfig>
      </ZonesProvider>
    </AuthProvider>
  );
}
