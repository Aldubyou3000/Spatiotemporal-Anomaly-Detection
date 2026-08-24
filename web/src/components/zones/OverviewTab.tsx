"use client";

import { useMemo, useState } from "react";
import { Clock, Database, AlertTriangle, Gauge, HelpCircle, MapPin, CheckCircle2, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/Badge";
import type { ProcessResult, StationHealth, StationStuckHealth } from "@/types/zones";

const StationMap = dynamic(() => import("./StationMap").then((m) => m.StationMap), {
  ssr: false,
  loading: () => (
    <div style={{ height: 400, borderRadius: "var(--r-lg)", background: "var(--surface-sunken)", border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>
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

// ─── Quality Report Card ──────────────────────────────────────────────────────

import type { QualityReport, StationAnomalySummary } from "@/types/zones";

interface IssueRowProps {
  label: string;
  value: number;
  unit: "rows" | "stations";
  desc: string;
  tip: string;
}

function QualityReportCard({
  quality_report: qr,
  anomaly_summary,
}: {
  quality_report: QualityReport;
  anomaly_summary: StationAnomalySummary[];
}) {
  const totalExclusions =
    qr.exclusion_details.zero_valid_stations +
    qr.exclusion_details.insufficient_readings_stations +
    qr.exclusion_details.multi_day_gaps +
    qr.exclusion_details.starts_with_nan +
    qr.exclusion_details.ends_with_nan +
    qr.exclusion_details.duplicates +
    qr.exclusion_details.multi_hour_gaps +
    qr.exclusion_details.hourly_starts_with_nan +
    qr.exclusion_details.hourly_ends_with_nan +
    qr.exclusion_details.hourly_duplicates;

  const allClean = totalExclusions === 0 && qr.stations_excluded === 0;

  const hourlyIssues: IssueRowProps[] = [
    { label: "Gaps ≥ 2 h",          value: qr.exclusion_details.multi_hour_gaps,        unit: "rows", desc: "Hourly readings dropped from 2+ hour gaps",        tip: "Readings inside runs of 2 or more consecutive missing hours are dropped before daily aggregation (single-hour gaps are interpolated instead). This counts the dropped readings, not stations." },
    { label: "Starts with NaN",     value: qr.exclusion_details.hourly_starts_with_nan, unit: "rows", desc: "Hourly readings dropped at series start",           tip: "Leading missing hourly readings before a station's first real value are dropped — the start of the record can't be reliably aggregated. Counts dropped readings." },
    { label: "Ends with NaN",       value: qr.exclusion_details.hourly_ends_with_nan,   unit: "rows", desc: "Hourly readings dropped at series end",             tip: "Trailing missing hourly readings after a station's last real value are dropped — the end of the record can't be reliably aggregated. Counts dropped readings." },
    { label: "Duplicate timestamps", value: qr.exclusion_details.hourly_duplicates,     unit: "rows", desc: "Duplicate hourly rows removed (kept first)",        tip: "Two or more readings shared the same station and timestamp. Extras are dropped keeping the first, so a duplicate can't silently inflate the day's total. Counts dropped readings." },
  ];

  const dailyIssues: IssueRowProps[] = [
    { label: "Gaps ≥ 2 days",   value: qr.exclusion_details.multi_day_gaps,   unit: "rows", desc: "Daily readings dropped from 2+ day gaps", tip: "After aggregating to daily totals, days inside runs of 2 or more consecutive missing days are dropped (not filled). Counts dropped daily readings." },
    { label: "Starts with NaN", value: qr.exclusion_details.starts_with_nan,  unit: "rows", desc: "Daily readings dropped at series start",  tip: "Leading missing daily records before a station's first real value are dropped. Gap-filling only applies to the middle of a series, not the edges. Counts dropped daily readings." },
    { label: "Ends with NaN",   value: qr.exclusion_details.ends_with_nan,    unit: "rows", desc: "Daily readings dropped at series end",    tip: "Trailing missing daily records after a station's last real value are dropped. Counts dropped daily readings." },
    { label: "Duplicates",      value: qr.exclusion_details.duplicates,       unit: "rows", desc: "Duplicate station/date rows removed",     tip: "More than one daily row existed for the same station and date after aggregation. Extras are removed, keeping one row per station per day. Counts dropped daily readings." },
  ];

  const stationIssues: IssueRowProps[] = [
    { label: "< 2 valid readings", value: qr.exclusion_details.insufficient_readings_stations, unit: "stations", desc: "Stations excluded — too few valid readings", tip: "A whole station had fewer than 2 usable daily readings after cleaning — not enough data to detect anomalies reliably, so the entire station is excluded. Counts stations." },
    { label: "0% valid",           value: qr.exclusion_details.zero_valid_stations,            unit: "stations", desc: "Stations excluded — no valid readings",      tip: "A whole station had zero valid readings — every row was missing or unusable. The entire station is excluded. Counts stations." },
  ];

  function IssueRow({ label, value, unit, desc, tip }: IssueRowProps) {
    const bad = value > 0;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 0",
        borderBottom: "1px solid var(--divider)",
      }}>
        <div style={{ flexShrink: 0 }}>
          {bad
            ? <XCircle size={14} strokeWidth={2} style={{ color: "var(--danger)" }} />
            : <CheckCircle2 size={14} strokeWidth={2} style={{ color: "var(--success)" }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: bad ? "var(--text)" : "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
            {label}
            <InfoTip text={tip} />
          </div>
          <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 1 }}>{desc}</div>
        </div>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)",
          fontWeight: 600, fontVariantNumeric: "tabular-nums",
          color: bad ? "var(--danger)" : "var(--text-tertiary)",
          background: bad ? "var(--danger-soft)" : "transparent",
          padding: bad ? "1px 8px" : "0",
          borderRadius: "var(--r-sm)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {value.toLocaleString()}
          <span style={{ fontWeight: 500, opacity: 0.7, marginLeft: 4 }}>{unit}</span>
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
        <AlertTriangle size={14} strokeWidth={2.2} style={{ color: allClean ? "var(--success)" : "var(--warning)" }} />
        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Data Quality Report</span>
        <InfoTip text="Shows whether your CSV data passed all quality checks before anomaly detection. Issues here mean some stations were excluded or had gaps filled automatically." />
        {allClean
          ? <span style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 500, marginLeft: 4 }}>— all stations passed</span>
          : <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", marginLeft: 4 }}>
              {qr.stations_excluded > 0 && <>{qr.stations_excluded} station{qr.stations_excluded !== 1 ? "s" : ""} excluded · </>}
              {qr.rows_filled > 0 && <>{qr.rows_filled} row{qr.rows_filled !== 1 ? "s" : ""} filled</>}
            </span>
        }
      </div>

      {/* Body — three-section exclusion breakdown (hourly rows · daily rows · whole-station) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>

        {/* Hourly exclusions (rows, pre-aggregation) */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Hourly exclusions</span>
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>(pre-aggregation)</span>
            <InfoTip text="Hourly readings dropped from the raw data before it was converted to daily totals. These are counts of readings (rows), not stations." />
          </div>
          {hourlyIssues.map((r) => <IssueRow key={r.label} {...r} />)}
        </div>

        {/* Daily exclusions (rows, post-aggregation) */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Daily exclusions</span>
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>(post-aggregation)</span>
            <InfoTip text="Daily readings dropped after hourly totals were aggregated to days. These are counts of daily readings (rows), not stations." />
          </div>
          {dailyIssues.map((r) => <IssueRow key={r.label} {...r} />)}
        </div>

        {/* Station exclusions (whole-station) */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Station exclusions</span>
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>(whole-station)</span>
            <InfoTip text="Entire stations excluded because they had too little usable data after cleaning. These are counts of stations." />
          </div>
          {stationIssues.map((r) => <IssueRow key={r.label} {...r} />)}
        </div>
      </div>

      {/* Footer — top flagged stations */}
      {anomaly_summary.length > 0 && (
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-alt)",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-secondary)", flexShrink: 0 }}>
            Top flagged stations
          </span>
          <InfoTip text="Stations with the most anomalous readings in this run. The number after × is how many anomalies were detected at that station." />
          <span style={{ width: 1, height: 12, background: "var(--divider)", flexShrink: 0 }} />
          {anomaly_summary.slice(0, 8).map((s) => (
            <span key={s.station_id} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 10px", borderRadius: "var(--r-full)",
              background: "var(--danger-soft)",
              border: "1px solid color-mix(in oklab, var(--danger) 20%, transparent)",
              fontSize: "var(--font-xs)", fontWeight: 500,
            }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--danger)" }}>{s.station_id}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>×{s.anomaly_count}</span>
            </span>
          ))}
          {anomaly_summary.length > 8 && (
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
              +{anomaly_summary.length - 8} more
            </span>
          )}
        </div>
      )}

      {/* All-clean banner */}
      {allClean && (
        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid var(--border)",
          background: "color-mix(in oklab, var(--success) 6%, var(--surface))",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <CheckCircle2 size={13} style={{ color: "var(--success)", flexShrink: 0 }} />
          <span style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 500 }}>
            No exclusions — all stations passed quality checks.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Station Health Card (post-LOF bias profile) ────────────────────────────

function StationHealthCard({ station_health }: { station_health: StationHealth[] }) {
  const suspect = station_health.filter((h) => h.status === "suspect");
  const watch = station_health.filter((h) => h.status === "watch");
  const normal = station_health.filter((h) => h.status === "normal");
  const insufficient = station_health.filter((h) => h.status === "insufficient_data");

  const hasAny = station_health.length > 0;
  const allGood = suspect.length === 0 && watch.length === 0;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
        <Gauge size={14} strokeWidth={2.2} style={{ color: suspect.length > 0 ? "var(--danger)" : watch.length > 0 ? "var(--warning)" : "var(--success)" }} />
        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Station Health</span>
        <InfoTip text="Per-station bias vs. its Zone B neighbors on rain days (group median ≥10 mm). Ratio is mean(station ÷ median). >1.50 or top >60% → suspect; >1.15 → watch; <5 rain days → not enough data." />
        <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {hasAny ? `${station_health.length} stations graded` : "no stations graded"}
        </span>
      </div>

      {!hasAny ? (
        <div style={{ padding: "16px 20px", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>No station health available for this run.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Suspect", count: suspect.length, color: "var(--danger)", soft: "var(--danger-soft)" },
              { label: "Watch", count: watch.length, color: "var(--warning)", soft: "var(--warning-soft)" },
              { label: "Normal", count: normal.length, color: "var(--success)", soft: "var(--success-soft)" },
              { label: "Not enough data", count: insufficient.length, color: "var(--text-tertiary)", soft: "var(--surface-sunken)" },
            ].map(({ label, count, color, soft }) => (
              <div key={label} style={{ padding: "14px 16px", borderRight: label !== "Not enough data" ? "1px solid var(--border)" : undefined, background: count > 0 ? soft : "transparent" }}>
                <div style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 }} />
                  {label}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-metric)", fontWeight: 700, color: count > 0 ? color : "var(--text-tertiary)" }}>{count}</div>
              </div>
            ))}
          </div>

          {(suspect.length > 0 || watch.length > 0) && (
            <div style={{ padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {[...suspect, ...watch].slice(0, 12).map((h) => (
                <span
                  key={h.station_id}
                  title={`${h.station_id}: ${h.bias_ratio != null ? `${h.bias_ratio.toFixed(2)}× median` : `${h.rain_days} rain days`} · top ${h.top_rate != null ? Math.round(h.top_rate * 100) + "%" : "—"} · flagged ${h.times_flagged}×`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: "var(--r-full)",
                    background: h.status === "suspect" ? "var(--danger-soft)" : "var(--warning-soft)",
                    border: `1px solid color-mix(in oklab, ${h.status === "suspect" ? "var(--danger)" : "var(--warning)"} 18%, transparent)`,
                    fontSize: "var(--font-xs)", fontWeight: 500,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", color: h.status === "suspect" ? "var(--danger)" : "var(--warning-on)", fontVariantNumeric: "tabular-nums" }}>{h.station_id}</span>
                  <Badge tone={h.status === "suspect" ? "danger" : "warning"} style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                    {h.bias_ratio != null ? `${h.bias_ratio.toFixed(2)}×` : `${h.rain_days}d`}
                    {h.top_rate != null ? ` · ${Math.round(h.top_rate * 100)}%` : ""}
                  </Badge>
                </span>
              ))}
              {(suspect.length + watch.length) > 12 && (
                <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>+{suspect.length + watch.length - 12} more</span>
              )}
            </div>
          )}

          {allGood && (
            <div style={{ padding: "10px 20px", background: "color-mix(in oklab, var(--success) 6%, var(--surface))", display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)" }}>
              <CheckCircle2 size={13} style={{ color: "var(--success)", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--font-xs)", color: "var(--success)", fontWeight: 500 }}>All graded stations are within normal bias. Flags are likely localized weather, not gauge issues.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StuckAtZeroCard({ station_stuck_health }: { station_stuck_health: StationStuckHealth[] }) {
  const suspect = station_stuck_health.filter((h) => h.status === "suspect");
  const watch = station_stuck_health.filter((h) => h.status === "watch");
  const normal = station_stuck_health.filter((h) => h.status === "normal");
  const insufficient = station_stuck_health.filter((h) => h.status === "insufficient_data");

  const hasAny = station_stuck_health.length > 0;
  const allGood = suspect.length === 0 && watch.length === 0;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: 14, height: 14, borderRadius: 999, background: "var(--teal-soft)", border: "1px solid var(--teal)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: suspect.length > 0 ? "var(--danger)" : watch.length > 0 ? "var(--warning)" : "var(--teal)" }} />
        </span>
        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Stuck at Zero</span>
        <InfoTip text="Checks rainy days where the area's middle neighbor got ≥10 mm. If a gauge read ≤1 mm on many of those days (repeated, not one dry day), it is flagged." />
        <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {hasAny ? `${station_stuck_health.length} stations graded` : "no stations graded"}
        </span>
      </div>

      {!hasAny ? (
        <div style={{ padding: "16px 20px", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>No stuck-at-zero data for this run.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Suspect", count: suspect.length, color: "var(--danger)", soft: "var(--danger-soft)" },
              { label: "Watch", count: watch.length, color: "var(--warning)", soft: "var(--warning-soft)" },
              { label: "Normal", count: normal.length, color: "var(--teal)", soft: "var(--teal-soft)" },
              { label: "Not enough data", count: insufficient.length, color: "var(--text-tertiary)", soft: "var(--surface-sunken)" },
            ].map(({ label, count, color, soft }) => (
              <div key={label} style={{ padding: "14px 16px", borderRight: label !== "Not enough data" ? "1px solid var(--border)" : undefined, background: count > 0 ? soft : "transparent" }}>
                <div style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 }} />
                  {label}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-metric)", fontWeight: 700, color: count > 0 ? color : "var(--text-tertiary)" }}>{count}</div>
              </div>
            ))}
          </div>

          {(suspect.length > 0 || watch.length > 0) && (
            <div style={{ padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {[...suspect, ...watch].slice(0, 12).map((h) => (
                <span
                  key={h.station_id}
                  title={`${h.station_id}: ${h.zero_rate != null ? `${Math.round(h.zero_rate * 100)}% at 0` : `${h.rain_days} rainy days`} · streak ${h.max_zero_streak ?? 0} · bias ${h.bias_ratio != null ? `${h.bias_ratio.toFixed(2)}×` : "—"}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: "var(--r-full)",
                    background: h.status === "suspect" ? "var(--danger-soft)" : "var(--warning-soft)",
                    border: `1px solid color-mix(in oklab, ${h.status === "suspect" ? "var(--danger)" : "var(--warning)"} 18%, transparent)`,
                    fontSize: "var(--font-xs)", fontWeight: 500,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", color: h.status === "suspect" ? "var(--danger)" : "var(--warning-on)", fontVariantNumeric: "tabular-nums" }}>{h.station_id}</span>
                  <Badge tone={h.status === "suspect" ? "danger" : "warning"} style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                    {h.zero_rate != null ? `${Math.round(h.zero_rate * 100)}%` : `${h.rain_days}d`}
                    {h.max_zero_streak != null ? ` · streak ${h.max_zero_streak}` : ""}
                  </Badge>
                </span>
              ))}
              {(suspect.length + watch.length) > 12 && (
                <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>+{suspect.length + watch.length - 12} more</span>
              )}
            </div>
          )}

          {allGood && (
            <div style={{ padding: "10px 20px", background: "color-mix(in oklab, var(--teal) 6%, var(--surface))", display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)" }}>
              <CheckCircle2 size={13} style={{ color: "var(--teal)", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--font-xs)", color: "var(--teal-on)", fontWeight: 500 }}>No pattern of zero on rainy days. Gauges are responding when the area is wet.</span>
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
  const { summary, flagged_data, anomaly_summary, quality_report } = result;

  const stationPoints = useMemo(() => {
    const totals = new Map<string, { lat: number; lon: number; readings: number; anomalies: number }>();
    for (const row of flagged_data) {
      const t = totals.get(row.station_id) ?? { lat: row.latitude, lon: row.longitude, readings: 0, anomalies: 0 };
      t.readings += 1;
      if (row.is_anomaly) t.anomalies += 1;
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
      tip: "Total daily readings that passed all quality checks and were used in anomaly detection. Rows that failed quality checks are not counted here.",
    },
    {
      label: "Stations",
      value: String(summary.total_stations),
      hint: `${quality_report.stations_excluded} excluded`,
      tone: "var(--text-muted)",
      tip: "Number of weather stations included in this run. Stations with too many missing or invalid readings are excluded before detection starts.",
    },
    {
      label: "Anomalies",
      value: summary.total_anomalies.toLocaleString(),
      hint: `${summary.anomaly_rate}% of readings`,
      tone: summary.total_anomalies > 0 ? "var(--danger)" : "var(--success)",
      tip: "Total individual readings flagged as anomalous by the LOF algorithm. A single station can contribute multiple anomalies across different dates.",
    },
    {
      label: "Stations Flagged",
      value: String(summary.anomalous_stations),
      hint: `${summary.processing_time_seconds.toFixed(1)}s pipeline runtime`,
      tone: summary.anomalous_stations > 0 ? "var(--warning)" : "var(--success)",
      tip: "Number of distinct stations that had at least one anomalous reading. Use this to quickly see how widespread the issue is across your network.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 20 }}>

      {/* ── Row 1: Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {statCards.map(({ label, value, hint, tone, tip }) => (
          <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, flexShrink: 0 }} />
              <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-secondary)" }}>{label}</span>
              <InfoTip text={tip} />
            </div>
            <div style={{ fontSize: "var(--font-metric)", fontWeight: 700, color: "var(--text)", lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)", marginBottom: 6 }}>{value}</div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>{hint}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Map full width ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MapPin size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Station Map</span>
            <span style={{ color: "var(--text-tertiary)" }}>·</span>
            <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{stationPoints.length} stations</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ height: 8, width: 8, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />Normal
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ height: 8, width: 8, borderRadius: "50%", background: "var(--danger)", flexShrink: 0 }} />Anomalous
            </span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <StationMap stations={stationPoints} height={560} />
        </div>
      </div>

      {/* ── Row 3: Date range + Parameters ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        {/* Date range */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Clock size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Date Range</span>
            <InfoTip text="The earliest and latest dates found in your uploaded CSV after cleaning. Anomaly detection only runs on data within this range." />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{summary.date_range_start ?? "—"}</div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>→</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{summary.date_range_end ?? "—"}</div>
          </div>
        </div>

        {/* Next steps — user-facing, no LOF/Haversine internals exposed */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>What to do next</span>
            <InfoTip text="No thresholds to tune — just upload and review. Flagged means notably higher than nearby stations that same day; use Station Health to tell a one-off storm from a repeated pattern." />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "Review flagged stations", tip: "Open the Anomaly Report tab for the flagged list, maps, and per-date neighbor comparison." },
              { label: "Check Station Health", tip: "Single-day spike = likely weather. Reads high every rain day = possible gauge issue." },
              { label: "Create a ticket", tip: "Dispatch technicians directly from a flagged station — they see it on their mobile devices." },
            ].map(({ label, tip }, idx, arr) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: idx !== arr.length - 1 ? "1px solid var(--divider)" : "none" }}>
                <span style={{ width: 20, height: 20, borderRadius: 999, background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid color-mix(in oklab, var(--brand) 14%, transparent)", display: "grid", placeItems: "center", fontSize: "var(--font-xs)", fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0, lineHeight: 1 }}>{idx + 1}</span>
                <span style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                  {label}
                  <InfoTip text={tip} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3.5: Station health (bias profile) — post-LOF triage ── */}
      <StationHealthCard station_health={result.station_health ?? []} />

      {/* ── Row 3.6: Stuck at Zero (symmetric low side) ── */}
      <StuckAtZeroCard station_stuck_health={result.station_stuck_health ?? []} />

      {/* ── Row 4: Quality report ── */}
      <QualityReportCard quality_report={quality_report} anomaly_summary={anomaly_summary} />

    </div>
  );
}
