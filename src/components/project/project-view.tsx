"use client";

import { useRouter } from "next/navigation";
import { useSprint } from "@/contexts/sprint-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { SPRINTS } from "@/lib/jira/constants";
import type { ProjectOverview } from "@/lib/project-overview";

const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
const CLOSED_SPRINT_NAMES = new Set(
  SPRINTS.filter((s) => s.state === "closed").map((s) => normName(s.name)),
);

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface Props {
  overview: ProjectOverview;
}

/**
 * Project — rolled-up end-to-end numbers for the whole engagement.
 *
 * All figures come from `getProjectOverview()` — the same engine the Dashboard
 * uses. Headline totals, percentages and per-sprint values are pulled from
 * that single source so every tab agrees down to the SP.
 */
export function ProjectView({ overview }: Props) {
  const { sprints, setSelectedIndex } = useSprint();
  const { slug } = useWorkspace();
  const router = useRouter();

  const {
    totalStories,
    totalSP,
    deliveredPast,
    deliveredCurrent,
    inProgress,
    remaining,
    excluded,
  } = overview;

  const deliveredSP = deliveredPast.sp + deliveredCurrent.sp;
  const deliveredStories = deliveredPast.stories + deliveredCurrent.stories;

  // Same denominator as the Dashboard so percentages match exactly.
  const bucketsSum =
    deliveredPast.sp + deliveredCurrent.sp + inProgress.sp + remaining.sp + excluded.sp;

  if (bucketsSum === 0) {
    return (
      <p className="text-sm text-muted-fg">
        No stories yet — import the Jira backlog to populate project totals.
      </p>
    );
  }

  const pct = (v: number) => (bucketsSum > 0 ? (v / bucketsSum) * 100 : 0);
  const pctDelivered = pct(deliveredSP);
  const pctInProgress = pct(inProgress.sp);
  const pctRemaining = pct(remaining.sp);
  const pctExcluded = pct(excluded.sp);

  const closedSprints = overview.bySprint.filter(
    (s) => s.delivered.sp > 0 && s.sprintStatus !== "current",
  ).length;
  const remainingSprints = overview.bySprint.filter(
    (s) =>
      s.sprintStatus === "next" ||
      s.sprintStatus === "planning" ||
      s.sprintStatus === "future",
  ).length;
  const currentSprint = overview.bySprint.find((s) => s.sprintStatus === "current");

  // Headline scope = every story from the CSV, descoped/split included.
  const headlineSP = totalSP + excluded.sp;
  const headlineStories = totalStories + excluded.stories;

  return (
    <div className="flex flex-col gap-8">
      {/* Headline total + stacked progress bar */}
      <section className="rounded-2xl border border-line bg-card p-6">
        <p className="text-[12px] text-faint-fg">Total scope</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
          {fmt(headlineSP)}{" "}
          <span className="text-base font-normal text-faint-fg">SP</span>
          <span className="ml-3 text-base font-normal text-faint-fg tabular-nums">
            {fmt(headlineStories)} stories
          </span>
        </p>
        <p className="mt-1 text-[12px] text-faint-fg">
          {fmt(deliveredSP)} delivered · {fmt(inProgress.sp)} in progress ·{" "}
          {fmt(remaining.sp)} remaining
          {excluded.sp > 0 && <> · {fmt(excluded.sp)} descoped/split</>}
        </p>

        {/* Stacked progress bar */}
        <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--muted)]">
          <div
            className="bg-ok/80"
            style={{ width: `${pctDelivered}%` }}
            title={`${fmt(deliveredSP)} SP delivered`}
          />
          <div
            className="bg-warn/80"
            style={{ width: `${pctInProgress}%` }}
            title={`${fmt(inProgress.sp)} SP in progress`}
          />
          <div
            className="bg-info/60"
            style={{ width: `${pctRemaining}%` }}
            title={`${fmt(remaining.sp)} SP remaining`}
          />
          {excluded.sp > 0 && (
            <div
              className="bg-danger/70"
              style={{ width: `${pctExcluded}%` }}
              title={`${fmt(excluded.sp)} SP descoped/split`}
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          <LegendDot color="bg-ok" label="Delivered" pct={pctDelivered} />
          <LegendDot color="bg-warn" label="In progress" pct={pctInProgress} />
          <LegendDot color="bg-info" label="Remaining" pct={pctRemaining} />
          {excluded.sp > 0 && (
            <LegendDot color="bg-danger" label="Descoped/split" pct={pctExcluded} />
          )}
        </div>
      </section>

      {/* KPI tiles */}
      <section>
        <h3 className="text-[13px] font-medium text-foreground mb-3">Breakdown</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Delivered"
            value={`${fmt(deliveredSP)} SP`}
            hint={`${closedSprints} closed sprint${closedSprints === 1 ? "" : "s"} · ${fmt(deliveredStories)} stor${deliveredStories === 1 ? "y" : "ies"} · ${fmt(pctDelivered, 1)}%`}
            tone="emerald"
          />
          <Kpi
            label="In progress"
            value={`${fmt(inProgress.sp)} SP`}
            hint={
              currentSprint
                ? `${currentSprint.sprintName} · ${fmt(inProgress.stories)} stor${inProgress.stories === 1 ? "y" : "ies"} · ${fmt(pctInProgress, 1)}%`
                : "no current sprint"
            }
            tone="amber"
          />
          <Kpi
            label="Remaining"
            value={`${fmt(remaining.sp)} SP`}
            hint={`${remainingSprints} upcoming sprint${remainingSprints === 1 ? "" : "s"} · ${fmt(remaining.stories)} stor${remaining.stories === 1 ? "y" : "ies"} · ${fmt(pctRemaining, 1)}%`}
            tone="blue"
          />
          <Kpi
            label="Total"
            value={`${fmt(headlineSP)} SP`}
            hint={`${fmt(headlineStories)} stories incl. descoped`}
          />
        </div>
      </section>

      {/* Sprint-by-sprint ledger — open + future only; closed sprints are
          frozen history (their delivered SP is already in the totals above). */}
      <section>
        <h3 className="text-[13px] font-medium text-foreground mb-3">Per sprint</h3>
        <div className="rounded-2xl border border-line divide-y divide-[color:var(--line)]">
          {overview.bySprint
            .filter((s) => !CLOSED_SPRINT_NAMES.has(normName(s.sprintName)))
            .map((s) => {
            const isCurrent = s.sprintStatus === "current";
            const isPast = s.delivered.sp > 0 && !isCurrent;
            const valueLabel = isPast
              ? `${fmt(s.delivered.sp)} delivered`
              : isCurrent
                ? `${fmt(s.inProgress.sp + s.delivered.sp)} in progress`
                : s.remaining.sp > 0
                  ? `${fmt(s.remaining.sp)} planned`
                  : "empty";
            const toneClass = isPast
              ? "text-ok"
              : isCurrent
                ? "text-warn"
                : s.remaining.sp > 0
                  ? "text-info"
                  : "text-faint-fg";
            const activeIdx = sprints.findIndex((a) => a.id === s.sprintId);
            const clickable = activeIdx >= 0;
            const handleClick = () => {
              if (!clickable) return;
              setSelectedIndex(activeIdx);
              router.push(`/${slug}/capacity`);
            };
            return (
              <button
                key={s.sprintId}
                type="button"
                onClick={handleClick}
                disabled={!clickable}
                className={`flex w-full items-baseline justify-between gap-4 px-5 py-3 text-left transition-colors ${
                  clickable
                    ? "cursor-pointer hover:bg-[color:var(--muted)]"
                    : "cursor-default opacity-70"
                }`}
              >
                <div>
                  <p className="text-[13px] text-foreground font-medium">{s.sprintName}</p>
                  <p className="text-[11px] text-faint-fg">
                    {s.totalStories} stor{s.totalStories === 1 ? "y" : "ies"} in scope
                    {s.excluded.sp > 0 && (
                      <> · {s.excluded.stories} descoped/split</>
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
      ? "text-ok"
      : tone === "amber"
        ? "text-warn"
        : tone === "blue"
          ? "text-info"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <p className="text-[11px] font-medium text-faint-fg">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-faint-fg mt-0.5">{hint}</p>}
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
    <span className="flex items-center gap-1.5 text-muted-fg">
      <span className={`size-2 rounded-full ${color}`} />
      {label}{" "}
      <span className="text-faint-fg tabular-nums">{pct.toFixed(1)}%</span>
    </span>
  );
}
