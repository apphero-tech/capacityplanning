/**
 * Data access layer for the capacity planning app.
 *
 * Reads from the local SQLite database via Prisma Client. Every query is
 * scoped to the current workspace — resolved lazily by
 * `getCurrentWorkspaceId()` so callers don't have to thread workspaceId
 * through every component.
 */

import { differenceInBusinessDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getCurrentWorkspaceId } from "@/lib/auth/workspace";

import type {
  Sprint,
  SprintStatus,
  TeamMember,
  Story,
  SprintStory,
  PublicHoliday,
  ProjectHoliday,
  PtoEntry,
  InitialCapacity,
  Country,
  TeamStream,
  BacklogStream,
  FtPt,
} from "@/types";

// ---------------------------------------------------------------------------
// Local domain type — guide entry isn't in src/types/index.ts
// ---------------------------------------------------------------------------

export interface GuideEntry {
  id: string;
  section: string;
  term: string;
  defaultVal: string | null;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Sprint natural sort
// ---------------------------------------------------------------------------

/**
 * Parse a sprint name like "Sprint 6", "Sprint 3-PD1", "Sprint 9-PD3" into
 * a sort key [major, sub] so Sprint 3-PD1 sorts as [3, 1] between
 * Sprint 3 [3, 0] and Sprint 4 [4, 0].
 */
function sprintSortKey(name: string): [number, number] {
  const match = name.match(/Sprint\s+(\d+)(?:-PD(\d+))?/i);
  if (!match) return [999, 0];
  const major = parseInt(match[1], 10);
  const sub = match[2] ? parseInt(match[2], 10) : 0;
  return [major, sub];
}

function compareSprintNames(a: string, b: string): number {
  const [aMaj, aSub] = sprintSortKey(a);
  const [bMaj, bSub] = sprintSortKey(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  return aSub - bSub;
}

// ---------------------------------------------------------------------------
// Mapping helpers — Prisma row → domain type
// ---------------------------------------------------------------------------

type SprintRow = Awaited<ReturnType<typeof prisma.sprint.findFirst>> extends infer T
  ? T extends null
    ? never
    : T
  : never;

function mapSprint(
  row: SprintRow,
  status: SprintStatus = "future",
  isActive: boolean = false,
  isCurrentOverride?: boolean,
): Sprint {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    durationWeeks: row.durationWeeks,
    workingDays: row.workingDays,
    focusFactor: row.focusFactor,
    velocityProven: row.velocityProven,
    velocityTarget: row.velocityTarget,
    isCurrent: isCurrentOverride ?? row.isCurrent,
    isDemo: row.isDemo,
    progressFactor: row.progressFactor ?? 0,
    status,
    isActive,
    storyCount: row.storyCount,
    storyPoints: row.storyPoints,
    commitmentSP: row.commitmentSP,
    completedSP: row.completedSP,
  };
}

// ---------------------------------------------------------------------------
// Current-sprint resolution (date-based)
// ---------------------------------------------------------------------------

function pickCurrentSprintRow(rows: SprintRow[]): SprintRow | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const dated = rows
    .filter((r) => r.startDate && r.endDate)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const inFlight = dated.find(
    (r) => (r.startDate ?? "") <= todayStr && (r.endDate ?? "") >= todayStr,
  );
  if (inFlight) return inFlight;

  const upcoming = dated.find((r) => (r.startDate ?? "") > todayStr);
  return upcoming ?? null;
}

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------

export async function getCurrentSprint(): Promise<Sprint | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.sprint.findMany({ where: { workspaceId } });
  const row = pickCurrentSprintRow(rows);
  return row ? mapSprint(row, "current", true, true) : null;
}

/**
 * Return all sprints sorted naturally with computed status:
 *   past | previous | current | next | future.
 *
 * The active 4-sprint window is derived from main sprint numbers:
 * if current is Sprint N, then previous = Sprint (N-1), next = (N+1),
 * and planning = (N+2). PD sub-sprints inherit the major's window.
 */
export async function getAllSprints(): Promise<Sprint[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.sprint.findMany({ where: { workspaceId } });

  rows.sort((a, b) => compareSprintNames(a.name, b.name));

  const currentRow = pickCurrentSprintRow(rows);
  const currentMajor = currentRow ? sprintSortKey(currentRow.name)[0] : -1;

  return rows.map((row) => {
    const [major] = sprintSortKey(row.name);
    let status: SprintStatus = "future";
    let isActive = false;

    if (currentMajor >= 0) {
      if (major < currentMajor - 1) {
        status = "past";
      } else if (major === currentMajor - 1) {
        status = "previous";
        isActive = true;
      } else if (major === currentMajor) {
        status = "current";
        isActive = true;
      } else if (major === currentMajor + 1) {
        status = "next";
        isActive = true;
      } else if (major === currentMajor + 2) {
        status = "planning";
        isActive = true;
      }
    }

    const isCurrent = currentRow?.id === row.id;
    if (isCurrent) {
      status = "current";
      isActive = true;
    }

    return mapSprint(row, status, isActive, isCurrent);
  });
}

/**
 * Create a new sprint in the current workspace. workingDays + isCurrent
 * are derived from the dates so callers don't have to think about them.
 */
export async function insertSprint(input: {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  durationWeeks?: number;
  focusFactor?: number;
  isDemo?: boolean;
}): Promise<string> {
  const workspaceId = await getCurrentWorkspaceId();

  const startDate = input.startDate ?? null;
  const endDate = input.endDate ?? null;

  let workingDays = 20;
  let durationWeeks = input.durationWeeks ?? 4;
  let isCurrent = false;
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    workingDays = differenceInBusinessDays(end, start) + 1;
    durationWeeks = Math.max(1, Math.ceil(workingDays / 5));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    isCurrent = today >= start && today <= end;
  }

  // Single-current invariant
  if (isCurrent) {
    await prisma.sprint.updateMany({
      where: { workspaceId, isCurrent: true },
      data: { isCurrent: false },
    });
  }

  const created = await prisma.sprint.create({
    data: {
      workspaceId,
      name: input.name,
      startDate,
      endDate,
      durationWeeks,
      workingDays,
      focusFactor: input.focusFactor ?? 0.9,
      isCurrent,
      isDemo: input.isDemo ?? false,
    },
  });
  return created.id;
}

export const BACKLOG_SPRINT_NAME = "Backlog (unassigned)";

/**
 * Make sure the synthetic "Backlog (unassigned)" sprint exists for the
 * current workspace and return its id. Idempotent.
 */
export async function ensureBacklogSprint(): Promise<string> {
  const workspaceId = await getCurrentWorkspaceId();
  const existing = await prisma.sprint.findFirst({
    where: { workspaceId, name: BACKLOG_SPRINT_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.sprint.create({
    data: {
      workspaceId,
      name: BACKLOG_SPRINT_NAME,
      startDate: null,
      endDate: null,
      durationWeeks: 0,
      workingDays: 0,
      focusFactor: 0.9,
      isCurrent: false,
      isDemo: false,
    },
  });
  return created.id;
}

export async function deleteSprint(id: string): Promise<boolean> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await prisma.sprint.deleteMany({ where: { id, workspaceId } });
  return result.count > 0;
}

/**
 * Update any subset of a sprint's editable fields. workingDays,
 * durationWeeks and isCurrent are recomputed when dates change.
 */
export async function updateSprint(
  id: string,
  updates: {
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
    focusFactor?: number;
    isDemo?: boolean;
  },
): Promise<boolean> {
  const workspaceId = await getCurrentWorkspaceId();
  const row = await prisma.sprint.findFirst({ where: { id, workspaceId } });
  if (!row) return false;

  const nextStart = updates.startDate !== undefined ? updates.startDate : row.startDate;
  const nextEnd = updates.endDate !== undefined ? updates.endDate : row.endDate;

  let workingDays = row.workingDays;
  let durationWeeks = row.durationWeeks;
  let isCurrent = row.isCurrent;

  if (updates.startDate !== undefined || updates.endDate !== undefined) {
    if (nextStart && nextEnd) {
      const start = new Date(`${nextStart}T00:00:00`);
      const end = new Date(`${nextEnd}T00:00:00`);
      workingDays = differenceInBusinessDays(end, start) + 1;
      durationWeeks = Math.max(1, Math.ceil(workingDays / 5));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      isCurrent = today >= start && today <= end;
    }
  }

  if (isCurrent && !row.isCurrent) {
    await prisma.sprint.updateMany({
      where: { workspaceId, isCurrent: true, NOT: { id } },
      data: { isCurrent: false },
    });
  }

  const data: Record<string, unknown> = {
    workingDays,
    durationWeeks,
    isCurrent,
  };
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.startDate !== undefined) data.startDate = updates.startDate;
  if (updates.endDate !== undefined) data.endDate = updates.endDate;
  if (updates.focusFactor !== undefined) data.focusFactor = updates.focusFactor;
  if (updates.isDemo !== undefined) data.isDemo = updates.isDemo;

  const result = await prisma.sprint.updateMany({
    where: { id, workspaceId },
    data,
  });
  return result.count > 0;
}

export async function updateSprintActuals(
  id: string,
  updates: { commitmentSP?: number | null; completedSP?: number | null },
): Promise<boolean> {
  const workspaceId = await getCurrentWorkspaceId();
  const data: Record<string, unknown> = {};
  if (updates.commitmentSP !== undefined) data.commitmentSP = updates.commitmentSP;
  if (updates.completedSP !== undefined) data.completedSP = updates.completedSP;
  if (Object.keys(data).length === 0) return false;

  const result = await prisma.sprint.updateMany({
    where: { id, workspaceId },
    data,
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Team members
// ---------------------------------------------------------------------------

export async function getTeamMembers(): Promise<
  Omit<TeamMember, "effHrsPerWeek" | "totalHrs" | "holidayHrs" | "netHrs">[]
> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.teamMember.findMany({
    where: { workspaceId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    role: row.role,
    location: row.location as Country,
    stream: row.stream as TeamStream,
    ftPt: row.ftPt as FtPt,
    hrsPerWeek: row.hrsPerWeek,
    allocation: row.allocation,
    pod: row.pod,
  }));
}

// ---------------------------------------------------------------------------
// Stories (project-wide, not sprint-scoped)
// ---------------------------------------------------------------------------

export async function getStories(): Promise<
  (Omit<Story, "isExcluded"> & { sheetRow: number | null })[]
> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.story.findMany({
    where: { workspaceId },
    orderBy: { key: "asc" },
  });
  return rows.map((row) => ({
    key: row.key,
    summary: row.summary,
    status: row.status,
    storyPoints: row.storyPoints,
    pod: row.pod,
    dependency: row.dependency,
    stream: row.stream as BacklogStream,
    sheetRow: row.sheetRow,
  }));
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

export async function getPublicHolidays(): Promise<PublicHoliday[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.publicHoliday.findMany({
    where: { workspaceId },
    orderBy: { date: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name,
    country: row.country as Country,
    sprint: row.sprint,
    days: row.days,
  }));
}

export async function getProjectHolidays(): Promise<ProjectHoliday[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.projectHoliday.findMany({
    where: { workspaceId },
    orderBy: { date: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name,
    sprint: row.sprint,
    days: row.days,
  }));
}

// ---------------------------------------------------------------------------
// PTO
// ---------------------------------------------------------------------------

export async function getPtoEntries(): Promise<PtoEntry[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.ptoEntry.findMany({
    where: { workspaceId },
    orderBy: { startDate: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    who: row.who,
    location: row.location,
    team: row.team,
    startDate: row.startDate,
    endDate: row.endDate,
  }));
}

export async function insertPtoEntry(entry: Omit<PtoEntry, "id">): Promise<PtoEntry> {
  const workspaceId = await getCurrentWorkspaceId();
  const created = await prisma.ptoEntry.create({
    data: {
      workspaceId,
      who: entry.who,
      location: entry.location,
      team: entry.team ?? null,
      startDate: entry.startDate,
      endDate: entry.endDate,
    },
  });
  return {
    id: created.id,
    who: created.who,
    location: created.location,
    team: created.team,
    startDate: created.startDate,
    endDate: created.endDate,
  };
}

export async function updatePtoEntry(
  id: string,
  fields: Partial<Omit<PtoEntry, "id">>,
): Promise<PtoEntry | null> {
  const workspaceId = await getCurrentWorkspaceId();
  const existing = await prisma.ptoEntry.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;

  const updated = await prisma.ptoEntry.update({
    where: { id },
    data: {
      who: fields.who ?? existing.who,
      location: fields.location ?? existing.location,
      team: fields.team !== undefined ? fields.team : existing.team,
      startDate: fields.startDate ?? existing.startDate,
      endDate: fields.endDate ?? existing.endDate,
    },
  });
  return {
    id: updated.id,
    who: updated.who,
    location: updated.location,
    team: updated.team,
    startDate: updated.startDate,
    endDate: updated.endDate,
  };
}

export async function deletePtoEntry(id: string): Promise<boolean> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await prisma.ptoEntry.deleteMany({ where: { id, workspaceId } });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Initial capacities (allocations)
// ---------------------------------------------------------------------------

export async function getInitialCapacities(): Promise<InitialCapacity[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.initialCapacity.findMany({
    where: { workspaceId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    role: row.role,
    location: (row.location || "") as Country,
    organization: row.organization ?? "",
    stream: row.stream ?? "",
    ftPt: row.ftPt as FtPt,
    hrsPerWeek: row.hrsPerWeek,
    isActive: row.isActive,
    refinement: row.refinement,
    design: row.design,
    development: row.development,
    qa: row.qa,
    kt: row.kt,
    lead: row.lead,
    pmo: row.pmo,
    retrofits: row.retrofits ?? 0,
    ocmComms: row.ocmComms ?? 0,
    ocmTraining: row.ocmTraining ?? 0,
    other: row.other,
  }));
}

export async function insertInitialCapacity(
  entry: Omit<InitialCapacity, "id">,
): Promise<InitialCapacity> {
  const workspaceId = await getCurrentWorkspaceId();
  const created = await prisma.initialCapacity.create({
    data: {
      workspaceId,
      lastName: entry.lastName,
      firstName: entry.firstName,
      role: entry.role,
      location: entry.location,
      organization: entry.organization ?? "",
      stream: entry.stream ?? "",
      ftPt: entry.ftPt,
      hrsPerWeek: entry.hrsPerWeek,
      isActive: entry.isActive,
      refinement: entry.refinement,
      design: entry.design,
      development: entry.development,
      qa: entry.qa,
      kt: entry.kt,
      lead: entry.lead,
      pmo: entry.pmo,
      retrofits: entry.retrofits ?? 0,
      ocmComms: entry.ocmComms ?? 0,
      ocmTraining: entry.ocmTraining ?? 0,
      other: entry.other,
    },
  });
  return { ...entry, id: created.id };
}

export async function updateInitialCapacity(
  id: string,
  updates: Partial<Omit<InitialCapacity, "id">>,
): Promise<boolean> {
  const workspaceId = await getCurrentWorkspaceId();
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) data[key] = value;
  }
  if (Object.keys(data).length === 0) return false;

  const result = await prisma.initialCapacity.updateMany({
    where: { id, workspaceId },
    data,
  });
  return result.count > 0;
}

export async function deleteInitialCapacity(id: string): Promise<boolean> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await prisma.initialCapacity.deleteMany({
    where: { id, workspaceId },
  });
  return result.count > 0;
}

export async function deleteAllInitialCapacities(): Promise<number> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await prisma.initialCapacity.deleteMany({ where: { workspaceId } });
  return result.count;
}

// ---------------------------------------------------------------------------
// Guide entries (glossary)
// ---------------------------------------------------------------------------

export async function getGuideEntries(): Promise<GuideEntry[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.guideEntry.findMany({
    where: { workspaceId },
    orderBy: [{ section: "asc" }, { term: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    term: row.term,
    defaultVal: row.defaultVal,
    description: row.description,
  }));
}

// ---------------------------------------------------------------------------
// SprintStory (per-sprint imported backlog)
// ---------------------------------------------------------------------------

export async function getStoriesBySprint(
  sprintId: string,
): Promise<Omit<SprintStory, "isExcluded">[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.sprintStory.findMany({
    where: { sprintId, workspaceId },
    orderBy: { key: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    sprintId: row.sprintId,
    key: row.key,
    summary: row.summary,
    status: row.status,
    storyPoints: row.storyPoints,
    pod: row.pod,
    dependency: row.dependency,
    stream: row.stream as BacklogStream,
    groupName: row.groupName,
    importedAt: typeof row.importedAt === "string"
      ? row.importedAt
      : row.importedAt.toISOString(),
  }));
}

export async function getBacklogFreshness(): Promise<
  Record<string, { count: number; lastImportedAt: string | null }>
> {
  const workspaceId = await getCurrentWorkspaceId();
  const rows = await prisma.sprintStory.groupBy({
    by: ["sprintId"],
    where: { workspaceId },
    _count: { _all: true },
    _max: { importedAt: true },
  });
  const result: Record<string, { count: number; lastImportedAt: string | null }> = {};
  for (const row of rows) {
    result[row.sprintId] = {
      count: row._count._all,
      lastImportedAt: row._max.importedAt
        ? typeof row._max.importedAt === "string"
          ? row._max.importedAt
          : row._max.importedAt.toISOString()
        : null,
    };
  }
  return result;
}

export async function sprintHasStories(sprintId: string): Promise<boolean> {
  const workspaceId = await getCurrentWorkspaceId();
  const count = await prisma.sprintStory.count({
    where: { sprintId, workspaceId },
  });
  return count > 0;
}

/**
 * Replace all stories for a sprint atomically. Core of the import /
 * re-import flow — the entire delete + bulk-insert runs inside one
 * transaction so a partial failure leaves the sprint untouched.
 */
export async function replaceStoriesForSprint(
  sprintId: string,
  stories: {
    key: string;
    summary: string;
    status: string;
    storyPoints: number | null;
    pod: string | null;
    dependency: string | null;
    stream: string;
    groupName: string | null;
  }[],
): Promise<{ inserted: number; deleted: number }> {
  const workspaceId = await getCurrentWorkspaceId();

  return prisma.$transaction(async (tx) => {
    const del = await tx.sprintStory.deleteMany({
      where: { sprintId, workspaceId },
    });

    if (stories.length === 0) {
      return { inserted: 0, deleted: del.count };
    }

    const created = await tx.sprintStory.createMany({
      data: stories.map((s) => ({
        workspaceId,
        sprintId,
        key: s.key,
        summary: s.summary,
        status: s.status,
        storyPoints: s.storyPoints,
        pod: s.pod,
        dependency: s.dependency,
        stream: s.stream,
        groupName: s.groupName,
      })),
    });

    return { inserted: created.count, deleted: del.count };
  });
}
