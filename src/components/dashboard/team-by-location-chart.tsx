"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip, chartCursorStyle } from "@/components/ui/chart-tooltip";

interface TeamByLocationChartProps {
  data: Array<{ location: string; count: number }>;
}

export function TeamByLocationChart({ data }: TeamByLocationChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <XAxis
          dataKey="location"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "#334155" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "#334155" }}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v) => [`${v ?? 0} members`, "Count"]}
            />
          }
          cursor={chartCursorStyle}
        />
        <Bar
          dataKey="count"
          name="Team Members"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
