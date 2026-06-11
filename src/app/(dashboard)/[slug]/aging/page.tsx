import { AgingView } from "@/components/flow/aging-view";

export default function AgingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Aging</h2>
        <p className="mt-1 text-sm text-slate-400">
          How long each story has sat in its current status — the board&apos;s aging dots as
          exact numbers, with blocked flags and blockers. Nothing leaves your machine.
        </p>
      </div>

      <AgingView />
    </div>
  );
}
