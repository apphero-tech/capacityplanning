import { TransitionsView } from "@/components/flow/transitions-view";
import { PageHeader } from "@/components/layout/page-header";

export default function TransitionsPage() {
  return (
    <div className="flex flex-col gap-6" data-stagger>
      <PageHeader
        title="Transitions"
        subtitle="Live stream-transition metrics from the AI project — how many stories cleared each gate over the last 7 days. Nothing leaves your machine."
      />
      <TransitionsView />
    </div>
  );
}
