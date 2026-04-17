import Link from "next/link";
import { Check, Circle, ArrowRight } from "lucide-react";

type Step = {
  label: string;
  count: number;
  unit: string;
  href: string;
  done: boolean;
  hint: string;
};

/**
 * Four-step onboarding panel shown at the top of the Dashboard. Each step
 * corresponds to one data input the app needs to compute capacity. Done
 * steps show the count (e.g. "9 sprints defined"), missing steps link to
 * the relevant page. Rendering is server-side — parent fetches the counts.
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
    {
      label: "Sprints",
      count: sprintsCount,
      unit: "sprint",
      href: "/sprints",
      done: sprintsCount > 0,
      hint: "Define the sprint calendar",
    },
    {
      label: "Backlog",
      count: storiesCount,
      unit: "story",
      href: "/backlog",
      done: storiesCount > 0,
      hint: "Import stories from Jira",
    },
    {
      label: "Team",
      count: teamCount,
      unit: "member",
      href: "/team",
      done: teamCount > 0,
      hint: "Import the allocation file",
    },
    {
      label: "Time Off",
      count: timeOffCount,
      unit: "entry",
      href: "/time-off",
      done: timeOffCount > 0,
      hint: "Import the PTO CSV",
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Project setup
          </p>
          <p className="text-sm text-slate-300 mt-0.5">
            {completed === 4 ? (
              <span className="text-emerald-400">All inputs loaded — capacity ready.</span>
            ) : (
              <>
                <span className="text-slate-100 font-medium">{completed}/4</span>{" "}
                inputs loaded
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {steps.map((step) => (
          <Link
            key={step.label}
            href={step.href}
            className={`group flex items-center gap-3 rounded-lg border p-3 transition-colors ${
              step.done
                ? "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10"
                : "border-white/[0.06] bg-slate-800/40 hover:bg-slate-800/70"
            }`}
          >
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                step.done
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-700/50 text-slate-500"
              }`}
            >
              {step.done ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-100">{step.label}</p>
              <p className="text-xs text-slate-400 truncate">
                {step.done ? (
                  <>
                    {step.count} {step.unit}
                    {step.count !== 1 ? "s" : ""}
                  </>
                ) : (
                  step.hint
                )}
              </p>
            </div>
            {!step.done && (
              <ArrowRight className="size-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
