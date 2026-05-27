"use client";

import { useMemo, useState } from "react";
import { ChevronDown, AlertTriangle, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { StationChart } from "./StationChart";
import type { ProcessResult, StationAnomalySummary } from "@/types/zones";

interface AnomalyReportTabProps {
  result: ProcessResult;
  onCreateTicket?: (stationId: string) => void;
}

export function AnomalyReportTab({ result, onCreateTicket }: AnomalyReportTabProps) {
  const [openId, setOpenId] = useState<string | null>(
    result.anomaly_summary[0]?.station_id ?? null,
  );

  const flaggedByStation = useMemo(() => {
    const map = new Map<string, ProcessResult["flagged_data"]>();
    for (const row of result.flagged_data) {
      const arr = map.get(row.station_id) ?? [];
      arr.push(row);
      map.set(row.station_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    return map;
  }, [result.flagged_data]);

  if (result.anomaly_summary.length === 0) {
    return (
      <div className="pt-6">
        <div className="bg-success-soft border border-success/30 rounded-xl p-6 flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-success/20 grid place-items-center shrink-0">
            <AlertTriangle size={18} className="text-success" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="font-semibold text-text">No anomalies detected.</h3>
            <p className="text-[13px] text-text-secondary mt-1">
              All processed readings fell within the local outlier threshold ({result.summary.contamination}).
              Try a higher contamination value to surface borderline outliers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-text-secondary font-mono tabular">
          {result.anomaly_summary.length} anomalous station{result.anomaly_summary.length === 1 ? "" : "s"}
          {" · "}
          {result.summary.total_anomalies} total events
        </p>
        <p className="text-[12px] text-text-tertiary">
          Sorted by anomaly count (desc)
        </p>
      </div>

      <div className="space-y-3">
        {result.anomaly_summary.map((station) => (
          <AnomalyAccordion
            key={station.station_id}
            station={station}
            timeseries={flaggedByStation.get(station.station_id) ?? []}
            open={openId === station.station_id}
            onToggle={() =>
              setOpenId((cur) => (cur === station.station_id ? null : station.station_id))
            }
            onCreateTicket={onCreateTicket}
          />
        ))}
      </div>
    </div>
  );
}

function AnomalyAccordion({
  station,
  timeseries,
  open,
  onToggle,
  onCreateTicket,
}: {
  station: StationAnomalySummary;
  timeseries: ProcessResult["flagged_data"];
  open: boolean;
  onToggle: () => void;
  onCreateTicket?: (stationId: string) => void;
}) {
  const chartData = useMemo(
    () =>
      timeseries.map((row) => ({
        date: row.date,
        rainfall: row.rainfall,
        is_anomaly: row.is_anomaly,
      })),
    [timeseries],
  );

  return (
    <div
      className="bg-surface border border-border rounded-xl overflow-hidden"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-muted transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-danger-soft grid place-items-center shrink-0">
            <AlertTriangle size={14} className="text-danger" strokeWidth={2.4} />
          </div>
          <div className="text-left">
            <p className="font-mono tabular text-[14px] font-semibold text-text">
              {station.station_id}
            </p>
            <p className="text-[11px] text-text-secondary flex items-center gap-1 mt-0.5">
              <MapPin size={10} strokeWidth={2.2} />
              <span className="font-mono tabular">
                {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-mono tabular text-[18px] font-semibold text-danger leading-none">
              {station.anomaly_count}
            </p>
            <p className="text-[10px] text-text-tertiary uppercase tracking-[0.06em] mt-1">
              events
            </p>
          </div>
          <ChevronDown
            size={16}
            strokeWidth={2.2}
            className={cn(
              "text-text-tertiary transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-border animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 mt-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary mb-2">
                Rainfall timeseries
              </p>
              <StationChart data={chartData} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary mb-2">
                Anomaly events
              </p>
              <ol className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {station.events.map((event, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-danger-soft border border-danger/15"
                  >
                    <span className="font-mono tabular text-[12px] text-text">
                      {event.date}
                    </span>
                    <span className="font-mono tabular text-[12px] text-danger font-medium">
                      {event.rainfall.toFixed(1)} mm
                    </span>
                    <span className="font-mono tabular text-[11px] text-text-secondary">
                      LOF {event.lof_score.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          {onCreateTicket && (
            <div className="mt-5 flex justify-end border-t border-border pt-4">
              <Button size="sm" onClick={() => onCreateTicket(station.station_id)}>
                <Plus size={13} strokeWidth={2.4} />
                Create Ticket
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
