"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProcessResult } from "@/types/zones";

interface ZonesState {
  files: File[];
  setFiles: (f: File[]) => void;
  running: boolean;
  setRunning: (v: boolean) => void;
  activeStage: 0 | 1 | 2;
  setActiveStage: (v: 0 | 1 | 2) => void;
  progress: number;
  setProgress: (v: number) => void;
  finalizing: boolean;
  setFinalizing: (v: boolean) => void;
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
  const [activeStage, setActiveStage] = useState<0 | 1 | 2>(0);
  const [progress, setProgress] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  function resetSession() {
    setFiles([]);
    setResult(null);
    setError(null);
    setProgress(0);
    setActiveStage(0);
    setFinalizing(false);
    setRunning(false);
    setConfigOpen(true);
  }

  return (
    <ZonesContext.Provider value={{
      files, setFiles,
      running, setRunning,
      activeStage, setActiveStage,
      progress, setProgress,
      finalizing, setFinalizing,
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
