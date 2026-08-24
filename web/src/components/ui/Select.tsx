"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  width?: number | string;
  ariaLabel?: string;
}

export function Select({ value, onChange, options, placeholder, width, ariaLabel }: SelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  function updateCoords() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 6, left: r.left, width: r.width });
  }

  useEffect(() => {
    if (!open) return;
    updateCoords();
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      const dropdown = document.getElementById("app-select-dropdown");
      if (dropdown && dropdown.contains(target)) return;
      if (wrapperRef.current && wrapperRef.current.contains(target)) return;
      setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleScroll(e: Event) {
      const target = e.target as HTMLElement | null;
      const dropdown = document.getElementById("app-select-dropdown");
      // Don't close when scrolling inside the dropdown itself
      if (dropdown && target && dropdown.contains(target)) return;
      if (target === dropdown) return;
      // Keep the dropdown pinned to the button instead of closing
      updateCoords();
    }
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const hasValue = value !== "" && !!selected;
  const displayLabel = selected?.label ?? placeholder ?? options[0]?.label ?? "";
  const isPlaceholder = !hasValue && !!placeholder;

  // Flip if near bottom
  const dropdownStyle: React.CSSProperties | null = coords
    ? (() => {
        const maxH = 220;
        const spaceBelow = window.innerHeight - coords.top;
        const flip = spaceBelow < maxH + 20 && coords.top > maxH + 100;
        return {
          position: "fixed" as const,
          top: flip ? coords.top - (maxH + 36) : coords.top,
          left: coords.left,
          width: Math.max(coords.width, 140),
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-lg)",
          zIndex: 9999,
          padding: 4,
          maxHeight: maxH,
          overflowY: "auto" as const,
        };
      })()
    : null;

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: width ?? "auto", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) updateCoords();
          setOpen((v) => !v);
        }}
        style={{
          width: "100%",
          height: 30,
          padding: "0 26px 0 10px",
          borderRadius: "var(--r-md)",
          border: `1px solid ${open ? "var(--border-focus)" : hasValue ? "var(--border)" : "var(--border)"}`,
          background: open ? "var(--surface)" : hasValue ? "var(--surface)" : "var(--surface-alt)",
          color: isPlaceholder ? "var(--text-muted)" : hasValue ? "var(--text)" : "var(--text-muted)",
          fontSize: "var(--font-sm)",
          fontWeight: 400,
          fontFamily: "inherit",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          outline: "none",
          boxShadow: open ? "var(--shadow-focus)" : "none",
          transition: "border-color var(--duration-fast) var(--ease-std), background var(--duration-fast) var(--ease-std), box-shadow var(--duration-fast) var(--ease-std)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.borderColor = "var(--border-strong)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{displayLabel}</span>
        <ChevronDown size={12} style={{ color: "var(--text-muted)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
      </button>

      {open &&
        dropdownStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="app-select-dropdown" role="listbox" className="animate-scale-in" style={{ ...dropdownStyle, transformOrigin: "top center" }}>
            {options.map((opt) => {
              const active = opt.value === value;
              // placeholder option (value="") is muted unless active
              const isEmptyOption = opt.value === "";
              return (
                <button
                  key={opt.value + opt.label}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    height: 30,
                    padding: "0 8px",
                    borderRadius: "var(--r-md)",
                    border: 0,
                    background: active ? "var(--brand-soft)" : "transparent",
                    color: active ? "var(--on-brand-soft)" : isEmptyOption ? "var(--text-muted)" : "var(--text-secondary)",
                    fontSize: "var(--font-sm)",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--surface-sunken)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
