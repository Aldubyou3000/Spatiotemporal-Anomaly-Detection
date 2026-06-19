"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
  /** Shown in the header */
  title: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Width of the card. Defaults to min(480px, 90vw) */
  width?: number | string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional right-side element in the header (e.g. a status badge) */
  headerRight?: React.ReactNode;
}

export function Modal({
  title,
  subtitle,
  width = "min(480px, 90vw)",
  onClose,
  children,
  headerRight,
}: ModalProps) {
  // Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(10, 13, 18, 0.45)",
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{
          width,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2xl)",
          boxShadow: "var(--shadow-xl)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "18px 24px 14px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <h3
              id="modal-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                color: "var(--text)",
                lineHeight: 1.2,
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p style={{
                margin: "4px 0 0",
                fontSize: 14,
                color: "var(--text-muted)",
                lineHeight: 1.4,
              }}>
                {subtitle}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--r-md)",
                border: 0,
                background: "transparent",
                color: "var(--text-muted)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background var(--duration-fast) var(--ease-std), color var(--duration-fast) var(--ease-std)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Body — children go here */}
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

// ─── Modal.Footer ────────────────────────────────────────────────────────────
// Standardised footer with sunken background and right-aligned buttons.

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "14px 24px",
      borderTop: "1px solid var(--divider)",
      background: "var(--surface-alt)",
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
    }}>
      {children}
    </div>
  );
}
