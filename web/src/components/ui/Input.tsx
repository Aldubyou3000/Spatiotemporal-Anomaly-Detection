import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "h-11 px-3.5 rounded-lg bg-surface-alt text-text text-[14px]",
          "border border-border-strong",
          "placeholder:text-text-tertiary",
          "transition-[border-color,box-shadow] duration-150",
          "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-danger focus:border-danger focus:ring-danger-soft",
          className
        )}
        {...rest}
      />
      {hint && !error && (
        <p className="text-[12px] text-text-tertiary">{hint}</p>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
});
