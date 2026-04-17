"use client";

import { useMemo } from "react";
import type { CapacityRow, SprintStory } from "@/types";
import { useSprint } from "@/contexts/sprint-context";
import { formatDateRange } from "@/lib/date-utils";
import {
  STREAM_LABELS,
  STREAM_COLORS,
  COVERAGE_STATUS_BADGE,
} from "@/lib/constants";
import { getBadgeClasses } from "@/lib/badge-utils";
import {
  computeDevCapacityFromIC,
  computeStreamCapacityFromIC,
  computeDevProjection,
  computeCapacityRows,
} from "@/lib/capacity-engine";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { StatStrip } from "@/components/ui/stat-strip";
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
  Clock,
  Target,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "-";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return `${fmt(n, 1)}%`;
}

function gapColor(gap: number | null): string {
  if (gap === null) return "text-slate-500";
  if (gap >= 0) return "text-emerald-400";
  return "text-red-400";
}

function coverageColor(pct: number | null): string {
  if (pct === null) return "text-slate-500";
  if (pct >= 100) return "text-emerald-400";
  if (pct >= 80) return "text-amber-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CapacityViewProps {
  storiesBySprint: Record<string, SprintStory[]>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CapacityView({
  storiesBySprint,
}: CapacityViewProps) {
  const {
    selectedSprint: sprint,
    selectedForecast,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  } = useSprint();

  const { capacityRows, devProjection } = useMemo(() => {
    if (!sprint) {
      return { capacityRows: [] as CapacityRow[], devProjection: { netDevCapacity: 0, velocityProven: 0, velocityTarget: 0, projectedSPProven: 0, projectedSPTarget: 0, backlogDevSP: 0, gapProven: 0, gapTarget: 0, coverageProven: 0, coverageTarget: 0 } };
    }

    // Stories already have isExcluded computed from server
    const stories = storiesBySprint[sprint.id] ?? [];

    // IC-based capacity computation
    const devCapacities = computeDevCapacityFromIC(initialCapacities, sprint, publicHolidays, projectHolidays, ptoEntries);
    const streamHrs = computeStreamCapacityFromIC(initialCapacities, sprint, publicHolidays, projectHolidays, ptoEntries);

    // DEV must deliver ALL active stories in the sprint (full scope, not just 3-DEV status)
    const totalBacklogSP = stories
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    const dp = computeDevProjection(
      devCapacities,
      selectedForecast?.velocityProven ?? sprint.velocityProven ?? 0,
      selectedForecast?.velocityTarget ?? sprint.velocityTarget ?? 0,
      totalBacklogSP
    );

    const rows = computeCapacityRows(stories, [], dp, streamHrs);
    return { capacityRows: rows, devProjection: dp };
  }, [initialCapacities, storiesBySprint, sprint, publicHolidays, projectHolidays, ptoEntries, selectedForecast]);

  if (!sprint) {
    return <p className="text-sm text-slate-400">No sprint selected.</p>;
  }

  const totalScopeSP = capacityRows.reduce((s, r) => s + r.scopeSP, 0);

  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        stats={[
          {
            label: "Sprint",
            value: sprint.name,
            hint: formatDateRange(sprint.startDate, sprint.endDate),
          },
          {
            label: "Duration",
            value: `${sprint.durationWeeks}w`,
            hint: `${sprint.workingDays} working days`,
          },
          {
            label: "Focus factor",
            value: `${Math.round(sprint.focusFactor * 100)}%`,
            hint: "productivity",
          },
          {
            label: "Scope",
            value: `${fmt(totalScopeSP, 0)} USP`,
            hint: `${capacityRows.reduce((s, r) => s + r.stories, 0)} stories`,
          },
        ]}
      />

      {/* Capacity vs Scope table */}
      <div>
        <div className="mb-3">
          <h3 className="text-[13px] font-medium text-slate-300">Capacity vs. scope</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Breakdown by stream with projected capacity and coverage
          </p>
        </div>
        <div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.04] hover:bg-transparent">
                <TableHead className="text-[11px] font-medium text-slate-500">Stream</TableHead>
                <TableHead className="text-[11px] font-medium text-slate-500 text-right">
                  Stories
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Scope (SP)
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Capacity (hrs)
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Velocity (SP/hr)
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Projected SP
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Gap (SP)
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Coverage
                </TableHead>
                <TableHead className="text-center text-slate-400">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capacityRows.map((row) => (
                  <TableRow
                    key={row.stream}
                    className="border-white/[0.06] hover:bg-white/[0.02]"
                  >
                    {/* Stream */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              STREAM_COLORS[row.stream] ?? "#6b7280",
                          }}
                        />
                        <span className="font-medium text-slate-200">
                          {STREAM_LABELS[row.stream] ?? row.stream}
                        </span>
                      </div>
                    </TableCell>

                    {/* Stories */}
                    <TableCell className="text-right text-slate-300">
                      {row.stories}
                    </TableCell>

                    {/* Scope (SP) */}
                    <TableCell className="text-right font-medium text-slate-200">
                      {fmt(row.scopeSP, 0)}
                    </TableCell>

                    {/* Capacity hrs */}
                    <TableCell className="text-right text-slate-300">
                      {fmt(row.totalHrs)}
                    </TableCell>

                    {/* Velocity */}
                    <TableCell className="text-right text-slate-300">
                      {row.velocity !== null ? fmt(row.velocity, 2) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </TableCell>

                    {/* Projected SP */}
                    <TableCell className="text-right text-slate-300">
                      {row.projectedSP !== null ? fmt(row.projectedSP) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </TableCell>

                    {/* Gap */}
                    <TableCell
                      className={`text-right font-medium ${gapColor(row.gap)}`}
                    >
                      {row.gap !== null ? (
                        <span className="inline-flex items-center gap-1">
                          {row.gap > 0 ? "+" : ""}
                          {fmt(row.gap)}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </TableCell>

                    {/* Coverage */}
                    <TableCell
                      className={`text-right font-medium ${coverageColor(
                        row.coveragePercent
                      )}`}
                    >
                      {row.coveragePercent !== null
                        ? fmtPct(row.coveragePercent)
                        : <span className="text-slate-600">-</span>}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      <Badge
                        variant="colored"
                        className={getBadgeClasses("coverage", row.status)}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}

              {/* Totals row */}
              <TableRow className="border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03]">
                <TableCell className="font-semibold text-slate-200">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-200">
                  {capacityRows.reduce((s, r) => s + r.stories, 0)}
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-200">
                  {fmt(totalScopeSP, 0)}
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-200">
                  {fmt(capacityRows.reduce((s, r) => s + r.totalHrs, 0))}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Section 3 – DEV Projection Cards                                  */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Realistic (Proven Velocity) */}
        <ProjectionCard
          title="Realistic"
          subtitle="Proven Velocity"
          accentColor="text-[#E31837]"
          accentBg="bg-[#E31837]/15"
          netDevCapacity={devProjection.netDevCapacity}
          velocity={devProjection.velocityProven}
          projectedSP={devProjection.projectedSPProven}
          backlogDevSP={devProjection.backlogDevSP}
          gap={devProjection.gapProven}
          coverage={devProjection.coverageProven * 100}
        />

        {/* Optimistic (Target Velocity) */}
        <ProjectionCard
          title="Optimistic"
          subtitle="Target Velocity"
          accentColor="text-emerald-400"
          accentBg="bg-emerald-500/15"
          netDevCapacity={devProjection.netDevCapacity}
          velocity={devProjection.velocityTarget}
          projectedSP={devProjection.projectedSPTarget}
          backlogDevSP={devProjection.backlogDevSP}
          gap={devProjection.gapTarget}
          coverage={devProjection.coverageTarget * 100}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projection Card sub-component
// ---------------------------------------------------------------------------

interface ProjectionCardProps {
  title: string;
  subtitle: string;
  accentColor: string;
  accentBg: string;
  netDevCapacity: number;
  velocity: number;
  projectedSP: number;
  backlogDevSP: number;
  gap: number;
  coverage: number;
}

function ProjectionCard({
  title,
  subtitle,
  accentColor,
  accentBg,
  netDevCapacity,
  velocity,
  projectedSP,
  backlogDevSP,
  gap,
  coverage,
}: ProjectionCardProps) {
  const GapIcon = gap > 0 ? TrendingUp : gap < 0 ? TrendingDown : Minus;

  return (
    <Card className="border-white/[0.06] bg-slate-900/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 items-center justify-center rounded-lg ${accentBg}`}
          >
            <TrendingUp className={`size-4 ${accentColor}`} />
          </div>
          <div>
            <CardTitle className="text-slate-100">{title}</CardTitle>
            <CardDescription className="text-slate-400">
              {subtitle}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {/* Net Dev Capacity */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Net Dev Capacity
            </p>
            <p className="mt-1 text-xl font-bold text-slate-100">
              {fmt(netDevCapacity)} hrs
            </p>
          </div>

          {/* Velocity */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Velocity
            </p>
            <p className={`mt-1 text-xl font-bold ${accentColor}`}>
              {fmt(velocity, 2)} SP/hr
            </p>
          </div>

          {/* Projected SP */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Projected
            </p>
            <p className="mt-1 text-xl font-bold text-slate-100">
              {fmt(projectedSP)} SP
            </p>
          </div>

          {/* Sprint Scope */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Sprint Scope
            </p>
            <p className="mt-1 text-xl font-bold text-slate-100">
              {fmt(backlogDevSP, 0)} SP
            </p>
          </div>

          {/* Gap */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Gap
            </p>
            <div className={`mt-1 flex items-center gap-1.5 ${gapColor(gap)}`}>
              <GapIcon className="size-4" />
              <span className="text-xl font-bold">
                {gap > 0 ? "+" : ""}
                {fmt(gap)} SP
              </span>
            </div>
          </div>

          {/* Coverage */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Coverage
            </p>
            <p
              className={`mt-1 text-xl font-bold ${coverageColor(coverage)}`}
            >
              {fmtPct(coverage)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
