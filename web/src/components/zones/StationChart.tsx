"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/context/ThemeContext";

interface StationChartProps {
  data: { date: string; rainfall: number; is_anomaly: boolean }[];
  height?: number;
}

export function StationChart({ data, height = 260 }: StationChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const axis = isDark ? "rgba(255,255,255,0.35)" : "rgba(15,23,42,0.45)";
  const grid = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.05)";
  const okColor = isDark ? "#2DD4A0" : "#0DB976";
  const dangerColor = isDark ? "#FF6B6B" : "#E53535";

  const formatted = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      })),
    [data],
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <XAxis
          dataKey="label"
          axisLine={{ stroke: grid }}
          tickLine={false}
          tick={{ fontSize: 11, fill: axis, fontFamily: "var(--font-jetbrains)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: axis, fontFamily: "var(--font-jetbrains)" }}
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
            fontSize: 12,
            color: "var(--text)",
          }}
          labelStyle={{ color: "var(--text-secondary)", fontSize: 11, marginBottom: 2 }}
          formatter={(value, _name, item) => {
            const num = typeof value === "number" ? value : Number(value);
            const isAnomaly = (item?.payload as { is_anomaly?: boolean })?.is_anomaly;
            return [`${num.toFixed(2)} mm`, isAnomaly ? "Anomaly" : "Rainfall"];
          }}
        />
        <Bar dataKey="rainfall" radius={[3, 3, 0, 0]}>
          {formatted.map((entry, i) => (
            <Cell key={i} fill={entry.is_anomaly ? dangerColor : okColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
