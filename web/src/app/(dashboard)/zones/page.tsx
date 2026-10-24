"use client";

import { useRef, useState } from "react";
import { useTicketTechnicians } from "@/hooks/useTechnicians";
import {
  AlertTriangle,
  ChevronRight,
  FileBarChart2,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useZones } from "@/context/ZonesContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
    abortRef,
    result, setResult,
    guardUnsaved, requestSave,
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
    if (result) {
      setResult(null);
      setError(null);
      setConfigOpen(true);
    }
  }
  const pipelineRef = useRef<HTMLDivElement | null>(null);

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
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
    setResult(null);
    setError(null);

    // Smoothly scroll to the pipeline so the user sees progress immediately
    requestAnimationFrame(() => {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      pipelineRef.current?.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start",
      });
    });

    try {
      const data = await zonesApi.process(files, { signal: controller.signal });
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
      // Friendly cold-start hint: the 90s client timeout + 1 retry can still trip on a
      // just-woken Render instance (50s boot + 40s LOF >90s window). The server's async
      // 202 path avoids this, but if we're here it means the 202 itself timed out.
      // Nudge the user to retry immediately — second hit is warm and returns 202 in <1s.
      if (msg.includes("timed out") || msg.includes("waking up")) {
        msg = msg + " The server was waking up — please click Run Process again right now (the next attempt is usually instant).";
      }
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
      }
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)", fontFamily: "var(--font-mono)" }}>Loading session…</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <Header title="Zones" />

      <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: "var(--gap-section)" }}>

        {/* Run controls + upload (collapsible) */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
          {/* Toggle header — Reset is outside the toggle so it stays reachable when collapsed */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: configOpen ? "1px solid var(--divider)" : "none" }}>
            <button
              onClick={() => setConfigOpen(!configOpen)}
              className="card-toggle"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "12px 20px",
                borderBottom: "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <ChevronRight
                  size={16}
                  style={{ color: "var(--text-muted)", transition: "transform 0.2s ease", transform: configOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}
                />
                <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
                  Process configuration
                </span>
                {!configOpen && files.length > 0 && (
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", background: "var(--surface-sunken)", padding: "1px 8px", borderRadius: "var(--r-sm)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                    {files.length === 1 ? files[0].name : `${files.length} files`}
                  </span>
                )}
                {!configOpen && files.length === 0 && (
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>No files selected</span>
                )}
              </div>
              {result && !configOpen && (
                <span style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 500, flexShrink: 0 }}>Results ready</span>
              )}
            </button>
            {(files.length > 0 || result || error) && !running && (
              <button
                type="button"
                onClick={() => result && !result.history_saved ? guardUnsaved(resetSession) : setConfirmReset(true)}
                className="export-btn"
                title="Clear files and process results"
                style={{ marginRight: 12, flexShrink: 0, height: 28, gap: 6 }}
              >
                <RotateCcw size={12} strokeWidth={2.2} />
                Reset
              </button>
            )}
          </div>

          {/* Collapsible body — equal height so the two cards read as a balanced pair; dashed zone fills the Upload card */}
          {configOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--gap-card)", padding: "16px 20px 20px", alignItems: "stretch" }}>
              {/* File upload — flex column so the dashed dropzone stretches to fill when Run side is taller */}
              <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
                  <h3 style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Upload station data</h3>
                </div>
                <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <FileUpload className="flex-1 flex flex-col min-h-0" files={files} onFilesChange={handleFilesChange} onRemove={() => guardUnsaved(resetSession)} disabled={running} />
                </div>
              </div>

              {/* Controls */}
              <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)" }}>
                  <h3 style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Run configuration</h3>
                </div>
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <Button
                    size="lg" style={{ width: "100%" }}
                    variant={running ? "danger" : "primary"}
                    disabled={files.length === 0 && !running}
                    loading={false}
                    onClick={running ? () => setConfirmCancel(true) : () => {
                      guardUnsaved(() => void handleProcess());
                    }}
                  >
                    {running ? "Stop" : "Run Process"}
                  </Button>

                  {/* How it works — user-facing, no backend thresholds exposed. Keeps the card from looking hollow after the slider removal, without revealing LOF/Haversine internals. */}
                  <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface-sunken)", borderBottom: "1px solid var(--divider)" }}>
                      <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--brand)", flexShrink: 0 }} />
                        How it works
                      </span>
                      <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>3 steps</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {[
                        { n: "1", title: "Upload", desc: "Drop CSV file — no manual setup required." },
                        { n: "2", title: "Processing", desc: "Cleaning, grouping, and screening run automatically." },
                        { n: "3", title: "Review", desc: "Explore the map and anomaly report, then create tickets." },
                      ].map((s) => (
                        <div key={s.n} style={{ display: "flex", gap: 10, padding: "10px 12px", borderBottom: s.n !== "3" ? "1px solid var(--divider)" : "none" }}>
                          <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid color-mix(in oklab, var(--brand) 14%, transparent)", display: "grid", placeItems: "center", fontSize: "var(--font-xs)", fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0, lineHeight: 1 }}>{s.n}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text)", lineHeight: 1 }}>{s.title}</div>
                            <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", lineHeight: 1.4, marginTop: 2 }}>{s.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                    No settings to tune — upload and run. Flags are per-day discoveries, not quotas.
                  </p>

                  {error && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid rgba(220,38,38,0.2)" }}>
                      <AlertTriangle size={13} style={{ color: "var(--danger-on)", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--danger-on)", lineHeight: 1.5 }}>{error}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pipeline diagram */}
        <div
          ref={pipelineRef}
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)", scrollMarginTop: "calc(var(--topbar-h) + 16px)" }}
        >
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h3 style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Detection process</h3>
              <InfoTip text="CSV → Zone A cleans and validates readings → Zone B groups stations by proximity → Zone C runs Local Outlier Factor to flag anomalies." />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {running && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "var(--font-xs)",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    color: "var(--text-secondary)",
                    padding: "4px 10px",
                    borderRadius: "var(--r-full)",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--border)",
                    transition: "all .2s ease",
                  }}
                >
                  <Loader2 size={11} strokeWidth={2.5} className="pipeline-spinner" />
                  Processing…
                </span>
              )}
            </div>
          </div>
          <PipelineDiagram running={running} result={result} renderTip={(text) => <InfoTip text={text} />} />
        </div>

        {/* Results */}
        {running && !result && <RunningSkeleton />}
        {result && (
          <div className="animate-fade-in">
            <RunSaveStatus result={result} onSave={() => requestSave()} />
            <CurrentResults result={result} onCreateTicket={(stationId, date) => {
              const open = () => { setCreateStation(stationId); setCreateDate(date); };
              if (result.history_saved) open(); else requestSave(open);
            }} />
          </div>
        )}
        {!result && !running && <EmptyState />}
      </div>

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

// ─── Supporting components ────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", gap: 12, textAlign: "center", background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: "var(--r-xl)" }}>
      <div style={{ width: 44, height: 44, background: "var(--surface-sunken)", borderRadius: "var(--r-xl)", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
        <FileBarChart2 size={20} />
      </div>
      <h4 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>No results yet</h4>
    </div>
  );
}

function RunningSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 24px 24px", gap: 10, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)" }}>
      <div style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "var(--surface-sunken)", border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>
        <Loader2 size={14} style={{ color: "var(--text-muted)", animation: "spin 700ms linear infinite" }} />
      </div>
      <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Running Zone A → B → C…</p>
      <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>Cleaning and grouping — this stays quick for normal sized files.</p>
    </div>
  );
}


function CurrentResults({ result, onCreateTicket }: { result: ProcessResult; onCreateTicket?: (stationId: string, date?: string) => void }) {
  const { reviews, setReview } = useZones();
  const saved = useHistoryReviews(result.history_saved ? result.run_id ?? null : null);
  const persistent = !!result.history_saved;
  return <>
    {persistent && <ReviewSaveStatus state={saved} />}
    <ZoneResults result={result} reviews={persistent ? saved.reviews : reviews}
      onReview={persistent ? (saved.ready ? saved.saveReview : undefined) : !result.run_id ? setReview : undefined}
      reviewsReady={!persistent || saved.ready} reviewBusy={saved.saving} onCreateTicket={onCreateTicket} />
  </>;
}
