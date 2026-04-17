"use client";

import { useMemo, useState } from "react";
import { SegmentedControl, ChipFilter } from "@/components/ui/segmented-control";
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
    allSprints,
    selectedForecast,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  } = useSprint();

  // Capacity conversations center on Deloitte first — York is a separate
  // review pass, All shows the combined available pool.
  const [orgFilter, setOrgFilter] = useState<string>("Deloitte");
  // Stream filter only covers the four workflow cycles (Refining, Design,
  // Development, QA). Lead/PMO/Retro/OCM stay out because they aren't
  // delivery streams — they don't convert hours into story points.
  const [streamFilter, setStreamFilter] = useState<string>("all");

  // Scope org filter to the capacity engine.
  const scopedCapacities = useMemo(() => {
    if (orgFilter === "all") return initialCapacities;
    return initialCapacities.filter((c) => c.organization === orgFilter);
  }, [initialCapacities, orgFilter]);

  const { capacityRows, devProjection, cycleInfo } = useMemo(() => {
    const emptyProjection = {
      netDevCapacity: 0,
      velocityProven: 0,
      velocityTarget: 0,
      projectedSPProven: 0,
      projectedSPTarget: 0,
      backlogDevSP: 0,
      gapProven: 0,
      gapTarget: 0,
      coverageProven: 0,
      coverageTarget: 0,
    };
    if (!sprint) {
      return {
        capacityRows: [] as CapacityRow[],
        devProjection: emptyProjection,
        cycleInfo: { prev: null, next: null },
      };
    }

    // Find the previous/next delivery sprints (demo sprints are skipped so a
    // Product Demo sprint doesn't shift the scope by one slot).
    const orderedSprints = [...allSprints]
      .filter((s) => !s.isDemo)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const idx = orderedSprints.findIndex((s) => s.id === sprint.id);
    const prev = idx > 0 ? orderedSprints[idx - 1] : null;
    const next = idx >= 0 && idx < orderedSprints.length - 1 ? orderedSprints[idx + 1] : null;

    // Apply the 3-cycle rule:
    //   refining (cycle 1) at sprint N = stories that will be dev-ed at N+1
    //   design   (cycle 1) at sprint N = same pool as refining
    //   dev      (cycle 2) at sprint N = stories planned for sprint N
    //   qa       (cycle 3) at sprint N = stories dev-ed at N-1
    const refineScope = next ? (storiesBySprint[next.id] ?? []) : [];
    const devScope = storiesBySprint[sprint.id] ?? [];
    const qaScope = prev ? (storiesBySprint[prev.id] ?? []) : [];

    const storiesByStream = {
      "1-REF": refineScope,
      "2-DES": refineScope,
      "3-DEV": devScope,
      "4-QA": qaScope,
    } as const;

    const devCapacities = computeDevCapacityFromIC(scopedCapacities, sprint, publicHolidays, projectHolidays, ptoEntries);
    const streamHrs = computeStreamCapacityFromIC(scopedCapacities, sprint, publicHolidays, projectHolidays, ptoEntries);

    // DEV projection is driven by the current sprint's own scope.
    const totalBacklogSP = devScope
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    const dp = computeDevProjection(
      devCapacities,
      selectedForecast?.velocityProven ?? sprint.velocityProven ?? 0,
      selectedForecast?.velocityTarget ?? sprint.velocityTarget ?? 0,
      totalBacklogSP
    );

    const rows = computeCapacityRows(storiesByStream, [], dp, streamHrs);
    return { capacityRows: rows, devProjection: dp, cycleInfo: { prev, next } };
  }, [scopedCapacities, storiesBySprint, sprint, allSprints, publicHolidays, projectHolidays, ptoEntries, selectedForecast]);

  // Optional per-cycle filter on the rows displayed in the Capacity table.
  const visibleRows = useMemo(() => {
    if (streamFilter === "all") return capacityRows;
    return capacityRows.filter((r) => r.stream === streamFilter);
  }, [capacityRows, streamFilter]);

  if (!sprint) {
    return <p className="text-sm text-slate-400">No sprint selected.</p>;
  }

  const totalScopeSP = visibleRows.reduce((s, r) => s + r.scopeSP, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Filter toolbar — same pattern as Team page */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-3">
        <SegmentedControl
          options={[
            { value: "all",      label: "All" },
            { value: "Deloitte", label: "Deloitte" },
            { value: "York",     label: "York" },
          ]}
          value={orgFilter}
          onChange={setOrgFilter}
        />
        <ChipFilter
          options={[
            { value: "all",    label: "All streams" },
            { value: "1-REF",  label: "Refining" },
            { value: "2-DES",  label: "Design" },
            { value: "3-DEV",  label: "Development" },
            { value: "4-QA",   label: "QA" },
          ]}
          value={streamFilter}
          onChange={setStreamFilter}
        />
      </div>

      {/* Cycle scope provenance — reminds the user which sprint feeds each cycle */}
      <p className="text-[12px] text-slate-500">
        Team available at <span className="text-slate-300">{sprint.name}</span>
        {cycleInfo.next && (
          <>
            {" · "}refining &amp; design from{" "}
            <span className="text-slate-300">{cycleInfo.next.name}</span>
          </>
        )}
        {cycleInfo.prev && (
          <>
            {" · "}QA from <span className="text-slate-300">{cycleInfo.prev.name}</span>
          </>
        )}
      </p>

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
            hint: `${visibleRows.reduce((s, r) => s + r.stories, 0)} stories`,
          },
        ]}
      />

      {/* Capacity vs Scope table */}
      <div>
        <h3 className="text-[13px] font-medium text-slate-300 mb-3">Capacity vs. scope</h3>
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
              {visibleRows.map((row) => (
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
                  {visibleRows.reduce((s, r) => s + r.stories, 0)}
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-200">
                  {fmt(totalScopeSP, 0)}
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-200">
                  {fmt(visibleRows.reduce((s, r) => s + r.totalHrs, 0))}
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
