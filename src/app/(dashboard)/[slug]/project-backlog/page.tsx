import { getAllSprints, getStoriesBySprint } from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { getProjectOverview } from "@/lib/project-overview";
import { ProjectView } from "@/components/project/project-view";
import { BacklogTable } from "@/components/backlog/backlog-table";
import { BacklogAutoImportButton } from "@/components/backlog/auto-import-button";
import { PageHeader } from "@/components/layout/page-header";
import type { SprintStory } from "@/types";

/**
 * Project Backlog — single source of truth for the engagement scope.
 *
 * Combines the rolled-up project totals (delivered / in flight / remaining,
 * per-sprint ledger) with the per-sprint story table previously living in
 * /backlog. The Import button lives here only — Dashboard is read-only.
 */
export default async function ProjectBacklogPage() {
  const [overview, sprints] = await Promise.all([
    getProjectOverview(),
    getAllSprints(),
  ]);

  const activeSprints = sprints.filter((s) => s.isActive);
  const storiesPerActive = await Promise.all(
    activeSprints.map(async (sprint) => {
      const rows = await getStoriesBySprint(sprint.id);
      return rows.map(
        (s): SprintStory => ({
          ...s,
          isExcluded: isExcludedStory(s.status),
        }),
      );
    }),
  );
  const storiesBySprint: Record<string, SprintStory[]> = {};
  for (let i = 0; i < activeSprints.length; i++) {
    storiesBySprint[activeSprints[i].id] = storiesPerActive[i];
  }

  return (
    <div className="flex flex-col gap-10" data-stagger>
      <PageHeader
        title="Project Backlog"
        subtitle="End-to-end scope. Import the Jira backlog here to refresh every sprint in one motion — every other tab reads from this source."
        actions={<BacklogAutoImportButton />}
      />
      <ProjectView overview={overview} />

      <section>
        <div className="flex items-baseline gap-3 pb-3 border-b hairline">
          <p className="code-label">DETAIL</p>
          <h3 className="text-[15px] font-medium tracking-tight text-[color:var(--ink)]">
            Selected sprint, story by story
          </h3>
        </div>
        <div className="mt-6">
          <BacklogTable storiesBySprint={storiesBySprint} />
        </div>
      </section>
    </div>
  );
}
