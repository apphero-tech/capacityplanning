import { VelocityView } from "@/components/velocity/velocity-view";

export default function VelocityPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Velocity
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Velocity trends, commitment tracking, and confidence analysis.
        </p>
      </div>

      <VelocityView />
    </div>
  );
}
