"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  UserPlus,
  WifiOff,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { STATUS_LABEL, STATUS_TONE, PRIORITY_TONE, SEVERITY_TONE } from "@/lib/ticketStatus";

// ─── Normalized model ─────────────────────────────────────────────────────────

export type DetailStatus = "assigned" | "in-progress" | "pending_review" | "follow_up" | "verified" | "cancelled";
export type DetailPriority = "low" | "medium" | "high";
export type DetailSeverity = "low" | "medium" | "high";

export interface DetailPhoto { id: string; photo_url: string }
export interface DetailAttachment { id: string; file_name: string; file_url: string; file_size: number | null }
export interface DetailAssignee { id: string; name: string; assignedAt?: string | null }

export interface PriorRound {
  id: string;
  round: number;
  submittedAt?: string | null;
  severity?: DetailSeverity | null;
  notes?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  issueResolved?: boolean | null;
  /** Analyst note that sent THIS round back (null if not recorded — pre-migration rounds). */
  followUpNotes?: string | null;
  photos?: DetailPhoto[];
}

export interface DetailModel {
  kind: "ticket" | "report";
  refId: string;
  linkedTicketId?: string | null;
  linkedTicketNum?: number | null;

  title: string;
  subtitle?: string | null;
  status: DetailStatus;
  priority?: DetailPriority | null;
  zone?: string | null;

  // Multi-technician — use assignees[]; assigneeName kept for timeline compat
  assignees?: DetailAssignee[] | null;
  assigneeName?: string | null;

  stationId: string;
  stationName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  description?: string | null;
  anomalyData?: Record<string, unknown> | null;

  // Follow-up metadata
  followUpCount?: number;
  followUpNotes?: string | null;

  // Cancellation
  cancellationReason?: string | null;

  // Assignment history (previously removed assignees)
  assigneesHistory?: DetailAssignee[] | null;

  report: {
    submittedAt?: string | null;
    severity?: DetailSeverity | null;
    notes?: string | null;
    rootCause?: string | null;
    correctiveAction?: string | null;
    issueResolved?: boolean | null;
    analystApproved?: boolean;
    analystApprovedAt?: string | null;
    analystNotes?: string | null;
    photos?: DetailPhoto[];
    round?: number;
  } | null;

  // Archived prior inspection rounds (oldest-first) — the ticket's full history.
  priorRounds?: PriorRound[];

  attachments?: DetailAttachment[];

  onDownload?: () => void;
  downloading?: boolean;
}

// ─── Tokens ───────────────────────────────────────────────────────────────────
// Status / priority / severity colors come from the shared canonical map (see
// the import above) so the detail panel can never disagree with the list.
// Zone coloring is detail-only and stays local.

const ZONE_TONE: Record<string, "success" | "warning" | "danger"> = {
  A: "success", B: "warning", C: "danger",
};

const PHOTO_GRADIENTS = [
  ["#1E6FD9","#7C3AED"],["#0D9488","#22C55E"],["#D97706","#DC2626"],
  ["#3B82F6","#0EA5E9"],["#7C3AED","#EC4899"],["#16A34A","#0891B2"],
];
const AVATAR_COLORS = [
  ["#1E6FD9","#EFF6FF"],["#7C3AED","#F5F3FF"],["#0D9488","#F0FDFA"],
  ["#D97706","#FFFBEB"],["#DC2626","#FEF2F2"],["#16A34A","#F0FDF4"],
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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 24, ring }: { name: string; size?: number; ring?: string }) {
  const [bg, fg] = avatarColor(name);
  return (
    <div title={name} style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, display: "grid", placeItems: "center", fontSize: size * 0.42, fontWeight: 700, flexShrink: 0, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
      {initials(name)}
    </div>
  );
}

// ─── Expandable assignees list ────────────────────────────────────────────────

function AssigneeCell({ assignees, assigneeName }: { assignees?: DetailAssignee[] | null; assigneeName?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const list = assignees ?? (assigneeName ? [{ id: "shadow", name: assigneeName }] : []);

  if (list.length === 0) {
    return <span style={{ fontSize: "var(--font-md)", color: "var(--text-muted)" }}>Unassigned</span>;
  }

  const CAP = 4;
  const shown = list.slice(0, CAP);
  const overflow = list.length - shown.length;
  const canExpand = list.length > 1;

  return (
    <div>
      {/* Collapsed — overlapping avatar stack */}
      <button
        type="button"
        onClick={() => canExpand && setExpanded((x) => !x)}
        style={{
          display: "flex", alignItems: "center", gap: 0, background: "none", border: "none",
          padding: 0, cursor: canExpand ? "pointer" : "default", textAlign: "left",
        }}
      >
        {/* Overlapping avatars */}
        <span style={{ display: "flex", alignItems: "center" }}>
          {shown.map((a, i) => (
            <span key={a.id} style={{ marginLeft: i === 0 ? 0 : -7, zIndex: shown.length - i }}>
              <Avatar name={a.name} size={24} ring="var(--surface-sunken)" />
            </span>
          ))}
          {overflow > 0 && (
            <span style={{
              marginLeft: -7, width: 24, height: 24, borderRadius: "50%",
              background: "var(--surface)", border: "2px solid var(--surface-sunken)",
              display: "grid", placeItems: "center",
              fontSize: 9.5, fontWeight: 700, color: "var(--text-muted)",
              fontVariantNumeric: "tabular-nums", flexShrink: 0,
            }}>
              +{overflow}
            </span>
          )}
        </span>
        {/* Name of first + toggle hint */}
        <span style={{ marginLeft: 9, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: "var(--font-md)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {list[0].name}
          </span>
          {canExpand && (
            <span style={{ display: "inline-flex", alignItems: "center", color: "var(--text-muted)", flexShrink: 0 }}>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          )}
        </span>
      </button>

      {/* Expanded — full list */}
      {expanded && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {list.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Avatar name={a.name} size={20} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>{a.name}</span>
              {a.assignedAt && (
                <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>· {fmtRelative(a.assignedAt)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h3
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            margin: 0,
            fontSize: "var(--font-lg)",
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.012em",
          }}
        >
          <span aria-hidden style={{ width: 3, height: 15, borderRadius: 2, background: "var(--brand)", flexShrink: 0 }} />
          {title}
        </h3>
        {badge && (
          <span style={{
            display: "inline-flex", alignItems: "center", height: 24, padding: "0 9px",
            borderRadius: "var(--r-sm)", fontSize: "var(--font-xs)", fontWeight: 500,
            fontFamily: "var(--font-mono)", color: "var(--text-secondary)",
            background: "var(--surface-sunken)", border: "1px solid var(--border)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── Sub-heading (level 2 — sits inside a Section, below the section title) ────

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 9,
        fontSize: "var(--font-base)",
        fontWeight: 600,
        color: "var(--text-secondary)",
        letterSpacing: "-0.005em",
      }}
    >
      <span aria-hidden style={{ width: 3, height: 12, borderRadius: 2, background: "var(--border-strong)", flexShrink: 0 }} />
      {children}
    </div>
  );
}

// ─── Property strip cell ──────────────────────────────────────────────────────

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 7 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Metric cell ──────────────────────────────────────────────────────────────

type MetricAccent = "red" | "amber" | "none";

function Metric({ label, value, accent }: { label: string; value: string; accent?: MetricAccent }) {
  const color = accent === "red" ? "var(--danger-on)" : accent === "amber" ? "var(--warning-on)" : "var(--text)";
  return (
    <div style={{ padding: "14px 16px", background: "var(--surface-sunken)", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--font-metric)", color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function AnomalyMetrics({ data, zone }: { data: Record<string, unknown> | null | undefined; zone: string | null | undefined }) {
  if (!data && !zone) return null;
  const entries = data ? Object.entries(data).filter(([, v]) => v !== null && v !== undefined) : [];

  const pick = (keys: string[]) => entries.find(([k]) => keys.some((q) => k.toLowerCase().includes(q)));
  const zEntry     = pick(["zscore", "z_score", "lof", "score"]);
  const rainEntry  = pick(["rainfall", "rain", "value", "reading", "mm"]);
  const neighEntry = pick(["neighbor", "neighbour", "median", "avg", "mean"]);
  const confEntry  = pick(["conf", "probability", "prob"]);

  const fmtNum = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : String(v));

  const rain = rainEntry ? Number(rainEntry[1]) : null;
  const neigh = neighEntry ? Number(neighEntry[1]) : null;
  const z = zEntry ? Number(zEntry[1]) : null;
  const confRaw = confEntry ? Number(confEntry[1]) : null;
  const confPct = confRaw !== null ? (confRaw <= 1 ? confRaw * 100 : confRaw) : null;

  const cards: { label: string; value: string; accent?: MetricAccent }[] = [];
  if (rain  !== null) cards.push({ label: "24h rainfall", value: `${rain.toFixed(1)} mm`,  accent: rain > 80 ? "red" : rain > 40 ? "amber" : "none" });
  if (neigh !== null) cards.push({ label: "Neighbor avg", value: `${neigh.toFixed(1)} mm` });
  if (z     !== null) cards.push({ label: "Z-score",      value: `${z.toFixed(1)}σ`,        accent: Math.abs(z) > 3 ? "red" : "amber" });
  if (confPct !== null) cards.push({ label: "Model conf.", value: `${confPct.toFixed(0)}%` });

  if (cards.length === 0 && entries.length > 0) {
    entries.slice(0, 4).forEach(([k, v]) => cards.push({ label: k.replace(/_/g, " "), value: fmtNum(v) }));
  }
  if (cards.length === 0) return null;

  return (
    <Section title="Anomaly Metrics" badge={confPct !== null ? `conf ${confPct.toFixed(0)}%` : zone ? `Zone ${zone}` : undefined}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, 1fr)`, gap: 10 }}>
        {cards.slice(0, 8).map((c) => <Metric key={c.label} {...c} />)}
      </div>
    </Section>
  );
}

// ─── Prose ────────────────────────────────────────────────────────────────────

function Prose({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <p style={{ margin: 0, fontSize: "var(--font-base)", lineHeight: 1.72, color: muted ? "var(--text-muted)" : "var(--text-secondary)", fontStyle: muted ? "italic" : "normal" }}>
      {children}
    </p>
  );
}

// ─── Activity timeline ────────────────────────────────────────────────────────

type ActivityKind = "created" | "priority" | "assign" | "progress" | "report" | "follow_up" | "verify";
type ActivityEntry = { id: string; kind: ActivityKind; who: string; ts: string; text: string };

function timelineIcon(kind: ActivityKind) {
  const s = 9;
  switch (kind) {
    case "verify":    return <Check size={s} strokeWidth={3} />;
    case "assign":    return <UserPlus size={s} />;
    case "report":    return <FileText size={s} />;
    case "progress":  return <Activity size={s} />;
    case "priority":  return <AlertTriangle size={s} />;
    case "follow_up": return <RefreshCw size={s} />;
    default:          return <Plus size={s} />;
  }
}
function timelineBg(kind: ActivityKind) {
  switch (kind) {
    case "verify":    return "var(--success-soft)";
    case "assign":    return "var(--brand-soft)";
    case "report":    return "var(--accent-soft)";
    case "progress":  return "var(--warning-soft)";
    case "priority":  return "var(--danger-soft)";
    case "follow_up": return "var(--warning-soft)";
    default:          return "var(--surface-sunken)";
  }
}
function timelineFg(kind: ActivityKind) {
  switch (kind) {
    case "verify":    return "var(--success-on)";
    case "assign":    return "var(--on-brand-soft)";
    case "report":    return "var(--accent-on)";
    case "progress":  return "var(--warning-on)";
    case "priority":  return "var(--danger-on)";
    case "follow_up": return "var(--warning-on)";
    default:          return "var(--text-muted)";
  }
}

function buildActivity(m: DetailModel): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  const r = m.report;
  const primaryName = m.assignees?.[0]?.name ?? m.assigneeName;
  const allNames = m.assignees && m.assignees.length > 0
    ? m.assignees.map((a) => a.name).join(", ")
    : m.assigneeName ?? null;

  if (m.zone && m.createdAt) {
    const conf = m.anomalyData
      ? (() => {
          const e = Object.entries(m.anomalyData).find(([k]) => /conf|prob/i.test(k));
          return e ? Number(e[1]) : null;
        })()
      : null;
    out.push({
      id: "created", kind: "created", who: "Pipeline", ts: m.createdAt,
      text: conf !== null
        ? `Anomaly detected via Zone ${m.zone} LOF (contamination ${conf.toFixed(2)})`
        : `Anomaly detected via Zone ${m.zone} — ticket opened`,
    });
  } else if (m.createdAt) {
    out.push({ id: "created", kind: "created", who: "System", ts: m.createdAt, text: "Ticket created" });
  }

  if (m.priority === "high" && m.createdAt) {
    out.push({ id: "priority", kind: "priority", who: "System", ts: m.createdAt, text: "Priority set to High (z > 4σ)" });
  }

  if (allNames && m.createdAt) {
    out.push({ id: "assign", kind: "assign", who: "Analyst", ts: m.createdAt, text: `Assigned to ${allNames}` });
  }

  if (r?.submittedAt) {
    const n = r.photos?.length ?? 0;
    const roundSuffix = r.round && r.round > 1 ? ` (round ${r.round})` : "";
    out.push({
      id: "report", kind: "report", who: primaryName ?? "Technician", ts: r.submittedAt,
      text: n > 0
        ? `Field report submitted${roundSuffix} with ${n} attachment${n !== 1 ? "s" : ""}`
        : `Field report submitted${roundSuffix}`,
    });
  }

  // Follow-up event (injected between report and next verify)
  if ((m.followUpCount ?? 0) > 0 && r?.submittedAt) {
    out.push({
      id: "follow_up", kind: "follow_up", who: "Analyst", ts: r.submittedAt,
      text: m.followUpNotes
        ? `Follow-up requested — "${m.followUpNotes.slice(0, 80)}${m.followUpNotes.length > 80 ? "…" : ""}"`
        : `Follow-up visit requested (${m.followUpCount} total)`,
    });
  }

  if (r?.analystApproved && r.analystApprovedAt) {
    out.push({
      id: "verify", kind: "verify", who: "Analyst", ts: r.analystApprovedAt,
      text: r.analystNotes
        ? `Report verified — ${r.analystNotes.slice(0, 64)}${r.analystNotes.length > 64 ? "…" : ""}`
        : "Report verified — sensor recalibrated",
    });
  }

  return out.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

function ActivityTimeline({ model }: { model: DetailModel }) {
  const events = buildActivity(model);
  if (events.length === 0) return <Prose muted>No activity recorded.</Prose>;

  return (
    <div style={{ position: "relative", paddingLeft: 26 }}>
      <div style={{ position: "absolute", left: 10, top: 8, bottom: 8, width: 2, background: "var(--divider)" }} />
      {events.map((evt, i) => (
        <div key={evt.id} style={{ position: "relative", paddingBottom: i === events.length - 1 ? 0 : 20 }}>
          <div style={{
            position: "absolute", left: -26, top: 1,
            width: 20, height: 20, borderRadius: 999,
            background: timelineBg(evt.kind), color: timelineFg(evt.kind),
            display: "grid", placeItems: "center", border: "2px solid var(--surface)",
          }}>
            {timelineIcon(evt.kind)}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>{evt.who}</span>
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>· {fmtTime(evt.ts)} {fmtDate(evt.ts)}</span>
          </div>
          <div style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", lineHeight: 1.65 }}>{evt.text}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Photos + attachments ─────────────────────────────────────────────────────

function PhotoGrid({ photos, onOpen }: { photos: DetailPhoto[]; onOpen: (u: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {photos.map((p, i) => {
        const [c1, c2] = PHOTO_GRADIENTS[i % PHOTO_GRADIENTS.length];
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.photo_url)}
            className="photo-thumb"
            aria-label={`View attachment ${i + 1}`}
            style={{
              position: "relative", display: "block", width: 160, height: 120,
              borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)",
              background: `linear-gradient(135deg, ${c1}, ${c2})`, cursor: "zoom-in", padding: 0, flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo_url} alt={`Attachment ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 8px", background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)", fontSize: 10, color: "white", fontFamily: "var(--font-mono)" }}>
              IMG_{String(i + 1).padStart(3, "0")}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Prior round card (collapsed history entry, expands to full findings) ──────

function PriorRoundCard({ round: r, onOpenPhoto }: { round: PriorRound; onOpenPhoto: (u: string) => void }) {
  const [open, setOpen] = useState(false);
  const photos = r.photos ?? [];

  return (
    <div style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
      {/* Collapsed header — quiet, scannable summary */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="card-toggle"
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.02em", flexShrink: 0 }}>
          Round {r.round}
        </span>
        {r.submittedAt && (
          <span style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", flexShrink: 0 }}>{fmtDate(r.submittedAt)}</span>
        )}
        {r.issueResolved != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", fontWeight: 600, color: r.issueResolved ? "var(--success)" : "var(--danger)", flexShrink: 0 }}>
            {r.issueResolved ? <CheckCircle2 size={12} strokeWidth={2.5} /> : <WifiOff size={12} />}
            {r.issueResolved ? "Resolved" : "Unresolved"}
          </span>
        )}
        {r.severity && <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge>}
        {r.followUpNotes != null && (
          <span title="Followed up after this round" style={{ display: "inline-flex", alignItems: "center", color: "var(--warning-on)", flexShrink: 0 }}>
            <RefreshCw size={12} strokeWidth={2.2} />
          </span>
        )}
        <span style={{ flex: 1 }} />
        <ChevronDown size={15} style={{ color: "var(--text-muted)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform var(--duration-fast) var(--ease-std)" }} />
      </button>

      {/* Expanded — full findings for this round */}
      {open && (
        <div style={{ borderTop: "1px solid var(--divider)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
          {r.notes && (
            <div style={{ padding: "12px 0", borderBottom: "1px solid var(--divider)" }}>
              <SubHeading>Field Observations</SubHeading>
              <div style={{ paddingLeft: 14 }}><Prose>{r.notes}</Prose></div>
            </div>
          )}
          {r.rootCause && (
            <div style={{ padding: "12px 0", borderBottom: "1px solid var(--divider)" }}>
              <SubHeading>Root Cause</SubHeading>
              <div style={{ paddingLeft: 14 }}><Prose>{r.rootCause}</Prose></div>
            </div>
          )}
          {r.correctiveAction && (
            <div style={{ padding: "12px 0", borderBottom: "1px solid var(--divider)" }}>
              <SubHeading>Corrective Action &amp; Recommendations</SubHeading>
              <div style={{ paddingLeft: 14 }}><Prose>{r.correctiveAction}</Prose></div>
            </div>
          )}
          {photos.length > 0 && (
            <div style={{ padding: "12px 0", borderBottom: "1px solid var(--divider)" }}>
              <SubHeading>Photos</SubHeading>
              <div style={{ paddingLeft: 14 }}><PhotoGrid photos={photos} onOpen={onOpenPhoto} /></div>
            </div>
          )}
          {/* The analyst note that sent THIS round back */}
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: "var(--r-md)", background: "color-mix(in oklab, var(--warning) 8%, var(--surface))", border: "1px solid color-mix(in oklab, var(--warning) 25%, transparent)", borderLeft: "3px solid var(--warning-on)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-sm)", color: "var(--warning-on)", fontWeight: 700, marginBottom: 6 }}>
              <RefreshCw size={13} strokeWidth={2.4} />
              Follow-up requested after this round
            </div>
            {r.followUpNotes
              ? <Prose>{r.followUpNotes}</Prose>
              : <Prose muted>Follow-up note not recorded for this round.</Prose>}
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentList({ items }: { items: DetailAttachment[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((att) => {
        const kb = att.file_size ? Math.round(att.file_size / 1024) : null;
        return (
          <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-alt)", textDecoration: "none" }}>
            <FileText size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "var(--font-md)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.file_name}</p>
              {kb !== null && <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{kb} KB</p>}
            </div>
            <ExternalLink size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </a>
        );
      })}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}
    >
      <button type="button" onClick={onClose} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)", color: "white", display: "grid", placeItems: "center", cursor: "pointer" }}>
        <X size={16} />
      </button>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(860px, 90vw)", maxHeight: "80vh", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "0 32px 96px rgba(0,0,0,0.7)", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" style={{ width: "100%", height: "auto", maxHeight: "80vh", objectFit: "contain", display: "block" }} />
      </div>
    </div>,
    document.body,
  );
}

// ─── Main shared body ─────────────────────────────────────────────────────────

export function TicketDetailBody({ model, footer, children }: { model: DetailModel; footer?: React.ReactNode; children?: React.ReactNode }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const r = model.report;
  const prefix = model.kind === "report" ? "RPT" : "TKT";
  const photos = r?.photos ?? [];
  const attachments = model.attachments ?? [];
  const hasReport = !!r;
  const approved = !!r?.analystApproved;
  const hasFindings = !!(r?.notes || r?.rootCause || r?.correctiveAction || r?.issueResolved != null);
  const isFollowUp = model.status === "follow_up";
  const round = r?.round ?? 1;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", flex: 1, minHeight: 0 }}>

      {/* ── HEADER BAR ── */}
      <div style={{ borderBottom: "1px solid var(--divider)", flexShrink: 0, display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0, padding: "16px 20px 16px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: "var(--r-sm)", background: "var(--surface-sunken)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" }}>
                {prefix}-{model.refId}
              </span>
              <Badge tone={STATUS_TONE[model.status]} dot>{STATUS_LABEL[model.status]}</Badge>
              {model.priority && <Badge tone={PRIORITY_TONE[model.priority]}>{model.priority[0].toUpperCase() + model.priority.slice(1)} priority</Badge>}
              {model.zone && <Badge tone={ZONE_TONE[model.zone] ?? "info"}>Zone {model.zone}</Badge>}
              {round > 1 && (
                <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: "var(--r-sm)", background: "color-mix(in oklab, var(--warning) 10%, var(--surface))", border: "1px solid color-mix(in oklab, var(--warning) 25%, transparent)", fontSize: 11, fontWeight: 600, color: "var(--warning-on)", letterSpacing: "0.02em" }}>
                  Round {round}
                </span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: "var(--font-xl)", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--text)", lineHeight: 1.25 }}>
              {model.title}
            </h2>
            {(model.subtitle || (model.kind === "report" && model.linkedTicketId)) && (
              <p style={{ margin: "4px 0 0", fontSize: "var(--font-sm)", color: "var(--text-muted)", lineHeight: 1.4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {model.subtitle && <span>{model.subtitle}</span>}
                {model.kind === "report" && model.linkedTicketId && (
                  <>
                    {model.subtitle && <span style={{ color: "var(--text-tertiary)" }}>·</span>}
                    <span>linked to</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--brand)", background: "var(--brand-soft)", padding: "1px 6px", borderRadius: "var(--r-sm)" }}>
                      TKT-{model.linkedTicketNum ?? model.linkedTicketId?.slice(0, 8).toUpperCase()}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
          {model.onDownload && (
            <button onClick={model.onDownload} disabled={model.downloading} title="Download PDF" className="topbar-btn" style={{ flexShrink: 0, marginTop: 2 }}>
              {model.downloading ? <Loader2 size={13} style={{ animation: "spin 700ms linear infinite" }} /> : <Download size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* ── SCROLLING BODY ── */}
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, minWidth: 0 }}>

        {/* Cancelled callout banner */}
        {model.status === "cancelled" && (
          <div style={{ margin: "16px 28px 0", padding: "12px 16px", borderRadius: "var(--r-md)", background: "var(--surface-sunken)", border: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <X size={15} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>
                This ticket was cancelled
              </p>
              {model.cancellationReason && (
                <p style={{ margin: "4px 0 0", fontSize: "var(--font-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {model.cancellationReason}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Follow-up callout banner — only when status is follow_up */}
        {isFollowUp && (
          <div style={{ margin: "16px 28px 0", padding: "12px 16px", borderRadius: "var(--r-md)", background: "color-mix(in oklab, var(--warning) 8%, var(--surface))", border: "1px solid color-mix(in oklab, var(--warning) 30%, transparent)", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <RefreshCw size={15} style={{ color: "var(--warning-on)", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--warning-on)" }}>
                Follow-up visit requested{(model.followUpCount ?? 0) > 1 ? ` (${model.followUpCount} total)` : ""}
              </p>
              {model.followUpNotes && (
                <p style={{ margin: "4px 0 0", fontSize: "var(--font-sm)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {model.followUpNotes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Property strip */}
        <div style={{ padding: "16px 28px", background: "var(--surface-sunken)", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28, marginTop: isFollowUp ? 12 : 0 }}>
          <Prop label={`Assignee${(model.assignees?.length ?? 0) > 1 ? "s" : ""}`}>
            <AssigneeCell assignees={model.assignees} assigneeName={model.assigneeName} />
          </Prop>
          <Prop label="Station">
            <div style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text)" }}>{model.stationName ?? model.stationId}</div>
            {model.stationName && <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", color: "var(--text-muted)", marginTop: 2 }}>{model.stationId}</div>}
          </Prop>
          <Prop label="Created">
            {model.createdAt ? (
              <>
                <div style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text)" }}>{fmtDate(model.createdAt)}</div>
                <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", marginTop: 2 }}>{fmtTime(model.createdAt)} · {fmtRelative(model.createdAt)}</div>
              </>
            ) : <span style={{ fontSize: "var(--font-base)", color: "var(--text-muted)" }}>—</span>}
          </Prop>
          <Prop label="Updated">
            {model.updatedAt ? (
              <>
                <div style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text)" }}>{fmtDate(model.updatedAt)}</div>
                <div style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", marginTop: 2 }}>{fmtTime(model.updatedAt)} · {fmtRelative(model.updatedAt)}</div>
              </>
            ) : <span style={{ fontSize: "var(--font-base)", color: "var(--text-muted)" }}>—</span>}
          </Prop>
        </div>

        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 32, minWidth: 0 }}>

          {model.description && (
            <Section title="Description">
              <Prose>{model.description}</Prose>
            </Section>
          )}

          <AnomalyMetrics data={model.anomalyData} zone={model.zone} />

          {(model.assigneesHistory?.length ?? 0) > 0 && (
            <Section title="Previously Assigned">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {model.assigneesHistory!.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--surface-sunken)", border: "1px solid var(--border)" }}>
                    <span style={{ opacity: 0.55, display: "flex", flexShrink: 0 }}>
                      <Avatar name={a.name} size={22} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-base)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                    <Badge tone="danger">Removed</Badge>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {hasFindings && (
            <Section title={round > 1 ? `Inspection Findings · Round ${round}` : "Inspection Findings"}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {/* Status row — issue resolved + severity badges */}
                {hasReport && (r?.issueResolved != null || r?.severity) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 14, marginBottom: 4, borderBottom: "1px solid var(--divider)" }}>
                    {r?.issueResolved != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--font-sm)", fontFamily: "var(--font-mono)", fontWeight: 600, color: r.issueResolved ? "var(--success)" : "var(--danger)" }}>
                        {r.issueResolved ? <CheckCircle2 size={13} strokeWidth={2.5} /> : <WifiOff size={13} />}
                        Issue {r.issueResolved ? "Resolved" : "Unresolved"}
                      </span>
                    )}
                    {r?.severity && <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity} severity</Badge>}
                  </div>
                )}

                {/* Finding rows — each is a self-contained block with label + content */}
                {r?.notes && (
                  <div style={{ padding: "14px 0", borderBottom: "1px solid var(--divider)" }}>
                    <SubHeading>Field Observations</SubHeading>
                    <div style={{ paddingLeft: 14 }}><Prose>{r.notes}</Prose></div>
                  </div>
                )}
                {r?.rootCause && (
                  <div style={{ padding: "14px 0", borderBottom: "1px solid var(--divider)" }}>
                    <SubHeading>Root Cause</SubHeading>
                    <div style={{ paddingLeft: 14 }}><Prose>{r.rootCause}</Prose></div>
                  </div>
                )}
                {r?.correctiveAction && (
                  <div style={{ padding: "14px 0", borderBottom: approved ? "1px solid var(--divider)" : "none" }}>
                    <SubHeading>Corrective Action &amp; Recommendations</SubHeading>
                    <div style={{ paddingLeft: 14 }}><Prose>{r.correctiveAction}</Prose></div>
                  </div>
                )}

                {/* Approval callout — always last */}
                {approved && (
                  <div style={{ marginTop: 10, padding: "14px 16px", borderRadius: "var(--r-md)", background: "color-mix(in oklab, var(--success) 6%, var(--surface-sunken))", border: "1px solid color-mix(in oklab, var(--success) 20%, transparent)", borderLeft: "3px solid var(--success)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-sm)", color: "var(--success)", fontWeight: 700, marginBottom: r?.analystNotes ? 8 : 0 }}>
                      <CheckCircle2 size={14} strokeWidth={2.5} />
                      Approved{r?.analystApprovedAt ? ` · ${fmtDate(r.analystApprovedAt)}` : ""}
                    </div>
                    {r?.analystNotes
                      ? <p style={{ margin: 0, fontSize: "var(--font-base)", color: "var(--text)", lineHeight: 1.65 }}>{r.analystNotes}</p>
                      : <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>No remarks added.</p>}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Previous Rounds — full history, oldest-first, subordinate to the
              current findings above. Each round collapses to a quiet summary. */}
          {(model.priorRounds?.length ?? 0) > 0 && (
            <Section title="Previous Rounds" badge={String(model.priorRounds!.length)}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {model.priorRounds!.map((pr) => (
                  <PriorRoundCard key={pr.id} round={pr} onOpenPhoto={setLightbox} />
                ))}
              </div>
            </Section>
          )}

          {(photos.length > 0 || attachments.length > 0) && (
            <Section title="Attachments" badge={String(photos.length + attachments.length)}>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {photos.length > 0 && (
                  <>
                    {attachments.length > 0 && (
                      <p style={{ margin: "0 0 10px", fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text-secondary)" }}>Inspection Photos</p>
                    )}
                    <PhotoGrid photos={photos} onOpen={setLightbox} />
                  </>
                )}
                {attachments.length > 0 && (
                  <div style={{ marginTop: photos.length > 0 ? 16 : 0 }}>
                    {photos.length > 0 && (
                      <p style={{ margin: "0 0 10px", fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text-secondary)" }}>Data Files</p>
                    )}
                    <AttachmentList items={attachments} />
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="Activity">
            <ActivityTimeline model={model} />
          </Section>
        </div>
      </div>

      {footer}
      {children}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

export { ArrowRight as MoveArrow };
