"use client";

import { useMemo } from "react";
import { formatDateShort, parseLocalDate } from "@/lib/date-utils";
import { useSprint } from "@/contexts/sprint-context";
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
  CalendarDays,
  Target,
  Zap,
  Play,
  TrendingUp,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SprintsView() {
  const {
    selectedSprint,
    allSprints: sprints,
    forecastMap,
    selectedForecast,
  } = useSprint();
  const totalSprints = sprints.length;

  // Total projected SP across future sprints (current + next + future)
  const futureProjectedSP = useMemo(() => {
    return sprints
      .filter((s) => s.status === "current" || s.status === "next" || s.status === "planning" || s.status === "future")
      .reduce((sum, s) => {
        const f = forecastMap.get(s.id);
        return sum + (f?.projectedSPProven ?? 0);
      }, 0);
  }, [sprints, forecastMap]);

  // Sprint Plan — Gantt chart data
  const sprintPlan = useMemo(() => {
    const withDates = sprints.filter((s) => s.startDate && s.endDate);
    if (withDates.length === 0) return null;

    const starts = withDates.map((s) => parseLocalDate(s.startDate!)!.getTime());
    const ends = withDates.map((s) => parseLocalDate(s.endDate!)!.getTime());
    const minT = Math.min(...starts);
    const maxT = Math.max(...ends);
    const pad = (maxT - minT) * 0.015;
    const rangeStart = minT - pad;
    const rangeEnd = maxT + pad;
    const total = rangeEnd - rangeStart;
    if (total <= 0) return null;

    const pct = (t: number) => ((t - rangeStart) / total) * 100;

    // Month grid markers
    const months: { label: string; left: number }[] = [];
    const cursor = new Date(new Date(minT).getFullYear(), new Date(minT).getMonth(), 1);
    while (cursor.getTime() <= rangeEnd) {
      const p = pct(cursor.getTime());
      if (p >= -1 && p <= 101) {
        months.push({
          label: cursor.toLocaleDateString("en-US", { month: "short" }),
          left: Math.max(0, Math.min(100, p)),
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Today marker
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const todayPct = pct(now.getTime());
    const showToday = todayPct >= 0 && todayPct <= 100;

    // Sprint rows with bar positioning
    const rows = withDates.map((s) => {
      const st = parseLocalDate(s.startDate!)!.getTime();
      const en = parseLocalDate(s.endDate!)!.getTime();
      return {
        ...s,
        left: pct(st),
        width: Math.max(pct(en) - pct(st), 0.8),
        forecast: forecastMap.get(s.id),
      };
    });

    return { months, rows, showToday, todayPct };
  }, [sprints, forecastMap]);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#E31837]/15">
              <CalendarDays className="size-5 text-[#E31837]" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Sprints
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {totalSprints}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
              <Zap className="size-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Selected Sprint
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {selectedSprint?.name ?? "None"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Projected SP for selected sprint */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
              <TrendingUp className="size-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Projected SP
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {selectedForecast
                  ? fmt(selectedForecast.projectedSPProven, 0)
                  : "N/A"}
                {selectedForecast && (
                  <span className="text-sm font-normal text-slate-500 ml-1">SP</span>
                )}
              </p>
              {selectedForecast && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {fmt(selectedForecast.netDevHrs)} dev hrs × {fmt(selectedForecast.velocityProven, 2)} vel
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Remaining projected SP */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <Target className="size-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Remaining Capacity
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {fmt(futureProjectedSP, 0)}
                <span className="text-sm font-normal text-slate-500 ml-1">SP</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                current + future sprints
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sprint Plan — Gantt Timeline */}
      {sprintPlan && (
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Sprint Plan</CardTitle>
            <CardDescription className="text-slate-400">
              Project timeline with capacity projections
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Month header row */}
              <div className="flex h-7 items-end">
                <div className="w-28 shrink-0" />
                <div className="flex-1 relative min-w-0">
                  {sprintPlan.months.map((m, i) => (
                    <span
                      key={i}
                      className="absolute bottom-1 -translate-x-1/2 text-[10px] text-slate-500 whitespace-nowrap"
                      style={{ left: `${m.left}%` }}
                    >
                      {m.label}
                    </span>
                  ))}
                  {sprintPlan.showToday && (
                    <span
                      className="absolute bottom-1 -translate-x-1/2 text-[9px] font-semibold text-[#E31837] whitespace-nowrap z-20"
                      style={{ left: `${sprintPlan.todayPct}%` }}
                    >
                      ▼ Today
                    </span>
                  )}
                </div>
                <div className="w-14 shrink-0 flex items-end justify-end pb-1">
                  <span className="text-[10px] text-emerald-400/60 font-medium">SP</span>
                </div>
              </div>

              {/* Gantt body */}
              <div className="flex border-t border-white/[0.04]">
                {/* Sprint name labels */}
                <div className="w-28 shrink-0">
                  {sprintPlan.rows.map((s) => (
                    <div key={s.id} className="h-8 flex items-center gap-2 pr-3">
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          s.isCurrent
                            ? "bg-[#E31837] animate-pulse"
                            : s.status === "previous"
                              ? "bg-blue-400"
                              : s.status === "next"
                                ? "bg-amber-400"
                                : s.status === "planning"
                                  ? "bg-violet-400"
                                  : "bg-slate-600"
                        }`}
                      />
                      <span
                        className={`text-xs truncate ${
                          s.isActive
                            ? "text-slate-200 font-medium"
                            : "text-slate-500"
                        }`}
                      >
                        {s.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Bar area */}
                <div
                  className="flex-1 relative min-w-0"
                  style={{ height: sprintPlan.rows.length * 32 }}
                >
                  {/* Month grid lines */}
                  {sprintPlan.months.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 w-px bg-white/[0.04]"
                      style={{ left: `${m.left}%` }}
                    />
                  ))}

                  {/* Today dashed line */}
                  {sprintPlan.showToday && (
                    <div
                      className="absolute top-0 bottom-0 z-10"
                      style={{
                        left: `${sprintPlan.todayPct}%`,
                        borderLeft: "1px dashed rgba(227, 24, 55, 0.5)",
                      }}
                    />
                  )}

                  {/* Alternating row backgrounds */}
                  {sprintPlan.rows.map((s, i) => (
                    <div
                      key={`bg-${s.id}`}
                      className={`absolute left-0 right-0 ${
                        s.isCurrent
                          ? "bg-[#E31837]/[0.03]"
                          : i % 2 === 1
                            ? "bg-white/[0.01]"
                            : ""
                      }`}
                      style={{ top: i * 32, height: 32 }}
                    />
                  ))}

                  {/* Sprint bars */}
                  {sprintPlan.rows.map((s, i) => {
                    const sp = s.forecast?.projectedSPProven ?? 0;
                    return (
                      <div
                        key={s.id}
                        className="absolute left-0 right-0"
                        style={{ top: i * 32, height: 32 }}
                      >
                        <div
                          className={`absolute top-1.5 bottom-1.5 rounded-[4px] transition-all cursor-default ${
                            s.isCurrent
                              ? "bg-[#E31837] shadow-lg shadow-[#E31837]/20 ring-1 ring-[#E31837]/30"
                              : s.status === "previous"
                                ? "bg-blue-500/60"
                                : s.status === "next"
                                  ? "bg-amber-500/50"
                                  : s.status === "planning"
                                    ? "bg-violet-500/40"
                                    : s.status === "future"
                                      ? "bg-slate-600/40"
                                      : "bg-slate-700/50"
                          } hover:brightness-125`}
                          style={{
                            left: `${s.left}%`,
                            width: `${s.width}%`,
                          }}
                          title={`${s.name}\n${formatDateShort(s.startDate)} – ${formatDateShort(s.endDate)}\n${s.durationWeeks} weeks · Focus ${Math.round(s.focusFactor * 100)}%${sp > 0 ? `\nProjected: ${fmt(sp, 0)} SP` : ""}`}
                        >
                          {/* Show duration inside bar if wide enough */}
                          {s.width > 5 && (
                            <span
                              className={`absolute inset-0 flex items-center justify-center text-[10px] font-medium ${
                                s.isCurrent
                                  ? "text-white/80"
                                  : "text-slate-300/70"
                              }`}
                            >
                              {s.durationWeeks}w
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* SP column */}
                <div className="w-14 shrink-0">
                  {sprintPlan.rows.map((s) => {
                    const sp = s.forecast?.projectedSPProven ?? 0;
                    return (
                      <div
                        key={s.id}
                        className="h-8 flex items-center justify-end pl-2"
                      >
                        {sp > 0 ? (
                          <span
                            className={`text-xs tabular-nums font-semibold ${
                              s.isCurrent
                                ? "text-emerald-400"
                                : s.isActive
                                  ? "text-emerald-400/70"
                                  : "text-slate-500"
                            }`}
                          >
                            {fmt(sp, 0)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-700">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sprint Table — 7 columns: Name, Dates, Weeks, Focus, DEV hrs, Projected SP, Status */}
      <Card className="border-white/[0.06] bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-slate-100">All Sprints</CardTitle>
          <CardDescription className="text-slate-400">
            Sprint parameters and projected delivery capacity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-slate-400">Name</TableHead>
                <TableHead className="text-slate-400">Dates</TableHead>
                <TableHead className="text-center text-slate-400">
                  Weeks
                </TableHead>
                <TableHead className="text-center text-slate-400">
                  Focus
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  DEV hrs
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  <span className="font-semibold text-emerald-400">Projected SP</span>
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
                    colSpan={7}
                    className="text-center text-slate-500 py-8"
                  >
                    No sprints found.
                  </TableCell>
                </TableRow>
              ) : (
                sprints.map((s) => {
                  const forecast = forecastMap.get(s.id);
                  return (
                    <TableRow
                      key={s.id}
                      className={`border-white/[0.06] hover:bg-white/[0.02] ${
                        selectedSprint?.id === s.id
                          ? "bg-[#E31837]/[0.08] ring-1 ring-inset ring-[#E31837]/20"
                          : s.isCurrent
                            ? "bg-[#E31837]/[0.03]"
                            : s.isActive
                              ? "bg-white/[0.02]"
                              : ""
                      }`}
                    >
                      {/* Name */}
                      <TableCell className="font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          {s.isActive && (
                            <span className={`size-2 rounded-full ${
                              s.isCurrent ? "bg-[#E31837] animate-pulse" : "bg-blue-400"
                            }`} />
                          )}
                          {s.name}
                        </div>
                      </TableCell>

                      {/* Dates (compact) */}
                      <TableCell className="text-slate-400 text-xs">
                        {s.startDate && s.endDate
                          ? `${formatDateShort(s.startDate)} – ${formatDateShort(s.endDate)}`
                          : <span className="text-slate-600">&mdash;</span>
                        }
                      </TableCell>

                      {/* Weeks */}
                      <TableCell className="text-center text-slate-300">
                        {s.durationWeeks}w
                      </TableCell>

                      {/* Focus */}
                      <TableCell className="text-center text-slate-300">
                        {Math.round(s.focusFactor * 100)}%
                      </TableCell>

                      {/* DEV hrs */}
                      <TableCell className="text-right text-slate-300">
                        {forecast ? fmt(forecast.netDevHrs) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Projected SP */}
                      <TableCell className="text-right">
                        {forecast && forecast.projectedSPProven > 0 ? (
                          <span className="font-semibold text-emerald-400">
                            {fmt(forecast.projectedSPProven, 0)}
                          </span>
                        ) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        <Badge
                          variant="colored"
                          className={`text-[10px] ${SPRINT_STATUS_BADGE[s.status]?.className ?? ""}`}
                        >
                          {s.isActive && (
                            <Play className="size-2.5 mr-1 fill-current" />
                          )}
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
