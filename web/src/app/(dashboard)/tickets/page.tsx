"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Ticket,
  User,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TicketRowSkeleton } from "@/components/ui/Skeleton";
import { ticketsApi } from "@/lib/api/tickets";
import type { TicketReport } from "@/lib/api/tickets";
import type {
  TicketAttachment,
  Technician,
  TicketDetail,
  TicketListItem,
  TicketPriority,
  TicketStatus,
} from "@/types/tickets";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<TicketStatus, string> = {
  assigned: "Assigned",
  "in-progress": "In Progress",
  completed: "Completed",
  verified: "Verified",
};

const STATUS_TONE: Record<TicketStatus, "neutral" | "brand" | "warning" | "success" | "teal"> = {
  assigned: "brand",
  "in-progress": "warning",
  completed: "success",
  verified: "teal",
};

const PRIORITY_TONE: Record<TicketPriority, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const ALL_STATUSES: TicketStatus[] = ["assigned", "in-progress", "completed", "verified"];
const ALL_PRIORITIES: TicketPriority[] = ["low", "medium", "high"];

const ANALYST_NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus>> = {
  assigned: "in-progress",
  "in-progress": "completed",
};

const SEVERITY_TONE: Record<string, "neutral" | "warning" | "danger"> = {
  low: "neutral", medium: "warning", high: "danger",
};

const AVATAR_COLORS = [
  ["#1E6FD9", "#EFF6FF"],
  ["#7C3AED", "#F5F3FF"],
  ["#0D9488", "#F0FDFA"],
  ["#D97706", "#FFFBEB"],
  ["#DC2626", "#FEF2F2"],
  ["#16A34A", "#F0FDF4"],
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const [bg, fg] = avatarColor(name);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, display: "grid", placeItems: "center", fontSize: size * 0.42, fontWeight: 700, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

// ─── Timeline steps ───────────────────────────────────────────────────────────

function StatusTimeline({ ticket }: { ticket: TicketDetail }) {
  const steps: { status: TicketStatus; ts: string | null; label: string }[] = [
    { status: "assigned", ts: ticket.assigned_at ?? ticket.created_at, label: "Assigned" },
    { status: "in-progress", ts: ticket.status === "in-progress" || ticket.status === "completed" || ticket.status === "verified" ? ticket.updated_at : null, label: "In Progress" },
    { status: "completed", ts: ticket.completed_at, label: "Completed" },
    { status: "verified", ts: ticket.verified_at, label: "Verified" },
  ];

  const currentIdx = ALL_STATUSES.indexOf(ticket.status);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
      {steps.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.status} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div style={{ position: "absolute", left: "50%", right: "-50%", top: 10, height: 2, background: done ? "var(--brand)" : "var(--border)", zIndex: 0 }} />
            )}
            {/* Dot */}
            <div style={{
              width: 20, height: 20, borderRadius: "50%", zIndex: 1, flexShrink: 0,
              background: done ? "var(--brand)" : active ? "var(--brand)" : "var(--surface)",
              border: `2px solid ${done || active ? "var(--brand)" : "var(--border)"}`,
              display: "grid", placeItems: "center",
            }}>
              {done && <CheckCircle2 size={10} style={{ color: "var(--brand-fg)" }} />}
              {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-fg)" }} />}
            </div>
            <div style={{ textAlign: "center", marginTop: 6 }}>
              <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: done || active ? "var(--text)" : "var(--text-muted)", letterSpacing: "0.02em" }}>{step.label}</div>
              {step.ts && (done || active) && (
                <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 2 }}>{fmtRelative(step.ts)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Anomaly Data Section ─────────────────────────────────────────────────────

function AnomalySection({ data, zone }: { data: Record<string, unknown> | null; zone: string | null }) {
  if (!zone && !data) return null;

  const entries = data ? Object.entries(data).filter(([, v]) => v !== null && v !== undefined) : [];

  return (
    <div style={{ borderRadius: "var(--r-lg)", border: "1px solid color-mix(in oklab, var(--brand) 25%, transparent)", background: "color-mix(in oklab, var(--brand) 5%, transparent)", padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: entries.length ? 12 : 0 }}>
        <span style={{ color: "var(--brand)" }}><Zap size={13} /></span>
        <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--brand)", textTransform: "uppercase" }}>
          Anomaly Detection {zone ? `· Zone ${zone}` : ""}
        </span>
      </div>
      {entries.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {entries.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>
                {k.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", fontFamily: typeof v === "number" ? "var(--font-mono)" : undefined }}>
                {typeof v === "number" ? v.toFixed(2) : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Report Section ───────────────────────────────────────────────────────────

function ReportSection({ ticketId }: { ticketId: string }) {
  const [report, setReport] = useState<TicketReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    ticketsApi.report(ticketId).then(setReport).catch(() => {}).finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
      <Loader2 size={12} style={{ animation: "spin 700ms linear infinite" }} /> Loading report…
    </div>
  );
  if (!report) return (
    <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>No inspection report submitted yet.</p>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Report header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Badge tone={report.analyst_approved ? "success" : "warning"} dot>
            {report.analyst_approved ? "Approved" : "Pending Review"}
          </Badge>
          {report.severity && <Badge tone={SEVERITY_TONE[report.severity]}>{report.severity} severity</Badge>}
        </div>
        {report.submitted_at && (
          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{fmtDate(report.submitted_at)}</span>
        )}
      </div>

      {/* Sensor status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--surface-alt)", border: "1px solid var(--border)" }}>
        <span style={{ color: report.sensor_working === null ? "var(--text-muted)" : report.sensor_working ? "var(--success)" : "var(--danger)" }}>
          {report.sensor_working ? <Wifi size={13} /> : <WifiOff size={13} />}
        </span>
        <span style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)" }}>
          Sensor working: <span style={{ fontWeight: 600, color: report.sensor_working === null ? "var(--text-muted)" : report.sensor_working ? "var(--success)" : "var(--danger)" }}>
            {report.sensor_working === null ? "Not recorded" : report.sensor_working ? "Yes" : "No"}
          </span>
        </span>
      </div>

      {/* Notes + Root cause */}
      {report.notes && (
        <div>
          <p style={{ margin: "0 0 4px", fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>Field Observations</p>
          <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{report.notes}</p>
        </div>
      )}
      {report.root_cause && (
        <div>
          <p style={{ margin: "0 0 4px", fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>Root Cause</p>
          <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{report.root_cause}</p>
        </div>
      )}

      {/* Analyst remarks */}
      <div style={{ padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: report.analyst_approved ? "color-mix(in oklab, var(--success) 8%, transparent)" : "var(--surface-alt)" }}>
        <p style={{ margin: "0 0 4px", fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>Analyst Remarks</p>
        {report.analyst_notes
          ? <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{report.analyst_notes}</p>
          : <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>{report.analyst_approved ? "No remarks added." : "Awaiting analyst review."}</p>}
      </div>

      {/* Photos */}
      {report.photos.length > 0 && (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}>
            <Camera size={11} /> Photos ({report.photos.length})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {report.photos.map((p, idx) => (
              <button key={p.id} onClick={() => setLightbox(p.photo_url)} style={{ borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)", cursor: "pointer", padding: 0, aspectRatio: "4/3", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${["#1E6FD9","#7C3AED","#0D9488","#D97706","#DC2626","#16A34A"][idx % 6]}, ${["#7C3AED","#22C55E","#22C55E","#DC2626","#0EA5E9","#0891B2"][idx % 6]})`, opacity: 0.7 }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photo_url} alt="Inspection photo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: 0, color: "white", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Inspection photo" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "var(--r-lg)", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ─── Attachments Section ──────────────────────────────────────────────────────

function AttachmentsSection({ ticketId }: { ticketId: string }) {
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ticketsApi.attachments(ticketId).then(setAttachments).catch(() => {}).finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
      <Loader2 size={12} style={{ animation: "spin 700ms linear infinite" }} /> Loading…
    </div>
  );
  if (attachments.length === 0) return <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>No attachments.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {attachments.map((att) => {
        const kb = att.file_size ? Math.round(att.file_size / 1024) : null;
        return (
          <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-alt)", textDecoration: "none", transition: "border-color 0.12s ease" }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
          >
            <FileText size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.file_name}</p>
              {kb !== null && <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{kb} KB</p>}
            </div>
            <ExternalLink size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </a>
        );
      })}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  ticket,
  technicians,
  onUpdated,
}: {
  ticket: TicketDetail;
  technicians: Technician[];
  onUpdated: (t: TicketDetail) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const slug = ticket.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
      await ticketsApi.downloadPdf(ticket.id, `ticket_${slug}.pdf`);
    } catch { /* silently ignore */ } finally { setDownloading(false); }
  }

  async function handleStatusChange(status: TicketStatus) {
    setSaving(true); setError("");
    try { onUpdated(await ticketsApi.update(ticket.id, { status })); }
    catch (err) { setError(err instanceof Error ? err.message : "Update failed."); }
    finally { setSaving(false); }
  }

  async function handleTechnicianChange(technician_id: string) {
    if (!technician_id) return;
    setSaving(true); setError("");
    try { onUpdated(await ticketsApi.update(ticket.id, { technician_id })); }
    catch (err) { setError(err instanceof Error ? err.message : "Update failed."); }
    finally { setSaving(false); }
  }

  const nextStatus = ANALYST_NEXT_STATUS[ticket.status] ?? null;
  const ticketNum = ticket.id.slice(0, 8).toUpperCase();

  return (
    <div
      key={ticket.id}
      className="animate-fade-in"
      style={{
        display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, minHeight: 0,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)",
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                TKT-{ticketNum}
              </span>
              <span style={{ color: "var(--divider)" }}>·</span>
              <Badge tone={STATUS_TONE[ticket.status]} dot>{STATUS_LABEL[ticket.status]}</Badge>
              <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
              {ticket.anomaly_zone && <Badge tone="info">Zone {ticket.anomaly_zone}</Badge>}
            </div>
            <h2 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)", lineHeight: 1.3 }}>
              {ticket.title}
            </h2>
          </div>
          <button
            onClick={handleDownloadPdf} disabled={downloading} title="Download PDF"
            style={{ width: 30, height: 30, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.12s ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            {downloading ? <Loader2 size={13} style={{ animation: "spin 700ms linear infinite" }} /> : <Download size={13} />}
          </button>
        </div>
      </div>

      {/* ── Properties strip ── */}
      <div style={{ padding: "12px 20px", background: "var(--surface-alt)", borderBottom: "1px solid var(--divider)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <div>
          <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Station</div>
          <div style={{ fontSize: "var(--font-sm)", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text)" }}>{ticket.station_id}</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Created</div>
          <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>{fmtDate(ticket.created_at)}</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Technician</div>
          {ticket.technician ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar name={ticket.technician.full_name} size={18} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.technician.full_name}</span>
            </div>
          ) : (
            <span style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Unassigned</span>
          )}
        </div>
        <div>
          <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Status</div>
          <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>{STATUS_LABEL[ticket.status]}</div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "20px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Progress timeline */}
        <Section title="Progress">
          <StatusTimeline ticket={ticket} />
        </Section>

        {/* Anomaly data */}
        {(ticket.anomaly_zone || ticket.anomaly_data) && (
          <AnomalySection data={ticket.anomaly_data} zone={ticket.anomaly_zone} />
        )}

        {ticket.description && (
          <Section title="Description">
            <p style={{ margin: 0, fontSize: "var(--font-sm)", lineHeight: 1.6, color: "var(--text-secondary)" }}>{ticket.description}</p>
          </Section>
        )}

        <Section title="Inspection Report">
          <ReportSection ticketId={ticket.id} />
        </Section>

        <Section title="Attachments">
          <AttachmentsSection ticketId={ticket.id} />
        </Section>

        {/* Reassign technician */}
        <Section title="Reassign Technician">
          <select
            value={ticket.technician_id ?? ""}
            onChange={(e) => handleTechnicianChange(e.target.value)}
            disabled={saving || ticket.status === "verified"}
            style={{
              width: "100%", height: 34, padding: "0 12px",
              borderRadius: "var(--r-md)", border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text)",
              fontSize: "var(--font-sm)", outline: "none",
              boxShadow: "var(--shadow-xs)", fontFamily: "inherit",
              opacity: (saving || ticket.status === "verified") ? 0.6 : 1,
            }}
          >
            {!ticket.technician_id && <option value="" disabled>— select technician —</option>}
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </Section>

        {/* Advance status */}
        <Section title="Advance Status">
          {nextStatus ? (
            <Button variant="secondary" disabled={saving} onClick={() => handleStatusChange(nextStatus)}>
              {saving ? <><Loader2 size={12} style={{ animation: "spin 700ms linear infinite" }} /> Saving…</> : `Mark as ${STATUS_LABEL[nextStatus]} →`}
            </Button>
          ) : (
            <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>
              {ticket.status === "completed" ? "Awaiting analyst approval via Inspection Reports."
                : ticket.status === "verified" ? "Ticket is fully closed."
                : "No further transitions available."}
            </p>
          )}
        </Section>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid rgba(220,38,38,0.2)" }}>
            <AlertTriangle size={13} style={{ color: "var(--danger-on)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--danger-on)" }}>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ─── Ticket Row ───────────────────────────────────────────────────────────────

function TicketRow({ ticket, selected, onClick }: { ticket: TicketListItem; selected: boolean; onClick: () => void }) {
  const ticketNum = ticket.id.slice(0, 8).toUpperCase();

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        padding: "11px 16px 11px 19px",
        background: selected ? "color-mix(in oklab, var(--brand) 8%, transparent)" : "transparent",
        border: 0, borderBottom: "1px solid var(--divider)",
        cursor: "pointer", position: "relative", display: "block",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--surface-alt)"; }}
      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {selected && (
        <div style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, background: "var(--brand)", borderRadius: 999 }} />
      )}

      {/* Top: ID + badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: "0.04em", flexShrink: 0 }}>
          TKT-{ticketNum}
        </span>
        <Badge tone={STATUS_TONE[ticket.status]} dot>{STATUS_LABEL[ticket.status]}</Badge>
        <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority}</Badge>
        {ticket.anomaly_zone && <Badge tone="info">Z-{ticket.anomaly_zone}</Badge>}
      </div>

      {/* Title */}
      <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", lineHeight: 1.35, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ticket.title}
      </div>

      {/* Footer: station + tech + date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ color: "var(--text-tertiary)" }}><MapPin size={10} /></span>
          <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", flexShrink: 0 }}>{ticket.station_id}</span>
          {ticket.technician && (
            <>
              <span style={{ color: "var(--divider)", flexShrink: 0 }}>·</span>
              <span style={{ color: "var(--text-tertiary)" }}><User size={10} /></span>
              <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.technician.full_name}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ color: "var(--text-tertiary)" }}><Clock size={10} /></span>
          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{fmtRelative(ticket.updated_at)}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const { loading: authLoading } = useAuth();
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [allItems, setAllItems] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStation, setFilterStation] = useState("");
  const [query, setQuery] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const PAGE_SIZE = 50;

  const fetchTickets = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [filtered, all] = await Promise.all([
        ticketsApi.list({
          status: filterStatus || undefined,
          priority: filterPriority || undefined,
          station_id: filterStation.trim() || undefined,
          limit: PAGE_SIZE,
        }),
        // Always fetch unfiltered totals so "All" count and header are stable
        (filterStatus || filterPriority || filterStation.trim())
          ? ticketsApi.list({ limit: PAGE_SIZE })
          : null,
      ]);
      setItems(filtered.items);
      if (all) {
        setAllItems(all.items);
      } else {
        setAllItems(filtered.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets.");
    } finally { setLoading(false); }
  }, [filterStatus, filterPriority, filterStation]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { ticketsApi.listTechnicians().then(setTechnicians).catch(() => {}); }, []);

  async function openTicket(id: string) {
    setSelectedId(id); setDetailLoading(true);
    try { setDetailTicket(await ticketsApi.get(id)); }
    catch { /* silently ignore */ }
    finally { setDetailLoading(false); }
  }

  function handleUpdated(t: TicketDetail) {
    setDetailTicket(t);
    setItems((prev) => prev.map((item) => item.id === t.id ? (t as unknown as TicketListItem) : item));
    setAllItems((prev) => prev.map((item) => item.id === t.id ? (t as unknown as TicketListItem) : item));
  }

  const filteredItems = query.trim()
    ? items.filter((t) => `${t.title} ${t.station_id} ${t.technician?.full_name ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    : items;

  // Status counts always derived from the unfiltered allItems so pills show true totals
  const statusCounts: Record<string, number> = { all: allItems.length };
  allItems.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1; });

  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)", fontFamily: "var(--font-mono)" }}>Loading session…</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Header
        title="Tickets"
        description={`${allItems.length.toLocaleString()} ticket${allItems.length !== 1 ? "s" : ""} · maintenance & anomaly follow-up`}
        live
        actions={
          <button
            onClick={fetchTickets}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "var(--font-sm)", cursor: "pointer", transition: "all 0.12s ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 700ms linear infinite" : "none" }} />
            Refresh
          </button>
        }
      />

      {/* ── Split view ── */}
      <div style={{ display: "grid", gridTemplateColumns: "clamp(260px, 30%, 380px) 1fr", gap: 16, flex: 1, minHeight: 0, padding: "0 20px 20px", overflow: "hidden" }}>

        {/* ── Left: ticket list ── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)" }}>

          {/* Filters header */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Search */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={13} style={{ position: "absolute", left: 10, color: "var(--text-muted)", pointerEvents: "none" }} />
              <input
                placeholder="Search tickets, stations…"
                value={query} onChange={(e) => setQuery(e.target.value)}
                style={{ width: "100%", height: 32, paddingLeft: 30, paddingRight: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "var(--font-sm)", outline: "none", fontFamily: "inherit", boxShadow: "var(--shadow-xs)" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "var(--shadow-xs)"; }}
              />
            </div>

            {/* Status pills */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", rowGap: 4 }}>
              {[{ key: "", label: "All" }, ...ALL_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s] }))].map(({ key, label }) => (
                <button key={key} onClick={() => setFilterStatus(key)}
                  style={{
                    height: 22, padding: "0 8px", borderRadius: "var(--r-sm)", border: 0,
                    fontSize: "var(--font-xs)", fontWeight: 500, cursor: "pointer",
                    transition: "all 0.12s ease", whiteSpace: "nowrap", flexShrink: 0,
                    background: filterStatus === key ? "var(--brand-soft)" : "transparent",
                    color: filterStatus === key ? "var(--on-brand-soft)" : "var(--text-muted)",
                  }}
                >
                  {label}
                  <span style={{ marginLeft: 4, opacity: 0.7, fontSize: "var(--font-xs)", fontVariantNumeric: "tabular-nums" }}>
                    {statusCounts[key || "all"] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Priority + Station row */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select
                value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
                style={{ flex: "1 1 100px", minWidth: 0, height: 28, padding: "0 8px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-secondary)", fontSize: "var(--font-sm)", outline: "none", fontFamily: "inherit" }}
              >
                <option value="">All priorities</option>
                {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
              <input
                type="text" value={filterStation} onChange={(e) => setFilterStation(e.target.value)}
                placeholder="Station ID…"
                style={{ flex: "1 1 80px", minWidth: 0, height: 28, padding: "0 8px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "var(--font-sm)", outline: "none", fontFamily: "inherit" }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TicketRowSkeleton key={i} />)
            ) : error ? (
              <div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={18} style={{ color: "var(--danger)" }} />
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text)" }}>Failed to load tickets</p>
                <Button size="sm" variant="secondary" onClick={fetchTickets}>Retry</Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: "var(--r-xl)", background: "var(--surface-sunken)", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
                  <Ticket size={18} />
                </div>
                <p style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>No tickets found</p>
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Try adjusting your filters.</p>
              </div>
            ) : (
              filteredItems.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} selected={ticket.id === selectedId} onClick={() => openTicket(ticket.id)} />
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--divider)", background: "var(--surface-alt)", fontSize: "var(--font-xs)", color: "var(--text-muted)", textAlign: "center", flexShrink: 0 }}>
            {allItems.length > PAGE_SIZE ? `Showing ${filteredItems.length} of ${allItems.length.toLocaleString()} tickets` : `${filteredItems.length} ticket${filteredItems.length !== 1 ? "s" : ""}`}
          </div>
        </div>

        {/* ── Right: detail panel ── */}
        <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {detailLoading ? (
            <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Loader2 size={20} style={{ color: "var(--brand)", animation: "spin 700ms linear infinite" }} />
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Loading ticket…</p>
              </div>
            </div>
          ) : detailTicket ? (
            <DetailPanel ticket={detailTicket} technicians={technicians} onUpdated={handleUpdated} />
          ) : (
            <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", padding: "0 32px" }}>
                <div style={{ width: 44, height: 44, borderRadius: "var(--r-xl)", background: "var(--surface-sunken)", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
                  <CheckCircle2 size={20} />
                </div>
                <p style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Select a ticket</p>
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Click any ticket on the left to view its details, manage status, and review inspection reports.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
