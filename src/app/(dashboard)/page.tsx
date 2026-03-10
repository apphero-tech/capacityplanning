import {
  getStoriesBySprint,
  getAllSprints,
  getBacklogFreshness,
} from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { BacklogReminder } from "@/components/dashboard/backlog-reminder";
import type { SprintStory } from "@/types";

export default async function DashboardPage() {
  const sprints = await getAllSprints();
  const activeSprints = sprints.filter((s) => s.isActive);

  // Only page-specific fetch: stories per active sprint + freshness
  const [allSprintStories, freshness] = await Promise.all([
    Promise.all(
      activeSprints.map(async (sprint) => {
        const stories = await getStoriesBySprint(sprint.id);
        return stories.map(
          (s): SprintStory => ({
            ...s,
            isExcluded: isExcludedStory(s.status),
          })
        );
      }),
    ),
    Promise.resolve(getBacklogFreshness()),
  ]);

  // Build map: sprintId -> stories[]
  const storiesBySprint: Record<string, SprintStory[]> = {};
  for (let i = 0; i < activeSprints.length; i++) {
    storiesBySprint[activeSprints[i].id] = allSprintStories[i];
  }

  return (
    <div className="flex flex-col gap-6">
      <BacklogReminder freshness={freshness} />
      <DashboardView storiesBySprint={storiesBySprint} />
    </div>
  );
}
