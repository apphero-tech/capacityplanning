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
 * Plan — the single "can we deliver this sprint?" page.
 *
 * Answers exactly one question in exactly three numbers: what the team can
 * produce, what's currently in the sprint, and whether the two fit. Every
 * secondary knob (focus factor, progress factor, cycle breakdown, target
 * vs practical distinction) is hidden from the default view — the user
 * doesn't need to reason about them to get a clear yes/no.
 *
 * History of the last 6 sprints sits underneath as a sanity check.
 */
export function CapacityView({ storiesBySprint }: Props) {
  const {
    selectedSprint: sprint,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
    allSprints,
  } = useSprint();

  const plan = useMemo(() => {
    if (!sprint) return null;

    const stories = storiesBySprint[sprint.id] ?? [];
    const scopeSP = stories
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    // Practical capacity: Deloitte allocations adjusted for PTO & holidays,
    // multiplied by the velocity we've historically achieved.
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
      teamCanDeliver: dp.projectedSPProven,
      scopeSP,
      stories: stories.length,
      delta: dp.projectedSPProven - scopeSP,
      devHours: dp.netDevCapacity,
    };
  }, [
    sprint,
    storiesBySprint,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
  ]);

  // Compact history — last closed sprints with completed SP.
  const history = useMemo(() => {
    return allSprints
      .filter((s) => s.completedSP != null && s.completedSP > 0)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
      .slice(-6);
  }, [allSprints]);

  const historicalAvg = useMemo(() => {
    if (history.length === 0) return null;
    const sum = history.reduce((s, sp) => s + (sp.completedSP ?? 0), 0);
    return sum / history.length;
  }, [history]);

  if (!sprint) {
    return (
      <p className="text-sm text-slate-400">Select a sprint in the top bar.</p>
    );
  }

  if (!plan) return null;

  const fits = plan.delta >= 0;
  const verdictColor = fits ? "text-emerald-300" : "text-red-300";
  const verdictIcon = fits ? Check : AlertTriangle;
  const VerdictIcon = verdictIcon;
  const verdictText = fits
    ? `Fits · ${fmt(plan.delta)} SP of room`
    : `Overflow · ${fmt(Math.abs(plan.delta))} SP to cut`;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero — one question, one answer */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-[12px] text-slate-500">
            Can we deliver <span className="text-slate-200 font-medium">{sprint.name}</span>?
          </p>
          <p className="text-[12px] text-slate-500">
            {formatDateRangeShort(sprint.startDate, sprint.endDate)}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          <Line label="Team can deliver" value={`${fmt(plan.teamCanDeliver)} SP`} />
          <Line
            label="Sprint scope"
            value={`${fmt(plan.scopeSP)} SP`}
            hint={`${plan.stories} stor${plan.stories === 1 ? "y" : "ies"} in ${sprint.name}`}
          />
          <div className="border-t border-white/[0.06] pt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-slate-300">Verdict</p>
              <p
                className={`text-xl font-semibold tabular-nums flex items-center gap-2 ${verdictColor}`}
              >
                <VerdictIcon className="size-4" />
                {verdictText}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-5 text-[11px] text-slate-500">
          Based on {plan.devHours.toFixed(0)} DEV hours available in {sprint.name} — after
          allocations, public holidays and logged PTO.
        </p>
      </section>

      {/* Historical sanity check */}
      {history.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[13px] font-medium text-slate-300">Last {history.length} sprints delivered</h3>
            {historicalAvg != null && (
              <p className="text-[12px] text-slate-500 tabular-nums">
                avg <span className="text-slate-300">{fmt(historicalAvg)}</span> SP/sprint
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {history.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-white/[0.04] bg-slate-900/30 px-3 py-2"
              >
                <p className="text-[11px] text-slate-500 truncate" title={s.name}>
                  {s.name}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">
                  {fmt(s.completedSP)} <span className="text-[11px] text-slate-500">SP</span>
                </p>
                {s.commitmentSP != null && s.commitmentSP > 0 && (
                  <p className="text-[10px] text-slate-600 tabular-nums">
                    committed {fmt(s.commitmentSP)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
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
