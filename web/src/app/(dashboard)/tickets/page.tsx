"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Ticket,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TicketRowSkeleton } from "@/components/ui/Skeleton";
import { ticketsApi } from "@/lib/api/tickets";
import type { TicketReport } from "@/lib/api/tickets";
import { cn } from "@/lib/cn";
import type {
  TicketAttachment,
  Technician,
  TicketDetail,
  TicketListItem,
  TicketPriority,
  TicketStatus,
} from "@/types/tickets";

// ─── Status/Priority display helpers ─────────────────────────────────────────

const STATUS_LABEL: Record<TicketStatus, string> = {
  assigned: "Assigned",
  "in-progress": "In Progress",
  completed: "Completed",
  verified: "Verified",
};

const STATUS_TONE: Record<TicketStatus, "neutral" | "brand" | "warning" | "success" | "info"> = {
  assigned: "brand",
  "in-progress": "warning",
  completed: "success",
  verified: "info",
};

const PRIORITY_TONE: Record<TicketPriority, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const ALL_STATUSES: TicketStatus[] = ["assigned", "in-progress", "completed", "verified"];
const ALL_PRIORITIES: TicketPriority[] = ["low", "medium", "high"];

// Analyst can only manually advance assigned→in-progress or in-progress→completed.
// verified is set via inspection report approval only.
const ANALYST_NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus>> = {
  assigned: "in-progress",
  "in-progress": "completed",
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  ticket,
  technicians,
  onClose,
  onUpdated,
}: {
  ticket: TicketDetail;
  technicians: Technician[];
  onClose: () => void;
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
    } catch {
      // silently ignore — browser will show nothing
    } finally {
      setDownloading(false);
    }
  }

  async function handleStatusChange(status: TicketStatus) {
    setSaving(true);
    setError("");
    try {
      const updated = await ticketsApi.update(ticket.id, { status });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTechnicianChange(technician_id: string) {
    if (!technician_id) return; // technician is required; can't unassign
    setSaving(true);
    setError("");
    try {
      const updated = await ticketsApi.update(ticket.id, { technician_id });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  const nextStatus = ANALYST_NEXT_STATUS[ticket.status] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-end p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-surface border border-border rounded-2xl w-full max-w-md h-full max-h-[90vh] sm:max-h-[85vh] flex flex-col animate-slide-in-right"
        style={{ boxShadow: "var(--shadow-xl, var(--shadow-lg))" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge tone={STATUS_TONE[ticket.status]} dot>
                {STATUS_LABEL[ticket.status]}
              </Badge>
              <Badge tone={PRIORITY_TONE[ticket.priority]}>
                {ticket.priority}
              </Badge>
              {ticket.anomaly_zone && (
                <Badge tone="info">Zone {ticket.anomaly_zone}</Badge>
              )}
            </div>
            <h2 className="font-display text-[17px] font-semibold text-text leading-snug mt-1">
              {ticket.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              title="Download PDF"
              className="h-8 w-8 rounded-lg grid place-items-center text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors disabled:opacity-50"
            >
              {downloading
                ? <Loader2 size={14} className="animate-spin" />
                : <Download size={14} strokeWidth={2.2} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg grid place-items-center text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors"
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 stagger">

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3.5 rounded-xl bg-surface-alt border border-border">
            <MetaField label="Station" value={ticket.station_id} mono />
            <MetaField label="Created" value={new Date(ticket.created_at).toLocaleDateString()} />
            {ticket.assigned_at && (
              <MetaField label="Assigned" value={new Date(ticket.assigned_at).toLocaleDateString()} />
            )}
            {ticket.completed_at && (
              <MetaField label="Completed" value={new Date(ticket.completed_at).toLocaleDateString()} />
            )}
            {ticket.verified_at && (
              <MetaField label="Verified" value={new Date(ticket.verified_at).toLocaleDateString()} />
            )}
            {ticket.technician && (
              <div className="col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-0.5">Technician</p>
                <p className="text-[13px] text-text">{ticket.technician.full_name}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {ticket.description && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
                Description
              </p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{ticket.description}</p>
            </div>
          )}

          {/* Inspection Report — shown for all statuses once a report exists */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
              Inspection Report
            </p>
            <ReportSection ticketId={ticket.id} />
          </div>

          {/* Attachments */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
              Attachments
            </p>
            <AttachmentsSection ticketId={ticket.id} />
          </div>

          {/* Technician reassignment */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
              Reassign Technician
            </p>
            <select
              value={ticket.technician_id ?? ""}
              onChange={(e) => handleTechnicianChange(e.target.value)}
              disabled={saving || ticket.status === "verified"}
              className={cn(
                "w-full h-10 px-3 rounded-lg bg-surface-alt text-text text-[13px]",
                "border border-border-strong",
                "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                "disabled:opacity-60",
              )}
            >
              {!ticket.technician_id && <option value="" disabled>— select technician —</option>}
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>

          {/* Advance status */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
              Advance Status
            </p>
            {nextStatus ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleStatusChange(nextStatus)}
                className={cn(
                  "px-4 py-2 rounded-lg border text-[13px] font-medium transition-colors",
                  "border-border-strong text-text-secondary",
                  "hover:bg-surface-muted hover:text-text disabled:opacity-50",
                )}
              >
                Mark as {STATUS_LABEL[nextStatus]} →
              </button>
            ) : (
              <p className="text-[12px] text-text-tertiary italic">
                {ticket.status === "completed"
                  ? "Awaiting analyst approval via Inspection Reports."
                  : ticket.status === "verified"
                  ? "Ticket is fully closed."
                  : "No further transitions available."}
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-soft border border-danger/20">
              <AlertTriangle size={13} className="text-danger shrink-0 mt-0.5" strokeWidth={2.4} />
              <p className="text-[12px] text-danger">{error}</p>
            </div>
          )}

          {saving && (
            <div className="flex items-center gap-2 text-[12px] text-text-secondary">
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SEVERITY_TONE: Record<string, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

function ReportSection({ ticketId }: { ticketId: string }) {
  const [report, setReport] = useState<TicketReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    ticketsApi.report(ticketId)
      .then(setReport)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) return (
    <div className="flex items-center gap-2 text-[12px] text-text-tertiary py-1">
      <Loader2 size={12} className="animate-spin" />
      Loading report…
    </div>
  );
  if (!report) return (
    <p className="text-[12px] text-text-tertiary italic">No inspection report submitted yet.</p>
  );

  return (
    <div className="space-y-3 p-3.5 rounded-xl border border-border bg-surface-alt/50">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge tone={report.analyst_approved ? "success" : "warning"} dot>
            {report.analyst_approved ? "Approved" : "Pending Review"}
          </Badge>
          {report.severity && (
            <Badge tone={SEVERITY_TONE[report.severity]}>{report.severity} severity</Badge>
          )}
        </div>
        {report.submitted_at && (
          <span className="text-[11px] text-text-tertiary">
            {new Date(report.submitted_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Sensor + severity grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-0.5">Sensor Working</p>
          {report.sensor_working === null ? (
            <p className="text-[12px] text-text-tertiary">Not recorded</p>
          ) : report.sensor_working ? (
            <span className="flex items-center gap-1.5 text-[12px] text-success">
              <Wifi size={12} strokeWidth={2.4} /> Yes
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[12px] text-danger">
              <WifiOff size={12} strokeWidth={2.4} /> No
            </span>
          )}
        </div>
      </div>

      {report.notes && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-0.5">Field Observations</p>
          <p className="text-[12px] text-text-secondary leading-relaxed">{report.notes}</p>
        </div>
      )}

      {report.root_cause && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-0.5">Root Cause</p>
          <p className="text-[12px] text-text-secondary leading-relaxed">{report.root_cause}</p>
        </div>
      )}

      {/* Analyst remarks — prominent when approved */}
      <div className={cn(
        "rounded-lg p-3 border",
        report.analyst_approved
          ? "bg-success/5 border-success/20"
          : "bg-surface border-border",
      )}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1">
          Analyst Remarks
        </p>
        {report.analyst_notes ? (
          <p className="text-[12px] text-text-secondary leading-relaxed">{report.analyst_notes}</p>
        ) : (
          <p className="text-[12px] text-text-tertiary italic">
            {report.analyst_approved ? "No remarks added." : "Awaiting analyst review."}
          </p>
        )}
      </div>

      {report.photos.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
            <Camera size={11} className="inline mr-1" strokeWidth={2.2} />
            Photos ({report.photos.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {report.photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightbox(p.photo_url)}
                className="rounded-lg overflow-hidden border border-border hover:border-brand transition-colors focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photo_url} alt="Inspection photo" className="w-20 h-16 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-200 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors grid place-items-center"
          >
            <X size={18} className="text-white" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Inspection photo"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function AttachmentsSection({ ticketId }: { ticketId: string }) {
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ticketsApi.attachments(ticketId)
      .then(setAttachments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) return (
    <div className="flex items-center gap-2 text-[12px] text-text-tertiary py-1">
      <Loader2 size={12} className="animate-spin" />
      Loading attachments…
    </div>
  );
  if (attachments.length === 0) return (
    <p className="text-[12px] text-text-tertiary italic">No attachments.</p>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {attachments.map((att) => {
        const kb = att.file_size ? Math.round(att.file_size / 1024) : null;
        return (
          <a
            key={att.id}
            href={att.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[13px]",
              "border-border bg-surface-alt hover:border-brand hover:bg-brand-soft/30 transition-colors group",
            )}
          >
            <FileText size={14} strokeWidth={2} className="text-text-tertiary shrink-0 group-hover:text-brand transition-colors" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text truncate group-hover:text-brand transition-colors">
                {att.file_name}
              </p>
              {kb !== null && (
                <p className="text-[11px] text-text-tertiary">{kb} KB</p>
              )}
            </div>
            <ExternalLink size={12} strokeWidth={2} className="text-text-tertiary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        );
      })}
    </div>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-0.5">{label}</p>
      <p className={cn("text-[13px] text-text", mono && "font-mono")}>{value}</p>
    </div>
  );
}

// ─── Ticket Row ───────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  onClick,
}: {
  ticket: TicketListItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left grid grid-cols-[1fr_auto] gap-4 items-center",
        "px-4 py-3.5 border-b border-border last:border-b-0",
        "hover:bg-surface-muted transition-colors group",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge tone={STATUS_TONE[ticket.status]} dot>
            {STATUS_LABEL[ticket.status]}
          </Badge>
          <Badge tone={PRIORITY_TONE[ticket.priority]}>
            {ticket.priority}
          </Badge>
          {ticket.anomaly_zone && (
            <Badge tone="info">Zone {ticket.anomaly_zone}</Badge>
          )}
        </div>
        <p className="text-[14px] font-medium text-text truncate group-hover:text-brand transition-colors">
          {ticket.title}
        </p>
        <p className="text-[12px] text-text-tertiary mt-0.5 font-mono">
          {ticket.station_id}
          {ticket.technician && (
            <span className="font-sans ml-2 text-text-secondary">
              · {ticket.technician.full_name}
            </span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[11px] text-text-tertiary">
          {new Date(ticket.created_at).toLocaleDateString()}
        </p>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="text-text-tertiary -rotate-90 mt-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const { loading: authLoading } = useAuth();
  const [items, setItems] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStation, setFilterStation] = useState("");

  const [detailTicket, setDetailTicket] = useState<TicketDetail | null>(null);

  const PAGE_SIZE = 50;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ticketsApi.list({
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        station_id: filterStation.trim() || undefined,
        limit: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterStation]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    ticketsApi.listTechnicians().then(setTechnicians).catch(() => {});
  }, []);

  async function openTicket(id: string) {
    try {
      const detail = await ticketsApi.get(id);
      setDetailTicket(detail);
    } catch {
      // silently ignore; the list still works
    }
  }

  function handleUpdated(t: TicketDetail) {
    setDetailTicket(t);
    setItems((prev) =>
      prev.map((item) =>
        item.id === t.id ? (t as unknown as TicketListItem) : item,
      ),
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-text-tertiary text-[13px] font-mono">Loading session…</p>
      </div>
    );
  }

  const activeFilterCount = [filterStatus, filterPriority, filterStation.trim()].filter(Boolean).length;

  return (
    <>
      <Header
        title="Tickets"
        description={`${total.toLocaleString()} ticket${total !== 1 ? "s" : ""} · maintenance & anomaly follow-up`}
      />

      <div className="px-8 py-6 max-w-[1200px] w-full mx-auto space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-text-secondary">
            <Filter size={13} strokeWidth={2.2} />
            Filters
            {activeFilterCount > 0 && (
              <span className="h-4 w-4 rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center">
                {activeFilterCount}
              </span>
            )}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={cn(
              "h-9 px-3 rounded-lg bg-surface text-text text-[13px]",
              "border border-border-strong",
              "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
              filterStatus && "border-brand",
            )}
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className={cn(
              "h-9 px-3 rounded-lg bg-surface text-text text-[13px]",
              "border border-border-strong",
              "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
              filterPriority && "border-brand",
            )}
          >
            <option value="">All Priorities</option>
            {ALL_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>

          <input
            type="text"
            value={filterStation}
            onChange={(e) => setFilterStation(e.target.value)}
            placeholder="Filter by station…"
            className={cn(
              "h-9 px-3 rounded-lg bg-surface text-text text-[13px] w-44",
              "border border-border-strong placeholder:text-text-tertiary",
              "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
              filterStation.trim() && "border-brand",
            )}
          />

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterStation(""); }}
              className="h-9 px-3 rounded-lg text-[13px] text-text-secondary hover:text-danger hover:bg-danger-soft transition-colors flex items-center gap-1.5"
            >
              <X size={12} strokeWidth={2.4} />
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={fetchTickets}
            className="h-9 px-3 rounded-lg text-[13px] text-text-secondary hover:text-text hover:bg-surface-muted transition-colors flex items-center gap-1.5 ml-auto"
          >
            <RefreshCw size={13} strokeWidth={2.2} className={cn(loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* List */}
        <div
          className="bg-surface border border-border rounded-2xl overflow-hidden"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          {loading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <TicketRowSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center gap-2">
              <AlertTriangle size={20} className="text-danger" strokeWidth={2} />
              <p className="text-[14px] font-medium text-text">Failed to load</p>
              <p className="text-[12px] text-text-secondary">{error}</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={fetchTickets}>
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-surface-muted grid place-items-center mb-1">
                <Ticket size={20} className="text-text-tertiary" strokeWidth={2} />
              </div>
              <p className="text-[14px] font-medium text-text">No tickets found</p>
              <p className="text-[12px] text-text-secondary">
                {activeFilterCount > 0
                  ? "Try adjusting your filters."
                  : "Run the pipeline in the Zones tab to detect anomalies and create tickets."}
              </p>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="px-4 py-2.5 border-b border-border bg-surface-muted/50 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  Ticket
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  Created
                </p>
              </div>
              <div className="stagger">
                {items.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => openTicket(ticket.id)}
                  />
                ))}
              </div>
              {total > PAGE_SIZE && (
                <div className="px-4 py-3 border-t border-border bg-surface-muted/30">
                  <p className="text-[12px] text-text-tertiary text-center">
                    Showing {items.length} of {total.toLocaleString()} tickets
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detailTicket && (
        <DetailPanel
          ticket={detailTicket}
          technicians={technicians}
          onClose={() => setDetailTicket(null)}
          onUpdated={handleUpdated}
        />
      )}
    </>
  );
}
