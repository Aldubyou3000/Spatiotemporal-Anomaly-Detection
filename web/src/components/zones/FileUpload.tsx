"use client";

import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

interface FileUploadProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
}

const MAX_SIZE_MB = 20;

export function FileUpload({ file, onFileChange, disabled, className }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (next: File | null) => {
      setError(null);
      if (!next) {
        onFileChange(null);
        return;
      }
      if (!next.name.toLowerCase().endsWith(".csv")) {
        setError("Only .csv files are supported.");
        return;
      }
      if (next.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`File exceeds ${MAX_SIZE_MB} MB limit.`);
        return;
      }
      onFileChange(next);
    },
    [onFileChange],
  );

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) handleFile(dropped);
        }}
        className={cn(
          "relative cursor-pointer rounded-xl border-2 border-dashed",
          "bg-surface-alt px-6 py-10 flex flex-col items-center justify-center text-center",
          "transition-all duration-200",
          dragOver
            ? "border-brand bg-brand-soft"
            : file
              ? "border-success/40 bg-success-soft"
              : "border-border-strong hover:border-brand/60 hover:bg-surface-muted",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={disabled}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-success/15 grid place-items-center">
              <FileSpreadsheet size={22} className="text-success" strokeWidth={2.2} />
            </div>
            <div>
              <p className="font-mono tabular text-[14px] font-medium text-text break-all">
                {file.name}
              </p>
              <p className="text-[12px] text-text-secondary mt-1">
                {formatBytes(file.size)} · ready to process
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleFile(null);
              }}
              disabled={disabled}
            >
              <X size={14} strokeWidth={2.2} />
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-soft grid place-items-center">
              <UploadCloud size={22} className="text-brand" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[14px] font-medium text-text">
                Drop a CSV here, or <span className="text-brand">browse</span>
              </p>
              <p className="text-[12px] text-text-secondary mt-1">
                Expected columns: <span className="font-mono tabular">station_id, date, latitude, longitude, rainfall</span>
              </p>
              <p className="text-[11px] text-text-tertiary mt-1">
                Hourly data is auto-aggregated to daily totals. Max {MAX_SIZE_MB}&nbsp;MB.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-[12px] text-danger mt-2">{error}</p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
