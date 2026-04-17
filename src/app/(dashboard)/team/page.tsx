import { getInitialCapacities } from "@/lib/data";
import { AllocationsView } from "@/components/allocations/allocations-view";

export default async function TeamPage() {
  const capacities = await getInitialCapacities();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Team
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Team members and how each one&apos;s time is split across project activities.
          Filter by organization (Deloitte / York) to see one side at a time.
        </p>
      </div>

      <AllocationsView capacities={capacities} />
    </div>
  );
}
