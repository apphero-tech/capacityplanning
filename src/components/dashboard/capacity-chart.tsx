"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartTooltip, chartCursorStyle } from "@/components/ui/chart-tooltip";

interface CapacityChartProps {
  data: Array<{ stream: string; scopeSP: number; capacityHrs: number }>;
}

export function CapacityChart({ data }: CapacityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <XAxis
          dataKey="stream"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "#334155" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "#334155" }}
          tickLine={false}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={chartCursorStyle}
        />
        <Legend
          wrapperStyle={{ color: "#94a3b8", fontSize: 12 }}
        />
        <Bar
          dataKey="scopeSP"
          name="Scope (SP)"
          fill="#8b5cf6"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="capacityHrs"
          name="Capacity (Hrs)"
          fill="#10b981"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
