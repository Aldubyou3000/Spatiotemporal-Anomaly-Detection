"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { TechnicianWorkloadBadge } from "@/components/tickets/TechnicianWorkloadBadge";
import { byWorkload } from "@/lib/technicianWorkload";
import { ticketsApi } from "@/lib/api/tickets";
import { invalidateTicketLists } from "@/hooks/useTickets";
import { invalidateHistory } from "@/hooks/useHistory";
import type { AnomalyZone, Technician, TicketPriority } from "@/types/tickets";
export function CreateTicketModal({
  stationId,
  technicians,
  onClose,
  file,
  runId,
  readingDate,
}: {
  stationId: string;
  technicians: Technician[];
  onClose: () => void;
  file: File | null;
  runId?: string;
  readingDate?: string;
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
        run_id: runId,
        reading_date: readingDate,
      });
      if (file && attachFile) { try { await ticketsApi.uploadAttachment(ticket.id, file); } catch { /* non-fatal */ } }
      toast.success(`Ticket TKT-${ticket.ticket_number} dispatched`, {
        description: `${selectedTechs.length} technician${selectedTechs.length !== 1 ? "s" : ""} notified for ${stationInput.trim()}.`,
      });
      setDone(true);
      void invalidateTicketLists();
      void invalidateHistory();
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
                <div style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "var(--font-xs)", fontWeight: 700, background: active ? "var(--brand)" : done ? "var(--success)" : "var(--surface-sunken)", color: active || done ? "#fff" : "var(--text-muted)", border: `1.5px solid ${active ? "var(--brand)" : done ? "var(--success)" : "var(--border)"}`, flexShrink: 0 }}>
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
              <Input label="Station ID" readOnly={!!runId} value={stationInput} onChange={(e) => setStationInput(e.target.value)} required />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>Zone</label>
                <Select
                  value={zone}
                  onChange={setZone}
                  options={[
                    { value: "", label: "— none —" },
                    { value: "A", label: "Zone A" },
                    { value: "B", label: "Zone B" },
                    { value: "C", label: "Zone C" },
                  ]}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>Priority</label>
              <Select
                value={priority}
                onChange={(v) => setPriority(v as TicketPriority)}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
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
            {/* Warning banner — refined with icon and balanced padding */}
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--r-md)", background: "color-mix(in oklab, var(--warning) 8%, var(--surface))", border: "1px solid color-mix(in oklab, var(--warning) 24%, transparent)" }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--warning-soft)", border: "1px solid color-mix(in oklab, var(--warning) 18%, transparent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <AlertTriangle size={13} strokeWidth={2.2} style={{ color: "var(--warning-on)" }} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--warning-on)", lineHeight: 1.3 }}>
                  Dispatch work order?
                </p>
                <p style={{ margin: "4px 0 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  This will appear as an active work order on the selected technician{selectedTechs.length !== 1 ? "s'" : "'s"} mobile devices immediately. Make sure all details are correct before proceeding.
                </p>
              </div>
            </div>

            {/* Summary — grid layout prevents label/value overlap */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                { label: "Title", value: title.trim() || "—" },
                { label: "Station", value: stationInput.trim() || "—" },
                { label: "Priority", value: priority.charAt(0).toUpperCase() + priority.slice(1) },
                { label: "Zone", value: zone || "—" },
                {
                  label: selectedTechs.length === 1 ? "Technician" : "Technicians",
                  value: selectedTechs.length ? selectedTechs.map((t) => t.full_name).join(", ") : "—",
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "92px 1fr",
                    gap: 12,
                    alignItems: "start",
                    padding: "9px 12px",
                    borderRadius: "var(--r-md)",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--divider)",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--font-xs)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      lineHeight: "18px",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-sm)",
                      fontWeight: 500,
                      color: "var(--text)",
                      lineHeight: 1.45,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {file && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-md)", border: `1px solid ${attachFile ? "var(--brand)" : "var(--border)"}`, background: attachFile ? "color-mix(in oklab, var(--brand) 6%, var(--surface))" : "var(--surface)", cursor: "pointer", transition: "border-color 0.15s, background 0.15s", minWidth: 0 }}>
                <input type="checkbox" checked={attachFile} onChange={(e) => setAttachFile(e.target.checked)} style={{ accentColor: "var(--brand)", width: 15, height: 15, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", lineHeight: 1.3 }}>Attach anomaly data file</p>
                  <p style={{ margin: "2px 0 0", fontSize: "var(--font-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name} · {Math.round(file.size / 1024)} KB</p>
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
              <span style={{ fontFamily: "var(--font-ui)" }}>{stationInput.trim()}</span> will be sent to{" "}
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
