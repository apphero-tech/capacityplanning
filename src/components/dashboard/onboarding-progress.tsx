import Link from "next/link";
import { Check } from "lucide-react";

type Step = {
  label: string;
  count: number;
  unit: string;
  href: string;
  done: boolean;
  hint: string;
};

/**
 * Project-setup strip on the Dashboard. Four inputs (Sprints, Backlog, Team,
 * Time Off) shown as minimal rows — a tiny check or hollow dot, the label,
 * and a right-aligned count. Clicking a row jumps to the page. Visual weight
 * is intentionally low so it fades once all four are green.
 */
export function OnboardingProgress({
  sprintsCount,
  storiesCount,
  teamCount,
  timeOffCount,
}: {
  sprintsCount: number;
  storiesCount: number;
  teamCount: number;
  timeOffCount: number;
}) {
  const steps: Step[] = [
    { label: "Sprint Plan", count: sprintsCount, unit: "sprint", href: "/sprints",  done: sprintsCount > 0,  hint: "Define the calendar" },
    { label: "Backlog",  count: storiesCount, unit: "story",   href: "/backlog",  done: storiesCount > 0,  hint: "Import the Jira export" },
    { label: "Team",     count: teamCount,    unit: "member",  href: "/team",     done: teamCount > 0,     hint: "Import the allocation xlsx" },
    { label: "Time Off", count: timeOffCount, unit: "entry",   href: "/time-off", done: timeOffCount > 0,  hint: "Import the PTO CSV" },
  ];

  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-slate-900/40">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 className="text-[13px] font-medium text-slate-300">Project setup</h3>
        <span className="text-[12px] text-slate-500">
          {completed === 4 ? "Ready" : `${completed} of 4`}
        </span>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {steps.map((step) => (
          <Link
            key={step.label}
            href={step.href}
            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
          >
            <div
              className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                step.done
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "ring-1 ring-white/15"
              }`}
            >
              {step.done && <Check className="size-3" strokeWidth={3} />}
            </div>
            <p
              className={`flex-1 text-[13px] ${
                step.done ? "text-slate-200" : "text-slate-400"
              }`}
            >
              {step.label}
              {!step.done && (
                <span className="text-slate-600 ml-2 text-[12px]">
                  — {step.hint}
                </span>
              )}
            </p>
            <span
              className={`text-[12px] tabular-nums ${
                step.done ? "text-slate-400" : "text-slate-600"
              }`}
            >
              {step.done
                ? `${step.count.toLocaleString()} ${step.unit}${step.count !== 1 ? "s" : ""}`
                : "—"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
