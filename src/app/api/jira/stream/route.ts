import { NextRequest, NextResponse } from "next/server";

import { fetchBoardIssues } from "@/lib/jira/client";
import { computeStreamFromFilters } from "@/lib/jira/flow-metrics";
import { saveStreamSnapshot } from "@/lib/jira/snapshots";
import {
  METRICS,
  STORY_POINTS_FIELD,
  DEFAULT_WINDOW_DAYS,
} from "@/lib/jira/constants";

// Always live — never cache the Jira pull.
export const dynamic = "force-dynamic";

/** GET /api/jira/stream?window=7 — the four stream-transition metrics.
 *  Each metric is counted directly from its saved Jira filter, so the numbers
 *  match the filter's CSV export exactly. */
export async function GET(request: NextRequest) {
  const windowDays =
    parseInt(request.nextUrl.searchParams.get("window") ?? "", 10) ||
    DEFAULT_WINDOW_DAYS;
  try {
    const issuesByMetric = await Promise.all(
      METRICS.map((m) => fetchBoardIssues(`filter = ${m.filterId}`, `,${STORY_POINTS_FIELD}`)),
    );
    const result = computeStreamFromFilters(issuesByMetric, windowDays);
    const takenAt = new Date().toISOString();
    saveStreamSnapshot(result, takenAt);
    return NextResponse.json({ ...result, takenAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
