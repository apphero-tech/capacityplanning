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
    <div className="flex flex-col gap-8" data-stagger>
      <header className="pb-4 border-b hairline">
        <p className="text-[13px] text-[color:var(--muted-fg)]">{subtitle}.</p>
      </header>

      <AllocationsView capacities={capacities} />
    </div>
  );
}
