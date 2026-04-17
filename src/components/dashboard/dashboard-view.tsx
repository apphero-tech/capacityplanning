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
import {
  Check,
  AlertTriangle,
  Calendar,
  Users,
  CalendarOff,
  ListTodo,
  ArrowRight,
} from "lucide-react";

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
 * Dashboard — one-liner verdict on the upcoming sprint + quick actions.
 *
 * Landing view for every session. Tells the user in one glance whether
 * the next sprint fits what the team can deliver, and gives them fast
 * access to the four input pages. That's it. Everything else is on the
 * Plan page.
 */
export function DashboardView({ storiesBySprint }: Props) {
  const {
    selectedSprint: sprint,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
  } = useSprint();

  const verdict = useMemo(() => {
    if (!sprint) return null;
    const stories = storiesBySprint[sprint.id] ?? [];
    const scopeSP = stories
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
      scopeSP,
    );
    return {
      teamCanDeliver: dp.projectedSPProven,
      scopeSP,
      delta: dp.projectedSPProven - scopeSP,
      hasVelocity: dp.velocityProven > 0,
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

  if (!sprint || !verdict) {
    return (
      <p className="text-sm text-slate-400">
        Select a sprint in the top bar.
      </p>
    );
  }

  const fits = verdict.delta >= 0;
  const VerdictIcon = fits ? Check : AlertTriangle;

  return (
    <div className="flex flex-col gap-8">
      {/* Verdict hero */}
      <Link
        href="/capacity"
        className="group block rounded-2xl border border-white/[0.06] bg-slate-900/40 p-6 transition-colors hover:bg-slate-900/60"
      >
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-[12px] text-slate-500">Next sprint</p>
          <p className="text-[12px] text-slate-500">
            {formatDateRangeShort(sprint.startDate, sprint.endDate)}
          </p>
        </div>
        <h3 className="mt-1 text-xl font-semibold text-slate-100">{sprint.name}</h3>

        {verdict.hasVelocity ? (
          <div className="mt-5 flex items-baseline justify-between flex-wrap gap-3">
            <div>
              <p
                className={`text-3xl font-semibold tabular-nums flex items-center gap-2 ${
                  fits ? "text-emerald-300" : "text-red-300"
                }`}
              >
                <VerdictIcon className="size-5" />
                {fits
                  ? `Fits — ${fmt(verdict.delta)} SP of room`
                  : `Overflow — ${fmt(Math.abs(verdict.delta))} SP to cut`}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">
                team can deliver{" "}
                <span className="text-slate-300">{fmt(verdict.teamCanDeliver)} SP</span>
                {" · "}scope{" "}
                <span className="text-slate-300">{fmt(verdict.scopeSP)} SP</span>
              </p>
            </div>
            <span className="text-[12px] text-slate-400 group-hover:text-slate-200 flex items-center gap-1">
              Open Plan
              <ArrowRight className="size-3.5" />
            </span>
          </div>
        ) : (
          <p className="mt-5 text-[13px] text-amber-300">
            No velocity data yet — enter past sprints&apos; completed SP on the Plan page.
          </p>
        )}
      </Link>

      {/* Input quick-tiles */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-300 mb-3">Inputs</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InputTile
            href="/sprints"
            icon={Calendar}
            label="Sprints"
            hint="Calendar & dates"
          />
          <InputTile
            href="/team"
            icon={Users}
            label="Team"
            hint="Members & allocations"
          />
          <InputTile
            href="/time-off"
            icon={CalendarOff}
            label="Time Off"
            hint="Holidays & PTO"
          />
          <InputTile
            href="/backlog"
            icon={ListTodo}
            label="Backlog"
            hint="Stories from Jira"
          />
        </div>
      </section>
    </div>
  );
}

function InputTile({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: typeof Calendar;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-white/[0.04] bg-slate-900/30 px-4 py-3 transition-colors hover:bg-slate-900/60"
    >
      <Icon className="size-4 text-slate-500 group-hover:text-slate-300" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-slate-200">{label}</p>
        <p className="text-[11px] text-slate-500">{hint}</p>
      </div>
      <ArrowRight className="size-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />
    </Link>
  );
}
