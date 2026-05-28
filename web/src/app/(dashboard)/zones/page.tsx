"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Database,
  Download,
  FileBarChart2,
  HelpCircle,
  LayoutGrid,
  Loader2,
  MapPin,
  Plus,
  Table2,
  Ticket,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/Tabs";
import { Header } from "@/components/dashboard/Header";
import { FileUpload } from "@/components/zones/FileUpload";
import { DataTable } from "@/components/zones/DataTable";
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
          background: "var(--surface-overlay)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "7px 10px",
          fontSize: "var(--font-xs)", color: "var(--text-secondary)",
          lineHeight: 1.5, whiteSpace: "normal", width: 220,
          boxShadow: "var(--shadow-lg)", zIndex: 9999, pointerEvents: "none",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Create Ticket Modal ──────────────────────────────────────────────────────

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stationInput, setStationInput] = useState(stationId);
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [technicianId, setTechnicianId] = useState("");
  const [zone, setZone] = useState("C");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !stationInput.trim()) return;
    if (!technicianId) { setError("A technician must be assigned before creating a ticket."); return; }
    setSaving(true); setError("");
    try {
      const ticket = await ticketsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        station_id: stationInput.trim(),
        priority,
        anomaly_zone: (zone || undefined) as AnomalyZone | undefined,
        technician_id: technicianId,
      });
      if (file) { try { await ticketsApi.uploadAttachment(ticket.id, file); } catch { /* non-fatal */ } }
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket.");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!done ? onClose : undefined} />
      <div
        className="relative animate-scale-in"
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-2xl)", width: "100%", maxWidth: 480,
          padding: 24, boxShadow: "var(--shadow-xl)",
        }}
      >
        {done ? (
          <div style={{ padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--success-soft)", display: "grid", placeItems: "center" }}>
              <CheckCircle2 size={22} style={{ color: "var(--success-on)" }} />
            </div>
            <p style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Ticket created</p>
            <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Go to the Tickets tab to track progress.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "var(--r-md)", background: "var(--brand-soft)", display: "grid", placeItems: "center" }}>
                  <Plus size={15} style={{ color: "var(--on-brand-soft)" }} />
                </div>
                <h2 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Create Ticket</h2>
              </div>
              <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "var(--r-md)", border: 0, background: "transparent", color: "var(--text-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} style={selectStyle}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>
                    Assign Technician <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} required style={selectStyle}>
                    <option value="" disabled>— select technician —</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>Description</label>
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes, context, or anomaly details…" rows={3}
                  style={{ ...selectStyle, height: "auto", padding: "8px 12px", resize: "none" }}
                />
              </div>

              {error && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid rgba(220,38,38,0.2)" }}>
                  <AlertTriangle size={13} style={{ color: "var(--danger-on)", flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--danger-on)" }}>{error}</p>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <Button type="button" variant="secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
                <Button type="submit" style={{ flex: 1 }} loading={saving}>{saving ? "Creating…" : "Create Ticket"}</Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
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

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, hint, icon, tone = "brand" }: {
  label: string; value: string | number; hint?: string;
  icon: React.ReactNode; tone?: "brand" | "red" | "green" | "amber";
}) {
  const colors: Record<string, { bg: string; color: string }> = {
    brand: { bg: "var(--brand-soft)",   color: "var(--on-brand-soft)" },
    red:   { bg: "var(--danger-soft)",  color: "var(--danger-on)" },
    green: { bg: "var(--success-soft)", color: "var(--success-on)" },
    amber: { bg: "var(--warning-soft)", color: "var(--warning-on)" },
  };
  const c = colors[tone];
  return (
    <div style={{ padding: "16px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", display: "flex", flexDirection: "column", gap: 6, boxShadow: "var(--shadow-xs)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>{label}</span>
        <div style={{ width: 26, height: 26, borderRadius: "var(--r-md)", background: c.bg, color: c.color, display: "grid", placeItems: "center" }}>{icon}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const { user, loading: authLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [contamination, setContamination] = useState(0.05);
  const [running, setRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<0 | 1 | 2>(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [createStation, setCreateStation] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);

  useEffect(() => { ticketsApi.listTechnicians().then(setTechnicians).catch(() => {}); }, []);

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
    } catch (err) {
      clearInterval(ticker);
      setError(err instanceof Error ? err.message : "Failed to process file.");
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

  const anomalyCount = result ? result.flagged_data.filter((r) => r.is_anomaly).length : 0;
  const stationCount = result ? [...new Set(result.cleaned_data.map((r) => r.station_id))].length : 0;

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
            onClick={() => setConfigOpen((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 20px", background: "transparent", border: 0, cursor: "pointer",
              borderBottom: configOpen ? "1px solid var(--divider)" : "none",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-alt)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
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
                  <FileUpload file={file} onFileChange={setFile} disabled={running} />
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
    return Object.keys(sample).map((k) => ({
      key: k as keyof typeof sample & string,
      header: k, mono: true,
      align: typeof sample[k] === "number" ? ("right" as const) : ("left" as const),
    }));
  }, [result.raw_preview]);

  return (
    <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)", padding: 4, boxShadow: "var(--shadow-md)" }}>
      <Tabs defaultValue="overview">
        <TabsList className="px-4 pt-3">
          <Tab value="overview" icon={<LayoutGrid size={13} strokeWidth={2.4} />}>Overview &amp; Map</Tab>
          <Tab value="raw" icon={<Table2 size={13} strokeWidth={2.4} />}>Raw Data</Tab>
          <Tab value="cleaned" icon={<Activity size={13} strokeWidth={2.4} />}>Cleaned Data</Tab>
          <Tab value="neighbors" icon={<Compass size={13} strokeWidth={2.4} />}>Neighbor Groups</Tab>
          <Tab value="anomalies" icon={<AlertTriangle size={13} strokeWidth={2.4} />}>Anomaly Report</Tab>

          {/* Export buttons — pinned to the right of the tab bar */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, paddingRight: 4, paddingBottom: 4 }}>
            <button
              onClick={() => import("@/lib/csv").then((m) => m.downloadCsv("cleaned_data.csv", result.cleaned_data as unknown as Record<string, unknown>[]))}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "var(--font-xs)", fontWeight: 500, cursor: "pointer", transition: "all 0.12s ease", fontFamily: "inherit", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            >
              <Download size={12} strokeWidth={2.2} />
              Cleaned CSV
            </button>
            <button
              onClick={() => import("@/lib/csv").then((m) => m.downloadCsv("flagged_data.csv", result.flagged_data as unknown as Record<string, unknown>[]))}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--brand)", color: "var(--brand-fg)", fontSize: "var(--font-xs)", fontWeight: 500, cursor: "pointer", transition: "all 0.12s ease", fontFamily: "inherit", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              <Download size={12} strokeWidth={2.2} />
              Flagged CSV
            </button>
          </div>
        </TabsList>
        <div className={cn("px-5 pb-5")}>
          <TabPanel value="overview"><OverviewTab result={result} /></TabPanel>
          <TabPanel value="raw" className="pt-6">
            <DataTable data={result.raw_preview} columns={rawColumns} pageSize={25}
              caption={<>Showing first {result.raw_preview.length.toLocaleString()} of <span className="font-mono tabular">{result.raw_total_rows.toLocaleString()}</span> uploaded rows</>}
              emptyMessage="No rows in the uploaded file." />
          </TabPanel>
          <TabPanel value="cleaned" className="pt-6">
            <DataTable<DailyReading> data={result.cleaned_data} columns={cleanedColumns} pageSize={25}
              caption={`After Zone A — ${result.cleaned_data.length.toLocaleString()} validated daily readings`}
              onDownload={() => import("@/lib/csv").then((m) => m.downloadCsv("cleaned_data.csv", result.cleaned_data as unknown as Record<string, unknown>[]))}
              downloadLabel="Download cleaned" />
          </TabPanel>
          <TabPanel value="neighbors"><NeighborGroupsTab neighbors={result.neighbors} /></TabPanel>
          <TabPanel value="anomalies">
            <AnomalyReportTab result={result} onCreateTicket={onCreateTicket} />
            <div style={{ marginTop: 32 }}>
              <DataTable<DailyReading>
                data={result.flagged_data.filter((r) => r.is_anomaly)} columns={flaggedColumns} pageSize={25}
                caption="All flagged anomaly events" emptyMessage="No anomalies — nothing to list."
                onDownload={() => import("@/lib/csv").then((m) => m.downloadCsv("anomalies.csv", result.flagged_data.filter((r) => r.is_anomaly) as unknown as Record<string, unknown>[]))}
                downloadLabel="Download anomalies" />
            </div>
          </TabPanel>
        </div>
      </Tabs>
    </section>
  );
}
