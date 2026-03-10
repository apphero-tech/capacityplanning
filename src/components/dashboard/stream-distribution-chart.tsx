"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartTooltip } from "@/components/ui/chart-tooltip";

interface StreamDistributionChartProps {
  data: Array<{ stream: string; count: number; color: string }>;
}

export function StreamDistributionChart({ data }: StreamDistributionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="count"
          nameKey="stream"
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v, n) => [`${v ?? 0} stories`, n ?? ""]}
            />
          }
        />
        <Legend
          wrapperStyle={{ color: "#94a3b8", fontSize: 12 }}
          formatter={(value: string) => (
            <span style={{ color: "#94a3b8" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
