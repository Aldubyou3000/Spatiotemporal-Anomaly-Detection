"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Swap confirm button to danger (red) color */
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  extraAction?: React.ReactNode;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDangerous = false,
  onConfirm,
  onCancel,
  extraAction,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape key closes
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const previous = document.activeElement;
    (extraAction || isDangerous ? cancelRef : confirmRef).current?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]') ?? [])]
        .filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(10, 13, 18, 0.45)",
      }}
      onClick={onCancel}
    >
      <div ref={dialogRef} className={`animate-scale-in ${styles.dialog}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3
            id="confirm-dialog-title"
            style={{
              margin: 0,
              fontSize: "var(--font-xl)",
              fontWeight: 600,
              lineHeight: 1.4,
              color: "var(--text)",

            }}
          >
            {title}
          </h3>
        </div>

        {/* Body */}
        <div id="confirm-dialog-message" className={styles.body}>
          {message}
        </div>

        <div className={styles.footer}>
          <Button type="button" ref={cancelRef} variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
          <Button type="button" ref={confirmRef} variant={extraAction ? "secondary" : isDangerous ? "danger" : "primary"}
            onClick={onConfirm}>{confirmLabel}</Button>
          {extraAction}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
