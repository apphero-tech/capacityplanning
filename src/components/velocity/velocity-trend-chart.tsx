"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { ChartTooltip } from "@/components/ui/chart-tooltip";

interface VelocityTrendData {
  sprintName: string;
  actualVelocity: number | null;
  velocityProven: number;
}

interface VelocityTrendChartProps {
  data: VelocityTrendData[];
}

export function VelocityTrendChart({ data }: VelocityTrendChartProps) {
  // Compute average velocity for reference line
  const withActual = data.filter((d) => d.actualVelocity !== null);
  const avgVelocity =
    withActual.length > 0
      ? withActual.reduce((sum, d) => sum + (d.actualVelocity ?? 0), 0) /
        withActual.length
      : 0;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <XAxis
          dataKey="sprintName"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "#334155" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "#334155" }}
          tickLine={false}
          domain={[0, "auto"]}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v, n) => [v !== undefined ? v.toFixed(3) : "—", n ?? ""]}
            />
          }
        />
        <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
        {avgVelocity > 0 && (
          <ReferenceLine
            y={avgVelocity}
            stroke="#64748b"
            strokeDasharray="3 3"
            label={{
              value: `Avg: ${avgVelocity.toFixed(3)}`,
              position: "right",
              fill: "#64748b",
              fontSize: 10,
            }}
          />
        )}
        <Line
          dataKey="actualVelocity"
          name="Actual Velocity"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: "#10b981", r: 4 }}
          connectNulls={false}
        />
        <Line
          dataKey="velocityProven"
          name="Effective Velocity"
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ fill: "#8b5cf6", r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
