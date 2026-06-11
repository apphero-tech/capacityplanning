import { NextRequest, NextResponse } from "next/server";

import { getAgingHistory } from "@/lib/jira/snapshots";
import { defaultSprintId } from "@/lib/jira/constants";

export const dynamic = "force-dynamic";

/** GET /api/jira/aging/history?sprintId=376 — aging snapshots for a sprint. */
export async function GET(request: NextRequest) {
  const sprintId =
    parseInt(request.nextUrl.searchParams.get("sprintId") ?? "", 10) ||
    defaultSprintId(new Date().toISOString().slice(0, 10));
  try {
    return NextResponse.json({ sprintId, history: getAgingHistory(sprintId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
