import { SprintsView } from "@/components/sprints/sprints-view";

export default function SprintsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Sprints
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Overview of all sprints with projected delivery capacity.
        </p>
      </div>

      <SprintsView />
    </div>
  );
}
