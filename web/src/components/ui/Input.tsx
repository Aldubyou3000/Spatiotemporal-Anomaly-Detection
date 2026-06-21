import { forwardRef, InputHTMLAttributes, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Show a show/hide eye toggle. Only meaningful with type="password". */
  passwordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, id, style, passwordToggle, type, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  const descId = inputId ? `${inputId}-desc` : undefined;

  const [revealed, setRevealed] = useState(false);
  const isPasswordToggle = passwordToggle && type === "password";
  const resolvedType = isPasswordToggle ? (revealed ? "text" : "password") : type;

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
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          ref={ref}
          id={inputId}
          type={resolvedType}
          aria-describedby={(hint || error) ? descId : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(className)}
          style={{
            width: "100%",
            height: 34,
            padding: isPasswordToggle ? "0 38px 0 12px" : "0 12px",
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
        {isPasswordToggle && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            tabIndex={-1}
            style={{
              position: "absolute",
              right: 6,
              width: 26,
              height: 26,
              borderRadius: "var(--r-sm)",
              border: 0,
              background: "transparent",
              color: "var(--text-muted)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              transition: "background var(--duration-fast), color var(--duration-fast)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {revealed ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={descId} style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{hint}</p>
      )}
      {error && (
        <p id={descId} style={{ margin: 0, fontSize: 11, color: "var(--danger)" }}>{error}</p>
      )}
    </div>
  );
});
