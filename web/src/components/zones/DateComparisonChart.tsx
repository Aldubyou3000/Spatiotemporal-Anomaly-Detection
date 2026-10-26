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
  height?: number | "100%";
  mode?: "high" | "low";
}

export function comparisonRainfallLabel(rainfall: number | null): string {
  return rainfall === null ? "No reading" : rainfall.toFixed(1);
}

/**
 * Single-date comparison: one short bar per station (selected + neighbours).
 * Compares same-day readings; zero and missing rainfall have distinct labels.
 */
export function DateComparisonChart({ bars, height = 200, mode = "high" }: DateComparisonChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const axis = "var(--text-secondary)";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)";
  const brandColor = isDark ? "#3B82F6" : "#2563EB";
  const dangerColor = isDark ? "#FF6B6B" : "#E53535";
  const tealColor = isDark ? "#2DD4BF" : "#0D9488";
  const neutralColor = "var(--text-tertiary)";

  const fontXs = "var(--font-xs)";

  function barColor(b: DateComparisonBar): string {
    if (!b.isSelected) return neutralColor;
    if (mode === "low") return b.isAnomaly ? tealColor : brandColor;
    return b.isAnomaly ? dangerColor : brandColor;
  }

  const data = useMemo(
    () =>
      bars.map((b) => ({
        ...b,
        // recharts can't plot null heights; map "no data" to 0 but flag it for labels/tooltip.
        value: b.rainfall ?? 0,
        noData: b.rainfall === null,
        label: comparisonRainfallLabel(b.rainfall),
      })),
    [bars],
  );

  return (
    <ResponsiveContainer width="100%" height={height} style={{ outline: "none" }}>
      <BarChart data={data} margin={{ top: 28, right: 12, left: 8, bottom: 0 }} barCategoryGap="28%" style={{ outline: "none" }}>
        <CartesianGrid vertical={false} stroke={gridColor} />
        <XAxis
          dataKey="stationId"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontXs, fill: axis, fontFamily: "var(--font-ui)" }}
          interval={0}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontXs, fill: axis, fontFamily: "var(--font-ui)" }}
          width={56}
          tickMargin={6}
        />
        <Tooltip
          cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)" }}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-ui)",
            fontSize: fontXs,
            color: "var(--text)",
          }}
          labelStyle={{ color: "var(--text-secondary)", fontSize: fontXs, marginBottom: 2 }}
          formatter={(_value, _name, item) => {
            const p = item?.payload as { value: number; noData: boolean; isSelected: boolean; isAnomaly: boolean };
            if (p?.noData) return ["no data that day", ""];
            const tag = p?.isSelected ? (p.isAnomaly ? " (system flagged)" : " (this station)") : "";
            return [`${p.value.toFixed(1)} mm${tag}`, ""];
          }}
        />
        <Bar dataKey="value" minPointSize={2} radius={[4, 4, 0, 0]} isAnimationActive={false} activeBar={false}>
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
            dataKey="label"
            position="top"
            content={(props) => {
              const { x, y, width, value } = props as { x: number; y: number; width: number; value: string };
              const cx = x + width / 2;
              // Clamp above the plot edge so the tallest bar's label is never clipped.
              const ly = Math.max(y - 5, 10);
              return (
                <text
                  x={cx}
                  y={ly}
                  textAnchor="middle"
                  fontSize={fontXs}
                  fontFamily="var(--font-ui)"
                  fill="var(--text-secondary)"
                >
                  {value}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
