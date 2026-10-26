"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TEXT_SIZES = [
  { label: "S", base: "1rem", sm: "1rem", xs: ".875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem", metric: "1.75rem" },
  { label: "M", base: "1rem", sm: "1rem", xs: ".875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem", metric: "1.75rem" },
  { label: "L", base: "1.125rem", sm: "1.125rem", xs: "1rem", md: "1.125rem", lg: "1.25rem", xl: "1.5rem", metric: "2rem" },
  { label: "XL", base: "1.25rem", sm: "1.25rem", xs: "1.125rem", md: "1.25rem", lg: "1.5rem", xl: "1.75rem", metric: "2.25rem" },
] as const;
type SizeIdx = 0 | 1 | 2 | 3;

// ── FOR FUTURE AI MODELS / DEVS ─────────────────────────────────────────────
// The text-size picker below is TEMPORARILY HIDDEN because it was buggy
// (reported 2026-08-21). It is gated behind SHOW_TEXT_SIZE_PICKER so the code
// stays type-checked and can be restored by flipping the flag to `true`.
// While hidden, the UI is pinned to "M": the root font tokens in
// `web/src/app/globals.css` (:root block) equal M, and sizeIdx initialises to
// 1 (M). localStorage persistence for text size was already removed — do not
// reintroduce it without fixing the original bug first.
const SHOW_TEXT_SIZE_PICKER = false;

interface HeaderProps {
  title: string;
  background?: string;
  leading?: React.ReactNode;
  parent?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Header({ title, actions, leading, parent = "Workspace", background = "var(--bg)" }: HeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [sizeIdx, setSizeIdx] = useState<SizeIdx>(1);

  function applySize(idx: SizeIdx) {
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
  }

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
          background,
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: leading ? "var(--space-2)" : "var(--space-4)",
          position: "sticky",
          top: 0,
          zIndex: 1000,
          flexShrink: 0,
        }}
      >
        {leading && <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{leading}</div>}
        {/* Breadcrumb — fills left */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-sm)", color: "var(--text-muted)", minWidth: 0 }}>
          <span style={{ flexShrink: 0 }}>{parent}</span>
          <ChevronRight size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <h1 title={title} aria-current="page" style={{ margin: 0, fontSize: "inherit", fontWeight: "inherit", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h1>
        </div>

        {/* Right side controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {actions}
          {/* Text size picker — hidden behind SHOW_TEXT_SIZE_PICKER (see comment above) */}
          {SHOW_TEXT_SIZE_PICKER && (
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
                      width: 30, height: 30,
                      border: 0,
                      borderRight: i < TEXT_SIZES.length - 1 ? "1px solid var(--border)" : undefined,
                      background: active ? "var(--surface-sunken)" : "transparent",
                      color: active ? "var(--text)" : "var(--text-muted)",
                      fontSize: "var(--font-base)",
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                      transition: "background var(--duration-fast) var(--ease-std), color var(--duration-fast) var(--ease-std)",
                      display: "grid", placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    A
                  </button>
                );
              })}
            </div>
          )}

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
              style={{ maxWidth: 180 }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: "var(--r-full)",
                background: "var(--brand)", color: "var(--brand-fg)",
                display: "grid", placeItems: "center",
                fontSize: "var(--font-xs)", fontWeight: 700, flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ lineHeight: 1.25, textAlign: "left", minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.full_name || user?.username || "Analyst"}
                </div>
                <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  PAGASA · {user?.role || "analyst"}
                </div>
              </div>
              <ChevronDown
                size={12}
                style={{
                  color: "var(--text-muted)",
                  transition: "transform var(--duration-fast) var(--ease-std)",
                  transform: menuOpen ? "rotate(180deg)" : "none",
                  flexShrink: 0,
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
                <div style={{ padding: "8px 10px 10px", marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>
                    {user?.full_name || "—"}
                  </p>
                  <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                    {user?.email}
                  </p>
                </div>
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

      {confirmLogout && (
        <ConfirmDialog
          title="Sign out?"
          message="You'll be returned to the login screen. Any unsaved process results will be lost."
          confirmLabel="Sign out"
          onConfirm={logout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </>
  );
}
