/**
 * Tiny CSV serializer for client-side downloads.
 * Handles quoting, commas, newlines, and quote-escaping.
 */
export function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const head = headers.join(",");
  const body = rows.map((row) => headers.map((h) => escape(row[h])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

export function downloadCsv<T extends Record<string, unknown>>(filename: string, rows: T[]): void {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
