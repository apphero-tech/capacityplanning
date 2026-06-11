import { NextRequest, NextResponse } from "next/server";

import { fetchBoardIssues } from "@/lib/jira/client";
import { computeStream } from "@/lib/jira/flow-metrics";
import { saveStreamSnapshot } from "@/lib/jira/snapshots";
import {
  STREAM_JQL,
  STORY_POINTS_FIELD,
  DEFAULT_WINDOW_DAYS,
} from "@/lib/jira/constants";

// Always live — never cache the Jira pull.
export const dynamic = "force-dynamic";

/** GET /api/jira/stream?window=7 — the four stream-transition metrics. */
export async function GET(request: NextRequest) {
  const windowDays =
    parseInt(request.nextUrl.searchParams.get("window") ?? "", 10) ||
    DEFAULT_WINDOW_DAYS;
  try {
    const issues = await fetchBoardIssues(STREAM_JQL, `,${STORY_POINTS_FIELD}`);
    const result = computeStream(issues, windowDays);
    const takenAt = new Date().toISOString();
    saveStreamSnapshot(result, takenAt);
    return NextResponse.json({ ...result, takenAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
