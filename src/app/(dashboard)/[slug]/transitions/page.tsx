import { TransitionsView } from "@/components/flow/transitions-view";

export default function TransitionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Transitions</h2>
        <p className="mt-1 text-sm text-slate-400">
          Live stream-transition metrics from the AI project — how many stories cleared
          each gate over the last 7 days. Nothing leaves your machine.
        </p>
      </div>

      <TransitionsView />
    </div>
  );
}
