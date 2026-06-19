"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Minus,
  Plus,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTechnicianProfiles } from "@/hooks/useTechnicians";
import type { TicketDetail } from "@/types/tickets";

// ─── helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}
const TINTS = [
  ["#1E6FD9", "#EFF6FF"], ["#7C3AED", "#F5F3FF"], ["#0D9488", "#F0FDFA"],
  ["#D97706", "#FFFBEB"], ["#DC2626", "#FEF2F2"], ["#16A34A", "#F0FDF4"],
];
function tint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  return TINTS[h % TINTS.length];
}
function MiniAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const [bg, fg] = tint(name);
  return (
    <div title={name} style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, display: "grid", placeItems: "center", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

// ─── Portal picker — escapes overflow:hidden ancestors ──────────────────────────

type TechOption = { id: string; full_name: string };

function AddTechPicker({
  available, open, onToggle, onAdd,
}: {
  available: TechOption[];
  open: boolean;
  onToggle: () => void;
  onAdd: (id: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
  }, [open]);

  const dropdown = open && available.length > 0 && rect ? createPortal(
    <div
      className="animate-scale-in"
      style={{
        position: "fixed",
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        minWidth: 220,
        maxHeight: 200,
        overflowY: "auto",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-lg)",
        zIndex: 9999,
        transformOrigin: "bottom left",
      }}
    >
      {available.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onAdd(t.id)}
          className="menu-item"
          style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 12px", border: 0, borderBottom: "1px solid var(--divider)", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
        >
          <MiniAvatar name={t.full_name} size={22} />
          <span style={{ fontSize: "var(--font-sm)", color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.full_name}</span>
          <Plus size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        disabled={available.length === 0}
        className="export-btn"
        style={{ gap: 5, opacity: available.length === 0 ? 0.5 : 1, cursor: available.length === 0 ? "not-allowed" : "pointer" }}
      >
        <Plus size={12} /> Add technician
      </button>
      {dropdown}
    </div>
  );
}

export type ReviewReassign = { addIds: string[]; removeIds: string[] };
type Decision = "approve" | "follow_up";

// ─── Decision card ───────────────────────────────────────────────────────────────

function DecisionCard({
  active, accent, icon, title, subtitle, onSelect, disabled,
}: {
  active: boolean;
  accent: "success" | "warning";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const accentVar = accent === "success" ? "var(--success)" : "var(--warning)";
  const accentOn  = accent === "success" ? "var(--success)" : "var(--warning-on)";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      style={{
        flex: 1, minWidth: 0, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "flex-start", gap: 9,
        padding: "10px 11px", borderRadius: "var(--r-md)", fontFamily: "inherit",
        background: active ? `color-mix(in oklab, ${accentVar} 9%, var(--surface))` : "var(--surface)",
        border: active
          ? `1.5px solid ${accentVar}`
          : "1.5px solid var(--border)",
        boxShadow: active ? `0 0 0 3px color-mix(in oklab, ${accentVar} 14%, transparent)` : "none",
        transition: "border-color var(--duration-fast), background var(--duration-fast), box-shadow var(--duration-fast)",
      }}
      onMouseEnter={(e) => { if (!active && !disabled) e.currentTarget.style.borderColor = "var(--border-strong)"; }}
      onMouseLeave={(e) => { if (!active && !disabled) e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      {/* Radio dot */}
      <span
        style={{
          width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
          border: active ? `5px solid ${accentVar}` : "2px solid var(--border-strong)",
          background: "var(--surface)",
          transition: "border var(--duration-fast)",
        }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-sm)", fontWeight: 600, color: active ? accentOn : "var(--text)", lineHeight: 1.2 }}>
          <span style={{ display: "inline-flex", color: active ? accentOn : "var(--text-muted)" }}>{icon}</span>
          {title}
        </span>
        <span style={{ display: "block", fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

// ─── Review panel ───────────────────────────────────────────────────────────────

/**
 * The analyst's pending-review decision surface. Presents an explicit two-way
 * choice (approve vs. follow-up) where the note field and the single action button
 * both belong unambiguously to the selected decision. The follow-up branch also
 * exposes an optional re-visit reassignment editor.
 */
export function ReviewPanel({
  ticket,
  approving,
  error,
  onApprove,
  onFollowUp,
}: {
  ticket: TicketDetail;
  approving: boolean;
  error: string;
  onApprove: (notes: string) => void;
  onFollowUp: (notes: string, reassign: ReviewReassign) => void;
}) {
  const { technicians: allTechnicians } = useTechnicianProfiles();
  const [decision, setDecision]   = useState<Decision>("approve");
  const [approveNotes, setApproveNotes] = useState("");
  const [followNotes, setFollowNotes]   = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  // Pending reassignment, staged locally and applied on "Send follow-up".
  const current = ticket.technicians ?? [];
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [addIds, setAddIds]       = useState<Set<string>>(new Set());

  const currentKept = current.filter((t) => !removeIds.has(t.id));
  const addedTechs  = allTechnicians.filter((t) => addIds.has(t.id));
  const finalRoster = [...currentKept, ...addedTechs];
  const available   = allTechnicians.filter(
    (t) => !current.some((c) => c.id === t.id) && !addIds.has(t.id),
  );
  const reassignTouched = removeIds.size > 0 || addIds.size > 0;

  const isApprove   = decision === "approve";
  const followReady = followNotes.trim().length > 0;

  function toggleRemove(id: string) {
    setRemoveIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function addTech(id: string) {
    setAddIds((prev) => new Set(prev).add(id));
    setAddPickerOpen(false);
  }
  function undoAdd(id: string) {
    setAddIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function submit() {
    if (approving) return;
    if (isApprove) {
      onApprove(approveNotes.trim());
    } else {
      if (!followReady) return;
      onFollowUp(followNotes.trim(), { addIds: [...addIds], removeIds: [...removeIds] });
    }
  }

  return (
    <div style={{ padding: "14px 18px 16px", borderBottom: "1px solid var(--divider)", background: "color-mix(in oklab, var(--brand) 3%, var(--surface))", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Step 1 — the decision */}
      <div>
        <span style={{ display: "block", fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
          Your decision
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <DecisionCard
            active={isApprove}
            accent="success"
            icon={<CheckCircle2 size={13} strokeWidth={2.4} />}
            title="Approve & verify"
            subtitle="Close the ticket as verified"
            onSelect={() => {
              setDecision("approve");
              setRemoveIds(new Set());
              setAddIds(new Set());
              setReassignOpen(false);
              setAddPickerOpen(false);
            }}
            disabled={approving}
          />
          <DecisionCard
            active={!isApprove}
            accent="warning"
            icon={<RefreshCw size={12} strokeWidth={2.4} />}
            title="Request follow-up"
            subtitle="Send back for a re-visit"
            onSelect={() => setDecision("follow_up")}
            disabled={approving}
          />
        </div>
      </div>

      {/* Step 2 — fields for the chosen decision (note clearly belongs to it) */}
      {isApprove ? (
        <div key="approve" className="animate-fade-in" style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px 2px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Approval remarks</span>
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
              {approveNotes.length > 0 ? `${approveNotes.length} chars` : "optional"}
            </span>
          </div>
          <textarea
            value={approveNotes}
            onChange={(e) => setApproveNotes(e.target.value)}
            placeholder="Summarise your findings, or leave blank to approve without remarks…"
            rows={2}
            disabled={approving}
            style={{ width: "100%", padding: "4px 12px 10px", border: 0, outline: "none", resize: "none", background: "transparent", color: "var(--text)", fontSize: "var(--font-sm)", fontFamily: "inherit", lineHeight: 1.55, opacity: approving ? 0.6 : 1, display: "block", boxSizing: "border-box" }}
          />
        </div>
      ) : (
        <div key="follow" className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Required instructions */}
          <div style={{ borderRadius: "var(--r-md)", border: `1px solid ${followReady ? "var(--border)" : "color-mix(in oklab, var(--warning) 40%, var(--border))"}`, background: "var(--surface)", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px 2px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                Instructions for technician <span style={{ color: "var(--danger)" }}>*</span>
              </span>
              <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                {followReady ? `${followNotes.trim().length} chars` : "required"}
              </span>
            </div>
            <textarea
              value={followNotes}
              onChange={(e) => setFollowNotes(e.target.value)}
              placeholder="Describe what needs to be done differently on the re-visit…"
              rows={3}
              disabled={approving}
              autoFocus
              style={{ width: "100%", padding: "4px 12px 10px", border: 0, outline: "none", resize: "none", background: "transparent", color: "var(--text)", fontSize: "var(--font-sm)", fontFamily: "inherit", lineHeight: 1.55, opacity: approving ? 0.6 : 1, display: "block", boxSizing: "border-box" }}
            />
          </div>

          {/* Optional reassignment */}
          <div style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)" }}>
            <button
              type="button"
              onClick={() => setReassignOpen((x) => !x)}
              className="card-toggle"
              style={{ padding: "9px 12px", gap: 8 }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <UserPlus size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>
                  Re-assign re-visit
                </span>
                <span style={{ fontSize: "var(--font-xs)", color: reassignTouched ? "var(--warning-on)" : "var(--text-muted)", fontWeight: reassignTouched ? 600 : 400 }}>
                  {reassignTouched ? "· changes staged" : "· optional"}
                </span>
              </span>
              <ChevronDown size={15} style={{ color: "var(--text-muted)", flexShrink: 0, transform: reassignOpen ? "rotate(180deg)" : "none", transition: "transform var(--duration-fast) var(--ease-std)" }} />
            </button>

            {reassignOpen && (
              <div className="animate-fade-in" style={{ padding: "2px 12px 12px", borderTop: "1px solid var(--divider)" }}>
                <p style={{ margin: "10px 0 8px", fontSize: "var(--font-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Keep the current team or change who handles the re-visit. Applied when you send the follow-up.
                </p>

                {/* Add control */}
                <AddTechPicker
                  available={available}
                  open={addPickerOpen}
                  onToggle={() => setAddPickerOpen((x) => !x)}
                  onAdd={addTech}
                />

                {finalRoster.length === 0 ? (
                  <p style={{ margin: "0 0 8px", fontSize: "var(--font-sm)", color: "var(--danger)", fontStyle: "italic" }}>
                    At least one technician must remain assigned.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {currentKept.map((t) => (
                      <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 6px 0 8px", borderRadius: "var(--r-full)", background: "var(--surface-sunken)", border: "1px solid var(--divider)" }}>
                        <MiniAvatar name={t.full_name} size={20} />
                        <span style={{ fontSize: "var(--font-sm)", color: "var(--text)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.full_name}</span>
                        <button type="button" onClick={() => toggleRemove(t.id)} disabled={finalRoster.length === 1} title={`Remove ${t.full_name}`}
                          style={{ width: 18, height: 18, borderRadius: "50%", border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: finalRoster.length === 1 ? "not-allowed" : "pointer", color: "var(--text-muted)", flexShrink: 0, opacity: finalRoster.length === 1 ? 0.4 : 1 }}>
                          <Minus size={11} />
                        </button>
                      </span>
                    ))}
                    {addedTechs.map((t) => (
                      <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 6px 0 8px", borderRadius: "var(--r-full)", background: "color-mix(in oklab, var(--success) 10%, var(--surface))", border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)" }}>
                        <MiniAvatar name={t.full_name} size={20} />
                        <span style={{ fontSize: "var(--font-sm)", color: "var(--text)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.full_name}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.04em" }}>new</span>
                        <button type="button" onClick={() => undoAdd(t.id)} title={`Remove ${t.full_name}`}
                          style={{ width: 18, height: 18, borderRadius: "50%", border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                          <Minus size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Removed-but-restorable chips */}
                {current.filter((t) => removeIds.has(t.id)).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {current.filter((t) => removeIds.has(t.id)).map((t) => (
                      <button key={t.id} type="button" onClick={() => toggleRemove(t.id)} title={`Restore ${t.full_name}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px 0 8px", borderRadius: "var(--r-full)", background: "transparent", border: "1px dashed var(--border-strong)", cursor: "pointer", fontFamily: "inherit", opacity: 0.7 }}>
                        <MiniAvatar name={t.full_name} size={20} />
                        <span style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", textDecoration: "line-through", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.full_name}</span>
                        <Plus size={11} style={{ color: "var(--text-muted)" }} />
                      </button>
                    ))}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — single action that matches the decision */}
      <Button
        variant="primary"
        size="md"
        loading={approving}
        disabled={approving || (!isApprove && !followReady) || (!isApprove && finalRoster.length === 0)}
        onClick={submit}
        style={{
          width: "100%", justifyContent: "center", gap: 7,
          background: approving
            ? "var(--brand)"
            : isApprove ? "var(--success)" : "var(--warning)",
          borderColor: approving
            ? "var(--brand)"
            : isApprove ? "var(--success)" : "var(--warning)",
          color: "var(--brand-fg)",
          boxShadow: "var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.18)",
        }}
        onMouseEnter={(e) => { if (!approving) e.currentTarget.style.filter = "brightness(0.94)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = ""; }}
      >
        {isApprove
          ? <><CheckCircle2 size={15} strokeWidth={2.4} /> {approving ? "Approving…" : "Approve & verify"}</>
          : <><RefreshCw size={14} strokeWidth={2.4} /> {approving ? "Sending…" : "Send follow-up"}</>}
      </Button>

      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid color-mix(in oklab, var(--danger) 25%, transparent)" }}>
          <AlertTriangle size={12} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: "var(--font-xs)", color: "var(--danger-on)", margin: 0 }}>{error}</p>
        </div>
      )}
    </div>
  );
}
