import { NextRequest, NextResponse } from "next/server";
import { differenceInBusinessDays, differenceInCalendarDays } from "date-fns";

import { fetchSprintIssues, fetchLatestComment } from "@/lib/jira/client";
import { computeAging } from "@/lib/jira/flow-metrics";
import { saveAgingSnapshot } from "@/lib/jira/snapshots";
import { DEFAULT_AGING_THRESHOLD, defaultSprintId } from "@/lib/jira/constants";

export const dynamic = "force-dynamic";

/** GET /api/jira/aging?sprintId=376&threshold=5 — status aging for a sprint. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sprintId =
    parseInt(params.get("sprintId") ?? "", 10) ||
    defaultSprintId(new Date().toISOString().slice(0, 10));
  const parsedThreshold = parseFloat(params.get("threshold") ?? "");
  const threshold = Number.isFinite(parsedThreshold) ? parsedThreshold : DEFAULT_AGING_THRESHOLD;
  try {
    const issues = await fetchSprintIssues(sprintId);
    const result = computeAging(issues, threshold);

    const now = new Date();
    // Activity = the most recent of {comment, status change, assignee change}.
    // Moves come free from the changelog (computeAging set lastMoveAt) so every
    // story gets a baseline; comments refine it for the stale report subset.
    const setActivity = (r: (typeof result.rows)[number], iso: string | null) => {
      if (!iso) { r.daysSinceActivity = null; r.recentlyActive = false; return; }
      const d = new Date(iso);
      r.daysSinceActivity = differenceInBusinessDays(now, d);
      r.recentlyActive = differenceInCalendarDays(now, d) === 0; // active TODAY at minimum
    };
    result.rows.forEach((r) => { if (!r.isDemo) setActivity(r, r.lastMoveAt); });

    // Pull the latest comment for the report subset (aged ≥ threshold): a comment
    // can be newer than the last move, and we want its text for the message.
    const targets = result.rows.filter(
      (r) => !r.isDemo && r.days !== null && r.days >= Math.max(threshold, 1),
    );
    const BATCH = 10;
    for (let i = 0; i < targets.length; i += BATCH) {
      await Promise.all(
        targets.slice(i, i + BATCH).map(async (r) => {
          const c = await fetchLatestComment(r.key).catch(() => null);
          r.lastCommentAt = c?.created ?? null;
          r.lastCommentAuthor = c?.author ?? null;
          r.lastCommentText = c?.text ?? null;
          // Activity = the most recent of last move and last comment.
          const move = r.lastMoveAt ? new Date(r.lastMoveAt).getTime() : 0;
          const comment = c ? new Date(c.created).getTime() : 0;
          const latest = Math.max(move, comment);
          setActivity(r, latest > 0 ? new Date(latest).toISOString() : null);
        }),
      );
    }

    const takenAt = new Date().toISOString();
    saveAgingSnapshot(result, sprintId, takenAt);
    return NextResponse.json({ ...result, sprintId, takenAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
