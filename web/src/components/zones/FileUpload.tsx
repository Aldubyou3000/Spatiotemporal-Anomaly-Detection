"use client";

import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import styles from "./FileUpload.module.css";

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
        className={cn(styles.dropZone, hasFiles && styles.hasFiles, dragOver && styles.dragOver, disabled && styles.disabled)}
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

        <div className={styles.uploadIcon} aria-hidden="true">
          {hasFiles ? <FileSpreadsheet size={22} /> : <UploadCloud size={22} />}
        </div>
        <div className={styles.uploadText}>
          <p className={styles.uploadTitle}>
            {hasFiles ? `${files.length} ${files.length === 1 ? "file" : "files"} selected` : "Drop station CSV files here"}
          </p>
          <p className={styles.uploadHint}>
            {hasFiles ? `${formatBytes(totalBytes)} of ${MAX_TOTAL_MB} MB` : `CSV files · Up to ${MAX_TOTAL_MB} MB combined`}
          </p>
        </div>
        <div className={styles.fileActions}>
          {hasFiles && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirmOpen(true)}>
            Remove all
          </Button>}
          <Button type="button" size={hasFiles ? "md" : "lg"} variant={hasFiles ? "secondary" : "primary"} disabled={disabled} onClick={() => inputRef.current?.click()}>
            {hasFiles ? "Add files" : "Browse files"}
          </Button>
        </div>
      </div>

      {/* Selected-files list */}
      {hasFiles && (
        <div className={styles.fileList}>
          <div className={styles.files}>{files.map((file, i) => (
            <div
              key={`${file.name}:${file.size}:${i}`}
              className={styles.fileRow}
            >
              <FileSpreadsheet size={15} className="text-text-muted shrink-0" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className={styles.fileName} title={file.name}>{fileLabel(file.name)}</p>
                {fileLabel(file.name) !== file.name && <p className={styles.originalName} title={file.name}>{file.name}</p>}
              </div>
              <span className={styles.fileSize}>{formatBytes(file.size)}</span>
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
          ))}</div>

        </div>
      )}

      {validationError && (
        <p role="alert" className="text-[length:var(--font-sm)] text-danger mt-2">{validationError}</p>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Remove all files and reset session?"
          message="All selected files, process results, and analysis data will be cleared. This cannot be undone."
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

function fileLabel(name: string): string {
  const station = /^HMDAS-[^-]+-(.+?)_(?:Hourly_)?Rainfall_/i.exec(name)?.[1];
  return station ? station.replace(/_/g, " ") : name;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
