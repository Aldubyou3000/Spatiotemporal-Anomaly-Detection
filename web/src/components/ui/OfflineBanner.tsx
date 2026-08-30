"use client";

import { useOnline } from "@/hooks/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "6px 12px",
        background: "color-mix(in oklab, var(--warning) 14%, var(--surface))",
        borderBottom: "1px solid color-mix(in oklab, var(--warning) 22%, transparent)",
        color: "var(--text)",
        fontSize: "var(--font-xs)",
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: "var(--warning)",
          flexShrink: 0,
        }}
      />
      You’re offline — showing cached data. Changes will sync when you’re back online.
    </div>
  );
}
