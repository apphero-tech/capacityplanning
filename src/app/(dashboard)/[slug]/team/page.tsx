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
    <div className="flex flex-col gap-12" data-stagger>
      <header className="pb-8 border-b hairline-strong">
        <p className="eyebrow">Volume IV</p>
        <h2 className="font-display text-[clamp(40px,5vw,64px)] leading-[0.95] font-light tracking-[-0.02em] mt-3 text-[color:var(--ink)]">
          The <span className="italic">Team</span>
        </h2>
        <p className="mt-4 text-[14px] text-[color:var(--muted-fg)] max-w-xl">{subtitle}.</p>
      </header>

      <AllocationsView capacities={capacities} />
    </div>
  );
}
