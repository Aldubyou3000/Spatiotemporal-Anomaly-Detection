import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, style, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  const descId = inputId ? `${inputId}-desc` : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-secondary)",
          }}
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-describedby={(hint || error) ? descId : undefined}
        aria-invalid={error ? true : undefined}
        className={cn(className)}
        style={{
          width: "100%",
          height: 34,
          padding: "0 12px",
          borderRadius: "var(--r-md)",
          border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: "var(--font-sm)",
          outline: "none",
          boxShadow: "var(--shadow-xs)",
          transition: "border-color 0.12s ease, box-shadow 0.12s ease",
          fontFamily: "inherit",
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--brand)";
          e.currentTarget.style.boxShadow = error ? "0 0 0 4px rgba(220,38,38,0.12)" : "var(--shadow-focus)";
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--border)";
          e.currentTarget.style.boxShadow = "var(--shadow-xs)";
          rest.onBlur?.(e);
        }}
        {...rest}
      />
      {hint && !error && (
        <p id={descId} style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{hint}</p>
      )}
      {error && (
        <p id={descId} style={{ margin: 0, fontSize: 11, color: "var(--danger)" }}>{error}</p>
      )}
    </div>
  );
});
