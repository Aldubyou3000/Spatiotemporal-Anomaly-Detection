import { forwardRef, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, children, style, ...rest },
  ref
) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: "var(--r-md)",
    fontWeight: 500,
    border: "1px solid transparent",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled && !loading ? 0.5 : 1,
    transition: "color 0.12s ease, background-color 0.12s ease, border-color 0.12s ease, opacity 0.12s ease",
    whiteSpace: "nowrap",
    pointerEvents: disabled || loading ? "none" : undefined,
    fontFamily: "inherit",
    fontSize: "var(--font-sm)",
  };

  const sizeStyles: Record<Size, React.CSSProperties> = {
    sm:      { height: "var(--control-h-sm)", padding: "0 10px", fontSize: "var(--font-sm)" },
    md:      { height: "var(--control-h)", padding: "0 12px" },
    lg:      { height: "var(--control-h-lg)", padding: "0 16px", fontSize: "var(--font-base)" },
    "icon":    { height: "var(--control-h)", width: "var(--control-h)", padding: 0 },
    "icon-sm": { height: "var(--control-h-sm)", width: "var(--control-h-sm)", padding: 0 },
  };

  const variantStyles: Record<Variant, React.CSSProperties> = {
    primary: {
      background: "var(--brand)",
      color: "var(--brand-fg)",
      borderColor: "var(--brand)",
      boxShadow: "none",
    },
    secondary: {
      background: "var(--surface)",
      color: "var(--text)",
      borderColor: "var(--border)",
      boxShadow: "var(--shadow-xs)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-secondary)",
      borderColor: "transparent",
      boxShadow: "none",
    },
    danger: {
      background: "var(--danger)",
      color: "#ffffff",
      borderColor: "var(--danger)",
      boxShadow: "var(--shadow-xs)",
    },
  };

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(className)}
      style={{ ...base, ...sizeStyles[size], ...variantStyles[variant], ...style }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        if (variant === "primary") { el.style.background = "var(--brand-hover)"; el.style.borderColor = "var(--brand-hover)"; }
        if (variant === "secondary") el.style.background = "var(--surface-sunken)";
        if (variant === "ghost") { el.style.background = "var(--surface-sunken)"; el.style.color = "var(--text)"; }
        if (variant === "danger") el.style.filter = "brightness(0.92)";
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        if (variant === "primary") { el.style.background = "var(--brand)"; el.style.borderColor = "var(--brand)"; }
        if (variant === "secondary") el.style.background = "var(--surface)";
        if (variant === "ghost") { el.style.background = "transparent"; el.style.color = "var(--text-secondary)"; }
        if (variant === "danger") el.style.filter = "";
        rest.onMouseLeave?.(e);
      }}
      {...rest}
    >
      {loading && <span aria-hidden={true} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid currentColor", borderRightColor: "transparent", animation: "spin 700ms linear infinite" }} />
      </span>}
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "inherit", gap: "inherit", minWidth: 0, opacity: loading ? 0 : 1 }}>{children}</span>
    </button>
  );
});
