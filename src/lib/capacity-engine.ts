import type { Sprint, TeamMember, InitialCapacity, DevCapacity, DevProjection, CapacityRow, Story, DashboardKPIs, PublicHoliday as PHoliday, ProjectHoliday as PJHoliday, PtoEntry } from "@/types";
import { EXCLUDED_STATUSES } from "./constants";
import { getHolidayDaysForMember } from "./holiday-engine";

export function calculateEffHrsPerWeek(hrsPerWeek: number, allocation: number): number {
  return hrsPerWeek * allocation;
}

export function calculateTotalHrs(effHrsPerWeek: number, sprintWeeks: number): number {
  return effHrsPerWeek * sprintWeeks;
}

export function calculateHolidayHrs(
  effHrsPerWeek: number,
  holidayDays: number
): number {
  const hrsPerDay = effHrsPerWeek / 5;
  return holidayDays * hrsPerDay;
}

export function calculateNetHrs(
  totalHrs: number,
  holidayHrs: number,
  focusFactor: number
): number {
  return (totalHrs - holidayHrs) * focusFactor;
}

export function computeTeamMemberCapacity(
  member: { lastName: string; firstName: string; role: string; location: string; stream: string; ftPt: string; hrsPerWeek: number; allocation: number; pod: string | null; id: string },
  sprint: Sprint,
  publicHolidays: PHoliday[],
  projectHolidays: PJHoliday[],
): TeamMember {
  const effHrsPerWeek = calculateEffHrsPerWeek(member.hrsPerWeek, member.allocation);
  const totalHrs = calculateTotalHrs(effHrsPerWeek, sprint.durationWeeks);
  const holidayDays = getHolidayDaysForMember(member.location, sprint, publicHolidays, projectHolidays);
  const holidayHrs = calculateHolidayHrs(effHrsPerWeek, holidayDays);
  const netHrs = calculateNetHrs(totalHrs, holidayHrs, sprint.focusFactor);

  return {
    ...member,
    effHrsPerWeek: Math.round(effHrsPerWeek * 100) / 100,
    totalHrs: Math.round(totalHrs * 100) / 100,
    holidayHrs: Math.round(holidayHrs * 100) / 100,
    netHrs: Math.round(netHrs * 100) / 100,
  } as TeamMember;
}

export function computeDevCapacity(
  devMembers: TeamMember[],
  sprint: Sprint,
  publicHolidays: PHoliday[],
  projectHolidays: PJHoliday[],
): DevCapacity[] {
  return devMembers
    .filter(m => m.stream === "DEV")
    .map(m => {
      const devPercent = m.allocation;
      const effHrsPerWeek = m.hrsPerWeek * devPercent;
      const grossHrs = effHrsPerWeek * sprint.durationWeeks;
      const holidayDays = getHolidayDaysForMember(m.location, sprint, publicHolidays, projectHolidays);
      const hrsPerDay = effHrsPerWeek / 5;
      const holidayHrs = holidayDays * hrsPerDay;
      const netDevHrs = (grossHrs - holidayHrs) * sprint.focusFactor;

      return {
        name: `${m.firstName} ${m.lastName}`,
        role: m.role,
        location: m.location,
        hrsPerWeek: m.hrsPerWeek,
        devPercent,
        effHrsPerWeek: Math.round(effHrsPerWeek * 100) / 100,
        weeks: sprint.durationWeeks,
        grossHrs: Math.round(grossHrs * 100) / 100,
        holidays: holidayDays,
        holidayHrs: Math.round(holidayHrs * 100) / 100,
        focusPercent: sprint.focusFactor,
        netDevHrs: Math.round(netDevHrs * 100) / 100,
      } as DevCapacity;
    });
}

export function computeDevProjection(
  devCapacities: DevCapacity[],
  velocityProven: number,
  velocityTarget: number,
  backlogDevSP: number,
): DevProjection {
  const netDevCapacity = devCapacities.reduce((sum, d) => sum + d.netDevHrs, 0);
  const projectedSPProven = netDevCapacity * velocityProven;
  const projectedSPTarget = netDevCapacity * velocityTarget;

  return {
    netDevCapacity: Math.round(netDevCapacity * 100) / 100,
    velocityProven,
    velocityTarget,
    projectedSPProven: Math.round(projectedSPProven * 100) / 100,
    projectedSPTarget: Math.round(projectedSPTarget * 100) / 100,
    backlogDevSP,
    gapProven: Math.round((projectedSPProven - backlogDevSP) * 100) / 100,
    gapTarget: Math.round((projectedSPTarget - backlogDevSP) * 100) / 100,
    coverageProven: backlogDevSP > 0 ? Math.round((projectedSPProven / backlogDevSP) * 1000) / 1000 : 0,
    coverageTarget: backlogDevSP > 0 ? Math.round((projectedSPTarget / backlogDevSP) * 1000) / 1000 : 0,
  };
}

// ---------------------------------------------------------------------------
// InitialCapacity-based computations
// ---------------------------------------------------------------------------

/** Mapping from IC percentage fields to backlog stream codes. */
const IC_STREAM_MAP: Record<string, string> = {
  refinement: "1-REF",
  design: "2-DES",
  development: "3-DEV",
  qa: "4-QA",
};

/** Compute base net hours for an InitialCapacity member (full allocation). */
export function computeICMemberNetHrs(
  member: InitialCapacity,
  sprint: Sprint,
  publicHolidays: PHoliday[],
  projectHolidays: PJHoliday[],
  ptoEntries?: PtoEntry[],
): number {
  const totalHrs = member.hrsPerWeek * sprint.durationWeeks;
  const memberName = `${member.firstName} ${member.lastName}`;
  const holidayDays = getHolidayDaysForMember(member.location, sprint, publicHolidays, projectHolidays, ptoEntries, memberName);
  const holidayHrs = (member.hrsPerWeek / 5) * holidayDays;
  return (totalHrs - holidayHrs) * sprint.focusFactor;
}

/** Compute per-stream capacity hours from InitialCapacity data. */
export function computeStreamCapacityFromIC(
  members: InitialCapacity[],
  sprint: Sprint,
  publicHolidays: PHoliday[],
  projectHolidays: PJHoliday[],
  ptoEntries?: PtoEntry[],
): Record<string, number> {
  const result: Record<string, number> = {
    "1-REF": 0,
    "2-DES": 0,
    "3-DEV": 0,
    "4-QA": 0,
  };

  for (const m of members) {
    if (m.isActive === false) continue;
    const netHrs = computeICMemberNetHrs(m, sprint, publicHolidays, projectHolidays, ptoEntries);
    for (const [field, stream] of Object.entries(IC_STREAM_MAP)) {
      const pct = m[field as keyof InitialCapacity] as number;
      if (pct > 0) {
        result[stream] = (result[stream] ?? 0) + netHrs * pct;
      }
    }
  }

  // Round all values
  for (const key of Object.keys(result)) {
    result[key] = Math.round(result[key] * 100) / 100;
  }

  return result;
}

/** Build DevCapacity[] from IC entries with development > 0. */
export function computeDevCapacityFromIC(
  members: InitialCapacity[],
  sprint: Sprint,
  publicHolidays: PHoliday[],
  projectHolidays: PJHoliday[],
  ptoEntries?: PtoEntry[],
): DevCapacity[] {
  return members
    .filter(m => m.isActive !== false && m.development > 0)
    .map(m => {
      const devPercent = m.development;
      const effHrsPerWeek = m.hrsPerWeek * devPercent;
      const grossHrs = effHrsPerWeek * sprint.durationWeeks;
      const memberName = `${m.firstName} ${m.lastName}`;
      const holidayDays = getHolidayDaysForMember(m.location, sprint, publicHolidays, projectHolidays, ptoEntries, memberName);
      const hrsPerDay = effHrsPerWeek / 5;
      const holidayHrs = holidayDays * hrsPerDay;
      const netDevHrs = (grossHrs - holidayHrs) * sprint.focusFactor;

      return {
        name: `${m.firstName} ${m.lastName}`,
        role: m.role,
        location: m.location,
        hrsPerWeek: m.hrsPerWeek,
        devPercent,
        effHrsPerWeek: Math.round(effHrsPerWeek * 100) / 100,
        weeks: sprint.durationWeeks,
        grossHrs: Math.round(grossHrs * 100) / 100,
        holidays: holidayDays,
        holidayHrs: Math.round(holidayHrs * 100) / 100,
        focusPercent: sprint.focusFactor,
        netDevHrs: Math.round(netDevHrs * 100) / 100,
      } as DevCapacity;
    });
}

// ---------------------------------------------------------------------------
// Capacity rows (supports both TeamMember and IC-based stream capacity)
// ---------------------------------------------------------------------------

export function computeCapacityRows(
  stories: Story[],
  teamMembers: TeamMember[],
  devProjection: DevProjection,
  streamCapacityOverride?: Record<string, number>,
): CapacityRow[] {
  const activeStories = stories.filter(s => !s.isExcluded);

  const streamMapping: Record<string, string> = {
    "1-REF": "REF",
    "2-DES": "DES",
    "3-DEV": "DEV",
    "4-QA": "QA",
  };

  const streams = ["1-REF", "2-DES", "3-DEV", "4-QA"];

  return streams.map(backlogStream => {
    const teamStream = streamMapping[backlogStream];
    const streamStories = activeStories.filter(s => s.stream === backlogStream);
    const scopeSP = streamStories.reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
    const storyCount = streamStories.length;

    // Use override if provided (IC-based), otherwise fall back to TeamMember
    let capacityHrs: number;
    if (streamCapacityOverride && backlogStream in streamCapacityOverride) {
      capacityHrs = streamCapacityOverride[backlogStream];
    } else {
      const streamMembers = teamMembers.filter(m => m.stream === teamStream);
      capacityHrs = streamMembers.reduce((sum, m) => sum + m.netHrs, 0);
    }

    let velocity: number | null = null;
    let projectedSP: number | null = null;
    let gap: number | null = null;
    let coveragePercent: number | null = null;

    if (backlogStream === "3-DEV") {
      velocity = devProjection.velocityProven;
      projectedSP = devProjection.projectedSPProven;
      gap = devProjection.gapProven;
      coveragePercent = devProjection.coverageProven * 100;
    }

    let status: CapacityRow["status"] = "N/A";
    if (coveragePercent !== null) {
      if (coveragePercent >= 100) status = "OK";
      else if (coveragePercent >= 80) status = "At Risk";
      else status = "Over";
    }

    return {
      stream: backlogStream,
      scopeSP,
      stories: storyCount,
      capacityHrs: Math.round(capacityHrs * 100) / 100,
      totalHrs: Math.round(capacityHrs * 100) / 100,
      velocity,
      projectedSP: projectedSP !== null ? Math.round(projectedSP * 100) / 100 : null,
      gap: gap !== null ? Math.round(gap * 100) / 100 : null,
      coveragePercent: coveragePercent !== null ? Math.round(coveragePercent * 10) / 10 : null,
      status,
    };
  });
}

export function isExcludedStory(status: string): boolean {
  return EXCLUDED_STATUSES.some(s => status.toLowerCase().includes(s.toLowerCase()));
}

export function computeDashboardKPIs(
  sprint: Sprint,
  teamMembers: TeamMember[],
  stories: Story[],
  devProjection: DevProjection,
): DashboardKPIs {
  const activeStories = stories.filter(s => !s.isExcluded);
  return {
    currentSprint: sprint.name,
    teamSize: teamMembers.length,
    totalNetCapacity: Math.round(teamMembers.reduce((s, m) => s + m.netHrs, 0) * 100) / 100,
    totalBacklogSP: activeStories.reduce((s, st) => s + (st.storyPoints ?? 0), 0),
    devGap: devProjection.gapProven,
    devCoverage: devProjection.coverageProven * 100,
    storiesCount: activeStories.length,
    devNetHrs: devProjection.netDevCapacity,
  };
}

// ---------------------------------------------------------------------------
// Sprint-level projected SP (the core answer: "how many SP can we deliver?")
// ---------------------------------------------------------------------------

export type VelocitySource = "calculated" | "rolling-avg" | "manual" | "inherited";

export interface SprintForecast {
  sprintId: string;
  sprintName: string;
  netDevHrs: number;
  velocityProven: number;
  velocityTarget: number;
  projectedSPProven: number;
  projectedSPTarget: number;
  /** Whether velocity was inherited from a previous sprint */
  velocityInherited: boolean;
  /** Commitment SP from sprint planning */
  commitmentSP: number | null;
  /** Actually completed SP */
  completedSP: number | null;
  /** Actual velocity = completedSP / netDevHrs (only for sprints with data) */
  actualVelocity: number | null;
  /** Confidence = (completedSP / commitmentSP) × 100 */
  confidencePercent: number | null;
  /** How the velocity used for projection was determined */
  velocitySource: VelocitySource;
}

/** Rolling window size for averaging historical velocities. */
const ROLLING_WINDOW = 3;

/**
 * For each sprint, compute how many SP the team can deliver.
 *
 * Velocity priority:
 *   1. Sprint with completedSP > 0 && netDevHrs > 0 → actualVelocity = completedSP / netDevHrs
 *   2. Sprint without data but historical available → rolling average of last N sprints with data
 *   3. Fallback: sprint.velocityProven (manual value from DB)
 *   4. Last resort: inherited from the most recent known velocity
 */
export function computeAllSprintForecasts(
  sprints: Sprint[],
  members: InitialCapacity[],
  publicHolidays: PHoliday[],
  projectHolidays: PJHoliday[],
  ptoEntries?: PtoEntry[],
): SprintForecast[] {
  // First pass: compute netDevHrs and actualVelocity for each sprint
  const precomputed = sprints.map(sprint => {
    const devCapacities = computeDevCapacityFromIC(members, sprint, publicHolidays, projectHolidays, ptoEntries);
    const netDevHrs = devCapacities.reduce((sum, d) => sum + d.netDevHrs, 0);

    let actualVelocity: number | null = null;
    if (
      sprint.completedSP !== null &&
      sprint.completedSP > 0 &&
      netDevHrs > 0
    ) {
      actualVelocity = sprint.completedSP / netDevHrs;
    }

    let confidencePercent: number | null = null;
    if (
      sprint.completedSP !== null &&
      sprint.commitmentSP !== null &&
      sprint.commitmentSP > 0
    ) {
      confidencePercent = (sprint.completedSP / sprint.commitmentSP) * 100;
    }

    return {
      sprint,
      netDevHrs: Math.round(netDevHrs * 100) / 100,
      actualVelocity,
      confidencePercent,
    };
  });

  // Second pass: build forecasts with velocity chain
  const recentVelocities: number[] = []; // sliding window of actual velocities
  let lastKnownVelocity = 0;
  let lastTarget = 0;

  return precomputed.map(({ sprint, netDevHrs, actualVelocity, confidencePercent }) => {
    let velocity: number;
    let velocitySource: VelocitySource;
    let velocityInherited = false;

    if (actualVelocity !== null) {
      // ① Sprint has actual data → use calculated velocity
      velocity = actualVelocity;
      velocitySource = "calculated";

      // Add to rolling window
      recentVelocities.push(actualVelocity);
      if (recentVelocities.length > ROLLING_WINDOW) {
        recentVelocities.shift();
      }

      lastKnownVelocity = actualVelocity;
    } else if (recentVelocities.length > 0) {
      // ② No data but historical available → rolling average
      velocity =
        recentVelocities.reduce((sum, v) => sum + v, 0) /
        recentVelocities.length;
      velocitySource = "rolling-avg";
      velocityInherited = true;
    } else if (
      sprint.velocityProven !== null &&
      sprint.velocityProven > 0
    ) {
      // ③ Manual velocity fallback
      velocity = sprint.velocityProven;
      velocitySource = "manual";

      lastKnownVelocity = sprint.velocityProven;
    } else if (lastKnownVelocity > 0) {
      // ④ Inherit from last known
      velocity = lastKnownVelocity;
      velocitySource = "inherited";
      velocityInherited = true;
    } else {
      velocity = 0;
      velocitySource = "inherited";
      velocityInherited = true;
    }

    // Target velocity chain (keep existing behaviour)
    const vTarget =
      sprint.velocityTarget !== null && sprint.velocityTarget > 0
        ? sprint.velocityTarget
        : lastTarget;
    if (sprint.velocityTarget !== null && sprint.velocityTarget > 0) {
      lastTarget = sprint.velocityTarget;
    }

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      netDevHrs,
      velocityProven: Math.round(velocity * 10000) / 10000,
      velocityTarget: vTarget,
      projectedSPProven: Math.round(netDevHrs * velocity * 100) / 100,
      projectedSPTarget: Math.round(netDevHrs * vTarget * 100) / 100,
      velocityInherited,
      commitmentSP: sprint.commitmentSP,
      completedSP: sprint.completedSP,
      actualVelocity:
        actualVelocity !== null
          ? Math.round(actualVelocity * 10000) / 10000
          : null,
      confidencePercent:
        confidencePercent !== null
          ? Math.round(confidencePercent * 10) / 10
          : null,
      velocitySource,
    };
  });
}
