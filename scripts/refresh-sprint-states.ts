/**
 * Print the board's sprints as ready-to-paste SPRINTS entries, so the
 * hardcoded list in src/lib/jira/constants.ts can be refreshed when a sprint
 * opens/closes in Jira (the `state` drives the Active/Upcoming/Planned/Closed
 * phase). Read-only; local token. Copy the output over the SPRINTS array.
 *
 * Usage: npx tsx scripts/refresh-sprint-states.ts
 */
import "dotenv/config";
import { BOARD_ID } from "../src/lib/jira/constants";

async function main() {
  const base = process.env.JIRA_BASE_URL!.replace(/\/$/, "");
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let startAt = 0;
  for (;;) {
    const res = await fetch(
      `${base}/rest/agile/1.0/board/${BOARD_ID}/sprint?startAt=${startAt}&maxResults=50`,
      { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
    );
    if (!res.ok) {
      console.error(`Jira ${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    const j = await res.json();
    all.push(...(j.values ?? []));
    if (j.isLast || !(j.values?.length)) break;
    startAt += j.values.length;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all.sort((a: any, b: any) => (b.startDate ?? "").localeCompare(a.startDate ?? "")); // newest first

  console.log("// Paste over the SPRINTS array in src/lib/jira/constants.ts:");
  for (const s of all) {
    const start = (s.startDate ?? "").slice(0, 10);
    const end = (s.endDate ?? "").slice(0, 10);
    console.log(
      `  { id: ${s.id}, name: ${JSON.stringify(s.name)}, state: ${JSON.stringify(s.state)}, start: ${JSON.stringify(start)}, end: ${JSON.stringify(end)} },`,
    );
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
