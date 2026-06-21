"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronDown,
  Minus,
  Plus,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { TechnicianWorkloadBadge } from "@/components/tickets/TechnicianWorkloadBadge";
import { useTechnicianProfiles, useTicketTechnicians } from "@/hooks/useTechnicians";
import { byWorkload } from "@/lib/technicianWorkload";
import { ticketsApi } from "@/lib/api/tickets";
import { invalidateTicketLists } from "@/hooks/useTickets";
import type { Technician, TicketDetail } from "@/types/tickets";

// ─── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// Stable per-name avatar tint so the stack reads as distinct people.
const TINTS = [
  ["#1E6FD9", "#EFF6FF"], ["#7C3AED", "#F5F3FF"], ["#0D9488", "#F0FDFA"],
  ["#D97706", "#FFFBEB"], ["#DC2626", "#FEF2F2"], ["#16A34A", "#F0FDF4"],
];
function tint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return TINTS[h % TINTS.length];
}

function StackAvatar({ name, size = 24, ring = "var(--surface)" }: { name: string; size?: number; ring?: string }) {
  const [bg, fg] = tint(name);
  return (
    <div
      title={name}
      style={{
        width: size, height: size, borderRadius: "50%", background: bg, color: fg,
        display: "grid", placeItems: "center", fontSize: size * 0.4, fontWeight: 700,
        flexShrink: 0, boxShadow: `0 0 0 2px ${ring}`, fontFamily: "var(--font-sans)",
      }}
    >
      {initials(name)}
    </div>
  );
}

// ─── dock ───────────────────────────────────────────────────────────────────────

/**
 * Unified, collapsible action dock pinned to the bottom of the ticket detail panel.
 * Owns: collapse state, the always-visible header strip (context + overlapping
 * avatar stack), and the assignee management drawer. The analyst-review form and
 * the cancel control are passed in from the page via `reviewSlot` / `cancelSlot`
 * since they own the mutation handlers.
 */
export function TicketActionDock({
  ticket,
  onUpdated,
  reviewSlot,
  cancelSlot,
}: {
  ticket: TicketDetail;
  onUpdated: (t: TicketDetail) => void;
  reviewSlot?: React.ReactNode;
  cancelSlot?: React.ReactNode;
}) {
  const toast = useToast();
  const { technicians: allTechnicians } = useTechnicianProfiles();
  // Workload lives on the ticket-technicians endpoint (not the profiles list the
  // roster comes from); merge it in by id so the add-picker can show load + sort.
  const { technicians: workloadList } = useTicketTechnicians();
  const workloadById = new Map<string, Technician>(workloadList.map((t) => [t.id, t]));
  // A ticket awaiting the analyst's decision opens expanded so the approve/verify
  // action is never hidden; assignment-only states start collapsed to free the scroll area.
  const needsReview = ticket.status === "pending_review" && !!reviewSlot;
  const [open, setOpen]       = useState(needsReview);
  const [addOpen, setAddOpen] = useState(false);

  // If the dock mounted before reviewSlot was ready (report still loading),
  // needsReview was false and open initialised collapsed. Correct it as soon
  // as the slot arrives so the review panel isn't hidden behind a closed dock.
  useEffect(() => {
    if (needsReview) setOpen(true);
  }, [needsReview]);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [addBtnRect, setAddBtnRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (addOpen && addBtnRef.current) {
      setAddBtnRect(addBtnRef.current.getBoundingClientRect());
    }
  }, [addOpen]);
  // A staged add/remove awaiting a typed reason before it commits.
  const [pending, setPending] = useState<{ kind: "add" | "remove"; id: string; name: string } | null>(null);
  const [reason, setReason]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const assigned    = ticket.technicians ?? [];
  const assignedIds = new Set(assigned.map((a) => a.id));
  // Lightest-loaded technicians surface first in the add-picker.
  const available   = allTechnicians
    .filter((t) => !assignedIds.has(t.id))
    .sort((a, b) => byWorkload(workloadById.get(a.id) ?? a, workloadById.get(b.id) ?? b));
  const isVerified  = ticket.status === "verified";

  function openPrompt(next: { kind: "add" | "remove"; id: string; name: string }) {
    setError(""); setReason(""); setAddOpen(false); setPending(next);
  }
  function closePrompt() {
    setPending(null); setReason("");
  }

  // Commit the staged add/remove with the required reason.
  async function commitPending() {
    if (!pending || !reason.trim() || saving) return;
    const r = reason.trim();
    setSaving(true); setError("");
    try {
      const updated = pending.kind === "add"
        ? await ticketsApi.assignTechnicians(ticket.id, [pending.id], r)
        : await ticketsApi.removeTechnician(ticket.id, pending.id, r);
      onUpdated(updated);
      await invalidateTicketLists();
      toast.success(
        pending.kind === "add" ? `${pending.name} assigned` : `${pending.name} removed`,
        { description: `TKT-${ticket.ticket_number} · ${pending.kind === "add" ? "added to the ticket" : "taken off the ticket"}.` },
      );
      closePrompt();
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to ${pending.kind === "add" ? "assign" : "remove"} technician.`;
      setError(msg);
      toast.error(`Couldn't ${pending.kind === "add" ? "assign" : "remove"} technician`, { description: msg });
    } finally { setSaving(false); }
  }

  // Verified tickets are terminal — nothing to act on, no dock.
  if (isVerified) return null;

  const STACK_CAP = 4;
  const shown = assigned.slice(0, STACK_CAP);
  const overflow = assigned.length - shown.length;

  return (
    <>
      <div
        style={{
          flexShrink: 0, position: "relative",
          background: "var(--surface)",
          borderTop: "1px solid var(--divider)",
          boxShadow: needsReview
            ? "inset 0 2px 0 color-mix(in oklab, var(--brand) 55%, transparent)"
            : "none",
        }}
      >
        {/* One-shot ping overlay — plays once on mount (ticket selection), then disappears */}
        <span className="dock-ping" aria-hidden="true" />
        {/* ── Always-visible header strip (the collapse handle) ── */}
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          aria-expanded={open}
          aria-label={open ? "Collapse actions panel" : "Expand actions panel"}
          className="dock-strip"
          style={{
            width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch",
            padding: "0 16px",
            background: "transparent", border: 0, cursor: "pointer",
            fontFamily: "inherit", textAlign: "left",
            transition: "background var(--duration-fast) var(--ease-std)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {/* Collapse arrow — bobs while collapsed, rotates 180° when open */}
          <span style={{ display: "flex", justifyContent: "center", paddingTop: 5, paddingBottom: 3 }}>
            <ChevronDown
              size={24}
              strokeWidth={2.8}
              className="dock-arrow"
              data-collapsed={!open}
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          </span>

          {/* Main row — vertically centered */}
          <span style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>

            {/* Context icon — pulses when review is needed */}
            <span
              className={needsReview && !open ? "dock-review-icon" : undefined}
              style={{
                width: 28, height: 28, borderRadius: "var(--r-md)", display: "grid", placeItems: "center", flexShrink: 0,
                background: needsReview ? "var(--brand-soft)" : "var(--surface-sunken)",
                color: needsReview ? "var(--brand)" : "var(--text-muted)",
                border: needsReview ? "1px solid color-mix(in oklab, var(--brand) 22%, transparent)" : "1px solid var(--divider)",
              }}
            >
              {needsReview ? <ShieldCheck size={15} strokeWidth={2.2} /> : <Users size={14} strokeWidth={2} />}
            </span>

            {/* Label */}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {needsReview ? "Review & verify" : "Assignment"}
              </span>
              <span style={{ display: "block", fontSize: "var(--font-xs)", color: "var(--text-muted)", lineHeight: 1.3, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {needsReview
                  ? <>Approve to close as <span style={{ fontWeight: 600, color: "var(--success)" }}>verified</span></>
                  : assigned.length === 0
                    ? "No technicians assigned"
                    : `${assigned.length} technician${assigned.length > 1 ? "s" : ""} assigned`}
              </span>
            </span>

            {/* Overlapping avatar stack — staggered pop-in animation */}
            {assigned.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                {shown.map((a, i) => (
                  <span
                    key={a.id}
                    style={{
                      marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i,
                      animation: `avatar-pop 300ms cubic-bezier(0.34,1.56,0.64,1) both`,
                      animationDelay: `${i * 55}ms`,
                    }}
                  >
                    <StackAvatar name={a.full_name} size={26} />
                  </span>
                ))}
                {overflow > 0 && (
                  <span
                    style={{
                      marginLeft: -8, width: 26, height: 26, borderRadius: "50%",
                      background: "var(--surface-sunken)", color: "var(--text-muted)",
                      display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
                      boxShadow: "0 0 0 2px var(--surface)", fontVariantNumeric: "tabular-nums",
                      animation: `avatar-pop 300ms cubic-bezier(0.34,1.56,0.64,1) ${shown.length * 55}ms both`,
                    }}
                  >
                    +{overflow}
                  </span>
                )}
              </span>
            )}

            {/* Expand/collapse pill */}
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                height: 26, padding: "0 8px 0 10px", borderRadius: "var(--r-full)",
                border: "1px solid var(--border)",
                background: needsReview && !open ? "var(--brand-soft)" : "var(--surface)",
                color: needsReview && !open ? "var(--brand)" : "var(--text-secondary)",
                fontSize: "var(--font-xs)", fontWeight: 600,
                transition: "background var(--duration-fast), color var(--duration-fast)",
              }}
            >
              {open ? "Hide" : needsReview ? "Review" : "Manage"}
              <ChevronDown
                size={13}
                style={{
                  transform: open ? "rotate(180deg)" : "none",
                  transition: `transform var(--duration-fast) var(--ease-std)`,
                }}
              />
            </span>
          </span>
        </button>

        {/* ── Expandable drawer ── */}
        {open && (
          <div className="animate-fade-in" style={{ borderTop: "1px solid var(--divider)" }}>

            {/* Analyst review (owned by page) — only when pending_review.
                In that state reassignment lives inside the review's follow-up branch,
                so the standalone assignment manager below is suppressed. */}
            {reviewSlot}

            {/* Assignment manager — hidden during review to avoid two reassign surfaces */}
            {!needsReview && (
            <div style={{ padding: "14px 18px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    Assigned Technicians
                  </span>
                  {assigned.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", padding: "0 6px", height: 17, display: "inline-flex", alignItems: "center", borderRadius: "var(--r-full)", background: "var(--surface-sunken)", border: "1px solid var(--divider)" }}>
                      {assigned.length}
                    </span>
                  )}
                </span>
                <div>
                  <button
                    ref={addBtnRef}
                    type="button"
                    onClick={() => { setAddOpen((x) => !x); setPending(null); }}
                    disabled={saving || available.length === 0 || !!pending}
                    className="export-btn"
                    style={{ gap: 5, opacity: (available.length === 0 || !!pending) ? 0.5 : 1, cursor: (available.length === 0 || !!pending) ? "not-allowed" : "pointer" }}
                  >
                    <UserPlus size={12} />
                    Add
                  </button>
                  {addOpen && available.length > 0 && addBtnRect && createPortal(
                    <div
                      className="animate-scale-in"
                      style={{
                        position: "fixed",
                        bottom: window.innerHeight - addBtnRect.top + 6,
                        right: window.innerWidth - addBtnRect.right,
                        minWidth: 250,
                        maxHeight: 210,
                        overflowY: "auto",
                        borderRadius: "var(--r-md)",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        boxShadow: "var(--shadow-lg)",
                        zIndex: 9999,
                        transformOrigin: "bottom right",
                      }}
                    >
                      {available.map((t) => {
                        const w = workloadById.get(t.id);
                        return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => openPrompt({ kind: "add", id: t.id, name: t.full_name })}
                          className="menu-item"
                          style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 12px", border: 0, borderBottom: "1px solid var(--divider)", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                        >
                          <StackAvatar name={t.full_name} size={22} ring="transparent" />
                          <span style={{ fontSize: "var(--font-sm)", color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.full_name}</span>
                          {w && <TechnicianWorkloadBadge tech={w} />}
                          <Plus size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                        </button>
                        );
                      })}
                    </div>,
                    document.body,
                  )}
                </div>
              </div>

              {/* Roster — compact pill chips (matches the review-panel reassignment chips) */}
              {assigned.length === 0 ? (
                <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>
                  No technicians assigned yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {assigned.map((a) => {
                    const isTarget = pending?.kind === "remove" && pending.id === a.id;
                    return (
                      <span
                        key={a.id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 4px 0 6px",
                          borderRadius: "var(--r-full)",
                          background: isTarget ? "var(--danger-soft)" : "var(--surface-sunken)",
                          border: isTarget ? "1px solid color-mix(in oklab, var(--danger) 35%, transparent)" : "1px solid var(--divider)",
                          opacity: pending && !isTarget ? 0.55 : 1,
                          transition: "opacity var(--duration-fast), background var(--duration-fast)",
                        }}
                      >
                        <StackAvatar name={a.full_name} size={22} ring={isTarget ? "var(--danger-soft)" : "var(--surface-sunken)"} />
                        <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.full_name}
                        </span>
                        {a.assigned_at && (
                          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            {fmtDate(a.assigned_at)}
                          </span>
                        )}
                        {assigned.length > 1 && (
                          <button
                            type="button"
                            onClick={() => openPrompt({ kind: "remove", id: a.id, name: a.full_name })}
                            disabled={saving || !!pending}
                            title={`Remove ${a.full_name}`}
                            style={{
                              width: 20, height: 20, borderRadius: "50%", border: 0, background: "transparent",
                              display: "grid", placeItems: "center", cursor: pending ? "default" : "pointer",
                              color: "var(--text-muted)", flexShrink: 0,
                              transition: "color var(--duration-fast), background var(--duration-fast)",
                            }}
                            onMouseEnter={(e) => { if (!pending) { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "color-mix(in oklab, var(--danger) 12%, transparent)"; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                          >
                            <Minus size={12} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Reason prompt — required before any add/remove commits */}
              {pending && (
                <div className="animate-fade-in" style={{ marginTop: 10, borderRadius: "var(--r-md)", border: `1px solid ${pending.kind === "remove" ? "color-mix(in oklab, var(--danger) 30%, var(--border))" : "color-mix(in oklab, var(--brand) 30%, var(--border))"}`, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid var(--divider)", background: pending.kind === "remove" ? "var(--danger-soft)" : "var(--brand-soft)" }}>
                    <span style={{ display: "grid", placeItems: "center", color: pending.kind === "remove" ? "var(--danger)" : "var(--brand)" }}>
                      {pending.kind === "remove" ? <UserMinus size={14} /> : <UserPlus size={14} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>
                      {pending.kind === "remove" ? "Remove" : "Assign"} {pending.name}
                    </span>
                    <button type="button" onClick={closePrompt} disabled={saving} title="Cancel"
                      style={{ width: 22, height: 22, borderRadius: "var(--r-sm)", border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                  <div style={{ padding: "10px 12px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Reason <span style={{ color: "var(--danger)" }}>*</span>
                      </span>
                      <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                        {reason.trim() ? `${reason.trim().length} chars` : "required"}
                      </span>
                    </div>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={pending.kind === "remove"
                        ? `Why is ${pending.name.split(" ")[0]} being taken off this ticket?`
                        : `Why is ${pending.name.split(" ")[0]} being assigned?`}
                      rows={2}
                      disabled={saving}
                      autoFocus
                      onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commitPending(); }}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", outline: "none", resize: "none", background: "var(--surface-sunken)", color: "var(--text)", fontSize: "var(--font-sm)", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", opacity: saving ? 0.6 : 1 }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = pending.kind === "remove" ? "var(--danger)" : "var(--brand)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                      <Button variant="secondary" size="sm" onClick={closePrompt} disabled={saving}>
                        Cancel
                      </Button>
                      <Button
                        variant={pending.kind === "remove" ? "danger" : "primary"}
                        size="sm"
                        onClick={commitPending}
                        loading={saving}
                        disabled={saving || !reason.trim()}
                        style={{ gap: 6 }}
                      >
                        {pending.kind === "remove"
                          ? <><UserMinus size={13} /> {saving ? "Removing…" : "Remove"}</>
                          : <><UserPlus size={13} /> {saving ? "Assigning…" : "Assign"}</>}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid color-mix(in oklab, var(--danger) 25%, transparent)" }}>
                  <AlertTriangle size={12} style={{ color: "var(--danger)", flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--danger-on)" }}>{error}</p>
                </div>
              )}

              {/* Cancel control (owned by page) — only when assigned */}
              {cancelSlot}
            </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
