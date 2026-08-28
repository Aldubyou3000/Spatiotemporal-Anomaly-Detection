"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Database, AlertTriangle, Gauge, HelpCircle, MapPin, CheckCircle2, XCircle, ChevronDown, ChevronUp, Layers, Flag } from "lucide-react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/Badge";
import type { ProcessResult, StationHealth, StationStuckHealth } from "@/types/zones";

const StationMap = dynamic(() => import("./StationMap").then((m) => m.StationMap), {
  ssr: false,
  loading: () => (
    <div style={{ height: 360, borderRadius: "var(--r-lg)", background: "var(--surface-sunken)", border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>
      <p style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Loading map…</p>
    </div>
  ),
});

// ─── Info Tooltip ─────────────────────────────────────────────────────────────
// Portalled + viewport-clamped so it never clips inside cards with overflow:hidden
// (Sensor Reliability, Data Quality) or near the viewport edge (right-aligned help icons).
function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  const tip = (() => {
    if (!pos || typeof document === "undefined" || typeof window === "undefined") return null;
    const W = 230;
    const half = W / 2;
    const margin = 10;
    // Clamp horizontal so 230px tooltip never spills off-screen; keeps right-edge
    // help icons (Sensor Reliability > Key > ?) fully readable.
    const minLeft = margin + half;
    const maxLeft = window.innerWidth - margin - half;
    const left = Math.max(minLeft, Math.min(pos.x, maxLeft));
    // Flip below the icon when there is no room above (e.g. sticky header)
    const estH = 76;
    const showBelow = pos.y < estH + 12;
    const top = showBelow ? pos.y + pos.h + 8 : pos.y - 8;
    const transform = showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)";
    return createPortal(
      <span
        style={{
          position: "fixed",
          left,
          top,
          transform,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "8px 12px",
          fontSize: "var(--font-xs)",
          fontWeight: 400,
          color: "var(--text)",
          lineHeight: 1.6,
          whiteSpace: "normal",
          width: W,
          maxWidth: `calc(100vw - ${margin * 2}px)`,
          boxShadow: "var(--shadow-lg)",
          zIndex: 9999,
          pointerEvents: "none",
          letterSpacing: "0.01em",
        }}
      >
        {text}
      </span>,
      document.body,
    );
  })();
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      <HelpCircle size={12} strokeWidth={2} style={{ color: "var(--text-tertiary)", cursor: "help", flexShrink: 0 }} />
      {tip}
    </span>
  );
}

// Generic inline tip — any element (badge, dot+label) becomes the hover target.
function InlineTip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  const portal = (() => {
    if (!pos || typeof document === "undefined" || typeof window === "undefined") return null;
    const W = 230;
    const half = W / 2;
    const margin = 10;
    const minLeft = margin + half;
    const maxLeft = window.innerWidth - margin - half;
    const left = Math.max(minLeft, Math.min(pos.x, maxLeft));
    const estH = 56;
    const showBelow = pos.y < estH + 12;
    const top = showBelow ? pos.y + pos.h + 8 : pos.y - 8;
    const transform = showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)";
    return createPortal(
      <span
        style={{
          position: "fixed",
          left,
          top,
          transform,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "8px 12px",
          fontSize: "var(--font-xs)",
          fontWeight: 400,
          color: "var(--text)",
          lineHeight: 1.6,
          whiteSpace: "normal",
          width: W,
          maxWidth: `calc(100vw - ${margin * 2}px)`,
          boxShadow: "var(--shadow-lg)",
          zIndex: 9999,
          pointerEvents: "none",
          letterSpacing: "0.01em",
        }}
      >
        {tip}
      </span>,
      document.body,
    );
  })();
  return (
    <span style={{ display: "inline-flex" }} onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)}>
      {children}
      {portal}
    </span>
  );
}

// Badge with portalled tooltip — the badge itself is the hover target (no separate ? icon).
function KeyBadge({
  tone,
  dot,
  tip,
  children,
}: {
  tone: "danger" | "warning" | "success" | "neutral";
  dot?: boolean;
  tip: string;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  const portal = (() => {
    if (!pos || typeof document === "undefined" || typeof window === "undefined") return null;
    const W = 230;
    const half = W / 2;
    const margin = 10;
    const minLeft = margin + half;
    const maxLeft = window.innerWidth - margin - half;
    const left = Math.max(minLeft, Math.min(pos.x, maxLeft));
    const estH = 56;
    const showBelow = pos.y < estH + 12;
    const top = showBelow ? pos.y + pos.h + 8 : pos.y - 8;
    const transform = showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)";
    return createPortal(
      <span
        style={{
          position: "fixed",
          left,
          top,
          transform,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "8px 12px",
          fontSize: "var(--font-xs)",
          fontWeight: 400,
          color: "var(--text)",
          lineHeight: 1.6,
          whiteSpace: "normal",
          width: W,
          maxWidth: `calc(100vw - ${margin * 2}px)`,
          boxShadow: "var(--shadow-lg)",
          zIndex: 9999,
          pointerEvents: "none",
          letterSpacing: "0.01em",
        }}
      >
        {tip}
      </span>,
      document.body,
    );
  })();
  return (
    <span style={{ display: "inline-flex" }} onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)}>
      <Badge tone={tone} dot={dot} style={{ fontSize: 11, padding: "0 7px", height: 19, cursor: "help" }}>
        {children}
      </Badge>
      {portal}
    </span>
  );
}

// ─── Quality Report Card — collapsed by default ───────────────────────────
import type { QualityReport } from "@/types/zones";

interface IssueRowProps {
  label: string;
  value: number;
  unit: "rows" | "stations";
  desc: string;
  tip: string;
}

function QualityReportCard({
  quality_report: qr,
}: {
  quality_report: QualityReport;
}) {
  const [expanded, setExpanded] = useState(false);

  const hourlyTotal =
    qr.exclusion_details.multi_hour_gaps +
    qr.exclusion_details.hourly_starts_with_nan +
    qr.exclusion_details.hourly_ends_with_nan +
    qr.exclusion_details.hourly_duplicates;
  const dailyTotal =
    qr.exclusion_details.multi_day_gaps +
    qr.exclusion_details.starts_with_nan +
    qr.exclusion_details.ends_with_nan +
    qr.exclusion_details.duplicates;
  const stationTotal =
    qr.exclusion_details.insufficient_readings_stations +
    qr.exclusion_details.zero_valid_stations;

  const totalExclusions = hourlyTotal + dailyTotal + stationTotal;
  const allClean = totalExclusions === 0 && qr.stations_excluded === 0;

  const hasGaps = qr.exclusion_details.multi_hour_gaps > 0 || qr.exclusion_details.hourly_starts_with_nan > 0;
  const summaryText = allClean
    ? "All stations passed quality checks — nothing dropped."
    : [
        hourlyTotal > 0 ? `${hourlyTotal.toLocaleString()} hourly readings cleaned` : null,
        dailyTotal > 0 ? `${dailyTotal.toLocaleString()} daily rows dropped` : null,
        stationTotal > 0 || qr.stations_excluded > 0 ? `${qr.stations_excluded || stationTotal} station${(qr.stations_excluded || stationTotal) === 1 ? "" : "s"} excluded` : null,
        qr.rows_filled > 0 ? `${qr.rows_filled.toLocaleString()} single-hour gaps filled` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Minor cleaning applied.";

  const issuesForExpand: { section: string; rows: IssueRowProps[] }[] = [
    {
      section: "Hourly",
      rows: [
        { label: "Missing 2+ hours", value: qr.exclusion_details.multi_hour_gaps, unit: "rows", desc: "Not used for daily total — gap too long", tip: "Readings during 2+ consecutive missing hours can't make a reliable daily total. Single missing hours are filled automatically." },
        { label: "Missing at start", value: qr.exclusion_details.hourly_starts_with_nan, unit: "rows", desc: "Missing at beginning — not totaled", tip: "Leading missing hourly readings can't be totaled into a daily value." },
        { label: "Missing at end", value: qr.exclusion_details.hourly_ends_with_nan, unit: "rows", desc: "Missing at end — not totaled", tip: "Trailing missing hourly readings can't be totaled." },
        { label: "Duplicate hour", value: qr.exclusion_details.hourly_duplicates, unit: "rows", desc: "Same hour listed twice — kept first", tip: "Same station + hour appeared more than once; extras were dropped." },
      ],
    },
    {
      section: "Daily",
      rows: [
        { label: "Missing 2+ days", value: qr.exclusion_details.multi_day_gaps, unit: "rows", desc: "Not used — gap too long", tip: "Daily rows inside 2+ consecutive missing days are not used." },
        { label: "Missing at start", value: qr.exclusion_details.starts_with_nan, unit: "rows", desc: "Missing at beginning", tip: "Leading missing daily rows are not used." },
        { label: "Missing at end", value: qr.exclusion_details.ends_with_nan, unit: "rows", desc: "Missing at end", tip: "Trailing missing daily rows are not used." },
        { label: "Duplicate day", value: qr.exclusion_details.duplicates, unit: "rows", desc: "Same station + day twice — kept first", tip: "Extra entries for the same station on the same day were removed." },
      ],
    },
    {
      section: "Station",
      rows: [
        { label: "Less than 2 usable days", value: qr.exclusion_details.insufficient_readings_stations, unit: "stations", desc: "Too few usable days — station not included", tip: "This station had fewer than 2 usable daily readings after cleaning." },
        { label: "No usable readings", value: qr.exclusion_details.zero_valid_stations, unit: "stations", desc: "No usable data — station not included", tip: "This station had zero usable readings." },
      ],
    },
  ];

  function IssueRow({ label, value, unit, desc, tip }: IssueRowProps) {
    const bad = value > 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ flexShrink: 0 }}>{bad ? <XCircle size={14} strokeWidth={2} style={{ color: "var(--danger)" }} /> : <CheckCircle2 size={14} strokeWidth={2} style={{ color: "var(--success)" }} />}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: bad ? "var(--text)" : "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
            {label}<InfoTip text={tip} />
          </div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 1 }}>{desc}</div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: bad ? "var(--danger)" : "var(--text-tertiary)", background: bad ? "var(--danger-soft)" : "transparent", padding: bad ? "1px 8px" : "0", borderRadius: "var(--r-sm)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {value.toLocaleString()}<span style={{ fontWeight: 500, opacity: 0.7, marginLeft: 4 }}>{unit}</span>
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: expanded ? "1px solid var(--border)" : "none" }}>
        <Database size={14} strokeWidth={2.2} style={{ color: allClean ? "var(--success)" : hasGaps ? "var(--warning)" : "var(--text-secondary)", flexShrink: 0 }} />
        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Data Quality</span>
        <InfoTip text="Whether your CSV passed checks before detection. Most runs are clean — expand for the few rows dropped or filled." />
        <span style={{ marginLeft: 8, fontSize: "var(--font-xs)", color: allClean ? "var(--success)" : "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {summaryText}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--text-secondary)", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-full)", padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}
        >
          {expanded ? <>Hide details <ChevronUp size={12} /></> : <>Details <ChevronDown size={12} /></>}
        </button>
      </div>
      {expanded && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          {issuesForExpand.map(({ section, rows }) => (
            <div key={section} style={{ padding: "12px 16px", borderRight: section !== "Station" ? "1px solid var(--border)" : undefined }}>
              <div style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>{section}</div>
              {rows.map((r) => <IssueRow key={r.label} {...r} />)}
            </div>
          ))}
        </div>
      )}
      {allClean && !expanded && (
        <div style={{ display: "none" }} />
      )}
    </div>
  );
}

// ── Unified Sensor Reliability — merges Station Health + Stuck at Zero ────
// Intensity is encoded once and reused: suspect=danger, watch=warning,
// consistent=success, need_more=neutral — same hues drive the card dots,
// the badges, and the map halo so the analyst learns one palette.

type UnifiedStatus = "suspect" | "watch" | "normal" | "insufficient_data";

function SensorReliabilityCard({
  station_health,
  station_stuck_health,
}: {
  station_health: StationHealth[];
  station_stuck_health: StationStuckHealth[];
}) {
  const [showHealthy, setShowHealthy] = useState(false);

  const merged = useMemo(() => {
    const byId = new Map<string, { high?: StationHealth; low?: StationStuckHealth; lat: number; lon: number }>();
    for (const h of station_health) {
      const cur = byId.get(h.station_id) ?? { lat: h.latitude, lon: h.longitude };
      cur.high = h;
      cur.lat = h.latitude; cur.lon = h.longitude;
      byId.set(h.station_id, cur);
    }
    for (const s of station_stuck_health) {
      const cur = byId.get(s.station_id) ?? { lat: s.latitude, lon: s.longitude };
      cur.low = s;
      cur.lat = s.latitude; cur.lon = s.longitude;
      byId.set(s.station_id, cur);
    }

    function overall(high?: StationHealth, low?: StationStuckHealth): UnifiedStatus {
      const hs = high?.status;
      const ls = low?.status;
      if (hs === "suspect" || ls === "suspect") return "suspect";
      if (hs === "watch" || ls === "watch") return "watch";
      if (hs === "insufficient_data" || ls === "insufficient_data") return "insufficient_data";
      return "normal";
    }

    const rows = Array.from(byId.entries()).map(([station_id, v]) => {
      const status = overall(v.high, v.low);
      const high = v.high;
      const low = v.low;
      // Simple, human wording. One headline + one short line. Extra numbers live in the
      // hover tooltip title so the card stays scannable but still complete on hover.
      let reason = "";
      let detail = "";
      let badgeLabel: string;
      let badgeTone: "danger" | "warning" | "success" | "neutral" = "neutral";
      let tip = "";
      if (status === "suspect" || status === "watch") {
        const highBad = high && (high.status === "suspect" || high.status === "watch");
        const lowBad = low && (low.status === "suspect" || low.status === "watch");
        if (highBad && lowBad) {
          const hp = high!.bias_ratio != null ? `about ${Math.round((high!.bias_ratio - 1) * 100)}% higher` : "reads high";
          const lp = low!.zero_rate != null ? `no reading ${Math.round(low!.zero_rate * 100)}% of the time` : `no-reading streak ${low!.max_zero_streak}`;
          reason = status === "suspect" ? "Needs attention — mixed signals" : "Monitor — mixed signals";
          detail = status === "suspect"
            ? `This sensor ${hp} yet also had ${lp}. Likely a sensor fault, not just weather.`
            : `This sensor ${hp} and had ${lp} when neighbors recorded rain. Worth a site check.`;
          badgeLabel = status === "suspect" ? "Needs attention" : "Monitor";
          badgeTone = status === "suspect" ? "danger" : "warning";
          tip = `On ${high!.rain_days} rainy days checked, this sensor averaged ${high!.bias_ratio?.toFixed(2) ?? "—"}× nearby stations and had ${lp}.`;
        } else if (highBad) {
          const pct = high!.bias_ratio != null ? Math.round((high!.bias_ratio - 1) * 100) : 0;
          if (high!.status === "suspect") {
            reason = "Needs attention — reads high";
            detail = `About ${pct}% higher than nearby stations on rainy days. Likely needs calibration.`;
            badgeLabel = "Needs attention";
            badgeTone = "danger";
          } else {
            reason = "Monitor — slightly high";
            detail = `A bit higher than neighbors. Keep an eye on it.`;
            badgeLabel = "Monitor";
            badgeTone = "warning";
          }
          tip = `Compared on ${high!.rain_days} rainy days. Usually a bit above its 3 neighbors.`;
        } else if (lowBad) {
          const pct = low!.zero_rate != null ? Math.round(low!.zero_rate * 100) : 0;
          const streak = low!.max_zero_streak ?? 0;
          const days = low!.rain_days ?? 0;
          if (low!.status === "suspect") {
            reason = "Needs attention — often no reading";
            detail = `No reading on about ${pct}% of rainy days when neighbors recorded rain. May be blocked or offline.`;
            badgeLabel = "Needs attention";
            badgeTone = "danger";
          } else {
            reason = "Monitor — sometimes no reading";
            detail = `No reading on some rainy days when neighbors recorded rain.`;
            badgeLabel = "Monitor";
            badgeTone = "warning";
          }
          tip = `On ${days} rainy days checked, no reading on ${pct}% of them. Longest run without reading: ${streak} days.`;
        } else {
          reason = "";
          detail = "";
          badgeLabel = "";
          tip = "";
        }
      } else if (status === "normal") {
        reason = "Reliable — no pattern found";
        detail = "Matches neighbors over time. Flagged days look like real local rain and still need review.";
        badgeLabel = "Reliable";
        badgeTone = "success";
        tip = `Checked on ${high?.rain_days ?? low?.rain_days ?? 0} rainy days — no repeated pattern found.`;
      } else {
        const days = (high?.rain_days ?? low?.rain_days ?? 0);
        reason = "Not enough rainy days yet";
        detail = `Only ${days} rainy days so far — need more rain to judge.`;
        badgeLabel = "Not enough data";
        badgeTone = "neutral";
        tip = `Only ${days} rainy days checked — not enough to judge.`;
      }
      return { station_id, lat: v.lat, lon: v.lon, high, low, status, reason, detail, badgeLabel, badgeTone, tip };
    });

    const order: Record<UnifiedStatus, number> = { suspect: 0, watch: 1, insufficient_data: 2, normal: 3 };
    rows.sort((a, b) => order[a.status] - order[b.status] || a.station_id.localeCompare(b.station_id));
    return rows;
  }, [station_health, station_stuck_health]);

  const needsReview = merged.filter((r) => r.status === "suspect" || r.status === "watch");
  const normalRows = merged.filter((r) => r.status === "normal");
  const insufficientRows = merged.filter((r) => r.status === "insufficient_data");
  const healthyCount = normalRows.length + insufficientRows.length;
  const visibleHealthy = showHealthy ? [...normalRows, ...insufficientRows] : [];

  const hasAny = merged.length > 0;

  function dotColor(s: UnifiedStatus): string {
    if (s === "suspect") return "var(--danger)";
    if (s === "watch") return "var(--warning)";
    if (s === "normal") return "var(--success)";
    return "var(--text-tertiary)";
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: needsReview.length > 0 ? "var(--warning-soft)" : "var(--success-soft)", border: `1px solid ${needsReview.length > 0 ? "var(--warning)" : "var(--success)"}`, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Gauge size={12} strokeWidth={2.4} style={{ color: needsReview.length > 0 ? "var(--warning-on)" : "var(--success-on)" }} />
        </span>
        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Sensor Reliability</span>
        <InfoTip text="How consistent this sensor is over time vs. its 3 closest neighbors on rainy days (≥10 mm). One unusual day is weather; a repeated pattern suggests the sensor needs attention." />
        <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {hasAny ? (needsReview.length > 0 ? `${needsReview.length} need review · ${normalRows.length} reliable` : `All ${merged.length} reliable`) + (insufficientRows.length ? ` · ${insufficientRows.length} not enough data` : "") : "no stations graded"}
        </span>
      </div>

      {/* Key — each color badge is now the hover target. No separate (?) icon. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          rowGap: 6,
          padding: "8px 14px",
          borderBottom: "1px solid var(--divider)",
          background: "var(--surface-alt)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          Key
        </span>
        <span style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />
        <KeyBadge tone="danger" dot tip="Repeatedly higher or repeatedly no reading when neighbors recorded rain (≥10mm) — prioritize site check. Consistency vs. 3 closest neighbors; one odd day is weather.">
          <Gauge size={10} strokeWidth={2} style={{ marginRight: 3, verticalAlign: "-1px" }} />
          Needs attention
        </KeyBadge>
        <KeyBadge tone="warning" tip="A bit high or sometimes no reading — monitor. Consistency vs. 3 closest neighbors on rainy days (≥10mm).">
          <Gauge size={10} strokeWidth={2} style={{ marginRight: 3, verticalAlign: "-1px" }} />
          Monitor
        </KeyBadge>
        <KeyBadge tone="success" tip="Matches neighbors over time — reliable, no ongoing pattern.">
          <Gauge size={10} strokeWidth={2} style={{ marginRight: 3, verticalAlign: "-1px" }} />
          Reliable
        </KeyBadge>
        <KeyBadge tone="neutral" tip="Fewer than ~8 rainy days checked — not enough data to judge.">
          <Gauge size={10} strokeWidth={2} style={{ marginRight: 3, verticalAlign: "-1px" }} />
          Not enough data
        </KeyBadge>
      </div>

      {!hasAny ? (
        <div style={{ padding: "14px 16px", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>No reliability data for this run.</div>
      ) : (
        <>
          {/* Needs review — always visible, one concise line per gauge */}
          {needsReview.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {needsReview.slice(0, 12).map((r) => (
                <div key={r.station_id} title={r.tip} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--divider)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor(r.status), marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{r.station_id}</span>
                      <Badge tone={r.badgeTone} dot={r.status === "suspect"} style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}><Gauge size={10} strokeWidth={2} style={{ marginRight: 4, verticalAlign: "-1px" }} />{r.badgeLabel}</Badge>
                    </div>
                    <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: r.status === "suspect" ? "var(--danger)" : "var(--warning-on)", marginTop: 3 }}>{r.reason}</div>
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 2 }}>{r.detail}</div>
                  </div>
                </div>
              ))}
              {needsReview.length > 12 && <div style={{ padding: "8px 14px", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>+{needsReview.length - 12} more need review</div>}
            </div>
          ) : (
            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, background: "color-mix(in oklab, var(--success) 6%, var(--surface))", borderBottom: healthyCount > 0 ? "1px solid var(--border)" : "none" }}>
              <CheckCircle2 size={13} style={{ color: "var(--success)", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 500 }}>All sensors look reliable — flagged days are likely real local rain.</span>
            </div>
          )}

          {/* Healthy / not enough — collapsed */}
          {healthyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHealthy((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "var(--surface-alt)", border: "none", borderTop: needsReview.length === 0 ? "none" : "1px solid var(--border)", cursor: "pointer", fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--text-secondary)", fontFamily: "inherit" }}
            >
              {showHealthy ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showHealthy ? "Hide" : "Show"} {healthyCount} {healthyCount === 1 ? "other" : "others"} — {normalRows.length} reliable{insufficientRows.length ? ` · ${insufficientRows.length} not enough data` : ""}
            </button>
          )}
          {showHealthy && visibleHealthy.length > 0 && (
            <div style={{ borderTop: "1px solid var(--divider)", background: "var(--surface-alt)" }}>
              {visibleHealthy.map((r) => (
                <div key={r.station_id} title={r.tip} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: dotColor(r.status), flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{r.station_id}</span>
                  <Badge tone={r.badgeTone} style={{ fontSize: 11 }}><Gauge size={10} strokeWidth={2} style={{ marginRight: 3, verticalAlign: "-1px" }} />{r.badgeLabel}</Badge>
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", marginLeft: "auto", maxWidth: 360, textAlign: "right", lineHeight: 1.4 }}>{r.detail}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface OverviewTabProps {
  result: ProcessResult;
}

export function OverviewTab({ result }: OverviewTabProps) {
  const { summary, flagged_data, quality_report } = result;

  const stationPoints = useMemo(() => {
    // Sensor status per station — same rule as the card, so dot + badge share one hue.
    const healthById = new Map<string, string>();
    for (const h of result.station_health ?? []) healthById.set(h.station_id, h.status);
    const stuckById = new Map<string, string>();
    for (const s of result.station_stuck_health ?? []) stuckById.set(s.station_id, s.status);
    function gaugeFor(id: string): "suspect" | "watch" | "consistent" | "need_more" | null {
      const hs = healthById.get(id);
      const ls = stuckById.get(id);
      if (hs === "suspect" || ls === "suspect") return "suspect";
      if (hs === "watch" || ls === "watch") return "watch";
      if (hs === "insufficient_data" || ls === "insufficient_data") return "need_more";
      if (hs === "normal" || ls === "normal") return "consistent";
      return null;
    }
    const totals = new Map<string, { lat: number; lon: number; readings: number; anomalies: number }>();
    for (const row of flagged_data) {
      const t = totals.get(row.station_id) ?? { lat: row.latitude, lon: row.longitude, readings: 0, anomalies: 0 };
      t.readings += 1;
      if (row.is_anomaly || (row as any).is_low_anomaly) t.anomalies += 1;
      totals.set(row.station_id, t);
    }
    return Array.from(totals, ([station_id, v]) => ({
      station_id, latitude: v.lat, longitude: v.lon,
      total_readings: v.readings, anomaly_count: v.anomalies,
      gaugeStatus: gaugeFor(station_id),
    }));
  }, [flagged_data, result.station_health, result.station_stuck_health]);

  const statCards: {
    label: string;
    value: string;
    hint: string;
    tone: string;
    tip: string;
    Icon: typeof Database;
  }[] = [
    {
      label: "Rows Processed",
      value: summary.total_rows.toLocaleString(),
      hint: `of ${quality_report.total_input_rows.toLocaleString()} input`,
      tone: "var(--info)",
      tip: "Daily readings used after all quality checks. Failed rows aren't counted.",
      Icon: Layers,
    },
    {
      label: "Stations",
      value: String(summary.total_stations),
      hint: `${quality_report.stations_excluded} excluded`,
      tone: "var(--text-muted)",
      tip: "Stations included. Those with too little usable data are excluded first.",
      Icon: MapPin,
    },
    {
      label: "Anomalies",
      value: summary.total_anomalies.toLocaleString(),
      hint: `${summary.anomaly_rate}% of readings`,
      tone: summary.total_anomalies > 0 ? "var(--danger)" : "var(--success)",
      tip: "Readings flagged as notably high vs neighbors that same day.",
      Icon: AlertTriangle,
    },
    {
      label: "Stations Flagged",
      value: String(summary.anomalous_stations),
      hint: `${summary.processing_time_seconds.toFixed(1)}s runtime`,
      tone: summary.anomalous_stations > 0 ? "var(--warning)" : "var(--success)",
      tip: "Distinct stations with at least one flagged day.",
      Icon: Flag,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
      {/* ── Map + all side boxes — equal height so map matches the right stack */}
      <div className="overview-main" style={{ display: "grid", gridTemplateColumns: "1.55fr 0.90fr", gap: 12, alignItems: "stretch" }}>
        {/* Map — left, stretches to match the right column height */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Station Map</span>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{stationPoints.length} stations</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>
              <InlineTip tip="No flagged days — this station tracked its 3 nearest neighbors. Dots are green; sensor reliability in the popup may still show Monitor/Needs attention.">
                <span style={{ display: "flex", alignItems: "center", gap: 4, cursor: "help" }}>
                  <span style={{ height: 7, width: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />
                  Typical
                </span>
              </InlineTip>
              <InlineTip tip="At least one flagged day vs neighbors on that day — red dot with halo. Check Sensor Reliability and Anomaly Report for details.">
                <span style={{ display: "flex", alignItems: "center", gap: 4, cursor: "help" }}>
                  <span style={{ height: 7, width: 7, borderRadius: "50%", background: "var(--danger)", flexShrink: 0 }} />
                  Flagged
                </span>
              </InlineTip>
            </div>
          </div>
          <div style={{ padding: 10, flex: 1, display: "flex", minHeight: 0 }}>
            <StationMap stations={stationPoints} height="100%" style={{ flex: 1 }} />
          </div>
        </div>

        {/* Right side — all boxes stacked vertically (was split across top + right) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* Stats — 2×2 grid so four cards fit without a full-width row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {statCards.map(({ label, value, hint, tip, Icon }) => (
              <div
                key={label}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-xl)",
                  padding: "12px 14px",
                  boxShadow: "var(--shadow-xs)",
                }}
              >
                {/* Watermark — enlarged, thicker outline, more visible */}
                <span aria-hidden className="stat-watermark">
                  <Icon size={64} strokeWidth={2.35} />
                </span>
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>{label}</span>
                    <InfoTip text={tip} />
                  </div>
                  <div style={{ fontSize: "var(--font-lg)", fontWeight: 700, color: "var(--text)", lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)", marginBottom: 3 }}>{value}</div>
                  <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", lineHeight: 1.3 }}>{hint}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "14px 16px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Clock size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Date Range</span>
              <InfoTip text="Earliest and latest dates in your cleaned CSV." />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{summary.date_range_start ?? "—"}</div>
              <div style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>→</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{summary.date_range_end ?? "—"}</div>
            </div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "14px 16px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>What to do next</span>
              <InfoTip text="No thresholds to tune — just review and dispatch." />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Review flagged stations", tip: "Open Anomaly Report for the per-date comparison." },
                { label: "Check sensor reliability", tip: "One unusual day is weather; a repeated pattern suggests a sensor issue." },
                { label: "Create a ticket", tip: "Technicians see it on their phones immediately." },
              ].map(({ label, tip }, idx, arr) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: idx !== arr.length - 1 ? "1px solid var(--divider)" : "none" }}>
                  <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid color-mix(in oklab, var(--brand) 14%, transparent)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0, lineHeight: 1 }}>{idx + 1}</span>
                  <span style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>{label}<InfoTip text={tip} /></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .overview-main { grid-template-columns: 1fr !important; } }`}</style>

      {/* ── Row 4: Sensor reliability (unified) ── */}
      <SensorReliabilityCard station_health={result.station_health ?? []} station_stuck_health={result.station_stuck_health ?? []} />

      {/* ── Row 5: Data quality (collapsed) ── */}
      <QualityReportCard quality_report={quality_report} />
    </div>
  );
}
