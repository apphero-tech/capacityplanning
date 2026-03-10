"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Gauge,
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import type { DevProjection } from "@/types";
import { getBadgeClasses } from "@/lib/badge-utils";

interface DevProjectionPanelProps {
  projection: DevProjection;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function GapBadge({ gap }: { gap: number }) {
  if (gap >= 0) {
    return (
      <Badge
        variant="colored"
        className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs font-semibold"
      >
        <TrendingUp className="mr-1 size-3" />
        +{formatNumber(gap)} SP surplus
      </Badge>
    );
  }
  return (
    <Badge
      variant="colored"
      className="bg-red-500/10 text-red-400 border-red-500/20 text-xs font-semibold"
    >
      <TrendingDown className="mr-1 size-3" />
      {formatNumber(gap)} SP deficit
    </Badge>
  );
}

function CoverageBadge({ coverage }: { coverage: number }) {
  const pct = coverage * 100;
  let status: string;
  if (pct >= 100) {
    status = "OK";
  } else if (pct >= 80) {
    status = "At Risk";
  } else {
    status = "Over";
  }

  return (
    <Badge
      variant="colored"
      className={`${getBadgeClasses("coverage", status)} text-xs font-semibold`}
    >
      {pct.toFixed(1)}%
    </Badge>
  );
}

export function DevProjectionPanel({ projection }: DevProjectionPanelProps) {
  const metrics = [
    {
      label: "Net Dev Capacity",
      value: `${formatNumber(projection.netDevCapacity)} hrs`,
      icon: Clock,
      color: "#3b82f6",
    },
    {
      label: "Velocity Proven",
      value: `${projection.velocityProven} SP/hr`,
      icon: Gauge,
      color: "#8b5cf6",
    },
    {
      label: "Velocity Target",
      value: `${projection.velocityTarget} SP/hr`,
      icon: Target,
      color: "#6366f1",
    },
    {
      label: "Backlog DEV SP",
      value: `${formatNumber(projection.backlogDevSP)} SP`,
      icon: BarChart3,
      color: "#f59e0b",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Summary metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-white/[0.06] bg-slate-900/50 p-5"
          >
            <div className="flex items-center gap-2">
              <div
                className="flex size-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${metric.color}15` }}
              >
                <metric.icon className="size-4" style={{ color: metric.color }} />
              </div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {metric.label}
              </p>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-slate-100">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {/* Projection cards: Proven vs Target */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Proven scenario */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Proven Velocity Scenario</CardTitle>
            <CardDescription className="text-slate-500">
              Based on historical velocity of {projection.velocityProven} SP/hr
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Projected SP</span>
                <span className="text-lg font-bold tabular-nums text-slate-100">
                  {formatNumber(projection.projectedSPProven)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Backlog DEV SP</span>
                <span className="text-lg font-bold tabular-nums text-slate-300">
                  {formatNumber(projection.backlogDevSP)}
                </span>
              </div>
              <div className="h-px bg-white/[0.06]" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Gap</span>
                <GapBadge gap={projection.gapProven} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Coverage</span>
                <CoverageBadge coverage={projection.coverageProven} />
              </div>
              {/* Coverage bar */}
              <div className="mt-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(projection.coverageProven * 100, 100)}%`,
                      backgroundColor:
                        projection.coverageProven >= 1
                          ? "#10b981"
                          : projection.coverageProven >= 0.8
                          ? "#f59e0b"
                          : "#ef4444",
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Target scenario */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Target Velocity Scenario</CardTitle>
            <CardDescription className="text-slate-500">
              Based on target velocity of {projection.velocityTarget} SP/hr
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Projected SP</span>
                <span className="text-lg font-bold tabular-nums text-slate-100">
                  {formatNumber(projection.projectedSPTarget)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Backlog DEV SP</span>
                <span className="text-lg font-bold tabular-nums text-slate-300">
                  {formatNumber(projection.backlogDevSP)}
                </span>
              </div>
              <div className="h-px bg-white/[0.06]" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Gap</span>
                <GapBadge gap={projection.gapTarget} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Coverage</span>
                <CoverageBadge coverage={projection.coverageTarget} />
              </div>
              {/* Coverage bar */}
              <div className="mt-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(projection.coverageTarget * 100, 100)}%`,
                      backgroundColor:
                        projection.coverageTarget >= 1
                          ? "#10b981"
                          : projection.coverageTarget >= 0.8
                          ? "#f59e0b"
                          : "#ef4444",
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
