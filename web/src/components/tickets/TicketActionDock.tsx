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
import styles from "@/components/tickets/Tickets.module.css";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { TechnicianWorkloadBadge } from "@/components/tickets/TechnicianWorkloadBadge";
import { useTechnicianProfiles, useTicketTechnicians } from "@/hooks/useTechnicians";
import { byWorkload } from "@/lib/technicianWorkload";
import { ticketsApi } from "@/lib/api/tickets";
import { invalidateTicketLists } from "@/hooks/useTickets";
import { ReasonPicker } from "@/components/tickets/ReasonPicker";
import { ASSIGNMENT_REASONS, REMOVAL_REASONS } from "@/lib/ticketReasons";
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
  const [drawer, setDrawer] = useState({ review: needsReview, open: needsReview });
  // A mode change must not briefly show the previous mode's expanded form.
  const open = drawer.review === needsReview ? drawer.open : needsReview;
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setDrawer({ review: needsReview, open: needsReview });
    setAddOpen(false);
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
  const [preset, setPreset]   = useState<string | null>(null);
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
    setError(""); setReason(""); setPreset(null); setAddOpen(false); setPending(next);
  }
  function closePrompt() {
    setPending(null); setReason(""); setPreset(null);
  }

  const finalReason = preset && preset !== "Other" ? preset : reason.trim();
  // Commit the staged add/remove with the required reason.
  async function commitPending() {
    if (!pending || !finalReason || saving) return;
    const r = finalReason;
    setSaving(true); setError("");
    try {
      const updated = pending.kind === "add"
        ? await ticketsApi.assignTechnicians(ticket.id, [pending.id], r)
        : await ticketsApi.removeTechnician(ticket.id, pending.id, r);
      closePrompt();
      onUpdated(updated);
      await invalidateTicketLists();
      toast.success(
        pending.kind === "add" ? `${pending.name} assigned` : `${pending.name} removed`,
        { description: `TKT-${ticket.ticket_number} · ${pending.kind === "add" ? "added to the ticket" : "taken off the ticket"}.` },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to ${pending.kind === "add" ? "assign" : "remove"} technician.`;
      setError(msg);
      toast.error(`Couldn't ${pending.kind === "add" ? "assign" : "remove"} technician`, { description: msg });
    } finally { setSaving(false); }
  }

  // Verified tickets are terminal — nothing to act on, no dock.
  if (isVerified) return null;

  return (
    <>
      <div
        className={styles.actionDock}
        style={{
          position: "relative",
          background: "var(--surface)",
          boxShadow: "none",
        }}
      >
        <div className={styles.dockHeader}>
          {needsReview ? <ShieldCheck size={20} aria-hidden="true" /> : <Users size={20} aria-hidden="true" />}
          <div className={styles.dockLabel}>
            <strong>{needsReview ? "Inspection review" : "Assignment"}</strong>
            <span>{needsReview ? "Approve the report or request another visit" : `${assigned.length} technician${assigned.length === 1 ? "" : "s"} assigned`}</span>
          </div>
          {assigned.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", flexShrink: 0 }} aria-label="Assigned technicians">
            {assigned.slice(0, 3).map(technician => <StackAvatar key={technician.id} name={technician.full_name} />)}
            {assigned.length > 3 && <span title={assigned.slice(3).map(technician => technician.full_name).join(", ")} style={{ fontSize: "var(--font-xs)" }}>+{assigned.length - 3}</span>}
          </div>}
          <Button variant="secondary" size="sm" onClick={() => { setDrawer({ review: needsReview, open: !open }); setAddOpen(false); }} aria-expanded={open} aria-controls="ticket-action-drawer"
            aria-label={needsReview ? "Review inspection" : "Manage technicians"} className={styles.dockToggle} style={{ boxShadow: "none" }}>
            {open ? "Hide" : needsReview ? "Review" : "Manage"}
            <ChevronDown size={16} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </Button>
        </div>

        {/* ── Expandable drawer ── */}
        {open && (
          <div id="ticket-action-drawer" className={styles.dockBody}>

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
                    <span style={{ fontSize: "var(--font-xs)", fontWeight: 700, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", padding: "0 6px", height: 17, display: "inline-flex", alignItems: "center", borderRadius: "var(--r-full)", background: "var(--surface-sunken)", border: "1px solid var(--divider)" }}>
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
                <div  style={{ marginTop: 10, borderRadius: "var(--r-md)", border: `1px solid ${pending.kind === "remove" ? "color-mix(in oklab, var(--danger) 30%, var(--border))" : "color-mix(in oklab, var(--brand) 30%, var(--border))"}`, background: "var(--surface)", overflow: "hidden" }}>
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
                    <ReasonPicker
                      reasons={pending.kind === "remove" ? REMOVAL_REASONS : ASSIGNMENT_REASONS}
                      selected={preset}
                      variant={pending.kind === "remove" ? "danger" : "brand"}
                      onSelect={(v) => {
                        if (v === "Other") {
                          setPreset("Other");
                          if (preset && preset !== "Other") setReason("");
                        } else {
                          setPreset(v);
                          setReason(v);
                        }
                      }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Reason <span style={{ color: "var(--danger)" }}>*</span>
                      </span>
                      <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontVariantNumeric: "tabular-nums" }}>
                        {finalReason ? `${finalReason.length} chars` : "required"}
                      </span>
                    </div>
                    <textarea
                      value={preset && preset !== "Other" ? preset : reason}
                      onChange={(e) => {
                        if (preset !== "Other") return; // locked — only Other is editable
                        setReason(e.target.value);
                      }}
                      placeholder={preset === "Other"
                        ? (pending.kind === "remove"
                            ? `Type custom reason for removing ${pending.name.split(" ")[0]}…`
                            : `Type custom reason for assigning ${pending.name.split(" ")[0]}…`)
                        : preset && preset !== "Other"
                          ? preset
                          : "Select a reason above…"}
                      rows={2}
                      disabled={saving || preset !== "Other"}
                      readOnly={preset !== "Other"}
                      autoFocus={preset === "Other"}
                      onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commitPending(); }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "var(--r-sm)",
                        border: "1px solid var(--border)",
                        outline: "none",
                        resize: "none",
                        background: preset && preset !== "Other" ? "var(--surface)" : "var(--surface-sunken)",
                        color: "var(--text)",
                        fontSize: "var(--font-sm)",
                        fontFamily: "inherit",
                        lineHeight: 1.5,
                        boxSizing: "border-box",
                        opacity: saving || preset !== "Other" ? 0.9 : 1,
                        cursor: preset !== "Other" ? "default" : "text",
                      }}
                      onFocus={(e) => { if (preset === "Other") e.currentTarget.style.borderColor = pending.kind === "remove" ? "var(--danger)" : "var(--brand)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    />
                    {preset && preset !== "Other" && (
                      <p style={{ margin: "6px 0 0", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
                        Selected: “{preset}” — tap <span style={{ fontWeight: 600 }}>Other</span> to type a custom reason.
                      </p>
                    )}
                    {preset === "Other" && !reason.trim() && (
                      <p style={{ margin: "6px 0 0", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
                        Type your custom reason above.
                      </p>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                      <Button variant="secondary" size="sm" onClick={closePrompt} disabled={saving}>
                        Cancel
                      </Button>
                      <Button
                        variant={pending.kind === "remove" ? "danger" : "primary"}
                        size="sm"
                        onClick={commitPending}
                        loading={saving}
                        disabled={saving || !finalReason}
                        style={{ gap: 6 }}
                      >
                        {pending.kind === "remove"
                          ? <><UserMinus size={13} /> Remove</>
                          : <><UserPlus size={13} /> Assign</>}
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
