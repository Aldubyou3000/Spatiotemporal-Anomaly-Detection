"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, LogOut, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TEXT_SIZES = [
  { label: "S",  base: "13px", sm: "12px",   xs: "11px",   md: "12px", lg: "14px", xl: "17px", metric: "14px" },
  { label: "M",  base: "15px", sm: "14px",   xs: "12.5px", md: "14px", lg: "16px", xl: "20px", metric: "16px" },
  { label: "L",  base: "16px", sm: "15px",   xs: "13px",   md: "15px", lg: "17px", xl: "22px", metric: "18px" },
  { label: "XL", base: "18px", sm: "17px",   xs: "14px",   md: "17px", lg: "19px", xl: "25px", metric: "20px" },
] as const;
type SizeIdx = 0 | 1 | 2 | 3;

const SIZE_STORAGE_KEY = "ui-text-size";

interface HeaderProps {
  title: string;
  description?: string;
  live?: boolean;
  actions?: React.ReactNode;
  hideHeading?: boolean;
}

export function Header({ title, description, live, actions, hideHeading }: HeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [sizeIdx, setSizeIdx] = useState<SizeIdx>(1);

  function applySize(idx: SizeIdx, persist = true) {
    const s = TEXT_SIZES[idx];
    const root = document.documentElement;
    root.style.setProperty("--font-base",   s.base);
    root.style.setProperty("--font-sm",     s.sm);
    root.style.setProperty("--font-xs",     s.xs);
    root.style.setProperty("--font-md",     s.md);
    root.style.setProperty("--font-lg",     s.lg);
    root.style.setProperty("--font-xl",     s.xl);
    root.style.setProperty("--font-metric", s.metric);
    setSizeIdx(idx);
    if (persist) localStorage.setItem(SIZE_STORAGE_KEY, String(idx));
  }

  // Re-apply the saved text size on mount so the choice persists across page
  // navigation and reloads — keeping every tab consistent. Runs once.
  useEffect(() => {
    const stored = Number(localStorage.getItem(SIZE_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 0 && stored < TEXT_SIZES.length) {
      applySize(stored as SizeIdx, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <>
      {/* ── Compact sticky topbar ── */}
      <header
        style={{
          height: "var(--topbar-h)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-overlay)",
          backdropFilter: "saturate(180%) blur(8px)",
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 1000,
          flexShrink: 0,
        }}
      >
        {/* Breadcrumb — fills left */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-sm)", color: "var(--text-muted)", minWidth: 0 }}>
          <span>Workspace</span>
          <ChevronRight size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        </div>

        {/* Right side controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Text size picker */}
          <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
            {TEXT_SIZES.map((s, i) => {
              const active = sizeIdx === i;
              return (
                <button
                  key={s.label}
                  onClick={() => applySize(i as SizeIdx)}
                  aria-label={`Text size ${s.label}`}
                  aria-pressed={active}
                  style={{
                    width: 28, height: 28,
                    border: 0,
                    borderRight: i < TEXT_SIZES.length - 1 ? "1px solid var(--border)" : undefined,
                    background: active ? "var(--surface-sunken)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    fontSize: 11 + i,
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    transition: "background var(--duration-fast) var(--ease-std), color var(--duration-fast) var(--ease-std)",
                    display: "grid", placeItems: "center",
                  }}
                >
                  A
                </button>
              );
            })}
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="topbar-btn"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          {/* User chip */}
          <div style={{ position: "relative" }} ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="user-chip"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <div style={{
                width: 26, height: 26, borderRadius: "var(--r-full)",
                background: "var(--brand)", color: "var(--brand-fg)",
                display: "grid", placeItems: "center",
                fontSize: "var(--font-xs)", fontWeight: 700, flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ lineHeight: 1.25, textAlign: "left" }}>
                <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>
                  {user?.full_name || user?.username || "Analyst"}
                </div>
                <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
                  PAGASA · {user?.role || "analyst"}
                </div>
              </div>
              <ChevronDown
                size={12}
                style={{
                  color: "var(--text-muted)",
                  transition: "transform var(--duration-fast) var(--ease-std)",
                  transform: menuOpen ? "rotate(180deg)" : "none",
                }}
              />
            </button>

            {menuOpen && (
              <div
                className="animate-scale-in"
                role="menu"
                style={{
                  position: "absolute", right: 0, top: "calc(100% + 8px)", width: 220,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-xl)", padding: "6px",
                  boxShadow: "var(--shadow-lg)", zIndex: 50, transformOrigin: "top right",
                }}
              >
                <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--divider)", marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>
                    {user?.full_name || "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                    {user?.email}
                  </p>
                </div>
                <button
                  disabled
                  className="menu-item menu-item--disabled"
                  role="menuitem"
                >
                  <User size={14} style={{ flexShrink: 0 }} />
                  Profile (coming soon)
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setConfirmLogout(true); }}
                  className="menu-item menu-item--danger"
                  role="menuitem"
                >
                  <LogOut size={14} style={{ flexShrink: 0 }} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Page heading block ── */}
      {!hideHeading && <div
        style={{
          padding: "20px 28px 16px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexShrink: 0,
          borderBottom: "1px solid var(--divider)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {/* Title + Live badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              color: "var(--text)",
              lineHeight: 1.15,
            }}>
              {title}
            </h1>
            {live && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                height: 20, padding: "0 8px",
                borderRadius: "var(--r-full)",
                background: "color-mix(in oklab, var(--success) 12%, transparent)",
                border: "1px solid color-mix(in oklab, var(--success) 28%, transparent)",
                fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--success)",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--success)",
                  animation: "live-pulse 2s ease-out infinite",
                  flexShrink: 0,
                }} />
                Live
              </span>
            )}
          </div>

          {description && (
            <p style={{ margin: 0, fontSize: "var(--font-base)", color: "var(--text-muted)", lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>

        {/* Page-level actions */}
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, alignSelf: "center" }}>
            {actions}
          </div>
        )}
      </div>}

      {confirmLogout && (
        <ConfirmDialog
          title="Sign out?"
          message="You'll be returned to the login screen. Any unsaved pipeline results will be lost."
          confirmLabel="Sign out"
          onConfirm={logout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </>
  );
}
