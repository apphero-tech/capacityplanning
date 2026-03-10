"use client";

import { useMemo } from "react";
import { useSprint } from "@/contexts/sprint-context";
import {
  computeDevCapacityFromIC,
  computeStreamCapacityFromIC,
  computeDevProjection,
} from "@/lib/capacity-engine";
import type { SprintForecast } from "@/lib/capacity-engine";
import { STREAM_LABELS, SPRINT_MODE_LABELS } from "@/lib/constants";
import { getBadgeClasses } from "@/lib/badge-utils";
import { formatDateRangeShort } from "@/lib/date-utils";
import type { InitialCapacity, SprintStory, SprintStatus } from "@/types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Pencil,
  Compass,
  CalendarDays,
} from "lucide-react";

import { CapacityChart } from "@/components/dashboard/capacity-chart";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

function findVelocitySourceName(
  forecasts: SprintForecast[],
  sprintId: string,
): string | null {
  const idx = forecasts.findIndex((f) => f.sprintId === sprintId);
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (!forecasts[i].velocityInherited) return forecasts[i].sprintName;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sprint mode
// ---------------------------------------------------------------------------

type SprintMode = "testing" | "development" | "refinement" | "capacity";

const MODE_META: Record<SprintMode, {
  label: string;
  description: string;
  icon: typeof FlaskConical;
  accent: { border: string; iconBg: string; iconText: string; badgeBg: string; badgeText: string };
}> = {
  testing: {
    label: SPRINT_MODE_LABELS.previous,
    description: "Track QA validation and test results.",
    icon: FlaskConical,
    accent: {
      border: "from-blue-400/60 via-blue-400/20 to-transparent",
      iconBg: "bg-blue-400/[0.08]", iconText: "text-blue-400/80",
      badgeBg: "bg-blue-400/10", badgeText: "text-blue-400/80",
    },
  },
  development: {
    label: SPRINT_MODE_LABELS.current,
    description: "Active sprint — track delivery progress.",
    icon: CalendarDays,
    accent: {
      border: "from-[#E31837]/60 via-[#E31837]/20 to-transparent",
      iconBg: "bg-[#E31837]/[0.08]", iconText: "text-[#E31837]/80",
      badgeBg: "bg-[#E31837]/10", badgeText: "text-[#E31837]/80",
    },
  },
  refinement: {
    label: SPRINT_MODE_LABELS.next,
    description: "Refinement, design, and development capacity planning.",
    icon: Pencil,
    accent: {
      border: "from-amber-400/60 via-amber-400/20 to-transparent",
      iconBg: "bg-amber-400/[0.08]", iconText: "text-amber-400/80",
      badgeBg: "bg-amber-400/10", badgeText: "text-amber-400/80",
    },
  },
  capacity: {
    label: SPRINT_MODE_LABELS.planning,
    description: "Verify data inputs to ensure accurate capacity projections.",
    icon: Compass,
    accent: {
      border: "from-violet-400/60 via-violet-400/20 to-transparent",
      iconBg: "bg-violet-400/[0.08]", iconText: "text-violet-400/80",
      badgeBg: "bg-violet-400/10", badgeText: "text-violet-400/80",
    },
  },
};

function getMode(status: SprintStatus): SprintMode {
  switch (status) {
    case "previous": return "testing";
    case "current": return "development";
    case "next": return "refinement";
    case "planning": return "capacity";
    default: return "development";
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardViewProps {
  storiesBySprint: Record<string, SprintStory[]>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardView({ storiesBySprint }: DashboardViewProps) {
  const {
    selectedSprint: sprint,
    sprints,
    forecasts,
    forecastMap,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  } = useSprint();

  const currentSprint = sprints.find((s) => s.status === "current") ?? null;

  const computed = useMemo(() => {
    if (!sprint) return null;

    const stories = storiesBySprint[sprint.id] ?? [];
    const activeStories = stories.filter((s) => !s.isExcluded);

    const devCapacities = computeDevCapacityFromIC(initialCapacities, sprint, publicHolidays, projectHolidays, ptoEntries);
    const streamHrs = computeStreamCapacityFromIC(initialCapacities, sprint, publicHolidays, projectHolidays, ptoEntries);
    const totalBacklogSP = activeStories.reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    const forecast = forecastMap.get(sprint.id);
    const velocityProven = forecast?.velocityProven ?? sprint.velocityProven ?? 0;
    const velocityInherited = forecast?.velocityInherited ?? false;

    const devProjection = computeDevProjection(devCapacities, velocityProven, 0, totalBacklogSP);

    // Per-stream story SP
    const qaStorySP = activeStories.filter((s) => s.stream === "4-QA").reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
    const qaStoryCount = activeStories.filter((s) => s.stream === "4-QA").length;

    // Capacity chart data
    const streams = ["1-REF", "2-DES", "3-DEV", "4-QA"] as const;
    const capacityChartData = streams.map((stream) => {
      const scopeSP = activeStories.filter((s) => s.stream === stream).reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
      return {
        stream: STREAM_LABELS[stream] ?? stream,
        scopeSP: Math.round(scopeSP * 10) / 10,
        capacityHrs: Math.round((streamHrs[stream] ?? 0) * 10) / 10,
      };
    });

    const coveragePct = devProjection.coverageProven * 100;
    const coverageStatus: "OK" | "At Risk" | "Over" =
      coveragePct >= 100 ? "OK" : coveragePct >= 80 ? "At Risk" : "Over";

    // Readiness checks (capacity mode)
    const hasPublicHolidays = publicHolidays.some((h) =>
      sprint.startDate && sprint.endDate && h.date && h.date >= sprint.startDate && h.date <= sprint.endDate);
    const hasProjectHolidays = projectHolidays.some((h) =>
      sprint.startDate && sprint.endDate && h.date && h.date >= sprint.startDate && h.date <= sprint.endDate);
    const hasPtoEntries = ptoEntries.some((p) =>
      sprint.startDate && sprint.endDate && p.endDate >= sprint.startDate && p.startDate <= sprint.endDate);

    return {
      // Core
      devNetHrs: devProjection.netDevCapacity,
      projectedSP: devProjection.projectedSPProven,
      velocityProven,
      velocityInherited,
      velocitySourceName: velocityInherited ? findVelocitySourceName(forecasts, sprint.id) : null,
      totalBacklogSP,
      storiesCount: activeStories.length,
      devGap: devProjection.gapProven,
      coveragePct,
      coverageStatus,
      // Stream capacity
      stream: {
        ref: streamHrs["1-REF"] ?? 0,
        des: streamHrs["2-DES"] ?? 0,
        dev: streamHrs["3-DEV"] ?? 0,
        qa: streamHrs["4-QA"] ?? 0,
      },
      // QA (testing mode)
      qaStorySP,
      qaStoryCount,
      // Chart
      capacityChartData,
      // Readiness
      hasPublicHolidays,
      hasProjectHolidays,
      hasPtoEntries,
      hasAllocations: initialCapacities.length > 0,
    };
  }, [initialCapacities, storiesBySprint, sprint, publicHolidays, projectHolidays, ptoEntries, forecastMap, forecasts]);

  if (!sprint || !computed) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-slate-900/50 p-8 text-center">
        <p className="text-slate-400">No sprint selected.</p>
      </div>
    );
  }

  const mode = getMode(sprint.status);
  const meta = MODE_META[mode];
  const a = meta.accent;
  const Icon = meta.icon;

  return (
    <>
      {/* ---- Mode banner ---- */}

      {mode === "development" && computed.storiesCount === 0 && (
        <Link
          href="/backlog"
          className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400 transition-colors hover:bg-amber-500/10"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            No backlog imported for <span className="font-medium">{sprint.name}</span>.{" "}
            <span className="underline underline-offset-2">Import a backlog</span> to enable capacity analysis.
          </span>
        </Link>
      )}

      {mode !== "development" && (
        <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-slate-900/80 backdrop-blur-sm">
          <div className={`absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b ${a.border}`} />
          <div className="flex items-center gap-4 px-5 py-3">
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${a.iconBg}`}>
              <Icon className={`size-3.5 ${a.iconText}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-slate-200">
                  {mode === "testing"
                    ? `Testing ${sprint.name} build`
                    : meta.label}
                </p>
                {mode === "testing" && currentSprint && (
                  <span className="text-xs text-slate-600">
                    during {currentSprint.name} ({formatDateRangeShort(currentSprint.startDate, currentSprint.endDate)})
                  </span>
                )}
                {mode !== "testing" && (
                  <>
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${a.badgeBg} ${a.badgeText}`}>
                      {sprint.name}
                    </span>
                    <span className="text-xs text-slate-600">
                      {formatDateRangeShort(sprint.startDate, sprint.endDate)}
                    </span>
                  </>
                )}
              </div>
              {mode === "capacity" && (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  <ReadinessItem label="Public holidays" ok={computed.hasPublicHolidays} href="/time-off" />
                  <ReadinessItem label="Project closures" ok={computed.hasProjectHolidays} href="/time-off" />
                  <ReadinessItem label="Personal time off" ok={computed.hasPtoEntries} href="/time-off" />
                  <ReadinessItem label="Allocations" ok={computed.hasAllocations} href="/allocations" />
                </div>
              )}
              {computed.storiesCount === 0 && mode !== "capacity" && (
                <Link
                  href="/backlog"
                  className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <AlertTriangle className="size-3 shrink-0" />
                  <span>
                    No backlog for {sprint.name} — <span className="underline underline-offset-2">import</span>
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- KPI Cards — 4 per mode ---- */}

      <div className={`grid gap-4 grid-cols-2 ${mode === "refinement" ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {mode === "testing" && <>
          <Kpi title="QA Capacity" value={fmt(computed.stream.qa)} unit="hrs" accent="text-amber-400"
            sub="net available" />
          <Kpi title="QA Scope" value={String(computed.qaStoryCount)} unit="stories" accent="text-slate-100"
            sub={`${fmt(computed.qaStorySP)} SP in QA stream`} />
          <Kpi title="Commitment" value={sprint.commitmentSP != null ? fmt(sprint.commitmentSP) : "—"} unit="SP" accent="text-slate-100"
            sub="at sprint start" />
          <Kpi title="Completed"
            value={sprint.completedSP != null ? fmt(sprint.completedSP) : "—"} unit="SP"
            accent={sprint.completedSP != null && sprint.commitmentSP != null && sprint.completedSP >= sprint.commitmentSP ? "text-emerald-400" : "text-slate-100"}
            sub={sprint.completedSP != null && sprint.commitmentSP != null && sprint.commitmentSP > 0
              ? `${fmt((sprint.completedSP / sprint.commitmentSP) * 100)}% of commitment` : "results pending"} />
        </>}

        {mode === "development" && <>
          <Kpi title="DEV Capacity" value={fmt(computed.devNetHrs)} unit="hrs" accent="text-slate-100"
            sub="after holidays & focus" />
          <Kpi title="Projected SP" value={fmt(computed.projectedSP)} unit="SP" accent="text-emerald-400"
            sub={<>{fmt(computed.devNetHrs)} hrs × {fmt(computed.velocityProven)} vel
              {computed.velocityInherited && computed.velocitySourceName && (
                <span className="ml-1 text-slate-600 cursor-help" title={`Inherited from ${computed.velocitySourceName}`}>↩</span>
              )}</>} />
          <Kpi title="Sprint Scope" value={fmt(computed.totalBacklogSP)} unit="SP" accent="text-slate-100"
            sub={`${computed.storiesCount} stories to deliver`} />
          <Kpi title="DEV Coverage" value={fmt(computed.coveragePct)} unit="%" accent="text-slate-100"
            sub={<Badge variant="colored" className={`text-[10px] ${getBadgeClasses("coverage", computed.coverageStatus)}`}>
              {computed.coverageStatus}{computed.coverageStatus !== "OK" ? ` · ${computed.devGap >= 0 ? "+" : ""}${fmt(computed.devGap)} SP` : ""}
            </Badge>} />
        </>}

        {mode === "refinement" && <>
          <Kpi title="REF Capacity" value={fmt(computed.stream.ref)} unit="hrs" accent="text-slate-100"
            sub="refinement" icon={<div className="size-2 rounded-full bg-[#AF0D1A]" />} />
          <Kpi title="DES Capacity" value={fmt(computed.stream.des)} unit="hrs" accent="text-slate-100"
            sub="design" icon={<div className="size-2 rounded-full bg-[#3AC2EF]" />} />
          <Kpi title="DEV Capacity" value={fmt(computed.devNetHrs)} unit="hrs" accent="text-slate-100"
            sub="after holidays & focus" icon={<div className="size-2 rounded-full bg-[#10b981]" />} />
          <Kpi title="Scope" value={fmt(computed.totalBacklogSP)} unit="SP" accent="text-slate-100"
            sub={`${computed.storiesCount} stories in scope`} />
          <Kpi title="Projected SP" value={fmt(computed.projectedSP)} unit="SP" accent="text-emerald-400"
            sub={<>{fmt(computed.devNetHrs)} hrs × {fmt(computed.velocityProven)} vel
              {computed.velocityInherited && computed.velocitySourceName && (
                <span className="ml-1 text-slate-600 cursor-help" title={`Inherited from ${computed.velocitySourceName}`}>↩</span>
              )}</>} />
          <Kpi title="DEV Coverage" value={fmt(computed.coveragePct)} unit="%" accent="text-slate-100"
            sub={<Badge variant="colored" className={`text-[10px] ${getBadgeClasses("coverage", computed.coverageStatus)}`}>
              {computed.coverageStatus}{computed.coverageStatus !== "OK" ? ` · ${computed.devGap >= 0 ? "+" : ""}${fmt(computed.devGap)} SP` : ""}
            </Badge>} />
        </>}

        {mode === "capacity" && <>
          <Kpi title="Refinement" value={fmt(computed.stream.ref)} unit="hrs" accent="text-slate-100"
            icon={<div className="size-2 rounded-full bg-[#AF0D1A]" />} />
          <Kpi title="Design" value={fmt(computed.stream.des)} unit="hrs" accent="text-slate-100"
            icon={<div className="size-2 rounded-full bg-[#3AC2EF]" />} />
          <Kpi title="Development" value={fmt(computed.stream.dev)} unit="hrs" accent="text-emerald-400"
            icon={<div className="size-2 rounded-full bg-[#10b981]" />} />
          <Kpi title="QA" value={fmt(computed.stream.qa)} unit="hrs" accent="text-slate-100"
            icon={<div className="size-2 rounded-full bg-[#f59e0b]" />}
            sub={`${fmt(computed.projectedSP)} SP projected`} />
        </>}
      </div>

      {/* ---- Single chart ---- */}
      <Card className="border-white/[0.06] bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-300">
            {mode === "capacity" ? "Available Capacity by Stream" : "Capacity vs Scope by Stream"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CapacityChart data={computed.capacityChartData} />
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Kpi({
  title,
  value,
  unit,
  accent = "text-slate-100",
  sub,
  icon,
}: {
  title: string;
  value: string;
  unit?: string;
  accent?: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="border-white/[0.06] bg-slate-900/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${accent}`}>
          {value}
          {unit && <span className="text-base font-normal text-slate-500 ml-1">{unit}</span>}
        </div>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ReadinessItem({ label, ok, href }: { label: string; ok: boolean; href: string }) {
  return (
    <Link href={href} className="group flex items-center gap-1.5 text-xs transition-colors">
      {ok ? <CheckCircle2 className="size-3 text-emerald-400/70" /> : <AlertCircle className="size-3 text-amber-400/70" />}
      <span className={ok ? "text-slate-500" : "text-slate-300 group-hover:text-slate-100"}>{label}</span>
      <span className={ok ? "text-emerald-400/50" : "text-amber-400/60"}>{ok ? "OK" : "Check"}</span>
    </Link>
  );
}
