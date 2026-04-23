import { getAllSprints, getStoriesBySprint, getBacklogFreshness } from "@/lib/data";
import type { Sprint } from "@/types";

/**
 * Dashboard project-wide split. **Jira is the single source of truth.**
 *
 *  - Delivered SP for past sprints comes from `Sprint.completedSP` — the
 *    frozen-at-close figure that drives Jira's velocity report. A story
 *    delivered in Sprint 4 stays credited to Sprint 4, even if Jira's CSV
 *    later re-labels it to a newer sprint (carry-over field artefacts).
 *  - Current sprint uses the CSV's per-story status: stories past "Dev
 *    Ready to Deploy to QA" (order ≥ 40) count as already delivered, the
 *    rest are in flight.
 *  - Future / planning / unassigned sprints → remaining.
 *  - Descoped / split stories → excluded from scope, shown in red.
 */
export type ProjectBucket = "delivered" | "inProgress" | "remaining" | "excluded";

export interface ProjectBreakdown {
  stories: number;
  sp: number;
}

export interface SprintBreakdown {
  sprintId: string;
  sprintName: string;
  sprintStatus: string;
  totalStories: number;
  totalSP: number;
  delivered: ProjectBreakdown;
  inProgress: ProjectBreakdown;
  remaining: ProjectBreakdown;
  excluded: ProjectBreakdown;
  lastImportedAt: string | null;
}

export interface ProjectOverview {
  totalStories: number;
  totalSP: number;
  /** Total delivered = deliveredPast + deliveredCurrent (kept for back-compat). */
  delivered: ProjectBreakdown;
  /** Delivered in past sprints — authoritative Sprint.completedSP from Jira. */
  deliveredPast: ProjectBreakdown;
  /** Already delivered inside the current sprint (status order ≥ 40). */
  deliveredCurrent: ProjectBreakdown;
  inProgress: ProjectBreakdown;
  remaining: ProjectBreakdown;
  excluded: ProjectBreakdown;
  lastImportedAt: string | null;
  bySprint: SprintBreakdown[];
}

const EXCLUDED_HINTS = ["descoped", "split", "x-out"];

/**
 * Status-order threshold above which a story is counted as "delivered" for
 * the DEV team's purposes — matches "Dev Ready to Deploy to QA" and beyond
 * (QA-ready, demo-ready, merged, deployed). Anything below is still in the
 * DEV cycle.
 */
const DELIVERED_STATUS_ORDER = 40;

function isExcluded(status: string): boolean {
  const lower = status.toLowerCase();
  return EXCLUDED_HINTS.some((h) => lower.includes(h));
}

function statusOrder(status: string): number {
  const m = status.match(/^(\d{2})-/);
  return m ? Number(m[1]) : 99;
}

/**
 * Which bucket a story lands in given its sprint membership and status.
 * Status-level exclusions (Descoped / Split) always win. Current-sprint
 * stories further split by workflow: stories past `DELIVERED_STATUS_ORDER`
 * count as already delivered, the rest are in flight.
 */
export function categoriseStory(
  status: string,
  sprint: Pick<Sprint, "isCurrent" | "status">,
): ProjectBucket {
  if (isExcluded(status)) return "excluded";

  const order = statusOrder(status);

  if (sprint.isCurrent) {
    return order >= DELIVERED_STATUS_ORDER ? "delivered" : "inProgress";
  }

  if (sprint.status === "past" || sprint.status === "previous") {
    return "delivered";
  }
  return "remaining";
}

function emptyBreakdown(): ProjectBreakdown {
  return { stories: 0, sp: 0 };
}

export async function getProjectOverview(): Promise<ProjectOverview> {
  const sprints = await getAllSprints();
  const freshness = getBacklogFreshness();

  const totals = {
    totalStories: 0,
    totalSP: 0,
    deliveredPast: emptyBreakdown(),
    deliveredCurrent: emptyBreakdown(),
    inProgress: emptyBreakdown(),
    remaining: emptyBreakdown(),
    excluded: emptyBreakdown(),
    lastImportedAt: null as string | null,
  };

  const bySprint: SprintBreakdown[] = [];

  for (const sprint of sprints) {
    const stories = await getStoriesBySprint(sprint.id);
    const bucketStats = {
      deliveredPast: emptyBreakdown(),
      deliveredCurrent: emptyBreakdown(),
      inProgress: emptyBreakdown(),
      remaining: emptyBreakdown(),
      excluded: emptyBreakdown(),
    };
    let sprintTotalStories = 0;
    let sprintTotalSP = 0;
    const sprintLastImport: string | null = freshness[sprint.id]?.lastImportedAt ?? null;

    const isPastSprint =
      !sprint.isCurrent &&
      (sprint.status === "past" || sprint.status === "previous");

    for (const s of stories) {
      const sp = s.storyPoints ?? 0;

      if (isExcluded(s.status)) {
        bucketStats.excluded.stories += 1;
        bucketStats.excluded.sp += sp;
        continue;
      }

      sprintTotalStories += 1;
      sprintTotalSP += sp;

      const order = statusOrder(s.status);

      if (order >= DELIVERED_STATUS_ORDER) {
        // "Actually delivered" — story is past DEV hand-off. We split by
        // sprint-period: past sprints feed `deliveredPast` (SP comes from
        // Sprint.completedSP below; stories counted here), current sprint
        // feeds `deliveredCurrent` (SP + stories from CSV).
        if (sprint.isCurrent) {
          bucketStats.deliveredCurrent.stories += 1;
          bucketStats.deliveredCurrent.sp += sp;
        } else {
          bucketStats.deliveredPast.stories += 1;
        }
      } else if (sprint.isCurrent) {
        bucketStats.inProgress.stories += 1;
        bucketStats.inProgress.sp += sp;
      } else if (isPastSprint) {
        // Anomaly: a story sitting in a past sprint but still un-done.
        // Honest accounting: treat as remaining work (it still needs to
        // be delivered) rather than pretending it was delivered.
        bucketStats.remaining.stories += 1;
        bucketStats.remaining.sp += sp;
      } else {
        // Future / next / planning / unassigned backlog
        bucketStats.remaining.stories += 1;
        bucketStats.remaining.sp += sp;
      }
    }

    // For past sprints, trust Jira's frozen completedSP as the authoritative
    // delivered-SP figure — this matches the velocity report exactly.
    if (isPastSprint && sprint.completedSP != null && sprint.completedSP > 0) {
      bucketStats.deliveredPast.sp += sprint.completedSP;
    }

    const roundSP = (b: ProjectBreakdown): ProjectBreakdown => ({
      stories: b.stories,
      sp: Math.round(b.sp),
    });

    const combinedDelivered: ProjectBreakdown = {
      stories: bucketStats.deliveredPast.stories + bucketStats.deliveredCurrent.stories,
      sp: bucketStats.deliveredPast.sp + bucketStats.deliveredCurrent.sp,
    };

    bySprint.push({
      sprintId: sprint.id,
      sprintName: sprint.name,
      sprintStatus: sprint.status,
      totalStories: sprintTotalStories,
      totalSP: Math.round(sprintTotalSP),
      delivered: roundSP(combinedDelivered),
      inProgress: roundSP(bucketStats.inProgress),
      remaining: roundSP(bucketStats.remaining),
      excluded: roundSP(bucketStats.excluded),
      lastImportedAt: sprintLastImport,
    });

    totals.totalStories += sprintTotalStories;
    totals.totalSP += sprintTotalSP;
    totals.deliveredPast.stories += bucketStats.deliveredPast.stories;
    totals.deliveredPast.sp += bucketStats.deliveredPast.sp;
    totals.deliveredCurrent.stories += bucketStats.deliveredCurrent.stories;
    totals.deliveredCurrent.sp += bucketStats.deliveredCurrent.sp;
    totals.inProgress.stories += bucketStats.inProgress.stories;
    totals.inProgress.sp += bucketStats.inProgress.sp;
    totals.remaining.stories += bucketStats.remaining.stories;
    totals.remaining.sp += bucketStats.remaining.sp;
    totals.excluded.stories += bucketStats.excluded.stories;
    totals.excluded.sp += bucketStats.excluded.sp;

    if (sprintLastImport && (!totals.lastImportedAt || sprintLastImport > totals.lastImportedAt)) {
      totals.lastImportedAt = sprintLastImport;
    }
  }

  const roundBreakdown = (b: ProjectBreakdown): ProjectBreakdown => ({
    stories: b.stories,
    sp: Math.round(b.sp),
  });

  return {
    totalStories: totals.totalStories,
    totalSP: Math.round(totals.totalSP),
    delivered: roundBreakdown({
      stories: totals.deliveredPast.stories + totals.deliveredCurrent.stories,
      sp: totals.deliveredPast.sp + totals.deliveredCurrent.sp,
    }),
    deliveredPast: roundBreakdown(totals.deliveredPast),
    deliveredCurrent: roundBreakdown(totals.deliveredCurrent),
    inProgress: roundBreakdown(totals.inProgress),
    remaining: roundBreakdown(totals.remaining),
    excluded: roundBreakdown(totals.excluded),
    lastImportedAt: totals.lastImportedAt,
    bySprint,
  };
}
