"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
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
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

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
    allSprints,
    sprints: activeSprints,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
    setSelectedIndex,
  } = useSprint();

  const deloitteCapacities = useMemo(
    () => initialCapacities.filter((c) => c.organization === "Deloitte" && c.isActive),
    [initialCapacities],
  );

  const verdict = useMemo(() => {
    if (!sprint) return null;
    const stories = storiesBySprint[sprint.id] ?? [];
    const scopeSP = stories
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
    const devCaps = computeDevCapacityFromIC(
      deloitteCapacities,
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
      hours: dp.netDevCapacity,
      velocity: dp.velocityProven,
      members: deloitteCapacities.length,
    };
  }, [
    sprint,
    storiesBySprint,
    deloitteCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    selectedForecast,
  ]);

  // Bar chart data — closed sprints + current + upcoming, in calendar order.
  // A row is included when it has something to show (committed, delivered,
  // or the selected-sprint planning metrics). Current sprint is kept even
  // if it hasn't been closed yet — its commitment is worth seeing.
  const chartData = useMemo(() => {
    const ordered = [...allSprints]
      .filter((s) => !s.isDemo)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

    const currentSprint = ordered.find((s) => s.isCurrent) ?? null;

    // Take up to 8 sprints ending at (and including) the current sprint.
    const currentIdx = currentSprint ? ordered.indexOf(currentSprint) : ordered.length - 1;
    const fromIdx = Math.max(0, currentIdx - 7);
    const window = ordered.slice(fromIdx, currentIdx + 1);

    const rows = window.map((s) => {
      const stories = storiesBySprint[s.id] ?? [];
      const isCurrent = s.isCurrent;
      // Current sprint rarely has commitment/completed yet — fall back to
      // the SP currently assigned to it so the column is never empty and
      // the "In progress" marker has something to sit on.
      const sprintScope =
        isCurrent && (s.commitmentSP == null || s.commitmentSP === 0)
          ? stories.filter((st) => !st.isExcluded).reduce((sum, st) => sum + (st.storyPoints ?? 0), 0)
          : null;
      return {
        name: s.name.replace("| Product Demo ", "PD"),
        fullName: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        committed: s.commitmentSP ?? null,
        delivered: s.completedSP ?? null,
        scope: sprintScope,
        projected: null as number | null,
        storyCount: stories.length,
        kind: (isCurrent ? "current" : "past") as "past" | "current" | "next",
      };
    });

    // Add the selected (next) sprint if it's not already in the window.
    if (sprint && verdict && !window.some((s) => s.id === sprint.id)) {
      const stories = storiesBySprint[sprint.id] ?? [];
      rows.push({
        name: sprint.name.replace("| Product Demo ", "PD"),
        fullName: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        committed: null,
        delivered: null,
        scope: verdict.scopeSP,
        projected: verdict.teamCanDeliver,
        storyCount: stories.length,
        kind: "next",
      });
    }

    // Drop rows that have absolutely nothing to render (all metrics null).
    return rows.filter(
      (r) =>
        (r.committed ?? 0) > 0 ||
        (r.delivered ?? 0) > 0 ||
        (r.scope ?? 0) > 0 ||
        (r.projected ?? 0) > 0,
    );
  }, [allSprints, sprint, verdict, storiesBySprint]);

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
              <p className="mt-1 text-[12px] text-slate-500 flex items-center gap-1.5">
                team can deliver{" "}
                <ExplainTooltip
                  content={
                    <>
                      <p className="font-medium text-slate-200 mb-1.5">
                        How {fmt(verdict.teamCanDeliver)} SP is computed
                      </p>
                      <ul className="space-y-1 text-slate-400">
                        <li>
                          <span className="text-slate-200">{verdict.members}</span>{" "}
                          active Deloitte members in {sprint.name}
                        </li>
                        <li>
                          <span className="text-slate-200">{fmt(verdict.hours)} hrs</span>{" "}
                          of net DEV time available (after PTO + holidays)
                        </li>
                        <li>
                          ×{" "}
                          <span className="text-slate-200">
                            {verdict.velocity.toFixed(2)} SP/hr
                          </span>{" "}
                          historical velocity (last 3 closed sprints)
                        </li>
                        <li className="border-t border-white/10 pt-1 mt-1 text-slate-200">
                          ={" "}
                          <span className="font-semibold">
                            {fmt(verdict.teamCanDeliver)} SP
                          </span>
                        </li>
                      </ul>
                    </>
                  }
                >
                  <span className="text-slate-300 underline decoration-dotted underline-offset-2 cursor-help inline-flex items-center gap-1">
                    {fmt(verdict.teamCanDeliver)} SP
                    <Info className="size-3 text-slate-500" />
                  </span>
                </ExplainTooltip>
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

      {/* Interactive history + planning chart */}
      {chartData.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[13px] font-medium text-slate-300">
              Delivery history &amp; next sprint
            </h3>
            <p className="text-[11px] text-slate-500">
              Click a bar to jump to that sprint
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.04] bg-slate-900/30 p-4">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 24, right: 10, left: -8, bottom: 0 }}
                  onClick={(e: unknown) => {
                    const evt = e as { activeLabel?: string } | null;
                    const label = evt?.activeLabel;
                    if (!label) return;
                    const row = chartData.find((d) => d.name === label);
                    if (!row) return;
                    const idx = activeSprints.findIndex((s) => s.name === row.fullName);
                    if (idx >= 0) setSelectedIndex(idx);
                  }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  {/* Visual marker on the current-sprint column */}
                  {chartData.some((d) => d.kind === "current") && (
                    <ReferenceArea
                      x1={chartData.find((d) => d.kind === "current")!.name}
                      x2={chartData.find((d) => d.kind === "current")!.name}
                      fill="#34d399"
                      fillOpacity={0.06}
                      stroke="#34d399"
                      strokeOpacity={0.25}
                      strokeDasharray="3 3"
                      ifOverflow="extendDomain"
                      label={{
                        value: "In progress",
                        position: "top",
                        fill: "#34d399",
                        fontSize: 10,
                        fontWeight: 500,
                      }}
                    />
                  )}
                  <XAxis
                    dataKey="name"
                    tick={(props: { x: number; y: number; payload: { value: string } }) => {
                      const { x, y, payload } = props;
                      const row = chartData.find((d) => d.name === payload.value);
                      const isCurrent = row?.kind === "current";
                      return (
                        <text
                          x={x}
                          y={y + 14}
                          textAnchor="middle"
                          fill={isCurrent ? "#34d399" : "#64748b"}
                          fontSize={11}
                          fontWeight={isCurrent ? 600 : 400}
                        >
                          {payload.value}
                        </text>
                      );
                    }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.04)" }}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    content={<SprintBarTooltip />}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }}
                  />
                  <Bar dataKey="committed"  name="Committed"   fill="#475569" radius={[3, 3, 0, 0]} cursor="pointer" />
                  <Bar dataKey="delivered"  name="Delivered"   fill="#34d399" radius={[3, 3, 0, 0]} cursor="pointer" />
                  <Bar dataKey="scope"      name="Scope"       fill="#f59e0b" radius={[3, 3, 0, 0]} cursor="pointer" />
                  <Bar dataKey="projected"  name="Can deliver" fill="#60a5fa" radius={[3, 3, 0, 0]} cursor="pointer" />
                  {verdict.hasVelocity && (
                    <ReferenceLine
                      y={verdict.teamCanDeliver}
                      stroke="#60a5fa"
                      strokeDasharray="3 3"
                      strokeOpacity={0.4}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

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

/**
 * Custom Recharts tooltip for the history + next-sprint chart. Shows sprint
 * name, dates, story count and each metric in a Linear-style card.
 */
type TooltipPayload = {
  name: string;
  dataKey: string;
  value: number | null | undefined;
  color: string;
  payload: {
    fullName: string;
    startDate: string | null;
    endDate: string | null;
    storyCount: number;
    kind: "past" | "current" | "next";
    committed: number | null;
    delivered: number | null;
    scope: number | null;
    projected: number | null;
  };
};

function SprintBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const rows: { label: string; value: number | null; color: string }[] = [
    { label: "Committed", value: p.committed, color: "#475569" },
    { label: "Delivered", value: p.delivered, color: "#34d399" },
    { label: "Scope",     value: p.scope,     color: "#f59e0b" },
    { label: "Can deliver", value: p.projected, color: "#60a5fa" },
  ].filter((r) => r.value != null && r.value > 0);

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/95 backdrop-blur p-3 text-[12px] shadow-2xl min-w-[200px]">
      <p className="font-medium text-slate-100">{p.fullName}</p>
      {p.startDate && p.endDate && (
        <p className="text-[11px] text-slate-500 mt-0.5">
          {p.startDate} → {p.endDate}
        </p>
      )}
      <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
        {p.storyCount} stor{p.storyCount === 1 ? "y" : "ies"}
        {p.kind === "next" && <span className="text-slate-600"> · upcoming</span>}
        {p.kind === "current" && <span className="text-emerald-400/80"> · in progress</span>}
      </p>
      <div className="mt-2 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: r.color }}
              />
              {r.label}
            </span>
            <span className="tabular-nums text-slate-200 font-medium">
              {r.value} <span className="text-slate-500 font-normal">SP</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Lightweight hover-explain. Anchors a popover under the trigger child;
 * stays open while hovering either child or popover so the user can read
 * multi-line explanations without it disappearing.
 */
function ExplainTooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1.5 w-72 rounded-lg border border-white/10 bg-slate-950/95 backdrop-blur p-3 text-[12px] text-slate-300 shadow-2xl pointer-events-none"
        >
          {content}
        </span>
      )}
    </span>
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
