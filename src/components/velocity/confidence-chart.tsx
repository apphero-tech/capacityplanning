"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartTooltip, chartCursorStyle } from "@/components/ui/chart-tooltip";

interface ConfidenceData {
  sprintName: string;
  confidencePercent: number | null;
}

interface ConfidenceChartProps {
  data: ConfidenceData[];
}

export function ConfidenceChart({ data }: ConfidenceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="confGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          domain={[0, 140]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v) => [
                v !== undefined ? `${v.toFixed(1)}%` : "—",
                "Confidence",
              ]}
            />
          }
          cursor={chartCursorStyle}
        />
        <ReferenceLine
          y={100}
          stroke="#10b981"
          strokeDasharray="3 3"
          label={{
            value: "100%",
            position: "right",
            fill: "#10b981",
            fontSize: 10,
          }}
        />
        <Area
          dataKey="confidencePercent"
          name="Confidence"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#confGradient)"
          dot={(props: Record<string, unknown>) => {
            const cx = (props.cx as number) ?? 0;
            const cy = (props.cy as number) ?? 0;
            const payload = props.payload as ConfidenceData | undefined;
            if (!payload || payload.confidencePercent === null) return <g key={cx} />;
            const pct = payload.confidencePercent!;
            const color =
              pct >= 90 ? "#10b981" : pct >= 70 ? "#f59e0b" : "#ef4444";
            return (
              <circle
                key={cx}
                cx={cx}
                cy={cy}
                r={4}
                fill={color}
                stroke={color}
                strokeWidth={1}
              />
            );
          }}
          connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
