"use client";

import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";

export interface NeighborSeries {
  stationId: string;
  /** rainfall per date, aligned to the same date axis as the main station */
  byDate: Record<string, number>;
}

interface StationChartProps {
  data: { date: string; rainfall: number; is_anomaly: boolean; is_low_anomaly?: boolean }[];
  /** Optional neighbor lines overlaid for spatial comparison. */
  neighbors?: NeighborSeries[];
  height?: number;
  /** Color for anomaly dots — teal for silent, red for high. */
  anomalyColor?: string;
  anomalyLabel?: string;
}

// Muted, theme-agnostic palette for neighbor lines — kept subdued so the
// main station's area + red anomaly dots stay the focus.
const NEIGHBOR_COLORS_LIGHT = ["#0D9488", "#7C3AED", "#D97706", "#64748B"];
const NEIGHBOR_COLORS_DARK = ["#2DD4BF", "#A78BFA", "#FBBF24", "#94A3B8"];

export function StationChart({ data, neighbors = [], height = 200, anomalyColor, anomalyLabel = "Anomaly" }: StationChartProps & { mode?: "high" | "low" }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const axis = isDark ? "rgba(255,255,255,0.3)" : "rgba(15,23,42,0.4)";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)";
  const areaColor = isDark ? "#3B82F6" : "#2563EB";
  // Allow parent to pass explicit color; otherwise pick red for high, teal for silent.
  const modeColor = (anomalyColor as string | undefined) ?? (isDark ? "#FF6B6B" : "#E53535");
  const dangerColor = modeColor;
  const neighborPalette = isDark ? NEIGHBOR_COLORS_DARK : NEIGHBOR_COLORS_LIGHT;

  const fontXs =
    typeof window !== "undefined"
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-xs") || "12")
      : 12;

  const hasNeighbors = neighbors.length > 0;

  // Thin large timeseries for performance — keep every anomaly (high+low) + every k-th point.
  const thinnedData = useMemo(() => {
    if (data.length <= 500) return data;
    const keep = new Set<string>();
    for (const d of data) if (d.is_anomaly || (d as any).is_low_anomaly) keep.add(d.date);
    const step = Math.ceil(data.length / 350);
    const out: typeof data = [];
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (keep.has(d.date) || i % step === 0 || i === data.length - 1) out.push(d);
    }
    return out;
  }, [data]);

  const formatted = useMemo(
    () =>
      thinnedData.map((d) => {
        // Fast label: "2023-06-09" -> "Jun 9" without Date object (perf for 900 points)
        const label = (() => {
          const m = d.date.slice(5, 7);
          const day = String(Number(d.date.slice(8, 10)));
          const months: Record<string, string> = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun", "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec" };
          return `${months[m] ?? m} ${day}`;
        })();
        const row: Record<string, unknown> = { ...d, label };
        // Attach each neighbor's value for this date so recharts can plot them.
        for (const n of neighbors) {
          row[`n_${n.stationId}`] = n.byDate[d.date] ?? null;
        }
        return row;
      }),
    [thinnedData, neighbors],
  );

  const highPoints = useMemo(
    () => formatted.filter((d) => (d as { is_anomaly?: boolean }).is_anomaly && !(d as any).is_low_anomaly),
    [formatted],
  ) as unknown as { label: string; rainfall: number }[];
  const lowPoints = useMemo(
    () => formatted.filter((d) => (d as any).is_low_anomaly),
    [formatted],
  ) as unknown as { label: string; rainfall: number }[];
  const anomalyPoints = highPoints; // for backward compat where only high is used
  const lowColor = isDark ? "#2DD4BF" : "#0D9488";

  // With ~900+ daily points, showing every date label overlaps badly. Thin the
  // ticks to ~8 evenly-spaced labels (recharts hides the rest).
  const tickInterval = Math.max(0, Math.floor(formatted.length / 8));

  return (
    <ResponsiveContainer width="100%" height={height} style={{ outline: "none" }}>
      <ComposedChart data={formatted} margin={{ top: 12, right: 12, left: 8, bottom: 0 }} style={{ outline: "none" }}>
        <defs>
          <linearGradient id="rainfallGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={areaColor} stopOpacity={0.18} />
            <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={gridColor} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontXs, fill: axis, fontFamily: "var(--font-jetbrains)" }}
          interval={tickInterval}
          minTickGap={24}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontXs, fill: axis, fontFamily: "var(--font-jetbrains)" }}
          width={44}
          tickMargin={6}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-geist)",
            fontSize: fontXs,
            color: "var(--text)",
          }}
          labelStyle={{ color: "var(--text-secondary)", fontSize: fontXs, marginBottom: 2 }}
          formatter={(value, name, item) => {
            if (value === null || value === undefined) return [];
            const num = typeof value === "number" ? value : Number(value);
            if (typeof name === "string" && name.startsWith("n_")) {
              return [`${num.toFixed(1)} mm`, name.slice(2)];
            }
            const isAnomaly = (item?.payload as { is_anomaly?: boolean })?.is_anomaly;
            return [`${num.toFixed(2)} mm`, isAnomaly ? anomalyLabel : "Rainfall"];
          }}
        />
        {hasNeighbors && (
          <Legend
            verticalAlign="top"
            height={24}
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: fontXs, fontFamily: "var(--font-geist)", color: "var(--text-secondary)", paddingBottom: 4 }}
            formatter={(value) =>
              typeof value === "string" && value.startsWith("n_") ? value.slice(2) : "This station"
            }
          />
        )}

        {/* Neighbor lines — thin & muted, drawn first so the main area sits on top */}
        {neighbors.map((n, i) => (
          <Line
            key={n.stationId}
            type="monotone"
            dataKey={`n_${n.stationId}`}
            name={`n_${n.stationId}`}
            stroke={neighborPalette[i % neighborPalette.length]}
            strokeWidth={1.25}
            strokeOpacity={0.7}
            dot={false}
            connectNulls
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        ))}

        <Area
          type="monotone"
          dataKey="rainfall"
          name="rainfall"
          stroke={areaColor}
          strokeWidth={1.75}
          fill="url(#rainfallGrad)"
          dot={false}
          activeDot={{ r: 4, fill: areaColor, stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {highPoints.map((pt, i) => (
          <ReferenceDot
            key={`h-${i}`}
            x={pt.label}
            y={pt.rainfall}
            r={4}
            fill={dangerColor}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}
        {lowPoints.map((pt, i) => (
          <ReferenceDot
            key={`l-${i}`}
            x={pt.label}
            y={pt.rainfall}
            r={4}
            fill={lowColor}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
