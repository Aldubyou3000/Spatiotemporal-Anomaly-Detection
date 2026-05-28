"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, LogOut, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

const TEXT_SIZES = [
  { label: "S", base: "13px", sm: "12px",   xs: "11px"   },
  { label: "M", base: "15px", sm: "14px",   xs: "12.5px" },
  { label: "L", base: "16px", sm: "15px",   xs: "13px"   },
] as const;
type SizeIdx = 0 | 1 | 2;

interface HeaderProps {
  title: string;
  description?: string;
  live?: boolean;
  actions?: React.ReactNode;
}

export function Header({ title, description, live, actions }: HeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [sizeIdx, setSizeIdx] = useState<SizeIdx>(1);

  function applySize(idx: SizeIdx) {
    const s = TEXT_SIZES[idx];
    const root = document.documentElement;
    root.style.setProperty("--font-base", s.base);
    root.style.setProperty("--font-sm",   s.sm);
    root.style.setProperty("--font-xs",   s.xs);
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
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-overlay)",
          backdropFilter: "saturate(180%) blur(8px)",
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 30,
          flexShrink: 0,
        }}
      >
        {/* Breadcrumb — fills left */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-sm)", color: "var(--text-muted)", minWidth: 0 }}>
          <span>Workspace</span>
          <ChevronRight size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        </div>

        {/* Right side */}
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
                  style={{
                    width: 28, height: 28,
                    border: 0,
                    borderRight: i < TEXT_SIZES.length - 1 ? "1px solid var(--border)" : undefined,
                    background: active ? "var(--surface-sunken)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    fontSize: 11 + i,
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                    display: "grid", placeItems: "center",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  A
                </button>
              );
            })}
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            style={{
              width: 30, height: 30,
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              display: "grid", placeItems: "center",
              cursor: "pointer",
              transition: "all 0.12s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          {/* User chip */}
          <div style={{ position: "relative" }} ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 10px 4px 4px",
                border: "1px solid var(--border)", borderRadius: "var(--r-full)",
                background: "transparent", cursor: "pointer",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{ width: 26, height: 26, borderRadius: "var(--r-full)", background: "var(--brand)", color: "var(--brand-fg)", display: "grid", placeItems: "center", fontSize: "var(--font-xs)", fontWeight: 700, flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ lineHeight: 1.25, textAlign: "left" }}>
                <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>{user?.full_name || user?.username || "Analyst"}</div>
                <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>PAGASA · {user?.role || "analyst"}</div>
              </div>
              <ChevronDown size={12} style={{ color: "var(--text-muted)", transition: "transform 0.12s ease", transform: menuOpen ? "rotate(180deg)" : "none" }} />
            </button>

            {menuOpen && (
              <div
                className="animate-scale-in"
                style={{
                  position: "absolute", right: 0, top: "calc(100% + 8px)", width: 220,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-xl)", padding: "6px",
                  boxShadow: "var(--shadow-lg)", zIndex: 50, transformOrigin: "top right",
                }}
              >
                <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--divider)", marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>{user?.full_name || "—"}</p>
                  <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 2 }}>{user?.email}</p>
                </div>
                <button disabled style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: "var(--r-md)", fontSize: "var(--font-sm)", color: "var(--text-muted)", background: "transparent", border: 0, cursor: "not-allowed", opacity: 0.5, textAlign: "left", fontFamily: "inherit" }}>
                  <User size={14} style={{ flexShrink: 0 }} />
                  Profile (coming soon)
                </button>
                <button
                  onClick={logout}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: "var(--r-md)", fontSize: "var(--font-sm)", color: "var(--danger)", background: "transparent", border: 0, cursor: "pointer", transition: "background 0.12s ease", textAlign: "left", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--danger-soft)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <LogOut size={14} style={{ flexShrink: 0 }} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Page heading block (inside scroll area) ── */}
      <div
        style={{
          padding: "20px 28px 16px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {/* Breadcrumb repeat (Claude Design shows this in the page area too) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
            <span>Workspace</span>
            <ChevronRight size={11} style={{ color: "var(--text-tertiary)" }} />
            <span style={{ color: "var(--text-secondary)" }}>{title}</span>
          </div>

          {/* Title + Live */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", color: "var(--text)", lineHeight: 1.15 }}>
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
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", animation: "live-pulse 2s ease-out infinite", flexShrink: 0 }} />
                Live
              </span>
            )}
          </div>

          {description && (
            <p style={{ margin: 0, fontSize: "var(--font-base)", color: "var(--text-muted)" }}>{description}</p>
          )}
        </div>

        {/* Page-level actions — aligned to the title row */}
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, alignSelf: "flex-end", paddingBottom: description ? 2 : 0 }}>
            {actions}
          </div>
        )}
      </div>
    </>
  );
}
