import {
  getStoriesBySprint,
  getAllSprints,
} from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { CapacityView } from "@/components/capacity/capacity-view";
import { FocusFactorInput } from "@/components/sprints/focus-factor-input";
import type { SprintStory } from "@/types";

export default async function CapacityPage() {
  const sprints = await getAllSprints();
  const focus = sprints[0]?.focusFactor ?? 0.9;

  // Fetch stories for every sprint (not just the active window) so the capacity
  // view can pull the previous sprint's QA scope and the next sprint's
  // refining scope when computing the 3-cycle capacity of the selected sprint.
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
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Capacity Planning
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Capacity vs. scope analysis for the selected sprint.
          </p>
        </div>
        <FocusFactorInput initial={focus} />
      </div>

      <CapacityView storiesBySprint={storiesBySprint} />
    </div>
  );
}
