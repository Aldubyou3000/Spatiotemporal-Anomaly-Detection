"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Compass,
  FileBarChart2,
  LayoutGrid,
  Loader2,
  PlayCircle,
  Plus,
  Settings2,
  Table2,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
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

// ─── Create Ticket Modal ─────────────────────────────────────────────────────

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
    if (!technicianId) {
      setError("A technician must be assigned before creating a ticket.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const ticket = await ticketsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        station_id: stationInput.trim(),
        priority,
        anomaly_zone: (zone || undefined) as AnomalyZone | undefined,
        technician_id: technicianId,
      });
      // Attach the uploaded CSV so the technician can access it
      if (file) {
        try {
          await ticketsApi.uploadAttachment(ticket.id, file);
        } catch {
          // Non-fatal — ticket was created, attachment upload failed silently
        }
      }
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!done ? onClose : undefined}
      />
      <div
        className="relative bg-surface border border-border rounded-2xl w-full max-w-lg p-6 animate-scale-in"
        style={{ boxShadow: "var(--shadow-xl, var(--shadow-lg))" }}
      >
        {done ? (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-success-soft grid place-items-center">
              <CheckCircle2 size={22} className="text-success" strokeWidth={2} />
            </div>
            <p className="font-display text-[16px] font-semibold text-text">Ticket created</p>
            <p className="text-[13px] text-text-secondary">
              Go to the Tickets tab to track progress.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-brand-soft grid place-items-center">
                  <Plus size={15} className="text-brand" strokeWidth={2.4} />
                </div>
                <h2 className="font-display text-[18px] font-semibold tracking-tight text-text">
                  Create Ticket
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-lg grid place-items-center text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Describe the anomaly or issue"
                required
                autoFocus
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Station ID"
                  value={stationInput}
                  onChange={(e) => setStationInput(e.target.value)}
                  required
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
                    Zone
                  </label>
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className={cn(
                      "h-11 px-3.5 rounded-lg bg-surface-alt text-text text-[14px]",
                      "border border-border-strong",
                      "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                    )}
                  >
                    <option value="">— none —</option>
                    <option value="A">Zone A</option>
                    <option value="B">Zone B</option>
                    <option value="C">Zone C</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TicketPriority)}
                    className={cn(
                      "h-11 px-3.5 rounded-lg bg-surface-alt text-text text-[14px]",
                      "border border-border-strong",
                      "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                    )}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
                    Assign Technician <span className="text-danger">*</span>
                  </label>
                  <select
                    value={technicianId}
                    onChange={(e) => setTechnicianId(e.target.value)}
                    required
                    className={cn(
                      "h-11 px-3.5 rounded-lg bg-surface-alt text-text text-[14px]",
                      "border border-border-strong",
                      "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                      !technicianId && "text-text-tertiary",
                    )}
                  >
                    <option value="" disabled>— select technician —</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes, context, or anomaly details…"
                  rows={3}
                  className={cn(
                    "px-3.5 py-2.5 rounded-lg bg-surface-alt text-text text-[14px] resize-none",
                    "border border-border-strong",
                    "placeholder:text-text-tertiary",
                    "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                  )}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-soft border border-danger/20">
                  <AlertTriangle size={13} className="text-danger shrink-0 mt-0.5" strokeWidth={2.4} />
                  <p className="text-[12px] text-danger">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" loading={saving}>
                  {saving ? "Creating…" : "Create Ticket"}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const { user, loading: authLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [contamination, setContamination] = useState(0.05);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [createStation, setCreateStation] = useState<string | null>(null);

  useEffect(() => {
    ticketsApi.listTechnicians().then(setTechnicians).catch(() => {});
  }, []);

  async function handleProcess() {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    try {
      const data = await zonesApi.process(file, contamination);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file.");
    } finally {
      setRunning(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-text-tertiary text-[13px] font-mono tabular">Loading session…</p>
      </div>
    );
  }

  return (
    <>
      <Header
        title="Zones Pipeline"
        description={`Welcome back, ${user?.full_name ?? "analyst"}. Process AWS station CSVs through Zone A → B → C.`}
      />

      <div className="px-8 py-8 max-w-[1400px] w-full mx-auto space-y-8">
        {/* Upload + Run */}
        <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 stagger">
          <div className="space-y-4">
            <SectionHeading
              icon={Activity}
              eyebrow="Step 1"
              title="Upload station data"
              description="CSV columns: station_id, date, latitude, longitude, rainfall (or rainfall_mm). Hourly readings are auto-aggregated."
            />
            <FileUpload file={file} onFileChange={setFile} disabled={running} />
          </div>

          <div className="space-y-4">
            <SectionHeading
              icon={Settings2}
              eyebrow="Step 2"
              title="Tune & run"
              description="LOF contamination controls how aggressive Zone C is at flagging outliers."
            />
            <div
              className="bg-surface border border-border rounded-xl p-5"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <label className="block">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
                    Contamination
                  </span>
                  <span className="font-mono tabular text-[14px] font-semibold text-text">
                    {contamination.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.01}
                  max={0.30}
                  step={0.01}
                  value={contamination}
                  onChange={(e) => setContamination(Number(e.target.value))}
                  disabled={running}
                  className="w-full accent-brand"
                />
                <div className="flex items-center justify-between font-mono tabular text-[10px] text-text-tertiary mt-1.5">
                  <span>0.01 — conservative</span>
                  <span>0.30 — aggressive</span>
                </div>
              </label>

              <Button
                size="lg"
                className="w-full mt-5"
                disabled={!file || running}
                loading={running}
                onClick={handleProcess}
              >
                {running ? (
                  "Processing…"
                ) : (
                  <>
                    <PlayCircle size={16} strokeWidth={2.4} />
                    Run Pipeline
                  </>
                )}
              </Button>

              {error && (
                <div className="mt-4 px-3 py-2.5 rounded-md bg-danger-soft border border-danger/20 flex items-start gap-2">
                  <AlertTriangle size={13} className="text-danger shrink-0 mt-0.5" strokeWidth={2.4} />
                  <p className="text-[12px] text-danger leading-relaxed">{error}</p>
                </div>
              )}
            </div>
          </div>
        </section>

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
          stationId={createStation}
          technicians={technicians}
          onClose={() => setCreateStation(null)}
          file={file}
        />
      )}
    </>
  );
}

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-brand-soft grid place-items-center shrink-0">
        <Icon size={16} className="text-brand" strokeWidth={2.4} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
          {eyebrow}
        </p>
        <h2 className="font-display text-[20px] font-semibold tracking-tight text-text leading-tight">
          {title}
        </h2>
        <p className="text-[13px] text-text-secondary mt-1 max-w-md">
          {description}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface border border-dashed border-border-strong rounded-xl py-16 text-center">
      <div className="h-12 w-12 rounded-xl bg-surface-muted grid place-items-center mx-auto mb-4">
        <FileBarChart2 size={20} className="text-text-tertiary" strokeWidth={2.2} />
      </div>
      <p className="text-[14px] font-medium text-text">No results yet</p>
      <p className="text-[12px] text-text-secondary mt-1">
        Upload a station CSV and run the pipeline to populate this view.
      </p>
    </div>
  );
}

function RunningSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-xl p-8 text-center">
      <Loader2 size={20} className="text-brand mx-auto mb-3 animate-spin" />
      <p className="text-[14px] font-medium text-text">Running Zone A → B → C…</p>
      <p className="text-[12px] text-text-secondary mt-1">
        Cleaning, building spatial neighborhoods, then fitting LOF per station.
      </p>
    </div>
  );
}

function Results({ result, onCreateTicket }: { result: ProcessResult; onCreateTicket: (stationId: string) => void }) {
  const cleanedColumns = useMemo(
    () => [
      { key: "station_id" as const, header: "Station", mono: true, width: "20%" },
      { key: "date" as const, header: "Date", mono: true, width: "16%" },
      { key: "latitude" as const, header: "Latitude", mono: true, align: "right" as const, width: "14%" },
      { key: "longitude" as const, header: "Longitude", mono: true, align: "right" as const, width: "14%" },
      {
        key: "rainfall" as const,
        header: "Rainfall (mm)",
        mono: true,
        align: "right" as const,
        width: "14%",
      },
      {
        key: "interpolated_flag" as const,
        header: "Interpolated",
        align: "center" as const,
        render: (value: unknown) =>
          value ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.06em] bg-warning-soft text-warning">
              Yes
            </span>
          ) : (
            <span className="text-text-tertiary">—</span>
          ),
      },
    ],
    [],
  );

  const flaggedColumns = useMemo(
    () => [
      { key: "station_id" as const, header: "Station", mono: true, width: "16%" },
      { key: "date" as const, header: "Date", mono: true, width: "14%" },
      {
        key: "rainfall" as const,
        header: "Rainfall (mm)",
        mono: true,
        align: "right" as const,
        width: "14%",
      },
      {
        key: "lof_score" as const,
        header: "LOF Score",
        mono: true,
        align: "right" as const,
        render: (v: unknown) =>
          typeof v === "number" ? v.toFixed(3) : <span className="text-text-tertiary">—</span>,
      },
      {
        key: "is_anomaly" as const,
        header: "Status",
        align: "center" as const,
        render: (v: unknown) =>
          v ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-danger-soft text-danger text-[11px] font-semibold uppercase tracking-[0.06em]">
              <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse-anom" />
              Anomaly
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft text-success text-[11px] font-semibold uppercase tracking-[0.06em]">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Normal
            </span>
          ),
      },
    ],
    [],
  );

  const rawColumns = useMemo(() => {
    if (result.raw_preview.length === 0) return [];
    const sample = result.raw_preview[0];
    return Object.keys(sample).map((k) => ({
      key: k as keyof typeof sample & string,
      header: k,
      mono: true,
      align: typeof sample[k] === "number" ? ("right" as const) : ("left" as const),
    }));
  }, [result.raw_preview]);

  return (
    <section
      className="bg-surface border border-border rounded-2xl p-1 animate-fade-in-up"
      style={{ boxShadow: "var(--shadow-md)" }}
    >
      <Tabs defaultValue="overview">
        <TabsList className="px-4 pt-3">
          <Tab value="overview" icon={<LayoutGrid size={13} strokeWidth={2.4} />}>
            Overview &amp; Map
          </Tab>
          <Tab value="raw" icon={<Table2 size={13} strokeWidth={2.4} />}>
            Raw Data
          </Tab>
          <Tab value="cleaned" icon={<Activity size={13} strokeWidth={2.4} />}>
            Cleaned Data
          </Tab>
          <Tab value="neighbors" icon={<Compass size={13} strokeWidth={2.4} />}>
            Neighbor Groups
          </Tab>
          <Tab value="anomalies" icon={<AlertTriangle size={13} strokeWidth={2.4} />}>
            Anomaly Report
          </Tab>
        </TabsList>

        <div className={cn("px-5 pb-5")}>
          <TabPanel value="overview">
            <OverviewTab result={result} />
          </TabPanel>

          <TabPanel value="raw" className="pt-6">
            <DataTable
              data={result.raw_preview}
              columns={rawColumns}
              pageSize={25}
              caption={
                <>
                  Showing first {result.raw_preview.length.toLocaleString()} of{" "}
                  <span className="font-mono tabular">
                    {result.raw_total_rows.toLocaleString()}
                  </span>{" "}
                  uploaded rows
                </>
              }
              emptyMessage="No rows in the uploaded file."
            />
          </TabPanel>

          <TabPanel value="cleaned" className="pt-6">
            <DataTable<DailyReading>
              data={result.cleaned_data}
              columns={cleanedColumns}
              pageSize={25}
              caption={`After Zone A — ${result.cleaned_data.length.toLocaleString()} validated daily readings`}
              onDownload={() =>
                import("@/lib/csv").then((m) =>
                  m.downloadCsv(
                    "cleaned_data.csv",
                    result.cleaned_data as unknown as Record<string, unknown>[],
                  ),
                )
              }
              downloadLabel="Download cleaned"
            />
          </TabPanel>

          <TabPanel value="neighbors">
            <NeighborGroupsTab neighbors={result.neighbors} />
          </TabPanel>

          <TabPanel value="anomalies">
            <AnomalyReportTab result={result} onCreateTicket={onCreateTicket} />
            <div className="mt-8">
              <DataTable<DailyReading>
                data={result.flagged_data.filter((r) => r.is_anomaly)}
                columns={flaggedColumns}
                pageSize={25}
                caption="All flagged anomaly events"
                emptyMessage="No anomalies — nothing to list."
                onDownload={() =>
                  import("@/lib/csv").then((m) =>
                    m.downloadCsv(
                      "anomalies.csv",
                      result.flagged_data.filter((r) => r.is_anomaly) as unknown as Record<string, unknown>[],
                    ),
                  )
                }
                downloadLabel="Download anomalies"
              />
            </div>
          </TabPanel>
        </div>
      </Tabs>
    </section>
  );
}
