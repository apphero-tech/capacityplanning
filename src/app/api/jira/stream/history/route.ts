import { NextResponse } from "next/server";

import { getStreamHistory } from "@/lib/jira/snapshots";

export const dynamic = "force-dynamic";

/** GET /api/jira/stream/history — accumulated stream snapshots, oldest→newest. */
export async function GET() {
  try {
    return NextResponse.json({ history: getStreamHistory() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
