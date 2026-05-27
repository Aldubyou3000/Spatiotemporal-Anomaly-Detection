import { forwardRef, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-pressed shadow-sm",
  secondary:
    "bg-surface text-text border border-border-strong hover:bg-surface-muted disabled:opacity-50",
  ghost:
    "bg-transparent text-text-secondary hover:text-text hover:bg-surface-muted disabled:opacity-50",
  danger:
    "bg-danger text-white hover:opacity-90 disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-6 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
        "transition-[background-color,color,box-shadow,opacity,transform] duration-180 ease-in-out",
        "disabled:cursor-not-allowed",
        // When loading: keep full color, no press scale
        // When disabled (not loading): dim
        loading
          ? "cursor-not-allowed"
          : "active:scale-[0.97]",
        disabled && !loading && "opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading && (
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent animate-spin shrink-0" />
      )}
      {children}
    </button>
  );
});
