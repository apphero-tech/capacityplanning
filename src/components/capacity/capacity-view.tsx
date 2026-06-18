"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Check, AlertTriangle, Info, Upload, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReconcileResponse {
  ok: true;
  sprintId: string;
  sprintName: string;
  totals: {
    csvRows: number;
    inScope: number;
    ignoredRows: number;
    existing: number;
    matched: number;
    added: number;
    removed: number;
    changed: number;
  };
  added: { key: string; summary: string; storyPoints: number | null; status: string }[];
  removed: { key: string; summary: string; storyPoints: number | null; status: string }[];
  changed: {
    key: string;
    summary: string;
    diffs: { field: string; before: unknown; after: unknown }[];
  }[];
}

const RECONCILABLE_STATUSES = new Set(["current", "next", "planning"]);

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
      <p className="text-sm text-muted-fg">Select a sprint in the top bar.</p>
    );
  }

  if (!plan) return null;

  const fits = plan.defaultProjection - plan.scopeSP >= 0;
  const verdictColor = fits ? "text-ok" : "text-danger";
  const VerdictIcon = fits ? Check : AlertTriangle;
  const verdictText = fits
    ? `Fits — ${fmt(plan.defaultProjection - plan.scopeSP)} SP of room`
    : `Overflow — ${fmt(Math.abs(plan.defaultProjection - plan.scopeSP))} SP to cut`;

  const canReconcile = !!sprint && RECONCILABLE_STATUSES.has(sprint.status);

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
      <section className="rounded-2xl border border-line bg-card p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-[12px] text-faint-fg">
            Can we deliver{" "}
            <span className="text-foreground font-medium">{sprint.name}</span>?
          </p>
          <div className="flex items-center gap-3">
            {canReconcile && (
              <ReconcileSprintButton
                sprintId={sprint.id}
                sprintName={sprint.name}
              />
            )}
            <p className="text-[12px] text-faint-fg">
              {formatDateRangeShort(sprint.startDate, sprint.endDate)}
            </p>
          </div>
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
          <div className="border-t border-line pt-3 flex items-baseline justify-between">
            <p className="text-[13px] font-medium text-foreground">Verdict</p>
            <p className={`text-xl font-semibold tabular-nums flex items-center gap-2 ${verdictColor}`}>
              <VerdictIcon className="size-4" />
              {verdictText}
            </p>
          </div>
        </div>

        {/* Inline projection knobs — basis + growth side-by-side right under
            the verdict so the user can tweak and see the number move without
            scrolling. */}
        <div className="mt-5 border-t border-line pt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wide text-faint-fg">
              Velocity
            </span>
            <div className="flex rounded-lg border border-line bg-background p-0.5">
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
                        ? "bg-foreground text-background"
                        : "text-muted-fg hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wide text-faint-fg">
              Growth
            </span>
            <div className="flex rounded-lg border border-line bg-background p-0.5">
              {[0, 3, 5, 10, 20].map((p) => {
                const active = p === growthPct;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setGrowthPct(p)}
                    className={`px-3 h-7 rounded-md text-[12px] font-medium transition-colors tabular-nums ${
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-fg hover:text-foreground"
                    }`}
                  >
                    {p === 0 ? "0%" : `+${p}%`}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 text-[12px] text-faint-fg">
              <input
                type="number"
                value={growthPct}
                onChange={(e) => setGrowthPct(Number(e.target.value) || 0)}
                step={1}
                className="w-14 h-7 rounded-md border border-line bg-background px-2 text-[12px] text-foreground tabular-nums focus:border-line-strong"
              />
              <span>%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Capacity breakdown */}
      <section>
        <h3 className="text-[13px] font-medium text-foreground mb-3">
          Hours available
        </h3>
        <div className="rounded-2xl border border-line bg-card divide-y divide-[color:var(--line)]">
          <BreakdownRow
            label="Developers"
            value={plan.developers.toString()}
            hint="active Deloitte members with DEV allocation"
            explain={
              <>
                <p className="font-medium text-foreground mb-1.5">
                  {plan.developers} active Deloitte developer
                  {plan.developers === 1 ? "" : "s"}
                </p>
                <ul className="space-y-1 text-muted-fg">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-foreground">{d.name}</span>
                      <span className="text-faint-fg tabular-nums">
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
                <p className="font-medium text-foreground mb-1.5">
                  Theoretical hours by developer
                </p>
                <ul className="space-y-1 text-muted-fg">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-foreground">
                        {d.name}
                        <span className="text-faint-fg ml-1.5">
                          {d.hrsPerWeek} hrs/wk · {Math.round(d.devPercent * 100)}%
                        </span>
                      </span>
                      <span className="text-foreground tabular-nums">
                        {fmt(d.grossHrs)} hrs
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-4 border-t border-line pt-1 mt-1 text-foreground">
                    <span className="font-medium">Total</span>
                    <span className="font-semibold tabular-nums">
                      {fmt(plan.theoreticalHrs)} hrs
                    </span>
                  </li>
                </ul>
                <p className="mt-2 text-[11px] text-faint-fg">
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
                <p className="font-medium text-foreground mb-1.5">
                  Days off per developer
                </p>
                <ul className="space-y-1 text-muted-fg">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-foreground">{d.name}</span>
                      <span className="tabular-nums text-foreground">
                        {d.holidays} day{d.holidays === 1 ? "" : "s"}{" "}
                        <span className="text-faint-fg">
                          (−{fmt(d.holidayHrs)} hrs)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-faint-fg">
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
                <p className="font-medium text-foreground mb-1.5">
                  Net DEV hours per developer
                </p>
                <ul className="space-y-1 text-muted-fg">
                  {plan.devCaps.map((d) => (
                    <li key={d.name} className="flex justify-between gap-4">
                      <span className="text-foreground">{d.name}</span>
                      <span className="text-foreground tabular-nums">
                        {fmt(d.netDevHrs)} hrs
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-4 border-t border-line pt-1 mt-1 text-foreground">
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
          <h3 className="text-[13px] font-medium text-foreground">
            Compare velocity bases
          </h3>
          <p className="text-[11px] text-faint-fg">
            Click a row to change the basis
          </p>
        </div>
        <p className="text-[11px] text-faint-fg mb-3">
          Same {fmt(plan.netDevHrs)} net DEV hours, different historical
          windows. The <span className="text-ok">active</span> row
          drives the verdict above.
        </p>
        <div className="rounded-2xl border border-line bg-card divide-y divide-[color:var(--line)] overflow-hidden">
          {/* In-flight current sprint — context only, not a selectable basis. */}
          {currentVelocity && (
            <div className="flex items-baseline justify-between px-5 py-3 bg-warn/[0.04]">
              <div>
                <p className="text-[13px] flex items-center gap-2 text-foreground">
                  {currentVelocity.sprintName} so far
                  <span className="text-[10px] font-medium uppercase tracking-wide text-warn">
                    in progress
                  </span>
                </p>
                <p className="text-[11px] text-faint-fg">
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
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {fmt(plan.netDevHrs * currentVelocity.velocity * effectiveMultiplier)}{" "}
                <span className="text-sm font-normal text-faint-fg">SP</span>
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
                    ? "bg-[color:var(--muted)]"
                    : hasData
                      ? "hover:bg-[color:var(--muted)] cursor-pointer"
                      : "cursor-default opacity-60"
                }`}
                disabled={!hasData}
              >
                <div>
                  <p
                    className={`text-[13px] flex items-center gap-2 ${
                      active ? "text-foreground font-medium" : "text-foreground"
                    }`}
                  >
                    {p.label}
                    {active && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-ok">
                        active
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-faint-fg">{hint}</p>
                </div>
                <p className="text-xl font-semibold tabular-nums text-foreground">
                  {p.projected != null ? (
                    <>
                      {fmt(p.projected)}{" "}
                      <span className="text-sm font-normal text-faint-fg">SP</span>
                    </>
                  ) : (
                    <span className="text-faint-fg">—</span>
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
      <p className="text-[13px] text-muted-fg">{label}</p>
      <div className="text-right">
        <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="text-[11px] text-faint-fg">{hint}</p>}
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
        explain ? "hover:bg-[color:var(--muted)]" : ""
      }`}
      onMouseEnter={() => explain && setShowExplain(true)}
      onMouseLeave={() => setShowExplain(false)}
    >
      <div>
        <p
          className={`text-[13px] flex items-center gap-1.5 ${
            emphasis ? "font-medium text-foreground" : "text-foreground"
          }`}
        >
          {label}
          {explain && <Info className="size-3 text-faint-fg" />}
        </p>
        {hint && <p className="text-[11px] text-faint-fg mt-0.5">{hint}</p>}
      </div>
      <p
        className={`tabular-nums ${
          emphasis
            ? "text-xl font-semibold text-foreground"
            : "text-[15px] text-foreground"
        }`}
      >
        {value}
      </p>

      {explain && showExplain && (
        <span
          role="tooltip"
          className="absolute z-50 right-4 top-full mt-1 w-80 rounded-lg border border-line bg-card backdrop-blur p-3 text-[12px] text-foreground shadow-2xl pointer-events-none"
        >
          {explain}
        </span>
      )}
    </div>
  );
}

/**
 * Sprint-scoped CSV reconciliation button.
 *
 * Two-step UX so the user can audit deltas before any DB write:
 *  1. Pick a CSV → POST /api/backlog/reconcile (read-only diff).
 *  2. A modal shows matched / added / removed / changed counts plus the
 *     full diff. Confirming calls the existing /api/backlog/import with
 *     sprintId, which atomically replaces this sprint's stories.
 */
function ReconcileSprintButton({
  sprintId,
  sprintName,
}: {
  sprintId: string;
  sprintName: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReconcileResponse | null>(null);

  const reset = () => {
    setReport(null);
    setError(null);
    setPickedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickedFile(file);
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sprintId", sprintId);
      const res = await fetch("/api/backlog/reconcile", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reconciliation failed");
        setReport(null);
      } else {
        setReport(data as ReconcileResponse);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!pickedFile) return;
    setApplying(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", pickedFile);
      fd.append("sprintId", sprintId);
      const res = await fetch("/api/backlog/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
      } else {
        reset();
        router.refresh();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setApplying(false);
    }
  };

  const open = report !== null || error !== null || loading;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-md border border-line bg-[color:var(--muted)] px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-[color:var(--muted)] hover:text-foreground transition-colors"
      >
        <Upload className="size-3" />
        Re-import scope CSV
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Reconcile {sprintName} against {pickedFile?.name ?? "CSV"}
            </DialogTitle>
            <DialogDescription>
              Read-only diff between the CSV scope and what&apos;s currently stored.
              Nothing has been written yet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-fg py-8 justify-center">
                <Loader2 className="size-4 animate-spin" />
                Parsing & comparing…
              </div>
            )}

            {error && (
              <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {error}
              </div>
            )}

            {report && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                  <SummaryTile label="Matched" value={report.totals.matched} tone="muted" />
                  <SummaryTile label="Added" value={report.totals.added} tone={report.totals.added > 0 ? "emerald" : "muted"} />
                  <SummaryTile label="Removed" value={report.totals.removed} tone={report.totals.removed > 0 ? "red" : "muted"} />
                  <SummaryTile label="Changed" value={report.totals.changed} tone={report.totals.changed > 0 ? "amber" : "muted"} />
                </div>

                <p className="text-[11px] text-faint-fg">
                  CSV: {report.totals.csvRows} rows · {report.totals.inScope} match{" "}
                  {sprintName} · {report.totals.ignoredRows} ignored (other sprints) ·
                  DB has {report.totals.existing} stor
                  {report.totals.existing === 1 ? "y" : "ies"} for this sprint.
                </p>

                {report.added.length > 0 && (
                  <DiffSection title="Added" tone="emerald">
                    <ul className="divide-y divide-[color:var(--line)]">
                      {report.added.map((s) => (
                        <li key={s.key} className="py-1.5 flex items-baseline justify-between gap-3 text-[12px]">
                          <span className="font-mono text-muted-fg w-20 shrink-0">{s.key}</span>
                          <span className="flex-1 truncate text-foreground">{s.summary}</span>
                          <span className="text-ok tabular-nums">
                            {s.storyPoints ?? "—"} SP
                          </span>
                        </li>
                      ))}
                    </ul>
                  </DiffSection>
                )}

                {report.removed.length > 0 && (
                  <DiffSection title="Removed" tone="red">
                    <ul className="divide-y divide-[color:var(--line)]">
                      {report.removed.map((s) => (
                        <li key={s.key} className="py-1.5 flex items-baseline justify-between gap-3 text-[12px]">
                          <span className="font-mono text-muted-fg w-20 shrink-0">{s.key}</span>
                          <span className="flex-1 truncate text-foreground">{s.summary}</span>
                          <span className="text-danger tabular-nums">
                            {s.storyPoints ?? "—"} SP
                          </span>
                        </li>
                      ))}
                    </ul>
                  </DiffSection>
                )}

                {report.changed.length > 0 && (
                  <DiffSection title="Changed" tone="amber">
                    <ul className="space-y-2">
                      {report.changed.map((s) => (
                        <li key={s.key} className="text-[12px]">
                          <div className="flex items-baseline gap-3">
                            <span className="font-mono text-muted-fg w-20 shrink-0">{s.key}</span>
                            <span className="flex-1 truncate text-foreground">{s.summary}</span>
                          </div>
                          <ul className="mt-1 ml-23 pl-23 space-y-0.5 text-[11px] text-muted-fg">
                            {s.diffs.map((d, i) => (
                              <li key={i} className="ml-23">
                                <span className="text-faint-fg">{d.field}:</span>{" "}
                                <span className="line-through text-danger/80">
                                  {String(d.before ?? "—")}
                                </span>{" "}
                                <span className="text-faint-fg">→</span>{" "}
                                <span className="text-ok">
                                  {String(d.after ?? "—")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </DiffSection>
                )}

                {report.totals.added === 0 &&
                  report.totals.removed === 0 &&
                  report.totals.changed === 0 && (
                    <div className="rounded-md border border-ok/20 bg-ok/5 p-3 text-sm text-ok flex items-center gap-2">
                      <Check className="size-4" />
                      Perfect match — nothing to apply.
                    </div>
                  )}
              </>
            )}
          </div>

          <DialogFooter className="border-t border-line pt-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-line bg-[color:var(--muted)] px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-[color:var(--muted)]"
            >
              Cancel
            </button>
            {report && (
              <button
                type="button"
                onClick={apply}
                disabled={
                  applying ||
                  (report.totals.added === 0 &&
                    report.totals.removed === 0 &&
                    report.totals.changed === 0)
                }
                className="rounded-md bg-ok/90 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-ok disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {applying && <Loader2 className="size-3 animate-spin" />}
                Apply changes
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "emerald" | "red" | "amber";
}) {
  const colorByTone: Record<typeof tone, string> = {
    muted: "text-foreground",
    emerald: "text-ok",
    red: "text-danger",
    amber: "text-warn",
  };
  return (
    <div className="rounded-md border border-line bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-faint-fg">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${colorByTone[tone]}`}>{value}</p>
    </div>
  );
}

function DiffSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "emerald" | "red" | "amber";
  children: React.ReactNode;
}) {
  const dotByTone: Record<typeof tone, string> = {
    emerald: "bg-ok",
    red: "bg-danger",
    amber: "bg-warn",
  };
  return (
    <details open className="rounded-md border border-line bg-background px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-medium text-foreground flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${dotByTone[tone]}`} />
        {title}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
