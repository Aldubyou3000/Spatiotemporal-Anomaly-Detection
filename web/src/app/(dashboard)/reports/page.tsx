"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { reportsApi } from "@/lib/api/reports";
import type { InspectionReport } from "@/types/reports";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_TONE: Record<string, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const PHOTO_GRADIENTS = [
  ["#1E6FD9", "#7C3AED"],
  ["#0D9488", "#22C55E"],
  ["#D97706", "#DC2626"],
  ["#3B82F6", "#0EA5E9"],
  ["#7C3AED", "#EC4899"],
  ["#16A34A", "#0891B2"],
];

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtDateTime(dateStr: string | null) {
  if (!dateStr) return { date: "—", time: "" };
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

function fmtRelative(dateStr: string | null) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmt(dateStr);
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = ["#1E6FD9", "#7C3AED", "#0D9488", "#D97706", "#DC2626", "#16A34A"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// ─── Photo Gallery ────────────────────────────────────────────────────────────

function PhotoGallery({ reportId }: { reportId: string }) {
  const [photos, setPhotos] = useState<{ id: string; photo_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    reportsApi.photos(reportId).then(setPhotos).catch(() => {}).finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
      <Camera size={13} /> Loading photos…
    </div>
  );

  if (photos.length === 0) return (
    <p style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>No photos attached.</p>
  );

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {photos.map((p, i) => {
          const [c1, c2] = PHOTO_GRADIENTS[i % PHOTO_GRADIENTS.length];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setLightbox(p.photo_url)}
              style={{
                aspectRatio: "4/3",
                borderRadius: "var(--r-md)",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
                position: "relative",
                cursor: "pointer",
                padding: 0,
                transition: "transform 0.12s ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photo_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 8px", background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)", fontSize: 10, color: "white", fontFamily: "var(--font-mono)" }}>
                IMG_{String(i + 1).padStart(3, "0")}.jpg
              </div>
            </button>
          );
        })}
      </div>

      {lightbox && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setLightbox(null)}>
          <button type="button" onClick={() => setLightbox(null)} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: 0, color: "white", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "var(--r-lg)", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ReportRow({ report, selected, onClick }: { report: InspectionReport; selected: boolean; onClick: () => void }) {
  const isPending = !report.analyst_approved;
  const techName = report.technician?.full_name ?? "";
  const stationName = report.ticket?.station_id ?? "Unknown station";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        padding: "14px 16px",
        background: selected ? "var(--brand-soft)" : "transparent",
        border: 0, borderBottom: "1px solid var(--divider)",
        cursor: "pointer", display: "block", position: "relative",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; }}
      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {selected && <div style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, background: "var(--brand)", borderRadius: 999 }} />}

      {/* Top row: ID + status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          RPT-{report.id.slice(-4).toUpperCase()}
        </span>
        <Badge tone={isPending ? "warning" : "success"} dot>
          {isPending ? "Pending review" : "Approved"}
        </Badge>
      </div>

      {/* Station name as primary title */}
      <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", lineHeight: 1.3, marginBottom: 8 }}>
        {stationName}
      </div>

      {/* Bottom: avatar + tech name + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {techName && (
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: avatarColor(techName), color: "white", fontSize: "var(--font-xs)", fontWeight: 700, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {initials(techName)}
            </div>
          )}
          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>{techName || "—"}</span>
        </div>
        <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{fmtRelative(report.submitted_at)}</span>
      </div>
    </button>
  );
}

// ─── Prop label ───────────────────────────────────────────────────────────────

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 4px" }}>{label}</p>
      <div style={{ fontSize: "var(--font-sm)", color: "var(--text)" }}>{children}</div>
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 8px" }}>{title}</p>
      {children}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ report, onApproved }: { report: InspectionReport; onApproved: (r: InspectionReport) => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isPending = !report.analyst_approved;
  const techName = report.technician?.full_name ?? "";
  const submitted = fmtDateTime(report.submitted_at);

  async function handleApprove() {
    setSaving(true);
    setError("");
    try {
      const updated = await reportsApi.approve(report.id, { analyst_notes: notes.trim() || undefined });
      onApproved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>RPT-{report.id.slice(-4).toUpperCase()}</span>
          <span>·</span>
          <span>linked to</span>
          {report.ticket_id && (
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--brand)" }}>
              {report.ticket_id.slice(0, 8).toUpperCase()}
            </span>
          )}
        </div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>
          {report.ticket?.station_id ?? "Unknown station"}
        </h2>
        <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>{report.ticket?.station_id ?? "—"}</span>
          {report.ticket?.title && <><span>·</span><span>{report.ticket.title}</span></>}
        </div>
      </div>

      {/* ── Properties strip ── */}
      <div style={{ padding: "12px 24px", background: "var(--surface-alt)", borderBottom: "1px solid var(--divider)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, flexShrink: 0 }}>
        <Prop label="Submitted by">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {techName && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: avatarColor(techName), color: "white", fontSize: "var(--font-xs)", fontWeight: 700, display: "grid", placeItems: "center", flexShrink: 0 }}>
                {initials(techName)}
              </div>
            )}
            <span style={{ fontWeight: 500 }}>{techName || "—"}</span>
          </div>
        </Prop>
        <Prop label="Submitted">
          <div style={{ fontWeight: 500 }}>{submitted.date}</div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{submitted.time}</div>
        </Prop>
        <Prop label="Time on site">
          <span style={{ fontWeight: 500 }}>—</span>
        </Prop>
        <Prop label="Severity">
          {report.severity ? (
            <Badge tone={SEVERITY_TONE[report.severity]}>{report.severity}</Badge>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )}
        </Prop>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Findings */}
        {report.notes && (
          <Section title="Findings">
            <p style={{ margin: 0, fontSize: "var(--font-sm)", lineHeight: 1.65, color: "var(--text-secondary)" }}>{report.notes}</p>
          </Section>
        )}

        {/* Root cause + Corrective action side by side */}
        {(report.root_cause) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Section title="Root cause">
              <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-secondary)" }}>{report.root_cause}</p>
            </Section>
            <Section title="Corrective action">
              <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>Not recorded</p>
            </Section>
          </div>
        )}

        {/* Attachments */}
        <Section title={`Attachments`}>
          <PhotoGallery reportId={report.id} />
        </Section>

        {/* Approved: analyst remarks */}
        {!isPending && (
          <div style={{ padding: 14, background: "color-mix(in oklab, var(--success) 8%, transparent)", borderRadius: "var(--r-md)", border: "1px solid color-mix(in oklab, var(--success) 25%, transparent)" }}>
            <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 6px" }}>Analyst Remarks</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-sm)", color: "var(--success)", marginBottom: report.analyst_notes ? 6 : 0 }}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              <span>Approved · {fmt(report.analyst_approved_at)}</span>
            </div>
            {report.analyst_notes ? (
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>{report.analyst_notes}</p>
            ) : (
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>No remarks added.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Pinned bottom action strip (pending only) ── */}
      {isPending && (
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "14px 24px", background: "var(--surface)" }}>
          {/* Ready to review row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: notes ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>Ready to review?</div>
              <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>Approving closes the linked ticket as verified.</div>
            </div>
          </div>

          {/* Optional remarks textarea */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add analyst remarks (optional)…"
            rows={notes ? 3 : 1}
            disabled={saving}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "var(--r-md)",
              border: "1px solid var(--border)", background: "var(--surface-alt)",
              color: "var(--text)", fontSize: "var(--font-sm)", resize: "none",
              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
              transition: "border-color 0.12s ease, box-shadow 0.12s ease, height 0.12s ease",
              opacity: saving ? 0.6 : 1, marginBottom: 10,
              display: "block",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
          />

          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid rgba(220,38,38,0.2)", marginBottom: 10 }}>
              <AlertTriangle size={12} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: "var(--font-sm)", color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setNotes("")}
              style={{
                height: 34, padding: "0 14px", borderRadius: "var(--r-md)",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-secondary)", fontSize: "var(--font-sm)", cursor: "pointer",
                fontFamily: "inherit", transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <X size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Reject
            </button>
            <Button onClick={handleApprove} loading={saving}>
              <CheckCircle2 size={14} strokeWidth={2.4} />
              {saving ? "Approving…" : "Approve & verify"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDetail() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-muted)" }}>
      <ClipboardCheck size={28} strokeWidth={1.4} />
      <p style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text-secondary)", margin: 0 }}>Select a report</p>
      <p style={{ fontSize: "var(--font-sm)", margin: 0 }}>Choose a report from the list to review it.</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "pending" | "approved" | "all";

export default function ReportsPage() {
  const { loading: authLoading } = useAuth();
  const [pending, setPending] = useState<InspectionReport[]>([]);
  const [approved, setApproved] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.list();
      setPending(res.pending);
      setApproved(res.approved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  function handleApproved(updated: InspectionReport) {
    setPending((prev) => prev.filter((r) => r.id !== updated.id));
    setApproved((prev) => [updated, ...prev]);
    setSelectedId(null);
  }

  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)", fontFamily: "var(--font-mono)" }}>Loading session…</p>
    </div>
  );

  const listByTab: InspectionReport[] =
    tab === "pending" ? pending : tab === "approved" ? approved : [...pending, ...approved];
  const selected = listByTab.find((r) => r.id === selectedId) ?? null;
  const counts = { pending: pending.length, approved: approved.length, all: pending.length + approved.length };
  const TABS: { key: Tab; label: string }[] = [
    { key: "pending", label: "Pending review" },
    { key: "approved", label: "Approved" },
    { key: "all", label: "All reports" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <Header
        title="Inspection Reports"
        description={`${counts.pending} pending review · ${counts.approved} approved`}
        live
        actions={
          <button
            type="button"
            onClick={fetchReports}
            style={{ height: 32, padding: "0 10px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "var(--font-sm)", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s ease" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <RefreshCw size={13} strokeWidth={2.2} style={{ animation: loading ? "spin 700ms linear infinite" : undefined }} />
            Refresh
          </button>
        }
      />

      {/* Tab row */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 28px", flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setSelectedId(null); }}
            style={{
              height: 40, padding: "0 4px", marginRight: 20,
              border: 0, background: "transparent",
              color: tab === t.key ? "var(--text)" : "var(--text-muted)",
              fontSize: "var(--font-sm)", fontWeight: 500,
              borderBottom: `2px solid ${tab === t.key ? "var(--brand)" : "transparent"}`,
              marginBottom: -1, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              transition: "color 0.12s, border-color 0.12s",
              fontFamily: "inherit",
            }}
          >
            {t.label}
            <span style={{ height: 18, padding: "0 6px", borderRadius: "var(--r-full)", background: "var(--surface-sunken)", border: "1px solid var(--border)", fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-muted)", display: "inline-grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--brand)", animation: "spin 700ms linear infinite" }} />
            <p style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", margin: 0 }}>Loading reports…</p>
          </div>
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <AlertTriangle size={20} style={{ color: "var(--danger)" }} />
          <p style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text)", margin: 0 }}>Failed to load</p>
          <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>{error}</p>
          <Button size="sm" variant="secondary" onClick={fetchReports} style={{ marginTop: 8 }}>Retry</Button>
        </div>
      ) : (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "clamp(240px, 28%, 340px) 1fr", gap: 16, padding: "16px 20px 20px", overflow: "hidden" }}>
          {/* Left list */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
              {listByTab.length === 0 ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 32 }}>
                  <CheckCircle2 size={22} style={{ color: tab === "pending" ? "var(--success)" : "var(--text-muted)" }} strokeWidth={1.6} />
                  <p style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text)", margin: 0 }}>
                    {tab === "pending" ? "All caught up" : "No records"}
                  </p>
                  <p style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
                    {tab === "pending" ? "No reports awaiting review." : "No approved reports yet."}
                  </p>
                </div>
              ) : (
                <>
                  {listByTab.map((r) => (
                    <ReportRow key={r.id} report={r} selected={r.id === selectedId} onClick={() => setSelectedId(r.id)} />
                  ))}
                  <div style={{ padding: "10px 16px", borderTop: "1px solid var(--divider)", fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: "auto", flexShrink: 0 }}>
                    {listByTab.length} {listByTab.length === 1 ? "report" : "reports"}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right detail */}
          <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-xs)" }}>
            {selected ? (
              <DetailPanel key={selected.id} report={selected} onApproved={handleApproved} />
            ) : (
              <EmptyDetail />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
