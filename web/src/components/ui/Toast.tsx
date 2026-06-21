"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
  /** Internal — drives the exit animation before removal. */
  state: "open" | "closing";
}

interface ToastOptions {
  description?: string;
  /** Auto-dismiss delay in ms. Defaults to 4000; errors default to 6000. */
  duration?: number;
}

interface ToastApi {
  success: (title: string, opts?: ToastOptions) => void;
  error: (title: string, opts?: ToastOptions) => void;
  info: (title: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// ─── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Fire a transient confirmation/notification toast.
 *
 *   const toast = useToast();
 *   toast.success("Technician created", { description: `${name} can now sign in.` });
 *   toast.error("Failed to save", { description: err.message });
 *
 * Safe to call outside the provider (no-op fallback) so components don't crash
 * if they're rendered in isolation, but in the dashboard it always resolves.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("useToast called outside <ToastProvider> — toast is a no-op.");
    }
    return { success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────────────

const VARIANT_META: Record<ToastVariant, { color: string; soft: string; icon: React.ReactNode }> = {
  success: { color: "var(--success)", soft: "var(--success-soft)", icon: <CheckCircle2 size={17} strokeWidth={2.2} /> },
  error:   { color: "var(--danger)",  soft: "var(--danger-soft)",  icon: <AlertTriangle size={16} strokeWidth={2.2} /> },
  info:    { color: "var(--info)",    soft: "var(--info-soft)",    icon: <Info size={16} strokeWidth={2.2} /> },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Portal only after mount: the server renders no viewport, so the FIRST client
  // render must also render none or hydration mismatches (a `typeof document`
  // branch diverges server↔client). After mount we portal into document.body.
  const [mounted, setMounted] = useState(false);
  const counter = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { setMounted(true); }, []);

  const remove = useCallback((id: number) => {
    // Animate out, then drop from state.
    setToasts((cur) => cur.map((t) => (t.id === id ? { ...t, state: "closing" } : t)));
    const exit = setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, 170);
    timers.current.set(id, exit);
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, opts?: ToastOptions) => {
      const id = ++counter.current;
      const duration = opts?.duration ?? (variant === "error" ? 6000 : 4000);
      setToasts((cur) => [...cur, { id, variant, title, description: opts?.description, state: "open" }]);
      const t = setTimeout(() => remove(id), duration);
      timers.current.set(id, t);
    },
    [remove],
  );

  // Clear any pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach(clearTimeout); map.clear(); };
  }, []);

  const api: ToastApi = {
    success: (title, opts) => push("success", title, opts),
    error: (title, opts) => push("error", title, opts),
    info: (title, opts) => push("info", title, opts),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div className="toast-viewport" role="region" aria-label="Notifications">
            {toasts.map((t) => {
              const meta = VARIANT_META[t.variant];
              return (
                <div
                  key={t.id}
                  className="toast"
                  data-state={t.state}
                  role={t.variant === "error" ? "alert" : "status"}
                  aria-live={t.variant === "error" ? "assertive" : "polite"}
                >
                  <span
                    style={{
                      width: 28, height: 28, borderRadius: "var(--r-md)", flexShrink: 0,
                      display: "grid", placeItems: "center",
                      background: meta.soft, color: meta.color, marginTop: 1,
                    }}
                  >
                    {meta.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                      {t.title}
                    </p>
                    {t.description && (
                      <p style={{ margin: "2px 0 0", fontSize: "var(--font-xs)", color: "var(--text-muted)", lineHeight: 1.45 }}>
                        {t.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    aria-label="Dismiss notification"
                    style={{
                      width: 22, height: 22, borderRadius: "var(--r-sm)", border: 0, flexShrink: 0,
                      background: "transparent", color: "var(--text-muted)", cursor: "pointer",
                      display: "grid", placeItems: "center",
                      transition: "background var(--duration-fast), color var(--duration-fast)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <X size={13} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
