"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";

interface StationChartProps {
  data: { date: string; rainfall: number; is_anomaly: boolean }[];
  height?: number;
}

export function StationChart({ data, height = 200 }: StationChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const axis = isDark ? "rgba(255,255,255,0.3)" : "rgba(15,23,42,0.4)";
  const gridColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)";
  const areaColor = isDark ? "#3B82F6" : "#2563EB";
  const dangerColor = isDark ? "#FF6B6B" : "#E53535";

  const fontXs =
    typeof window !== "undefined"
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-xs") || "12")
      : 12;

  const formatted = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })),
    [data],
  );

  const anomalyPoints = formatted.filter((d) => d.is_anomaly);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
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
          interval="preserveStartEnd"
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontXs, fill: axis, fontFamily: "var(--font-jetbrains)" }}
          width={36}
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
          formatter={(value, _name, item) => {
            const num = typeof value === "number" ? value : Number(value);
            const isAnomaly = (item?.payload as { is_anomaly?: boolean })?.is_anomaly;
            return [`${num.toFixed(2)} mm`, isAnomaly ? "Anomaly" : "Rainfall"];
          }}
        />
        <Area
          type="monotone"
          dataKey="rainfall"
          stroke={areaColor}
          strokeWidth={1.5}
          fill="url(#rainfallGrad)"
          dot={false}
          activeDot={{ r: 4, fill: areaColor, stroke: "var(--surface)", strokeWidth: 2 }}
        />
        {anomalyPoints.map((pt, i) => (
          <ReferenceDot
            key={i}
            x={pt.label}
            y={pt.rainfall}
            r={4}
            fill={dangerColor}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
