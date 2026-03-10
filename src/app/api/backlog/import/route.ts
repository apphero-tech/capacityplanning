import { NextRequest, NextResponse } from "next/server";
import { parseJiraFile } from "@/lib/excel-import";
import { replaceStoriesForSprint } from "@/lib/data";

const ACCEPTED_EXTENSIONS = [".csv"];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sprintId = formData.get("sprintId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!sprintId) {
      return NextResponse.json(
        { error: "sprintId is required" },
        { status: 400 }
      );
    }

    // Validate file type
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
      sprintId,
      imported: inserted,
      replaced: deleted,
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
