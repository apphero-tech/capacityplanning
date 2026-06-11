import { NextRequest, NextResponse } from "next/server";

import { fetchBoardIssues, fetchSprintIssues } from "@/lib/jira/client";
import { computeStream, computeAging } from "@/lib/jira/flow-metrics";
import {
  STREAM_JQL,
  STREAM_LABELS,
  STORY_POINTS_FIELD,
  DEFAULT_WINDOW_DAYS,
  DEFAULT_AGING_THRESHOLD,
  defaultSprintId,
  SPRINTS,
} from "@/lib/jira/constants";

export const dynamic = "force-dynamic";

/** Quote a CSV cell (RFC 4180). */
function csv(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/jira/export?sprintId=376 — weekly SteerCo CSV: the four stream
 * metrics, then per-story aging + blockers for the sprint.
 */
export async function GET(request: NextRequest) {
  const sprintId =
    parseInt(request.nextUrl.searchParams.get("sprintId") ?? "", 10) ||
    defaultSprintId(new Date().toISOString().slice(0, 10));
  const sprintName = SPRINTS.find((s) => s.id === sprintId)?.name ?? String(sprintId);

  try {
    const [streamIssues, sprintIssues] = await Promise.all([
      fetchBoardIssues(STREAM_JQL, `,${STORY_POINTS_FIELD}`),
      fetchSprintIssues(sprintId),
    ]);
    const stream = computeStream(streamIssues, DEFAULT_WINDOW_DAYS);
    const aging = computeAging(sprintIssues, DEFAULT_AGING_THRESHOLD);
    const takenAt = new Date().toISOString();

    const lines: string[] = [];
    lines.push(`SteerCo flow report,${csv(sprintName)},${takenAt}`);
    lines.push("");
    lines.push(`Stream transitions (last ${stream.windowDays}d)`);
    lines.push("Metric,Stories,Story points");
    STREAM_LABELS.forEach((label, i) => {
      lines.push(`${csv(label)},${stream.counts[i]},${stream.points[i]}`);
    });
    lines.push("");
    lines.push(`Status aging (sprint ${csv(sprintName)}, stale >= ${aging.threshold}d)`);
    lines.push("Key,Track,Pod,Stream,Summary,Current status,In status since,Days,Late,Blocked,Blocked by");
    aging.rows.forEach((r) => {
      const blocked =
        r.blockedState === "yes" ? (r.blockedLabels.join(" / ") || "Blocked")
        : r.blockedState === "other" ? r.blockedLabels.join(" / ")
        : r.blockedState === "no" ? "No" : "—";
      const blockers = r.blockers
        .map((b) => `${b.key} (${b.status})${b.done ? " [done]" : ""}`)
        .join(" / ");
      const late = !r.isDemo && r.days !== null && aging.threshold > 0 && r.days >= aging.threshold;
      lines.push([
        csv(r.key), csv(r.track), csv(r.pod ?? "—"), csv(r.stream), csv(r.summary), csv(r.status),
        csv(r.enteredAt ? r.enteredAt.slice(0, 16).replace("T", " ") : "—"),
        r.days === null ? "—" : Math.floor(r.days),
        late ? "yes" : "no",
        csv(blocked), csv(blockers),
      ].join(","));
    });

    const filename = `steerco-flow-${sprintName.replace(/[^\w]+/g, "-")}-${takenAt.slice(0, 10)}.csv`;
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
