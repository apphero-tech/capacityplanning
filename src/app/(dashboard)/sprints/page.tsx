import { SprintsView } from "@/components/sprints/sprints-view";
import { AddSprintDialog } from "@/components/sprints/add-sprint-dialog";
import { FocusFactorInput } from "@/components/sprints/focus-factor-input";
import { getAllSprints } from "@/lib/data";

export default async function SprintsPage() {
  const sprints = await getAllSprints();
  const focus = sprints[0]?.focusFactor ?? 0.9;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Sprints
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Overview of all sprints with projected delivery capacity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FocusFactorInput initial={focus} />
          <AddSprintDialog />
        </div>
      </div>

      <SprintsView />
    </div>
  );
}
