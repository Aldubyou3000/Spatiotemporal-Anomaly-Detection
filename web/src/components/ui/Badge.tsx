import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "accent" | "teal";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  size?: "sm" | "md";
}

const TONES: Record<Tone, { bg: string; color: string }> = {
  neutral: { bg: "var(--surface-sunken)",  color: "var(--text-secondary)" },
  brand:   { bg: "var(--brand-soft)",      color: "var(--on-brand-soft)" },
  success: { bg: "var(--success-soft)",    color: "var(--success-on)" },
  warning: { bg: "var(--warning-soft)",    color: "var(--warning-on)" },
  danger:  { bg: "var(--danger-soft)",     color: "var(--danger-on)" },
  info:    { bg: "var(--info-soft)",       color: "var(--info-on)" },
  accent:  { bg: "var(--accent-soft)",     color: "var(--accent-on)" },
  teal:    { bg: "var(--teal-soft)",       color: "var(--teal-on)" },
};

export function Badge({ tone = "neutral", dot, size = "sm", className, style, children, ...rest }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={cn(className)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: size === "md" ? 22 : 20,
        padding: size === "md" ? "0 8px" : "0 7px",
        borderRadius: "var(--r-sm)",
        fontSize: size === "md" ? 11.5 : 11,
        fontWeight: 500,
        letterSpacing: "0.01em",
        background: t.bg,
        color: t.color,
        border: "1px solid transparent",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "var(--r-full)",
            background: "currentColor",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
