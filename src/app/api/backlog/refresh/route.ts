import { NextResponse } from "next/server";

import { fetchSprintStories } from "@/lib/jira/client";
import { getAllSprints, replaceStoriesForSprint } from "@/lib/data";
import { SPRINTS, STORY_POINTS_FIELD } from "@/lib/jira/constants";
import { podTrack } from "@/lib/jira/flow-metrics";
import { cleanStatus, deriveStream, withOrderPrefix, statusOrder } from "@/lib/stream-mapper";
import { isExcludedStory } from "@/lib/capacity-engine";
import type { JiraIssueFields } from "@/lib/jira/types";
import type { BacklogStream } from "@/types";

export const dynamic = "force-dynamic";

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Jira workflow statuses already carry the two-digit order prefix the app
 * keys on ("30 - Ready to Build") — the same number project-overview reads
 * via /^(\d{2})\s*-/. So the stored status IS the cleaned Jira name (no
 * re-prefixing), and the dev-cycle stream comes from that number, mirroring
 * the thresholds in jira/constants statusStream.
 */
function streamFromOrder(order: number): BacklogStream {
  if (order < 20) return "1-REF";
  if (order < 30) return "2-DES";
  if (order < 50) return "3-DEV"; // 30s build … 40s ready-to-deploy
  if (order < 60) return "4-QA"; // 50s functional test / SIT
  if (order < 70) return "5-DEMO";
  return "X-OUT";
}

/**
 * POST /api/backlog/refresh — pull every known sprint's Story issues straight
 * from the Jira Agile API and replace the stored backlog, sprint by sprint.
 *
 * Reuses the same writer (replaceStoriesForSprint) as the CSV import, but is
 * automatic and skips the CSV's "pick the latest Sprint column" guesswork —
 * the Agile API already returns each story under the sprint it lives in.
 *
 * A sprint that returns zero issues is left untouched (guards against a
 * transient empty fetch wiping a sprint that feeds every other tab).
 */
export async function POST() {
  try {
    // Map each sprint name to its Jira id + state. Closed sprints are frozen
    // history (their delivered SP lives in Sprint.completedSP) — the tool only
    // manages open + future sprints, so closed ones are never re-pulled.
    const jiraByName = new Map(SPRINTS.map((s) => [norm(s.name), s] as const));
    const dbSprints = await getAllSprints();

    const perSprint: { sprintName: string; imported: number; replaced: number }[] = [];
    const skipped: { sprintName: string; reason: string }[] = [];
    const unmapped: { key: string; summary: string; status: string; sprint: string }[] = [];
    let total = 0;

    for (const sp of dbSprints) {
      const jira = jiraByName.get(norm(sp.name));
      if (!jira) {
        skipped.push({ sprintName: sp.name, reason: "no matching Jira sprint" });
        continue;
      }
      if (jira.state === "closed") {
        skipped.push({ sprintName: sp.name, reason: "closed (frozen)" });
        continue;
      }

      const issues = await fetchSprintStories(jira.id);
      const rows = issues
        .map((iss) => {
          const f = (iss.fields ?? {}) as JiraIssueFields;
          const cleaned = cleanStatus(f.status?.name ?? "");
          const excluded = isExcludedStory(cleaned);
          // Two naming conventions coexist on the board: numeric-prefixed
          // ("30 - Ready to Build") and legacy stream-token ("DEMO-Demoing").
          const numeric = cleaned.match(/^(\d{1,2})\s*-/);
          let status: string;
          let stream: BacklogStream;
          let order: number;
          if (numeric) {
            status = cleaned; // already carries the order prefix the app reads
            order = parseInt(numeric[1], 10);
            stream = excluded ? "X-OUT" : streamFromOrder(order);
          } else {
            // Normalise legacy names exactly like the CSV import does.
            status = withOrderPrefix(cleaned);
            order = statusOrder(cleaned);
            stream = excluded ? "X-OUT" : deriveStream(cleaned);
          }
          if (order === 99 && !excluded) {
            unmapped.push({
              key: iss.key ?? "?",
              summary: f.summary ?? "",
              status: cleaned || "(blank)",
              sprint: sp.name,
            });
          }
          const spv = f[STORY_POINTS_FIELD];
          const { pod } = podTrack(f);
          return {
            key: iss.key ?? "",
            summary: f.summary ?? "",
            status,
            storyPoints: typeof spv === "number" && Number.isFinite(spv) ? spv : null,
            pod,
            dependency: null,
            stream,
            groupName: null,
          };
        })
        .filter((r) => r.key);

      if (rows.length === 0) {
        skipped.push({ sprintName: sp.name, reason: "no stories returned" });
        continue;
      }

      const { inserted, deleted } = await replaceStoriesForSprint(sp.id, rows);
      total += inserted;
      perSprint.push({ sprintName: sp.name, imported: inserted, replaced: deleted });
    }

    return NextResponse.json({
      success: true,
      total,
      perSprint: perSprint.sort((a, b) => a.sprintName.localeCompare(b.sprintName)),
      skipped,
      unmapped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
