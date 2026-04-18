import { SprintsView } from "@/components/sprints/sprints-view";
import { AddSprintDialog } from "@/components/sprints/add-sprint-dialog";
import { getAllSprints } from "@/lib/data";

export default async function SprintsPage() {
  const sprints = await getAllSprints();
  const current = sprints.find((s) => s.isCurrent);
  const nonDemo = sprints.filter((s) => !s.isDemo).length;
  const demo = sprints.filter((s) => s.isDemo).length;

  const subtitle =
    sprints.length === 0
      ? "No sprints yet — define the calendar or run npm run seed:york."
      : `${nonDemo} delivery sprints${demo > 0 ? ` + ${demo} demo` : ""}${current ? ` · ${current.name} in progress` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Sprint Plan
          </h2>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>
        <AddSprintDialog />
      </div>

      <SprintsView />
    </div>
  );
}
