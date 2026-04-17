"use client";

import { useMemo, useState } from "react";
import { SegmentedControl, ChipFilter } from "@/components/ui/segmented-control";
import type { CapacityRow, SprintStory } from "@/types";
import { useSprint } from "@/contexts/sprint-context";
import {
  computeDevCapacityFromIC,
  computeStreamCapacityFromIC,
  computeDevProjection,
  computeCapacityRows,
} from "@/lib/capacity-engine";
import { STREAM_LABELS } from "@/lib/constants";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface CapacityViewProps {
  storiesBySprint: Record<string, SprintStory[]>;
}

/**
 * Capacity planning — DEV-first simplification.
 *
 * The whole page is built around one question: "Can we deliver the selected
 * sprint?" The hero answers it in three numbers (available DEV hours, scope
 * in story points, delta). The four-cycle breakdown lives below as a
 * supporting table — visible but not the first thing you read.
 */
export function CapacityView({ storiesBySprint }: CapacityViewProps) {
  const {
    selectedSprint: sprint,
    allSprints,
    selectedForecast,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  } = useSprint();

  const [orgFilter, setOrgFilter] = useState<string>("Deloitte");
  const [streamFilter, setStreamFilter] = useState<string>("all");

  const scopedCapacities = useMemo(
    () =>
      orgFilter === "all"
        ? initialCapacities
        : initialCapacities.filter((c) => c.organization === orgFilter),
    [initialCapacities, orgFilter],
  );

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

    const ordered = [...allSprints]
      .filter((s) => !s.isDemo)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const idx = ordered.findIndex((s) => s.id === sprint.id);
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

    const refineScope = next ? storiesBySprint[next.id] ?? [] : [];
    const devScope = storiesBySprint[sprint.id] ?? [];
    const qaScope = prev ? storiesBySprint[prev.id] ?? [] : [];

    const storiesByStream = {
      "1-REF": refineScope,
      "2-DES": refineScope,
      "3-DEV": devScope,
      "4-QA": qaScope,
    } as const;

    const devCapacities = computeDevCapacityFromIC(
      scopedCapacities,
      sprint,
      publicHolidays,
      projectHolidays,
      ptoEntries,
    );
    const streamHrs = computeStreamCapacityFromIC(
      scopedCapacities,
      sprint,
      publicHolidays,
      projectHolidays,
      ptoEntries,
    );

    const totalBacklogSP = devScope
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    const dp = computeDevProjection(
      devCapacities,
      selectedForecast?.velocityProven ?? sprint.velocityProven ?? 0,
      selectedForecast?.velocityTarget ?? sprint.velocityTarget ?? 0,
      totalBacklogSP,
    );

    const rows = computeCapacityRows(storiesByStream, [], dp, streamHrs);
    return { capacityRows: rows, devProjection: dp, cycleInfo: { prev, next } };
  }, [
    scopedCapacities,
    storiesBySprint,
    sprint,
    allSprints,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
  ]);

  if (!sprint) {
    return <p className="text-sm text-slate-400">Select a sprint in the top bar.</p>;
  }

  const visibleRows = useMemo(() => {
    if (streamFilter === "all") return capacityRows;
    return capacityRows.filter((r) => r.stream === streamFilter);
  }, [capacityRows, streamFilter]);

  // DEV projection numbers drive the hero card.
  const devRow = capacityRows.find((r) => r.stream === "3-DEV");
  const devHours = devRow?.totalHrs ?? 0;
  const devScopeSP = devRow?.scopeSP ?? 0;

  // Prefer the target-based projection (moving avg × (1 + progress factor))
  // when we have historical data; fall back to velocity × hours otherwise.
  const avgCompletedSP = useMemo(() => {
    const withDone = allSprints
      .map((s) => sprint && s.id !== sprint.id ? s : null)
      .filter(Boolean)
      .map((s) => s!.completedSP)
      .filter((v): v is number => v != null && v > 0);
    if (withDone.length === 0) return null;
    return withDone.reduce((sum, v) => sum + v, 0) / withDone.length;
  }, [allSprints, sprint]);

  const progressFactor = sprint.progressFactor ?? 0;
  const targetSP =
    avgCompletedSP != null ? avgCompletedSP * (1 + progressFactor) : null;

  // When a target exists, the delta reads "target - scope" which is the
  // user's actual planning question ("can we fit this scope in what past
  // velocity tells us we deliver?"). Falls back to the velocity-based gap
  // when no history is available.
  const useTarget = targetSP != null;
  const devProjectedSP = useTarget ? targetSP : devProjection.projectedSPProven;
  const devGapSP = useTarget
    ? targetSP - devScopeSP
    : devProjection.gapProven;
  const devCoverage = useTarget
    ? devScopeSP > 0
      ? (targetSP / devScopeSP) * 100
      : 0
    : devProjection.coverageProven * 100;
  const deltaLabel =
    devGapSP > 0
      ? `+${fmt(devGapSP)} SP of room`
      : devGapSP < 0
        ? `${fmt(devGapSP)} SP short`
        : "balanced";
  const deltaTone =
    devGapSP > 0 ? "text-emerald-300" : devGapSP < 0 ? "text-red-300" : "text-slate-400";

  return (
    <div className="flex flex-col gap-8">
      {/* Filter toolbar */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-3">
        <SegmentedControl
          options={[
            { value: "all", label: "All" },
            { value: "Deloitte", label: "Deloitte" },
            { value: "York", label: "York" },
          ]}
          value={orgFilter}
          onChange={setOrgFilter}
        />
        <ChipFilter
          options={[
            { value: "all", label: "All streams" },
            { value: "1-REF", label: "Refining" },
            { value: "2-DES", label: "Design" },
            { value: "3-DEV", label: "Development" },
            { value: "4-QA", label: "QA" },
          ]}
          value={streamFilter}
          onChange={setStreamFilter}
        />
      </div>

      {/* Hero — can we deliver DEV this sprint? */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-6">
        <p className="text-[12px] text-slate-500">
          Can we deliver <span className="text-slate-200 font-medium">{sprint.name}</span>?
        </p>

        <div className="mt-4 grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium text-slate-500">
              {useTarget ? "Expected delivery" : "DEV capacity"}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-100">
              {useTarget ? (
                <>
                  {fmt(targetSP!)}{" "}
                  <span className="text-base font-normal text-slate-500">SP</span>
                </>
              ) : (
                <>
                  {fmt(devHours)}{" "}
                  <span className="text-base font-normal text-slate-500">hrs</span>
                </>
              )}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">
              {useTarget
                ? `avg ${fmt(avgCompletedSP!)} SP × ${progressFactor >= 0 ? "+" : ""}${fmt(progressFactor * 100)}% progress`
                : `proj. ${fmt(devProjectedSP)} SP @ vel ${devProjection.velocityProven.toFixed(2)}`}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">DEV scope</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-100">
              {fmt(devScopeSP)} <span className="text-base font-normal text-slate-500">SP</span>
            </p>
            <p className="mt-1 text-[12px] text-slate-500">
              {devRow?.stories ?? 0} stories planned for {sprint.name}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Delta</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${deltaTone}`}>
              {deltaLabel}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">
              coverage {fmt(devCoverage, 0)}%
            </p>
          </div>
        </div>

        {/* Coverage bar */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
          <div
            className={`h-full rounded-full transition-all ${
              devCoverage >= 100
                ? "bg-emerald-400/70"
                : devCoverage >= 80
                  ? "bg-amber-400/70"
                  : "bg-red-400/70"
            }`}
            style={{ width: `${Math.max(0, Math.min(devCoverage, 120))}%` }}
          />
        </div>
      </section>

      {/* Secondary — other cycles + scope provenance */}
      <section>
        <div className="mb-3 flex items-baseline justify-between flex-wrap gap-2">
          <h3 className="text-[13px] font-medium text-slate-300">By cycle</h3>
          <p className="text-[12px] text-slate-500">
            Team at <span className="text-slate-300">{sprint.name}</span>
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
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.04] hover:bg-transparent">
              <TableHead className="text-[11px] font-medium text-slate-500">Cycle</TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-20">
                Scope SP
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-16">
                Stories
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-24">
                Hours
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-24">
                Coverage
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const cov = row.coveragePercent;
              const covColor =
                cov === null
                  ? "text-slate-600"
                  : cov >= 100
                    ? "text-emerald-400"
                    : cov >= 80
                      ? "text-amber-400"
                      : "text-red-400";
              return (
                <TableRow
                  key={row.stream}
                  className="border-white/[0.04] hover:bg-white/[0.02]"
                >
                  <TableCell className="font-medium text-slate-200">
                    {STREAM_LABELS[row.stream] ?? row.stream}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-200">
                    {fmt(row.scopeSP)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-400">
                    {row.stories}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-400">
                    {fmt(row.totalHrs, 1)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${covColor}`}>
                    {cov === null ? "—" : `${fmt(cov, 0)}%`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
