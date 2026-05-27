"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function Header({ title, description, actions }: HeaderProps) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const initials = (user?.full_name || user?.username || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-lg border-b border-border">
      <div className="px-8 py-5 flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[24px] font-semibold tracking-tight text-text truncate">
              {title}
            </h1>
            <Badge tone="brand" dot>Live</Badge>
          </div>
          {description && (
            <p className="text-[13px] text-text-secondary mt-1 truncate">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {actions}
          <ThemeToggle />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={cn(
                "flex items-center gap-2.5 pl-1 pr-3 h-10 rounded-full",
                "border border-border-strong bg-surface hover:bg-surface-muted",
                "transition-colors"
              )}
            >
              <span className="h-8 w-8 rounded-full bg-brand grid place-items-center text-white text-[12px] font-semibold">
                {initials}
              </span>
              <div className="flex flex-col leading-tight text-left">
                <span className="text-[12px] font-semibold text-text max-w-[120px] truncate">
                  {user?.full_name || user?.username || "Loading…"}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  {user?.role || "—"}
                </span>
              </div>
              <ChevronDown
                size={14}
                strokeWidth={2.2}
                className={cn(
                  "text-text-tertiary transition-transform",
                  menuOpen && "rotate-180"
                )}
              />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-xl p-1.5 animate-scale-in origin-top-right"
                style={{ boxShadow: "var(--shadow-lg)" }}
              >
                <div className="px-3 py-2.5 border-b border-border mb-1.5">
                  <p className="text-[13px] font-semibold text-text truncate">
                    {user?.full_name || "—"}
                  </p>
                  <p className="text-[11px] text-text-secondary truncate">
                    {user?.email}
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-text-secondary cursor-not-allowed opacity-60"
                >
                  <User size={14} strokeWidth={2.2} />
                  Profile (coming soon)
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-danger hover:bg-danger-soft transition-colors"
                >
                  <LogOut size={14} strokeWidth={2.2} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
