"use client";

type Variant = "brand" | "danger" | "default";

export function ReasonPicker({
  reasons,
  selected,
  onSelect,
  variant = "default",
}: {
  reasons: readonly string[];
  selected: string | null;
  onSelect: (v: string) => void;
  variant?: Variant;
}) {
  return (
    <div
      role="group"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 8,
      }}
    >
      {reasons.map((r) => {
        const active = selected === r;
        const isOther = r === "Other";
        // Base chip — matches roster pills / export-btn language
        let bg = "var(--surface)";
        let border = "1px solid var(--border)";
        let color = "var(--text-secondary)";
        if (active) {
          if (variant === "danger") {
            bg = "var(--danger-soft)";
            border = "1px solid color-mix(in oklab, var(--danger) 30%, transparent)";
            color = "var(--danger)";
          } else if (variant === "brand") {
            bg = "var(--brand-soft)";
            border = "1px solid color-mix(in oklab, var(--brand) 30%, transparent)";
            color = "var(--brand)";
          } else {
            bg = "var(--brand-soft)";
            border = "1px solid color-mix(in oklab, var(--brand) 25%, transparent)";
            color = "var(--on-brand-soft)";
          }
        } else if (isOther) {
          // Subtle dashed hint that it opens free-text
          border = "1px dashed var(--border-strong)";
        }

        return (
          <button
            key={r}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(r)}
            style={{
              height: 26,
              padding: "0 10px",
              borderRadius: "var(--r-full)",
              border,
              background: bg,
              color,
              fontSize: "var(--font-xs)",
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "background 120ms, color 120ms, border-color 120ms",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "var(--surface-sunken)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "var(--surface)";
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
