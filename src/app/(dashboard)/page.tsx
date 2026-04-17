import {
  getStoriesBySprint,
  getAllSprints,
  getInitialCapacities,
  getPtoEntries,
} from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { OnboardingProgress } from "@/components/dashboard/onboarding-progress";
import type { SprintStory } from "@/types";

export default async function DashboardPage() {
  const [sprints, capacities, ptoEntries] = await Promise.all([
    getAllSprints(),
    getInitialCapacities(),
    getPtoEntries(),
  ]);

  const activeSprints = sprints.filter((s) => s.isActive);
  const currentSprint = sprints.find((s) => s.isCurrent) ?? null;

  // Stories for active sprints (already used by DashboardView charts below)
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

  // Total backlog stories across every sprint (not just active window)
  const allSprintIds = sprints.map((s) => s.id);
  const allStoryCounts = await Promise.all(
    allSprintIds.map((id) => getStoriesBySprint(id).then((rows) => rows.length)),
  );
  const totalStories = allStoryCounts.reduce((s, n) => s + n, 0);

  const subtitle = currentSprint
    ? `${currentSprint.name} in progress · ${sprints.length} sprints · ${capacities.filter((c) => c.isActive).length} active members`
    : `${sprints.length} sprints defined · ${capacities.filter((c) => c.isActive).length} active members`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Dashboard
        </h2>
        <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
      </div>

      <OnboardingProgress
        sprintsCount={sprints.length}
        storiesCount={totalStories}
        teamCount={capacities.length}
        timeOffCount={ptoEntries.length}
      />

      <DashboardView storiesBySprint={storiesBySprint} />
    </div>
  );
}
