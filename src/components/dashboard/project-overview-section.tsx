"use client";

import { useMemo } from "react";
import { Clock, AlertCircle } from "lucide-react";
import type { ProjectOverview } from "@/lib/project-overview";

interface Props {
  overview: ProjectOverview;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * French-localised relative time for the backlog freshness indicator.
 * Rules follow the user spec:
 *   - < 60 seconds  → "il y a X secondes"
 *   - < 1 hour      → "il y a moins d'une heure"
 *   - < 24 hours    → "il y a N heure(s)"
 *   - ≥ 24 hours    → "il y a N jour(s)"   (flagged as stale)
 */
function relativeTime(iso: string | null): { label: string; daysOld: number } | null {
  if (!iso) return null;
  const then = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  if (ms < 0) return { label: "à l'instant", daysOld: 0 };

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return { label: `il y a ${seconds} seconde${seconds <= 1 ? "" : "s"}`, daysOld: 0 };

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { label: `il y a moins d'une heure`, daysOld: 0 };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `il y a ${hours} heure${hours <= 1 ? "" : "s"}`, daysOld: 0 };

  const days = Math.floor(hours / 24);
  return { label: `il y a ${days} jour${days <= 1 ? "" : "s"}`, daysOld: days };
}

interface BarTooltip {
  title: string;
  subtitle?: string;
  stories: number;
  sp: number;
  pct: number;
  dotClass: string;
  rowLabel: string;
}

const BarSegment = ({
  colorClass,
  widthPct,
  tooltip,
  rounded,
}: {
  colorClass: string;
  widthPct: number;
  tooltip: BarTooltip;
  rounded?: "left" | "right";
}) => {
  if (widthPct <= 0) return null;
  const roundedClass =
    rounded === "left" ? "rounded-l-full" : rounded === "right" ? "rounded-r-full" : "";
  return (
    <div
      className={`relative h-full transition-colors group ${colorClass} ${roundedClass}`}
      style={{ width: `${widthPct}%` }}
    >
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity z-20 min-w-[200px] rounded-lg border border-line bg-background backdrop-blur p-3 text-[12px] shadow-2xl">
        <p className="font-medium text-foreground">{tooltip.title}</p>
        {tooltip.subtitle && (
          <p className="text-[11px] text-faint-fg mt-0.5">{tooltip.subtitle}</p>
        )}
        <p className="text-[11px] text-muted-fg mt-0.5 tabular-nums">
          {fmt(tooltip.stories)} stor{tooltip.stories === 1 ? "y" : "ies"}
        </p>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-fg">
              <span className={`size-2 rounded-sm ${tooltip.dotClass}`} />
              {tooltip.rowLabel}
            </span>
            <span className="tabular-nums text-foreground font-medium">
              {fmt(tooltip.sp)} <span className="text-faint-fg font-normal">SP</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const LegendItem = ({
  colorClass,
  label,
  stories,
  sp,
  pct,
}: {
  colorClass: string;
  label: string;
  stories: number;
  sp: number;
  pct: number;
}) => (
  <div className="flex items-start gap-2">
    <span className={`mt-1 inline-block size-2 rounded-full ${colorClass}`} />
    <div className="min-w-0">
      <p className="text-[11px] text-muted-fg">{label}</p>
      <p className="text-sm font-medium tabular-nums text-foreground">
        {fmt(sp)} SP <span className="text-faint-fg font-normal">({pct.toFixed(0)}%)</span>
      </p>
      <p className="text-[11px] text-faint-fg">
        {fmt(stories)} stor{stories === 1 ? "y" : "ies"}
      </p>
    </div>
  </div>
);

export function ProjectOverviewSection({ overview }: Props) {
  const {
    totalStories,
    totalSP,
    deliveredPast,
    deliveredCurrent,
    inProgress,
    remaining,
    excluded,
    lastImportedAt,
  } = overview;
  const deliveredTotalSp = deliveredPast.sp + deliveredCurrent.sp;
  const deliveredTotalStories = deliveredPast.stories + deliveredCurrent.stories;

  // Percentages use the SUM OF BUCKETS as the denominator so the bar always
  // fills to exactly 100%. The CSV-based `totalSP` is kept for the headline
  // only — Delivered comes from Jira's velocity report (Sprint.completedSP)
  // which is a different data source, so the CSV sum and bucket sum may
  // legitimately diverge.
  const bucketsSum =
    deliveredPast.sp + deliveredCurrent.sp + inProgress.sp + remaining.sp + excluded.sp;
  const pctOf = (sp: number) => (bucketsSum > 0 ? Math.max(0, (sp / bucketsSum) * 100) : 0);

  const deliveredPastPct = pctOf(deliveredPast.sp);
  const deliveredCurrentPct = pctOf(deliveredCurrent.sp);
  const inProgressPct = pctOf(inProgress.sp);
  const remainingPct = pctOf(remaining.sp);
  const excludedPct = pctOf(excluded.sp);

  // Current-sprint identity for the legend — "In progress" is useful but
  // it's even better to say *which* sprint is in flight.
  const currentSprint = overview.bySprint.find(
    (s) => s.sprintStatus === "current",
  );

  const freshness = useMemo(() => relativeTime(lastImportedAt), [lastImportedAt]);
  const isStale = freshness != null && freshness.daysOld >= 1;

  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      {/* Header row: label left, Import button right */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-faint-fg">Project backlog</p>
          <div className="mt-1 flex items-baseline gap-4 flex-wrap">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {fmt(totalStories + excluded.stories)}
              <span className="text-sm font-normal text-faint-fg ml-1.5">stories</span>
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {fmt(totalSP + excluded.sp)}
              <span className="text-sm font-normal text-faint-fg ml-1.5">story points</span>
            </p>
          </div>
          <p className="text-[11px] text-faint-fg mt-1">
            {excluded.stories > 0 && (
              <>Incluant {excluded.stories} stor{excluded.stories === 1 ? "y" : "ies"} / {fmt(excluded.sp)} SP descoped ou split (segment rouge). </>
            )}
            Delivered SP from Jira velocity report.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {freshness && (
            <div className={`flex items-center gap-1.5 text-[11px] ${isStale ? "text-warn" : "text-faint-fg"}`}>
              {isStale ? <AlertCircle className="size-3" /> : <Clock className="size-3" />}
              <span>
                Backlog apporté {freshness.label}
                {isStale && " — à rafraîchir"}
              </span>
            </div>
          )}
          {!freshness && (
            <p className="text-[11px] text-faint-fg">
              Aucun backlog importé — importer depuis Project Backlog
            </p>
          )}
        </div>
      </div>

      {/* Stacked bar — each segment reveals a styled floating tooltip on
           hover (immediate, no native-title delay). */}
      <div className="mt-5">
        <div className="relative h-3 w-full rounded-full bg-background flex overflow-visible">
          <BarSegment
            colorClass="bg-ok/80 hover:bg-ok/90"
            widthPct={deliveredPastPct}
            rounded="left"
            tooltip={{
              title: "Delivered — past sprints",
              subtitle: "Jira velocity report (frozen at sprint close)",
              stories: deliveredPast.stories,
              sp: deliveredPast.sp,
              pct: deliveredPastPct,
              dotClass: "bg-ok",
              rowLabel: "Delivered",
            }}
          />
          <BarSegment
            colorClass="bg-ok/60 hover:bg-ok/70"
            widthPct={deliveredCurrentPct}
            tooltip={{
              title: "Delivered — current sprint",
              subtitle: "Stories past 'Dev Ready to Deploy to QA' in the active sprint",
              stories: deliveredCurrent.stories,
              sp: deliveredCurrent.sp,
              pct: deliveredCurrentPct,
              dotClass: "bg-ok",
              rowLabel: "Delivered (current)",
            }}
          />
          <BarSegment
            colorClass="bg-info/70 hover:bg-info/80"
            widthPct={inProgressPct}
            tooltip={{
              title: currentSprint ? `In flight — ${currentSprint.sprintName}` : "In flight",
              subtitle: "Active in the current sprint",
              stories: inProgress.stories,
              sp: inProgress.sp,
              pct: inProgressPct,
              dotClass: "bg-info",
              rowLabel: "In flight",
            }}
          />
          <BarSegment
            colorClass="bg-[color:var(--muted)] hover:bg-[color:var(--muted)]"
            widthPct={remainingPct}
            tooltip={{
              title: "Remaining to deliver",
              subtitle: "Future sprints + unassigned backlog",
              stories: remaining.stories,
              sp: remaining.sp,
              pct: remainingPct,
              dotClass: "bg-[color:var(--muted-fg)]",
              rowLabel: "Remaining",
            }}
          />
          <BarSegment
            colorClass="bg-danger/70 hover:bg-danger/80"
            widthPct={excludedPct}
            rounded="right"
            tooltip={{
              title: "Descoped / split",
              subtitle: "Excluded from scope",
              stories: excluded.stories,
              sp: excluded.sp,
              pct: excludedPct,
              dotClass: "bg-danger",
              rowLabel: "Excluded",
            }}
          />
        </div>

        {/* Legend */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-4">
          <LegendItem
            colorClass="bg-ok/80"
            label="Delivered (past sprints)"
            stories={deliveredPast.stories}
            sp={deliveredPast.sp}
            pct={deliveredPastPct}
          />
          <LegendItem
            colorClass="bg-ok/60"
            label="Delivered (current sprint)"
            stories={deliveredCurrent.stories}
            sp={deliveredCurrent.sp}
            pct={deliveredCurrentPct}
          />
          <LegendItem
            colorClass="bg-info/70"
            label={currentSprint ? `In flight (${currentSprint.sprintName})` : "In progress"}
            stories={inProgress.stories}
            sp={inProgress.sp}
            pct={inProgressPct}
          />
          <LegendItem
            colorClass="bg-[color:var(--muted)]"
            label="Remaining to deliver"
            stories={remaining.stories}
            sp={remaining.sp}
            pct={remainingPct}
          />
          <LegendItem
            colorClass="bg-danger/70"
            label="Descoped / split"
            stories={excluded.stories}
            sp={excluded.sp}
            pct={excludedPct}
          />
        </div>
      </div>
    </section>
  );
}

