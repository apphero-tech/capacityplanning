/**
 * Backfill the Transitions weekly trend from the Jira changelog.
 *
 * The trend plots one point per Thursday 10:00 (America/Toronto), each = the
 * stream transitions in the 7 days ending that Thursday. Snapshot capture only
 * started recently, so reconstruct past Thursdays from the changelog and write
 * one StreamSnapshot per missing Thursday. Re-runnable; skips days already
 * captured (--force to override). Local Jira read; writes prisma/dev.db.
 *
 * Usage: npx tsx scripts/backfill-stream-history.ts [--weeks=12] [--force]
 */
import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";

import { fetchBoardIssues } from "../src/lib/jira/client";
import { saveStreamSnapshot } from "../src/lib/jira/snapshots";
import { METRICS, STREAM_RULES, STORY_POINTS_FIELD, STREAM_FLOW } from "../src/lib/jira/constants";
import type { StreamResult } from "../src/lib/jira/flow-metrics";

const DAY = 86_400_000;

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}
const hasFlag = (n: string) => process.argv.includes(`--${n}`);

/** Thursday 10:00 America/Toronto as UTC. EDT (−4) holds for the whole
 *  backfill range (Mar 9 – Nov 1 2026), so 10:00 ET = 14:00 UTC. */
function thursdayInstants(weeks: number): Date[] {
  const d = new Date();
  d.setUTCHours(14, 0, 0, 0);
  const diff = (d.getUTCDay() - 4 + 7) % 7; // days since Thursday
  d.setUTCDate(d.getUTCDate() - diff);
  if (d.getTime() > Date.now()) d.setUTCDate(d.getUTCDate() - 7);
  const out: Date[] = [];
  for (let w = weeks - 1; w >= 0; w--) out.push(new Date(d.getTime() - w * 7 * DAY));
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function storyPoints(iss: any): number {
  const v = (iss.fields ?? {})[STORY_POINTS_FIELD];
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/** Transitions per metric within (startMs, endMs], from the changelog. */
function countWindow(issues: any[], startMs: number, endMs: number) {
  const counts = METRICS.map(() => new Set<string>());
  const points = METRICS.map(() => 0);
  for (const iss of issues) {
    const sp = storyPoints(iss);
    const seen = new Set<number>();
    for (const h of iss.changelog?.histories ?? []) {
      const t = new Date(h.created).getTime();
      if (t <= startMs || t > endMs) continue;
      for (const it of h.items ?? []) {
        if (String(it.field ?? it.fieldId ?? "").toLowerCase() !== "status") continue;
        STREAM_RULES.forEach((rule, mi) => {
          if (rule(it) && !seen.has(mi)) {
            counts[mi].add(iss.key ?? "");
            points[mi] += sp;
            seen.add(mi);
          }
        });
      }
    }
  }
  return { counts: counts.map((s) => s.size), points };
}

async function main() {
  const weeks = Number(arg("weeks")) || 12;
  const force = hasFlag("force");
  console.log(`Backfilling Transitions weekly trend — ${weeks} Thursdays${force ? " (force)" : ""}`);

  const db = new Database(path.join(process.cwd(), "prisma/dev.db"), { readonly: true });
  const existing = new Set(
    (db.prepare("SELECT DISTINCT substr(takenAt,1,10) AS d FROM StreamSnapshot").all() as { d: string }[]).map((r) => r.d),
  );
  db.close();

  // Every Story whose status changed in the window, with full changelog.
  const days = weeks * 7 + 10;
  console.log(`  Fetching issues (status changed after -${days}d)…`);
  const issues = await fetchBoardIssues(
    `project = "AI" AND type = Story AND status CHANGED AFTER "-${days}d" ORDER BY updated DESC`,
    `,${STORY_POINTS_FIELD}`,
  );
  console.log(`  ${issues.length} issues fetched.`);

  let written = 0;
  let skipped = 0;
  for (const thu of thursdayInstants(weeks)) {
    const day = thu.toISOString().slice(0, 10);
    if (!force && existing.has(day)) { skipped++; continue; }
    const end = thu.getTime();
    const { counts, points } = countWindow(issues, end - 7 * DAY, end);
    const result: StreamResult = {
      counts,
      points,
      daily: [],
      rows: [],
      unclassified: 0,
      windowDays: 7,
    };
    saveStreamSnapshot(result, thu.toISOString());
    written++;
    console.log(`  + ${day} 10:00 ET  ${STREAM_FLOW.map((f, i) => `${f.split(" ")[0]}:${counts[i]}`).join("  ")}`);
  }
  console.log(`\nDone. ${written} Thursday(s) backfilled, ${skipped} skipped (already captured).`);
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
