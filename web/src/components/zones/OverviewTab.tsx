"use client";

import { useMemo } from "react";
import { Download, Clock, Database, AlertTriangle, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import type { ProcessResult } from "@/types/zones";
import { Stat } from "@/components/ui/Stat";
import { Button } from "@/components/ui/Button";
import { downloadCsv } from "@/lib/csv";

const StationMap = dynamic(() => import("./StationMap").then((m) => m.StationMap), {
  ssr: false,
  loading: () => (
    <div
      style={{ height: 480 }}
      className="rounded-xl bg-surface-sunken border border-border grid place-items-center"
    >
      <p className="text-[12px] text-text-tertiary font-mono tabular">Loading map…</p>
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
      const t = totals.get(row.station_id) ?? {
        lat: row.latitude,
        lon: row.longitude,
        readings: 0,
        anomalies: 0,
      };
      t.readings += 1;
      if (row.is_anomaly) t.anomalies += 1;
      totals.set(row.station_id, t);
    }
    return Array.from(totals, ([station_id, v]) => ({
      station_id,
      latitude: v.lat,
      longitude: v.lon,
      total_readings: v.readings,
      anomaly_count: v.anomalies,
    }));
  }, [flagged_data]);

  return (
    <div className="space-y-6 pt-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger">
        <Stat
          label="Rows Processed"
          value={summary.total_rows.toLocaleString()}
          hint={`from ${quality_report.total_input_rows.toLocaleString()} input rows`}
          tone="info"
        />
        <Stat
          label="Stations"
          value={summary.total_stations}
          hint={`${quality_report.stations_excluded} excluded`}
          tone="neutral"
        />
        <Stat
          label="Anomalies"
          value={summary.total_anomalies.toLocaleString()}
          hint={`${summary.anomaly_rate}% of readings`}
          tone={summary.total_anomalies > 0 ? "danger" : "success"}
        />
        <Stat
          label="Stations Flagged"
          value={summary.anomalous_stations}
          hint={`${summary.processing_time_seconds.toFixed(2)}s pipeline runtime`}
          tone={summary.anomalous_stations > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="bg-surface border border-border rounded-xl overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-text-secondary" strokeWidth={2.2} />
              <h3 className="text-[13px] font-semibold text-text">Station Map</h3>
              <span className="text-[11px] text-text-tertiary">·</span>
              <span className="text-[11px] text-text-secondary font-mono tabular">
                {stationPoints.length} stations
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" />
                Normal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-danger" />
                Anomalous
              </span>
            </div>
          </div>
          <div className="p-4">
            <StationMap stations={stationPoints} height={460} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-text-secondary" strokeWidth={2.2} />
              <h3 className="text-[13px] font-semibold text-text">Date Range</h3>
            </div>
            <p className="font-mono tabular text-[14px] text-text">
              {summary.date_range_start ?? "—"}
            </p>
            <p className="text-[11px] text-text-tertiary mt-0.5">to</p>
            <p className="font-mono tabular text-[14px] text-text">
              {summary.date_range_end ?? "—"}
            </p>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Database size={14} className="text-text-secondary" strokeWidth={2.2} />
              <h3 className="text-[13px] font-semibold text-text">Pipeline Parameters</h3>
            </div>
            <dl className="space-y-2 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Contamination</dt>
                <dd className="font-mono tabular text-text">{summary.contamination}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Spatial neighbors</dt>
                <dd className="font-mono tabular text-text">3</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Rows excluded</dt>
                <dd className="font-mono tabular text-text">
                  {quality_report.rows_excluded.toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Download size={14} className="text-text-secondary" strokeWidth={2.2} />
              <h3 className="text-[13px] font-semibold text-text">Exports</h3>
            </div>
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-between"
                onClick={() =>
                  downloadCsv(
                    "cleaned_data.csv",
                    cleaned_data as unknown as Record<string, unknown>[],
                  )
                }
              >
                Cleaned Data
                <span className="font-mono tabular text-[11px] text-text-tertiary">
                  {cleaned_data.length}
                </span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-between"
                onClick={() =>
                  downloadCsv(
                    "flagged_data.csv",
                    flagged_data as unknown as Record<string, unknown>[],
                  )
                }
              >
                Flagged Data
                <span className="font-mono tabular text-[11px] text-text-tertiary">
                  {flagged_data.length}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-warning" strokeWidth={2.2} />
          <h3 className="text-[13px] font-semibold text-text">Quality Report</h3>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed font-mono tabular">
          {quality_report.summary_text || "No exclusions."}
        </p>

        {anomaly_summary.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary mb-2">
              Top anomalous stations
            </p>
            <div className="flex flex-wrap gap-2">
              {anomaly_summary.slice(0, 8).map((s) => (
                <span
                  key={s.station_id}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-danger-soft text-danger text-[12px] font-medium"
                >
                  <span className="font-mono tabular">{s.station_id}</span>
                  <span className="font-mono tabular text-[11px] opacity-80">×{s.anomaly_count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
