"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  PanelLeftClose, PanelLeftOpen, ShieldCheck, Ticket, Users,
} from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { SentinelMark } from "@/components/ui/SentinelMark";


interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  count?: number;
}

// Portalled tooltip — escapes overflow:hidden and any stacking context
function SideTooltip({ label, anchor }: { label: string; anchor: DOMRect | null }) {
  if (!anchor) return null;
  const y = anchor.top + anchor.height / 2;
  const x = anchor.right + 8;
  return createPortal(
    <span style={{
      position: "fixed", left: x, top: y,
      transform: "translateY(-50%)",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--r-md)",
      padding: "4px 10px",
      fontSize: "var(--font-xs)", fontWeight: 500,
      color: "var(--text)",
      whiteSpace: "nowrap",
      boxShadow: "var(--shadow-lg)",
      zIndex: 9999, pointerEvents: "none",
      letterSpacing: "0.01em",
    }}>
      {label}
    </span>,
    document.body,
  );
}

function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  return (
    <div
      ref={ref}
      onMouseEnter={() => ref.current && setAnchor(ref.current.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      {children}
      <SideTooltip label={label} anchor={anchor} />
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { pending } = useReports();
  const [collapsed, setCollapsed] = useState(false);

  // Sync from localStorage after mount only — avoids SSR/client hydration mismatch
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const pendingCount = pending.length || undefined;

  const nav: NavItem[] = [
    { href: "/zones",       label: "Zones",       icon: Activity },
    { href: "/tickets",     label: "Tickets",     icon: Ticket, count: pendingCount },
    { href: "/technicians", label: "Technicians", icon: Users },
    { href: "/audit",       label: "Audit Log",   icon: ShieldCheck },
  ];

  const W = collapsed ? 52 : 248;

  // Shared icon button style for collapsed state
  function iconBtn(active = false): React.CSSProperties {
    return {
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 36, height: 36, margin: "0 auto",
      borderRadius: "var(--r-md)",
      background: active ? "var(--brand-soft)" : "transparent",
      border: 0, cursor: "pointer",
      transition: "background 0.12s ease",
      color: active ? "var(--brand)" : "var(--text-muted)",
      flexShrink: 0,
    };
  }

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 sticky top-0 h-screen"
      style={{
        width: W, minWidth: W,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        transition: "width 0.2s ease, min-width 0.2s ease",
        overflow: "hidden",
        zIndex: 20,
      }}
    >
      {collapsed ? (
        /* ── Collapsed layout ── */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", padding: "12px 0", gap: 2 }}>

          {/* Brand icon — CSS geometric mark (white bg blue shapes) */}
          <NavTooltip label="AWS Sentinel — Anomaly Detector">
            <div style={{
              width: 36, height: 28, flexShrink: 0,
              display: "grid", placeItems: "center",
              color: "var(--brand)",
              marginBottom: 10,
            }}>
              <SentinelMark size={32} />
            </div>
          </NavTooltip>

          {/* Expand toggle — TOP, right under brand */}
          <NavTooltip label="Expand sidebar">
            <button
              onClick={() => setCollapsed(false)}
              style={iconBtn()}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <PanelLeftOpen size={16} strokeWidth={1.8} />
            </button>
          </NavTooltip>

          {/* Divider */}
          <div style={{ width: 28, height: 1, background: "var(--divider)", margin: "6px 0" }} />

          {/* Nav icons */}
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <NavTooltip key={item.href} label={item.count != null ? `${item.label} (${item.count})` : item.label}>
                <div style={{ position: "relative" }}>
                  <Link
                    href={item.href}
                    style={{
                      ...iconBtn(active),
                      textDecoration: "none",
                      color: active ? "var(--brand)" : "var(--text-muted)",
                    }}
                    onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; } }}
                    onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; } }}
                  >
                    <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  </Link>
                  {item.count != null && (
                    <span style={{
                      position: "absolute", top: 3, right: 3,
                      width: 8, height: 8, borderRadius: 999,
                      background: "var(--danger)",
                      pointerEvents: "none",
                    }} />
                  )}
                </div>
              </NavTooltip>
            );
          })}


        </div>
      ) : (
        /* ── Expanded layout ── */
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px 12px", gap: 4 }}>

          {/* Brand row — geometric mark + wordmark (logo.html geometry, Geist type) */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 6px 16px 6px",
            borderBottom: "1px solid var(--divider)",
            marginBottom: 8,
            minWidth: 0,
          }}>
            <div style={{
              flexShrink: 0,
              display: "grid", placeItems: "center",
              color: "var(--brand)",
            }}>
              <SentinelMark size={40} />
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 3, lineHeight: 1 }}>
              <div style={{
                fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
                fontSize: "15.5px", fontWeight: 800, letterSpacing: "-0.02em",
                color: "var(--text)", textTransform: "none",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                lineHeight: 1,
                fontFeatureSettings: '"ss01", "cv01"',
              }}>
                AWS Sentinel
              </div>
              <div style={{
                fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
                fontSize: "9px", fontWeight: 600, letterSpacing: "0.13em",
                color: "var(--text-muted)", textTransform: "uppercase",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                marginRight: "-0.13em",
                lineHeight: 1,
              }}>
                ANOMALY DETECTOR
              </div>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              style={{ ...iconBtn(), width: 28, height: 28, flexShrink: 0, marginLeft: 2 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <PanelLeftClose size={14} strokeWidth={1.8} />
            </button>
          </div>

          {/* Section label */}
          <span style={{
            fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em",
            color: "var(--text-tertiary)", textTransform: "uppercase",
            padding: "4px 10px 6px",
          }}>
            Workspace
          </span>

          {/* Nav items */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", height: 38,
                    borderRadius: "var(--r-md)",
                    fontSize: "var(--font-base)", fontWeight: 500,
                    textDecoration: "none",
                    transition: "background 0.12s ease, color 0.12s ease",
                    background: active ? "var(--brand-soft)" : "transparent",
                    color: active ? "var(--on-brand-soft)" : "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; } }}
                  onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; } }}
                >
                  <span style={{ color: active ? "var(--brand)" : "var(--text-muted)", flexShrink: 0, display: "flex" }}>
                    <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.count != null && (
                    <span style={{
                      fontSize: "var(--font-xs)", fontWeight: 500,
                      color: "#fff",
                      background: "var(--danger)",
                      padding: "1px 6px", borderRadius: "var(--r-full)",
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 18, textAlign: "center",
                    }}>
                      {item.count > 99 ? "99+" : item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>


        </div>
      )}
    </aside>
  );
}
