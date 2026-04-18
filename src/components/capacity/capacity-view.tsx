"use client";

import { useMemo } from "react";
import { useSprint } from "@/contexts/sprint-context";
import type { SprintStory } from "@/types";
import {
  computeDevCapacityFromIC,
  computeDevProjection,
} from "@/lib/capacity-engine";
import { formatDateRangeShort } from "@/lib/date-utils";
import { Check, AlertTriangle } from "lucide-react";

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface Props {
  storiesBySprint: Record<string, SprintStory[]>;
}

/**
 * Plan — "can we deliver this sprint?" in three ascending layers:
 *
 *  1. Hero verdict (team can deliver vs scope, fits / overflow)
 *  2. Capacity breakdown (developers, theoretical hours, net hours after PTO)
 *  3. Three velocity-based projections (last sprint, last 3 avg, all-time)
 *
 * Everything that isn't a number + label is stripped. No coloured KPI
 * grids, no icons, no charts — just the math the user wants to audit.
 */
export function CapacityView({ storiesBySprint }: Props) {
  const {
    selectedSprint: sprint,
    allSprints,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
  } = useSprint();

  const deloitteDevelopers = useMemo(
    () =>
      initialCapacities.filter(
        (c) => c.organization === "Deloitte" && c.isActive && c.development > 0,
      ),
    [initialCapacities],
  );

  // Historical velocity signals derived from closed sprints.
  const velocityStats = useMemo(() => {
    const closed = [...allSprints]
      .filter((s) => s.completedSP != null && s.completedSP > 0)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

    const velocities: { sprint: string; completed: number; hrs: number; velocity: number }[] = [];
    for (const s of closed) {
      const caps = computeDevCapacityFromIC(
        initialCapacities.filter((c) => c.organization === "Deloitte"),
        s,
        publicHolidays,
        projectHolidays,
        ptoEntries,
      );
      const hrs = caps.reduce((sum, d) => sum + d.netDevHrs, 0);
      if (hrs > 0 && s.completedSP != null) {
        velocities.push({
          sprint: s.name,
          completed: s.completedSP,
          hrs,
          velocity: s.completedSP / hrs,
        });
      }
    }

    const last = velocities[velocities.length - 1] ?? null;
    const last3 = velocities.slice(-3);
    const allAvg =
      velocities.length > 0
        ? velocities.reduce((s, v) => s + v.velocity, 0) / velocities.length
        : null;
    const last3Avg =
      last3.length > 0 ? last3.reduce((s, v) => s + v.velocity, 0) / last3.length : null;

    return { velocities, last, last3Avg, allAvg };
  }, [allSprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries]);

  const plan = useMemo(() => {
    if (!sprint) return null;

    const stories = storiesBySprint[sprint.id] ?? [];
    const scopeSP = stories
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    // Theoretical hours (no PTO, no holidays, no focus factor) — just
    // developer headcount × hrs/week × development% × sprint weeks.
    const theoreticalHrs = deloitteDevelopers.reduce((sum, m) => {
      return sum + m.hrsPerWeek * m.development * sprint.durationWeeks;
    }, 0);

    // Net hours after deducting PTO + public/project holidays.
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
      scopeSP,
    );

    return {
      scopeSP,
      stories: stories.length,
      developers: deloitteDevelopers.length,
      theoreticalHrs,
      netDevHrs: dp.netDevCapacity,
      offHours: theoreticalHrs - dp.netDevCapacity,
      defaultProjection: dp.projectedSPProven,
      defaultVelocity: dp.velocityProven,
    };
  }, [
    sprint,
    storiesBySprint,
    deloitteDevelopers,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
  ]);

  if (!sprint) {
    return (
      <p className="text-sm text-slate-400">Select a sprint in the top bar.</p>
    );
  }

  if (!plan) return null;

  const fits = plan.defaultProjection - plan.scopeSP >= 0;
  const verdictColor = fits ? "text-emerald-300" : "text-red-300";
  const VerdictIcon = fits ? Check : AlertTriangle;
  const verdictText = fits
    ? `Fits · ${fmt(plan.defaultProjection - plan.scopeSP)} SP of room`
    : `Overflow · ${fmt(Math.abs(plan.defaultProjection - plan.scopeSP))} SP to cut`;

  const projections = [
    {
      label: "Last sprint velocity",
      hint:
        velocityStats.last != null
          ? `${velocityStats.last.sprint} · ${velocityStats.last.velocity.toFixed(2)} SP/hr`
          : "no data yet",
      velocity: velocityStats.last?.velocity ?? null,
    },
    {
      label: "Avg last 3 sprints",
      hint:
        velocityStats.last3Avg != null
          ? `${velocityStats.last3Avg.toFixed(2)} SP/hr`
          : "need 3 closed sprints",
      velocity: velocityStats.last3Avg,
    },
    {
      label: "All-time average",
      hint:
        velocityStats.allAvg != null
          ? `${velocityStats.velocities.length} sprints · ${velocityStats.allAvg.toFixed(2)} SP/hr`
          : "no history",
      velocity: velocityStats.allAvg,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Hero verdict */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-[12px] text-slate-500">
            Can we deliver{" "}
            <span className="text-slate-200 font-medium">{sprint.name}</span>?
          </p>
          <p className="text-[12px] text-slate-500">
            {formatDateRangeShort(sprint.startDate, sprint.endDate)}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          <Line
            label="Team can deliver"
            value={`${fmt(plan.defaultProjection)} SP`}
            hint={`at ${plan.defaultVelocity.toFixed(2)} SP/hr`}
          />
          <Line
            label="Sprint scope"
            value={`${fmt(plan.scopeSP)} SP`}
            hint={`${plan.stories} stor${plan.stories === 1 ? "y" : "ies"}`}
          />
          <div className="border-t border-white/[0.06] pt-3 flex items-baseline justify-between">
            <p className="text-[13px] font-medium text-slate-300">Verdict</p>
            <p className={`text-xl font-semibold tabular-nums flex items-center gap-2 ${verdictColor}`}>
              <VerdictIcon className="size-4" />
              {verdictText}
            </p>
          </div>
        </div>
      </section>

      {/* Capacity breakdown */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-300 mb-3">
          Hours available
        </h3>
        <div className="rounded-2xl border border-white/[0.04] bg-slate-900/30 divide-y divide-white/[0.04]">
          <BreakdownRow
            label="Developers"
            value={plan.developers.toString()}
            hint="active Deloitte members with DEV allocation"
          />
          <BreakdownRow
            label="Theoretical hours"
            value={`${fmt(plan.theoreticalHrs)} hrs`}
            hint={`${plan.developers} devs × hrs/week × DEV % × ${sprint.durationWeeks} weeks`}
          />
          <BreakdownRow
            label="Days off deducted"
            value={`−${fmt(plan.offHours)} hrs`}
            hint="PTO + public holidays + project closures"
          />
          <BreakdownRow
            label="Net DEV hours"
            value={`${fmt(plan.netDevHrs)} hrs`}
            emphasis
          />
        </div>
      </section>

      {/* Projection scenarios */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-300 mb-3">
          What we could deliver in {fmt(plan.netDevHrs)} hours
        </h3>
        <div className="rounded-2xl border border-white/[0.04] bg-slate-900/30 divide-y divide-white/[0.04]">
          {projections.map((p) => {
            const projected = p.velocity != null ? plan.netDevHrs * p.velocity : null;
            return (
              <div
                key={p.label}
                className="flex items-baseline justify-between px-5 py-3"
              >
                <div>
                  <p className="text-[13px] text-slate-200">{p.label}</p>
                  <p className="text-[11px] text-slate-500">{p.hint}</p>
                </div>
                <p className="text-xl font-semibold tabular-nums text-slate-100">
                  {projected != null ? (
                    <>
                      {fmt(projected)}{" "}
                      <span className="text-sm font-normal text-slate-500">SP</span>
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Line({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <p className="text-[13px] text-slate-400">{label}</p>
      <div className="text-right">
        <p className="text-xl font-semibold tabular-nums text-slate-100">{value}</p>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <div>
        <p className={`text-[13px] ${emphasis ? "font-medium text-slate-100" : "text-slate-400"}`}>
          {label}
        </p>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
      <p
        className={`tabular-nums ${
          emphasis
            ? "text-xl font-semibold text-slate-100"
            : "text-[15px] text-slate-300"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
