import { AuthProvider } from "@/context/AuthContext";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { PageTransition } from "@/components/dashboard/PageTransition";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen flex bg-bg text-text relative">
        <div aria-hidden className="fixed inset-0 grid-bg opacity-40 pointer-events-none" />
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col relative z-10">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </AuthProvider>
  );
}
