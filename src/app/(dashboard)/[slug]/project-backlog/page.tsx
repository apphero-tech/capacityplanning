import { getAllSprints, getStoriesBySprint } from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { getProjectOverview } from "@/lib/project-overview";
import { ProjectView } from "@/components/project/project-view";
import { BacklogTable } from "@/components/backlog/backlog-table";
import { BacklogAutoImportButton } from "@/components/backlog/auto-import-button";
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
    <div className="flex flex-col gap-16" data-stagger>
      <header className="flex items-end justify-between flex-wrap gap-6 pb-8 border-b hairline-strong">
        <div>
          <p className="eyebrow">Volume III</p>
          <h2 className="font-display text-[clamp(40px,5vw,64px)] leading-[0.95] font-light tracking-[-0.02em] mt-3 text-[color:var(--ink)]">
            The <span className="italic">Project</span> Backlog
          </h2>
          <p className="mt-4 text-[14px] text-[color:var(--muted-fg)] max-w-xl">
            End-to-end scope. Import the Jira backlog here to refresh every
            sprint in one motion — every other tab reads from this source.
          </p>
        </div>
        <BacklogAutoImportButton />
      </header>

      <ProjectView overview={overview} />

      <section>
        <p className="eyebrow">Detail · the selected sprint, story by story</p>
        <h3 className="font-display text-[28px] leading-tight font-light italic mt-2 tracking-tight text-[color:var(--ink)]">
          Composition.
        </h3>
        <div className="mt-8">
          <BacklogTable storiesBySprint={storiesBySprint} />
        </div>
      </section>
    </div>
  );
}
