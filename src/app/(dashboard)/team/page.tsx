import { getStoriesBySprint, getAllSprints } from "@/lib/data";
import { TeamPageClient } from "@/components/team/team-page-client";
import { isExcludedStory } from "@/lib/capacity-engine";
import type { SprintStory } from "@/types";

export default async function TeamPage() {
  const sprints = await getAllSprints();
  const activeSprints = sprints.filter((s) => s.isActive);

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

  const storiesBySprint: Record<string, SprintStory[]> = {};
  for (let i = 0; i < activeSprints.length; i++) {
    storiesBySprint[activeSprints[i].id] = allSprintStories[i];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Team</h2>
        <p className="text-sm text-slate-400 mt-1">
          Team capacity and dev projection for the selected sprint.
        </p>
      </div>

      <TeamPageClient storiesBySprint={storiesBySprint} />
    </div>
  );
}
