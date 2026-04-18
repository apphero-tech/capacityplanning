"use client";

import { useMemo, useState } from "react";
import { useSprint } from "@/contexts/sprint-context";
import { useProjectionSettings } from "@/contexts/projection-settings-context";
import type { SprintStory } from "@/types";
import {
  computeDevCapacityFromIC,
  computeDevProjection,
  computeHistoricalVelocity,
  computeCurrentSprintVelocity,
  VELOCITY_BASIS_LABEL,
  type VelocityBasis,
} from "@/lib/capacity-engine";
import { formatDateRangeShort } from "@/lib/date-utils";
import { Check, AlertTriangle, Info } from "lucide-react";

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
  } = useSprint();
  const {
    basis,
    growthPct,
    setBasis,
    setGrowthPct,
    effectiveMultiplier,
  } = useProjectionSettings();

  const deloitteDevelopers = useMemo(
    () =>
      initialCapacities.filter(
        (c) => c.organization === "Deloitte" && c.isActive && c.development > 0,
      ),
    [initialCapacities],
  );

  // One velocity per basis — evaluated up-front so we can show a projection
  // for every choice side-by-side and highlight the one currently active.
  const basisResults = useMemo(() => {
    const bases: VelocityBasis[] = ["last1", "last2", "last3", "last6", "all"];
    const deloitteIC = initialCapacities.filter((c) => c.organization === "Deloitte");
    return bases.map((b) => ({
      basis: b,
      result: computeHistoricalVelocity(
        allSprints,
        deloitteIC,
        publicHolidays,
        projectHolidays,
        ptoEntries,
        b,
      ),
    }));
  }, [allSprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries]);

  const activeVelocity =
    basisResults.find((b) => b.basis === basis)?.result.velocity ?? 0;

  // Live velocity of the sprint currently in flight — shown alongside the
  // historical bases as context (not selectable as a projection basis).
  const currentVelocity = useMemo(
    () =>
      computeCurrentSprintVelocity(
        allSprints,
        initialCapacities.filter((c) => c.organization === "Deloitte"),
        publicHolidays,
        projectHolidays,
        ptoEntries,
      ),
    [allSprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries],
  );

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
    const netDevHrs = devCaps.reduce((sum, d) => sum + d.netDevHrs, 0);
    const effectiveVelocity = activeVelocity * effectiveMultiplier;
    const defaultProjection = netDevHrs * effectiveVelocity;
    const dp = computeDevProjection(
      devCaps,
      effectiveVelocity,
      effectiveVelocity,
      scopeSP,
    );

    return {
      scopeSP,
      stories: stories.length,
      developers: deloitteDevelopers.length,
      theoreticalHrs,
      netDevHrs: dp.netDevCapacity,
      offHours: theoreticalHrs - dp.netDevCapacity,
      defaultProjection,
      defaultVelocity: effectiveVelocity,
      devCaps,
    };
  }, [
    sprint,
    storiesBySprint,
    deloitteDevelopers,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    activeVelocity,
    effectiveMultiplier,
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
    ? `Fits — ${fmt(plan.defaultProjection - plan.scopeSP)} SP of room`
    : `Overflow — ${fmt(Math.abs(plan.defaultProjection - plan.scopeSP))} SP to cut`;

  const projections = basisResults.map(({ basis: b, result }) => {
    const effectiveVelocity = result.velocity * effectiveMultiplier;
    return {
      basis: b,
      label: VELOCITY_BASIS_LABEL[b],
      baseVelocity: result.velocity,
      effectiveVelocity,
      sprintCount: result.sprintCount,
      sprintNames: result.sprintNames,
      projected: result.velocity > 0 ? plan.netDevHrs * effectiveVelocity : null,
    };
  });

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

        {/* Inline projection knobs — basis + growth side-by-side right under
            the verdict so the user can tweak and see the number move without
            scrolling. */}
        <div className="mt-5 border-t border-white/[0.06] pt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Velocity
            </span>
            <div className="flex rounded-lg border border-white/[0.06] bg-slate-950/40 p-0.5">
              {(
                [
                  { value: "last1" as VelocityBasis, label: "Last" },
                  { value: "last2" as VelocityBasis, label: "2" },
                  { value: "last3" as VelocityBasis, label: "3" },
                  { value: "last6" as VelocityBasis, label: "6" },
                  { value: "all" as VelocityBasis, label: "All" },
                ]
              ).map((o) => {
                const active = o.value === basis;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setBasis(o.value)}
                    className={`px-3 h-7 rounded-md text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Growth
            </span>
            <div className="flex rounded-lg border border-white/[0.06] bg-slate-950/40 p-0.5">
              {[0, 3, 5, 10, 20].map((p) => {
                const active = p === growthPct;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setGrowthPct(p)}
                    className={`px-3 h-7 rounded-md text-[12px] font-medium transition-colors tabular-nums ${
                      active
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {p === 0 ? "0%" : `+${p}%`}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 text-[12px] text-slate-500">
              <input
                type="number"
                value={growthPct}
                onChange={(e) => setGrowthPct(Number(e.target.value) || 0)}
                step={1}
                className="w-14 h-7 rounded-md border border-white/[0.06] bg-slate-950/40 px-2 text-[12px] text-slate-200 tabular-nums focus:border-white/20"
              />
              <span>%</span>
            </div>
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
            explain={
              <>
                <p className="font-medium text-slate-200 mb-1.5">
                  {plan.developers} active Deloitte developer
                  {plan.developers === 1 ? "" : "s"}
                </p>
                <ul className="space-y-1 text-slate-400">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-slate-200">{d.name}</span>
                      <span className="text-slate-500 tabular-nums">
                        {Math.round(d.devPercent * 100)}% DEV
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            }
          />
          <BreakdownRow
            label="Theoretical hours"
            value={`${fmt(plan.theoreticalHrs)} hrs`}
            hint={`${plan.developers} devs × hrs/wk × DEV % × ${sprint.durationWeeks} weeks`}
            explain={
              <>
                <p className="font-medium text-slate-200 mb-1.5">
                  Theoretical hours by developer
                </p>
                <ul className="space-y-1 text-slate-400">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-slate-200">
                        {d.name}
                        <span className="text-slate-500 ml-1.5">
                          {d.hrsPerWeek} hrs/wk · {Math.round(d.devPercent * 100)}%
                        </span>
                      </span>
                      <span className="text-slate-200 tabular-nums">
                        {fmt(d.grossHrs)} hrs
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-4 border-t border-white/10 pt-1 mt-1 text-slate-200">
                    <span className="font-medium">Total</span>
                    <span className="font-semibold tabular-nums">
                      {fmt(plan.theoreticalHrs)} hrs
                    </span>
                  </li>
                </ul>
                <p className="mt-2 text-[11px] text-slate-600">
                  No PTO, no holidays, no focus factor applied yet.
                </p>
              </>
            }
          />
          <BreakdownRow
            label="Days off deducted"
            value={`−${fmt(plan.offHours)} hrs`}
            hint="PTO + public holidays + project closures"
            explain={
              <>
                <p className="font-medium text-slate-200 mb-1.5">
                  Days off per developer
                </p>
                <ul className="space-y-1 text-slate-400">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-slate-200">{d.name}</span>
                      <span className="tabular-nums text-slate-300">
                        {d.holidays} day{d.holidays === 1 ? "" : "s"}{" "}
                        <span className="text-slate-500">
                          (−{fmt(d.holidayHrs)} hrs)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-slate-600">
                  PTO + public holidays + project closures, per member
                  location.
                </p>
              </>
            }
          />
          <BreakdownRow
            label="Net DEV hours"
            value={`${fmt(plan.netDevHrs)} hrs`}
            emphasis
            explain={
              <>
                <p className="font-medium text-slate-200 mb-1.5">
                  Net DEV hours per developer
                </p>
                <ul className="space-y-1 text-slate-400">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-slate-200">{d.name}</span>
                      <span className="text-slate-200 tabular-nums">
                        {fmt(d.netDevHrs)} hrs
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-4 border-t border-white/10 pt-1 mt-1 text-slate-200">
                    <span className="font-medium">Total</span>
                    <span className="font-semibold tabular-nums">
                      {fmt(plan.netDevHrs)} hrs
                    </span>
                  </li>
                </ul>
              </>
            }
          />
        </div>
      </section>

      {/* Projection scenarios — one per basis, click to make it active. */}
      <section>
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-[13px] font-medium text-slate-300">
            Compare velocity bases
          </h3>
          <p className="text-[11px] text-slate-500">
            Click a row to change the basis
          </p>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Same {fmt(plan.netDevHrs)} net DEV hours, different historical
          windows. The <span className="text-emerald-300">active</span> row
          drives the verdict above.
        </p>
        <div className="rounded-2xl border border-white/[0.04] bg-slate-900/30 divide-y divide-white/[0.04] overflow-hidden">
          {/* In-flight current sprint — context only, not a selectable basis. */}
          {currentVelocity && (
            <div className="flex items-baseline justify-between px-5 py-3 bg-amber-500/[0.04]">
              <div>
                <p className="text-[13px] flex items-center gap-2 text-slate-200">
                  {currentVelocity.sprintName} so far
                  <span className="text-[10px] font-medium uppercase tracking-wide text-amber-300">
                    in progress
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {fmt(currentVelocity.completedSP)} SP in{" "}
                  {fmt(currentVelocity.elapsedHrs)} of{" "}
                  {fmt(currentVelocity.fullHrs)} hrs (
                  {Math.round(currentVelocity.elapsedFraction * 100)}% elapsed) ·{" "}
                  {currentVelocity.velocity.toFixed(2)} SP/hr
                  {growthPct !== 0 && (
                    <> × {effectiveMultiplier.toFixed(2)}</>
                  )}
                </p>
              </div>
              <p className="text-xl font-semibold tabular-nums text-slate-300">
                {fmt(plan.netDevHrs * currentVelocity.velocity * effectiveMultiplier)}{" "}
                <span className="text-sm font-normal text-slate-500">SP</span>
              </p>
            </div>
          )}
          {projections.map((p) => {
            const active = p.basis === basis;
            const hasData = p.baseVelocity > 0;
            const hint = hasData
              ? `${p.baseVelocity.toFixed(2)} SP/hr${
                  growthPct !== 0
                    ? ` × ${effectiveMultiplier.toFixed(2)} = ${p.effectiveVelocity.toFixed(2)}`
                    : ""
                }${p.sprintCount > 0 ? ` · ${p.sprintCount} sprint${p.sprintCount === 1 ? "" : "s"}` : ""}`
              : "no history";
            return (
              <button
                key={p.basis}
                type="button"
                onClick={() => setBasis(p.basis)}
                className={`flex w-full items-baseline justify-between px-5 py-3 text-left transition-colors ${
                  active
                    ? "bg-white/[0.04]"
                    : hasData
                      ? "hover:bg-white/[0.02] cursor-pointer"
                      : "cursor-default opacity-60"
                }`}
                disabled={!hasData}
              >
                <div>
                  <p
                    className={`text-[13px] flex items-center gap-2 ${
                      active ? "text-slate-100 font-medium" : "text-slate-200"
                    }`}
                  >
                    {p.label}
                    {active && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                        active
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500">{hint}</p>
                </div>
                <p className="text-xl font-semibold tabular-nums text-slate-100">
                  {p.projected != null ? (
                    <>
                      {fmt(p.projected)}{" "}
                      <span className="text-sm font-normal text-slate-500">SP</span>
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </p>
              </button>
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
  explain,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  /** Optional explanation shown in a popover on hover. */
  explain?: React.ReactNode;
}) {
  const [showExplain, setShowExplain] = useState(false);
  return (
    <div
      className={`relative flex items-baseline justify-between gap-4 px-5 py-3 ${
        explain ? "hover:bg-white/[0.03]" : ""
      }`}
      onMouseEnter={() => explain && setShowExplain(true)}
      onMouseLeave={() => setShowExplain(false)}
    >
      <div>
        <p
          className={`text-[13px] flex items-center gap-1.5 ${
            emphasis ? "font-medium text-slate-100" : "text-slate-300"
          }`}
        >
          {label}
          {explain && <Info className="size-3 text-slate-600" />}
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

      {explain && showExplain && (
        <span
          role="tooltip"
          className="absolute z-50 right-4 top-full mt-1 w-80 rounded-lg border border-white/10 bg-slate-950/95 backdrop-blur p-3 text-[12px] text-slate-300 shadow-2xl pointer-events-none"
        >
          {explain}
        </span>
      )}
    </div>
  );
}
