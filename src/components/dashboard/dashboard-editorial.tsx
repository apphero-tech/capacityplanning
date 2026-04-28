"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSprint } from "@/contexts/sprint-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { useProjectionSettings } from "@/contexts/projection-settings-context";
import {
  computeDevCapacityFromIC,
  computeHistoricalVelocity,
  type VelocityBasis,
} from "@/lib/capacity-engine";
import type { ProjectOverview } from "@/lib/project-overview";
import type { SprintStory } from "@/types";

/**
 * Two independent dimensions drive the verdict math:
 *
 *   1. Velocity basis — how many recent sprints to average over.
 *      Picks the *baseline* SP-per-hour figure.
 *   2. Scenario       — a ±10% multiplier applied on top of that baseline,
 *      to model team progression or risk.
 *
 * The two compose freely:
 *
 *     final_velocity = velocity(basis) × (1 + scenario_growth)
 *     projected_SP   = net_dev_hours × final_velocity
 *
 * Both controls live side-by-side on the cover so the user can play with
 * both at once.
 */
const BASIS_OPTIONS: { key: VelocityBasis; label: string; hint: string }[] = [
  { key: "last1", label: "1",   hint: "Last sprint" },
  { key: "last2", label: "2",   hint: "2-sprint avg" },
  { key: "last3", label: "3",   hint: "3-sprint avg" },
  { key: "last6", label: "6",   hint: "6-sprint avg" },
  { key: "all",   label: "All", hint: "All sprints" },
];

const SCENARIO_OPTIONS: {
  key: "conservative" | "normal" | "ambitious";
  label: string;
  growth: number;
}[] = [
  { key: "conservative", label: "Conservative", growth: -10 },
  { key: "normal",       label: "Normal",       growth:   0 },
  { key: "ambitious",    label: "Ambitious",    growth: +10 },
];

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface Props {
  overview: ProjectOverview;
  storiesBySprint: Record<string, SprintStory[]>;
}

/**
 * Dashboard — editorial cover.
 *
 * The page reads top-to-bottom like an opening spread:
 *
 *   1. Cover statement — a verdict for the next sprint, set in display serif,
 *      with the answer ("Fits" / "Tight" / "Overflow") as a single coral
 *      word and the supporting evidence in a left-aligned column.
 *   2. Project at-a-glance — total scope split into Delivered / In flight /
 *      Remaining / Excluded as four large measurements, separated by hairlines.
 *   3. Look-ahead — the next four sprints as a horizontal table with scope
 *      vs. forecast on each row, the way an editor would lay out a calendar.
 *
 * No card chrome. No coloured tiles. Numbers do the heavy lifting.
 */
export function DashboardEditorial({ overview, storiesBySprint }: Props) {
  const {
    allSprints,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
    setSelectedIndex,
    sprints: activeSprints,
  } = useSprint();
  const { slug } = useWorkspace();
  const { basis, growthPct, setBasis, setGrowthPct, effectiveMultiplier } =
    useProjectionSettings();
  const activeScenario =
    SCENARIO_OPTIONS.find((s) => s.growth === growthPct)?.key ?? null;

  /* ----- target sprint = the one in flight today (falls back to "next") ----- */
  const target = useMemo(() => {
    const ordered = [...allSprints]
      .filter((s) => !s.isDemo)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    return (
      ordered.find((s) => s.isCurrent) ??
      ordered.find((s) => s.status === "next") ??
      null
    );
  }, [allSprints]);

  const deloitteCaps = useMemo(
    () => initialCapacities.filter((c) => c.organization === "Deloitte" && c.isActive),
    [initialCapacities],
  );

  const historical = useMemo(
    () =>
      computeHistoricalVelocity(
        allSprints,
        initialCapacities.filter((c) => c.organization === "Deloitte"),
        publicHolidays,
        projectHolidays,
        ptoEntries,
        basis,
      ),
    [allSprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries, basis],
  );

  // Velocity per basis — used to live-preview projections on each basis chip.
  const velocityByBasis = useMemo(() => {
    const map: Record<VelocityBasis, number> = {
      last1: 0, last2: 0, last3: 0, last6: 0, all: 0,
    };
    for (const opt of BASIS_OPTIONS) {
      map[opt.key] = computeHistoricalVelocity(
        allSprints,
        initialCapacities.filter((c) => c.organization === "Deloitte"),
        publicHolidays,
        projectHolidays,
        ptoEntries,
        opt.key,
      ).velocity;
    }
    return map;
  }, [allSprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries]);

  const verdict = useMemo(() => {
    if (!target) return null;
    // Scope = active (still-to-deliver) SP — same definition as the
    // Dashboard's "In flight" bucket and the Sprint Plan's Scope column,
    // so all three numbers agree. Stories already past Dev hand-off don't
    // count against capacity in the verdict.
    const bucket = overview.bySprint.find((b) => b.sprintId === target.id);
    const scopeSP = bucket ? bucket.inProgress.sp + bucket.remaining.sp : 0;
    const scopeStories = bucket
      ? bucket.inProgress.stories + bucket.remaining.stories
      : 0;
    const devCaps = computeDevCapacityFromIC(
      deloitteCaps,
      target,
      publicHolidays,
      projectHolidays,
      ptoEntries,
    );
    const hours = devCaps.reduce((sum, d) => sum + d.netDevHrs, 0);
    const velocity = historical.velocity * effectiveMultiplier;
    const projection = hours * velocity;
    const delta = projection - scopeSP;
    const ratio = scopeSP > 0 ? projection / scopeSP : 1;

    let label: "Fits" | "Tight" | "Overflow";
    if (ratio >= 1.05) label = "Fits";
    else if (ratio >= 0.95) label = "Tight";
    else label = "Overflow";

    return {
      target,
      scopeSP,
      hours,
      velocity,
      projection,
      delta,
      ratio,
      label,
      stories: scopeStories,
    };
  }, [target, overview.bySprint, deloitteCaps, publicHolidays, projectHolidays, ptoEntries, historical, effectiveMultiplier]);

  const buckets = useMemo(() => {
    const sum =
      overview.deliveredPast.sp +
      overview.deliveredCurrent.sp +
      overview.inProgress.sp +
      overview.remaining.sp +
      overview.excluded.sp;
    return [
      { key: "delivered", label: "Delivered", sp: overview.delivered.sp, stories: overview.delivered.stories, hint: "past sprints + done" },
      { key: "inflight",  label: "In flight", sp: overview.inProgress.sp, stories: overview.inProgress.stories, hint: overview.bySprint.find((b) => b.sprintStatus === "current")?.sprintName ?? "current sprint" },
      { key: "remaining", label: "Remaining", sp: overview.remaining.sp, stories: overview.remaining.stories, hint: "future sprints" },
      { key: "excluded",  label: "Out of scope", sp: overview.excluded.sp, stories: overview.excluded.stories, hint: "descoped · merged · split" },
    ].map((b) => ({ ...b, pct: sum > 0 ? (b.sp / sum) * 100 : 0 }));
  }, [overview]);

  const lookAhead = useMemo(() => {
    return overview.bySprint
      .filter((s) => {
        const status = s.sprintStatus;
        return status === "current" || status === "next" || status === "planning" || status === "future";
      })
      .slice(0, 5);
  }, [overview]);

  return (
    <div className="flex flex-col gap-16" data-stagger>
      {/* ─── HERO ─── one moment of typographic personality */}
      <section>
        {verdict ? (
          <div className="grid grid-cols-12 gap-x-8 gap-y-8 items-start">
            {/* Headline question — Fraunces, the only place it's used. */}
            <div className="col-span-12 lg:col-span-8">
              <p className="eyebrow">The question</p>
              <h2 className="mt-3 font-display text-[clamp(40px,5.5vw,72px)] leading-[1.0] font-light tracking-[-0.022em] text-[color:var(--ink)]">
                Can the team deliver{" "}
                <span className="text-[color:var(--ink)]">
                  {verdict.target.name}
                </span>
                <span className="text-[color:var(--coral)]">?</span>
              </h2>
              <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-[color:var(--muted-fg)]">
                Scope is <span className="text-[color:var(--ink)] font-mono tabular-nums">{fmt(verdict.scopeSP)}</span> SP across{" "}
                <span className="font-mono tabular-nums">{verdict.stories}</span> stories.
                With <span className="font-mono tabular-nums">{fmt(verdict.hours)}</span> net hours at a velocity of{" "}
                <span className="font-mono tabular-nums">{verdict.velocity.toFixed(2)}</span> SP/hr,
                projection is <span className="text-[color:var(--ink)] font-mono tabular-nums">{fmt(verdict.projection)}</span> SP.
              </p>
            </div>

            {/* Verdict block — coral word, delta, link */}
            <div className="col-span-12 lg:col-span-4 lg:pl-8 lg:border-l hairline">
              <p className="eyebrow">Verdict</p>
              <p className="mt-3 display-italic text-[72px] leading-none text-[color:var(--coral)]">
                {verdict.label}
              </p>
              <p className="mt-5 text-[13px] text-[color:var(--muted-fg)]">
                {verdict.delta >= 0 ? (
                  <>
                    <span className="text-[color:var(--ink)] font-mono tabular-nums">+{fmt(verdict.delta)} SP</span>{" "}
                    of room.
                  </>
                ) : (
                  <>
                    <span className="text-[color:var(--ink)] font-mono tabular-nums">{fmt(Math.abs(verdict.delta))} SP</span>{" "}
                    over the ceiling.
                  </>
                )}
              </p>
              <Link
                href={`/${slug}/capacity`}
                onClick={() => {
                  const idx = activeSprints.findIndex((s) => s.id === verdict.target.id);
                  if (idx >= 0) setSelectedIndex(idx);
                }}
                className="mt-6 inline-flex items-center gap-1.5 text-[12px] tracking-tight text-[color:var(--ink)] hover:text-[color:var(--coral)] transition-colors"
              >
                Open capacity plan
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-[15px] text-[color:var(--muted-fg)]">
            No upcoming sprint configured. Define dates in <Link href={`/${slug}/sprints`} className="underline">Sprint Plan</Link>.
          </p>
        )}
      </section>

      {/* ─── TUNE ─── velocity basis + scenario, software-first */}
      {verdict && (
        <section>
          <SectionHeader
            label="Tune"
            title="Velocity basis & scenario"
            help="Pick how many recent sprints feed the velocity, then layer a ±10% scenario on top."
          />

          <div className="mt-6 grid grid-cols-12 gap-x-6 gap-y-8">
            {/* Velocity basis — segmented control */}
            <div className="col-span-12 lg:col-span-5">
              <p className="code-label mb-2.5">VELOCITY BASIS</p>
              <div className="grid grid-cols-5 rounded-md border hairline overflow-hidden bg-[color:var(--paper-elev)]/40">
                {BASIS_OPTIONS.map((opt) => {
                  const active = basis === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      title={opt.hint}
                      onClick={() => setBasis(opt.key)}
                      className={`relative px-2 py-2.5 text-center transition-colors border-r hairline last:border-r-0 ${
                        active
                          ? "bg-[color:var(--ink)]/[0.06]"
                          : "hover:bg-[color:var(--ink)]/[0.03]"
                      }`}
                    >
                      <span
                        className={`block font-mono text-[13px] tracking-tight transition-colors ${
                          active ? "text-[color:var(--coral)]" : "text-[color:var(--muted-fg)]"
                        }`}
                      >
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 code-label tabular-nums">
                {BASIS_OPTIONS.find((o) => o.key === basis)?.hint} · baseline {(velocityByBasis[basis] || 0).toFixed(2)} SP/hr
              </p>
            </div>

            {/* Scenario — list of three */}
            <div className="col-span-12 lg:col-span-4">
              <p className="code-label mb-2.5">SCENARIO</p>
              <ul className="rounded-md border hairline overflow-hidden bg-[color:var(--paper-elev)]/40 divide-y divide-[color:var(--line)]">
                {SCENARIO_OPTIONS.map((sc) => {
                  const baseV = velocityByBasis[basis] || 0;
                  const projection = verdict.hours * baseV * (1 + sc.growth / 100);
                  const active = activeScenario === sc.key;
                  return (
                    <li key={sc.key}>
                      <button
                        type="button"
                        onClick={() => setGrowthPct(sc.growth)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-left ${
                          active
                            ? "bg-[color:var(--ink)]/[0.05]"
                            : "hover:bg-[color:var(--ink)]/[0.03]"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={`size-1.5 rounded-full shrink-0 ${
                              active ? "bg-[color:var(--coral)]" : "bg-[color:var(--line-strong)]"
                            }`}
                          />
                          <span className={`text-[13px] tracking-tight ${active ? "text-[color:var(--ink)]" : "text-[color:var(--muted-fg)]"}`}>
                            {sc.label}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-[color:var(--faint-fg)]">
                            {sc.growth > 0 ? "+" : ""}{sc.growth}%
                          </span>
                        </span>
                        <span className={`font-mono text-[13px] tabular-nums ${active ? "text-[color:var(--coral)]" : "text-[color:var(--muted-fg)]"}`}>
                          {fmt(projection)} <span className="text-[10px] text-[color:var(--faint-fg)]">SP</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Calculation chain */}
            <div className="col-span-12 lg:col-span-3 lg:pl-6 lg:border-l hairline">
              <p className="code-label mb-2.5">CALCULATION</p>
              <pre className="font-mono text-[12px] leading-[1.6] text-[color:var(--muted-fg)] tabular-nums whitespace-pre">
{fmt(verdict.hours).padStart(7)} <span className="opacity-50">net hrs</span>
×{(velocityByBasis[basis] || 0).toFixed(2).padStart(6)} <span className="opacity-50">SP/hr</span>
×{`${growthPct > 0 ? "+" : ""}${growthPct}%`.padStart(6)} <span className="opacity-50">scenario</span>
              </pre>
              <div className="mt-3 pt-3 border-t hairline">
                <span className="font-mono text-[24px] font-medium text-[color:var(--coral)] tabular-nums">
                  {fmt(verdict.projection)}
                </span>
                <span className="ml-1.5 text-[11px] text-[color:var(--faint-fg)]">SP projected</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── PROJECT OVERVIEW ─── */}
      <section>
        <SectionHeader
          label="Project"
          title="Scope overview"
          right={
            <p className="text-[12px] text-[color:var(--muted-fg)] tabular-nums">
              <span className="font-mono">{overview.totalStories + overview.excluded.stories}</span> stories from Jira ·{" "}
              <Link href={`/${slug}/project-backlog`} className="text-[color:var(--ink)] hover:text-[color:var(--coral)] transition-colors">
                re-import →
              </Link>
            </p>
          }
        />

        {/* Progress bar */}
        <div className="mt-6">
          <div className="relative h-1.5 w-full bg-[color:var(--line)] rounded-full overflow-hidden">
            {(() => {
              let offset = 0;
              return buckets.map((b) => {
                const left = offset;
                offset += b.pct;
                const color =
                  b.key === "delivered"
                    ? "bg-[color:var(--ink)]"
                    : b.key === "inflight"
                      ? "bg-[color:var(--coral)]"
                      : b.key === "remaining"
                        ? "bg-[color:var(--muted-fg)]"
                        : "bg-[color:var(--coral)]/30";
                return (
                  <span
                    key={b.key}
                    className={`absolute top-0 h-full ${color} draw-line`}
                    style={{ left: `${left}%`, width: `${b.pct}%`, transformOrigin: "left" }}
                  />
                );
              });
            })()}
          </div>
        </div>

        {/* Bucket grid */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6">
          {buckets.map((b) => (
            <div key={b.key} className="rounded-md border hairline bg-[color:var(--paper-elev)]/30 p-4 hover:border-[color:var(--line-strong)] transition-colors">
              <div className="flex items-baseline justify-between">
                <p className="code-label">{b.label.toUpperCase()}</p>
                <p className="text-[11px] font-mono tabular-nums text-[color:var(--faint-fg)]">
                  {b.pct.toFixed(1)}%
                </p>
              </div>
              <p className="mt-3 font-mono text-[34px] leading-none font-medium text-[color:var(--ink)] tabular-nums">
                {fmt(b.sp)}
                <span className="ml-1.5 text-[12px] text-[color:var(--faint-fg)] font-sans tracking-wide">SP</span>
              </p>
              <p className="mt-2.5 text-[11px] text-[color:var(--muted-fg)] tabular-nums">
                {fmt(b.stories)} stor{b.stories === 1 ? "y" : "ies"} · <span className="text-[color:var(--faint-fg)]">{b.hint}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── LOOK-AHEAD ─── */}
      <section>
        <SectionHeader
          label="Plan"
          title="The next sprints"
          help="Scope vs forecast for every active sprint. Click to open in Capacity Planning."
        />

        <div className="mt-6 rounded-md border hairline overflow-hidden">
          <div className="grid grid-cols-12 gap-x-4 px-4 py-2.5 code-label border-b hairline bg-[color:var(--paper-elev)]/30">
            <div className="col-span-3">Sprint</div>
            <div className="col-span-3">Window</div>
            <div className="col-span-2 text-right">Scope</div>
            <div className="col-span-2 text-right">Forecast</div>
            <div className="col-span-2">Margin</div>
          </div>

          <ul>
            {lookAhead.map((s) => {
              const sprint = allSprints.find((a) => a.id === s.sprintId);
              if (!sprint) return null;
              const scopeSP = s.inProgress.sp + s.remaining.sp;
              const devCaps = computeDevCapacityFromIC(
                deloitteCaps,
                sprint,
                publicHolidays,
                projectHolidays,
                ptoEntries,
              );
              const hours = devCaps.reduce((sum, d) => sum + d.netDevHrs, 0);
              const projection = hours * historical.velocity * effectiveMultiplier;
              const delta = projection - scopeSP;
              const margin = scopeSP > 0 ? (delta / scopeSP) * 100 : 0;
              const fits = delta >= 0;

              const dates = sprint.startDate && sprint.endDate
                ? `${formatShort(sprint.startDate)} – ${formatShort(sprint.endDate)}`
                : "—";

              return (
                <li
                  key={s.sprintId}
                  className="grid grid-cols-12 gap-x-4 items-center px-4 py-3 border-b hairline last:border-b-0 hover:bg-[color:var(--ink)]/[0.02] transition-colors"
                >
                  <div className="col-span-3 flex items-center gap-2.5">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        s.sprintStatus === "current"
                          ? "bg-[color:var(--coral)] pulse-soft"
                          : s.sprintStatus === "next"
                            ? "bg-amber-300/80"
                            : s.sprintStatus === "planning"
                              ? "bg-violet-300/70"
                              : "bg-[color:var(--faint-fg)]"
                      }`}
                    />
                    <span className="text-[13px] font-medium tracking-tight text-[color:var(--ink)]">
                      {sprint.name}
                    </span>
                    <span className="code-label">
                      {s.sprintStatus}
                    </span>
                  </div>
                  <div className="col-span-3 text-[12px] text-[color:var(--muted-fg)] font-mono tabular-nums">
                    {dates}
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="font-mono text-[14px] text-[color:var(--ink)] tabular-nums">
                      {fmt(scopeSP)}
                    </span>
                    <span className="ml-1 text-[10px] text-[color:var(--faint-fg)]">SP</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="font-mono text-[14px] text-[color:var(--ink)] tabular-nums">
                      {fmt(projection)}
                    </span>
                    <span className="ml-1 text-[10px] text-[color:var(--faint-fg)]">SP</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="flex-1 h-px relative bg-[color:var(--line)]">
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 h-px ${fits ? "bg-[color:var(--ink)]" : "bg-[color:var(--coral)]"}`}
                        style={{
                          width: `${Math.min(100, Math.abs(margin))}%`,
                          left: fits ? "50%" : `${50 - Math.min(50, Math.abs(margin) / 2)}%`,
                        }}
                      />
                      <span
                        className="absolute top-1/2 -translate-y-1/2 size-1 rounded-full bg-[color:var(--muted-fg)]"
                        style={{ left: "50%", transform: "translate(-50%, -50%)" }}
                      />
                    </div>
                    <span
                      className={`font-mono text-[11px] tabular-nums shrink-0 ${
                        fits ? "text-[color:var(--ink)]" : "text-[color:var(--coral)]"
                      }`}
                    >
                      {fits ? "+" : ""}{fmt(delta)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

/** Section header — eyebrow label + title on one line, optional help/right slot. */
function SectionHeader({
  label,
  title,
  help,
  right,
}: {
  label: string;
  title: string;
  help?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between flex-wrap gap-3 pb-3 border-b hairline">
      <div className="flex items-baseline gap-3">
        <p className="code-label">{label.toUpperCase()}</p>
        <h3 className="text-[15px] font-medium tracking-tight text-[color:var(--ink)]">
          {title}
        </h3>
        {help && (
          <p className="text-[12px] text-[color:var(--muted-fg)] hidden lg:inline">
            {help}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
