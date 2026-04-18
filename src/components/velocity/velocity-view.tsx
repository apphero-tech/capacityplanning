"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSprint } from "@/contexts/sprint-context";
import type { VelocitySource } from "@/lib/capacity-engine";
import { EditableCell } from "@/components/ui/editable-cell";
import { VelocityTrendChart } from "@/components/velocity/velocity-trend-chart";
import { StatStrip } from "@/components/ui/stat-strip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

const SOURCE_LABEL: Record<VelocitySource, { label: string; className: string }> = {
  calculated: { label: "actual",    className: "text-emerald-400" },
  "rolling-avg": { label: "avg-3",  className: "text-violet-400" },
  manual:     { label: "manual",    className: "text-amber-400" },
  inherited:  { label: "inherited", className: "text-slate-500" },
};

function confidenceColor(pct: number | null | undefined): string {
  if (pct == null) return "text-slate-600";
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 70) return "text-amber-400";
  return "text-red-400";
}

export function VelocityView() {
  const {
    allSprints: sprints,
    selectedSprint,
    selectedForecast,
    forecastMap,
  } = useSprint();
  const router = useRouter();

  const handleSaved = useCallback(() => {
    router.refresh();
  }, [router]);

  const rollingAvg = useMemo(() => {
    const withActual = sprints
      .map((s) => forecastMap.get(s.id))
      .filter((f): f is NonNullable<typeof f> => !!f && f.actualVelocity !== null);
    const last3 = withActual.slice(-3);
    if (last3.length === 0) return null;
    return (
      last3.reduce((sum, f) => sum + (f.actualVelocity ?? 0), 0) / last3.length
    );
  }, [sprints, forecastMap]);

  // Moving average of completed SP per sprint (in SP, not SP/hr). This is
  // what the user wants to reason about day-to-day: "we deliver ~499 SP
  // per sprint on average".
  const avgCompletedSP = useMemo(() => {
    const withDone = sprints
      .map((s) => forecastMap.get(s.id))
      .filter(
        (f): f is NonNullable<typeof f> =>
          !!f && f.completedSP !== null && (f.completedSP ?? 0) > 0,
      );
    if (withDone.length === 0) return null;
    const sum = withDone.reduce((s, f) => s + (f.completedSP ?? 0), 0);
    return sum / withDone.length;
  }, [sprints, forecastMap]);

  // Progress factor lives on the first sprint (pattern shared with focus
  // factor — same value replicated across every row).
  const progressFactor = sprints[0]?.progressFactor ?? 0;
  const targetSP =
    avgCompletedSP != null ? avgCompletedSP * (1 + progressFactor) : null;

  const velocityTrendData = useMemo(() => {
    return sprints
      .map((s) => {
        const f = forecastMap.get(s.id);
        return {
          sprintName: s.name,
          actualVelocity: f?.actualVelocity ?? null,
          velocityProven: f?.velocityProven ?? 0,
        };
      })
      .filter((d) => d.actualVelocity !== null || d.velocityProven > 0);
  }, [sprints, forecastMap]);

  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        stats={[
          {
            label: "Average delivery",
            value: avgCompletedSP != null ? `${fmt(avgCompletedSP, 0)} SP` : "—",
            hint: "per sprint",
            muted: avgCompletedSP == null,
          },
          {
            label: "Progress factor",
            value: `${progressFactor >= 0 ? "+" : ""}${fmt(progressFactor * 100, 0)}%`,
            hint: "applied to next sprints",
          },
          {
            label: "Target next sprint",
            value: targetSP != null ? `${fmt(targetSP, 0)} SP` : "—",
            hint: "= avg × (1 + progress)",
            muted: targetSP == null,
          },
          {
            label: "Confidence",
            value:
              selectedForecast?.confidencePercent != null
                ? `${fmt(selectedForecast.confidencePercent, 0)}%`
                : "—",
            hint: "done / committed",
            muted: selectedForecast?.confidencePercent == null,
          },
        ]}
      />

      {/* Trend chart — only render when we have data */}
      {velocityTrendData.length > 0 && (
        <section>
          <h3 className="text-[13px] font-medium text-slate-300 mb-3">Velocity trend</h3>
          <VelocityTrendChart data={velocityTrendData} />
        </section>
      )}

      {/* Data entry table */}
      <section>
        <div className="mb-3">
          <h3 className="text-[13px] font-medium text-slate-300">Sprint history</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Click any Commit or Done value to edit. Velocity = Done ÷ DEV hrs.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.04] hover:bg-transparent">
              <TableHead className="text-[11px] font-medium text-slate-500">Sprint</TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-24">
                DEV hrs
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-24">
                Committed
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-24">
                Delivered
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-20">
                Conf
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-24">
                Velocity
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-24">
                Target
              </TableHead>
              <TableHead className="text-[11px] font-medium text-slate-500 text-right w-20">
                Source
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sprints.length === 0 ? (
              <TableRow className="border-white/[0.04]">
                <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                  No sprints yet — define them in the Sprint Plan page.
                </TableCell>
              </TableRow>
            ) : (
              sprints.map((s) => {
                const forecast = forecastMap.get(s.id);
                const canEditCommit = s.status !== "future";
                const canEditDone =
                  s.status === "current" ||
                  s.status === "previous" ||
                  s.status === "past";
                const srcInfo = forecast ? SOURCE_LABEL[forecast.velocitySource] : null;
                const isCurrent = selectedSprint?.id === s.id;

                return (
                  <TableRow
                    key={s.id}
                    className={`border-white/[0.04] hover:bg-white/[0.02] ${
                      isCurrent ? "bg-white/[0.02]" : ""
                    }`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {s.isCurrent && (
                          <span className="size-1.5 rounded-full bg-[#E31837]" />
                        )}
                        <span className="text-slate-100">{s.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-400">
                      {forecast ? fmt(forecast.netDevHrs) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableCell
                        value={forecast?.commitmentSP ?? s.commitmentSP}
                        sprintId={s.id}
                        field="commitmentSP"
                        canEdit={canEditCommit}
                        onSaved={handleSaved}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableCell
                        value={forecast?.completedSP ?? s.completedSP}
                        sprintId={s.id}
                        field="completedSP"
                        canEdit={canEditDone}
                        onSaved={handleSaved}
                      />
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${confidenceColor(
                        forecast?.confidencePercent,
                      )}`}
                    >
                      {forecast?.confidencePercent != null
                        ? `${fmt(forecast.confidencePercent, 0)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-200">
                      {forecast && forecast.velocityProven > 0
                        ? fmt(forecast.velocityProven, 2)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {targetSP != null &&
                      (s.status === "current" ||
                        s.status === "next" ||
                        s.status === "planning" ||
                        s.status === "future") ? (
                        <span className="text-slate-200 font-medium">
                          {fmt(targetSP, 0)}{" "}
                          <span className="text-slate-500 font-normal">SP</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {srcInfo && forecast && forecast.velocityProven > 0 ? (
                        <span className={`text-[11px] ${srcInfo.className}`}>
                          {srcInfo.label}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
