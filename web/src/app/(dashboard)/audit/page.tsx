"use client";

import { useEffect, useState } from "react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  LogOut,
  Play,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Ticket,
  Upload,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { AuditRowSkeleton } from "@/components/ui/Skeleton";
import { auditApi } from "@/lib/api/audit";
import type { AuditLogEntry, AuditFilters } from "@/lib/api/audit";

// ─── Event meta ───────────────────────────────────────────────────────────────

type Tone = "success" | "danger" | "warning" | "info" | "accent" | "neutral";
type EventMeta = { tone: Tone; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };

const EVENT_META: Record<string, EventMeta> = {
  login_success:          { tone: "success", label: "Signed in",           icon: CheckCircle2 },
  mobile_login_success:   { tone: "success", label: "Signed in (mobile)",  icon: CheckCircle2 },
  logout:                 { tone: "neutral", label: "Signed out",          icon: LogOut },
  mobile_logout:          { tone: "neutral", label: "Signed out (mobile)", icon: LogOut },
  session_refresh:        { tone: "info",    label: "Session refreshed",   icon: RefreshCw },
  login_failed:           { tone: "warning", label: "Failed sign-in",      icon: AlertTriangle },
  mobile_login_failed:    { tone: "warning", label: "Failed sign-in (mobile)", icon: AlertTriangle },
  login_locked:           { tone: "warning", label: "Account locked",      icon: ShieldAlert },
  session_hijack_attempt: { tone: "warning", label: "Security notice",     icon: ShieldAlert },
  csrf_rejected:          { tone: "warning", label: "Blocked request",     icon: Zap },
  rate_limit_hit:         { tone: "warning", label: "Too many requests",   icon: Zap },
  account_created:        { tone: "info",    label: "Account created",     icon: UserPlus },
  account_disabled:       { tone: "warning", label: "Account disabled",    icon: AlertTriangle },
  account_enabled:        { tone: "success", label: "Account enabled",     icon: CheckCircle2 },
  ticket_created:         { tone: "info",    label: "Ticket opened",       icon: Ticket },
  ticket_updated:         { tone: "neutral", label: "Ticket updated",      icon: RefreshCw },
  ticket_status_changed:  { tone: "info",    label: "Status updated",      icon: Zap },
  report_submitted:       { tone: "info",    label: "Report submitted",    icon: CheckCircle2 },
  report_approved:        { tone: "success", label: "Report approved",     icon: CheckCircle2 },
  file_uploaded:          { tone: "neutral", label: "File uploaded",       icon: Upload },
  photo_uploaded:         { tone: "neutral", label: "Photo added",         icon: Upload },
  zone_pipeline_run:      { tone: "accent",  label: "Process run",        icon: Play },
  processing_run_saved:   { tone: "accent",  label: "Run saved",          icon: Database },
  processing_review_saved: { tone: "info",   label: "Reading reviewed",   icon: CheckCircle2 },
  system_startup:         { tone: "neutral", label: "System start",        icon: Database },
};

function getEventMeta(event: string): EventMeta {
  return EVENT_META[event] ?? { tone: "neutral", label: event.replace(/_/g, " "), icon: Shield };
}

// ─── Tone → CSS vars ──────────────────────────────────────────────────────────

function toneBg(tone: Tone): string {
  return tone === "success" ? "color-mix(in oklab, var(--success) 12%, transparent)" :
         tone === "danger"  ? "var(--danger-soft)" :
         tone === "warning" ? "color-mix(in oklab, var(--warning) 12%, transparent)" :
         tone === "info"    ? "color-mix(in oklab, var(--info) 12%, transparent)" :
         tone === "accent"  ? "color-mix(in oklab, var(--accent) 12%, transparent)" :
         "var(--surface-sunken)";
}

function toneColor(tone: Tone): string {
  return tone === "success" ? "var(--success)" :
         tone === "danger"  ? "var(--danger)" :
         tone === "warning" ? "var(--warning)" :
         tone === "info"    ? "var(--info)" :
         tone === "accent"  ? "var(--accent)" :
         "var(--text-muted)";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

// ─── Expanded detail — simple, non-technical ─────────────────────────────────

function prettyStatus(value: string): string {
  const map: Record<string, string> = {
    assigned: "Assigned",
    "in-progress": "In progress",
    in_progress: "In progress",
    pending_review: "Pending review",
    verified: "Verified",
    follow_up: "Follow-up",
    cancelled: "Cancelled",
  };
  return map[value] ?? value.replace(/_/g, " ");
}

function AuditDetail({ entry }: { entry: AuditLogEntry }) {
  const when = new Date(entry.created_at).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  let statusChange: string | null = null;
  if (entry.event === "ticket_status_changed" && entry.changes) {
    const oldS = (entry.changes.old as Record<string, unknown> | null)?.status;
    const newS = (entry.changes.new as Record<string, unknown> | null)?.status;
    if (oldS || newS) {
      statusChange = `${oldS ? prettyStatus(String(oldS)) : "—"} → ${newS ? prettyStatus(String(newS)) : "—"}`;
    }
  }

  return (
    <div
      style={{
        background: "var(--surface-alt)",
        borderTop: "1px solid var(--border)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
        <div>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 4px" }}>Who</p>
          <p style={{ fontSize: "var(--font-sm)", color: "var(--text)", margin: 0, lineHeight: 1.5 }}>
            {entry.actor_name ?? entry.credential ?? "Unknown"}
            {entry.actor_role ? <span style={{ color: "var(--text-muted)" }}> · {entry.actor_role}</span> : null}
          </p>
          {entry.actor_email && <p style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", margin: "2px 0 0" }}>{entry.actor_email}</p>}
        </div>
        <div>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 4px" }}>When</p>
          <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>{when}</p>
        </div>
      </div>

      {statusChange && (
        <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 4px" }}>What changed</p>
          <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>{statusChange}</p>
        </div>
      )}

      {entry.error_message && (
        <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 4px" }}>Note</p>
          <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>{entry.error_message}</p>
        </div>
      )}
    </div>
  );
}

// ─── Audit row ────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const meta = getEventMeta(entry.event);
  const { date, time } = formatTs(entry.created_at);
  const Icon = meta.icon;

  return (
    <div style={{ borderBottom: "1px solid var(--divider)" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "24px 1fr 160px 20px",
          alignItems: "center",
          gap: 14,
          padding: "11px 20px",
          textAlign: "left",
          border: 0,
          background: expanded ? "var(--surface-alt)" : hovered ? "var(--surface-sunken)" : "transparent",
          cursor: "pointer",
          transition: "background 0.1s ease",
          fontFamily: "inherit",
        }}
      >
        {/* Icon chip */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "var(--r-sm)",
            background: toneBg(meta.tone),
            color: toneColor(meta.tone),
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={11} strokeWidth={2.2} />
        </div>

        {/* Event + actor */}
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Badge tone={meta.tone as Parameters<typeof Badge>[0]["tone"]}>{meta.label}</Badge>
          {entry.actor_name && (
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.actor_name}
            </span>
          )}
          {entry.actor_role && (
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, padding: "2px 6px", borderRadius: "4px", background: "var(--surface-sunken)", color: "var(--text-muted)", textTransform: "uppercase" }}>
              {entry.actor_role}
            </span>
          )}
          {!entry.actor_name && entry.credential && (
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.credential}
            </span>
          )}
        </div>

        {/* Timestamp */}
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-ui)", color: "var(--text)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
            {time}
          </p>
          <p style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-ui)", color: "var(--text-muted)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
            {date}
          </p>
        </div>

        {/* Chevron */}
        <ChevronRight
          size={14}
          strokeWidth={2}
          style={{
            color: "var(--text-tertiary)",
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        />
      </button>

      {expanded && <AuditDetail entry={entry} />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const EVENT_OPTIONS = [
  "login_success", "login_failed", "login_locked",
  "logout", "account_created",
  "ticket_created", "ticket_updated", "ticket_status_changed",
  "report_submitted", "report_approved", "file_uploaded",
  "processing_run_saved", "processing_review_saved",
];

export default function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");

  const { entries, total, isLoading: loading, error: fetchError, refresh } = useAuditLogs(filters, PAGE_SIZE, offset);
  const error = fetchError?.message ?? null;

  function applyFilters(event: string, outcome: string, search: string) {
    const f: AuditFilters = {};
    if (event) f.event = event;
    if (search.trim()) f.search = search.trim();
    if (outcome === "true") f.success = true;
    if (outcome === "false") f.success = false;
    setFilters(f);
    setOffset(0);
  }

  function handleEventChange(val: string) {
    setEventFilter(val);
  }

  function handleOutcomeChange(val: string) {
    setOutcomeFilter(val);
  }

  useEffect(() => {
    const timer = setTimeout(() => applyFilters(eventFilter, outcomeFilter, query), 300);
    return () => clearTimeout(timer);
  }, [query, eventFilter, outcomeFilter]);

  function handleReset() {
    setQuery("");
    setEventFilter("");
    setOutcomeFilter("");
    setFilters({});
    setOffset(0);
  }

  function handleExport() {
    const url = auditApi.exportUrl(filters);
    const a = document.createElement("a");
    a.href = url;
    a.click();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasFilters = !!(eventFilter || outcomeFilter || query);



  return (
    <div className="dashboard-page">
      <Header
        title="Activity History"
        actions={
          <Button size="sm" variant="secondary" onClick={handleExport}>
            <Download size={13} strokeWidth={2.2} />
            Export
          </Button>
        }
      />

      <div className="dashboard-content" style={{ display: "flex", flexDirection: "column", gap: "var(--gap-card)" }}>

        {/* Activity card */}
        <div
          style={{
            flexShrink: 0,
            background: "var(--surface)",
            borderRadius: "var(--r-xl)",
            boxShadow: "var(--shadow-xs)",
            overflow: "hidden",
          }}
        >
          {/* Card header with inline filters */}
          <div
            style={{
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Activity</h3>
              <span
                style={{
                  height: 20,
                  padding: "0 6px",
                  borderRadius: "var(--r-full)",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border)",
                  fontSize: "var(--font-xs)",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  display: "inline-grid",
                  placeItems: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {total.toLocaleString()}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Search */}
              <div data-search-field style={{ width: "180px", maxWidth: "100%" }}>
                <Search size={16} aria-hidden="true" />
                <input aria-label="Search audit log"
                  type="text"
                  placeholder="Search name, email or IP…"
                  maxLength={200}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <Select
                value={eventFilter}
                onChange={handleEventChange}
                width={160}
                ariaLabel="Filter by activity"
                options={[{ value: "", label: "All activity" }, ...EVENT_OPTIONS.map((ev) => ({ value: ev, label: getEventMeta(ev).label }))]}
              />
              <Select
                value={outcomeFilter}
                onChange={handleOutcomeChange}
                width={130}
                ariaLabel="Filter by result"
                options={[
                  { value: "", label: "All results" },
                  { value: "true", label: "Successful" },
                  { value: "false", label: "Needs attention" },
                ]}
              />

              {/* Reset */}
              {hasFilters && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="export-btn"
                  style={{ height: 30, color: "var(--danger)", border: "1px solid rgba(220,38,38,0.25)", fontWeight: 600, gap: 4 }}
                >
                  <X size={11} strokeWidth={2.4} />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Column header */}
          <div className="table-heading"
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr 160px 20px",
              alignItems: "center",
              gap: 14,
              padding: "8px 20px",
            }}
          >
            {["", "Activity", "When", ""].map((col, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  textAlign: i === 2 ? "right" : "left",
                }}
              >
                {col}
              </p>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <AuditRowSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div style={{ padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={20} style={{ color: "var(--danger)" }} strokeWidth={2} />
              <p style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", margin: 0 }}>Failed to load</p>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>{error}</p>
              <Button size="sm" variant="secondary" onClick={() => refresh()} style={{ marginTop: 8 }}>
                Retry
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <div style={{ padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Shield size={24} style={{ color: "var(--text-muted)", opacity: 0.4 }} strokeWidth={1.5} />
              <p style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", margin: 0 }}>No events found</p>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>
                {hasFilters ? "Try adjusting your filters." : "The audit log will populate as the system is used."}
              </p>
            </div>
          ) : (
            entries.map((entry) => <AuditRow key={entry.id} entry={entry} />)
          )}

          {/* Pagination + footer */}
          <div
            style={{
              padding: "10px 20px",
              borderTop: "1px solid var(--divider)",
              background: "var(--surface-alt)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
              <Shield size={11} strokeWidth={2} />
              Activity is recorded automatically to keep a clear history of changes.
            </div>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-ui)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  Page {currentPage} of {totalPages}
                </span>
                {(["Prev", "Next"] as const).map((label) => {
                  const disabled = label === "Prev" ? offset === 0 : offset + PAGE_SIZE >= total;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={disabled}
                      onClick={() => setOffset(label === "Prev" ? Math.max(0, offset - PAGE_SIZE) : offset + PAGE_SIZE)}
                      className="export-btn"
                      style={{ height: 26, fontWeight: 600, opacity: disabled ? 0.4 : 1 }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
