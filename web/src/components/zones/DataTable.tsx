"use client";

import { useMemo, useState } from "react";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import styles from "./DataTable.module.css";

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

  const isFiltered = search.trim() !== "" || (filterFields ?? []).some(field => Boolean(dropdowns[field.key]));



  return (
    <div className={styles.card}>
      <div className={styles.toolbar}>
        <div className={styles.search} data-search-field>
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Search table" value={search}
            onChange={(e) => handleSearchChange(e.target.value)} placeholder="Search readings…" />
          {search && <button type="button" onClick={() => handleSearchChange("")} aria-label="Clear search"><X size={14} /></button>}
        </div>
        {(filterFields ?? []).map((field) => (
          <Select key={field.key} value={dropdowns[field.key] ?? ""}
            onChange={(v) => handleDropdownChange(field.key, v)}
            width={150} ariaLabel={field.label}
            options={[{ value: "", label: field.label }, ...field.options]} />
        ))}
        {isFiltered && <Button variant="ghost" size="sm"
          onClick={() => { handleSearchChange(""); setDropdowns({}); }}>Clear filters</Button>}
        {caption && <div className={styles.caption}>{caption}</div>}
        {onDownload && <Button variant="secondary" size="sm" onClick={onDownload}>
          <Download size={14} />{downloadLabel}
        </Button>}
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr>{columns.map((c) => (
            <th key={c.key} scope="col" style={{ width: c.width, textAlign: c.align ?? "left" }}>{c.header}</th>
          ))}</tr></thead>
          <tbody>
            {slice.length === 0 ? (
              <tr><td colSpan={columns.length} className={styles.empty}>
                {isFiltered ? "No rows match the current filters." : emptyMessage}
              </td></tr>
            ) : slice.map((row, i) => (
              <tr key={i}>{columns.map((c) => {
                const raw = (row as Record<string, unknown>)[c.key];
                return <td key={c.key} style={{
                  textAlign: c.align ?? "left",
                  fontFamily: c.mono ? "var(--font-mono)" : undefined,
                }}>{c.render ? c.render(raw as T[keyof T], row) : formatCell(raw)}</td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <p aria-live="polite">{filtered.length === 0 ? "0 rows"
          : `${start + 1}–${end} of ${filtered.length.toLocaleString()} rows${isFiltered ? ` (filtered from ${data.length.toLocaleString()})` : ""}`}</p>
        <nav className={styles.pagination} aria-label="Table pagination">
          <Button variant="ghost" size="sm" onClick={() => goTo(0)} disabled={safePage === 0} aria-label="First page">
            <ChevronsLeft size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goTo(safePage - 1)} disabled={safePage === 0} aria-label="Previous page">
            <ChevronLeft size={16} />
          </Button>
          <label className={styles.pageJump}>
            <span>Page</span>
            <input type="text" aria-label="Page number" inputMode="numeric" pattern="[0-9]*"
              value={jumpInput !== "" ? jumpInput : safePage + 1}
              onChange={(e) => setJumpInput(e.target.value.replace(/\D/g, ""))}
              onBlur={handleJumpCommit}
              onKeyDown={(e) => { if (e.key === "Enter") { handleJumpCommit(); (e.target as HTMLInputElement).blur(); } }} />
            <span>of {totalPages}</span>
          </label>
          <Button variant="ghost" size="sm" onClick={() => goTo(safePage + 1)} disabled={safePage >= totalPages - 1} aria-label="Next page">
            <ChevronRight size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goTo(totalPages - 1)} disabled={safePage >= totalPages - 1} aria-label="Last page">
            <ChevronsRight size={16} />
          </Button>
        </nav>
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
