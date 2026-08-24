"use client";

import { useMemo, useState } from "react";
import { Clock, Database, AlertTriangle, Gauge, HelpCircle, MapPin, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
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
function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  }
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      <HelpCircle size={12} strokeWidth={2} style={{ color: "var(--text-tertiary)", cursor: "help", flexShrink: 0 }} />
      {pos && (
        <span style={{
          position: "fixed",
          left: pos.x,
          top: pos.y - 8,
          transform: "translate(-50%, -100%)",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "8px 12px",
          fontSize: "var(--font-xs)", fontWeight: 400, color: "var(--text)",
          lineHeight: 1.6, whiteSpace: "normal", width: 230,
          boxShadow: "var(--shadow-lg)", zIndex: 9999, pointerEvents: "none",
          letterSpacing: "0.01em",
        }}>
          {text}
        </span>
      )}
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
        { label: "Gaps ≥ 2 h", value: qr.exclusion_details.multi_hour_gaps, unit: "rows", desc: "Dropped from 2+ hour gap runs", tip: "Readings inside 2+ consecutive missing hours are dropped before daily totals. Single-hour gaps are interpolated." },
        { label: "Starts with NaN", value: qr.exclusion_details.hourly_starts_with_nan, unit: "rows", desc: "Dropped at series start", tip: "Leading missing hourly readings can't be aggregated." },
        { label: "Ends with NaN", value: qr.exclusion_details.hourly_ends_with_nan, unit: "rows", desc: "Dropped at series end", tip: "Trailing missing hourly readings can't be aggregated." },
        { label: "Duplicate timestamps", value: qr.exclusion_details.hourly_duplicates, unit: "rows", desc: "Duplicates removed (kept first)", tip: "Same station+timestamp extras are dropped." },
      ],
    },
    {
      section: "Daily",
      rows: [
        { label: "Gaps ≥ 2 days", value: qr.exclusion_details.multi_day_gaps, unit: "rows", desc: "Dropped from 2+ day gaps", tip: "Daily rows inside 2+ missing-day runs are dropped." },
        { label: "Starts with NaN", value: qr.exclusion_details.starts_with_nan, unit: "rows", desc: "Dropped at series start", tip: "Leading missing daily rows are dropped." },
        { label: "Ends with NaN", value: qr.exclusion_details.ends_with_nan, unit: "rows", desc: "Dropped at series end", tip: "Trailing missing daily rows are dropped." },
        { label: "Duplicates", value: qr.exclusion_details.duplicates, unit: "rows", desc: "Duplicate station/date removed", tip: "Extras per station per day are removed." },
      ],
    },
    {
      section: "Station",
      rows: [
        { label: "< 2 valid readings", value: qr.exclusion_details.insufficient_readings_stations, unit: "stations", desc: "Excluded — too few readings", tip: "Whole station had <2 usable daily readings." },
        { label: "0% valid", value: qr.exclusion_details.zero_valid_stations, unit: "stations", desc: "Excluded — no valid readings", tip: "Whole station had zero valid readings." },
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

// ── Unified Gauge Reliability — merges Station Health + Stuck at Zero ───────

type UnifiedStatus = "suspect" | "watch" | "normal" | "insufficient_data";

function GaugeReliabilityCard({
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
      // Human reason — prioritize the side that triggered the status
      let reason = "";
      let detail = "";
      let badgeNote = "";
      if (status === "suspect" || status === "watch") {
        const highBad = high && (high.status === "suspect" || high.status === "watch");
        const lowBad = low && (low.status === "suspect" || low.status === "watch");
        if (highBad && lowBad) {
          const hp = high!.bias_ratio != null ? `${Math.round((high!.bias_ratio - 1) * 100)}% high` : "";
          const lp = low!.zero_rate != null ? `${Math.round(low!.zero_rate * 100)}% silent` : `streak ${low!.max_zero_streak}`;
          reason = status === "suspect" ? "Mixed signals" : "Both sides a bit off";
          detail = `Reads ${hp || "high"} and often silent (${lp}) — worth a site check.`;
          badgeNote = `${high!.bias_ratio?.toFixed(2) ?? "—"}× · ${low!.zero_rate != null ? Math.round(low!.zero_rate * 100) + "% at 0" : "0"}`;
        } else if (highBad) {
          const pct = high!.bias_ratio != null ? Math.round((high!.bias_ratio - 1) * 100) : 0;
          const top = high!.top_rate != null ? Math.round(high!.top_rate * 100) : 0;
          if (high!.status === "suspect") {
            reason = "Reads consistently high";
            detail = `${pct}% above neighbors on ${high!.rain_days} rainy days · highest on ${top}% of them. Likely a gauge issue, not just weather.`;
          } else {
            reason = "Reads a bit high";
            detail = `${pct}% above neighbors on ${high!.rain_days} rainy days · top on ${top}% of them. Keep an eye on it.`;
          }
          badgeNote = `${high!.bias_ratio!.toFixed(2)}× · top ${top}%`;
        } else if (lowBad) {
          const pct = low!.zero_rate != null ? Math.round(low!.zero_rate * 100) : 0;
          const streak = low!.max_zero_streak ?? 0;
          if (low!.status === "suspect") {
            reason = "Often silent when it rained";
            detail = `At 0 on ${pct}% of ${low!.rain_days} rainy days · longest quiet run ${streak} days. Area was wet while this gauge stayed dry — check for clog or power.`;
          } else {
            reason = "Sometimes silent";
            detail = `At 0 on ${pct}% of ${low!.rain_days} rainy days · longest run ${streak} days. Worth a quick check.`;
          }
          badgeNote = `${pct}% at 0 · streak ${streak}`;
        }
      } else if (status === "normal") {
        reason = "Looks typical";
        detail = "In line with neighbors on rainy days. Flags here are likely real weather.";
        badgeNote = high?.bias_ratio != null ? `${high.bias_ratio.toFixed(2)}×` : low?.zero_rate != null ? `${Math.round(low.zero_rate * 100)}% silent` : "OK";
      } else {
        const days = (high?.rain_days ?? low?.rain_days ?? 0);
        reason = "Not enough rainy days";
        detail = `Only ${days} rainy days so far — needs more wet weather to judge.`;
        badgeNote = `${days} rainy days`;
      }
      return { station_id, lat: v.lat, lon: v.lon, high, low, status, reason, detail, badgeNote };
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

  function tone(s: UnifiedStatus): "danger" | "warning" | "success" | "neutral" {
    if (s === "suspect") return "danger";
    if (s === "watch") return "warning";
    if (s === "normal") return "success";
    return "neutral";
  }
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
        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Gauge Reliability</span>
        <InfoTip text="Whether each gauge behaves like its nearby neighbors when it rains (group middle ≥10 mm). One dry day is weather; repeating high or silent across many rainy days suggests a gauge to check." />
        <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {hasAny ? (needsReview.length > 0 ? `${needsReview.length} need review · ${normalRows.length} OK` : `All ${merged.length} OK`) + (insufficientRows.length ? ` · ${insufficientRows.length} need more data` : "") : "no stations graded"}
        </span>
      </div>

      {!hasAny ? (
        <div style={{ padding: "14px 16px", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>No reliability data for this run.</div>
      ) : (
        <>
          {/* Needs review — always visible */}
          {needsReview.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {needsReview.slice(0, 12).map((r) => (
                <div key={r.station_id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor(r.status), marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{r.station_id}</span>
                      <Badge tone={tone(r.status)} dot={r.status === "suspect"} style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{r.status === "suspect" ? "Suspect" : "Watch"}</Badge>
                      <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{r.badgeNote}</span>
                    </div>
                    <div style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: r.status === "suspect" ? "var(--danger-on)" : "var(--warning-on)", marginTop: 2 }}>{r.reason}</div>
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 1 }}>{r.detail}</div>
                  </div>
                </div>
              ))}
              {needsReview.length > 12 && <div style={{ padding: "8px 14px", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>+{needsReview.length - 12} more need review</div>}
            </div>
          ) : (
            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, background: "color-mix(in oklab, var(--success) 6%, var(--surface))", borderBottom: healthyCount > 0 ? "1px solid var(--border)" : "none" }}>
              <CheckCircle2 size={13} style={{ color: "var(--success)", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 500 }}>No gauge looks consistently off — flags are likely real weather.</span>
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
              {showHealthy ? "Hide" : "Show"} {healthyCount} {healthyCount === 1 ? "other" : "others"} — {normalRows.length} OK{insufficientRows.length ? ` · ${insufficientRows.length} need more rain` : ""}
            </button>
          )}
          {showHealthy && visibleHealthy.length > 0 && (
            <div style={{ borderTop: "1px solid var(--divider)", background: "var(--surface-alt)" }}>
              {visibleHealthy.map((r) => (
                <div key={r.station_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--divider)", opacity: r.status === "insufficient_data" ? 0.9 : 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: dotColor(r.status), flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{r.station_id}</span>
                  <Badge tone={tone(r.status)} style={{ fontSize: 11 }}>{r.status === "normal" ? "OK" : "Not enough data"}</Badge>
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", marginLeft: "auto", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{r.badgeNote}</span>
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
    }));
  }, [flagged_data]);

  const statCards = [
    {
      label: "Rows Processed",
      value: summary.total_rows.toLocaleString(),
      hint: `of ${quality_report.total_input_rows.toLocaleString()} input`,
      tone: "var(--info)",
      tip: "Daily readings used after all quality checks. Failed rows aren't counted.",
    },
    {
      label: "Stations",
      value: String(summary.total_stations),
      hint: `${quality_report.stations_excluded} excluded`,
      tone: "var(--text-muted)",
      tip: "Stations included. Those with too little usable data are excluded first.",
    },
    {
      label: "Anomalies",
      value: summary.total_anomalies.toLocaleString(),
      hint: `${summary.anomaly_rate}% of readings`,
      tone: summary.total_anomalies > 0 ? "var(--danger)" : "var(--success)",
      tip: "Readings flagged as notably high vs neighbors that same day.",
    },
    {
      label: "Stations Flagged",
      value: String(summary.anomalous_stations),
      hint: `${summary.processing_time_seconds.toFixed(1)}s runtime`,
      tone: summary.anomalous_stations > 0 ? "var(--warning)" : "var(--success)",
      tip: "Distinct stations with at least one flagged day.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
      {/* ── Row 1: Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {statCards.map(({ label, value, hint, tone, tip }) => (
          <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "14px 16px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, flexShrink: 0 }} />
              <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-secondary)" }}>{label}</span>
              <InfoTip text={tip} />
            </div>
            <div style={{ fontSize: "var(--font-metric)", fontWeight: 700, color: "var(--text)", lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)", marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{hint}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Map (narrow) + side stack — map no longer spans full width */}
      <div className="overview-map-row" style={{ display: "grid", gridTemplateColumns: "1.45fr 0.95fr", gap: 12, alignItems: "start" }}>
        {/* Map — ~60% width, less of a long rectangle */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Station Map</span>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{stationPoints.length} stations</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ height: 7, width: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />Typical</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ height: 7, width: 7, borderRadius: "50%", background: "var(--danger)", flexShrink: 0 }} />Flagged</span>
            </div>
          </div>
          <div style={{ padding: 10 }}>
            <StationMap stations={stationPoints} height={360} />
          </div>
        </div>

        {/* Right stack — stays beside map on desktop, stacks under on mobile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
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
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "14px 16px", boxShadow: "var(--shadow-xs)", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>What to do next</span>
              <InfoTip text="No thresholds to tune — just review and dispatch." />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Review flagged stations", tip: "Open Anomaly Report for the per-date comparison." },
                { label: "Check Gauge Reliability", tip: "One-off spike = weather; repeating pattern = possible gauge issue." },
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
      <style>{`@media (max-width: 880px) { .overview-map-row { grid-template-columns: 1fr !important; } }`}</style>

      {/* ── Row 4: Gauge reliability (unified) ── */}
      <GaugeReliabilityCard station_health={result.station_health ?? []} station_stuck_health={result.station_stuck_health ?? []} />

      {/* ── Row 5: Data quality (collapsed) ── */}
      <QualityReportCard quality_report={quality_report} />
    </div>
  );
}
