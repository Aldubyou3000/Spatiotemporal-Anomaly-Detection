"use client";

import { useMemo, useState } from "react";
import { Clock, Database, AlertTriangle, HelpCircle, MapPin, CheckCircle2, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import type { ProcessResult } from "@/types/zones";

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
    qr.exclusion_details.hourly_ends_with_nan;

  const allClean = totalExclusions === 0 && qr.stations_excluded === 0;

  const hourlyIssues = [
    { label: "Gaps ≥ 2 h",      value: qr.exclusion_details.multi_hour_gaps,            desc: "Stations with hourly gaps of 2+ hours",              tip: "A station had 2 or more consecutive missing hourly readings. Stations with this issue are excluded before daily aggregation." },
    { label: "Starts with NaN", value: qr.exclusion_details.hourly_starts_with_nan,     desc: "Hourly series beginning with missing values",         tip: "The station's first hourly readings were missing. This means the start of its record cannot be reliably aggregated." },
    { label: "Ends with NaN",   value: qr.exclusion_details.hourly_ends_with_nan,       desc: "Hourly series ending with missing values",            tip: "The station's last hourly readings were missing. This means the end of its record cannot be reliably aggregated." },
  ];

  const dailyIssues = [
    { label: "Gaps ≥ 2 days",        value: qr.exclusion_details.multi_day_gaps,                   desc: "Stations with daily gaps of 2+ days",                  tip: "After aggregating to daily totals, this station had 2 or more consecutive days with no data. These cannot be filled and the station is excluded." },
    { label: "< 2 valid readings",   value: qr.exclusion_details.insufficient_readings_stations,   desc: "Stations excluded due to too few valid readings",       tip: "The station had fewer than 2 usable daily readings after cleaning. Not enough data to detect anomalies reliably." },
    { label: "0% valid",             value: qr.exclusion_details.zero_valid_stations,              desc: "Stations with no valid readings at all",               tip: "The station had zero valid readings — every row was missing or unusable. It is excluded entirely." },
    { label: "Starts with NaN",      value: qr.exclusion_details.starts_with_nan,                 desc: "Daily series beginning with missing values",            tip: "The station's first daily record was missing. Gap-filling only works for values in the middle of a series, not at the edges." },
    { label: "Ends with NaN",        value: qr.exclusion_details.ends_with_nan,                   desc: "Daily series ending with missing values",              tip: "The station's last daily record was missing. Same edge-case as above — cannot be filled and flags the station for review." },
    { label: "Duplicates",           value: qr.exclusion_details.duplicates,                      desc: "Duplicate station/date rows removed",                  tip: "More than one row existed for the same station on the same date. Duplicates are removed automatically, keeping only one row per station per day." },
  ];

  function IssueRow({ label, value, desc, tip }: { label: string; value: number; desc: string; tip: string }) {
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
        }}>
          {value}
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

      {/* Body — two-column exclusion breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>

        {/* Hourly exclusions */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Hourly exclusions</span>
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>(pre-aggregation)</span>
            <InfoTip text="Problems found in the raw hourly data before it was converted to daily totals. Stations with these issues are dropped early so they don't corrupt the aggregation step." />
          </div>
          {hourlyIssues.map((r) => <IssueRow key={r.label} {...r} />)}
        </div>

        {/* Daily exclusions */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Daily exclusions</span>
            <span style={{ fontSize: "var(--font-xs)", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>(post-aggregation)</span>
            <InfoTip text="Problems found after converting hourly to daily totals. Stations that still have bad data at this stage are excluded from anomaly detection." />
          </div>
          {dailyIssues.map((r) => <IssueRow key={r.label} {...r} />)}
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
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)", marginBottom: 6 }}>{value}</div>
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

        {/* Parameters */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Database size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Pipeline Parameters</span>
            <InfoTip text="The settings used when this pipeline run was executed. These affect how sensitive anomaly detection is and how stations are compared to each other." />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Contamination", value: summary.contamination, tip: "The expected proportion of anomalies in your data. A value of 0.05 means roughly 5% of readings are expected to be anomalous. Lower values flag only the most extreme outliers." },
              { label: "Spatial neighbors", value: 3, tip: "How many nearby stations each station is compared against when detecting anomalies. A higher number considers a wider geographic context." },
            ].map(({ label, value, tip }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--font-sm)" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                  {label}
                  <InfoTip text={tip} />
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--text)", fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: Quality report ── */}
      <QualityReportCard quality_report={quality_report} anomaly_summary={anomaly_summary} />

    </div>
  );
}
