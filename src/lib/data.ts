/**
 * Data access layer for the capacity planning app.
 *
 * Uses better-sqlite3 directly (instead of Prisma) to avoid ESM
 * compatibility issues with Prisma 7. All queries are read-only.
 */

import Database from "better-sqlite3";
import path from "path";

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
// Database singleton
// ---------------------------------------------------------------------------

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Row types (what SQLite actually returns before we map to domain types)
// ---------------------------------------------------------------------------

interface SprintRow {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  durationWeeks: number;
  workingDays: number;
  focusFactor: number;
  velocityProven: number | null;
  velocityTarget: number | null;
  isCurrent: number; // SQLite stores booleans as 0/1
  storyCount: number | null;
  storyPoints: number | null;
  commitmentSP: number | null;
  completedSP: number | null;
}

interface TeamMemberRow {
  id: string;
  lastName: string;
  firstName: string;
  role: string;
  location: string;
  stream: string;
  ftPt: string;
  hrsPerWeek: number;
  allocation: number;
  pod: string | null;
  sheetRow: number | null;
}

interface StoryRow {
  key: string;
  summary: string;
  status: string;
  storyPoints: number | null;
  pod: string | null;
  dependency: string | null;
  stream: string;
  sheetRow: number | null;
}

interface PublicHolidayRow {
  id: string;
  date: string;
  name: string;
  country: string;
  sprint: string | null;
  days: number;
}

interface ProjectHolidayRow {
  id: string;
  date: string;
  name: string;
  sprint: string | null;
  days: number;
}

interface PtoEntryRow {
  id: string;
  who: string;
  location: string;
  team: string | null;
  startDate: string;
  endDate: string;
}

interface InitialCapacityRow {
  id: string;
  lastName: string;
  firstName: string;
  role: string;
  location: string;
  organization: string;
  stream: string;
  ftPt: string;
  hrsPerWeek: number;
  isActive: number; // SQLite stores booleans as 0/1
  refinement: number;
  design: number;
  development: number;
  qa: number;
  kt: number;
  lead: number;
  pmo: number;
  retrofits: number;
  ocmComms: number;
  ocmTraining: number;
  other: number;
}

interface SprintStoryRow {
  id: string;
  sprintId: string;
  key: string;
  summary: string;
  status: string;
  storyPoints: number | null;
  pod: string | null;
  dependency: string | null;
  stream: string;
  groupName: string | null;
  importedAt: string;
}

interface GuideEntryRow {
  id: string;
  section: string;
  term: string;
  defaultVal: string | null;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Guide entry type (not defined in src/types/index.ts)
// ---------------------------------------------------------------------------

export interface GuideEntry {
  id: string;
  section: string;
  term: string;
  defaultVal: string | null;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Sprint natural sort key
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

/** Natural comparison for two sprint names. */
function compareSprintNames(a: string, b: string): number {
  const [aMaj, aSub] = sprintSortKey(a);
  const [bMaj, bSub] = sprintSortKey(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  return aSub - bSub;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapSprint(
  row: SprintRow,
  status: SprintStatus = "future",
  isActive: boolean = false
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
    isCurrent: row.isCurrent === 1,
    status,
    isActive,
    storyCount: row.storyCount,
    storyPoints: row.storyPoints,
    commitmentSP: row.commitmentSP,
    completedSP: row.completedSP,
  };
}

function mapTeamMember(
  row: TeamMemberRow
): Omit<TeamMember, "effHrsPerWeek" | "totalHrs" | "holidayHrs" | "netHrs"> {
  return {
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
  };
}

function mapStory(row: StoryRow): Omit<Story, "isExcluded"> & { sheetRow: number | null } {
  return {
    key: row.key,
    summary: row.summary,
    status: row.status,
    storyPoints: row.storyPoints,
    pod: row.pod,
    dependency: row.dependency,
    stream: row.stream as BacklogStream,
    sheetRow: row.sheetRow,
  };
}

function mapPublicHoliday(row: PublicHolidayRow): PublicHoliday {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    country: row.country as Country,
    sprint: row.sprint,
    days: row.days,
  };
}

function mapProjectHoliday(row: ProjectHolidayRow): ProjectHoliday {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    sprint: row.sprint,
    days: row.days,
  };
}

function mapPtoEntry(row: PtoEntryRow): PtoEntry {
  return {
    id: row.id,
    who: row.who,
    location: row.location,
    team: row.team,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function mapInitialCapacity(row: InitialCapacityRow): InitialCapacity {
  return {
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    role: row.role,
    location: (row.location || "") as Country,
    organization: row.organization ?? "",
    stream: row.stream ?? "",
    ftPt: row.ftPt as FtPt,
    hrsPerWeek: row.hrsPerWeek,
    isActive: row.isActive !== 0,
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
  };
}

function mapGuideEntry(row: GuideEntryRow): GuideEntry {
  return {
    id: row.id,
    section: row.section,
    term: row.term,
    defaultVal: row.defaultVal,
    description: row.description,
  };
}

function mapSprintStory(row: SprintStoryRow): Omit<SprintStory, "isExcluded"> {
  return {
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
    importedAt: row.importedAt,
  };
}

// ---------------------------------------------------------------------------
// Public query functions
// ---------------------------------------------------------------------------

/** Return the sprint marked as current (isCurrent = 1). */
export async function getCurrentSprint(): Promise<Sprint | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM Sprint WHERE isCurrent = 1 LIMIT 1")
    .get() as SprintRow | undefined;
  return row ? mapSprint(row, "current", true) : null;
}

/**
 * Return all sprints sorted naturally (Sprint 0, 1, 2, …, 3-PD1, …, 12)
 * with computed status: past | previous | current | next | future.
 *
 * The active 4-sprint window is based on **main sprint numbers**:
 * if current is Sprint N, then previous = Sprint (N-1), next = Sprint (N+1),
 * and planning = Sprint (N+2).
 * "PD" sub-sprints (e.g. Sprint 3-PD1) inherit the status of their parent
 * main sprint number — e.g. Sprint 6-PD2 has major=6 so it gets the same
 * window status as Sprint 6.
 */
export async function getAllSprints(): Promise<Sprint[]> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM Sprint").all() as SprintRow[];

  // Sort naturally by sprint name
  rows.sort((a, b) => compareSprintNames(a.name, b.name));

  // Find the current sprint's major number
  const currentRow = rows.find((r) => r.isCurrent === 1);
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
        status = row.isCurrent === 1 ? "current" : "current";
        isActive = true;
      } else if (major === currentMajor + 1) {
        status = "next";
        isActive = true;
      } else if (major === currentMajor + 2) {
        status = "planning";
        isActive = true;
      } else {
        status = "future";
      }
    }

    // Override: the sprint flagged as current gets "current" status
    if (row.isCurrent === 1) {
      status = "current";
      isActive = true;
    }

    return mapSprint(row, status, isActive);
  });
}

/**
 * Update commitment/completed SP for a sprint.
 * Returns true if a row was updated.
 */
/** Create a new sprint with the given params. Returns the generated id. */
export function insertSprint(input: {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  durationWeeks?: number;
  workingDays?: number;
  focusFactor?: number;
  isCurrent?: boolean;
}): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO Sprint (id, name, startDate, endDate, durationWeeks, workingDays, focusFactor, isCurrent, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.startDate ?? null,
    input.endDate ?? null,
    input.durationWeeks ?? 4,
    input.workingDays ?? 20,
    input.focusFactor ?? 0.9,
    input.isCurrent ? 1 : 0,
    now,
    now,
  );
  return id;
}

/** Delete a sprint by id. Returns true when a row was removed. */
export function deleteSprint(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM Sprint WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updateSprintActuals(
  id: string,
  updates: { commitmentSP?: number | null; completedSP?: number | null }
): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.commitmentSP !== undefined) {
    fields.push("commitmentSP = ?");
    values.push(updates.commitmentSP);
  }
  if (updates.completedSP !== undefined) {
    fields.push("completedSP = ?");
    values.push(updates.completedSP);
  }

  if (fields.length === 0) return false;
  values.push(id);
  const result = db
    .prepare(`UPDATE Sprint SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

/** Return all team members. */
export async function getTeamMembers(): Promise<
  Omit<TeamMember, "effHrsPerWeek" | "totalHrs" | "holidayHrs" | "netHrs">[]
> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM TeamMember ORDER BY lastName, firstName")
    .all() as TeamMemberRow[];
  return rows.map(mapTeamMember);
}

/** Return all stories. */
export async function getStories(): Promise<
  (Omit<Story, "isExcluded"> & { sheetRow: number | null })[]
> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM Story ORDER BY key")
    .all() as StoryRow[];
  return rows.map(mapStory);
}

/** Return all public holidays. */
export async function getPublicHolidays(): Promise<PublicHoliday[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM PublicHoliday ORDER BY date")
    .all() as PublicHolidayRow[];
  return rows.map(mapPublicHoliday);
}

/** Return all project holidays. */
export async function getProjectHolidays(): Promise<ProjectHoliday[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ProjectHoliday ORDER BY date")
    .all() as ProjectHolidayRow[];
  return rows.map(mapProjectHoliday);
}

/** Return all PTO entries. */
export async function getPtoEntries(): Promise<PtoEntry[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM PtoEntry ORDER BY startDate")
    .all() as PtoEntryRow[];
  return rows.map(mapPtoEntry);
}

/** Return all initial capacity entries. */
export async function getInitialCapacities(): Promise<InitialCapacity[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM InitialCapacity ORDER BY lastName, firstName")
    .all() as InitialCapacityRow[];
  return rows.map(mapInitialCapacity);
}

/** Insert a new initial capacity entry. */
export function insertInitialCapacity(entry: Omit<InitialCapacity, "id">): InitialCapacity {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO InitialCapacity (id, lastName, firstName, role, location, organization, stream,
     ftPt, hrsPerWeek, isActive,
     refinement, design, development, qa, kt, lead, pmo, retrofits, ocmComms, ocmTraining, other)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, entry.lastName, entry.firstName, entry.role, entry.location,
    entry.organization ?? "", entry.stream ?? "",
    entry.ftPt, entry.hrsPerWeek, entry.isActive ? 1 : 0,
    entry.refinement, entry.design, entry.development, entry.qa,
    entry.kt, entry.lead, entry.pmo,
    entry.retrofits ?? 0, entry.ocmComms ?? 0, entry.ocmTraining ?? 0,
    entry.other,
  );
  return { id, ...entry };
}

/** Update an initial capacity entry. Returns true if a row was updated. */
export function updateInitialCapacity(id: string, updates: Partial<Omit<InitialCapacity, "id">>): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      // SQLite doesn't support JS booleans — convert to 0/1
      values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
  }

  if (fields.length === 0) return false;
  values.push(id);
  const result = db.prepare(`UPDATE InitialCapacity SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

/** Delete an initial capacity entry by id. Returns true if a row was deleted. */
export function deleteInitialCapacity(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM InitialCapacity WHERE id = ?").run(id);
  return result.changes > 0;
}

/** Delete all initial capacity entries. Returns the number of rows removed. */
export function deleteAllInitialCapacities(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM InitialCapacity").run();
  return result.changes;
}

/** Insert a new PTO entry. */
export function insertPtoEntry(entry: Omit<PtoEntry, "id">): PtoEntry {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO PtoEntry (id, who, location, team, startDate, endDate) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, entry.who, entry.location, entry.team ?? null, entry.startDate, entry.endDate);
  return { id, ...entry };
}

/** Update a PTO entry. Returns the updated entry or null if not found. */
export function updatePtoEntry(
  id: string,
  fields: Partial<Omit<PtoEntry, "id">>,
): PtoEntry | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM PtoEntry WHERE id = ?")
    .get(id) as PtoEntry | undefined;
  if (!existing) return null;

  const updated = { ...existing, ...fields };
  db.prepare(
    "UPDATE PtoEntry SET who = ?, location = ?, team = ?, startDate = ?, endDate = ? WHERE id = ?",
  ).run(
    updated.who,
    updated.location,
    updated.team ?? null,
    updated.startDate,
    updated.endDate,
    id,
  );
  return updated;
}

/** Delete a PTO entry by id. Returns true if a row was deleted. */
export function deletePtoEntry(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM PtoEntry WHERE id = ?").run(id);
  return result.changes > 0;
}

/** Return all guide / glossary entries. */
export async function getGuideEntries(): Promise<GuideEntry[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM GuideEntry ORDER BY section, term")
    .all() as GuideEntryRow[];
  return rows.map(mapGuideEntry);
}

// ---------------------------------------------------------------------------
// SprintStory (per-sprint backlog)
// ---------------------------------------------------------------------------

/** Return all stories for a given sprint. */
export async function getStoriesBySprint(
  sprintId: string
): Promise<Omit<SprintStory, "isExcluded">[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM SprintStory WHERE sprintId = ? ORDER BY key")
    .all(sprintId) as SprintStoryRow[];
  return rows.map(mapSprintStory);
}

/** Return the most recent importedAt date for each sprint. */
export function getBacklogFreshness(): Record<string, { count: number; lastImportedAt: string | null }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT sprintId, COUNT(*) as cnt, MAX(importedAt) as lastImportedAt
       FROM SprintStory GROUP BY sprintId`
    )
    .all() as { sprintId: string; cnt: number; lastImportedAt: string | null }[];

  const result: Record<string, { count: number; lastImportedAt: string | null }> = {};
  for (const row of rows) {
    result[row.sprintId] = { count: row.cnt, lastImportedAt: row.lastImportedAt };
  }
  return result;
}

/** Check if a sprint has any imported stories. */
export function sprintHasStories(sprintId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM SprintStory WHERE sprintId = ?")
    .get(sprintId) as { cnt: number };
  return row.cnt > 0;
}

/**
 * Replace all stories for a sprint (atomic delete + bulk insert).
 * This is the core of the import/re-import flow.
 */
export function replaceStoriesForSprint(
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
  }[]
): { inserted: number; deleted: number } {
  const db = getDb();
  const deleteStmt = db.prepare("DELETE FROM SprintStory WHERE sprintId = ?");
  const insertStmt = db.prepare(
    `INSERT INTO SprintStory (id, sprintId, key, summary, status, storyPoints, pod, dependency, stream, groupName, importedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  const tx = db.transaction(() => {
    const delResult = deleteStmt.run(sprintId);
    let count = 0;
    for (const s of stories) {
      insertStmt.run(
        crypto.randomUUID(),
        sprintId,
        s.key,
        s.summary,
        s.status,
        s.storyPoints,
        s.pod,
        s.dependency,
        s.stream,
        s.groupName
      );
      count++;
    }
    return { inserted: count, deleted: delResult.changes };
  });

  return tx();
}
