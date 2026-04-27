import { NextRequest, NextResponse } from "next/server";
import { parseJiraFile } from "@/lib/excel-import";
import { getAllSprints, getStoriesBySprint } from "@/lib/data";

const ACCEPTED_EXTENSIONS = [".csv"];

function normaliseSprintName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitSprintValues(raw: string): string[] {
  return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Diff a CSV against the current per-sprint scope without writing anything.
 *
 * Body: multipart/form-data { file: CSV, sprintId: string }
 *
 * The CSV is filtered to rows whose Sprint column references the target
 * sprint by name (any of the sprint values in the cell counts as a match —
 * a story may be tagged with several sprints in Jira). The kept rows are
 * compared 1:1 against the stored SprintStory rows for that sprint.
 *
 * Response shape:
 *   matched:       count of stories in both, with no field changes
 *   added:         in CSV but not in DB
 *   removed:       in DB but not in CSV (would be deleted on apply)
 *   changed:       in both, but at least one of {summary, status, storyPoints,
 *                  pod, dependency, stream, groupName} differs
 *   ignoredRows:   CSV rows that don't reference this sprint (info only)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sprintId = formData.get("sprintId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!sprintId) {
      return NextResponse.json({ error: "sprintId is required" }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return NextResponse.json(
        { error: `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}` },
        { status: 400 },
      );
    }

    const allSprints = await getAllSprints();
    const target = allSprints.find((s) => s.id === sprintId);
    if (!target) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }
    const targetName = normaliseSprintName(target.name);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { stories, errors, detectedColumns } = await parseJiraFile(buffer, file.name);

    if (stories.length === 0) {
      return NextResponse.json(
        { error: "No stories found in file", details: errors, detectedColumns },
        { status: 400 },
      );
    }

    // Keep CSV rows that reference this sprint anywhere in their Sprint cell.
    const inScope: typeof stories = [];
    let ignoredRows = 0;
    for (const s of stories) {
      const raw = s.sprintRaw ?? "";
      const parts = splitSprintValues(raw).map(normaliseSprintName);
      if (parts.includes(targetName)) {
        inScope.push(s);
      } else {
        ignoredRows++;
      }
    }

    const existing = await getStoriesBySprint(sprintId);
    const existingByKey = new Map(existing.map((s) => [s.key, s]));
    const csvByKey = new Map(inScope.map((s) => [s.key, s]));

    const added: { key: string; summary: string; storyPoints: number | null; status: string }[] = [];
    const removed: { key: string; summary: string; storyPoints: number | null; status: string }[] = [];
    const changed: {
      key: string;
      summary: string;
      diffs: { field: string; before: unknown; after: unknown }[];
    }[] = [];
    let matched = 0;

    for (const csv of inScope) {
      const prev = existingByKey.get(csv.key);
      if (!prev) {
        added.push({
          key: csv.key,
          summary: csv.summary,
          storyPoints: csv.storyPoints,
          status: csv.status,
        });
        continue;
      }
      const diffs: { field: string; before: unknown; after: unknown }[] = [];
      const fields: { name: keyof typeof prev; csv: unknown }[] = [
        { name: "summary", csv: csv.summary },
        { name: "status", csv: csv.status },
        { name: "storyPoints", csv: csv.storyPoints },
        { name: "pod", csv: csv.pod },
        { name: "dependency", csv: csv.dependency },
        { name: "stream", csv: csv.stream },
        { name: "groupName", csv: csv.groupName },
      ];
      for (const f of fields) {
        const before = prev[f.name] ?? null;
        const after = f.csv ?? null;
        if (before !== after) {
          diffs.push({ field: f.name as string, before, after });
        }
      }
      if (diffs.length === 0) {
        matched++;
      } else {
        changed.push({ key: csv.key, summary: csv.summary, diffs });
      }
    }

    for (const prev of existing) {
      if (!csvByKey.has(prev.key)) {
        removed.push({
          key: prev.key,
          summary: prev.summary,
          storyPoints: prev.storyPoints,
          status: prev.status,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      sprintId,
      sprintName: target.name,
      totals: {
        csvRows: stories.length,
        inScope: inScope.length,
        ignoredRows,
        existing: existing.length,
        matched,
        added: added.length,
        removed: removed.length,
        changed: changed.length,
      },
      added,
      removed,
      changed,
      warnings: errors,
      detectedColumns,
    });
  } catch (err) {
    console.error("Backlog reconcile error:", err);
    return NextResponse.json(
      { error: "Failed to reconcile backlog", details: String(err) },
      { status: 500 },
    );
  }
}
