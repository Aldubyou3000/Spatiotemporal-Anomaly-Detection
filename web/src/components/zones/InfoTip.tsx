"use client";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
export function InfoTip({ text, label = "More information" }: { text: string; label?: string }) {
  const id = useId();
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  function showTip(target: HTMLSpanElement) {
    const r = target.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  const tip = (() => {
    if (!pos || typeof document === "undefined" || typeof window === "undefined") return null;
    const W = 280;
    const half = W / 2;
    const margin = 10;
    const minLeft = margin + half;
    const maxLeft = window.innerWidth - margin - half;
    const left = Math.max(minLeft, Math.min(pos.x, maxLeft));
    const estH = 260;
    const showBelow = pos.y < estH + 12 && window.innerHeight - pos.y - pos.h > pos.y;
    const top = showBelow ? pos.y + pos.h + 8 : pos.y - 8;
    const transform = showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)";
    return createPortal(
      <span
        id={id}
        role="tooltip"
        style={{
          position: "fixed",
          left,
          top,
          transform,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "8px 12px",
          fontSize: "var(--font-sm)",
          fontWeight: 400,
          color: "var(--text)",
          lineHeight: 1.6,
          whiteSpace: "normal",
          width: W,
          maxWidth: `calc(100vw - ${margin * 2}px)`,
          boxShadow: "var(--shadow-lg)",
          zIndex: 9999,
          pointerEvents: "none",
          letterSpacing: "0.01em",
        }}
      >
        {text}
      </span>,
      document.body,
    );
  })();
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={pos ? id : undefined}
      style={{ display: "inline-flex", alignItems: "center" }}
      onMouseEnter={(event) => showTip(event.currentTarget)}
      onMouseLeave={(event) => { if (document.activeElement !== event.currentTarget) setPos(null); }}
      onFocus={(event) => showTip(event.currentTarget)}
      onBlur={() => setPos(null)}
      onClick={(event) => showTip(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setPos(null);
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showTip(event.currentTarget); }
      }}
    >
      <HelpCircle size={13} strokeWidth={2} style={{ color: "var(--text-tertiary)", cursor: "help", flexShrink: 0 }} />
      {tip}
    </span>
  );
}
