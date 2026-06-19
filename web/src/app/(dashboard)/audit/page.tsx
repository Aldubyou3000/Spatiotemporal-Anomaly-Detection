"use client";

import { useState } from "react";
import { useAuditLogs, useAuditStats } from "@/hooks/useAuditLogs";
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
import { auditApi } from "@/lib/api/audit";
import type { AuditLogEntry, AuditFilters, AuditStatEntry } from "@/lib/api/audit";

// ─── Event meta ───────────────────────────────────────────────────────────────

type Tone = "success" | "danger" | "warning" | "info" | "accent" | "neutral";
type EventMeta = { tone: Tone; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };

const EVENT_META: Record<string, EventMeta> = {
  login_success:          { tone: "success", label: "Login",            icon: CheckCircle2 },
  mobile_login_success:   { tone: "success", label: "Mobile Login",     icon: CheckCircle2 },
  logout:                 { tone: "neutral", label: "Logout",           icon: LogOut },
  mobile_logout:          { tone: "neutral", label: "Mobile Logout",    icon: LogOut },
  session_refresh:        { tone: "info",    label: "Token Refresh",    icon: RefreshCw },
  login_failed:           { tone: "danger",  label: "Login Failed",     icon: AlertTriangle },
  mobile_login_failed:    { tone: "danger",  label: "Mobile Failed",    icon: AlertTriangle },
  login_locked:           { tone: "danger",  label: "Account Locked",   icon: ShieldAlert },
  session_hijack_attempt: { tone: "danger",  label: "Hijack Attempt",   icon: ShieldAlert },
  csrf_rejected:          { tone: "danger",  label: "CSRF Rejected",    icon: Zap },
  rate_limit_hit:         { tone: "warning", label: "Rate Limited",     icon: Zap },
  account_created:        { tone: "info",    label: "Account Created",  icon: UserPlus },
  account_disabled:       { tone: "warning", label: "Disabled",         icon: AlertTriangle },
  account_enabled:        { tone: "success", label: "Enabled",          icon: CheckCircle2 },
  ticket_created:         { tone: "info",    label: "Ticket Created",   icon: Ticket },
  ticket_updated:         { tone: "neutral", label: "Ticket Updated",   icon: RefreshCw },
  ticket_status_changed:  { tone: "info",    label: "Status Changed",   icon: Zap },
  report_submitted:       { tone: "info",    label: "Report Submitted", icon: CheckCircle2 },
  report_approved:        { tone: "success", label: "Report Approved",  icon: CheckCircle2 },
  file_uploaded:          { tone: "neutral", label: "File Uploaded",    icon: Upload },
  photo_uploaded:         { tone: "neutral", label: "Photo Uploaded",   icon: Upload },
  zone_pipeline_run:      { tone: "accent",  label: "Pipeline Run",     icon: Play },
  system_startup:         { tone: "neutral", label: "System Start",     icon: Database },
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

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ stat }: { stat: AuditStatEntry }) {
  const meta = getEventMeta(stat.event);
  const Icon = meta.icon;
  const failRate = stat.total > 0 ? ((stat.failures / stat.total) * 100).toFixed(0) : "0";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "14px 16px",
        boxShadow: "var(--shadow-xs)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", margin: 0 }}>
          {meta.label}
        </p>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "var(--r-sm)",
            background: toneBg(meta.tone),
            color: toneColor(meta.tone),
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon size={11} strokeWidth={2.2} />
        </div>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text)", margin: 0, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {stat.total.toLocaleString()}
      </p>
      {stat.failures > 0 && (
        <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--danger)", margin: 0 }}>
          {failRate}% fail rate
        </p>
      )}
    </div>
  );
}

// ─── Expanded detail ──────────────────────────────────────────────────────────

function AuditDetail({ entry }: { entry: AuditLogEntry }) {
  const fields: { label: string; value: string | null | undefined; mono?: boolean; accent?: string }[] = [
    { label: "Actor ID",   value: entry.user_id,     mono: true,  accent: "var(--brand)" },
    { label: "Trace ID",   value: entry.request_id,  mono: true,  accent: "var(--info)" },
    { label: "IP Address", value: entry.ip,           mono: true,  accent: "var(--warning)" },
    { label: "Entity",     value: entry.entity_type ? `${entry.entity_type}${entry.entity_id ? ` / ${entry.entity_id.slice(0, 12)}` : ""}` : null, accent: "var(--text-muted)" },
    { label: "Actor Name", value: entry.actor_name,  accent: "var(--success)" },
    { label: "Email",      value: entry.actor_email, mono: true,  accent: "var(--success)" },
  ].filter((f) => f.value);

  return (
    <div
      style={{
        background: "var(--surface-alt)",
        borderTop: "1px solid var(--border)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Fields grid */}
      {fields.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 16px" }}>
          {fields.map(({ label, value, mono, accent }) => (
            <div
              key={label}
              style={{
                borderLeft: `2px solid color-mix(in oklab, ${accent} 40%, transparent)`,
                paddingLeft: 10,
              }}
            >
              <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 2px" }}>
                {label}
              </p>
              <p style={{ fontSize: "var(--font-xs)", fontFamily: mono ? "var(--font-mono)" : undefined, color: "var(--text-secondary)", margin: 0, wordBreak: "break-all" }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* User agent */}
      {entry.user_agent && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 4px" }}>
            User Agent
          </p>
          <p style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)", margin: 0, wordBreak: "break-all" }}>
            {entry.user_agent}
          </p>
        </div>
      )}

      {/* Changes */}
      {entry.changes && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 8px" }}>
            Changes (Before / After)
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "color-mix(in oklab, var(--danger) 5%, transparent)", border: "1px solid color-mix(in oklab, var(--danger) 20%, transparent)", borderRadius: "var(--r-md)", padding: "8px 10px" }}>
              <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--danger)", opacity: 0.7, margin: "0 0 4px" }}>Before</p>
              <pre style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {JSON.stringify(entry.changes.old, null, 2)}
              </pre>
            </div>
            <div style={{ background: "color-mix(in oklab, var(--success) 5%, transparent)", border: "1px solid color-mix(in oklab, var(--success) 20%, transparent)", borderRadius: "var(--r-md)", padding: "8px 10px" }}>
              <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--success)", opacity: 0.7, margin: "0 0 4px" }}>After</p>
              <pre style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {JSON.stringify(entry.changes.new, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {entry.error_message && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--danger)", margin: "0 0 4px" }}>
            Error Message
          </p>
          <p style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--danger)", margin: 0 }}>
            {entry.error_message}
          </p>
        </div>
      )}

      {/* Metadata */}
      {entry.meta && Object.keys(entry.meta).length > 0 && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 4px" }}>
            Metadata
          </p>
          <pre style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", margin: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "6px 8px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {JSON.stringify(entry.meta, null, 2)}
          </pre>
        </div>
      )}

      {/* Chain hash */}
      {entry.chain_hash && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", margin: "0 0 4px" }}>
            Chain Hash (SHA-256)
          </p>
          <p style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)", margin: 0, wordBreak: "break-all" }}>
            {entry.chain_hash}
          </p>
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
          gridTemplateColumns: "24px 1fr 140px 160px 20px",
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
          {!entry.actor_name && entry.credential && (
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.credential}
            </span>
          )}
          {entry.entity_type && (
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              {entry.entity_type}
              {entry.entity_id ? `/${entry.entity_id.slice(0, 8)}` : ""}
            </span>
          )}
        </div>

        {/* IP */}
        <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {entry.ip ?? "—"}
        </span>

        {/* Timestamp */}
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
            {time}
          </p>
          <p style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
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
  "login_success", "login_failed", "login_locked", "session_hijack_attempt",
  "logout", "session_refresh", "account_created", "account_disabled", "account_enabled",
  "ticket_created", "ticket_updated", "ticket_status_changed",
  "report_submitted", "report_approved", "file_uploaded", "zone_pipeline_run",
  "csrf_rejected", "rate_limit_hit", "system_startup",
];

export default function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");

  const { entries, total, isLoading: loading, error: fetchError, refresh } = useAuditLogs(filters, PAGE_SIZE, offset);
  const { stats, isLoading: statsLoading } = useAuditStats();
  const error = fetchError?.message ?? null;

  function applyFilters(event: string, outcome: string, ip: string) {
    const f: AuditFilters = {};
    if (event) f.event = event;
    if (ip) f.ip = ip;
    if (outcome === "true") f.success = true;
    if (outcome === "false") f.success = false;
    setFilters(f);
    setOffset(0);
  }

  function handleEventChange(val: string) {
    setEventFilter(val);
    applyFilters(val, outcomeFilter, query);
  }

  function handleOutcomeChange(val: string) {
    setOutcomeFilter(val);
    applyFilters(eventFilter, val, query);
  }

  function handleQueryBlur() {
    applyFilters(eventFilter, outcomeFilter, query);
  }

  function handleQueryKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") applyFilters(eventFilter, outcomeFilter, query);
  }

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
  const criticalCount = entries.filter(
    (e) => !e.success || ["login_locked", "session_hijack_attempt", "csrf_rejected"].includes(e.event)
  ).length;
  const hasFilters = !!(eventFilter || outcomeFilter || query);

  const selectStyle: React.CSSProperties = {
    height: 30,
    padding: "0 8px",
    borderRadius: "var(--r-md)",
    border: "1px solid var(--border)",
    background: "var(--surface-alt)",
    color: "var(--text)",
    fontSize: "var(--font-sm)",
    fontFamily: "inherit",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <Header
        title="Audit Log"
        description={`${total.toLocaleString()} events recorded · append-only, SHA-256 chain-hashed`}
        live
        actions={
          <Button size="sm" variant="secondary" onClick={handleExport}>
            <Download size={13} strokeWidth={2.2} />
            Export
          </Button>
        }
      />

      <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Stat cards */}
        {!statsLoading && stats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            {stats.map((s) => <StatCard key={s.event} stat={s} />)}
          </div>
        )}

        {/* Critical alert */}
        {criticalCount > 0 && !loading && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              background: "var(--danger-soft)",
              border: "1px solid rgba(220,38,38,0.25)",
              borderRadius: "var(--r-md)",
            }}
          >
            <ShieldAlert size={15} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} strokeWidth={2.2} />
            <p style={{ fontSize: "var(--font-sm)", color: "var(--danger)", margin: 0, lineHeight: 1.5 }}>
              <strong>{criticalCount} CRITICAL</strong> — account lockouts, hijack attempts, or CSRF rejections detected on this page.
            </p>
          </div>
        )}

        {/* Activity card */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            boxShadow: "var(--shadow-xs)",
            overflow: "hidden",
          }}
        >
          {/* Card header with inline filters */}
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Activity stream</h3>
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
              {/* IP search */}
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={12} style={{ position: "absolute", left: 8, color: "var(--text-muted)", pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder="Search IP…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={handleQueryBlur}
                  onKeyDown={handleQueryKeyDown}
                  style={{
                    height: 30,
                    paddingLeft: 26,
                    paddingRight: 8,
                    width: 140,
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-alt)",
                    color: "var(--text)",
                    fontSize: "var(--font-sm)",
                    fontFamily: "var(--font-mono)",
                    outline: "none",
                    transition: "border-color 0.12s ease",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                />
              </div>

              {/* Event dropdown */}
              <select value={eventFilter} onChange={(e) => handleEventChange(e.target.value)} style={{ ...selectStyle, width: 160 }}>
                <option value="">All events</option>
                {EVENT_OPTIONS.map((ev) => (
                  <option key={ev} value={ev}>{getEventMeta(ev).label}</option>
                ))}
              </select>

              {/* Outcome dropdown */}
              <select value={outcomeFilter} onChange={(e) => handleOutcomeChange(e.target.value)} style={{ ...selectStyle, width: 130 }}>
                <option value="">All outcomes</option>
                <option value="true">Success only</option>
                <option value="false">Failures only</option>
              </select>

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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr 140px 160px 20px",
              alignItems: "center",
              gap: 14,
              padding: "8px 20px",
              background: "var(--surface-alt)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {["", "Event · Actor", "IP Address", "Timestamp", ""].map((col, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  fontSize: "var(--font-xs)",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  textAlign: i === 3 ? "right" : "left",
                }}
              >
                {col}
              </p>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--brand)", animation: "spin 700ms linear infinite" }} />
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", margin: 0 }}>Fetching audit records…</p>
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
              All entries are append-only and chain-hashed with SHA-256 for tamper detection.
            </div>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
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
