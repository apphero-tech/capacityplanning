import {
  getAllSprints,
  getInitialCapacities,
  getPublicHolidays,
  getProjectHolidays,
  getPtoEntries,
  getStoriesBySprint,
} from "@/lib/data";
import {
  computeDevCapacityFromIC,
  computeHistoricalVelocity,
  type VelocityBasis,
} from "@/lib/capacity-engine";
import type { DevCapacity } from "@/types";

export type GrowthOption = 0 | 0.03 | 0.05 | 0.1 | 0.2 | number;

export interface DevRow {
  firstName: string;
  lastName: string;
  role: string;
  location: string;
  hrsPerWeek: number;
  devPercent: number;
  effHrsPerWeek: number;
  grossHrs: number;
  offDays: number;
  offHrs: number;
  netDevHrs: number;
}

export interface BucketScenario {
  basis: VelocityBasis;
  label: string;
  sprintCount: number;
  sprintNames: string[];
  velocity: number;
  netDevHrs: number;
  growthPercent: number;
  bucketSP: number;
}

export interface BacklogBreakdown {
  totalStories: number;
  totalSP: number;
  readyForDev: { stories: number; sp: number };
  upstream: { stories: number; sp: number };
  downstream: { stories: number; sp: number };
}

export interface EmailSnapshot {
  sprint: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    durationWeeks: number;
    nominalWorkingDays: number;
    focusFactor: number;
    publicHolidays: { date: string; name: string; country: string }[];
    projectHolidays: { date: string; name: string }[];
  };
  devs: DevRow[];
  totals: {
    theoreticalHrs: number;
    offHrs: number;
    netDevHrs: number;
    devCount: number;
  };
  backlog: BacklogBreakdown;
  buckets: {
    selected: BucketScenario;
    scenarios: BucketScenario[];
  };
  pastSprints: { name: string; completedSP: number }[];
  growthPercent: number;
  selectedBasis: VelocityBasis;
}

function buildDevRow(cap: DevCapacity, focusFactor: number): DevRow {
  // The capacity engine bakes focusFactor into netDevHrs. For the email we
  // surface the pre-focus-factor "grossHrs − offHrs" and the final netDevHrs
  // separately so the reader can see each stage of the computation.
  const offHrs = cap.holidayHrs;
  const afterOff = cap.grossHrs - offHrs;
  const netDevHrs = Math.round(afterOff * focusFactor * 10) / 10;
  return {
    firstName: cap.name.split(" ")[0] ?? "",
    lastName: cap.name.split(" ").slice(1).join(" "),
    role: cap.role,
    location: cap.location,
    hrsPerWeek: cap.hrsPerWeek,
    devPercent: cap.devPercent,
    effHrsPerWeek: cap.effHrsPerWeek,
    grossHrs: cap.grossHrs,
    offDays: cap.holidays,
    offHrs: Math.round(cap.holidayHrs * 10) / 10,
    netDevHrs,
  };
}

function buildBacklog(stories: Awaited<ReturnType<typeof getStoriesBySprint>>): BacklogBreakdown {
  let totalSP = 0;
  let readyStories = 0, readySP = 0;
  let upStories = 0, upSP = 0;
  let downStories = 0, downSP = 0;

  for (const s of stories) {
    const sp = s.storyPoints ?? 0;
    totalSP += sp;
    const statusOrder = Number(s.status.match(/^(\d{2})-/)?.[1] ?? 99);

    if (statusOrder === 30) {
      readyStories++;
      readySP += sp;
    } else if (statusOrder < 30) {
      upStories++;
      upSP += sp;
    } else {
      downStories++;
      downSP += sp;
    }
  }

  return {
    totalStories: stories.length,
    totalSP: Math.round(totalSP),
    readyForDev: { stories: readyStories, sp: Math.round(readySP) },
    upstream: { stories: upStories, sp: Math.round(upSP) },
    downstream: { stories: downStories, sp: Math.round(downSP) },
  };
}

const BASIS_LABEL: Record<VelocityBasis, string> = {
  last1: "Last sprint",
  last2: "Last 2 sprints",
  last3: "Last 3 sprints",
  last6: "Last 6 sprints",
  all: "All past sprints",
};

export async function buildEmailSnapshot(
  sprintId: string,
  options?: { basis?: VelocityBasis; growthPercent?: number },
): Promise<EmailSnapshot> {
  const selectedBasis: VelocityBasis = options?.basis ?? "last1";
  const growthPercent = options?.growthPercent ?? 0;
  const growthMultiplier = 1 + growthPercent / 100;

  const [sprints, capacities, publicHolidays, projectHolidays, ptoEntries] = await Promise.all([
    getAllSprints(),
    getInitialCapacities(),
    getPublicHolidays(),
    getProjectHolidays(),
    getPtoEntries(),
  ]);

  const sprint = sprints.find((s) => s.id === sprintId);
  if (!sprint) throw new Error(`Sprint not found: ${sprintId}`);
  if (!sprint.startDate || !sprint.endDate) {
    throw new Error(`Sprint ${sprint.name} has no start/end date`);
  }

  const deloitteDevs = capacities.filter(
    (c) => c.isActive !== false && c.organization === "Deloitte" && c.development > 0,
  );

  const devCapacities = computeDevCapacityFromIC(
    deloitteDevs,
    sprint,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  );

  const devs = devCapacities
    .map((d) => buildDevRow(d, sprint.focusFactor))
    .sort((a, b) => b.devPercent - a.devPercent || a.lastName.localeCompare(b.lastName));

  const theoreticalHrs = Math.round(devs.reduce((s, d) => s + d.grossHrs, 0) * 10) / 10;
  const offHrs = Math.round(devs.reduce((s, d) => s + d.offHrs, 0) * 10) / 10;
  const netDevHrs = Math.round(devs.reduce((s, d) => s + d.netDevHrs, 0) * 10) / 10;

  const stories = await getStoriesBySprint(sprintId);
  const backlog = buildBacklog(stories);

  // Scenarios: Last sprint / Last 3 / All past — the 3 natural windows.
  const bases: VelocityBasis[] = ["last1", "last3", "all"];
  const scenarios: BucketScenario[] = bases.map((basis) => {
    const hist = computeHistoricalVelocity(
      sprints,
      deloitteDevs,
      publicHolidays,
      projectHolidays,
      ptoEntries,
      basis,
    );
    const bucketSP = Math.round(netDevHrs * hist.velocity * growthMultiplier);
    return {
      basis,
      label: BASIS_LABEL[basis],
      sprintCount: hist.sprintCount,
      sprintNames: hist.sprintNames,
      velocity: Math.round(hist.velocity * 10000) / 10000,
      netDevHrs,
      growthPercent,
      bucketSP,
    };
  });

  // The "selected" scenario drives the headline bucket in the email. If the
  // user's basis is one we include in scenarios, reuse it; otherwise compute.
  let selected = scenarios.find((s) => s.basis === selectedBasis);
  if (!selected) {
    const hist = computeHistoricalVelocity(
      sprints,
      deloitteDevs,
      publicHolidays,
      projectHolidays,
      ptoEntries,
      selectedBasis,
    );
    selected = {
      basis: selectedBasis,
      label: BASIS_LABEL[selectedBasis],
      sprintCount: hist.sprintCount,
      sprintNames: hist.sprintNames,
      velocity: Math.round(hist.velocity * 10000) / 10000,
      netDevHrs,
      growthPercent,
      bucketSP: Math.round(netDevHrs * hist.velocity * growthMultiplier),
    };
  }

  const pastSprints = sprints
    .filter((s) => !s.isDemo && !s.isCurrent && s.completedSP != null && s.completedSP > 0)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
    .map((s) => ({ name: s.name, completedSP: Math.round(s.completedSP!) }));

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      durationWeeks: sprint.durationWeeks,
      nominalWorkingDays: sprint.workingDays,
      focusFactor: sprint.focusFactor,
      publicHolidays: publicHolidays
        .filter((h) => h.date >= sprint.startDate! && h.date <= sprint.endDate!)
        .map((h) => ({ date: h.date, name: h.name, country: h.country }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      projectHolidays: projectHolidays
        .filter((h) => h.date && h.date >= sprint.startDate! && h.date <= sprint.endDate!)
        .map((h) => ({ date: h.date, name: h.name }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
    devs,
    totals: {
      theoreticalHrs,
      offHrs,
      netDevHrs,
      devCount: devs.length,
    },
    backlog,
    buckets: {
      selected,
      scenarios,
    },
    pastSprints,
    growthPercent,
    selectedBasis,
  };
}
