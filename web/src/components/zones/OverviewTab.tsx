"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Database, AlertTriangle, Gauge, HelpCircle, MapPin, CheckCircle2, XCircle, ChevronDown, ChevronUp, Layers, Flag } from "lucide-react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/Badge";
import { REVIEW_STATUS, overallReviewStatus, highReview, lowReview } from "@/lib/stationReview";
import type { ProcessResult, HealthStatus, QualityReport } from "@/types/zones";

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
// (Station Review Summary, Data Quality) or near the viewport edge (right-aligned help icons).
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
    // help icons (Station Review Summary > Key > ?) fully readable.
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
    (qr.exclusion_details.incomplete_days ?? 0) +
    qr.exclusion_details.multi_day_gaps +
    qr.exclusion_details.starts_with_nan +
    qr.exclusion_details.ends_with_nan +
    qr.exclusion_details.duplicates;
  const stationTotal =
    qr.exclusion_details.insufficient_readings_stations +
    qr.exclusion_details.zero_valid_stations;

  const totalExclusions = hourlyTotal + dailyTotal + stationTotal;
  const allClean = totalExclusions === 0 && qr.stations_excluded === 0 && qr.rows_filled === 0;

  const hasGaps = hourlyTotal > 0 || dailyTotal > 0;
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
        { label: "Incomplete day", value: qr.exclusion_details.incomplete_days ?? 0, unit: "rows", desc: "Not used — incomplete daily total", tip: "Hourly days need one usable reading for each of all 24 hours after allowed single-hour interpolation. Partial daily totals are excluded before detection." },
        { label: "Missing 2+ days", value: qr.exclusion_details.multi_day_gaps, unit: "rows", desc: "Additional daily gaps removed", tip: "Additional daily rows removed after hourly cleaning. Fully missing days can already have disappeared during hourly cleaning; zero here does not mean all calendar days were recorded." },
        { label: "Missing at start", value: qr.exclusion_details.starts_with_nan, unit: "rows", desc: "Missing at beginning", tip: "Leading missing daily rows are not used." },
        { label: "Missing at end", value: qr.exclusion_details.ends_with_nan, unit: "rows", desc: "Missing at end", tip: "Trailing missing daily rows are not used." },
        { label: "Duplicate day", value: qr.exclusion_details.duplicates, unit: "rows", desc: "Same station + day twice — kept first", tip: "Extra entries for the same station on the same day were removed." },
      ],
    },
    {
      section: "Station",
      rows: [
        { label: "Less than 2 usable days", value: qr.exclusion_details.insufficient_readings_stations, unit: "stations", desc: "Too few usable days — station not included", tip: "This station had fewer than 2 usable daily readings after cleaning." },
        { label: "No usable readings", value: qr.exclusion_details.zero_valid_stations, unit: "stations", desc: "No usable daily data — station not included", tip: "This station had no usable daily totals after completeness checks." },
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
        <InfoTip text="Cleaning before detection. Hourly daily totals need all 24 hours after allowed interpolation. Filled-hour counts include estimates in days that were later excluded; expand for dropped hourly rows, incomplete days, and excluded stations." />
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

// ── Station review: keep daily flags separate from the overall warning ──────
function StationReviewCard({ result }: { result: ProcessResult }) {
  const rows = useMemo(() => {
    const highs = new Map((result.station_health ?? []).map((h) => [h.station_id, h]));
    const lows = new Map((result.station_stuck_health ?? []).map((h) => [h.station_id, h]));
    const highCounts = new Map((result.anomaly_summary ?? []).map((s) => [s.station_id, s.events.filter((e) => !e.is_low).length]));
    const lowCounts = new Map((result.dry_stuck_summary ?? []).map((s) => [s.station_id, s.stuck_count]));
    const ids = new Set(result.flagged_data.map((r) => r.station_id));
    for (const id of highs.keys()) ids.add(id);
    for (const id of lows.keys()) ids.add(id);
    const order = { suspect: 0, watch: 1, insufficient_data: 2, normal: 3 };
    return [...ids].map((id) => {
      const high = highs.get(id);
      const low = lows.get(id);
      const status = overallReviewStatus(high?.status, low?.status);
      return { id, high, low, status, highCount: highCounts.get(id) ?? high?.times_flagged ?? 0, lowCount: lowCounts.get(id) ?? low?.events.length ?? 0 };
    }).sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id));
  }, [result]);
  const [showOthers, setShowOthers] = useState(false);
  const warnings = rows.filter((r) => r.status === "watch" || r.status === "suspect").length;
  const limited = rows.filter((r) => r.status === "insufficient_data").length;
  const primary = rows.filter((r) => r.status !== "normal");
  const others = primary.length ? rows.filter((r) => r.status === "normal") : [];
  const visible = primary.length ? [...primary, ...(showOthers ? others : [])] : rows;

  return (
    <section aria-label="Station Review Summary" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <Gauge size={15} style={{ color: "var(--text-secondary)" }} />
        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Station Review Summary</span>
        <InfoTip text="Checks for repeated high or low readings and large flagged readings. These are reasons to review a station, not proof of a sensor fault." />
        <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>{warnings} warnings{limited > 0 ? ` · ${limited} with limited data` : ""}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 16px", background: "var(--surface-alt)", borderBottom: "1px solid var(--divider)" }}>
        <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-muted)" }}>KEY</span>
        {Object.entries(REVIEW_STATUS).map(([status, item]) => <Badge key={status} tone={item.tone} title={status === "normal" ? "No repeated warning found. Individual flagged days still need review." : status === "insufficient_data" ? "Too few rainy days to assess this station." : status === "suspect" ? "Review larger differences or stronger patterns." : "Keep an eye on smaller differences."}>{item.label}</Badge>)}
      </div>
      {rows.length === 0 && <p style={{ padding: "0 16px", fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>No stations to assess.</p>}
      {visible.map((r) => {
        const badge = REVIEW_STATUS[r.status];
        const high = highReview(r.high);
        const low = lowReview(r.low);
        const highWarning = r.high?.status === "suspect" || r.high?.status === "watch";
        const lowWarning = r.low?.status === "suspect" || r.low?.status === "watch";
        const detail = [highWarning ? high.detail : "", lowWarning ? low.detail : ""].filter(Boolean).join(" ")
          || (r.status === "insufficient_data" ? "More rainy-day readings are needed to assess this station." : "No repeated warning found. Review any flagged days.");
        return (
          <div key={r.id} title={`${high.tip} ${low.tip}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--divider)" }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "var(--r-full)", background: r.status === "suspect" ? "var(--danger)" : r.status === "watch" ? "var(--warning)" : "var(--text-tertiary)", marginTop: 6, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>{r.id}</span>
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{r.highCount} high · {r.lowCount} low days</span>
              </div>
              <div style={{ marginTop: 4, fontSize: "var(--font-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{detail}</div>
            </div>
          </div>
        );
      })}
      {others.length > 0 && <button type="button" aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "9px 16px", background: "var(--surface-alt)", color: "var(--text-secondary)", border: "none", borderBottom: "1px solid var(--divider)", cursor: "pointer", font: "inherit", fontSize: "var(--font-xs)", textAlign: "left" }}>
        {showOthers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showOthers ? "Hide" : "Show"} {others.length} other {others.length === 1 ? "station" : "stations"} · no overall warning
      </button>}
      <div style={{ padding: "8px 16px", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>Flagged days still need review in Anomaly Report.</div>
    </section>
  );
}

interface OverviewTabProps {
  result: ProcessResult;
}

export function OverviewTab({ result }: OverviewTabProps) {
  const { summary, flagged_data, quality_report } = result;

  const stationPoints = useMemo(() => {
    // Sensor status per station — same rule as the card, so dot + badge share one hue.
    const healthById = new Map<string, HealthStatus>();
    for (const h of result.station_health ?? []) healthById.set(h.station_id, h.status);
    const stuckById = new Map<string, HealthStatus>();
    for (const s of result.station_stuck_health ?? []) stuckById.set(s.station_id, s.status);
    function gaugeFor(id: string): "suspect" | "watch" | "normal" | "insufficient_data" {
      return overallReviewStatus(healthById.get(id), stuckById.get(id));
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
              <InlineTip tip="No flagged days — this station tracked its 3 nearest neighbors. Dots are green; station review summary in the popup may still show Monitor/Needs attention.">
                <span style={{ display: "flex", alignItems: "center", gap: 4, cursor: "help" }}>
                  <span style={{ height: 7, width: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />
                  Typical
                </span>
              </InlineTip>
              <InlineTip tip="At least one flagged day vs neighbors on that day — red dot with halo. Check Station Review Summary and Anomaly Report for details.">
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
                { label: "Read the station summary", tip: "Review repeated differences and large flagged readings, then check local weather and station conditions." },
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
      <StationReviewCard result={result} />

      {/* ── Row 5: Data quality (collapsed) ── */}
      <QualityReportCard quality_report={quality_report} />
    </div>
  );
}
