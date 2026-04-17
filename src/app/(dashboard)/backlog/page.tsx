import { getStoriesBySprint, getAllSprints } from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { BacklogTable } from "@/components/backlog/backlog-table";
import { BacklogAutoImportButton } from "@/components/backlog/auto-import-button";
import type { SprintStory } from "@/types";

export default async function BacklogPage() {
  const sprints = await getAllSprints();
  const activeSprints = sprints.filter((s) => s.isActive);

  // Fetch stories for all active sprints in parallel
  const allSprintStories = await Promise.all(
    activeSprints.map(async (sprint) => {
      const stories = await getStoriesBySprint(sprint.id);
      return stories.map(
        (s): SprintStory => ({
          ...s,
          isExcluded: isExcludedStory(s.status),
        })
      );
    })
  );

  // Build map: sprintId -> stories[]
  const storiesBySprint: Record<string, SprintStory[]> = {};
  for (let i = 0; i < activeSprints.length; i++) {
    storiesBySprint[activeSprints[i].id] = allSprintStories[i];
  }

  const totalStories = Object.values(storiesBySprint).reduce((s, list) => s + list.length, 0);
  const subtitle =
    totalStories === 0
      ? "No stories yet — import the Jira CSV export to populate every sprint at once."
      : `${totalStories} stories across ${activeSprints.length} active sprint${activeSprints.length !== 1 ? "s" : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Backlog
          </h2>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>
        <BacklogAutoImportButton />
      </div>

      <BacklogTable storiesBySprint={storiesBySprint} />
    </div>
  );
}
