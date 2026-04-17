import { NextRequest, NextResponse } from "next/server";
import { parseJiraFile } from "@/lib/excel-import";
import { getAllSprints, replaceStoriesForSprint } from "@/lib/data";

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
    const sprintByName = new Map<string, { id: string; name: string }>();
    for (const sp of allSprints) {
      sprintByName.set(normaliseSprintName(sp.name), { id: sp.id, name: sp.name });
    }

    const grouped = new Map<string, { sprintName: string; rows: typeof stories }>();
    const noSprintByStatus = new Map<string, number>();
    const unknownSprintCounts = new Map<string, number>();
    let storiesWithSprint = 0;

    for (const s of stories) {
      const raw = s.sprintRaw ?? "";
      const target = raw ? pickLatestSprint(raw) : null;

      if (!target) {
        noSprintByStatus.set(s.status, (noSprintByStatus.get(s.status) ?? 0) + 1);
        continue;
      }

      const match = sprintByName.get(normaliseSprintName(target));
      if (!match) {
        unknownSprintCounts.set(target, (unknownSprintCounts.get(target) ?? 0) + 1);
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
