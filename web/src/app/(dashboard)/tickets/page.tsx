"use client";
import { matchesTicketSearch } from "@/lib/search";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTicketList, useTicketDetail, useTicketReport, useTicketAttachments, invalidateTicketLists, invalidateReports } from "@/hooks/useTickets";
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Search,
  Ticket,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import styles from "@/components/tickets/Tickets.module.css";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TicketRowSkeleton, DetailSkeleton } from "@/components/ui/Skeleton";
import { TicketDetailBody, type DetailModel, type DetailAssignee } from "@/components/tickets/TicketDetailBody";
import { TicketActionDock } from "@/components/tickets/TicketActionDock";
import { ReviewPanel } from "@/components/tickets/ReviewPanel";
import { ReasonPicker } from "@/components/tickets/ReasonPicker";
import { CANCELLATION_REASONS } from "@/lib/ticketReasons";
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
  const [cancelPreset, setCancelPreset] = useState<string | null>(null);
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approvalNotes, setApprovalNotes]   = useState("");
  const [approving, setApproving]           = useState(false);
  const [approvalError, setApprovalError]   = useState("");
  // Follow-up is confirmed via dialog; its args are staged here until confirmed.
  const [pendingFollowUp, setPendingFollowUp] = useState<{ notes: string; reassign: { addIds: string[]; removeIds: string[] } } | null>(null);
  const { report, priorRounds, isLoading: reportLoading, error: reportError, refresh: refreshReport } = useTicketReport(ticket.id);
  const { attachments, isLoading: attachmentsLoading, error: attachmentsError, refresh: refreshAttachments } = useTicketAttachments(ticket.id);

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const slug = ticket.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
      await ticketsApi.downloadPdf(ticket.id, `ticket_${slug}.pdf`);
    } catch (err) {
      toast.error("PDF download failed", { description: err instanceof Error ? err.message : undefined });
    } finally { setDownloading(false); }
  }

  const cancelFinal = cancelPreset && cancelPreset !== "Other" ? cancelPreset : cancelReason.trim();
  async function handleCancel() {
    if (!cancelFinal) return;
    setConfirmCancel(false);
    setCancelling(true); setCancelError("");
    try {
      const updated = await ticketsApi.cancelTicket(ticket.id, cancelFinal);
      updateCache(updated);
      onUpdated(updated);
      await Promise.all([invalidateTicketLists(), invalidateReports()]);
      setCancelOpen(false); setCancelReason(""); setCancelPreset(null);
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
      await Promise.all([invalidateTicketLists(), invalidateReports()]);
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
      await Promise.all([invalidateTicketLists(), invalidateReports()]);
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

  const subResourceError = reportError || attachmentsError;
  const subResourceErrorMessage = reportError?.message ?? attachmentsError?.message ?? null;

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
          <ReasonPicker
            reasons={CANCELLATION_REASONS}
            selected={cancelPreset}
            variant="danger"
            onSelect={(v) => {
              if (v === "Other") {
                setCancelPreset("Other");
                // keep existing text so analyst can edit; clear if it was a preset
                if (cancelPreset && cancelPreset !== "Other") setCancelReason("");
              } else {
                setCancelPreset(v);
                setCancelReason(v);
              }
            }}
          />
          <textarea
            value={cancelPreset && cancelPreset !== "Other" ? cancelPreset : cancelReason}
            onChange={(e) => {
              // Only editable when "Other" is selected — presets are locked
              if (cancelPreset !== "Other") return;
              setCancelReason(e.target.value);
            }}
            placeholder={cancelPreset === "Other" ? "Type custom reason (required)…" : cancelPreset && cancelPreset !== "Other" ? cancelPreset : "Select a reason above…"}
            rows={2}
            readOnly={cancelPreset !== "Other"}
            disabled={cancelPreset !== "Other"}
            autoFocus={cancelPreset === "Other"}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: cancelPreset && cancelPreset !== "Other" ? "var(--surface)" : "var(--surface-sunken)",
              color: "var(--text)",
              fontSize: "var(--font-sm)",
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              opacity: cancelPreset !== "Other" ? 0.9 : 1,
              cursor: cancelPreset !== "Other" ? "default" : "text",
            }}
          />
          {cancelPreset && cancelPreset !== "Other" && (
            <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
              Will send: “{cancelPreset}” — tap <span style={{ fontWeight: 600 }}>Other</span> to type a custom reason.
            </p>
          )}
          {cancelPreset === "Other" && !cancelReason.trim() && (
            <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
              Type your custom reason above.
            </p>
          )}
          {cancelError && <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--danger)" }}>{cancelError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { setCancelOpen(false); setCancelReason(""); setCancelPreset(null); setCancelError(""); }} style={{ height: 28, padding: "0 12px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}>
              Back
            </button>
            <button type="button" onClick={() => { if (cancelFinal) setConfirmCancel(true); }} disabled={!cancelFinal || cancelling} style={{ minWidth: "10rem", height: 28, padding: "0 12px", borderRadius: "var(--r-md)", border: "none", background: "var(--danger)", fontSize: "var(--font-xs)", fontWeight: 600, color: "#fff", cursor: cancelFinal ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: cancelFinal ? 1 : 0.5 }}>
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

  if (reportLoading || attachmentsLoading) return <DetailSkeleton />;

  return (
    <div
      key={ticket.id}
      style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, minHeight: 0, background: "var(--surface)", borderRadius: "var(--r-xl)" }}
    >
      {subResourceError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "color-mix(in oklab, var(--danger) 8%, var(--surface))", borderBottom: "1px solid color-mix(in oklab, var(--danger) 18%, transparent)", fontSize: "var(--font-xs)", color: "var(--danger)" }}>
          <AlertTriangle size={12} />
          <span style={{ flex: 1, minWidth: 0 }}>{reportError ? "Failed to load report" : "Failed to load attachments"}{subResourceErrorMessage ? ` — ${subResourceErrorMessage}` : ""}</span>
          <button
            type="button"
            onClick={() => { if (reportError) refreshReport(); if (attachmentsError) refreshAttachments(); }}
            style={{ flexShrink: 0, height: 22, padding: "0 8px", borderRadius: "var(--r-md)", border: "1px solid color-mix(in oklab, var(--danger) 24%, transparent)", background: "var(--surface)", color: "var(--danger)", fontSize: "var(--font-xs)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Retry
          </button>
        </div>
      )}
      {ticket.run_id && <div style={{ padding: "8px var(--pad-x)", fontSize: "var(--font-sm)" }}>
        <Link href={`/history/${ticket.run_id}`} style={{ color: "var(--brand-text)" }}>View source run →</Link>
      </div>}
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

// ─── Ticket Row ───────────────────────────────────────────────────────────────

function TicketRow({ ticket, selected, onClick }: { ticket: TicketListItem; selected: boolean; onClick: () => void }) {
  const ticketNum = ticket.ticket_number;

  return (
    <button type="button" onClick={onClick} className={styles.ticketRow} aria-pressed={selected} data-selected={selected ? "true" : undefined}>
      <span className={styles.rowHeading}>
        <span className={styles.ticketId}>TKT-{ticketNum}</span>
        <Badge tone={STATUS_TONE[ticket.status]} dot>{STATUS_LABEL[ticket.status]}</Badge>
        <time dateTime={ticket.updated_at} title={new Date(ticket.updated_at).toLocaleString()}>{fmtRelative(ticket.updated_at)}</time>
      </span>
      <span className={styles.rowTitle} title={ticket.title}>{ticket.title}</span>
      <span className={styles.rowFooter}>
        <span className={styles.station} title={ticket.station_id}><MapPin size={14} aria-hidden="true" /><span>{ticket.station_id}</span></span>
      </span>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────


export default function TicketsPage() {
  return <Suspense fallback={<div role="status">Loading tickets…</div>}><TicketsWorkspace /></Suspense>;
}

function TicketsWorkspace() {
  const searchParams = useSearchParams();
  const linkedId = searchParams.get("ticket");
  const { loading: authLoading } = useAuth();
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStation, setFilterStation] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(linkedId);
  useEffect(() => { setSelectedId(linkedId); }, [linkedId]);
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

  const matchedItems = items.filter(ticket => matchesTicketSearch(ticket, query));

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
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)", fontFamily: "var(--font-ui)" }}>Loading session…</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Header title="Tickets" />
      <div className={`dashboard-content ${styles.workspace}`}>

        {/* Left list */}
        <div role="region" aria-label="Ticket list" style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, minWidth: 0, background: "var(--surface)", borderRadius: "var(--r-2xl)" }}>
          <div className={styles.queueToolbar}>
            <div className={styles.queueHeading}>
              <h2>Tickets</h2><span>{filteredItems.length}</span>
              <button type="button" className={styles.clearFilters} style={{ visibility: filterStatus || filterPriority || query ? "visible" : "hidden" }} onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterStation(""); setQuery(""); }}>Clear filters</button>
            </div>
            <div data-search-field style={{ width: "100%", maxWidth: "100%" }}>
              <Search size={16} aria-hidden="true" />
              <input aria-label="Search tickets" placeholder="Search tickets or stations…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className={styles.queueFilters}>
              <Select value={filterStatus} onChange={setFilterStatus} width="100%" ariaLabel="Filter by status"
                options={[{value:"",label:`All statuses (${statusCounts.all})`}, ...ALL_STATUSES.map(status => ({value:status,label:`${STATUS_LABEL[status]} (${statusCounts[status] ?? 0})`}))]} />
              <Select value={filterPriority} onChange={setFilterPriority} width="100%" ariaLabel="Filter by priority"
                options={[{value:"",label:"All priorities"}, ...ALL_PRIORITIES.map(priority => ({value:priority,label:priority.charAt(0).toUpperCase()+priority.slice(1)}))]} />
            </div>
          </div>
          <div className={styles.queueList}>
            {loading && items.length === 0 ? (
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
                      <div className={styles.groupHeading}>Needs review <span>{reviewCount}</span></div>
                    )}
                    {showSplit && (
                      <div className={styles.groupHeading}>Other tickets</div>
                    )}
                    <TicketRow ticket={ticket} selected={ticket.id === selectedId} onClick={() => openTicket(ticket.id)} />
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Right detail */}
        <div role="region" aria-label="Ticket details" style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--surface)", borderRadius: "var(--r-2xl)" }}>
          {detailLoading && !detailTicket ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)", borderRadius: "var(--r-xl)" }}>
              <DetailSkeleton />
            </div>
          ) : detailTicket ? (
            <DetailPanel key={detailTicket.id} ticket={detailTicket} onUpdated={updateCache} updateCache={updateCache} />
          ) : (
            <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--surface)", borderRadius: "var(--r-xl)" }}>
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
