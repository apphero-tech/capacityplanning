import { getStoriesBySprint, getAllSprints } from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { getProjectOverview } from "@/lib/project-overview";
import { DashboardEditorial } from "@/components/dashboard/dashboard-editorial";
import type { SprintStory } from "@/types";

export default async function DashboardPage() {
  const sprints = await getAllSprints();
  const activeSprints = sprints.filter((s) => s.isActive);

  const allSprintStories = await Promise.all(
    activeSprints.map(async (sprint) => {
      const stories = await getStoriesBySprint(sprint.id);
      return stories.map(
        (s): SprintStory => ({
          ...s,
          isExcluded: isExcludedStory(s.status),
        }),
      );
    }),
  );
  const storiesBySprint: Record<string, SprintStory[]> = {};
  for (let i = 0; i < activeSprints.length; i++) {
    storiesBySprint[activeSprints[i].id] = allSprintStories[i];
  }

  const overview = await getProjectOverview();

  return (
    <DashboardEditorial overview={overview} storiesBySprint={storiesBySprint} />
  );
}
