import { getInitialCapacities } from "@/lib/data";
import { AllocationsView } from "@/components/allocations/allocations-view";

export default async function AllocationsPage() {
  const capacities = await getInitialCapacities();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Allocations
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Initial capacity allocation matrix showing how each team member&apos;s
          time is distributed across activities.
        </p>
      </div>

      <AllocationsView capacities={capacities} />
    </div>
  );
}
