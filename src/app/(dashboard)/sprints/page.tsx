import { SprintsView } from "@/components/sprints/sprints-view";
import { AddSprintDialog } from "@/components/sprints/add-sprint-dialog";
import { getAllSprints } from "@/lib/data";
import { getProjectOverview } from "@/lib/project-overview";

export default async function SprintsPage() {
  const [sprints, overview] = await Promise.all([
    getAllSprints(),
    getProjectOverview(),
  ]);
  const current = sprints.find((s) => s.isCurrent);
  const nonDemo = sprints.filter((s) => !s.isDemo).length;
  const demo = sprints.filter((s) => s.isDemo).length;

  // Scope = SP still to deliver in this sprint, defined exactly the same way
  // as the Dashboard's "In flight" / "Remaining" so the numbers match across
  // tabs. Past sprints contribute zero (work is done — Sprint Plan already
  // shows their delivered SP via `completedSP`).
  const scopeBySprint: Record<string, { stories: number; sp: number }> = {};
  for (const s of overview.bySprint) {
    scopeBySprint[s.sprintId] = {
      stories: s.inProgress.stories + s.remaining.stories,
      sp: s.inProgress.sp + s.remaining.sp,
    };
  }

  const subtitle =
    sprints.length === 0
      ? "No sprints yet."
      : `${nonDemo} delivery sprints${demo > 0 ? ` + ${demo} demo` : ""}${current ? ` · ${current.name} in flight` : ""}`;

  return (
    <div className="flex flex-col gap-12" data-stagger>
      <header className="flex items-end justify-between flex-wrap gap-6 pb-8 border-b hairline-strong">
        <div>
          <p className="eyebrow">Volume II</p>
          <h2 className="font-display text-[clamp(40px,5vw,64px)] leading-[0.95] font-light tracking-[-0.02em] mt-3 text-[color:var(--ink)]">
            The <span className="italic">Sprint</span> Plan
          </h2>
          <p className="mt-4 text-[14px] text-[color:var(--muted-fg)] max-w-xl">
            {subtitle}. Edit any name, range or focus inline.
          </p>
        </div>
        <AddSprintDialog />
      </header>

      <SprintsView scopeBySprint={scopeBySprint} />
    </div>
  );
}
