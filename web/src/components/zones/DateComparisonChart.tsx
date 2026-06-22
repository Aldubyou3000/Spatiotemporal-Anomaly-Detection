"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";

export interface DateComparisonBar {
  stationId: string;
  /** rainfall (mm) for the selected date; null when the station has no reading that day */
  rainfall: number | null;
  isSelected: boolean;
  /** true when this is the selected station and the date is one of its flagged anomalies */
  isAnomaly: boolean;
}

interface DateComparisonChartProps {
  bars: DateComparisonBar[];
  height?: number;
}

/**
 * Single-date comparison: one short bar per station (selected + neighbours).
 * Stations on the x-axis (≤4 labels → no crowding), rainfall on the y-axis.
 * Lets an analyst read a flagged spike against its neighbours on that exact day
 * — a lone tall bar = likely sensor fault; several tall bars = real regional event.
 */
export function DateComparisonChart({ bars, height = 200 }: DateComparisonChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const axis = isDark ? "rgba(255,255,255,0.3)" : "rgba(15,23,42,0.4)";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)";
  const brandColor = isDark ? "#3B82F6" : "#2563EB";
  const dangerColor = isDark ? "#FF6B6B" : "#E53535";
  const neutralColor = isDark ? "#8993A4" : "#A1A9B4"; // --text-muted / --text-tertiary

  const fontXs =
    typeof window !== "undefined"
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-xs") || "12")
      : 12;

  function barColor(b: DateComparisonBar): string {
    if (!b.isSelected) return neutralColor;
    return b.isAnomaly ? dangerColor : brandColor;
  }

  const data = useMemo(
    () =>
      bars.map((b) => ({
        ...b,
        // recharts can't plot null heights; map "no data" to 0 but flag it for labels/tooltip.
        value: b.rainfall ?? 0,
        noData: b.rainfall === null,
      })),
    [bars],
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 28, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={gridColor} />
        <XAxis
          dataKey="stationId"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontXs, fill: axis, fontFamily: "var(--font-jetbrains)" }}
          interval={0}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontXs, fill: axis, fontFamily: "var(--font-jetbrains)" }}
          width={36}
        />
        <Tooltip
          cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)" }}
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
          formatter={(_value, _name, item) => {
            const p = item?.payload as { value: number; noData: boolean; isSelected: boolean; isAnomaly: boolean };
            if (p?.noData) return ["no data that day", ""];
            const tag = p?.isSelected ? (p.isAnomaly ? " (anomaly)" : " (this station)") : "";
            return [`${p.value.toFixed(1)} mm${tag}`, ""];
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((b) => (
            <Cell
              key={b.stationId}
              fill={b.noData ? "transparent" : barColor(b)}
              stroke={b.noData ? neutralColor : undefined}
              strokeDasharray={b.noData ? "3 3" : undefined}
              strokeWidth={b.noData ? 1 : 0}
            />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            content={(props) => {
              const { x, y, width, index } = props as { x: number; y: number; width: number; index: number };
              const b = data[index];
              const cx = x + width / 2;
              const text = b.noData ? "—" : b.value.toFixed(1);
              // Clamp above the plot edge so the tallest bar's label is never clipped.
              const ly = Math.max(y - 5, 10);
              return (
                <text
                  x={cx}
                  y={ly}
                  textAnchor="middle"
                  fontSize={fontXs}
                  fontFamily="var(--font-jetbrains)"
                  fill={b.noData ? neutralColor : "var(--text-secondary)"}
                >
                  {text}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
