import { NextRequest, NextResponse } from "next/server";
import { parseJiraFile } from "@/lib/excel-import";
import { getAllSprints, replaceStoriesForSprint, ensureBacklogSprint, BACKLOG_SPRINT_NAME } from "@/lib/data";

/** Extract the two-digit order prefix from a status already stamped by withOrderPrefix(). */
function orderFromPrefixedStatus(status: string): number {
  const m = status.match(/^(\d{2})-/);
  return m ? Number(m[1]) : 99;
}

const ACCEPTED_EXTENSIONS = [".csv"];

/** Normalise a sprint name for matching: lowercase, collapse whitespace. */
function normaliseSprintName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Split a raw Sprint cell (which may contain several sprint names) into trimmed, de-empty values. */
function splitSprintValues(raw: string): string[] {
  return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Pick the most-recent sprint from a multi-valued cell.
 *
 * Different Jira exports order the Sprint column differently: some list it
 * chronologically ("Sprint 4;Sprint 5"), others put the current sprint first
 * ("Sprint 7;Sprint 4;Sprint 5;Sprint 6"). Relying on position was wrong in
 * both worlds, so we now resolve each candidate against the known sprint
 * list and pick the one with the most recent `startDate` — that is always
 * the "where the story lives today" answer Jira's UI shows.
 *
 * Falls back to the first value when nothing matches any known sprint, so
 * the story still lands somewhere (gets routed to "Backlog (unassigned)").
 */
function pickCurrentSprintName(
  raw: string,
  sprintByName: Map<string, { id: string; name: string; status: string; startDate: string | null }>,
): string | null {
  const parts = splitSprintValues(raw);
  if (parts.length === 0) return null;

  let bestName: string | null = null;
  let bestDate: string = "";
  for (const part of parts) {
    const match = sprintByName.get(part.trim().toLowerCase().replace(/\s+/g, " "));
    if (!match) continue;
    const d = match.startDate ?? "";
    if (d > bestDate || (d === "" && bestName === null)) {
      bestDate = d;
      bestName = match.name;
    }
  }

  return bestName ?? parts[0];
}

/** Numeric order for the "New" status — not a valid user-story state. */
const NEW_STATUS_ORDER = 0;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sprintId = formData.get("sprintId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      return NextResponse.json(
        { error: `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { stories, errors, detectedColumns } = await parseJiraFile(buffer, file.name);

    if (stories.length === 0) {
      return NextResponse.json(
        {
          error: "No stories found in file",
          details: errors,
          detectedColumns,
        },
        { status: 400 }
      );
    }

    // ---- Mode 1: explicit sprint target -----------------------------------
    if (sprintId) {
      const { inserted, deleted } = replaceStoriesForSprint(
        sprintId,
        stories.map((s) => ({
          key: s.key,
          summary: s.summary,
          status: s.status,
          storyPoints: s.storyPoints,
          pod: s.pod,
          dependency: s.dependency,
          stream: s.stream,
          groupName: s.groupName,
        }))
      );
      return NextResponse.json({
        success: true,
        mode: "single",
        sprintId,
        imported: inserted,
        replaced: deleted,
        warnings: errors,
        detectedColumns,
      });
    }

    // ---- Mode 2: auto-split by Sprint column ------------------------------
    // Make sure the synthetic "Backlog (unassigned)" sprint exists before we
    // look up sprints, so stories with no / unknown Sprint value still land
    // somewhere and keep the total row count 1:1 with the CSV.
    const backlogSprintId = ensureBacklogSprint();
    const allSprints = await getAllSprints();
    const sprintByName = new Map<
      string,
      { id: string; name: string; status: string; startDate: string | null }
    >();
    for (const sp of allSprints) {
      sprintByName.set(normaliseSprintName(sp.name), {
        id: sp.id,
        name: sp.name,
        status: sp.status,
        startDate: sp.startDate,
      });
    }

    const grouped = new Map<string, { sprintName: string; rows: typeof stories }>();
    const noSprintByStatus = new Map<string, number>();
    const unknownSprintCounts = new Map<string, number>();
    const newStatusStories: { key: string; summary: string; sprint: string }[] = [];
    let storiesWithSprint = 0;
    let storiesToBacklog = 0;

    function pushToBacklog(s: typeof stories[number]) {
      storiesToBacklog++;
      const bucket = grouped.get(backlogSprintId) ?? {
        sprintName: BACKLOG_SPRINT_NAME,
        rows: [],
      };
      bucket.rows.push(s);
      grouped.set(backlogSprintId, bucket);
    }

    for (const s of stories) {
      const order = orderFromPrefixedStatus(s.status);
      const raw = s.sprintRaw ?? "";
      const target = raw ? pickCurrentSprintName(raw, sprintByName) : null;

      // "New" is a placeholder status, not a real story state. Collect these
      // so the user can fix them in Jira — but still store them under the
      // synthetic Backlog sprint so the CSV total matches the app total.
      if (order === NEW_STATUS_ORDER) {
        newStatusStories.push({
          key: s.key,
          summary: s.summary,
          sprint: target ?? "(no sprint)",
        });
        pushToBacklog(s);
        continue;
      }

      if (!target) {
        noSprintByStatus.set(s.status, (noSprintByStatus.get(s.status) ?? 0) + 1);
        pushToBacklog(s);
        continue;
      }

      const match = sprintByName.get(normaliseSprintName(target));
      if (!match) {
        unknownSprintCounts.set(target, (unknownSprintCounts.get(target) ?? 0) + 1);
        pushToBacklog(s);
        continue;
      }

      storiesWithSprint++;
      const bucket = grouped.get(match.id) ?? { sprintName: match.name, rows: [] };
      bucket.rows.push(s);
      grouped.set(match.id, bucket);
    }

    const perSprint: { sprintId: string; sprintName: string; imported: number; replaced: number }[] = [];
    for (const [id, { sprintName, rows }] of grouped) {
      const { inserted, deleted } = replaceStoriesForSprint(
        id,
        rows.map((s) => ({
          key: s.key,
          summary: s.summary,
          status: s.status,
          storyPoints: s.storyPoints,
          pod: s.pod,
          dependency: s.dependency,
          stream: s.stream,
          groupName: s.groupName,
        }))
      );
      perSprint.push({ sprintId: id, sprintName, imported: inserted, replaced: deleted });
    }

    return NextResponse.json({
      success: true,
      mode: "auto-split",
      totalRows: stories.length,
      assigned: storiesWithSprint,
      routedToBacklog: storiesToBacklog,
      perSprint: perSprint.sort((a, b) => a.sprintName.localeCompare(b.sprintName)),
      noSprintByStatus: Object.fromEntries(
        Array.from(noSprintByStatus.entries()).sort((a, b) => b[1] - a[1]),
      ),
      newStatusStories,
      unknownSprintCounts: Object.fromEntries(
        Array.from(unknownSprintCounts.entries()).sort((a, b) => b[1] - a[1]),
      ),
      warnings: errors,
      detectedColumns,
    });
  } catch (err) {
    console.error("Backlog import error:", err);
    return NextResponse.json(
      { error: "Failed to import backlog", details: String(err) },
      { status: 500 }
    );
  }
}
