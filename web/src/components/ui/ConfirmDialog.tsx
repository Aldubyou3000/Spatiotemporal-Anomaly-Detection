"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Swap confirm button to danger (red) color */
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDangerous = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Escape key closes
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  // Trap focus inside dialog
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(10, 13, 18, 0.45)",
        backdropFilter: "blur(2px)",
      }}
      onClick={onCancel}
    >
      <div
        className="animate-scale-in"
        style={{
          width: "min(420px, 90vw)",
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
          padding: "20px 24px 14px",
          borderBottom: "1px solid var(--divider)",
        }}>
          <h3
            id="confirm-dialog-title"
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
        </div>

        {/* Body */}
        <div style={{
          padding: "16px 24px",
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--text-secondary)",
        }}>
          {message}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px",
          borderTop: "1px solid var(--divider)",
          background: "var(--surface-alt)",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 34,
              padding: "0 16px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background var(--duration-fast) var(--ease-std), border-color var(--duration-fast) var(--ease-std)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{
              height: 34,
              padding: "0 16px",
              borderRadius: "var(--r-md)",
              border: `1px solid ${isDangerous ? "var(--danger)" : "var(--brand)"}`,
              background: isDangerous ? "var(--danger)" : "var(--brand)",
              color: "white",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "opacity var(--duration-fast) var(--ease-std)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
