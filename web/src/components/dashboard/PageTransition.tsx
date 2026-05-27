"use client";

import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="flex-1 flex flex-col animate-fade-in-up">
      {children}
    </div>
  );
}
