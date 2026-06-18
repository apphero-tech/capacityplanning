import {
  getStoriesBySprint,
  getAllSprints,
} from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { CapacityView } from "@/components/capacity/capacity-view";
import { PageHeader } from "@/components/layout/page-header";
import type { SprintStory } from "@/types";

export default async function CapacityPage() {
  const sprints = await getAllSprints();

  // Only the selected sprint's stories are needed now — no more adjacent-
  // sprint lookups since the Plan page only answers "can we deliver THIS
  // sprint's scope with THIS sprint's hours".
  const allSprintStories = await Promise.all(
    sprints.map(async (sprint) => {
      const stories = await getStoriesBySprint(sprint.id);
      return stories.map(
        (s): SprintStory => ({
          ...s,
          isExcluded: isExcludedStory(s.status),
        })
      );
    }),
  );

  const storiesBySprint: Record<string, SprintStory[]> = {};
  for (let i = 0; i < sprints.length; i++) {
    storiesBySprint[sprints[i].id] = allSprintStories[i];
  }

  return (
    <div className="flex flex-col gap-8" data-stagger>
      <PageHeader
        title="Capacity Planning"
        subtitle="Can the team fit the selected sprint's scope into its hours? Adjust the velocity basis and scenario to see how the verdict moves."
      />
      <CapacityView storiesBySprint={storiesBySprint} />
    </div>
  );
}
