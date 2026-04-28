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
    <div className="flex flex-col gap-24" data-stagger>
      {/* ─── COVER ─── */}
      <section className="pt-2">
        <p className="eyebrow">Cover · the question of the day</p>
        {verdict ? (
          <div className="mt-6 grid grid-cols-12 gap-x-8 gap-y-10 items-start">
            {/* Headline statement */}
            <div className="col-span-12 lg:col-span-8">
              <h2 className="font-display text-[clamp(48px,7vw,96px)] leading-[0.95] font-light tracking-[-0.03em] text-[color:var(--ink)]">
                Can the team deliver{" "}
                <span className="italic font-light text-[color:var(--muted-fg)]">
                  {verdict.target.name}
                </span>
                <span className="text-[color:var(--coral)]">?</span>
              </h2>
              <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-[color:var(--muted-fg)]">
                The {verdict.target.name} window holds{" "}
                <span className="text-[color:var(--ink)] tabular-nums">{fmt(verdict.scopeSP)}&nbsp;SP</span>{" "}
                across <span className="tabular-nums">{verdict.stories}</span> stories. Against a historical
                velocity of <span className="tabular-nums">{verdict.velocity.toFixed(2)}&nbsp;SP/hr</span> and{" "}
                <span className="tabular-nums">{fmt(verdict.hours)}&nbsp;net&nbsp;hours</span>, the team
                projects to deliver{" "}
                <span className="text-[color:var(--ink)] tabular-nums">{fmt(verdict.projection)}&nbsp;SP</span>.
              </p>
            </div>

            {/* Verdict word + delta — kept compact so it aligns with the
                left column and never grows past the headline height. */}
            <div className="col-span-12 lg:col-span-4 lg:pl-8 lg:border-l hairline">
              <p className="eyebrow mb-4">Verdict</p>
              <p className="font-display text-[88px] leading-none font-light italic tracking-tight text-[color:var(--coral)]">
                {verdict.label}
              </p>
              <p className="mt-6 text-[13px] text-[color:var(--muted-fg)]">
                {verdict.delta >= 0 ? (
                  <>
                    <span className="text-[color:var(--ink)] tabular-nums">+{fmt(verdict.delta)}&nbsp;SP</span>{" "}
                    of room over the projection.
                  </>
                ) : (
                  <>
                    <span className="text-[color:var(--ink)] tabular-nums">{fmt(Math.abs(verdict.delta))}&nbsp;SP</span>{" "}
                    above the projected ceiling.
                  </>
                )}
              </p>
              <Link
                href={`/${slug}/capacity`}
                onClick={() => {
                  const idx = activeSprints.findIndex((s) => s.id === verdict.target.id);
                  if (idx >= 0) setSelectedIndex(idx);
                }}
                className="mt-8 inline-flex items-baseline gap-2 text-[12px] tracking-tight text-[color:var(--ink)] border-b hairline-strong hover:text-[color:var(--coral)] hover:border-[color:var(--coral)] transition-colors"
              >
                Read the full plan
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-[15px] text-[color:var(--muted-fg)]">
            No upcoming sprint configured. Define dates in <Link href={`/${slug}/sprints`} className="underline">Sprint Plan</Link>.
          </p>
        )}
      </section>

      {/* ─── TUNE THE VERDICT ─── */}
      {verdict && (
        <section>
          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <div>
              <p className="eyebrow">Apparatus · tune the verdict</p>
              <h3 className="font-display text-[36px] leading-tight font-light italic mt-2 tracking-tight">
                Two dials. One projection.
              </h3>
            </div>
            <p className="text-[12px] text-[color:var(--muted-fg)] max-w-md text-right">
              Pick how many recent sprints feed the velocity, then layer a
              ±10% scenario on top. Math is shown in plain sight.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-12 gap-x-8 gap-y-10">
            {/* Velocity basis */}
            <div className="col-span-12 lg:col-span-5">
              <p className="eyebrow mb-4">Velocity basis · sprints averaged</p>
              <div className="flex divide-x divide-[color:var(--line)] border hairline">
                {BASIS_OPTIONS.map((opt) => {
                  const active = basis === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      title={opt.hint}
                      onClick={() => setBasis(opt.key)}
                      className={`flex-1 px-3 py-3 text-center transition-colors ${
                        active
                          ? "bg-[color:var(--coral)]/10 text-[color:var(--ink)]"
                          : "text-[color:var(--muted-fg)] hover:text-[color:var(--ink)] hover:bg-[color:var(--ink)]/[0.03]"
                      }`}
                    >
                      <span
                        className={`block font-mono text-[14px] tracking-tight ${
                          active ? "text-[color:var(--coral)]" : ""
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="block mt-1 font-mono text-[9px] tracking-wider text-[color:var(--faint-fg)] uppercase">
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 font-mono text-[11px] tracking-wider text-[color:var(--faint-fg)] tabular-nums">
                baseline · {(velocityByBasis[basis] || 0).toFixed(2)} SP/hr
              </p>
            </div>

            {/* Scenario buttons */}
            <div className="col-span-12 lg:col-span-4">
              <p className="eyebrow mb-4">Scenario · growth on top</p>
              <div>
                {SCENARIO_OPTIONS.map((sc) => {
                  const baseV = velocityByBasis[basis] || 0;
                  const projection = verdict.hours * baseV * (1 + sc.growth / 100);
                  const active = activeScenario === sc.key;
                  return (
                    <button
                      key={sc.key}
                      type="button"
                      onClick={() => setGrowthPct(sc.growth)}
                      className={`group relative flex w-full items-baseline justify-between py-3 border-b hairline transition-colors text-left ${
                        active
                          ? "text-[color:var(--ink)]"
                          : "text-[color:var(--muted-fg)] hover:text-[color:var(--ink)]"
                      }`}
                    >
                      <span className="flex items-baseline gap-3">
                        <span
                          className={`size-1.5 rounded-full shrink-0 transition-colors ${
                            active ? "bg-[color:var(--coral)]" : "bg-[color:var(--line-strong)]"
                          }`}
                        />
                        <span className="text-[14px] tracking-tight">{sc.label}</span>
                        <span className="font-mono text-[10px] tracking-wider text-[color:var(--faint-fg)] tabular-nums">
                          {sc.growth > 0 ? "+" : ""}{sc.growth}%
                        </span>
                      </span>
                      <span
                        className={`font-mono text-[15px] tabular-nums transition-colors ${
                          active ? "text-[color:var(--coral)]" : "text-[color:var(--muted-fg)]"
                        }`}
                      >
                        {fmt(projection)}{" "}
                        <span className="text-[10px] text-[color:var(--faint-fg)]">SP</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calculation chain */}
            <div className="col-span-12 lg:col-span-3 lg:pl-8 lg:border-l hairline">
              <p className="eyebrow mb-4">Calculation</p>
              <p className="font-mono text-[12px] tabular-nums leading-relaxed text-[color:var(--muted-fg)]">
                <span className="text-[color:var(--ink)]">{fmt(verdict.hours)}</span>{" "}
                <span className="text-[color:var(--faint-fg)]">net hrs</span>
                <br />
                ×{" "}
                <span className="text-[color:var(--ink)]">
                  {(velocityByBasis[basis] || 0).toFixed(2)}
                </span>{" "}
                <span className="text-[color:var(--faint-fg)]">SP/hr</span>
                <br />
                ×{" "}
                <span className="text-[color:var(--ink)]">
                  {growthPct > 0 ? "+" : ""}{growthPct}%
                </span>{" "}
                <span className="text-[color:var(--faint-fg)]">scenario</span>
              </p>
              <p className="mt-4 font-display text-[32px] leading-none font-light italic text-[color:var(--coral)] tabular-nums">
                {fmt(verdict.projection)}
                <span className="ml-2 text-[12px] font-sans not-italic text-[color:var(--faint-fg)]">SP</span>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ─── PROJECT FIGURE ─── */}
      <section>
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <p className="eyebrow">Figure I · the project at a glance</p>
            <h3 className="font-display text-[36px] leading-tight font-light italic mt-2 tracking-tight">
              The journey, by the numbers.
            </h3>
          </div>
          <p className="text-[12px] text-[color:var(--muted-fg)] max-w-md text-right">
            {overview.totalStories + overview.excluded.stories} stories total · imported from Jira ·
            <Link href={`/${slug}/project-backlog`} className="ml-1 text-[color:var(--ink)] underline-offset-4 hover:text-[color:var(--coral)] underline">
              re-import
            </Link>
          </p>
        </div>

        {/* Stacked progress bar — single hairline */}
        <div className="mt-10">
          <div className="relative h-1 w-full bg-[color:var(--line)] overflow-hidden">
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
        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 divide-x divide-[color:var(--line)]">
          {buckets.map((b, i) => (
            <div key={b.key} className={`${i === 0 ? "pl-0" : "pl-8"} pr-8`}>
              <p className="eyebrow">{b.label}</p>
              <p className="mt-3 font-display text-[56px] leading-none font-light tracking-tight text-[color:var(--ink)] tabular-nums">
                {fmt(b.sp)}
                <span className="ml-2 text-[16px] text-[color:var(--faint-fg)] font-sans tracking-wide">SP</span>
              </p>
              <p className="mt-3 text-[12px] text-[color:var(--muted-fg)] tabular-nums">
                {fmt(b.stories)} stor{b.stories === 1 ? "y" : "ies"} · {b.pct.toFixed(1)}%
              </p>
              <p className="mt-1 text-[11px] italic text-[color:var(--faint-fg)]">
                {b.hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── LOOK-AHEAD ─── */}
      <section>
        <p className="eyebrow">Figure II · the four sprints ahead</p>
        <h3 className="font-display text-[36px] leading-tight font-light italic mt-2 tracking-tight">
          Where the team is going.
        </h3>

        <div className="mt-10 grid grid-cols-12 gap-x-6 text-[11px] tracking-wider uppercase text-[color:var(--faint-fg)] pb-3 border-b hairline-strong">
          <div className="col-span-3">Sprint</div>
          <div className="col-span-2">Window</div>
          <div className="col-span-2 text-right">Scope</div>
          <div className="col-span-2 text-right">Forecast</div>
          <div className="col-span-3">Margin</div>
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
                className="grid grid-cols-12 gap-x-6 items-baseline py-5 border-b hairline group hover:bg-[color:var(--ink)]/[0.02] transition-colors"
              >
                <div className="col-span-3 flex items-baseline gap-3">
                  <span
                    className={`size-1.5 rounded-full shrink-0 ${
                      s.sprintStatus === "current"
                        ? "bg-[color:var(--coral)] pulse-soft"
                        : "bg-[color:var(--faint-fg)]"
                    }`}
                  />
                  <span className="font-display text-[20px] font-light italic tracking-tight text-[color:var(--ink)]">
                    {sprint.name}
                  </span>
                  <span className="eyebrow">
                    {s.sprintStatus}
                  </span>
                </div>
                <div className="col-span-2 text-[12px] text-[color:var(--muted-fg)] tabular-nums">
                  {dates}
                </div>
                <div className="col-span-2 text-right">
                  <span className="font-mono text-[18px] font-light text-[color:var(--ink)]">
                    {fmt(scopeSP)}
                  </span>
                  <span className="ml-1.5 text-[10px] text-[color:var(--faint-fg)]">SP</span>
                </div>
                <div className="col-span-2 text-right">
                  <span className="font-mono text-[18px] font-light text-[color:var(--ink)]">
                    {fmt(projection)}
                  </span>
                  <span className="ml-1.5 text-[10px] text-[color:var(--faint-fg)]">SP</span>
                </div>
                <div className="col-span-3 flex items-center gap-3">
                  <div className="flex-1 h-px relative bg-[color:var(--line)]">
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 h-px ${fits ? "bg-[color:var(--ink)]" : "bg-[color:var(--coral)]"}`}
                      style={{
                        width: `${Math.min(100, Math.abs(margin))}%`,
                        left: fits ? "50%" : `${50 - Math.min(50, Math.abs(margin) / 2)}%`,
                      }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-[color:var(--ink)]"
                      style={{ left: "50%", transform: "translate(-50%, -50%)" }}
                    />
                  </div>
                  <span
                    className={`font-mono text-[12px] tabular-nums ${
                      fits ? "text-[color:var(--ink)]" : "text-[color:var(--coral)]"
                    }`}
                  >
                    {fits ? "+" : ""}{fmt(delta)} SP
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ─── COLOPHON ─── */}
      <section className="pt-8 pb-4 border-t hairline">
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <p className="font-display text-[14px] italic font-light text-[color:var(--faint-fg)] tracking-wide">
            Set in Fraunces & Inter Tight — composed for York Planning.
          </p>
          <p className="eyebrow">End of front matter</p>
        </div>
      </section>
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
