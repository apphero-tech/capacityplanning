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

/**
 * Per-stream story pool for capacity rows.
 *
 * 3-cycle framework: at sprint N, refining and design work on the stories
 * planned for DEV at sprint N+1; DEV works on stories planned for sprint N;
 * QA tests stories that were dev-ed at sprint N-1. Pass the right pool for
 * each stream here — capacity-view builds them from the adjacent sprints.
 */
export type StreamScopeStories = {
  "1-REF": Story[];
  "2-DES": Story[];
  "3-DEV": Story[];
  "4-QA":  Story[];
};

export function computeCapacityRows(
  storiesByStream: StreamScopeStories,
  teamMembers: TeamMember[],
  devProjection: DevProjection,
  streamCapacityOverride?: Record<string, number>,
): CapacityRow[] {
  const streamMapping: Record<string, string> = {
    "1-REF": "REF",
    "2-DES": "DES",
    "3-DEV": "DEV",
    "4-QA": "QA",
  };

  const streams: (keyof StreamScopeStories)[] = ["1-REF", "2-DES", "3-DEV", "4-QA"];

  return streams.map(backlogStream => {
    const teamStream = streamMapping[backlogStream];
    // Scope = all active stories in the pool that belongs to this cycle,
    // regardless of each story's individual workflow status.
    const streamStories = (storiesByStream[backlogStream] ?? []).filter(s => !s.isExcluded);
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

// ---------------------------------------------------------------------------
// Projection bases — user-tunable historical window + growth factor.
// ---------------------------------------------------------------------------

/** Which pool of closed sprints the historical velocity is averaged over. */
export type VelocityBasis = "last1" | "last2" | "last3" | "last6" | "all";

export const VELOCITY_BASIS_LABEL: Record<VelocityBasis, string> = {
  last1: "Last sprint",
  last2: "Last 2 sprints",
  last3: "Last 3 sprints",
  last6: "Last 6 sprints",
  all: "All-time",
};

export interface HistoricalVelocityResult {
  /** Averaged SP/hr across the selected closed sprints (0 if no history). */
  velocity: number;
  /** Number of closed sprints actually included in the average. */
  sprintCount: number;
  /** Names of the sprints included, in chronological order. */
  sprintNames: string[];
}

/**
 * Compute the historical velocity (SP/hr) using the chosen basis.
 *
 *  • Only non-demo sprints with a positive `completedSP` and positive
 *    net DEV hours are considered.
 *  • Capacity hours are computed per sprint with the same engine used
 *    everywhere else, so PTO and holidays of the period are reflected.
 *  • The average is a simple mean of per-sprint velocities — not a
 *    hours-weighted mean — so a single outlier sprint doesn't dominate.
 */
export function computeHistoricalVelocity(
  allSprints: Array<{
    id: string;
    name: string;
    isDemo: boolean;
    isCurrent?: boolean;
    startDate: string | null;
    endDate: string | null;
    durationWeeks: number;
    completedSP: number | null;
    holidayLocation?: string;
  }>,
  deloitteCapacities: Array<Parameters<typeof computeDevCapacityFromIC>[0][number]>,
  publicHolidays: Parameters<typeof computeDevCapacityFromIC>[2],
  projectHolidays: Parameters<typeof computeDevCapacityFromIC>[3],
  ptoEntries: Parameters<typeof computeDevCapacityFromIC>[4],
  basis: VelocityBasis,
): HistoricalVelocityResult {
  // The current sprint is mid-flight: its completedSP is a partial
  // snapshot, not a final delivery number — excluding it keeps the
  // historical averages honest.
  const closed = [...allSprints]
    .filter(
      (s) =>
        !s.isDemo &&
        !s.isCurrent &&
        s.completedSP != null &&
        s.completedSP > 0,
    )
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const velocities: { name: string; velocity: number }[] = [];
  for (const s of closed) {
    const caps = computeDevCapacityFromIC(
      deloitteCapacities,
      // computeDevCapacityFromIC needs the Sprint shape — we pass a minimal
      // object that matches what the engine reads.
      s as unknown as Parameters<typeof computeDevCapacityFromIC>[1],
      publicHolidays,
      projectHolidays,
      ptoEntries,
    );
    const hrs = caps.reduce((sum, d) => sum + d.netDevHrs, 0);
    if (hrs > 0 && s.completedSP != null) {
      velocities.push({ name: s.name, velocity: s.completedSP / hrs });
    }
  }

  if (velocities.length === 0) {
    return { velocity: 0, sprintCount: 0, sprintNames: [] };
  }

  let slice = velocities;
  switch (basis) {
    case "last1": slice = velocities.slice(-1); break;
    case "last2": slice = velocities.slice(-2); break;
    case "last3": slice = velocities.slice(-3); break;
    case "last6": slice = velocities.slice(-6); break;
    case "all":   slice = velocities; break;
  }

  const avg = slice.reduce((sum, v) => sum + v.velocity, 0) / slice.length;
  return {
    velocity: avg,
    sprintCount: slice.length,
    sprintNames: slice.map((v) => v.name),
  };
}

export interface CurrentSprintVelocity {
  sprintName: string;
  completedSP: number;
  /** Net DEV hours elapsed from sprint start → today (PTO & holidays removed). */
  elapsedHrs: number;
  /** Net DEV hours for the full sprint (same engine as the rest of the app). */
  fullHrs: number;
  /** Fraction of the sprint already consumed, 0..1. */
  elapsedFraction: number;
  /** \`completedSP / elapsedHrs\` — fair in-flight velocity. */
  velocity: number;
}

function countBusinessDaysBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (end < start) return 0;
  let n = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) n += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return n;
}

/**
 * Fair in-flight velocity of the current sprint:
 *
 *   velocity = completedSP / elapsedNetHrs
 *
 * where elapsedNetHrs is computed the same way as any other sprint's
 * net hours, but over the [startDate → today] slice only (PTO &
 * holidays that already occurred are deducted). Extrapolates cleanly
 * to a projected final number by applying that velocity to the full
 * sprint's net hours.
 */
export function computeCurrentSprintVelocity(
  allSprints: Array<{
    id: string;
    name: string;
    isDemo: boolean;
    isCurrent?: boolean;
    startDate: string | null;
    endDate: string | null;
    durationWeeks: number;
    completedSP: number | null;
  }>,
  deloitteCapacities: Array<Parameters<typeof computeDevCapacityFromIC>[0][number]>,
  publicHolidays: Parameters<typeof computeDevCapacityFromIC>[2],
  projectHolidays: Parameters<typeof computeDevCapacityFromIC>[3],
  ptoEntries: Parameters<typeof computeDevCapacityFromIC>[4],
): CurrentSprintVelocity | null {
  const current = allSprints.find(
    (s) => !s.isDemo && s.isCurrent && s.completedSP != null && s.completedSP > 0,
  );
  if (!current || !current.startDate || !current.endDate) return null;

  const todayISO = new Date().toISOString().slice(0, 10);
  const sliceEndISO =
    todayISO > current.endDate ? current.endDate : todayISO;
  if (sliceEndISO < current.startDate) return null;

  const totalBd = countBusinessDaysBetween(current.startDate, current.endDate);
  const elapsedBd = countBusinessDaysBetween(current.startDate, sliceEndISO);
  if (totalBd <= 0 || elapsedBd <= 0) return null;

  // Full-sprint net hours — same as the Hours Available breakdown uses.
  const fullCaps = computeDevCapacityFromIC(
    deloitteCapacities,
    current as unknown as Parameters<typeof computeDevCapacityFromIC>[1],
    publicHolidays,
    projectHolidays,
    ptoEntries,
  );
  const fullHrs = fullCaps.reduce((sum, d) => sum + d.netDevHrs, 0);

  // Elapsed slice: a virtual sprint that ends today, scaled to the number
  // of business days already consumed.
  const elapsedWeeks = elapsedBd / 5;
  const elapsedSprint = {
    ...current,
    endDate: sliceEndISO,
    durationWeeks: elapsedWeeks,
  };
  const elapsedCaps = computeDevCapacityFromIC(
    deloitteCapacities,
    elapsedSprint as unknown as Parameters<typeof computeDevCapacityFromIC>[1],
    publicHolidays,
    projectHolidays,
    ptoEntries,
  );
  const elapsedHrs = elapsedCaps.reduce((sum, d) => sum + d.netDevHrs, 0);
  if (elapsedHrs <= 0 || current.completedSP == null) return null;

  return {
    sprintName: current.name,
    completedSP: current.completedSP,
    elapsedHrs,
    fullHrs,
    elapsedFraction: elapsedBd / totalBd,
    velocity: current.completedSP / elapsedHrs,
  };
}
