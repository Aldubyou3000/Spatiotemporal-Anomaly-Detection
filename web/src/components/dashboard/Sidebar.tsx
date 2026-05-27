"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Ticket, ClipboardCheck, Users, Waves } from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  description?: string;
}

const NAV: NavItem[] = [
  { href: "/zones",        label: "Zones",        icon: Activity,        description: "Anomaly pipeline" },
  { href: "/tickets",      label: "Tickets",      icon: Ticket,          description: "Maintenance board" },
  { href: "/reports",      label: "Reports",      icon: ClipboardCheck,  description: "Inspection reports" },
  { href: "/technicians",  label: "Technicians",  icon: Users,           description: "Field team" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-[248px] bg-surface border-r border-border shrink-0">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/zones" className="flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-lg bg-brand grid place-items-center shadow-sm transition-transform group-hover:scale-105">
            <Waves size={18} className="text-white" strokeWidth={2.4} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              AWS QC Pipeline
            </span>
            <span className="text-[13px] font-semibold text-text">
              Analyst Console
            </span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary px-3 mb-2">
          Workspace
        </p>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg",
                "text-[14px] font-medium transition-all duration-180 ease-in-out",
                active
                  ? "bg-brand-soft text-brand"
                  : "text-text-secondary hover:text-text hover:bg-surface-muted"
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-2 bottom-2 w-0.75 rounded-r-full bg-brand",
                  "transition-[transform,opacity] duration-200 ease-out",
                  active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50"
                )}
                style={{ transformOrigin: "center" }}
              />
              <Icon
                size={17}
                strokeWidth={active ? 2.4 : 2}
                className={cn(
                  "transition-[color,stroke-width] duration-180",
                  active ? "text-brand" : "text-text-tertiary group-hover:text-text-secondary"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-border">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-1">
          System
        </p>
        <p className="font-mono tabular text-[11px] text-text-secondary">
          v0.3.0 · phase 3
        </p>
      </div>
    </aside>
  );
}
