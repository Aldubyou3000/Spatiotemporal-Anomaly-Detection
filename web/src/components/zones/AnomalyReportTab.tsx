"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Gauge, MapPin, Plus, TrendingUp, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StationChart, type NeighborSeries } from "./StationChart";
import { DateComparisonChart, type DateComparisonBar } from "./DateComparisonChart";
import type { ProcessResult, StationHealth, StationStuckHealth } from "@/types/zones";
import { useTheme } from "@/context/ThemeContext";

// ── Helpers ────────────────────────────────────────────────────────────────
function healthTone(status: StationHealth["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "suspect") return "danger";
  if (status === "watch") return "warning";
  if (status === "normal") return "success";
  return "neutral";
}
function stuckTone(status: StationStuckHealth["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "suspect") return "danger";
  if (status === "watch") return "warning";
  if (status === "normal") return "success";
  return "neutral";
}
function humanHighReason(h: StationHealth | null, fallback?: { peak: number | null; ratio: number | null; peakDate: string | null }): { title: string; detail: string; tip?: string } | null {
  if (!h) return null;
  if (h.status === "insufficient_data") return { title: "Not enough data yet", detail: `Only ${h.rain_days} rainy days so far — need more rain to judge.`, tip: `Only ${h.rain_days} rainy days checked` };
  const pct = h.bias_ratio != null ? Math.round((h.bias_ratio - 1) * 100) : 0;
  const absPct = Math.abs(pct);
  const pctDir = pct > 0 ? "higher" : pct < 0 ? "lower" : "about the same as";
  let _peak = h.peak_rainfall as number | null;
  let _ratio = (h as any).max_ratio as number | null;
  let _peakDate: any = (h as any).peak_date ?? null;
  // Fallback to anomaly_summary peak when health is from stale pipeline (before spike fields)
  if ((_peak == null || _ratio == null) && fallback) {
    if (_peak == null && fallback.peak != null) {
      _peak = fallback.peak;
      _peakDate = fallback.peakDate ?? _peakDate;
    }
    if (_ratio == null && fallback.ratio != null) _ratio = fallback.ratio;
  }
  const isSpike =
    (_peak != null && _peak >= 300) ||
    (_ratio != null && _peak != null && _ratio >= 15 && _peak >= 30) ||
    (_ratio != null && _peak != null && _ratio >= 8 && _peak >= 20) ||
    (_peak != null && _peak >= 150);
  const peak = _peak != null ? _peak.toFixed(1) : null;
  const ratio = _ratio != null ? Number(_ratio).toFixed(1) : null;
  const peakD = _peakDate ?? (h as any).peak_date ?? null;
  const baseTip = `On ${h.rain_days} rainy days checked, this sensor averaged ${pct > 0 ? `about ${absPct}% ${pctDir}` : pct < 0 ? `about ${absPct}% ${pctDir}` : "about the same as"} its neighbors.`;
  const spikeTip = peak ? `Peak flagged day ${peak} mm${peakD ? ` on ${peakD}` : ""}${ratio ? ` (${ratio}× neighbors)` : ""}. Average is ${h.bias_ratio?.toFixed(2) ?? "—"}×.` : baseTip;
  if (h.status === "suspect") {
    if (isSpike && (h.bias_ratio == null || h.bias_ratio <= 1.5)) {
      return { title: "Needs attention — extreme spike", detail: `One flagged day hit ${peak} mm${peakD ? ` on ${peakD}` : ""}${ratio ? ` (${ratio}× neighbors)` : ""}. Not local rain — likely a sensor fault.`, tip: spikeTip };
    }
    if (isSpike) {
      return { title: "Needs attention — reads high + spikes", detail: `About ${absPct}% ${pctDir} on average and hit ${peak} mm${ratio ? ` (${ratio}× neighbors)` : ""}. Needs calibration and site check.`, tip: spikeTip };
    }
    if (pct <= 0) {
      return { title: "Needs attention — check flagged days", detail: `Flagged ${h.times_flagged} days but average is ${absPct}% ${pctDir} — not a high-bias pattern. Review flagged days for isolated spikes.`, tip: baseTip };
    }
    return { title: "Needs attention — reads high", detail: `About ${absPct}% ${pctDir} than nearby stations on rainy days. Likely needs calibration — flagged days may be inflated.`, tip: baseTip };
  }
  if (h.status === "watch") {
    if (isSpike) return { title: "Monitor — extreme spike", detail: `One flagged day hit ${peak} mm${ratio ? ` (${ratio}× neighbors)` : ""}. Check sensor — may be clogged or tipping error.`, tip: spikeTip };
    if (pct < 0) return { title: "Monitor — check flagged days", detail: `Average is ${absPct}% ${pctDir} — not consistently high. Flagged days still need review.`, tip: baseTip };
    return { title: "Monitor — slightly high", detail: `A bit higher than neighbors. Keep an eye on it.`, tip: baseTip };
  }
  return { title: "Reliable — no pattern found", detail: "Matches neighbors most days. Any flagged days below still need review — tap to compare with neighbors.", tip: `${baseTip} No extreme spikes found.` };
}
function humanLowReason(s: StationStuckHealth | null): { title: string; detail: string; tip?: string } | null {
  if (!s) return null;
  if (s.status === "insufficient_data") return { title: "Not enough data yet", detail: `Only ${s.rain_days} rainy days so far — need more rain to judge.`, tip: `Only ${s.rain_days} rainy days checked` };
  const pct = s.zero_rate != null ? Math.round(s.zero_rate * 100) : 0;
  const streak = s.max_zero_streak ?? 0;
  const tip = `On ${s.rain_days} rainy days, no reading on ${pct}% of them. Longest run without reading: ${streak} days.`;
  if (s.status === "suspect") return { title: "Needs attention — often no reading", detail: `No reading on about ${pct}% of rainy days when neighbors recorded rain. May be blocked or offline.`, tip };
  if (s.status === "watch") return { title: "Monitor — sometimes no reading", detail: `No reading on some rainy days. Some rain may have been missed.`, tip };
  return { title: "Reliable — no pattern found", detail: "Responds when it rains. Flagged days still stand out and need review, but no ongoing pattern found.", tip };
}

interface AnomalyReportTabProps {
  result: ProcessResult;
  onCreateTicket?: (stationId: string) => void;
}

export function AnomalyReportTab({ result, onCreateTicket }: AnomalyReportTabProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [mode, setMode] = useState<"high" | "low">("high");
  const [selectedId, setSelectedId] = useState<string>(() => {
    const firstHigh = result.anomaly_summary.find((s) => s.events.some((e) => !e.is_low));
    return firstHigh?.station_id ?? result.dry_stuck_summary[0]?.station_id ?? result.anomaly_summary[0]?.station_id ?? "";
  });
  const [compareNeighbors, setCompareNeighbors] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [filter, setFilter] = useState("");

  const flaggedByStation = useMemo(() => {
    const map = new Map<string, ProcessResult["flagged_data"]>();
    for (const row of result.flagged_data) {
      const arr = map.get(row.station_id) ?? [];
      arr.push(row);
      map.set(row.station_id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return map;
  }, [result.flagged_data]);

  const rainByStationDate = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const row of result.flagged_data) {
      const byDate = map.get(row.station_id) ?? {};
      byDate[row.date] = row.rainfall;
      map.set(row.station_id, byDate);
    }
    return map;
  }, [result.flagged_data]);

  // ── High = only high (is_low=false). Backend anomaly_summary is unified (high+single-day low); we filter here so High never shows silent.
  const highOnlySummary = useMemo(() => {
    return result.anomaly_summary
      .map((s) => {
        const highEvents = s.events.filter((e) => !e.is_low);
        return { ...s, events: highEvents, anomaly_count: highEvents.length };
      })
      .filter((s) => s.anomaly_count > 0)
      .sort((a, b) => b.anomaly_count - a.anomaly_count);
  }, [result.anomaly_summary]);

  const maxAnomalies = useMemo(() => Math.max(1, ...highOnlySummary.map((s) => s.anomaly_count)), [highOnlySummary]);
  const maxDryStuck = useMemo(() => Math.max(1, ...(result.dry_stuck_summary ?? []).map((s) => s.stuck_count)), [result.dry_stuck_summary]);

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

  useEffect(() => {
    const list = mode === "high" ? highOnlySummary : (result.dry_stuck_summary ?? []);
    if (list.length > 0 && !list.some((s) => s.station_id === selectedId)) setSelectedId(list[0].station_id);
  }, [mode, highOnlySummary, result.dry_stuck_summary, selectedId]);

  const selectedStation = highOnlySummary.find((s) => s.station_id === selectedId) ?? null;
  const selectedDryStation = (result.dry_stuck_summary ?? []).find((s) => s.station_id === selectedId) ?? null;
  const selectedTimeseries = selectedId ? (flaggedByStation.get(selectedId) ?? []) : [];

  const topAnomalyDate = useMemo(() => {
    if (!selectedStation || selectedStation.events.length === 0) return "";
    return [...selectedStation.events].sort((a, b) => b.rainfall - a.rainfall)[0].date;
  }, [selectedStation]);
  const topDryDate = useMemo(() => {
    if (!selectedDryStation || selectedDryStation.events.length === 0) return "";
    return [...selectedDryStation.events].sort((a, b) => (a.group_median - a.rainfall) - (b.group_median - b.rainfall))[0].date;
  }, [selectedDryStation]);
  const topDateForMode = mode === "high" ? topAnomalyDate : topDryDate;

  useEffect(() => {
    const list = mode === "high" ? selectedStation?.events : selectedDryStation?.events;
    const valid = list?.some((e) => e.date === selectedDate);
    if (!valid) setSelectedDate(topDateForMode);
  }, [mode, selectedStation, selectedDryStation, topDateForMode, selectedDate]);

  // Clear filter when station/mode changes
  useEffect(() => { setFilter(""); }, [selectedId, mode]);

  const hasHigh = highOnlySummary.length > 0;
  const hasLow = (result.dry_stuck_summary ?? []).length > 0;
  if (!hasHigh && !hasLow) {
    return (
      <div style={{ paddingTop: 16 }}>
        <div style={{ background: "var(--success-soft)", border: "1px solid color-mix(in oklab, var(--success) 30%, transparent)", borderRadius: "var(--r-xl)", padding: 20, display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ height: 36, width: 36, borderRadius: "var(--r-md)", background: "color-mix(in oklab, var(--success) 18%, transparent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AlertTriangle size={16} strokeWidth={2.4} style={{ color: "var(--success)" }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>No anomalies detected.</h3>
            <p style={{ margin: "4px 0 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>All readings were within the normal range for their neighbors. Nothing to review.</p>
          </div>
        </div>
      </div>
    );
  }

  const chartData = useMemo(
    () =>
      selectedTimeseries.map((row) => ({
        date: row.date,
        rainfall: row.rainfall,
        is_anomaly: mode === "high" ? !!row.is_anomaly : false,
        // Silent single-day lows stay in flagged_data but are NOT drawn in High; only pattern silent (is_dry_stuck) in Silent mode.
        is_low_anomaly: mode === "high" ? false : !!row.is_dry_stuck,
      })),
    [selectedTimeseries, mode],
  );

  const neighborSeries: NeighborSeries[] = useMemo(() => {
    if (!selectedId) return [];
    const ids = (result.neighbors[selectedId] ?? []).map((n) => n.neighbor_id);
    return ids.map((id) => ({ stationId: id, byDate: rainByStationDate.get(id) ?? {} })).filter((s) => Object.keys(s.byDate).length > 0);
  }, [selectedId, result.neighbors, rainByStationDate]);

  const hasNeighborData = neighborSeries.length > 0;

  const comparisonBars: DateComparisonBar[] = useMemo(() => {
    if (!selectedId || !selectedDate) return [];
    const isHigh = mode === "high";
    const events = isHigh ? selectedStation?.events : (selectedDryStation?.events as unknown as { date: string }[] | undefined);
    const flaggedDates = new Set((events ?? []).map((e) => e.date));
    const selfRain = rainByStationDate.get(selectedId)?.[selectedDate] ?? null;
    const bars: DateComparisonBar[] = [{ stationId: selectedId, rainfall: selfRain, isSelected: true, isAnomaly: flaggedDates.has(selectedDate) }];
    for (const n of result.neighbors[selectedId] ?? []) {
      bars.push({ stationId: n.neighbor_id, rainfall: rainByStationDate.get(n.neighbor_id)?.[selectedDate] ?? null, isSelected: false, isAnomaly: false });
    }
    return bars;
  }, [selectedId, selectedDate, selectedStation, selectedDryStation, mode, result.neighbors, rainByStationDate]);

  // Provenance line — one sentence instead of 4-col KV grid
  const provenance = useMemo(() => {
    if (mode === "high" && selectedStation) {
      const n = selectedStation.anomaly_count;
      const vals = selectedStation.events.map((e) => e.rainfall).sort((a, b) => b - a);
      const peak = vals[0];
      const peakDate = selectedStation.events.find((e) => e.rainfall === peak)?.date ?? "";
      // Try median of neighbors for peak date for × figure (if available)
      let times = "—";
      if (peakDate) {
        const neighborVals = (result.neighbors[selectedStation.station_id] ?? [])
          .map((nn) => rainByStationDate.get(nn.neighbor_id)?.[peakDate])
          .filter((v): v is number => typeof v === "number");
        if (neighborVals.length > 0) {
          const median = [...neighborVals].sort((a, b) => a - b)[Math.floor(neighborVals.length / 2)];
          if (median > 0) times = `${(peak / median).toFixed(1)}× neighbors`;
        }
      }
      return { left: `${n} flagged ${n === 1 ? "day" : "days"}`, right: peak ? `Peak ${peak.toFixed(1)} mm ${peakDate ? `· ${peakDate}` : ""}${times !== "—" ? ` · ${times}` : ""}` : "" };
    }
    if (mode === "low" && selectedDryStation && selectedStuck) {
      const pct = selectedStuck.zero_rate != null ? Math.round(selectedStuck.zero_rate * 100) : 0;
      const streak = selectedStuck.max_zero_streak ?? 0;
      return { left: `${selectedDryStation.stuck_count} silent ${selectedDryStation.stuck_count === 1 ? "day" : "days"}`, right: `${pct}% at 0 on rainy days · longest run ${streak} days` };
    }
    return { left: "", right: "" };
  }, [mode, selectedStation, selectedDryStation, selectedStuck, result.neighbors, rainByStationDate]);

  // Dates — compute group median on the fly for high events to show × neighbors instead of raw LOF
  function medianForHigh(date: string, stationId: string): number | null {
    const vals = (result.neighbors[stationId] ?? []).map((n) => rainByStationDate.get(n.neighbor_id)?.[date]).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  const rawEvents: any[] = mode === "high" ? (selectedStation?.events ?? []) : (selectedDryStation?.events ?? []);
  // Most recent first — more useful than earliest-first when scanning
  const sortedEvents = useMemo(() => [...rawEvents].sort((a: any, b: any) => b.date.localeCompare(a.date)), [rawEvents]);
  const filteredEvents = useMemo(() => {
    const q = filter.trim();
    if (!q) return sortedEvents;
    return sortedEvents.filter((e: any) => e.date.includes(q));
  }, [sortedEvents, filter]);
  const visibleEvents = filteredEvents;

  const activeStation = mode === "high" ? selectedStation : selectedDryStation;
  const activeHealth = (() => {
    if (mode !== "high") return humanLowReason(selectedStuck);
    let fallback: any = undefined;
    if (selectedHealth && (selectedHealth.peak_rainfall == null || (selectedHealth as any).max_ratio == null) && (selectedStation as any)?.events?.length) {
      let maxEv: any = (selectedStation as any).events[0];
      for (const ev of (selectedStation as any).events) if (ev.rainfall > maxEv.rainfall) maxEv = ev;
      fallback = { peak: maxEv.rainfall as number, ratio: (selectedHealth as any)?.max_ratio ?? null, peakDate: maxEv.date as string };
    }
    return humanHighReason(selectedHealth, fallback);
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setMode("high")}
          aria-pressed={mode === "high"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: "var(--r-full)", cursor: "pointer",
            fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
            border: `1px solid ${mode === "high" ? "var(--danger)" : "var(--border)"}`,
            background: mode === "high" ? "var(--danger-soft)" : "var(--surface)", color: mode === "high" ? "var(--danger)" : "var(--text-secondary)",
          }}
        >
          <AlertTriangle size={11} strokeWidth={2.4} /> High
          <span style={{ background: "var(--surface)", padding: "0 5px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", fontSize: 11 }}>{highOnlySummary.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("low")}
          aria-pressed={mode === "low"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: "var(--r-full)", cursor: "pointer",
            fontSize: "var(--font-xs)", fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
            border: `1px solid ${mode === "low" ? "var(--teal)" : "var(--border)"}`,
            background: mode === "low" ? "var(--teal-soft)" : "var(--surface)", color: mode === "low" ? "var(--teal-on)" : "var(--text-secondary)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: mode === "low" ? "var(--teal)" : "var(--text-tertiary)", flexShrink: 0 }} /> Silent
          <span style={{ background: "var(--surface)", padding: "0 5px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", fontSize: 11 }}>{(result.dry_stuck_summary ?? []).length}</span>
        </button>
        <span style={{ marginLeft: "auto", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {mode === "high" ? `${result.summary.total_high_anomalies ?? highOnlySummary.reduce((a, s) => a + s.anomaly_count, 0)} high` : `${(result.dry_stuck_summary ?? []).reduce((a, s) => a + s.stuck_count, 0)} total silent pattern events`}
        </span>
      </div>

      {/* Two-panel */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 10, minHeight: 380 }}>
        {/* Left: station list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 440, paddingRight: 2, minHeight: 0 }}>
          {mode === "high" ? (
            highOnlySummary.length === 0 ? (
              <div style={{ padding: "20px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>No high anomalies.<br /><span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>Check <b style={{ color: "var(--teal)" }}>Silent</b>.</span></div>
            ) : (
              highOnlySummary.map((station) => {
                const selected = station.station_id === selectedId;
                const barPct = (station.anomaly_count / maxAnomalies) * 100;
                const h = healthById.get(station.station_id) ?? null;
                const pct = h?.bias_ratio != null ? Math.round((h.bias_ratio - 1) * 100) : 0;
                const absPct = Math.abs(pct);
                const pctDir = pct > 0 ? "higher" : pct < 0 ? "lower" : "same";
                let peak = (h as any)?.peak_rainfall as number | null;
                let ratio = (h as any)?.max_ratio as number | null;
                // Fallback to anomaly_summary for stale health (before peak_rainfall existed)
                if ((peak == null || ratio == null) && station.events.length > 0) {
                  let maxEv: any = station.events[0];
                  for (const ev of station.events) if (ev.rainfall > maxEv.rainfall) maxEv = ev;
                  if (peak == null) peak = maxEv.rainfall as number;
                  // ratio stays null if health didn't compute it — spike via peak alone still works
                }
                const isSpike = !!h && (
                  (peak != null && peak >= 300) ||
                  (ratio != null && peak != null && ratio >= 15 && peak >= 30) ||
                  (ratio != null && peak != null && ratio >= 8 && peak >= 20) ||
                  (peak != null && peak >= 150)
                );
                const avgLine = !h ? "" : h.rain_days < 5 ? `${h.rain_days} rainy days` : pct === 0 ? `Avg: about same as neighbors` : `Avg: ${absPct}% ${pctDir}`;
                const peakLine = peak == null ? `No big spike` : isSpike ? `Peak: ${peak.toFixed(1)}mm · ${ratio != null ? ratio.toFixed(1) + "×" : ""} spike` : `Peak: ${peak.toFixed(1)}mm${ratio != null ? ` · ${ratio.toFixed(1)}×` : ""}`;
                const badgeTitle = !h ? "" : h.status === "normal" ? `On ${h.rain_days} rainy days — reliable. ${avgLine}. ${peakLine}.` : h.status === "insufficient_data" ? `${h.rain_days} rainy days checked` : `On ${h.rain_days} rainy days: ${avgLine}. ${peakLine}.`;
                return (
                  <button
                    key={station.station_id}
                    type="button"
                    onClick={() => setSelectedId(station.station_id)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 5, padding: "10px 12px", borderRadius: "var(--r-lg)",
                      border: selected ? "1px solid color-mix(in oklab, var(--danger) 30%, transparent)" : "1px solid transparent",
                      background: selected ? "var(--danger-soft)" : "transparent", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-sm)", fontWeight: 600, color: selected ? "var(--danger)" : "var(--text)", lineHeight: 1 }}>{station.station_id}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>{station.anomaly_count}×</span>
                    </div>
                    <div style={{ height: 3, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${barPct}%`, background: selected ? "var(--danger)" : "color-mix(in oklab, var(--danger) 50%, transparent)", borderRadius: 99 }} /></div>
                    {h && (
                      <span title={badgeTitle} style={{ display: "inline-flex" }}>
                        <Badge tone={healthTone(h.status)} dot={h.status === "suspect"} style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                          <Gauge size={10} strokeWidth={2} style={{ marginRight: 4, verticalAlign: "-1px" }} />{h.status === "suspect" ? "Needs attention" : h.status === "watch" ? "Monitor" : h.status === "insufficient_data" ? "Not enough data" : "Reliable"}
                        </Badge>
                      </span>
                    )}
                  </button>
                );
              })
            )
          ) : (
            (result.dry_stuck_summary ?? []).length === 0 ? (
              <div style={{ padding: "20px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>No silent gauges.<br /><span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>Gauges responded on rainy days.</span></div>
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
                      display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: "var(--r-lg)",
                      border: selected ? "1px solid color-mix(in oklab, var(--teal) 30%, transparent)" : "1px solid transparent",
                      background: selected ? "var(--teal-soft)" : "transparent", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-sm)", fontWeight: 600, color: selected ? "var(--teal)" : "var(--text)", lineHeight: 1 }}>{station.station_id}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>{station.stuck_count}×</span>
                    </div>
                    <div style={{ height: 3, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${barPct}%`, background: selected ? "var(--teal)" : "color-mix(in oklab, var(--teal) 50%, transparent)", borderRadius: 99 }} /></div>
                    {s && (
                      <span title={s.status === "normal" ? `On ${s.rain_days} rainy days checked — no pattern of staying at zero. Flagged days still stand out.` : s.status === "insufficient_data" ? `${s.rain_days} rainy days checked` : `On ${s.rain_days} rainy days, stayed at 0 on ${s.zero_rate != null ? Math.round(s.zero_rate * 100) + "%" : ""} of them. Longest run: ${s.max_zero_streak} days.`} style={{ display: "inline-flex" }}>
                        <Badge tone={stuckTone(s.status)} dot={s.status === "suspect"} style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                          <Gauge size={10} strokeWidth={2} style={{ marginRight: 4, verticalAlign: "-1px" }} />{s.status === "suspect" ? "Needs check" : s.status === "watch" ? "Watch" : s.status === "insufficient_data" ? "Need more rain" : "No drift"}
                        </Badge>
                      </span>
                    )}
                  </button>
                );
              })
            )
          )}
          </div>

        {/* Right: detail */}
        {activeStation ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>
            {/* Header — compact */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ height: 28, width: 28, borderRadius: 8, background: mode === "high" ? "var(--danger-soft)" : "var(--teal-soft)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <AlertTriangle size={13} strokeWidth={2.4} style={{ color: mode === "high" ? "var(--danger)" : "var(--teal)" }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "var(--font-sm)", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{activeStation.station_id}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 3 }}>
                    <MapPin size={10} strokeWidth={2.2} /><span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{activeStation.latitude.toFixed(3)}, {activeStation.longitude.toFixed(3)}</span>
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ padding: "3px 8px", borderRadius: "var(--r-full)", background: mode === "high" ? "var(--danger-soft)" : "var(--teal-soft)", color: mode === "high" ? "var(--danger)" : "var(--teal)", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                  {mode === "high" ? `${(activeStation as any).anomaly_count} days` : `${(activeStation as any).stuck_count} days`}
                </span>
                {onCreateTicket && <Button size="sm" onClick={() => onCreateTicket(activeStation.station_id)}><Plus size={12} strokeWidth={2.4} /> Ticket</Button>}
              </div>
            </div>

            {/* One-line reliability note — mode-specific so High/Silent stay consistent with the left list */}
            {activeHealth && (() => {
              const activeStatus = mode === "high" ? selectedHealth?.status : selectedStuck?.status;
              const isSuspect = activeStatus === "suspect";
              const isWatch = activeStatus === "watch";
              const isNormal = activeStatus === "normal";
              const bg = isSuspect ? "var(--danger-soft)" : isWatch ? "var(--warning-soft)" : isNormal ? "var(--surface-alt)" : "var(--surface-alt)";
              const iconColor = isSuspect ? "var(--danger)" : isWatch ? "var(--warning)" : isNormal ? "var(--text-tertiary)" : "var(--text-tertiary)";
              const titleColor = isNormal ? "var(--text-secondary)" : "var(--text)";
              return (
                <div title={(activeHealth as any).tip ?? undefined} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderBottom: "1px solid var(--divider)", background: bg }}>
                  <Gauge size={12} strokeWidth={2.4} style={{ color: iconColor, flexShrink: 0 }} />
                  <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: titleColor, whiteSpace: "nowrap" }}>{activeHealth.title}</span>
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>· {activeHealth.detail}</span>
                </div>
              );
            })()}

            {/* Provenance — single line, replaces 4-col grid */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderBottom: "1px solid var(--divider)", background: "var(--surface-sunken)", flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{provenance.left}</span>
              {provenance.right && <><span style={{ color: "var(--text-tertiary)" }}>·</span><span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>{provenance.right}</span></>}
            </div>

            {/* Timeseries — shorter, neighbors hidden by default */}
            <div style={{ padding: "10px 14px 2px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <TrendingUp size={12} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>Rainfall</span>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: mode === "high" ? "var(--danger)" : "var(--teal)", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{mode === "high" ? "flagged days" : "silent days"}</span>
                {hasNeighborData && (
                  <button type="button" onClick={() => setCompareNeighbors((v) => !v)} aria-pressed={compareNeighbors} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: "var(--r-full)", cursor: "pointer", fontSize: 11, fontWeight: 500, border: `1px solid ${compareNeighbors ? "var(--brand)" : "var(--border)"}`, background: compareNeighbors ? "var(--brand-soft)" : "var(--surface)", color: compareNeighbors ? "var(--brand)" : "var(--text-secondary)" }}>
                    <Users size={11} strokeWidth={2.2} />{compareNeighbors ? "Hide neighbors" : "Compare"}
                  </button>
                )}
              </div>
              <StationChart
                data={chartData}
                neighbors={compareNeighbors ? neighborSeries : []}
                height={130}
                anomalyColor={mode === "low" ? (isDark ? "#2DD4BF" : "#0D9488") : undefined}
                anomalyLabel={mode === "low" ? "Silent" : "Anomaly"}
              />
            </div>

            {/* Neighbor comparison bar — shorter */}
            {comparisonBars.length > 0 && (
              <div style={{ padding: "6px 14px 6px", borderTop: "1px solid var(--divider)", marginTop: 6, outline: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0 4px" }}>
                  <BarChart3 size={12} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>By station — {selectedDate}</span>
                </div>
                <DateComparisonChart bars={comparisonBars} height={130} mode={mode} />
              </div>
            )}

            {/* Flagged dates — fixed-height scroll + filter, no long list, no 25 clicks for 100+ */}
            <div style={{ padding: "8px 14px 12px", borderTop: comparisonBars.length ? "none" : "1px solid var(--divider)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>{mode === "high" ? "Flagged dates" : "Silent dates"}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>· {sortedEvents.length} total</span>
                {filter && (
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>· {filteredEvents.length} matching</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>Most recent first · Tap to compare</span>
              </div>
              {sortedEvents.length > 8 && (
                <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter by date (e.g., 2023-08)"
                    style={{
                      flex: 1,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: "var(--r-full)",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      fontSize: "var(--font-xs)",
                      color: "var(--text)",
                      outline: "none",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                  {filter && (
                    <button
                      type="button"
                      onClick={() => setFilter("")}
                      style={{
                        fontSize: "var(--font-xs)",
                        color: "var(--text-secondary)",
                        background: "var(--surface-sunken)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-full)",
                        padding: "4px 10px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: 164,
                  overflowY: "auto",
                  paddingRight: 2,
                  scrollbarWidth: "thin",
                }}
              >
                {filteredEvents.map((event: any) => {
                  const active = event.date === selectedDate;
                  const isHighMode = mode === "high";
                  const isLowEvent = !!(event as any).is_low;
                  // For high mode, low events should show median (teal), high events show times (red)
                  const median = isLowEvent ? ((event as any).group_median ?? medianForHigh(event.date, selectedId)) : (isHighMode ? medianForHigh(event.date, selectedId) : event.group_median);
                  const times = median && median > 0 ? `${(event.rainfall / median).toFixed(1)}×` : null;
                  const rightLabel = isLowEvent
                    ? `median ${median?.toFixed(1) ?? (event as any).group_median?.toFixed(1) ?? "—"} mm`
                    : isHighMode
                      ? (times ? `${times} neighbors` : `· LOF ${event.lof_score?.toFixed(1) ?? "—"}`)
                      : `median ${event.group_median?.toFixed(1) ?? "—"} mm`;
                  const tone = isLowEvent ? "teal" : isHighMode ? "danger" : "teal";
                  return (
                    <button
                      key={event.date}
                      type="button"
                      onClick={() => setSelectedDate(event.date)}
                      aria-pressed={active}
                      style={{
                        display: "grid", gridTemplateColumns: "auto 1fr auto auto", alignItems: "center", gap: 10,
                        padding: "6px 10px", borderRadius: "var(--r-md)", textAlign: "left", cursor: "pointer", width: "100%", fontFamily: "inherit",
                        background: active ? `color-mix(in oklab, var(--${tone}) 12%, var(--surface))` : "var(--surface-sunken)",
                        border: active ? `1px solid var(--${tone})` : "1px solid var(--border)",
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: 99, background: active ? `var(--${tone})` : "var(--border)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text)", fontWeight: active ? 600 : 400 }}>{event.date}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: `var(--${tone})`, fontWeight: 500 }}>{event.rainfall.toFixed(1)} mm</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>{rightLabel}</span>
                    </button>
                  );
                })}
                {filteredEvents.length === 0 && (
                  <div style={{ padding: "12px", textAlign: "center", fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
                    {filter ? `No dates matching "${filter}"` : "No dates"}
                  </div>
                )}
              </div>
              {sortedEvents.length > 4 && !filter && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
                  {sortedEvents.length} dates · Scroll to see older — most recent at top
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", display: "grid", placeItems: "center", minHeight: 200 }}>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--text-tertiary)" }}>Select a station</p>
          </div>
        )}
      </div>
    </div>
  );
}
