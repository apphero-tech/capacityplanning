/**
 * Seed the Sprint table with the York engagement's fixed sprint calendar.
 * Idempotent: sprints that already exist by name are skipped.
 *
 * Usage:
 *   npm run seed:york
 */
import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";
import { differenceInBusinessDays } from "date-fns";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

type SprintDef = { name: string; startDate: string; endDate: string; isDemo?: boolean };

const YORK_SPRINTS: SprintDef[] = [
  { name: "Sprint 6",                    startDate: "2026-03-02", endDate: "2026-03-27" },
  { name: "Sprint 7",                    startDate: "2026-03-30", endDate: "2026-04-24" },
  { name: "Sprint 8",                    startDate: "2026-04-27", endDate: "2026-05-22" },
  { name: "Sprint 9",                    startDate: "2026-05-25", endDate: "2026-06-19" },
  { name: "Sprint 9B | Product Demo 2",  startDate: "2026-06-22", endDate: "2026-07-10", isDemo: true },
  { name: "Sprint 10",                   startDate: "2026-07-13", endDate: "2026-08-07" },
  { name: "Sprint 11",                   startDate: "2026-08-10", endDate: "2026-09-04" },
  { name: "Sprint 12",                   startDate: "2026-09-07", endDate: "2026-10-02" },
  { name: "Sprint 13",                   startDate: "2026-10-05", endDate: "2026-10-30" },
  { name: "Sprint 13B | Product Demo 3", startDate: "2026-11-02", endDate: "2026-11-13", isDemo: true },
];

function main() {
  const db = new Database(DB_PATH);

  const existingNames = new Set<string>(
    (db.prepare("SELECT name FROM Sprint").all() as { name: string }[]).map((r) => r.name),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date().toISOString();

  const insert = db.prepare(
    `INSERT INTO Sprint (id, name, startDate, endDate, durationWeeks, workingDays, focusFactor, isCurrent, isDemo, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const clearCurrent = db.prepare("UPDATE Sprint SET isCurrent = 0 WHERE isCurrent = 1");
  const setDemoFlag = db.prepare(
    "UPDATE Sprint SET isDemo = ?, updatedAt = ? WHERE name = ? AND isDemo != ?",
  );

  let inserted = 0;
  let skipped = 0;
  let demoFixed = 0;

  for (const s of YORK_SPRINTS) {
    if (existingNames.has(s.name)) {
      // Existing sprint: still reconcile its demo flag so a previously-seeded
      // 9B / 13B that pre-dated the isDemo column gets correctly marked.
      const wantDemo = s.isDemo ? 1 : 0;
      const result = setDemoFlag.run(wantDemo, now, s.name, wantDemo);
      if (result.changes > 0) {
        console.log(`  fix    ${s.name}  (isDemo → ${wantDemo === 1 ? "true" : "false"})`);
        demoFixed++;
      } else {
        console.log(`  skip   ${s.name}  (already exists)`);
      }
      skipped++;
      continue;
    }

    const start = new Date(`${s.startDate}T00:00:00`);
    const end = new Date(`${s.endDate}T00:00:00`);
    const workingDays = differenceInBusinessDays(end, start) + 1;
    const durationWeeks = Math.max(1, Math.ceil(workingDays / 5));
    const isCurrent = today >= start && today <= end;

    if (isCurrent) clearCurrent.run();

    insert.run(
      randomUUID(),
      s.name,
      s.startDate,
      s.endDate,
      durationWeeks,
      workingDays,
      0.9,
      isCurrent ? 1 : 0,
      s.isDemo ? 1 : 0,
      now,
      now,
    );
    console.log(
      `  add    ${s.name}  ${s.startDate} → ${s.endDate}  (${workingDays} working days${isCurrent ? ", current" : ""}${s.isDemo ? ", demo" : ""})`,
    );
    inserted++;
  }

  db.close();
  console.log(
    `\nDone. ${inserted} sprint(s) added, ${skipped} already present${demoFixed > 0 ? `, ${demoFixed} demo flag(s) updated` : ""}.`,
  );
}

main();
