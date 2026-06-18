/**
 * Backfill the Aging trend with historical data.
 *
 * The /flow Aging trend is built from snapshots, and capture only began on
 * 2026-06-11 — so the chart has no points before that. This script fetches a
 * sprint's issues (with changelog) from Jira and reconstructs, for each past
 * day, what the stale/blocked counts *would* have been (see computeAgingAt),
 * writing one AgingSnapshot per day. Days that already have a real snapshot are
 * left untouched, so live captures always win.
 *
 * Usage:
 *   npx tsx scripts/backfill-aging-history.ts                 # default sprint, 30 days back
 *   npx tsx scripts/backfill-aging-history.ts --sprint=378 --days=45
 *   npx tsx scripts/backfill-aging-history.ts --threshold=3 --force
 *
 * Re-runnable: without --force it skips any day that already has a snapshot.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";

import { fetchSprintIssues } from "../src/lib/jira/client";
import { computeAgingAt } from "../src/lib/jira/flow-metrics";
import { saveAgingSnapshot } from "../src/lib/jira/snapshots";
import { DEFAULT_AGING_THRESHOLD, defaultSprintId } from "../src/lib/jira/constants";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

/** UTC date string (YYYY-MM-DD) for `daysAgo` days before today. */
function dayString(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const sprintId = Number(arg("sprint")) || defaultSprintId(today);
  const daysBack = Number(arg("days")) || 30;
  const threshold = Number(arg("threshold")) || DEFAULT_AGING_THRESHOLD;
  const force = hasFlag("force");

  console.log(
    `Backfilling Aging history — sprint ${sprintId}, ${daysBack} days back, threshold ${threshold}${force ? " (force)" : ""}`,
  );

  // Days that already have a snapshot (skip unless --force).
  const db = new Database(path.join(process.cwd(), "prisma/dev.db"), { readonly: true });
  const existing = new Set(
    (
      db
        .prepare("SELECT DISTINCT substr(takenAt,1,10) AS day FROM AgingSnapshot WHERE sprintId = ?")
        .all(sprintId) as { day: string }[]
    ).map((r) => r.day),
  );
  db.close();
  console.log(`  ${existing.size} day(s) already captured: ${[...existing].sort().join(", ") || "none"}`);

  console.log(`  Fetching sprint ${sprintId} issues from Jira…`);
  const issues = await fetchSprintIssues(sprintId);
  console.log(`  ${issues.length} issues fetched.`);

  let written = 0;
  let skipped = 0;
  // Oldest → newest so the table reads chronologically.
  for (let d = daysBack; d >= 0; d--) {
    const day = dayString(d);
    if (!force && existing.has(day)) { skipped++; continue; }
    // End-of-day snapshot: captures every transition that happened that day.
    const takenAt = `${day}T23:59:59.000Z`;
    const atMs = new Date(takenAt).getTime();
    const result = computeAgingAt(issues, threshold, atMs);
    saveAgingSnapshot(result, sprintId, takenAt);
    written++;
    console.log(
      `  + ${day}  on-flow ${result.rows.length}  stale ${result.staleCount}  blocked ${result.blockedCount}`,
    );
  }

  console.log(`\nDone. ${written} day(s) backfilled, ${skipped} skipped (already captured).`);
}

main().catch((e) => {
  console.error("\nBackfill failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
