import { VelocityView } from "@/components/velocity/velocity-view";
import { ProgressFactorInput } from "@/components/velocity/progress-factor-input";
import { getAllSprints } from "@/lib/data";

export default async function VelocityPage() {
  const sprints = await getAllSprints();
  const progressFactor = sprints[0]?.progressFactor ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Velocity
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Historical delivery average + growth factor for next-sprint targets.
          </p>
        </div>
        <ProgressFactorInput initial={progressFactor} />
      </div>

      <VelocityView />
    </div>
  );
}
