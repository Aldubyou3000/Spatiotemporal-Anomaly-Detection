"use client";

import { SWRConfig } from "swr";
import { AuthProvider } from "@/context/AuthContext";
import { ZonesProvider } from "@/context/ZonesContext";
import { RealtimeProvider } from "@/components/providers/RealtimeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { PageTransition } from "@/components/dashboard/PageTransition";

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
        }}>
          <RealtimeProvider>
            <ToastProvider>
              <div className="h-screen flex bg-bg text-text relative overflow-hidden">
                <div aria-hidden className="fixed inset-0 grid-bg opacity-40 pointer-events-none" />
                <Sidebar />
                <main className="flex-1 min-w-0 flex flex-col relative z-10 overflow-hidden">
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
