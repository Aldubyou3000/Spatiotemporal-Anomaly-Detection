"use client";

import { useMemo, useState } from "react";
import { useTicketTechnicians } from "@/hooks/useTechnicians";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Download,
  FileBarChart2,
  HelpCircle,
  LayoutGrid,
  Loader2,
  MapPin,
  Table2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useZones } from "@/context/ZonesContext";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { TechnicianWorkloadBadge } from "@/components/tickets/TechnicianWorkloadBadge";
import { byWorkload } from "@/lib/technicianWorkload";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/Tabs";
import { Header } from "@/components/dashboard/Header";
import { FileUpload } from "@/components/zones/FileUpload";
import { DataTable } from "@/components/zones/DataTable";
import type { FilterField } from "@/components/zones/DataTable";
import { OverviewTab } from "@/components/zones/OverviewTab";
import { NeighborGroupsTab } from "@/components/zones/NeighborGroupsTab";
import { AnomalyReportTab } from "@/components/zones/AnomalyReportTab";
import { zonesApi } from "@/lib/api/zones";
import { ticketsApi } from "@/lib/api/tickets";
import type { DailyReading, ProcessResult } from "@/types/zones";
import type { AnomalyZone, Technician, TicketPriority } from "@/types/tickets";
import { cn } from "@/lib/cn";

// ─── Info Tooltip ─────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  }

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      <HelpCircle
        size={13}
        strokeWidth={2}
        style={{ color: "var(--text-tertiary)", cursor: "help", flexShrink: 0 }}
      />
      {pos && (
        <span style={{
          position: "fixed",
          left: pos.x,
          top: pos.y - 8,
          transform: "translate(-50%, -100%)",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "8px 12px",
          fontSize: "var(--font-xs)", fontWeight: 400, color: "var(--text)",
          lineHeight: 1.6, whiteSpace: "normal", width: 230,
          boxShadow: "var(--shadow-lg)", zIndex: 9999, pointerEvents: "none",
          letterSpacing: "0.01em",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Create Ticket Modal (3-step) ─────────────────────────────────────────────

function CreateTicketModal({
  stationId,
  technicians,
  onClose,
  file,
}: {
  stationId: string;
  technicians: Technician[];
  onClose: () => void;
  file: File | null;
}) {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stationInput, setStationInput] = useState(stationId);
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [zone, setZone] = useState("C");
  const [attachFile, setAttachFile] = useState(!!file);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const step1Valid = !!title.trim() && !!stationInput.trim();
  const step2Valid = selectedTechIds.length > 0;

  const selectedTechs = technicians.filter((t) => selectedTechIds.includes(t.id));

  function toggleTech(id: string) {
    setSelectedTechIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    if (!step1Valid || !step2Valid) return;
    setConfirmOpen(false);
    setSaving(true); setError("");
    try {
      const ticket = await ticketsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        station_id: stationInput.trim(),
        priority,
        anomaly_zone: (zone || undefined) as AnomalyZone | undefined,
        technician_ids: selectedTechIds,
      });
      if (file && attachFile) { try { await ticketsApi.uploadAttachment(ticket.id, file); } catch { /* non-fatal */ } }
      toast.success(`Ticket TKT-${ticket.ticket_number} dispatched`, {
        description: `${selectedTechs.length} technician${selectedTechs.length !== 1 ? "s" : ""} notified for ${stationInput.trim()}.`,
      });
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create ticket.";
      setError(msg);
      toast.error("Couldn't dispatch ticket", { description: msg });
    } finally { setSaving(false); }
  }

  const selectStyle: React.CSSProperties = {
    width: "100%", height: 34, padding: "0 12px",
    borderRadius: "var(--r-md)", border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text)",
    fontSize: "var(--font-sm)", outline: "none",
    boxShadow: "var(--shadow-xs)", fontFamily: "inherit",
    appearance: "none" as const,
  };

  if (done) {
    return (
      <Modal title="Create Ticket" onClose={onClose}>
        <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--success-soft)", display: "grid", placeItems: "center" }}>
            <CheckCircle2 size={22} style={{ color: "var(--success-on)" }} />
          </div>
          <p style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Work order dispatched</p>
          <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
            {file && attachFile ? "Anomaly data file attached. " : ""}
            {selectedTechs.length} technician{selectedTechs.length !== 1 ? "s" : ""} notified.
            Go to the Tickets tab to track progress.
          </p>
        </div>
      </Modal>
    );
  }

  const STEPS = [
    { n: 1 as const, label: "Details" },
    { n: 2 as const, label: "Assign" },
    { n: 3 as const, label: "Confirm" },
  ];

  return (
    <Modal
      title="Create Ticket"
      subtitle={step === 1 ? "Step 1 of 3 — Ticket details" : step === 2 ? "Step 2 of 3 — Assign technicians" : "Step 3 of 3 — Confirm dispatch"}
      onClose={!saving ? onClose : undefined as unknown as () => void}
    >
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 24px 0", borderBottom: "1px solid var(--divider)" }}>
        {STEPS.map((s, i) => {
          const active = s.n === step;
          const done = s.n < step;
          return (
            <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 0", cursor: done ? "pointer" : "default" }} onClick={() => { if (done) setStep(s.n); }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, background: active ? "var(--brand)" : done ? "var(--success)" : "var(--surface-sunken)", color: active || done ? "#fff" : "var(--text-muted)", border: `1.5px solid ${active ? "var(--brand)" : done ? "var(--success)" : "var(--border)"}`, flexShrink: 0 }}>
                  {done ? <CheckCircle2 size={11} strokeWidth={3} /> : s.n}
                </div>
                <span style={{ fontSize: "var(--font-xs)", fontWeight: active ? 600 : 500, color: active ? "var(--text)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: "var(--divider)", margin: "0 8px" }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* ── Step 1: Details ── */}
        {step === 1 && (
          <>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Describe the anomaly or issue" required autoFocus />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Station ID" value={stationInput} onChange={(e) => setStationInput(e.target.value)} required />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>Zone</label>
                <select value={zone} onChange={(e) => setZone(e.target.value)} style={selectStyle}>
                  <option value="">— none —</option>
                  <option value="A">Zone A</option>
                  <option value="B">Zone B</option>
                  <option value="C">Zone C</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} style={selectStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes, context, or anomaly details…" rows={3} style={{ ...selectStyle, height: "auto", padding: "8px 12px", resize: "none" }} />
            </div>
          </>
        )}

        {/* ── Step 2: Assign technicians ── */}
        {step === 2 && (
          <>
            <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-secondary)" }}>
              Select one or more technicians to dispatch to this site. All selected technicians will see the ticket on their mobile devices immediately. Lightest current workload is listed first.
            </p>
            {technicians.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>No active technicians found.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {[...technicians].sort(byWorkload).map((t) => {
                  const checked = selectedTechIds.includes(t.id);
                  return (
                    <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-md)", border: `1px solid ${checked ? "var(--brand)" : "var(--border)"}`, background: checked ? "color-mix(in oklab, var(--brand) 6%, var(--surface))" : "var(--surface-sunken)", cursor: "pointer", transition: "border-color 0.12s, background 0.12s" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTech(t.id)} style={{ accentColor: "var(--brand)", width: 14, height: 14, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>{t.full_name}</p>
                        {t.station_ids?.length > 0 && (
                          <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>Stations: {t.station_ids.slice(0, 3).join(", ")}{t.station_ids.length > 3 ? ` +${t.station_ids.length - 3}` : ""}</p>
                        )}
                      </div>
                      <TechnicianWorkloadBadge tech={t} showBreakdown />
                    </label>
                  );
                })}
              </div>
            )}
            {selectedTechIds.length > 0 && (
              <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
                {selectedTechIds.length} technician{selectedTechIds.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </>
        )}

        {/* ── Step 3: Confirm dispatch ── */}
        {step === 3 && (
          <>
            {/* Warning banner */}
            <div style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "color-mix(in oklab, var(--warning) 8%, var(--surface))", border: "1px solid color-mix(in oklab, var(--warning) 30%, transparent)" }}>
              <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--warning-on)" }}>
                Dispatch work order?
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                This will appear as an active work order on the selected technician{selectedTechs.length !== 1 ? "s'" : "'s"} mobile devices immediately. Make sure all details are correct before proceeding.
              </p>
            </div>

            {/* Summary */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Title", value: title.trim() },
                { label: "Station", value: stationInput.trim() },
                { label: "Priority", value: priority.charAt(0).toUpperCase() + priority.slice(1) },
                { label: "Zone", value: zone || "—" },
                { label: "Technicians", value: selectedTechs.map((t) => t.full_name).join(", ") },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", gap: 12, padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--surface-sunken)", border: "1px solid var(--divider)" }}>
                  <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", width: 72, flexShrink: 0, paddingTop: 1 }}>{label}</span>
                  <span style={{ fontSize: "var(--font-sm)", color: "var(--text)", wordBreak: "break-word" }}>{value}</span>
                </div>
              ))}
            </div>

            {file && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-md)", border: `1px solid ${attachFile ? "var(--brand)" : "var(--border)"}`, background: attachFile ? "color-mix(in oklab, var(--brand) 6%, var(--surface))" : "var(--surface)", cursor: "pointer" }}>
                <input type="checkbox" checked={attachFile} onChange={(e) => setAttachFile(e.target.checked)} style={{ accentColor: "var(--brand)", width: 15, height: 15, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>Attach anomaly data file</p>
                  <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name} · {Math.round(file.size / 1024)} KB</p>
                </div>
              </label>
            )}

            {error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid rgba(220,38,38,0.2)" }}>
                <AlertTriangle size={13} style={{ color: "var(--danger-on)", flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--danger-on)" }}>{error}</p>
              </div>
            )}
          </>
        )}
      </div>

      <ModalFooter>
        {step === 1 && (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={() => setStep(2)} disabled={!step1Valid}>Next: Assign →</Button>
          </>
        )}
        {step === 2 && (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>← Back</Button>
            <Button type="button" onClick={() => setStep(3)} disabled={!step2Valid}>Next: Review →</Button>
          </>
        )}
        {step === 3 && (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(2)} disabled={saving}>← Back</Button>
            <Button type="button" loading={saving} onClick={() => setConfirmOpen(true)}>
              {saving ? "Dispatching…" : `Dispatch to ${selectedTechs.length} technician${selectedTechs.length !== 1 ? "s" : ""}`}
            </Button>
          </>
        )}
      </ModalFooter>

      {confirmOpen && (
        <ConfirmDialog
          title="Dispatch this work order?"
          message={
            <>
              A ticket for <strong style={{ color: "var(--text)" }}>{title.trim()}</strong> at station{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>{stationInput.trim()}</span> will be sent to{" "}
              <strong style={{ color: "var(--text)" }}>
                {selectedTechs.length} technician{selectedTechs.length !== 1 ? "s" : ""}
              </strong>{" "}
              ({selectedTechs.map((t) => t.full_name).join(", ")}). It appears on their mobile devices immediately.
            </>
          }
          confirmLabel="Dispatch"
          onConfirm={handleCreate}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </Modal>
  );
}

// ─── Pipeline Diagram ─────────────────────────────────────────────────────────

function PipelineDiagram({
  running, activeStage, progress, result,
}: {
  running: boolean;
  activeStage: 0 | 1 | 2;
  progress: number;
  result: ProcessResult | null;
}) {
  const stages = [
    {
      key: "a", idx: 0 as const,
      title: "Zone A", subtitle: "Data Cleaning",
      desc: "Linear interpolation · gap exclusion",
      tip: "Converts hourly readings to daily totals, fills single-day gaps using linear interpolation, and drops stations with too many missing values.",
      icon: <CheckCircle2 size={16} strokeWidth={1.75} />,
      color: "var(--success)", soft: "var(--success-soft)", on: "var(--success-on)",
      count: result ? result.cleaned_data.length : null,
    },
    {
      key: "b", idx: 1 as const,
      title: "Zone B", subtitle: "Spatial Grouping",
      desc: "Haversine distance · neighbor graph",
      tip: "Groups stations by geographic proximity using the Haversine formula. Each station is assigned its nearest neighbors for context in the anomaly step.",
      icon: <Clock size={16} strokeWidth={1.75} />,
      color: "var(--warning)", soft: "var(--warning-soft)", on: "var(--warning-on)",
      count: result ? result.neighbors.length : null,
    },
    {
      key: "c", idx: 2 as const,
      title: "Zone C", subtitle: "Anomaly Detection",
      desc: "LOF · RobustScaler · sklearn",
      tip: "Runs Local Outlier Factor (LOF) on each station's rainfall using RobustScaler normalization. Readings that deviate significantly from their spatial neighbors are flagged as anomalies.",
      icon: <MapPin size={16} strokeWidth={1.75} />,
      color: "var(--danger)", soft: "var(--danger-soft)", on: "var(--danger-on)",
      count: result ? result.flagged_data.filter((r) => r.is_anomaly).length : null,
    },
  ];

  const hasResult = result !== null;

  // Per-stage progress: each stage owns 1/3 of total progress (0-33, 33-66, 66-100)
  function stageProgress(idx: number): number {
    const lo = idx * 33.33;
    const hi = (idx + 1) * 33.33;
    if (progress <= lo) return 0;
    if (progress >= hi) return 100;
    return ((progress - lo) / (hi - lo)) * 100;
  }

  return (
    <div style={{ padding: "20px 24px 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr 28px 1fr", gap: 8, alignItems: "stretch" }}>
        {stages.map((s, i) => {
          const isDone  = hasResult || (running && activeStage > s.idx);
          const isActive = running && activeStage === s.idx;
          const isIdle  = !running && !hasResult;
          const barWidth = isActive ? stageProgress(s.idx) : isDone ? 100 : 0;
          const connectorActive = running && activeStage >= s.idx;

          return (
            <div key={s.key} style={{ display: "contents" }}>
              <div style={{
                padding: "16px 18px",
                borderRadius: "var(--r-lg)",
                background: isActive ? s.soft : "var(--surface-alt)",
                border: `1px solid ${isActive || isDone ? s.color : "var(--border)"}`,
                transition: "background .25s ease, border-color .25s ease",
                position: "relative", overflow: "hidden",
              }}>
                {/* Row 1 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Icon chip */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: isDone || isActive ? s.color : "var(--surface-sunken)",
                      color: isDone || isActive ? "white" : "var(--text-muted)",
                      display: "grid", placeItems: "center",
                      flexShrink: 0,
                      transition: "background .25s ease, color .25s ease",
                    }}>
                      {isDone ? <CheckCircle2 size={14} strokeWidth={2.5} /> : s.icon}
                    </div>
                    <div style={{ lineHeight: 1.2 }}>
                      <div style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 5 }}>
                        {s.title}
                        <InfoTip text={s.tip} />
                      </div>
                      <div style={{ fontSize: "var(--font-xs)", color: isActive || isDone ? s.color : "var(--text-muted)", transition: "color .25s ease" }}>{s.subtitle}</div>
                    </div>
                  </div>
                  {/* Count badge */}
                  <span style={{
                    fontSize: "var(--font-xs)", fontWeight: 500,
                    color: isDone ? s.on : "var(--text-tertiary)",
                    background: isDone ? s.soft : "transparent",
                    padding: isDone ? "1px 7px" : "0",
                    borderRadius: "var(--r-sm)",
                    fontVariantNumeric: "tabular-nums",
                    transition: "color .25s ease, background .25s ease",
                    border: isDone ? `1px solid ${s.color}33` : "1px solid transparent",
                  }}>
                    {s.count != null ? s.count.toLocaleString() : "—"}
                  </span>
                </div>

                {/* Row 2 — description */}
                <div style={{ fontSize: "var(--font-sm)", color: isIdle ? "var(--text-tertiary)" : "var(--text-secondary)", lineHeight: 1.4, transition: "color .25s ease" }}>
                  {s.desc}
                </div>

                {/* Progress bar — only while this stage is actively running */}
                {isActive && (
                  <div style={{
                    position: "absolute", left: 0, bottom: 0, height: 2,
                    width: `${barWidth}%`,
                    background: s.color,
                    transition: "width .2s ease",
                  }} />
                )}
              </div>

              {/* Connector arrow */}
              {i < stages.length - 1 && (
                <div style={{ display: "grid", placeItems: "center" }}>
                  <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
                    <line x1="2" y1="10" x2="26" y2="10"
                      stroke="var(--border-strong)" strokeWidth="1.5"
                      strokeDasharray={connectorActive ? "3 3" : "0"}>
                      {connectorActive && (
                        <animate attributeName="stroke-dashoffset" from="6" to="0" dur="0.5s" repeatCount="indefinite" />
                      )}
                    </line>
                    <path d="M22 6 L26 10 L22 14" stroke="var(--border-strong)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const { loading: authLoading } = useAuth();
  const toast = useToast();
  const {
    file, setFile,
    contamination, setContamination,
    running, setRunning,
    activeStage, setActiveStage,
    progress, setProgress,
    result, setResult,
    error, setError,
    configOpen, setConfigOpen,
    resetSession,
  } = useZones();
  const { technicians } = useTicketTechnicians();
  const [createStation, setCreateStation] = useState<string | null>(null);

  async function handleProcess() {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    setActiveStage(0);
    setProgress(0);

    // Start the animation ticker — organic pacing per spec
    let p = 0;
    const ticker = setInterval(() => {
      p += 4 + Math.random() * 8;
      const clamped = Math.min(99, p); // hold at 99 until API resolves
      setProgress(clamped);
      if      (clamped >= 33 && clamped < 66) setActiveStage(1);
      else if (clamped >= 66)                  setActiveStage(2);
    }, 110);

    try {
      const data = await zonesApi.process(file, contamination);
      clearInterval(ticker);
      setProgress(100);
      setActiveStage(2);
      setResult(data);
      setConfigOpen(false);
      const anomalies = data.flagged_data.filter((r) => r.is_anomaly).length;
      toast.success("Pipeline complete", {
        description: `${data.cleaned_data.length.toLocaleString()} readings cleaned · ${anomalies.toLocaleString()} anomal${anomalies === 1 ? "y" : "ies"} flagged.`,
      });
    } catch (err) {
      clearInterval(ticker);
      const msg = err instanceof Error ? err.message : "Failed to process file.";
      setError(msg);
      toast.error("Pipeline failed", { description: msg });
    } finally {
      setRunning(false);
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
      <Header
        title="Zones"
        description="Upload a station CSV and detect rainfall anomalies."
        live
      />

      <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: "var(--gap-section)" }}>

        {/* Run controls + upload (collapsible) */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)", overflow: "hidden" }}>
          {/* Toggle header */}
          <button
            onClick={() => setConfigOpen(!configOpen)}
            className="card-toggle"
            style={{
              padding: "12px 20px",
              borderBottom: configOpen ? "1px solid var(--divider)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ChevronRight
                size={14}
                style={{ color: "var(--text-muted)", transition: "transform 0.2s ease", transform: configOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}
              />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>
                Pipeline configuration
              </span>
              {!configOpen && file && (
                <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", background: "var(--surface-sunken)", padding: "1px 8px", borderRadius: "var(--r-sm)", fontFamily: "var(--font-mono)" }}>
                  {file.name} · contamination = {contamination.toFixed(2)}
                </span>
              )}
              {!configOpen && !file && (
                <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>No file selected</span>
              )}
            </div>
            {result && !configOpen && (
              <span style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 500 }}>Results ready</span>
            )}
          </button>

          {/* Collapsible body */}
          {configOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-card)", padding: "16px 20px 20px" }}>
              {/* File upload */}
              <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)" }}>
                  <h3 style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Upload station data</h3>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <FileUpload file={file} onFileChange={setFile} onRemove={resetSession} disabled={running} />
                </div>
              </div>

              {/* Controls */}
              <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--divider)" }}>
                  <h3 style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Run configuration</h3>
                </div>
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        LOF contamination
                        <InfoTip text="The expected proportion of anomalies in your data. Lower values (e.g. 0.05) flag only the most extreme outliers. Higher values (e.g. 0.20) flag more readings as suspicious. Start conservative and increase if anomalies are missed." />
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{contamination.toFixed(2)}</span>
                    </div>
                    <input
                      type="range" min={0.01} max={0.30} step={0.01}
                      value={contamination} onChange={(e) => setContamination(Number(e.target.value))}
                      disabled={running} style={{ width: "100%", accentColor: "var(--brand)" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      <span>0.01 — conservative</span>
                      <span>0.30 — aggressive</span>
                    </div>
                  </div>

                  <Button
                    size="lg" style={{ width: "100%" }}
                    disabled={!file || running} loading={running}
                    onClick={handleProcess}
                  >
                    {running ? "Processing…" : "Run Pipeline"}
                  </Button>

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
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h3 style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Detection pipeline</h3>
              <InfoTip text="CSV → Zone A cleans and validates readings → Zone B groups stations by proximity → Zone C runs Local Outlier Factor to flag anomalies." />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--text-muted)", background: "var(--surface-sunken)", padding: "2px 8px", borderRadius: "var(--r-sm)", fontFamily: "var(--font-mono)" }}>
                contamination = {contamination.toFixed(2)}
              </span>
              {running && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--success-on)", padding: "2px 8px", borderRadius: "var(--r-full)", background: "var(--success-soft)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success)", animation: "live-pulse 2s ease-out infinite" }} />
                  Running
                </span>
              )}
            </div>
          </div>
          <PipelineDiagram running={running} activeStage={activeStage} progress={progress} result={result} />
        </div>

        {/* Results */}
        {running && !result && <RunningSkeleton />}
        {result && (
          <div className="animate-fade-in-up">
            <Results result={result} onCreateTicket={(stationId) => setCreateStation(stationId)} />
          </div>
        )}
        {!result && !running && <EmptyState />}
      </div>

      {createStation !== null && (
        <CreateTicketModal
          stationId={createStation} technicians={technicians}
          onClose={() => setCreateStation(null)} file={file}
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", gap: 12, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
      <Loader2 size={20} style={{ color: "var(--brand)", animation: "spin 700ms linear infinite" }} />
      <p style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Running Zone A → B → C…</p>
      <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Cleaning, building spatial neighbourhoods, then fitting LOF per station.</p>
    </div>
  );
}

function Results({ result, onCreateTicket }: { result: ProcessResult; onCreateTicket: (stationId: string) => void }) {
  const cleanedColumns = useMemo(() => [
    { key: "station_id" as const, header: "Station", mono: true, width: "20%" },
    { key: "date" as const, header: "Date", mono: true, width: "16%" },
    { key: "latitude" as const, header: "Latitude", mono: true, align: "right" as const, width: "14%" },
    { key: "longitude" as const, header: "Longitude", mono: true, align: "right" as const, width: "14%" },
    { key: "rainfall" as const, header: "Rainfall (mm)", mono: true, align: "right" as const, width: "14%" },
    {
      key: "interpolated_flag" as const, header: "Interpolated", align: "center" as const,
      render: (value: unknown) => value
        ? <Badge tone="warning">Yes</Badge>
        : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
    },
  ], []);

  const flaggedColumns = useMemo(() => [
    { key: "station_id" as const, header: "Station", mono: true, width: "16%" },
    { key: "date" as const, header: "Date", mono: true, width: "14%" },
    { key: "rainfall" as const, header: "Rainfall (mm)", mono: true, align: "right" as const, width: "14%" },
    {
      key: "lof_score" as const, header: "LOF Score", mono: true, align: "right" as const,
      render: (v: unknown) => typeof v === "number" ? v.toFixed(3) : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
    },
    {
      key: "is_anomaly" as const, header: "Status", align: "center" as const,
      render: (v: unknown) => v
        ? <Badge tone="danger" dot>Anomaly</Badge>
        : <Badge tone="success" dot>Normal</Badge>,
    },
  ], []);

  const rawColumns = useMemo(() => {
    if (result.raw_preview.length === 0) return [];
    const sample = result.raw_preview[0];
    const HEADER_MAP: Record<string, string> = {
      station_id: "Station",
      date: "Date",
      latitude: "Latitude",
      longitude: "Longitude",
      rainfall: "Rainfall (mm)",
      rainfall_mm: "Rainfall (mm)",
    };
    return Object.keys(sample).map((k) => ({
      key: k as keyof typeof sample & string,
      header: HEADER_MAP[k] ?? k,
      mono: true,
      align: typeof sample[k] === "number" ? ("right" as const) : ("left" as const),
    }));
  }, [result.raw_preview]);

  // Raw table: prefer station/date columns; fall back to all string-valued columns
  const rawSearchKeys = useMemo(() => {
    if (result.raw_preview.length === 0) return undefined;
    const sample = result.raw_preview[0];
    const keys = Object.keys(sample);
    const preferred = keys.filter(
      (k) => k === "station_id" || k === "date" ||
             k.toLowerCase().includes("station") ||
             k.toLowerCase().includes("date"),
    );
    if (preferred.length > 0) return preferred as (keyof Record<string, unknown> & string)[];
    // Fall back to columns whose values are strings
    return keys.filter((k) => typeof sample[k] === "string") as (keyof Record<string, unknown> & string)[];
  }, [result.raw_preview]);

  const cleanedFilterFields = useMemo<FilterField[]>(() => [
    {
      key: "interpolated_flag",
      label: "All readings",
      type: "select",
      options: [
        { value: "true",  label: "Interpolated only" },
        { value: "false", label: "Original only" },
      ],
    },
  ], []);

  const flaggedFilterFields = useMemo<FilterField[]>(() => [
    {
      key: "is_anomaly",
      label: "Status",
      type: "select",
      options: [
        { value: "true",  label: "Anomaly" },
        { value: "false", label: "Normal" },
      ],
    },
  ], []);

  return (
    <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)", padding: 4, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
      <Tabs defaultValue="overview">
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
          <TabsList className="px-4 pt-3" style={{ borderBottom: "none" }}>
            <Tab value="overview" icon={<LayoutGrid size={13} strokeWidth={2.4} />}>Overview &amp; Map</Tab>
            <Tab value="raw" icon={<Table2 size={13} strokeWidth={2.4} />}>Raw Data</Tab>
            <Tab value="cleaned" icon={<Activity size={13} strokeWidth={2.4} />}>Cleaned Data</Tab>
            <Tab value="neighbors" icon={<Compass size={13} strokeWidth={2.4} />}>Neighbor Groups</Tab>
            <Tab value="anomalies" icon={<AlertTriangle size={13} strokeWidth={2.4} />}>Anomaly Report</Tab>
          </TabsList>
          {/* Export buttons — pushed right, never forcing tab overflow */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 8, marginLeft: "auto", flexShrink: 0 }}>
            <button
              onClick={() => import("@/lib/csv").then((m) => m.downloadCsv("cleaned_data.csv", result.cleaned_data as unknown as Record<string, unknown>[]))}
              className="export-btn"
            >
              <Download size={12} strokeWidth={2.2} />
              Cleaned CSV
            </button>
            <button
              onClick={() => import("@/lib/csv").then((m) => m.downloadCsv("flagged_data.csv", result.flagged_data as unknown as Record<string, unknown>[]))}
              className="export-btn export-btn--primary"
            >
              <Download size={12} strokeWidth={2.2} />
              Flagged CSV
            </button>
          </div>
        </div>
        <div className={cn("px-5 pb-5")}>
          <TabPanel value="overview"><OverviewTab result={result} /></TabPanel>
          <TabPanel value="raw" className="pt-6">
            <DataTable data={result.raw_preview} columns={rawColumns} pageSize={10}
              caption={<>Showing first {result.raw_preview.length.toLocaleString()} of <span className="font-mono tabular">{result.raw_total_rows.toLocaleString()}</span> uploaded rows</>}
              emptyMessage="No rows in the uploaded file."
              searchKeys={rawSearchKeys} />
          </TabPanel>
          <TabPanel value="cleaned" className="pt-6">
            <DataTable<DailyReading> data={result.cleaned_data} columns={cleanedColumns} pageSize={10}
              caption={`After Zone A — ${result.cleaned_data.length.toLocaleString()} validated daily readings`}
              searchKeys={["station_id", "date"]}
              filterFields={cleanedFilterFields} />
          </TabPanel>
          <TabPanel value="neighbors"><NeighborGroupsTab neighbors={result.neighbors} /></TabPanel>
          <TabPanel value="anomalies">
            <AnomalyReportTab result={result} onCreateTicket={onCreateTicket} />
            <div style={{ marginTop: 32 }}>
              <DataTable<DailyReading>
                data={result.flagged_data.filter((r) => r.is_anomaly)} columns={flaggedColumns} pageSize={10}
                caption="All flagged anomaly events" emptyMessage="No anomalies — nothing to list."
                onDownload={() => import("@/lib/csv").then((m) => m.downloadCsv("anomalies.csv", result.flagged_data.filter((r) => r.is_anomaly) as unknown as Record<string, unknown>[]))}
                downloadLabel="Download anomalies"
                searchKeys={["station_id", "date"]}
                filterFields={flaggedFilterFields} />
            </div>
          </TabPanel>
        </div>
      </Tabs>
    </section>
  );
}
