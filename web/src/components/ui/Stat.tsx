import { ReactNode } from "react";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const TONE_DOT: Record<NonNullable<StatProps["tone"]>, string> = {
  neutral: "var(--text-tertiary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger:  "var(--danger)",
  info:    "var(--info)",
};

export function Stat({ label, value, hint, tone = "neutral", className }: StatProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ height: 6, width: 6, borderRadius: "50%", background: TONE_DOT[tone], flexShrink: 0 }} />
        <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1, marginTop: 4 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}
