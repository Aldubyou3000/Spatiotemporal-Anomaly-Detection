import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

const TONES: Record<Tone, { bg: string; text: string; dot: string }> = {
  neutral: { bg: "bg-surface-muted", text: "text-text-secondary", dot: "bg-text-tertiary" },
  brand:   { bg: "bg-brand-soft",    text: "text-brand",          dot: "bg-brand" },
  success: { bg: "bg-success-soft",  text: "text-success",        dot: "bg-success" },
  warning: { bg: "bg-warning-soft",  text: "text-warning",        dot: "bg-warning" },
  danger:  { bg: "bg-danger-soft",   text: "text-danger",         dot: "bg-danger" },
  info:    { bg: "bg-info-soft",     text: "text-info",           dot: "bg-info" },
};

export function Badge({ tone = "neutral", dot, className, children, ...rest }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full",
        "text-[11px] font-semibold uppercase tracking-[0.06em]",
        t.bg,
        t.text,
        className
      )}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />}
      {children}
    </span>
  );
}
