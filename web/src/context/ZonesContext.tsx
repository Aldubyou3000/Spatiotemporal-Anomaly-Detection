"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ProcessResult } from "@/types/zones";
import { isFlaggedReading, readingKey, type AnomalyReview, type AnomalyReviews } from "@/lib/anomalyReview";

interface ZonesState {
  files: File[];
  setFiles: (f: File[]) => void;
  running: boolean;
  setRunning: (v: boolean) => void;
  abortRef: RefObject<AbortController | null>;
  result: ProcessResult | null;
  setResult: (r: ProcessResult | null, expectedRunId?: string) => void;
  reviews: AnomalyReviews;
  setReview: (key: string, review: AnomalyReview | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  configOpen: boolean;
  setConfigOpen: (v: boolean) => void;
  resetSession: () => void;
  saveRequest: { afterSave?: (saved: ProcessResult) => void } | null;
  requestSave: (afterSave?: (saved: ProcessResult) => void) => void;
  cancelSave: () => void;
  leaveRequest: { proceed: () => void } | null;
  guardUnsaved: (proceed: () => void) => void;
  cancelLeave: () => void;
}

const ZonesContext = createContext<ZonesState | null>(null);

export function ZonesProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [session, setSession] = useState<{ result: ProcessResult | null; reviews: AnomalyReviews }>({ result: null, reviews: {} });
  const { result, reviews } = session;
  function setResult(next: ProcessResult | null, expectedRunId?: string) {
    setSession((current) => expectedRunId && current.result?.run_id !== expectedRunId
      ? current : { result: next, reviews: {} });
  }
  function setReview(key: string, review: AnomalyReview | null) {
    setSession((current) => {
      if (!current.result?.flagged_data.some((row) => isFlaggedReading(row) && readingKey(row) === key)) return current;
      const next = { ...current.reviews };
      if (review) next[key] = review;
      else delete next[key];
      return { ...current, reviews: next };
    });
  }
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);
  const [saveRequest, setSaveRequest] = useState<ZonesState["saveRequest"]>(null);
  const [leaveRequest, setLeaveRequest] = useState<ZonesState["leaveRequest"]>(null);
  function requestSave(afterSave?: (saved: ProcessResult) => void) { setSaveRequest({ afterSave }); }
  function guardUnsaved(proceed: () => void) {
    if (result && !result.history_saved) setLeaveRequest({ proceed });
    else proceed();
  }

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (!result || (result.history_saved && !Object.keys(reviews).length)) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [reviews, result]);

  function resetSession() {
    abortRef.current?.abort();
    abortRef.current = null;
    setFiles([]);
    setResult(null);
    setError(null);
    setRunning(false);
    setConfigOpen(true);
    setSaveRequest(null);
    setLeaveRequest(null);
  }

  return (
    <ZonesContext.Provider value={{
      files, setFiles,
      running, setRunning,
      abortRef,
      result, setResult,
      reviews, setReview,
      error, setError,
      configOpen, setConfigOpen,
      resetSession,
      saveRequest, requestSave, cancelSave: () => setSaveRequest(null),
      leaveRequest, guardUnsaved, cancelLeave: () => setLeaveRequest(null),
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
