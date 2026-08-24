"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Gauge, HelpCircle, MapPin, Plus, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StationChart, type NeighborSeries } from "./StationChart";
import { DateComparisonChart, type DateComparisonBar } from "./DateComparisonChart";
import type { ProcessResult, StationHealth } from "@/types/zones";

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

interface AnomalyReportTabProps {
  result: ProcessResult;
  onCreateTicket?: (stationId: string) => void;
}

export function AnomalyReportTab({ result, onCreateTicket }: AnomalyReportTabProps) {
  const [selectedId, setSelectedId] = useState<string>(
    result.anomaly_summary[0]?.station_id ?? "",
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

  const healthById = useMemo(() => {
    const m = new Map<string, StationHealth>();
    for (const h of result.station_health ?? []) m.set(h.station_id, h);
    return m;
  }, [result.station_health]);

  const selectedHealth = selectedId ? healthById.get(selectedId) ?? null : null;

  const selectedStation = result.anomaly_summary.find((s) => s.station_id === selectedId) ?? null;
  const selectedTimeseries = selectedId ? (flaggedByStation.get(selectedId) ?? []) : [];

  // The station's worst (highest-rainfall) anomaly date — the default comparison.
  const topAnomalyDate = useMemo(() => {
    if (!selectedStation || selectedStation.events.length === 0) return "";
    return [...selectedStation.events].sort((a, b) => b.rainfall - a.rainfall)[0].date;
  }, [selectedStation]);

  // Keep selectedDate valid: when the station changes (or the current date isn't one
  // of its flagged anomalies), snap to that station's worst anomaly.
  useEffect(() => {
    const valid = selectedStation?.events.some((e) => e.date === selectedDate);
    if (!valid) setSelectedDate(topAnomalyDate);
  }, [selectedStation, topAnomalyDate, selectedDate]);

  if (result.anomaly_summary.length === 0) {
    return (
      <div style={{ paddingTop: 24 }}>
        <div style={{ background: "var(--success-soft)", border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)", borderRadius: "var(--r-xl)", padding: 24, display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ height: 40, width: 40, borderRadius: "var(--r-lg)", background: "color-mix(in oklab, var(--success) 20%, transparent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AlertTriangle size={18} strokeWidth={2.4} style={{ color: "var(--success)" }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>No anomalies detected.</h3>
            <p style={{ margin: "4px 0 0", fontSize: "var(--font-sm)", color: "var(--text-secondary)" }}>
              All processed readings fell within the fixed LOF threshold (score &gt; -1.5). No readings with strong local deviation were found.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const chartData = selectedTimeseries.map((row) => ({
    date: row.date,
    rainfall: row.rainfall,
    is_anomaly: row.is_anomaly,
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

  // Bars for the selected date: this station + its neighbors, side by side.
  const comparisonBars: DateComparisonBar[] = useMemo(() => {
    if (!selectedId || !selectedDate) return [];
    const anomalyDates = new Set((selectedStation?.events ?? []).map((e) => e.date));
    const selfRain = rainByStationDate.get(selectedId)?.[selectedDate] ?? null;
    const bars: DateComparisonBar[] = [
      {
        stationId: selectedId,
        rainfall: selfRain,
        isSelected: true,
        isAnomaly: anomalyDates.has(selectedDate),
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
  }, [selectedId, selectedDate, selectedStation, result.neighbors, rainByStationDate]);

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

      {/* Header strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {result.anomaly_summary.length} anomalous station{result.anomaly_summary.length === 1 ? "" : "s"}
          {" · "}
          {result.summary.total_anomalies} total events
        </p>
        <p style={{ margin: 0, fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>
          Sorted by anomaly count
        </p>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, minHeight: 520 }}>

        {/* ── Left: station list ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 520 }}>
          {result.anomaly_summary.map((station) => {
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
          })}
        </div>

        {/* ── Right: detail panel ── */}
        {selectedStation ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>

            {/* Detail header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ height: 32, width: 32, borderRadius: "var(--r-md)", background: "var(--danger-soft)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <AlertTriangle size={14} strokeWidth={2.4} style={{ color: "var(--danger)" }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "var(--font-base)", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                    {selectedStation.station_id}
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={10} strokeWidth={2.2} />
                    <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                      {selectedStation.latitude.toFixed(4)}, {selectedStation.longitude.toFixed(4)}
                    </span>
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "4px 10px", borderRadius: "var(--r-full)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  {selectedStation.anomaly_count} events
                </span>
                {onCreateTicket && (
                  <Button size="sm" onClick={() => onCreateTicket(selectedStation.station_id)}>
                    <Plus size={13} strokeWidth={2.4} />
                    Create Ticket
                  </Button>
                )}
              </div>
            </div>

            {/* Station health banner — plain-English triage: one weird day vs. every rain day */}
            {selectedHealth && (
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
            )}

            {/* KV metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--border)" }}>
              {[
                { label: "Anomaly events", value: String(selectedStation.anomaly_count) },
                { label: "Avg anomaly rain", value: `${avgAnomalyRainfall.toFixed(1)} mm` },
                { label: "Station avg rain", value: `${avgRainfall.toFixed(1)} mm` },
                { label: "Peak LOF score", value: maxLof.toFixed(2) },
              ].map(({ label, value }, i) => (
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
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", flexShrink: 0 }} />
                  anomaly
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

            {/* Flagged dates — clickable; drives the comparison above */}
            <div style={{ padding: "8px 20px 20px", flex: 1 }}>
              <p style={{ margin: "0 0 8px", fontSize: "var(--font-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                Flagged dates
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                {selectedStation.events.map((event, i) => {
                  const active = event.date === selectedDate;
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
                        background: active ? "color-mix(in oklab, var(--danger) 16%, var(--surface))" : "var(--danger-soft)",
                        border: active
                          ? "1px solid var(--danger)"
                          : "1px solid color-mix(in oklab, var(--danger) 12%, transparent)",
                        transition: "background .12s, border-color .12s",
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: active ? "var(--danger)" : "transparent", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text)", fontWeight: active ? 600 : 400 }}>
                        {event.date}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--danger)", fontWeight: 500 }}>
                        {event.rainfall.toFixed(1)} mm
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>
                        LOF {event.lof_score.toFixed(2)}
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
