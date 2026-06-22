"use client";

import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Plus, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface FileUploadProps {
  files: File[];
  /** Replaces the current selection (used by drop / browse — appends are handled internally). */
  onFilesChange: (files: File[]) => void;
  /** Called instead of onFilesChange([]) when the user confirms removing everything. */
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
}

const MAX_TOTAL_MB = 20;

export function FileUpload({ files, onFilesChange, onRemove, disabled, className }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const addFiles = useCallback(
    (incoming: File[]) => {
      setValidationError(null);
      if (incoming.length === 0) return;

      const nonCsv = incoming.find((f) => !f.name.toLowerCase().endsWith(".csv"));
      if (nonCsv) {
        setValidationError(`Only .csv files are supported — "${nonCsv.name}" is not a CSV.`);
        return;
      }

      // De-dupe by name+size so re-selecting the same file doesn't double it.
      const existingKeys = new Set(files.map((f) => `${f.name}:${f.size}`));
      const merged = [...files];
      for (const f of incoming) {
        const key = `${f.name}:${f.size}`;
        if (!existingKeys.has(key)) {
          merged.push(f);
          existingKeys.add(key);
        }
      }

      const totalBytes = merged.reduce((sum, f) => sum + f.size, 0);
      if (totalBytes > MAX_TOTAL_MB * 1024 * 1024) {
        setValidationError(`Combined size exceeds ${MAX_TOTAL_MB} MB limit.`);
        return;
      }

      onFilesChange(merged);
    },
    [files, onFilesChange],
  );

  const removeOne = useCallback(
    (index: number) => {
      setValidationError(null);
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange],
  );

  const hasFiles = files.length > 0;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

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
          const dropped = Array.from(e.dataTransfer.files ?? []);
          if (dropped.length) addFiles(dropped);
        }}
        className={cn(
          "relative cursor-pointer rounded-xl border-2 border-dashed",
          "bg-surface-alt px-6 py-10 flex flex-col items-center justify-center text-center",
          "transition-all duration-200",
          dragOver
            ? "border-brand bg-brand-soft"
            : hasFiles
              ? "border-success/40 bg-success-soft"
              : "border-border-strong hover:border-brand/60 hover:bg-surface-muted",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            // Reset so selecting the same file again still fires onChange.
            e.target.value = "";
          }}
        />

        {hasFiles ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-xl bg-success/15 grid place-items-center">
              <FileSpreadsheet size={22} className="text-success" strokeWidth={2.2} />
            </div>
            <p className="text-[14px] font-medium text-text">
              {files.length} file{files.length !== 1 ? "s" : ""} ready
            </p>
            <p className="text-[12px] text-text-secondary">
              {formatBytes(totalBytes)} total · click or drop to add more
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-soft grid place-items-center">
              <UploadCloud size={22} className="text-brand" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[14px] font-medium text-text">
                Drop station CSVs here, or <span className="text-brand">browse</span>
              </p>
              <p className="text-[12px] text-text-secondary mt-1">
                One raw file per station, or a single combined CSV
                <span className="font-mono tabular"> (station_id, date, latitude, longitude, rainfall)</span>
              </p>
              <p className="text-[11px] text-text-tertiary mt-1">
                Raw HMDAS files are auto-converted &amp; merged. Hourly data is aggregated to daily. Max {MAX_TOTAL_MB}&nbsp;MB total.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selected-files list */}
      {hasFiles && (
        <div className="mt-3 rounded-lg border border-border overflow-hidden">
          {files.map((file, i) => (
            <div
              key={`${file.name}:${file.size}:${i}`}
              className="flex items-center gap-3 px-3 py-2 border-b border-divider last:border-b-0 bg-surface"
            >
              <FileSpreadsheet size={15} className="text-text-muted shrink-0" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="font-mono tabular text-[12px] text-text truncate">{file.name}</p>
              </div>
              <span className="text-[11px] text-text-tertiary tabular shrink-0">{formatBytes(file.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  removeOne(i);
                }}
                className="topbar-btn shrink-0"
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between px-3 py-2 bg-surface-alt">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <Plus size={14} strokeWidth={2.2} />
              Add more files
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setConfirmOpen(true)}
            >
              <X size={14} strokeWidth={2.2} />
              Remove all
            </Button>
          </div>
        </div>
      )}

      {validationError && (
        <p className="text-[12px] text-danger mt-2">{validationError}</p>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Remove all files and reset session?"
          message="All selected files, pipeline results, and analysis data will be cleared. This cannot be undone."
          confirmLabel="Remove all"
          isDangerous
          onConfirm={() => {
            setConfirmOpen(false);
            onRemove();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
