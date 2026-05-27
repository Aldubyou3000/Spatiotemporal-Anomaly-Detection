import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const TONE_DOT: Record<NonNullable<StatProps["tone"]>, string> = {
  neutral: "bg-text-tertiary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Stat({ label, value, hint, tone = "neutral", className }: StatProps) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-xl px-5 py-4",
        "flex flex-col gap-1.5",
        className
      )}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          {label}
        </span>
      </div>
      <div className="font-mono tabular text-[28px] font-semibold tracking-tight text-text leading-none mt-1">
        {value}
      </div>
      {hint && (
        <div className="text-[12px] text-text-secondary mt-0.5">{hint}</div>
      )}
    </div>
  );
}
