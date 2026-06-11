/**
 * Capture one Stream-transitions snapshot — standalone, no dev server needed.
 *
 * Fetches the live data from Jira, computes the four metrics, and writes a
 * StreamSnapshot row to the local SQLite DB. Meant to run on a schedule
 * (Thursday 10:00 AM Toronto time) so the Transitions weekly trend has a clean
 * one-point-per-week series.
 *
 *   npx tsx scripts/capture-stream-snapshot.ts
 */
import "dotenv/config";

import { fetchBoardIssues } from "../src/lib/jira/client";
import { computeStream } from "../src/lib/jira/flow-metrics";
import { saveStreamSnapshot } from "../src/lib/jira/snapshots";
import {
  STREAM_JQL,
  STORY_POINTS_FIELD,
  DEFAULT_WINDOW_DAYS,
} from "../src/lib/jira/constants";

async function main() {
  const issues = await fetchBoardIssues(STREAM_JQL, `,${STORY_POINTS_FIELD}`);
  const result = computeStream(issues, DEFAULT_WINDOW_DAYS);
  const takenAt = new Date().toISOString();
  saveStreamSnapshot(result, takenAt);
  console.log(
    `[${takenAt}] Stream snapshot saved — counts=[${result.counts}] points=[${result.points}] unclassified=${result.unclassified}`,
  );
}

main().catch((err) => {
  console.error("Stream snapshot capture failed:", err);
  process.exit(1);
});
