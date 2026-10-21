"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ProcessResult } from "@/types/zones";

interface ZonesState {
  files: File[];
  setFiles: (f: File[]) => void;
  running: boolean;
  setRunning: (v: boolean) => void;
  abortRef: RefObject<AbortController | null>;
  result: ProcessResult | null;
  setResult: (r: ProcessResult | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  configOpen: boolean;
  setConfigOpen: (v: boolean) => void;
  resetSession: () => void;
}

const ZonesContext = createContext<ZonesState | null>(null);

export function ZonesProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  function resetSession() {
    abortRef.current?.abort();
    abortRef.current = null;
    setFiles([]);
    setResult(null);
    setError(null);
    setRunning(false);
    setConfigOpen(true);
  }

  return (
    <ZonesContext.Provider value={{
      files, setFiles,
      running, setRunning,
      abortRef,
      result, setResult,
      error, setError,
      configOpen, setConfigOpen,
      resetSession,
    }}>
      {children}
    </ZonesContext.Provider>
  );
}

export function useZones(): ZonesState {
  const ctx = useContext(ZonesContext);
  if (!ctx) throw new Error("useZones must be used inside ZonesProvider");
  return ctx;
}
