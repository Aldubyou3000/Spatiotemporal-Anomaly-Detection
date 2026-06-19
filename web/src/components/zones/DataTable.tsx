"use client";

import { useMemo, useState } from "react";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface Column<T> {
  key: keyof T & string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  mono?: boolean;
}

export interface FilterField {
  key: string;
  label: string;
  type: "select";
  options: { value: string; label: string }[];
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  emptyMessage?: string;
  onDownload?: () => void;
  downloadLabel?: string;
  caption?: React.ReactNode;
  /** Keys to search with the free-text box. Defaults to all columns. */
  searchKeys?: (keyof T & string)[];
  /** Column-specific dropdown filters shown beside the search box. */
  filterFields?: FilterField[];
}

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  emptyMessage = "No rows.",
  onDownload,
  downloadLabel = "Download CSV",
  caption,
  searchKeys,
  filterFields,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [jumpInput, setJumpInput] = useState("");
  const [search, setSearch] = useState("");
  const [dropdowns, setDropdowns] = useState<Record<string, string>>(() =>
    Object.fromEntries((filterFields ?? []).map((f) => [f.key, ""])),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Resolve here so the dep is stable (searchKeys is either undefined or a stable prop)
    const keys = searchKeys && searchKeys.length > 0 ? searchKeys : columns.map((c) => c.key);

    return data.filter((row) => {
      if (q) {
        const textMatch = keys.some((k) => {
          const raw = (row as Record<string, unknown>)[k];
          if (raw === null || raw === undefined) return false;
          return String(raw).toLowerCase().includes(q);
        });
        if (!textMatch) return false;
      }
      for (const field of filterFields ?? []) {
        const chosen = dropdowns[field.key];
        if (!chosen) continue;
        const raw = (row as Record<string, unknown>)[field.key];
        if (String(raw) !== chosen) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, dropdowns, searchKeys, columns, filterFields]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const end = Math.min(start + pageSize, filtered.length);
  const slice = useMemo(() => filtered.slice(start, end), [filtered, start, end]);

  function goTo(target: number) {
    setPage(Math.max(0, Math.min(totalPages - 1, target)));
  }

  function handleJumpCommit() {
    const n = parseInt(jumpInput, 10);
    if (!isNaN(n)) goTo(n - 1);
    setJumpInput("");
  }

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(0);
  }

  function handleDropdownChange(key: string, v: string) {
    setDropdowns((prev) => ({ ...prev, [key]: v }));
    setPage(0);
  }

  const isFiltered = search.trim() !== "" || Object.values(dropdowns).some(Boolean);

  const selectStyle: React.CSSProperties = {
    height: 30, padding: "0 28px 0 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: "var(--font-xs)",
    fontFamily: "inherit",
    outline: "none",
    cursor: "pointer",
    appearance: "none",
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
      {/* Caption + download row */}
      {(caption || onDownload) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
          <div style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>{caption}</div>
          {onDownload && (
            <Button variant="secondary" size="sm" onClick={onDownload}>
              <Download size={14} strokeWidth={2.2} />
              {downloadLabel}
            </Button>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-alt)",
        }}
      >
        {/* Free-text search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          flex: "1 1 180px", minWidth: 0,
          height: 30,
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          background: "var(--surface)",
          padding: "0 10px",
        }}>
          <Search size={12} strokeWidth={2} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search…"
            style={{
              flex: 1, border: "none", background: "transparent", outline: "none",
              fontSize: "var(--font-xs)", color: "var(--text)", fontFamily: "inherit",
              minWidth: 0,
            }}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              style={{
                display: "grid", placeItems: "center",
                width: 16, height: 16, borderRadius: "50%",
                background: "var(--surface-sunken)",
                border: "none", cursor: "pointer",
                color: "var(--text-muted)", flexShrink: 0,
              }}
              aria-label="Clear search"
            >
              <X size={9} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Per-column dropdown filters */}
        {(filterFields ?? []).map((field) => (
          <div key={field.key} style={{ position: "relative", flexShrink: 0 }}>
            <select
              value={dropdowns[field.key]}
              onChange={(e) => handleDropdownChange(field.key, e.target.value)}
              style={{
                ...selectStyle,
                color: dropdowns[field.key] ? "var(--text)" : "var(--text-muted)",
                borderColor: dropdowns[field.key] ? "var(--brand)" : "var(--border)",
                background: dropdowns[field.key] ? "color-mix(in oklab, var(--brand) 8%, var(--surface))" : "var(--surface)",
              }}
              aria-label={field.label}
            >
              <option value="" style={{ color: "var(--text-muted)", background: "var(--surface)" }}>{field.label}</option>
              {field.options.map((o) => (
                <option key={o.value} value={o.value} style={{ color: "var(--text)", background: "var(--surface)" }}>{o.label}</option>
              ))}
            </select>
            {/* Chevron icon */}
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none"
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }}
            >
              <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ))}

        {/* Result count + clear all */}
        {isFiltered && (
          <>
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {filtered.length.toLocaleString()} / {data.length.toLocaleString()}
            </span>
            <button
              onClick={() => { handleSearchChange(""); setDropdowns(Object.fromEntries((filterFields ?? []).map((f) => [f.key, ""]))); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                height: 24, padding: "0 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "transparent",
                color: "var(--text-muted)",
                fontSize: "var(--font-xs)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={9} strokeWidth={2.5} />
              Clear
            </button>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: "100%", fontSize: "var(--font-sm)" }}>
          <thead>
            <tr className="bg-surface-sunken border-b border-border">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    width: c.width,
                    fontSize: "var(--font-xs)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-secondary)",
                    padding: "10px 16px",
                    textAlign: c.align === "right" ? "right" : c.align === "center" ? "center" : "left",
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: "48px 16px", textAlign: "center", fontSize: "var(--font-sm)", color: "var(--text-tertiary)" }}
                >
                  {isFiltered ? "No rows match the current filters." : emptyMessage}
                </td>
              </tr>
            ) : (
              slice.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    "hover:bg-surface-muted transition-colors",
                  )}
                >
                  {columns.map((c) => {
                    const raw = (row as Record<string, unknown>)[c.key];
                    const content = c.render ? c.render(raw as T[keyof T], row) : formatCell(raw);
                    return (
                      <td
                        key={c.key}
                        style={{
                          padding: "10px 16px",
                          textAlign: c.align === "right" ? "right" : c.align === "center" ? "center" : "left",
                          fontFamily: c.mono ? "var(--font-mono)" : undefined,
                          fontSize: "var(--font-sm)",
                          color: "var(--text)",
                          fontVariantNumeric: c.mono ? "tabular-nums" : undefined,
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          background: "color-mix(in oklab, var(--surface-sunken) 50%, transparent)",
          flexWrap: "wrap",
        }}
      >
        <p style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", margin: 0 }}>
          {filtered.length === 0
            ? "0 rows"
            : `${start + 1}–${end} of ${filtered.length.toLocaleString()}${isFiltered ? ` (filtered from ${data.length.toLocaleString()})` : ""}`}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Button variant="ghost" size="sm" onClick={() => goTo(0)} disabled={safePage === 0} aria-label="First page">
            <ChevronsLeft size={14} strokeWidth={2.4} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goTo(safePage - 1)} disabled={safePage === 0} aria-label="Previous page">
            <ChevronLeft size={14} strokeWidth={2.4} />
          </Button>

          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>Page</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={jumpInput !== "" ? jumpInput : safePage + 1}
              onChange={(e) => setJumpInput(e.target.value.replace(/\D/g, ""))}
              onBlur={handleJumpCommit}
              onKeyDown={(e) => { if (e.key === "Enter") { handleJumpCommit(); (e.target as HTMLInputElement).blur(); } }}
              style={{
                width: 44, height: 26,
                textAlign: "center",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: "var(--font-xs)",
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                outline: "none",
                padding: "0 4px",
              }}
            />
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              of {totalPages}
            </span>
          </div>

          <Button variant="ghost" size="sm" onClick={() => goTo(safePage + 1)} disabled={safePage >= totalPages - 1} aria-label="Next page">
            <ChevronRight size={14} strokeWidth={2.4} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goTo(totalPages - 1)} disabled={safePage >= totalPages - 1} aria-label="Last page">
            <ChevronsRight size={14} strokeWidth={2.4} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  return String(value);
}
