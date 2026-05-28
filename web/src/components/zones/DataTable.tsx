"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
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

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  emptyMessage?: string;
  onDownload?: () => void;
  downloadLabel?: string;
  caption?: React.ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  emptyMessage = "No rows.",
  onDownload,
  downloadLabel = "Download CSV",
  caption,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const end = Math.min(start + pageSize, data.length);
  const slice = useMemo(() => data.slice(start, end), [data, start, end]);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
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
                  {emptyMessage}
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

      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "10px 20px",
          borderTop: "1px solid var(--border)",
          background: "color-mix(in oklab, var(--surface-sunken) 50%, transparent)",
        }}
      >
        <p style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {data.length === 0 ? "0 rows" : `${start + 1}–${end} of ${data.length.toLocaleString()}`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
          >
            <ChevronLeft size={14} strokeWidth={2.4} />
            Prev
          </Button>
          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", padding: "0 8px", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
            {safePage + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
          >
            Next
            <ChevronRight size={14} strokeWidth={2.4} />
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
