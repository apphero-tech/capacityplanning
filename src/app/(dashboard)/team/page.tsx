import { getInitialCapacities } from "@/lib/data";
import { AllocationsView } from "@/components/allocations/allocations-view";

export default async function TeamPage() {
  const capacities = await getInitialCapacities();

  const active = capacities.filter((c) => c.isActive).length;
  const inactive = capacities.length - active;
  const orgs = new Set(capacities.map((c) => c.organization).filter(Boolean));

  const subtitle =
    capacities.length === 0
      ? "No team members yet — drop your Team allocation xlsx via Import."
      : `${active} active member${active !== 1 ? "s" : ""}${inactive > 0 ? ` · ${inactive} inactive` : ""}${orgs.size > 0 ? ` · ${orgs.size} organization${orgs.size !== 1 ? "s" : ""}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Team
        </h2>
        <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
      </div>

      <AllocationsView capacities={capacities} />
    </div>
  );
}
