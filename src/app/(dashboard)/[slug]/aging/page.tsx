import { AgingView } from "@/components/flow/aging-view";
import { PageHeader } from "@/components/layout/page-header";

export default function AgingPage() {
  return (
    <div className="flex flex-col gap-6" data-stagger>
      <PageHeader
        title="Aging"
        subtitle="How long each story has sat in its current status — the board's aging dots as exact numbers, with blocked flags and blockers. Nothing leaves your machine."
      />
      <AgingView />
    </div>
  );
}
