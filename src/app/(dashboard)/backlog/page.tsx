import { getStoriesBySprint, getAllSprints } from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { BacklogTable } from "@/components/backlog/backlog-table";
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Backlog
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Sprint backlog imported from Jira. Upload an Excel export per sprint.
        </p>
      </div>

      <BacklogTable storiesBySprint={storiesBySprint} />
    </div>
  );
}
