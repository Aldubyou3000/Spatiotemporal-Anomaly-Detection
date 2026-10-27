"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTicketTechnicians } from "@/hooks/useTechnicians";
import {
  AlertTriangle,
  Settings2,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useZones } from "@/context/ZonesContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import styles from "./Zones.module.css";
import { useToast } from "@/components/ui/Toast";
import { Header } from "@/components/dashboard/Header";
import { PipelineDiagram } from "@/components/zones/PipelineDiagram";
import { FileUpload } from "@/components/zones/FileUpload";
import { zonesApi } from "@/lib/api/zones";
import type { ProcessResult } from "@/types/zones";

import { InfoTip } from "@/components/zones/InfoTip";
import { CreateTicketModal } from "@/components/zones/CreateTicketModal";
import { ZoneResults } from "@/components/zones/ZoneResults";
import { useHistoryReviews, invalidateHistory } from "@/hooks/useHistory";
import { RunSaveStatus } from "@/components/history/RunSaveStatus";
import { ReviewSaveStatus } from "@/components/history/ReviewSaveStatus";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const { loading: authLoading } = useAuth();
  const toast = useToast();
  const {
    files, setFiles,
    running, setRunning,
    progress, setProgress,
    abortRef,
    result, setResult,
    guardUnsaved, requestSave, leaveRequest, saveRequest,
    error, setError,
    configOpen, setConfigOpen,
    resetSession,
  } = useZones();
  const { technicians } = useTicketTechnicians();
  const [createStation, setCreateStation] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Any file-set change invalidates a previous pipeline result — keep the
  // session coherent when files are added/removed individually after a run.
  function handleFilesChange(next: File[]) {
    guardUnsaved(() => applyFilesChange(next));
  }
  function applyFilesChange(next: File[]) {
    setFiles(next);
    setConfigOpen(false);
    if (result) {
      setResult(null);
      setError(null);
    }
  }
  const configurationTrigger = useRef<HTMLButtonElement>(null);

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setProgress(null);
    setError(null);
    setConfirmCancel(false);
  }

  async function handleProcess() {
    if (files.length === 0 || running) return;
    // Create a fresh abort controller for this run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setProgress({ stage: "preparing", station_ids: [] });
    setResult(null);
    setError(null);

    setConfigOpen(false);

    try {
      const data = await zonesApi.process(files, { signal: controller.signal, onProgress: (next) => {
        if (!controller.signal.aborted && abortRef.current === controller) setProgress(next);
      } });
      if (controller.signal.aborted || abortRef.current !== controller) return;
      setResult(data);
      if (data.history_saved) void invalidateHistory();
      setConfigOpen(false);
      const anomalies = data.flagged_data.filter((r) => r.is_anomaly).length;
      const filePrefix = files.length > 1 ? `${files.length} files merged · ` : "";
      // Detail confirms all files were merged, not just one
      const stationCount = data.summary.total_stations;
      toast.success("Process complete", {
        description: `${filePrefix}${data.cleaned_data.length.toLocaleString()} daily readings from ${stationCount} station(s) · ${anomalies.toLocaleString()} anomal${anomalies === 1 ? "y" : "ies"} flagged.`,
      });
    } catch (err) {
      if (controller.signal.aborted || abortRef.current !== controller) return;
      let msg = err instanceof Error ? err.message : "Failed to process file.";
      // Multi-file specific hint
      if (files.length > 1 && msg.toLowerCase().includes("only one")) {
        msg = msg + " All files were sent; if only one station appears, check that the other CSVs are valid HMDAS or combined files (station_id, date, rainfall).";
      }
      setError(msg);
      toast.error("Process failed", { description: msg });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRunning(false);
        setProgress(null);
      }
    }
  }

  function closeConfiguration() {
    // A nested file-removal confirmation owns Escape until it closes.
    if (document.querySelector('[aria-labelledby="confirm-dialog-title"]')) return;
    setConfigOpen(false);
    configurationTrigger.current?.focus();
  }

  const configuration = <RunConfiguration files={files} result={result} error={error}
    onFilesChange={handleFilesChange} onRemove={() => guardUnsaved(resetSession)}
    onRun={() => guardUnsaved(() => void handleProcess())} />;

  if (authLoading) return <div className={styles.loading} role="status">Loading session…</div>;

  return (
    <div className={styles.page}>
      <Header title="Zones" actions={<div className={styles.headerActions}>
        {result && !running && <>
          <Button ref={configurationTrigger} size="sm" variant="ghost" onClick={() => setConfigOpen(true)}
            title={`Run configuration · ${files.length} CSV ${files.length === 1 ? 'file' : 'files'}`}
            aria-haspopup="dialog" aria-expanded={configOpen && !leaveRequest && !saveRequest}>
            <Settings2 size={14} /> Run configuration<span className={styles.fileCount} aria-label={`${files.length} files`}>{files.length}</span>
          </Button>
          <RunSaveStatus compact result={result} onSave={() => requestSave()} />
        </>}
        {!running && (files.length > 0 || result || error) && <Button size="icon-sm" variant="ghost" title="Reset workspace" aria-label="Reset workspace"
            onClick={() => result && !result.history_saved ? guardUnsaved(resetSession) : setConfirmReset(true)}>
            <RotateCcw size={14} />
          </Button>}
      </div>} />

      <div className={`dashboard-content ${styles.body}`}>
        {running ? <section className={styles.processing} aria-label="Detection process">
          <div className={styles.processingHeader}>
            <h2>Processing station data</h2>
            <Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>Stop</Button>
          </div>
          <p className={styles.hint}>Your results will open here when detection finishes.</p>
          <PipelineDiagram running result={null} progress={progress} renderTip={(text) => <InfoTip text={text} />} />
        </section> : result ? <CurrentResults result={result} onCreateTicket={(stationId, date) => {
          const open = () => { setCreateStation(stationId); setCreateDate(date); };
          if (result.history_saved) open(); else requestSave(open);
        }} /> : <section className={styles.setup} aria-label="Run configuration">
          <div className={styles.setupHeading}>
            <h2>Rainfall detection</h2>
            <p>Upload station data to find unusual rainfall readings.</p>
          </div>
          {configuration}
        </section>}
      </div>

      {result && !running && configOpen && !leaveRequest && !saveRequest && <ConfigurationDialog onClose={closeConfiguration}>
        {configuration}
      </ConfigurationDialog>}

      {createStation !== null && (
        <CreateTicketModal
          stationId={createStation} technicians={technicians}
          onClose={() => setCreateStation(null)} file={files[0] ?? null}
          runId={result?.history_saved ? result.run_id ?? undefined : undefined} readingDate={createDate}
        />
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="Stop process?"
          message="The detection process is still running. Are you sure you want to stop it?"
          confirmLabel="Stop process"
          isDangerous
          onConfirm={handleCancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset process?"
          message={result?.history_saved ? "Clear this workspace? Your saved run and reviews remain in History." : "This run is not saved. Download Results CSV before clearing this workspace."}
          confirmLabel="Reset process"
          isDangerous
          onConfirm={() => {
            resetSession();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}

function RunConfiguration({ files, result, error, onFilesChange, onRemove, onRun }: {
  files: File[]; result: ProcessResult | null; error: string | null;
  onFilesChange: (files: File[]) => void; onRemove: () => void; onRun: () => void;
}) {
  return <div className={styles.configuration}>
    <div className={styles.configurationGrid}>
      <div className={styles.configurationTask}>
        <FileUpload files={files} onFilesChange={onFilesChange} onRemove={onRemove} />
        {error && <div className={styles.error} role="alert"><AlertTriangle size={15} aria-hidden="true" /><p>{error}</p></div>}
        <div className={styles.runActions}>
          <p>{files.length ? "Results open here when processing finishes." : "Select at least one CSV file to continue."}</p>
          <Button variant={files.length ? "primary" : "secondary"} size="lg" disabled={files.length === 0} onClick={onRun}>{result ? "Run again" : "Run detection"}</Button>
        </div>
      </div>
      <section className={styles.processDetails} aria-label="How detection works">
        <h3>How detection works</h3>
        <PipelineDiagram running={false} result={null} renderTip={(text) => <InfoTip text={text} />} />
      </section>
    </div>
  </div>;
}

function ConfigurationDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = body.current?.closest<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab" || document.querySelector('[aria-labelledby="confirm-dialog-title"]') || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [href], [tabindex="0"]')]
        .filter((control) => control.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, []);
  return <Modal title="Run configuration" width="min(1000px, 95vw)" onClose={onClose}>
    <div ref={body} className={styles.dialogBody}>{children}</div>
  </Modal>;
}

function CurrentResults({ result, onCreateTicket }: { result: ProcessResult; onCreateTicket?: (stationId: string, date?: string) => void }) {
  const { reviews, setReview, requestSave } = useZones();
  const saved = useHistoryReviews(result.history_saved ? result.run_id ?? null : null);
  const persistent = !!result.history_saved;
  return <div className={styles.results}>
    {persistent && <ReviewSaveStatus state={saved} />}
    <ZoneResults fitViewport onSaveRun={() => requestSave()} result={result} reviews={persistent ? saved.reviews : reviews}
      onReview={persistent ? (saved.ready ? saved.saveReview : undefined) : !result.run_id ? setReview : undefined}
      reviewsReady={!persistent || saved.ready} reviewBusy={saved.saving} onCreateTicket={onCreateTicket} />
  </div>;
}
