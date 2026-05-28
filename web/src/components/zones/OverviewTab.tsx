"use client";

import { useMemo } from "react";
import { Clock, Database, AlertTriangle, MapPin } from "lucide-react";
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

interface OverviewTabProps {
  result: ProcessResult;
}

export function OverviewTab({ result }: OverviewTabProps) {
  const { summary, flagged_data, anomaly_summary, cleaned_data, quality_report } = result;

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 20 }}>

      {/* ── Row 1: Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Rows Processed", value: summary.total_rows.toLocaleString(), hint: `of ${quality_report.total_input_rows.toLocaleString()} input`, tone: "var(--info)" },
          { label: "Stations", value: String(summary.total_stations), hint: `${quality_report.stations_excluded} excluded`, tone: "var(--text-muted)" },
          { label: "Anomalies", value: summary.total_anomalies.toLocaleString(), hint: `${summary.anomaly_rate}% of readings`, tone: summary.total_anomalies > 0 ? "var(--danger)" : "var(--success)" },
          { label: "Stations Flagged", value: String(summary.anomalous_stations), hint: `${summary.processing_time_seconds.toFixed(1)}s pipeline runtime`, tone: summary.anomalous_stations > 0 ? "var(--warning)" : "var(--success)" },
        ].map(({ label, value, hint, tone }) => (
          <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, flexShrink: 0 }} />
              <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-secondary)" }}>{label}</span>
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
          <StationMap stations={stationPoints} height={400} />
        </div>
      </div>

      {/* ── Row 3: Date range + Parameters ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        {/* Date range */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Clock size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Date Range</span>
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
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Contamination", value: summary.contamination },
              { label: "Spatial neighbors", value: 3 },
              { label: "Rows excluded", value: quality_report.rows_excluded.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--font-sm)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--text)", fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: Quality report ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "16px 20px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <AlertTriangle size={14} strokeWidth={2.2} style={{ color: "var(--warning)" }} />
          <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Quality Report</span>
        </div>
        <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--text-secondary)", lineHeight: 1.6, fontFamily: "var(--font-mono)" }}>
          {quality_report.summary_text || "No exclusions."}
        </p>
        {anomaly_summary.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-secondary)", flexShrink: 0 }}>Top flagged stations:</span>
            {anomaly_summary.slice(0, 8).map((s) => (
              <span key={s.station_id} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px", borderRadius: "var(--r-full)",
                background: "var(--danger-soft)", color: "var(--danger)",
                fontSize: "var(--font-xs)", fontWeight: 500,
              }}>
                <span style={{ fontFamily: "var(--font-mono)" }}>{s.station_id}</span>
                <span style={{ opacity: 0.7, fontFamily: "var(--font-mono)" }}>×{s.anomaly_count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
