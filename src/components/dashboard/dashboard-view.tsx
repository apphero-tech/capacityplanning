"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSprint } from "@/contexts/sprint-context";
import {
  computeDevCapacityFromIC,
  computeDevProjection,
} from "@/lib/capacity-engine";
import type { SprintStory } from "@/types";
import { formatDateRangeShort } from "@/lib/date-utils";

function fmt(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(n);
}

interface Props {
  storiesBySprint: Record<string, SprintStory[]>;
}

/**
 * Dashboard — answers the user's three opening questions in one screen:
 *   1. Where are we in the delivery cycle?
 *   2. Can DEV deliver the current sprint?
 *   3. Is anything missing to plan further out?
 *
 * The third question lives on the OnboardingProgress panel above this view.
 * Everything else is stripped — no mode banners, no coloured KPI stacks,
 * no chart-junk. If the user wants deeper analysis they click through to
 * the owner page (Sprints, Team, Capacity, Velocity).
 */
export function DashboardView({ storiesBySprint }: Props) {
  const {
    selectedSprint,
    allSprints,
    selectedForecast,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    forecastMap,
  } = useSprint();

  const sprint = selectedSprint;
  const currentSprint = allSprints.find((s) => s.isCurrent) ?? null;

  // Moving-average completed SP across every sprint with data. This is the
  // same calculation Velocity and Capacity use so all three pages tell the
  // user the same "we deliver about N SP per sprint" number.
  const avgCompletedSP = useMemo(() => {
    const done = allSprints
      .map((s) => s.completedSP)
      .filter((v): v is number => v != null && v > 0);
    if (done.length === 0) return null;
    return done.reduce((sum, v) => sum + v, 0) / done.length;
  }, [allSprints]);

  const progressFactor = sprint?.progressFactor ?? 0;
  const targetSP =
    avgCompletedSP != null ? avgCompletedSP * (1 + progressFactor) : null;

  const devStats = useMemo(() => {
    if (!sprint) return null;
    const stories = storiesBySprint[sprint.id] ?? [];
    const scope = stories
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    const devCaps = computeDevCapacityFromIC(
      initialCapacities.filter((c) => c.organization === "Deloitte"),
      sprint,
      publicHolidays,
      projectHolidays,
      ptoEntries,
    );
    const dp = computeDevProjection(
      devCaps,
      selectedForecast?.velocityProven ?? sprint.velocityProven ?? 0,
      selectedForecast?.velocityTarget ?? sprint.velocityTarget ?? 0,
      scope,
    );

    // Match the Capacity page: prefer target SP (avg × progress) when we
    // have history; fall back to velocity × hours when we don't.
    const useTarget = targetSP != null;
    const projectedSP = useTarget ? targetSP : dp.projectedSPProven;
    const gap = useTarget ? targetSP - scope : dp.gapProven;
    const coverage = useTarget
      ? scope > 0
        ? (targetSP / scope) * 100
        : 0
      : dp.coverageProven * 100;

    return {
      hours: dp.netDevCapacity,
      scopeSP: scope,
      projectedSP,
      gap,
      coverage,
      velocity: dp.velocityProven,
      stories: stories.length,
      useTarget,
    };
  }, [
    sprint,
    storiesBySprint,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
    targetSP,
  ]);

  // Next few sprints with projected SP, for a compact "what's coming" view.
  const upcoming = useMemo(() => {
    return allSprints
      .filter((s) => !s.isDemo)
      .filter(
        (s) => s.status === "current" || s.status === "next" || s.status === "planning",
      )
      .slice(0, 3)
      .map((s) => {
        const f = forecastMap.get(s.id);
        return { sprint: s, projectedSP: f?.projectedSPProven ?? null };
      });
  }, [allSprints, forecastMap]);

  if (!sprint) {
    return (
      <p className="text-sm text-slate-400">
        Select a sprint in the top bar to see delivery numbers.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hero — selected sprint DEV snapshot (Deloitte side) */}
      {devStats && (
        <section className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <p className="text-[12px] text-slate-500">
              {sprint.isCurrent ? "Current sprint" : "Selected sprint"}
            </p>
            <p className="text-[12px] text-slate-500">
              {formatDateRangeShort(sprint.startDate, sprint.endDate)}
            </p>
          </div>
          <h3 className="mt-1 text-xl font-semibold text-slate-100">{sprint.name}</h3>

          <div className="mt-5 grid gap-8 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium text-slate-500">
                {devStats.useTarget ? "Expected delivery" : "DEV capacity"}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
                {devStats.useTarget ? (
                  <>
                    {fmt(devStats.projectedSP)}{" "}
                    <span className="text-sm font-normal text-slate-500">SP</span>
                  </>
                ) : (
                  <>
                    {fmt(devStats.hours)}{" "}
                    <span className="text-sm font-normal text-slate-500">hrs</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">
                {devStats.useTarget
                  ? `avg ${fmt(avgCompletedSP!)} SP × ${progressFactor >= 0 ? "+" : ""}${fmt(progressFactor * 100)}% progress`
                  : `proj. ${fmt(devStats.projectedSP)} SP · vel ${devStats.velocity.toFixed(2)}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Scope</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
                {fmt(devStats.scopeSP)}{" "}
                <span className="text-sm font-normal text-slate-500">SP</span>
              </p>
              <p className="mt-1 text-[12px] text-slate-500">
                {devStats.stories} stories in {sprint.name}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Delta</p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  devStats.gap > 0
                    ? "text-emerald-300"
                    : devStats.gap < 0
                      ? "text-red-300"
                      : "text-slate-300"
                }`}
              >
                {devStats.gap > 0
                  ? `+${fmt(devStats.gap)} SP`
                  : devStats.gap < 0
                    ? `${fmt(devStats.gap)} SP`
                    : "balanced"}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">
                coverage {fmt(devStats.coverage)}%
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className={`h-full rounded-full ${
                  devStats.coverage >= 100
                    ? "bg-emerald-400/70"
                    : devStats.coverage >= 80
                      ? "bg-amber-400/70"
                      : "bg-red-400/70"
                }`}
                style={{ width: `${Math.max(0, Math.min(devStats.coverage, 120))}%` }}
              />
            </div>
            <Link
              href="/capacity"
              className="text-[12px] font-medium text-slate-400 hover:text-slate-200"
            >
              Open capacity →
            </Link>
          </div>
        </section>
      )}

      {/* Upcoming sprints — quick projection */}
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[13px] font-medium text-slate-300">Coming up</h3>
            {currentSprint && (
              <p className="text-[12px] text-slate-500">
                starting from <span className="text-slate-300">{currentSprint.name}</span>
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-white/[0.04] divide-y divide-white/[0.04]">
            {upcoming.map(({ sprint: s, projectedSP }) => (
              <Link
                key={s.id}
                href="/capacity"
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.02]"
              >
                <div>
                  <p className="text-[13px] text-slate-200">{s.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatDateRangeShort(s.startDate, s.endDate)} · {s.durationWeeks}w
                  </p>
                </div>
                <p className="text-[13px] tabular-nums text-slate-400">
                  {projectedSP != null && projectedSP > 0 ? (
                    <>
                      <span className="text-slate-200 font-medium">{fmt(projectedSP)}</span>
                      <span className="ml-1 text-slate-500">SP projected</span>
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
