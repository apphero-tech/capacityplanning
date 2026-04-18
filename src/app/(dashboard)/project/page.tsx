import { getAllSprints, getStoriesBySprint } from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { ProjectView } from "@/components/project/project-view";
import type { SprintStory } from "@/types";

export default async function ProjectPage() {
  const sprints = await getAllSprints();
  const allStories = await Promise.all(
    sprints.map(async (s) => {
      const rows = await getStoriesBySprint(s.id);
      return rows.map(
        (r): SprintStory => ({
          ...r,
          isExcluded: isExcludedStory(r.status),
        }),
      );
    }),
  );
  const storiesBySprint: Record<string, SprintStory[]> = {};
  for (let i = 0; i < sprints.length; i++) {
    storiesBySprint[sprints[i].id] = allStories[i];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Project
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          End-to-end progress across the whole engagement.
        </p>
      </div>

      <ProjectView storiesBySprint={storiesBySprint} />
    </div>
  );
}
