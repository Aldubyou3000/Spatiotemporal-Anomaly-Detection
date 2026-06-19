"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProcessResult } from "@/types/zones";

interface ZonesState {
  file: File | null;
  setFile: (f: File | null) => void;
  contamination: number;
  setContamination: (v: number) => void;
  running: boolean;
  setRunning: (v: boolean) => void;
  activeStage: 0 | 1 | 2;
  setActiveStage: (v: 0 | 1 | 2) => void;
  progress: number;
  setProgress: (v: number) => void;
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
  const [file, setFile] = useState<File | null>(null);
  const [contamination, setContamination] = useState(0.05);
  const [running, setRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<0 | 1 | 2>(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  function resetSession() {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setActiveStage(0);
    setRunning(false);
    setConfigOpen(true);
  }

  return (
    <ZonesContext.Provider value={{
      file, setFile,
      contamination, setContamination,
      running, setRunning,
      activeStage, setActiveStage,
      progress, setProgress,
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
