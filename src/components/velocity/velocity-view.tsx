"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSprint } from "@/contexts/sprint-context";
import type { VelocitySource } from "@/lib/capacity-engine";
import { EditableCell } from "@/components/ui/editable-cell";
import { VelocityTrendChart } from "@/components/velocity/velocity-trend-chart";
import { CommitmentChart } from "@/components/velocity/commitment-chart";
import { ConfidenceChart } from "@/components/velocity/confidence-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  TrendingUp,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { SPRINT_STATUS_BADGE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number, decimals = 1): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function velocitySourceLabel(source: VelocitySource): { icon: string; title: string; className: string } {
  switch (source) {
    case "calculated":
      return { icon: "✓", title: "Calculated from completed / dev hrs", className: "text-emerald-400" };
    case "rolling-avg":
      return { icon: "◎", title: "Rolling average of last 3 sprints", className: "text-violet-400" };
    case "manual":
      return { icon: "✎", title: "Manually entered", className: "text-amber-400" };
    case "inherited":
      return { icon: "↩", title: "Inherited from previous sprint", className: "text-slate-600" };
  }
}

function confidenceColor(pct: number): string {
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 70) return "text-amber-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VelocityView() {
  const {
    allSprints: sprints,
    selectedSprint,
    selectedForecast,
    forecasts,
    forecastMap,
  } = useSprint();
  const router = useRouter();

  const handleSaved = useCallback(() => {
    router.refresh();
  }, [router]);

  // Sprints with actual data (commitment or completed entered)
  const sprintsWithData = useMemo(() => {
    return sprints.filter((s) => {
      const f = forecastMap.get(s.id);
      return (
        f &&
        (f.commitmentSP !== null ||
          f.completedSP !== null ||
          f.actualVelocity !== null)
      );
    });
  }, [sprints, forecastMap]);

  // Chart data: velocity trend
  const velocityTrendData = useMemo(() => {
    return sprints.map((s) => {
      const f = forecastMap.get(s.id);
      return {
        sprintName: s.name,
        actualVelocity: f?.actualVelocity ?? null,
        velocityProven: f?.velocityProven ?? 0,
      };
    }).filter((d) => d.actualVelocity !== null || d.velocityProven > 0);
  }, [sprints, forecastMap]);

  // Chart data: commitment vs completed
  const commitmentData = useMemo(() => {
    return sprintsWithData.map((s) => {
      const f = forecastMap.get(s.id)!;
      return {
        sprintName: s.name,
        commitmentSP: f.commitmentSP,
        completedSP: f.completedSP,
      };
    });
  }, [sprintsWithData, forecastMap]);

  // Chart data: confidence %
  const confidenceData = useMemo(() => {
    return sprintsWithData
      .filter((s) => {
        const f = forecastMap.get(s.id);
        return f?.confidencePercent !== null && f?.confidencePercent !== undefined;
      })
      .map((s) => {
        const f = forecastMap.get(s.id)!;
        return {
          sprintName: s.name,
          confidencePercent: f.confidencePercent,
        };
      });
  }, [sprintsWithData, forecastMap]);

  // Rolling average: average velocity of last 3 sprints with actual data
  const rollingAvg = useMemo(() => {
    const withActual = forecasts.filter((f) => f.actualVelocity !== null);
    const last3 = withActual.slice(-3);
    if (last3.length === 0) return null;
    return (
      last3.reduce((sum, f) => sum + (f.actualVelocity ?? 0), 0) / last3.length
    );
  }, [forecasts]);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Current Velocity */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
              <Activity className="size-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Current Velocity
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {selectedForecast
                  ? fmt(selectedForecast.velocityProven, 3)
                  : "N/A"}
                <span className="text-sm font-normal text-slate-500 ml-1">
                  SP/hr
                </span>
              </p>
              {selectedForecast && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Source:{" "}
                  <span className={velocitySourceLabel(selectedForecast.velocitySource).className}>
                    {velocitySourceLabel(selectedForecast.velocitySource).icon}{" "}
                    {selectedForecast.velocitySource}
                  </span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rolling Average */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
              <TrendingUp className="size-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Rolling Average
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {rollingAvg !== null ? fmt(rollingAvg, 3) : "N/A"}
                <span className="text-sm font-normal text-slate-500 ml-1">
                  SP/hr
                </span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Last {Math.min(3, forecasts.filter((f) => f.actualVelocity !== null).length)} sprints with data
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Confidence % */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <ShieldCheck className="size-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Confidence
              </p>
              <p className={`mt-1 text-2xl font-bold ${
                selectedForecast?.confidencePercent != null
                  ? confidenceColor(selectedForecast.confidencePercent)
                  : "text-slate-100"
              }`}>
                {selectedForecast?.confidencePercent != null
                  ? `${fmt(selectedForecast.confidencePercent, 1)}%`
                  : "N/A"}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Completed / Committed
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Projected SP */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#E31837]/15">
              <Zap className="size-5 text-[#E31837]" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Projected SP
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">
                {selectedForecast
                  ? fmt(selectedForecast.projectedSPProven, 0)
                  : "N/A"}
                <span className="text-sm font-normal text-slate-500 ml-1">
                  SP
                </span>
              </p>
              {selectedForecast && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {fmt(selectedForecast.netDevHrs)} hrs × {fmt(selectedForecast.velocityProven, 3)} vel
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Velocity Trend */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-300">
              Velocity Trend
            </CardTitle>
            <CardDescription className="text-slate-500">
              Actual vs effective velocity across sprints
            </CardDescription>
          </CardHeader>
          <CardContent>
            {velocityTrendData.length > 0 ? (
              <VelocityTrendChart data={velocityTrendData} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-slate-500">
                No velocity data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commitment vs Completed */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-300">
              Commitment vs Completed
            </CardTitle>
            <CardDescription className="text-slate-500">
              Story points committed and delivered per sprint
            </CardDescription>
          </CardHeader>
          <CardContent>
            {commitmentData.length > 0 ? (
              <CommitmentChart data={commitmentData} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-slate-500">
                No commitment data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confidence Chart (full width) */}
      <Card className="border-white/[0.06] bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-300">
            Confidence Trend
          </CardTitle>
          <CardDescription className="text-slate-500">
            Commitment accuracy: completed / committed × 100
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confidenceData.length > 0 ? (
            <ConfidenceChart data={confidenceData} />
          ) : (
            <div className="flex h-[250px] items-center justify-center text-sm text-slate-500">
              No confidence data yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sprint Data Table */}
      <Card className="border-white/[0.06] bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-slate-100">Sprint Velocity Data</CardTitle>
          <CardDescription className="text-slate-400">
            Click commitment or completed values to edit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-slate-400">Sprint</TableHead>
                <TableHead className="text-right text-slate-400">
                  DEV hrs
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Commit
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Done
                </TableHead>
                <TableHead className="text-center text-slate-400">
                  Conf%
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Velocity
                </TableHead>
                <TableHead className="text-center text-slate-400">
                  Source
                </TableHead>
                <TableHead className="text-center text-slate-400">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sprints.length === 0 ? (
                <TableRow className="border-white/[0.06]">
                  <TableCell
                    colSpan={8}
                    className="text-center text-slate-500 py-8"
                  >
                    No sprints found.
                  </TableCell>
                </TableRow>
              ) : (
                sprints.map((s) => {
                  const forecast = forecastMap.get(s.id);
                  const canEditCommit = s.status !== "future";
                  const canEditDone =
                    s.status === "current" ||
                    s.status === "previous" ||
                    s.status === "past";
                  const srcInfo = forecast
                    ? velocitySourceLabel(forecast.velocitySource)
                    : null;

                  return (
                    <TableRow
                      key={s.id}
                      className={`border-white/[0.06] hover:bg-white/[0.02] ${
                        selectedSprint?.id === s.id
                          ? "bg-[#E31837]/[0.08] ring-1 ring-inset ring-[#E31837]/20"
                          : s.isCurrent
                            ? "bg-[#E31837]/[0.03]"
                            : ""
                      }`}
                    >
                      {/* Sprint Name */}
                      <TableCell className="font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          {s.isActive && (
                            <span
                              className={`size-2 rounded-full ${
                                s.isCurrent
                                  ? "bg-[#E31837] animate-pulse"
                                  : "bg-blue-400"
                              }`}
                            />
                          )}
                          {s.name}
                        </div>
                      </TableCell>

                      {/* DEV hrs */}
                      <TableCell className="text-right text-slate-300">
                        {forecast ? (
                          fmt(forecast.netDevHrs)
                        ) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Commitment SP */}
                      <TableCell className="text-right">
                        <EditableCell
                          value={forecast?.commitmentSP ?? s.commitmentSP}
                          sprintId={s.id}
                          field="commitmentSP"
                          canEdit={canEditCommit}
                          onSaved={handleSaved}
                        />
                      </TableCell>

                      {/* Completed SP */}
                      <TableCell className="text-right">
                        <EditableCell
                          value={forecast?.completedSP ?? s.completedSP}
                          sprintId={s.id}
                          field="completedSP"
                          canEdit={canEditDone}
                          onSaved={handleSaved}
                        />
                      </TableCell>

                      {/* Confidence % */}
                      <TableCell className="text-center">
                        {forecast?.confidencePercent != null ? (
                          <span
                            className={`text-xs font-semibold tabular-nums ${confidenceColor(
                              forecast.confidencePercent
                            )}`}
                          >
                            {fmt(forecast.confidencePercent, 1)}%
                          </span>
                        ) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Velocity */}
                      <TableCell className="text-right text-slate-300">
                        {forecast && forecast.velocityProven > 0 ? (
                          fmt(forecast.velocityProven, 3)
                        ) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Source */}
                      <TableCell className="text-center">
                        {srcInfo && forecast && forecast.velocityProven > 0 ? (
                          <span
                            className={`text-xs ${srcInfo.className}`}
                            title={srcInfo.title}
                          >
                            {srcInfo.icon} {forecast.velocitySource}
                          </span>
                        ) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        <Badge
                          variant="colored"
                          className={`text-[10px] ${
                            SPRINT_STATUS_BADGE[s.status]?.className ?? ""
                          }`}
                        >
                          {SPRINT_STATUS_BADGE[s.status]?.label ?? s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
