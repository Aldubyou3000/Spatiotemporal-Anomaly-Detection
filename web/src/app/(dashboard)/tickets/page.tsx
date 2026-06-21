"use client";

import { useState, useRef, useEffect } from "react";
import { useTicketList, useTicketDetail, useTicketReport, useTicketAttachments, invalidateTicketLists } from "@/hooks/useTickets";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flag,
  Loader2,
  MapPin,
  Search,
  Ticket,
  User,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TicketRowSkeleton } from "@/components/ui/Skeleton";
import { TicketDetailBody, type DetailModel, type DetailAssignee } from "@/components/tickets/TicketDetailBody";
import { TicketActionDock } from "@/components/tickets/TicketActionDock";
import { ReviewPanel } from "@/components/tickets/ReviewPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { ticketsApi } from "@/lib/api/tickets";
import { reportsApi } from "@/lib/api/reports";
import type {
  TicketDetail,
  TicketListItem,
  TicketPriority,
  TicketStatus,
} from "@/types/tickets";
import {
  STATUS_LABEL,
  STATUS_TONE,
  NEEDS_REVIEW,
  byImportance,
} from "@/lib/ticketStatus";

// ─── Tokens ───────────────────────────────────────────────────────────────────

const ALL_STATUSES: TicketStatus[] = ["assigned", "in-progress", "pending_review", "follow_up", "verified", "cancelled"];
const ALL_PRIORITIES: TicketPriority[] = ["low", "medium", "high"];

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

const TERMINAL = new Set<TicketStatus>(["verified", "cancelled"]);

function DetailPanel({ ticket, onUpdated, updateCache }: { ticket: TicketDetail; onUpdated: (t: TicketDetail) => void; updateCache: (t: TicketDetail) => void }) {
  const toast = useToast();
  const [downloading, setDownloading]   = useState(false);
  const [cancelOpen, setCancelOpen]     = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approvalNotes, setApprovalNotes]   = useState("");
  const [approving, setApproving]           = useState(false);
  const [approvalError, setApprovalError]   = useState("");
  // Follow-up is confirmed via dialog; its args are staged here until confirmed.
  const [pendingFollowUp, setPendingFollowUp] = useState<{ notes: string; reassign: { addIds: string[]; removeIds: string[] } } | null>(null);
  const { report, priorRounds } = useTicketReport(ticket.id);
  const { attachments } = useTicketAttachments(ticket.id);

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const slug = ticket.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
      await ticketsApi.downloadPdf(ticket.id, `ticket_${slug}.pdf`);
    } catch (err) {
      toast.error("PDF download failed", { description: err instanceof Error ? err.message : undefined });
    } finally { setDownloading(false); }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setConfirmCancel(false);
    setCancelling(true); setCancelError("");
    try {
      const updated = await ticketsApi.cancelTicket(ticket.id, cancelReason.trim());
      updateCache(updated);
      onUpdated(updated);
      await invalidateTicketLists();
      setCancelOpen(false); setCancelReason("");
      toast.success(`TKT-${ticket.ticket_number} cancelled`, { description: "The ticket has been closed as cancelled." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel ticket.";
      setCancelError(msg);
      toast.error("Couldn't cancel ticket", { description: msg });
    } finally { setCancelling(false); }
  }

  async function commitApprove() {
    if (!report) return;
    setConfirmApprove(false);
    setApproving(true); setApprovalError("");
    try {
      await reportsApi.approve(report.id, { analyst_notes: approvalNotes.trim() || undefined });
      const updated = await ticketsApi.get(ticket.id);
      updateCache(updated);
      onUpdated(updated);
      await invalidateTicketLists();
      toast.success(`TKT-${ticket.ticket_number} verified`, { description: "Report approved and the ticket is now closed as verified." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approval failed.";
      setApprovalError(msg);
      toast.error("Approval failed", { description: msg });
    } finally { setApproving(false); }
  }

  async function commitFollowUp() {
    if (!pendingFollowUp) return;
    const { notes: followUpNotes, reassign } = pendingFollowUp;
    setPendingFollowUp(null);
    setApproving(true); setApprovalError("");
    try {
      // Apply any staged re-visit reassignment first, then send the ticket back.
      if (reassign.addIds.length > 0) {
        await ticketsApi.assignTechnicians(ticket.id, reassign.addIds);
      }
      for (const id of reassign.removeIds) {
        await ticketsApi.removeTechnician(ticket.id, id);
      }
      await ticketsApi.requestFollowUp(ticket.id, followUpNotes);
      const updated = await ticketsApi.get(ticket.id);
      updateCache(updated);
      onUpdated(updated);
      await invalidateTicketLists();
      toast.success(`Follow-up requested for TKT-${ticket.ticket_number}`, { description: "The ticket was sent back to the field team for a re-visit." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Follow-up request failed.";
      setApprovalError(msg);
      toast.error("Follow-up request failed", { description: msg });
    } finally { setApproving(false); }
  }

  const assignees: DetailAssignee[] = (ticket.technicians ?? []).map((a) => ({
    id: a.id, name: a.full_name, assignedAt: a.assigned_at,
  }));
  const assigneesHistory: DetailAssignee[] = (ticket.technicians_history ?? []).map((a) => ({
    id: a.id, name: a.full_name, assignedAt: a.assigned_at,
  }));

  const model: DetailModel = {
    kind: "ticket",
    refId: String(ticket.ticket_number),
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    zone: ticket.anomaly_zone,
    assignees,
    assigneesHistory,
    assigneeName: ticket.technician?.full_name ?? null,
    stationId: ticket.station_id,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    description: ticket.description,
    anomalyData: ticket.anomaly_data,
    followUpCount: ticket.follow_up_count,
    followUpNotes: ticket.follow_up_notes,
    cancellationReason: ticket.cancellation_reason,
    report: report
      ? {
          submittedAt: report.submitted_at,
          severity: report.severity,
          notes: report.notes,
          rootCause: report.root_cause,
          correctiveAction: report.corrective_action,
          issueResolved: report.issue_resolved,
          analystApproved: report.analyst_approved,
          analystApprovedAt: report.analyst_approved_at,
          analystNotes: report.analyst_notes,
          photos: report.photos,
          round: report.round,
        }
      : null,
    priorRounds: priorRounds.map((r) => ({
      id: r.id,
      round: r.round,
      submittedAt: r.submitted_at,
      severity: r.severity,
      notes: r.notes,
      rootCause: r.root_cause,
      correctiveAction: r.corrective_action,
      issueResolved: r.issue_resolved,
      followUpNotes: r.follow_up_notes,
      photos: r.photos,
    })),
    attachments: attachments.map((a) => ({ id: a.id, file_name: a.file_name, file_url: a.file_url, file_size: a.file_size })),
    onDownload: handleDownloadPdf,
    downloading,
  };

  const isTerminal = TERMINAL.has(ticket.status);

  // ── Analyst review surface — rendered inside the dock drawer when pending_review.
  //    Explicit approve-vs-follow-up decision selector; the note + action button
  //    belong unambiguously to the chosen path. Approval still routes through a
  //    confirm dialog (status advancement is a guarded action).
  const reviewSlot = ticket.status === "pending_review" ? (
    <ReviewPanel
      ticket={ticket}
      approving={approving}
      error={approvalError}
      onApprove={(notes) => { setApprovalNotes(notes); setConfirmApprove(true); }}
      onFollowUp={(notes, reassign) => setPendingFollowUp({ notes, reassign })}
    />
  ) : undefined;

  // ── Cancel control — rendered inside the dock drawer when assigned.
  const cancelSlot = ticket.status === "assigned" ? (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
      {!cancelOpen ? (
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 12px", borderRadius: "var(--r-md)", border: "1px solid color-mix(in oklab, var(--danger) 40%, transparent)", background: "transparent", fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--danger)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <XCircle size={12} /> Cancel Ticket
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (required)…"
            rows={2}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text)", fontSize: "var(--font-sm)", fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }}
          />
          {cancelError && <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--danger)" }}>{cancelError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { setCancelOpen(false); setCancelReason(""); setCancelError(""); }} style={{ height: 28, padding: "0 12px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}>
              Back
            </button>
            <button type="button" onClick={() => { if (cancelReason.trim()) setConfirmCancel(true); }} disabled={!cancelReason.trim() || cancelling} style={{ height: 28, padding: "0 12px", borderRadius: "var(--r-md)", border: "none", background: "var(--danger)", fontSize: "var(--font-xs)", fontWeight: 600, color: "#fff", cursor: cancelReason.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: cancelReason.trim() ? 1 : 0.5 }}>
              {cancelling ? "Cancelling…" : "Confirm Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  ) : undefined;

  const footer = !isTerminal ? (
    <TicketActionDock ticket={ticket} onUpdated={(t) => { updateCache(t); onUpdated(t); }} reviewSlot={reviewSlot} cancelSlot={cancelSlot} />
  ) : undefined;

  return (
    <div
      key={ticket.id}
      style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, minHeight: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)" }}
    >
      <TicketDetailBody model={model} footer={footer} />
      {confirmApprove && (
        <ConfirmDialog
          title="Approve report & verify ticket?"
          message={`TKT-${ticket.ticket_number} will be marked approved and closed as Verified${approvalNotes.trim() ? ", with your remarks attached" : " (no remarks added)"}. This cannot be undone.`}
          confirmLabel="Approve & verify"
          onConfirm={commitApprove}
          onCancel={() => setConfirmApprove(false)}
        />
      )}
      {pendingFollowUp && (
        <ConfirmDialog
          title="Send ticket back for follow-up?"
          message={`TKT-${ticket.ticket_number} will be returned to the field team for a re-visit with your instructions${
            pendingFollowUp.reassign.addIds.length || pendingFollowUp.reassign.removeIds.length ? " and the staged re-assignment" : ""
          }. The technician will be notified.`}
          confirmLabel="Send follow-up"
          onConfirm={commitFollowUp}
          onCancel={() => setPendingFollowUp(null)}
        />
      )}
      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this ticket?"
          message={`TKT-${ticket.ticket_number} will be closed as Cancelled and removed from active work. This cannot be undone.`}
          confirmLabel="Cancel ticket"
          isDangerous
          onConfirm={handleCancel}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}

// ─── Status Dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({
  value,
  onChange,
  statusCounts,
}: {
  value: string;
  onChange: (v: string) => void;
  statusCounts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const options = [{ key: "", label: "All Tickets" }, ...ALL_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s] }))];
  const selected = options.find((o) => o.key === value) ?? options[0];
  const selectedCount = statusCounts[value || "all"] ?? 0;

  return (
    <div ref={ref} style={{ position: "relative", padding: "8px 10px", borderBottom: "1px solid var(--divider)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", height: 32, padding: "0 10px",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          background: open ? "var(--surface)" : "var(--surface-sunken)",
          color: "var(--text)",
          fontSize: "var(--font-xs)", fontWeight: 500,
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          transition: "border-color 0.12s, background 0.12s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--brand)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--font-xs)" }}>Status:</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{selected.label}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{
            fontSize: 10, fontVariantNumeric: "tabular-nums", fontWeight: 500,
            padding: "1px 6px", borderRadius: "var(--r-full)",
            background: "var(--brand-soft)", color: "var(--brand)",
          }}>
            {selectedCount}
          </span>
          <ChevronDown size={12} style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </span>
      </button>

      {open && (
        <div
          className="animate-scale-in"
          style={{
            position: "absolute", top: "calc(100% - 2px)", left: 10, right: 10,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-lg)",
            zIndex: 50, padding: "4px", transformOrigin: "top center",
            overflow: "hidden",
          }}
        >
          {options.map(({ key, label }) => {
            const active = value === key;
            const count = statusCounts[key || "all"] ?? 0;
            return (
              <button
                key={key}
                onClick={() => { onChange(key); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", height: 30, padding: "0 8px",
                  borderRadius: "var(--r-md)", border: 0,
                  background: active ? "var(--brand-soft)" : "transparent",
                  color: active ? "var(--on-brand-soft)" : "var(--text-secondary)",
                  fontSize: "var(--font-xs)", fontWeight: active ? 600 : 400,
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--surface-sunken)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span>{label}</span>
                <span style={{
                  fontSize: 10, fontVariantNumeric: "tabular-nums", fontWeight: 500,
                  minWidth: 18, textAlign: "center", padding: "1px 5px",
                  borderRadius: "var(--r-full)",
                  background: active ? "color-mix(in oklab, var(--brand) 18%, transparent)" : "var(--surface-sunken)",
                  color: active ? "var(--brand)" : "var(--text-muted)",
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ticket Row ───────────────────────────────────────────────────────────────

function TicketRow({ ticket, selected, onClick }: { ticket: TicketListItem; selected: boolean; onClick: () => void }) {
  const ticketNum = ticket.ticket_number;
  const techCount = ticket.technicians?.length ?? 0;
  const primaryTech = ticket.technician?.full_name ?? (techCount > 0 ? ticket.technicians[0].full_name : null);

  return (
    <button onClick={onClick} className="list-row" data-selected={selected ? "true" : undefined} style={{ padding: "11px 16px 11px 19px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: "0.04em", flexShrink: 0 }}>
          TKT-{ticketNum}
        </span>
        {/* Status is the one badge that always carries color — it's the primary signal */}
        <Badge tone={STATUS_TONE[ticket.status]} dot>{STATUS_LABEL[ticket.status]}</Badge>
        {/* Priority only earns a colored chip when high; low/medium are quiet text */}
        {ticket.priority === "high" && <Badge tone="danger">High</Badge>}
        {ticket.follow_up_count > 0 && <Badge tone="neutral">FU×{ticket.follow_up_count}</Badge>}
      </div>
      <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", lineHeight: 1.35, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ticket.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ color: "var(--text-tertiary)" }}><MapPin size={10} /></span>
          <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", flexShrink: 0 }}>{ticket.station_id}</span>
          {ticket.anomaly_zone && (
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", flexShrink: 0 }}>· Z-{ticket.anomaly_zone}</span>
          )}
          {primaryTech && (
            <>
              <span style={{ color: "var(--divider)", flexShrink: 0 }}>·</span>
              <span style={{ color: "var(--text-tertiary)" }}><User size={10} /></span>
              <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {primaryTech}{techCount > 1 ? ` +${techCount - 1}` : ""}
              </span>
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

const PAGE_SIZE = 50;

export default function TicketsPage() {
  const { loading: authLoading } = useAuth();
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStation, setFilterStation] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { ticket: detailTicket, isLoading: detailLoading, updateCache } = useTicketDetail(selectedId);

  const { items, isLoading: loading, error: fetchError, refresh } = useTicketList({
    status: filterStatus || undefined,
    priority: filterPriority || undefined,
    station_id: filterStation.trim() || undefined,
  });
  const { items: allItems } = useTicketList({});

  function handleRefresh() { refresh(); }
  const error = fetchError?.message ?? null;

  function openTicket(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  const matchedItems = query.trim()
    ? items.filter((t) => {
        const raw = query.trim().toLowerCase();
        // If the user typed a TKT-N pattern, match ticket_number exactly
        const tktMatch = raw.match(/^tkt-?(\d+)$/i);
        if (tktMatch) return t.ticket_number === Number(tktMatch[1]);
        // Plain number alone → exact ticket_number match
        if (/^\d+$/.test(raw)) return t.ticket_number === Number(raw);
        // Otherwise free-text across title, station, technician names
        const techNames = (t.technicians ?? []).map((a) => a.full_name).join(" ");
        return `${t.title} ${t.station_id} ${techNames}`.toLowerCase().includes(raw);
      })
    : items;

  // Highest-priority statuses float to the top (Pending Review, then Follow-up,
  // then active work), each group newest-first. See byImportance in lib/ticketStatus.
  const filteredItems = [...matchedItems].sort(byImportance);

  // Tickets awaiting the analyst's review decision (pending_review only) — drives
  // the "Needs Review" header/count, which matches the sidebar badge.
  const reviewCount = filteredItems.filter((t) => NEEDS_REVIEW.has(t.status)).length;
  // Group headers only make sense for a genuinely mixed list (no single-status
  // filter, and the list actually contains both review and non-review tickets).
  const showGroupHeaders =
    !filterStatus && reviewCount > 0 && reviewCount < filteredItems.length;

  const statusCounts: Record<string, number> = { all: allItems.length };
  allItems.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1; });

  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)", fontFamily: "var(--font-mono)" }}>Loading session…</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Header title="Tickets" hideHeading />
      <div style={{ display: "grid", gridTemplateColumns: "clamp(260px, 30%, 380px) 1fr", gap: 16, flex: 1, minHeight: 0, padding: "16px 20px 20px", overflow: "hidden" }}>

        {/* Left list */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)" }}>
          {/* Search */}
          <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid var(--divider)" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={13} style={{ position: "absolute", left: 10, color: "var(--text-muted)", pointerEvents: "none" }} />
              <input
                placeholder="Search by TKT-#, title, station…"
                value={query} onChange={(e) => setQuery(e.target.value)}
                style={{ width: "100%", height: 32, paddingLeft: 30, paddingRight: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: "var(--text)", fontSize: "var(--font-sm)", outline: "none", fontFamily: "inherit" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--surface)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-sunken)"; }}
              />
            </div>
          </div>

          {/* Filters */}
          <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 6 }}>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ width: "100%", height: 30, padding: "0 8px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-sunken)", color: filterPriority ? "var(--text)" : "var(--text-muted)", fontSize: "var(--font-xs)", outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
              <option value="">All priorities</option>
              {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
            {(filterStatus || filterPriority || query) && (
              <button onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterStation(""); setQuery(""); }} style={{ width: "100%", height: 30, padding: "0 10px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: "var(--font-xs)", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                Reset filters
              </button>
            )}
          </div>

          {/* Status dropdown */}
          <StatusDropdown
            value={filterStatus}
            onChange={setFilterStatus}
            statusCounts={statusCounts}
          />

          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TicketRowSkeleton key={i} />)
            ) : error ? (
              <div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={18} style={{ color: "var(--danger)" }} />
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text)" }}>Failed to load tickets</p>
                <Button size="sm" variant="secondary" onClick={handleRefresh}>Retry</Button>
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
              filteredItems.map((ticket, i) => {
                const needsReview = NEEDS_REVIEW.has(ticket.status);
                // Header above the first action-required ticket
                const showReviewHeader = showGroupHeaders && needsReview && i === 0;
                // Divider where the action-required group ends and the rest begins
                const showSplit =
                  showGroupHeaders && !needsReview && i > 0 && NEEDS_REVIEW.has(filteredItems[i - 1].status);
                return (
                  <div key={ticket.id}>
                    {showReviewHeader && (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                        <Flag size={11} fill="var(--danger)" color="var(--danger)" strokeWidth={2} />
                        Needs Review
                        <span style={{
                          fontSize: 10, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                          color: "#fff", background: "var(--danger)",
                          padding: "1px 6px", borderRadius: "var(--r-full)",
                          minWidth: 17, textAlign: "center", letterSpacing: 0,
                        }}>
                          {reviewCount}
                        </span>
                      </div>
                    )}
                    {showSplit && (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", borderTop: "1px solid var(--border)", marginTop: 2 }}>
                        All Tickets
                      </div>
                    )}
                    <TicketRow ticket={ticket} selected={ticket.id === selectedId} onClick={() => openTicket(ticket.id)} />
                  </div>
                );
              })
            )}
          </div>

          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--divider)", background: "var(--surface-alt)", fontSize: "var(--font-xs)", color: "var(--text-muted)", textAlign: "center", flexShrink: 0 }}>
            {allItems.length > PAGE_SIZE ? `Showing ${filteredItems.length} of ${allItems.length.toLocaleString()} tickets` : `${filteredItems.length} ticket${filteredItems.length !== 1 ? "s" : ""}`}
          </div>
        </div>

        {/* Right detail */}
        <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {detailLoading ? (
            <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Loader2 size={20} style={{ color: "var(--brand)", animation: "spin 700ms linear infinite" }} />
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Loading ticket…</p>
              </div>
            </div>
          ) : detailTicket ? (
            <DetailPanel ticket={detailTicket} onUpdated={updateCache} updateCache={updateCache} />
          ) : (
            <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", padding: "0 32px" }}>
                <div style={{ width: 44, height: 44, borderRadius: "var(--r-xl)", background: "var(--surface-sunken)", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
                  <CheckCircle2 size={20} />
                </div>
                <p style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Select a ticket</p>
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Click any ticket on the left to view its details and inspection report.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
