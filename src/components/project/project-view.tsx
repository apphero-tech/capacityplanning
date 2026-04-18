"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSprint } from "@/contexts/sprint-context";
import type { SprintStory } from "@/types";

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
 * Project — rolled-up end-to-end numbers for the whole engagement:
 *
 *  • Total SP we need to deliver (scope of every non-demo sprint +
 *    any completedSP from closed sprints the stories of which may
 *    have moved out since)
 *  • Delivered to date (sum of completedSP on closed sprints)
 *  • In progress (scope of the current sprint)
 *  • Remaining in future sprints
 *
 * Percentages and a progress bar give the executive view without
 * drilling into any sprint.
 */
export function ProjectView({ storiesBySprint }: Props) {
  const { allSprints, sprints, setSelectedIndex } = useSprint();
  const router = useRouter();

  const stats = useMemo(() => {
    const nonDemo = allSprints.filter((s) => !s.isDemo);

    // Delivered: sum of completed SP on any closed sprint.
    const deliveredSP = nonDemo
      .filter((s) => s.completedSP != null && s.completedSP > 0)
      .reduce((sum, s) => sum + (s.completedSP ?? 0), 0);

    // In progress: SP currently planned in the current sprint.
    const currentSprint = nonDemo.find((s) => s.isCurrent);
    const inProgressSP = currentSprint
      ? (storiesBySprint[currentSprint.id] ?? [])
          .filter((st) => !st.isExcluded)
          .reduce((sum, st) => sum + (st.storyPoints ?? 0), 0)
      : 0;

    // Remaining: SP planned in future (next / planning / future) sprints.
    const remainingSP = nonDemo
      .filter(
        (s) =>
          s.status === "next" ||
          s.status === "planning" ||
          s.status === "future",
      )
      .reduce((sum, s) => {
        const ss = storiesBySprint[s.id] ?? [];
        return (
          sum +
          ss.filter((st) => !st.isExcluded).reduce((a, st) => a + (st.storyPoints ?? 0), 0)
        );
      }, 0);

    const totalSP = deliveredSP + inProgressSP + remainingSP;

    // Counts for context
    const closedSprints = nonDemo.filter(
      (s) => s.completedSP != null && s.completedSP > 0,
    ).length;
    const remainingSprints = nonDemo.filter(
      (s) =>
        s.status === "next" || s.status === "planning" || s.status === "future",
    ).length;

    const pct = (v: number) => (totalSP > 0 ? (v / totalSP) * 100 : 0);

    return {
      totalSP,
      deliveredSP,
      inProgressSP,
      remainingSP,
      currentSprint,
      closedSprints,
      remainingSprints,
      pctDelivered: pct(deliveredSP),
      pctInProgress: pct(inProgressSP),
      pctRemaining: pct(remainingSP),
    };
  }, [allSprints, storiesBySprint]);

  const { totalSP } = stats;
  if (totalSP === 0) {
    return (
      <p className="text-sm text-slate-400">
        No stories yet — import the Jira backlog to populate project totals.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Headline total + stacked progress bar */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-900/40 p-6">
        <p className="text-[12px] text-slate-500">Total scope</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-100">
          {fmt(totalSP)} <span className="text-base font-normal text-slate-500">SP</span>
        </p>
        <p className="mt-1 text-[12px] text-slate-500">
          {fmt(stats.deliveredSP)} delivered · {fmt(stats.inProgressSP)} in progress ·{" "}
          {fmt(stats.remainingSP)} remaining
        </p>

        {/* Stacked progress bar */}
        <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
          <div
            className="bg-emerald-400/80"
            style={{ width: `${stats.pctDelivered}%` }}
            title={`${fmt(stats.deliveredSP)} SP delivered`}
          />
          <div
            className="bg-amber-400/80"
            style={{ width: `${stats.pctInProgress}%` }}
            title={`${fmt(stats.inProgressSP)} SP in progress`}
          />
          <div
            className="bg-blue-400/60"
            style={{ width: `${stats.pctRemaining}%` }}
            title={`${fmt(stats.remainingSP)} SP remaining`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          <LegendDot color="bg-emerald-400" label="Delivered" pct={stats.pctDelivered} />
          <LegendDot color="bg-amber-400" label="In progress" pct={stats.pctInProgress} />
          <LegendDot color="bg-blue-400" label="Remaining" pct={stats.pctRemaining} />
        </div>
      </section>

      {/* KPI tiles */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-300 mb-3">Breakdown</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Delivered"
            value={`${fmt(stats.deliveredSP)} SP`}
            hint={`${stats.closedSprints} closed sprint${stats.closedSprints === 1 ? "" : "s"} · ${fmt(stats.pctDelivered, 1)}%`}
            tone="emerald"
          />
          <Kpi
            label="In progress"
            value={`${fmt(stats.inProgressSP)} SP`}
            hint={
              stats.currentSprint
                ? `${stats.currentSprint.name} · ${fmt(stats.pctInProgress, 1)}%`
                : "no current sprint"
            }
            tone="amber"
          />
          <Kpi
            label="Remaining"
            value={`${fmt(stats.remainingSP)} SP`}
            hint={`${stats.remainingSprints} upcoming sprint${stats.remainingSprints === 1 ? "" : "s"} · ${fmt(stats.pctRemaining, 1)}%`}
            tone="blue"
          />
          <Kpi
            label="Total"
            value={`${fmt(stats.totalSP)} SP`}
            hint="delivered + in progress + remaining"
          />
        </div>
      </section>

      {/* Sprint-by-sprint ledger */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-300 mb-3">Per sprint</h3>
        <div className="rounded-2xl border border-white/[0.04] divide-y divide-white/[0.04]">
          {allSprints
            .filter((s) => !s.isDemo)
            .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
            .map((s) => {
              const scopeStories = storiesBySprint[s.id] ?? [];
              const scope = scopeStories
                .filter((st) => !st.isExcluded)
                .reduce((sum, st) => sum + (st.storyPoints ?? 0), 0);
              const isPast = s.completedSP != null && s.completedSP > 0;
              const valueLabel = isPast
                ? `${fmt(s.completedSP)} delivered`
                : s.isCurrent
                  ? `${fmt(scope)} in progress`
                  : scope > 0
                    ? `${fmt(scope)} planned`
                    : "empty";
              const toneClass = isPast
                ? "text-emerald-300"
                : s.isCurrent
                  ? "text-amber-300"
                  : scope > 0
                    ? "text-blue-300"
                    : "text-slate-600";
              const activeIdx = sprints.findIndex((a) => a.id === s.id);
              const clickable = activeIdx >= 0;
              const handleClick = () => {
                if (!clickable) return;
                setSelectedIndex(activeIdx);
                router.push("/capacity");
              };
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={handleClick}
                  disabled={!clickable}
                  className={`flex w-full items-baseline justify-between gap-4 px-5 py-3 text-left transition-colors ${
                    clickable
                      ? "cursor-pointer hover:bg-white/[0.03]"
                      : "cursor-default opacity-70"
                  }`}
                >
                  <div>
                    <p className="text-[13px] text-slate-200 font-medium">{s.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {scopeStories.length} stor{scopeStories.length === 1 ? "y" : "ies"} in scope
                      {s.commitmentSP != null && s.commitmentSP > 0 && (
                        <> · committed {fmt(s.commitmentSP)}</>
                      )}
                    </p>
                  </div>
                  <p className={`text-[13px] tabular-nums ${toneClass}`}>
                    {valueLabel}
                  </p>
                </button>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "amber" | "blue";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "blue"
          ? "text-blue-300"
          : "text-slate-100";
  return (
    <div className="rounded-xl border border-white/[0.04] bg-slate-900/30 px-4 py-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function LegendDot({
  color,
  label,
  pct,
}: {
  color: string;
  label: string;
  pct: number;
}) {
  return (
    <span className="flex items-center gap-1.5 text-slate-400">
      <span className={`size-2 rounded-full ${color}`} />
      {label}{" "}
      <span className="text-slate-600 tabular-nums">{pct.toFixed(1)}%</span>
    </span>
  );
}
