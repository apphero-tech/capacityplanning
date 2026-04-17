import { NextRequest, NextResponse } from "next/server";
import { parseJiraFile } from "@/lib/excel-import";
import { getAllSprints, replaceStoriesForSprint } from "@/lib/data";

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

/**
 * Pick the "latest" sprint name from a multi-valued cell. Jira lists every
 * sprint a story has been planned for, so when a story has been carried over
 * the cell looks like "Sprint 4;Sprint 5" — the rightmost value is the
 * sprint where the story currently lives.
 */
function pickLatestSprint(raw: string): string | null {
  const parts = raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/**
 * Stories whose workflow has already passed DEV (order >= 40) are not counted
 * in the DEV-cycle backlog of their sprint — Jira itself drops them from the
 * per-sprint count on its board. We skip them at import time and report them
 * back as "post-DEV skipped" so the user sees why counts match the board.
 *
 * The threshold (statusOrder >= 40) was chosen per user spec: "DEV-Ready to
 * Deploy" is the moment the DEV cycle is considered complete.
 */
const POST_DEV_ORDER_THRESHOLD = 40;

/**
 * Sprints that Jira shows as "started" — their board includes every story
 * ever planned for the sprint, so we don't apply the post-DEV filter. Future
 * and past sprints get the filter because Jira only keeps the "still to do"
 * cycle-2 work on them.
 */
const SNAPSHOT_SPRINT_STATUSES = new Set(["current", "next"]);

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
    const allSprints = await getAllSprints();
    const sprintByName = new Map<string, { id: string; name: string; status: string }>();
    for (const sp of allSprints) {
      sprintByName.set(normaliseSprintName(sp.name), {
        id: sp.id,
        name: sp.name,
        status: sp.status,
      });
    }

    const grouped = new Map<string, { sprintName: string; rows: typeof stories }>();
    const noSprintByStatus = new Map<string, number>();
    const unknownSprintCounts = new Map<string, number>();
    const postDevSkippedByStatus = new Map<string, number>();
    const newStatusStories: { key: string; summary: string; sprint: string }[] = [];
    let storiesWithSprint = 0;

    for (const s of stories) {
      const order = orderFromPrefixedStatus(s.status);
      const raw = s.sprintRaw ?? "";
      const target = raw ? pickLatestSprint(raw) : null;

      // "New" is a placeholder status, not a real story state. Collect these
      // so the user can fix them in Jira, then skip.
      if (order === NEW_STATUS_ORDER) {
        newStatusStories.push({
          key: s.key,
          summary: s.summary,
          sprint: target ?? "(no sprint)",
        });
        continue;
      }

      if (!target) {
        noSprintByStatus.set(s.status, (noSprintByStatus.get(s.status) ?? 0) + 1);
        continue;
      }

      const match = sprintByName.get(normaliseSprintName(target));
      if (!match) {
        unknownSprintCounts.set(target, (unknownSprintCounts.get(target) ?? 0) + 1);
        continue;
      }

      // For non-active sprints, drop stories whose DEV cycle is already done —
      // Jira itself omits them from the board count. For current/next sprints,
      // Jira keeps the full snapshot, so we do too.
      const sprintIsSnapshot = SNAPSHOT_SPRINT_STATUSES.has(match.status);
      if (!sprintIsSnapshot && order >= POST_DEV_ORDER_THRESHOLD) {
        postDevSkippedByStatus.set(s.status, (postDevSkippedByStatus.get(s.status) ?? 0) + 1);
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
      perSprint: perSprint.sort((a, b) => a.sprintName.localeCompare(b.sprintName)),
      noSprintByStatus: Object.fromEntries(
        Array.from(noSprintByStatus.entries()).sort((a, b) => b[1] - a[1]),
      ),
      postDevSkippedByStatus: Object.fromEntries(
        Array.from(postDevSkippedByStatus.entries()).sort((a, b) => b[1] - a[1]),
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
