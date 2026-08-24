"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Gauge, HelpCircle, MapPin, Plus, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StationChart, type NeighborSeries } from "./StationChart";
import { DateComparisonChart, type DateComparisonBar } from "./DateComparisonChart";
import type { ProcessResult, StationHealth, StationStuckHealth } from "@/types/zones";

// ── Health helpers — consistent with globals.css tokens & Badge tones ─────
function healthTone(status: StationHealth["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "suspect") return "danger";
  if (status === "watch") return "warning";
  if (status === "normal") return "success";
  return "neutral";
}
function healthLabel(h: StationHealth): string {
  if (h.status === "insufficient_data") return `Not enough data · ${h.rain_days} rain days`;
  if (h.status === "normal") return `Normal · ${h.bias_ratio!.toFixed(2)}×`;
  if (h.status === "watch") return `Watch · ${h.bias_ratio!.toFixed(2)}×`;
  return `Suspect · ${h.bias_ratio!.toFixed(2)}×`;
}
function healthTooltip(h: StationHealth): string {
  if (h.status === "insufficient_data") return `Only ${h.rain_days} rain days where its group median was ≥10 mm — not enough history to judge. More data will grade this station.`;
  const pct = h.top_rate != null ? `${Math.round(h.top_rate * 100)}%` : "—";
  return `Reads ${h.bias_ratio!.toFixed(2)}× its group median on ${h.rain_days} rain days · top on ${pct} of them · flagged ${h.times_flagged}×. Ratio >1.50 or top >60% → suspect; >1.15 → watch.`;
}

// ── Stuck-at-zero helpers — teal for low side, symmetric to health ─────
function stuckTone(status: StationStuckHealth["status"]): "success" | "warning" | "danger" | "neutral" | "teal" {
  if (status === "suspect") return "danger";
  if (status === "watch") return "warning";
  if (status === "normal") return "teal";
  return "neutral";
}
function stuckTooltip(h: StationStuckHealth): string {
  if (h.status === "insufficient_data") return `Only ${h.rain_days} rainy days where the area's middle neighbor got ≥10 mm — not enough history to judge.`;
  const pct = h.zero_rate != null ? `${Math.round(h.zero_rate * 100)}%` : "—";
  return `Stuck at ≤1 mm on ${pct} of ${h.rain_days} rainy days · longest streak ${h.max_zero_streak ?? 0} · bias ${h.bias_ratio != null ? `${h.bias_ratio.toFixed(2)}×` : "—"}. >60% + streak ≥5 → suspect; >30% or streak ≥3 → watch.`;
}

interface AnomalyReportTabProps {
  result: ProcessResult;
  onCreateTicket?: (stationId: string) => void;
}

export function AnomalyReportTab({ result, onCreateTicket }: AnomalyReportTabProps) {
  const [mode, setMode] = useState<"high" | "low">("high");
  const [selectedId, setSelectedId] = useState<string>(
    result.anomaly_summary[0]?.station_id ?? result.dry_stuck_summary[0]?.station_id ?? "",
  );
  const [compareNeighbors, setCompareNeighbors] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");

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

  // Rainfall keyed by date, per station — used to align neighbor lines to the
  // selected station's date axis without re-scanning flagged_data each render.
  const rainByStationDate = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const row of result.flagged_data) {
      const byDate = map.get(row.station_id) ?? {};
      byDate[row.date] = row.rainfall;
      map.set(row.station_id, byDate);
    }
    return map;
  }, [result.flagged_data]);

  const maxAnomalies = useMemo(
    () => Math.max(1, ...result.anomaly_summary.map((s) => s.anomaly_count)),
    [result.anomaly_summary],
  );

  const maxDryStuck = useMemo(
    () => Math.max(1, ...(result.dry_stuck_summary ?? []).map((s) => s.stuck_count)),
    [result.dry_stuck_summary],
  );

  const healthById = useMemo(() => {
    const m = new Map<string, StationHealth>();
    for (const h of result.station_health ?? []) m.set(h.station_id, h);
    return m;
  }, [result.station_health]);

  const stuckById = useMemo(() => {
    const m = new Map<string, StationStuckHealth>();
    for (const h of result.station_stuck_health ?? []) m.set(h.station_id, h);
    return m;
  }, [result.station_stuck_health]);

  const selectedHealth = selectedId ? healthById.get(selectedId) ?? null : null;
  const selectedStuck = selectedId ? stuckById.get(selectedId) ?? null : null;

  // Keep selectedId valid when switching modes
  useEffect(() => {
    const list = mode === "high" ? result.anomaly_summary : (result.dry_stuck_summary ?? []);
    if (list.length > 0 && !list.some((s) => s.station_id === selectedId)) {
      setSelectedId(list[0].station_id);
    }
  }, [mode, result.anomaly_summary, result.dry_stuck_summary, selectedId]);

  const selectedStation = result.anomaly_summary.find((s) => s.station_id === selectedId) ?? null;
  const selectedDryStation = (result.dry_stuck_summary ?? []).find((s) => s.station_id === selectedId) ?? null;

  const selectedTimeseries = selectedId ? (flaggedByStation.get(selectedId) ?? []) : [];

  // The station's worst anomaly date — the default comparison (mode-aware).
  const topAnomalyDate = useMemo(() => {
    if (!selectedStation || selectedStation.events.length === 0) return "";
    return [...selectedStation.events].sort((a, b) => b.rainfall - a.rainfall)[0].date;
  }, [selectedStation]);

  const topDryDate = useMemo(() => {
    if (!selectedDryStation || selectedDryStation.events.length === 0) return "";
    return [...selectedDryStation.events].sort((a, b) => (a.group_median - a.rainfall) - (b.group_median - b.rainfall))[0].date;
  }, [selectedDryStation]);

  const topDateForMode = mode === "high" ? topAnomalyDate : topDryDate;

  // Keep selectedDate valid: when the station changes (or the current date isn't one
  // of its flagged anomalies for the active mode), snap to that mode's top date.
  useEffect(() => {
    const list = mode === "high" ? selectedStation?.events : selectedDryStation?.events;
    const valid = list?.some((e) => e.date === selectedDate);
    if (!valid) setSelectedDate(topDateForMode);
  }, [mode, selectedStation, selectedDryStation, topDateForMode, selectedDate]);

  const hasHigh = result.anomaly_summary.length > 0;
  const hasLow = (result.dry_stuck_summary ?? []).length > 0;
  if (!hasHigh && !hasLow) {
    return (
      <div style={{ paddingTop: 24 }}>
        <div style={{ background: "var(--success-soft)", border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)", borderRadius: "var(--r-xl)", padding: 24, display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ height: 40, width: 40, borderRadius: "var(--r-lg)", background: "color-mix(in oklab, var(--success) 20%, transparent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AlertTriangle size={18} strokeWidth={2.4} style={{ color: "var(--success)" }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>No anomalies detected.</h3>
            <p style={{ margin: "4px 0 0", fontSize: "var(--font-sm)", color: "var(--text-secondary)" }}>
              All processed readings fell within the fixed LOF threshold and no gauge was stuck at zero. Nothing to review.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const chartData = selectedTimeseries.map((row) => ({
    date: row.date,
    rainfall: row.rainfall,
    is_anomaly: mode === "high" ? row.is_anomaly : !!row.is_dry_stuck,
  }));

  // Neighbor lines for the selected station (from Zone B's neighbor map),
  // each as a date→rainfall lookup aligned to the chart's date axis.
  const neighborSeries: NeighborSeries[] = useMemo(() => {
    if (!selectedId) return [];
    const ids = (result.neighbors[selectedId] ?? []).map((n) => n.neighbor_id);
    return ids
      .map((id) => ({ stationId: id, byDate: rainByStationDate.get(id) ?? {} }))
      .filter((s) => Object.keys(s.byDate).length > 0);
  }, [selectedId, result.neighbors, rainByStationDate]);

  const hasNeighborData = neighborSeries.length > 0;

  // Bars for the selected date: this station + its neighbors, side by side — mode-aware.
  const comparisonBars: DateComparisonBar[] = useMemo(() => {
    if (!selectedId || !selectedDate) return [];
    const isHigh = mode === "high";
    const events = isHigh ? selectedStation?.events : selectedDryStation?.events as unknown as { date: string }[] | undefined;
    const flaggedDates = new Set((events ?? []).map((e) => e.date));
    const selfRain = rainByStationDate.get(selectedId)?.[selectedDate] ?? null;
    const bars: DateComparisonBar[] = [
      {
        stationId: selectedId,
        rainfall: selfRain,
        isSelected: true,
        isAnomaly: flaggedDates.has(selectedDate),
      },
    ];
    for (const n of result.neighbors[selectedId] ?? []) {
      bars.push({
        stationId: n.neighbor_id,
        rainfall: rainByStationDate.get(n.neighbor_id)?.[selectedDate] ?? null,
        isSelected: false,
        isAnomaly: false,
      });
    }
    return bars;
  }, [selectedId, selectedDate, selectedStation, selectedDryStation, mode, result.neighbors, rainByStationDate]);

  const allRainfalls = selectedTimeseries.map((r) => r.rainfall);
  const avgRainfall = allRainfalls.length > 0
    ? allRainfalls.reduce((a, b) => a + b, 0) / allRainfalls.length
    : 0;

  const anomalyRainfalls = selectedStation?.events.map((e) => e.rainfall) ?? [];
  const avgAnomalyRainfall = anomalyRainfalls.length > 0
    ? anomalyRainfalls.reduce((a, b) => a + b, 0) / anomalyRainfalls.length
    : 0;

  const maxLof = selectedStation?.events.length
    ? Math.max(...selectedStation.events.map((e) => e.lof_score))
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingTop: 20 }}>

      {/* Mode toggle — high (LOF) vs low (stuck at zero) — symmetric, not biased */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setMode("high")}
          aria-pressed={mode === "high"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: "var(--r-full)", cursor: "pointer",
            fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
            border: `1px solid ${mode === "high" ? "var(--danger)" : "var(--border)"}`,
            background: mode === "high" ? "var(--danger-soft)" : "var(--surface)",
            color: mode === "high" ? "var(--danger)" : "var(--text-secondary)",
            transition: "background .12s, border-color .12s, color .12s",
          }}
        >
          <AlertTriangle size={12} strokeWidth={2.4} />
          High anomalies
          <span style={{ background: mode === "high" ? "var(--surface)" : "var(--surface-sunken)", padding: "1px 6px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
            {result.anomaly_summary.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("low")}
          aria-pressed={mode === "low"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: "var(--r-full)", cursor: "pointer",
            fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
            border: `1px solid ${mode === "low" ? "var(--teal)" : "var(--border)"}`,
            background: mode === "low" ? "var(--teal-soft)" : "var(--surface)",
            color: mode === "low" ? "var(--teal-on)" : "var(--text-secondary)",
            transition: "background .12s, border-color .12s, color .12s",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: mode === "low" ? "var(--teal)" : "var(--text-tertiary)", flexShrink: 0 }} />
          Stuck at Zero
          <span style={{ background: mode === "low" ? "var(--surface)" : "var(--surface-sunken)", padding: "1px 6px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }}>
            {(result.dry_stuck_summary ?? []).length}
          </span>
        </button>
        <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>
          {mode === "high" ? "Sorted by high count" : "Sorted by stuck count"}
        </span>
      </div>

      {/* Header strip — counts for active mode */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {mode === "high"
            ? `${result.anomaly_summary.length} high station${result.anomaly_summary.length === 1 ? "" : "s"} · ${result.summary.total_anomalies} events`
            : `${(result.dry_stuck_summary ?? []).length} stuck station${(result.dry_stuck_summary ?? []).length === 1 ? "" : "s"} · ${(result.dry_stuck_summary ?? []).reduce((a, s) => a + s.stuck_count, 0)} events`}
        </p>
        <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>
          {mode === "high" ? "High = notably above neighbors" : "Stuck = 0 while neighbors rained"}
        </p>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, minHeight: 520 }}>

        {/* ── Left: station list ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 520 }}>
          {mode === "high" ? (
            result.anomaly_summary.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--font-sm)", lineHeight: 1.5 }}>
                No high anomalies in this run.<br />
                <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-xs)" }}>Try the <b style={{ color: "var(--teal)" }}>Stuck at Zero</b> tab for low-side checks.</span>
              </div>
            ) : (
              result.anomaly_summary.map((station) => {
                const selected = station.station_id === selectedId;
                const barPct = (station.anomaly_count / maxAnomalies) * 100;
                const h = healthById.get(station.station_id) ?? null;
                return (
                  <button
                    key={station.station_id}
                    type="button"
                    onClick={() => setSelectedId(station.station_id)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 8,
                      padding: "12px 14px",
                      borderRadius: "var(--r-lg)",
                      border: selected ? "1px solid color-mix(in oklab, var(--danger) 40%, transparent)" : "1px solid transparent",
                      background: selected ? "var(--danger-soft)" : "transparent",
                      cursor: "pointer", textAlign: "left",
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--surface-muted)";
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-sm)", fontWeight: 600, color: selected ? "var(--danger)" : "var(--text)", lineHeight: 1 }}>
                        {station.station_id}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", fontWeight: 600, color: selected ? "var(--danger)" : "var(--text-secondary)" }}>
                        {station.anomaly_count}×
                      </span>
                    </div>
                    {/* Score bar */}
                    <div style={{ height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${barPct}%`, background: selected ? "var(--danger)" : "color-mix(in oklab, var(--danger) 55%, transparent)", borderRadius: 99, transition: "width 0.3s ease" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={10} strokeWidth={2.2} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {station.latitude.toFixed(3)}, {station.longitude.toFixed(3)}
                      </span>
                    </div>
                    {h && (
                      <span title={healthTooltip(h)} style={{ display: "inline-flex" }}>
                        <Badge tone={healthTone(h.status)} dot={h.status === "suspect"} style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                          {h.status === "suspect" ? "Suspect" : h.status === "watch" ? "Watch" : h.status === "normal" ? "Normal" : "Not enough data"}
                          {h.bias_ratio != null ? ` · ${h.bias_ratio.toFixed(2)}×` : ` · ${h.rain_days} days`}
                        </Badge>
                      </span>
                    )}
                  </button>
                );
              })
            )
          ) : (
            (result.dry_stuck_summary ?? []).length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--font-sm)", lineHeight: 1.5 }}>
                No stuck-at-zero gauges in this run.<br />
                <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-xs)" }}>Gauges responded on rainy days.</span>
              </div>
            ) : (
              (result.dry_stuck_summary ?? []).map((station) => {
                const selected = station.station_id === selectedId;
                const barPct = (station.stuck_count / maxDryStuck) * 100;
                const s = stuckById.get(station.station_id) ?? null;
                return (
                  <button
                    key={station.station_id}
                    type="button"
                    onClick={() => setSelectedId(station.station_id)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 8,
                      padding: "12px 14px",
                      borderRadius: "var(--r-lg)",
                      border: selected ? "1px solid color-mix(in oklab, var(--teal) 40%, transparent)" : "1px solid transparent",
                      background: selected ? "var(--teal-soft)" : "transparent",
                      cursor: "pointer", textAlign: "left",
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--surface-muted)";
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-sm)", fontWeight: 600, color: selected ? "var(--teal)" : "var(--text)", lineHeight: 1 }}>
                        {station.station_id}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", fontWeight: 600, color: selected ? "var(--teal)" : "var(--text-secondary)" }}>
                        {station.stuck_count}×
                      </span>
                    </div>
                    {/* Score bar — teal for low side */}
                    <div style={{ height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${barPct}%`, background: selected ? "var(--teal)" : "color-mix(in oklab, var(--teal) 55%, transparent)", borderRadius: 99, transition: "width 0.3s ease" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={10} strokeWidth={2.2} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {station.latitude.toFixed(3)}, {station.longitude.toFixed(3)}
                      </span>
                    </div>
                    {s && (
                      <span title={stuckTooltip(s)} style={{ display: "inline-flex" }}>
                        <Badge tone={stuckTone(s.status)} dot={s.status === "suspect"} style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                          {s.status === "suspect" ? "Suspect" : s.status === "watch" ? "Watch" : s.status === "normal" ? "Normal" : "Not enough data"}
                          {s.zero_rate != null ? ` · ${Math.round(s.zero_rate * 100)}% at 0` : ` · ${s.rain_days} days`}
                        </Badge>
                      </span>
                    )}
                  </button>
                );
              })
            )
          )}
        </div>

        {/* ── Right: detail panel ── */}
        {(mode === "high" ? selectedStation : selectedDryStation) ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>

            {/* Detail header — mode-aware */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ height: 32, width: 32, borderRadius: "var(--r-md)", background: mode === "high" ? "var(--danger-soft)" : "var(--teal-soft)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <AlertTriangle size={14} strokeWidth={2.4} style={{ color: mode === "high" ? "var(--danger)" : "var(--teal)" }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "var(--font-base)", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                    {(mode === "high" ? selectedStation : selectedDryStation)!.station_id}
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={10} strokeWidth={2.2} />
                    <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                      {(mode === "high" ? selectedStation! : selectedDryStation!).latitude.toFixed(4)}, {(mode === "high" ? selectedStation! : selectedDryStation!).longitude.toFixed(4)}
                    </span>
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "4px 10px", borderRadius: "var(--r-full)", background: mode === "high" ? "var(--danger-soft)" : "var(--teal-soft)", color: mode === "high" ? "var(--danger)" : "var(--teal)", fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  {mode === "high" ? `${selectedStation!.anomaly_count} events` : `${selectedDryStation!.stuck_count} events`}
                </span>
                {onCreateTicket && (
                  <Button size="sm" onClick={() => onCreateTicket((mode === "high" ? selectedStation! : selectedDryStation!).station_id)}>
                    <Plus size={13} strokeWidth={2.4} />
                    Create Ticket
                  </Button>
                )}
              </div>
            </div>

            {/* Health banner — mode-aware */}
            {mode === "high" ? selectedHealth && (
              <div
                title={healthTooltip(selectedHealth)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  background:
                    selectedHealth.status === "suspect" ? "var(--danger-soft)"
                    : selectedHealth.status === "watch" ? "var(--warning-soft)"
                    : selectedHealth.status === "normal" ? "var(--success-soft)"
                    : "var(--surface-sunken)",
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: "var(--r-md)",
                  background: selectedHealth.status === "suspect" ? "var(--danger)" : selectedHealth.status === "watch" ? "var(--warning)" : selectedHealth.status === "normal" ? "var(--success)" : "var(--text-tertiary)",
                  color: "#fff", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1,
                }}>
                  <Gauge size={13} strokeWidth={2.4} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "var(--font-sm)", fontWeight: 600,
                      color: selectedHealth.status === "suspect" ? "var(--danger-on)" : selectedHealth.status === "watch" ? "var(--warning-on)" : selectedHealth.status === "normal" ? "var(--success-on)" : "var(--text-secondary)",
                    }}>
                      {selectedHealth.status === "suspect" ? "Suspect gauge — reads high every rain day" : selectedHealth.status === "watch" ? "Watch — reads a bit high" : selectedHealth.status === "normal" ? "No systematic bias — likely weather" : "Not enough rain days to judge"}
                    </span>
                    <Badge tone={healthTone(selectedHealth.status)} style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                      {selectedHealth.bias_ratio != null ? `${selectedHealth.bias_ratio.toFixed(2)}× median` : `${selectedHealth.rain_days} rain days`}
                      {selectedHealth.top_rate != null ? ` · top ${Math.round(selectedHealth.top_rate * 100)}%` : ""}
                    </Badge>
                    <span style={{ display: "inline-flex", alignItems: "center", color: "var(--text-tertiary)" }} title={healthTooltip(selectedHealth)}>
                      <HelpCircle size={12} strokeWidth={2} style={{ cursor: "help" }} />
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {selectedHealth.status === "suspect"
                      ? `Reads ${selectedHealth.bias_ratio!.toFixed(2)}× its group median on ${selectedHealth.rain_days} rain days, highest on ${selectedHealth.top_rate != null ? Math.round(selectedHealth.top_rate * 100) : "—"}% of them. Recommend calibration / exposure check — not a one-off storm.`
                      : selectedHealth.status === "watch"
                      ? `Reads ${selectedHealth.bias_ratio!.toFixed(2)}× median on ${selectedHealth.rain_days} rain days. Keep an eye on it — not yet a clear gauge fault.`
                      : selectedHealth.status === "normal"
                      ? `Normal on ${selectedHealth.rain_days} rain days — this flag looks like a localized weather event rather than a gauge issue.`
                      : `Only ${selectedHealth.rain_days} rain days with group median ≥10 mm. Grade will appear after more rainy data is collected.`}
                  </p>
                </div>
              </div>
            ) : selectedStuck && (
              <div
                title={stuckTooltip(selectedStuck)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  background:
                    selectedStuck.status === "suspect" ? "var(--danger-soft)"
                    : selectedStuck.status === "watch" ? "var(--warning-soft)"
                    : selectedStuck.status === "normal" ? "var(--teal-soft)"
                    : "var(--surface-sunken)",
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: "var(--r-md)",
                  background: selectedStuck.status === "suspect" ? "var(--danger)" : selectedStuck.status === "watch" ? "var(--warning)" : selectedStuck.status === "normal" ? "var(--teal)" : "var(--text-tertiary)",
                  color: "#fff", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1,
                }}>
                  <Gauge size={13} strokeWidth={2.4} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "var(--font-sm)", fontWeight: 600,
                      color: selectedStuck.status === "suspect" ? "var(--danger-on)" : selectedStuck.status === "watch" ? "var(--warning-on)" : selectedStuck.status === "normal" ? "var(--teal-on)" : "var(--text-secondary)",
                    }}>
                      {selectedStuck.status === "suspect" ? "Suspect — stuck at zero" : selectedStuck.status === "watch" ? "Watch — often at zero" : selectedStuck.status === "normal" ? "Responds on rainy days" : "Not enough rainy days to judge"}
                    </span>
                    <Badge tone={stuckTone(selectedStuck.status)} style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                      {selectedStuck.zero_rate != null ? `${Math.round(selectedStuck.zero_rate * 100)}% at 0` : `${selectedStuck.rain_days} rainy days`}
                      {selectedStuck.max_zero_streak != null ? ` · streak ${selectedStuck.max_zero_streak}` : ""}
                    </Badge>
                    <span style={{ display: "inline-flex", alignItems: "center", color: "var(--text-tertiary)" }} title={stuckTooltip(selectedStuck)}>
                      <HelpCircle size={12} strokeWidth={2} style={{ cursor: "help" }} />
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {selectedStuck.status === "suspect"
                      ? `Stuck at ≤1 mm on ${selectedStuck.zero_rate != null ? Math.round(selectedStuck.zero_rate * 100) : "—"}% of ${selectedStuck.rain_days} rainy days (streak ${selectedStuck.max_zero_streak ?? 0}), bias ${selectedStuck.bias_ratio != null ? `${selectedStuck.bias_ratio.toFixed(2)}×` : "—"}. Area was wet while this gauge stayed dry — check power, clog, or wiring.`
                      : selectedStuck.status === "watch"
                      ? `At 0 on ${selectedStuck.zero_rate != null ? Math.round(selectedStuck.zero_rate * 100) : "—"}% of ${selectedStuck.rain_days} rainy days, longest streak ${selectedStuck.max_zero_streak ?? 0}. Keep an eye on it.`
                      : selectedStuck.status === "normal"
                      ? `Normal — responds when the area is wet. No pattern of staying at zero.`
                      : `Only ${selectedStuck.rain_days} rainy days where the middle neighbor got ≥10 mm. More wet days will grade it.`}
                  </p>
                </div>
              </div>
            )}

            {/* KV metrics — mode-aware */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--border)" }}>
              {(mode === "high"
                ? [
                    { label: "Anomaly events", value: String(selectedStation!.anomaly_count) },
                    { label: "Avg anomaly rain", value: `${avgAnomalyRainfall.toFixed(1)} mm` },
                    { label: "Station avg rain", value: `${avgRainfall.toFixed(1)} mm` },
                    { label: "Peak LOF score", value: maxLof.toFixed(2) },
                  ]
                : [
                    { label: "Stuck events", value: String(selectedDryStation!.stuck_count) },
                    { label: "Zero rate", value: selectedStuck?.zero_rate != null ? `${Math.round(selectedStuck.zero_rate * 100)}%` : "—" },
                    { label: "Bias", value: selectedStuck?.bias_ratio != null ? `${selectedStuck.bias_ratio.toFixed(2)}×` : "—" },
                    { label: "Longest streak", value: selectedStuck?.max_zero_streak != null ? `${selectedStuck.max_zero_streak} days` : "—" },
                  ]
              ).map(({ label, value }, i) => (
                <div
                  key={label}
                  style={{
                    padding: "12px 16px",
                    borderRight: i < 3 ? "1px solid var(--border)" : undefined,
                  }}
                >
                  <div style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div style={{ padding: "16px 20px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
                <TrendingUp size={13} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
                <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>Rainfall timeseries</span>
                <span style={{ color: "var(--text-tertiary)" }}>·</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: mode === "high" ? "var(--danger)" : "var(--teal)", flexShrink: 0 }} />
                  {mode === "high" ? "anomaly" : "stuck at zero"}
                </span>

                {/* Compare-to-neighbors toggle — overlays neighbor station lines so a
                    spike can be read against its neighbours (real event vs. lone sensor). */}
                {hasNeighborData && (
                  <button
                    type="button"
                    onClick={() => setCompareNeighbors((v) => !v)}
                    aria-pressed={compareNeighbors}
                    title={compareNeighbors ? "Hide neighbor stations" : "Overlay neighbor stations for comparison"}
                    style={{
                      marginLeft: "auto",
                      display: "inline-flex", alignItems: "center", gap: 6,
                      height: 26, padding: "0 10px",
                      borderRadius: "var(--r-full)",
                      cursor: "pointer",
                      fontSize: "var(--font-xs)", fontWeight: 500, fontFamily: "inherit",
                      border: `1px solid ${compareNeighbors ? "var(--brand)" : "var(--border)"}`,
                      background: compareNeighbors ? "var(--brand-soft)" : "var(--surface)",
                      color: compareNeighbors ? "var(--brand)" : "var(--text-secondary)",
                      transition: "background .12s, border-color .12s, color .12s",
                    }}
                  >
                    <Users size={12} strokeWidth={2.2} />
                    Compare to neighbors
                  </button>
                )}
              </div>
              <StationChart
                data={chartData}
                neighbors={compareNeighbors ? neighborSeries : []}
                height={180}
              />
            </div>

            {/* Per-date neighbor comparison (bar chart) */}
            {comparisonBars.length > 0 && (
              <div style={{ padding: "4px 20px 8px", borderTop: "1px solid var(--divider)", marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "12px 0 4px", flexWrap: "wrap" }}>
                  <BarChart3 size={13} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
                  <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                    Neighbor comparison
                  </span>
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                    {selectedDate}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>
                    Pick a flagged date below to compare
                  </span>
                </div>
                <DateComparisonChart bars={comparisonBars} height={180} />
              </div>
            )}

            {/* Flagged dates — mode-aware */}
            <div style={{ padding: "8px 20px 20px", flex: 1 }}>
              <p style={{ margin: "0 0 8px", fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                {mode === "high" ? "Flagged dates" : "Stuck dates"}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                {(mode === "high" ? selectedStation!.events : (selectedDryStation!.events as any)).map((event: any, i: number) => {
                  const active = event.date === selectedDate;
                  const isHigh = mode === "high";
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedDate(event.date)}
                      aria-pressed={active}
                      style={{
                        display: "grid", gridTemplateColumns: "auto 1fr auto auto",
                        alignItems: "center", gap: 12,
                        padding: "7px 12px",
                        borderRadius: "var(--r-md)",
                        textAlign: "left", cursor: "pointer", width: "100%",
                        fontFamily: "inherit",
                        background: active
                          ? `color-mix(in oklab, var(${isHigh ? "--danger" : "--teal"}) 16%, var(--surface))`
                          : `var(${isHigh ? "--danger-soft" : "--teal-soft"})`,
                        border: active
                          ? `1px solid var(${isHigh ? "--danger" : "--teal"})`
                          : `1px solid color-mix(in oklab, var(${isHigh ? "--danger" : "--teal"}) 12%, transparent)`,
                        transition: "background .12s, border-color .12s",
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: active ? `var(${isHigh ? "--danger" : "--teal"})` : "transparent", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text)", fontWeight: active ? 600 : 400 }}>
                        {event.date}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: `var(${isHigh ? "--danger" : "--teal"})`, fontWeight: 500 }}>
                        {event.rainfall.toFixed(1)} mm
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>
                        {isHigh ? `LOF ${event.lof_score.toFixed(2)}` : `median ${event.group_median?.toFixed(1) ?? "—"} mm`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", display: "grid", placeItems: "center" }}>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--text-tertiary)" }}>Select a station to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
