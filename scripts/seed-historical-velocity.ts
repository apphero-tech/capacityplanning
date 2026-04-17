/**
 * Seed historical sprints that pre-date Sprint 6, plus the commitment /
 * completed SP values captured by the user's velocity log. Idempotent:
 * sprints that already exist are updated in place (no duplicates).
 *
 * Dates are back-propagated from Sprint 6 (2026-03-02 → 2026-03-27) using
 * the York cadence:
 *   - 4-week delivery sprints (20 working days)
 *   - 2-week product-demo sprints (10 working days)
 *
 * Usage:
 *   npm run seed:history
 */
import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

type Historical = {
  name: string;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  workingDays: number;
  isDemo: boolean;
  commitmentSP: number;
  completedSP: number;
};

const HISTORY: Historical[] = [
  { name: "AP Sprint 2",                  startDate: "2025-10-20", endDate: "2025-11-14",
    durationWeeks: 4, workingDays: 20, isDemo: false,
    commitmentSP: 1507, completedSP: 140 },
  { name: "AP Sprint 3",                  startDate: "2025-11-17", endDate: "2025-12-12",
    durationWeeks: 4, workingDays: 20, isDemo: false,
    commitmentSP: 518, completedSP: 778 },
  { name: "Sprint 3B | Product Demo 1",   startDate: "2025-12-15", endDate: "2025-12-26",
    durationWeeks: 2, workingDays: 10, isDemo: true,
    commitmentSP: 194, completedSP: 946 },
  { name: "Sprint 4",                     startDate: "2026-01-05", endDate: "2026-01-30",
    durationWeeks: 4, workingDays: 20, isDemo: false,
    commitmentSP: 450, completedSP: 409 },
  { name: "Sprint 5",                     startDate: "2026-02-02", endDate: "2026-02-27",
    durationWeeks: 4, workingDays: 20, isDemo: false,
    commitmentSP: 599, completedSP: 489 },
];

function main() {
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();

  const existing = new Map<string, string>();
  for (const row of db.prepare("SELECT id, name FROM Sprint").all() as { id: string; name: string }[]) {
    existing.set(row.name, row.id);
  }

  const insert = db.prepare(
    `INSERT INTO Sprint (id, name, startDate, endDate, durationWeeks, workingDays, focusFactor, isCurrent, isDemo, progressFactor, commitmentSP, completedSP, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE Sprint SET startDate = ?, endDate = ?, durationWeeks = ?, workingDays = ?, isDemo = ?, commitmentSP = ?, completedSP = ?, updatedAt = ? WHERE id = ?`,
  );

  let added = 0;
  let updated = 0;
  for (const h of HISTORY) {
    const existingId = existing.get(h.name);
    if (existingId) {
      update.run(
        h.startDate,
        h.endDate,
        h.durationWeeks,
        h.workingDays,
        h.isDemo ? 1 : 0,
        h.commitmentSP,
        h.completedSP,
        now,
        existingId,
      );
      updated++;
      console.log(`  upd ${h.name.padEnd(30)} ${h.startDate} → ${h.endDate}  commit=${h.commitmentSP} done=${h.completedSP}`);
    } else {
      insert.run(
        randomUUID(),
        h.name,
        h.startDate,
        h.endDate,
        h.durationWeeks,
        h.workingDays,
        0.9,
        h.isDemo ? 1 : 0,
        h.commitmentSP,
        h.completedSP,
        now,
        now,
      );
      added++;
      console.log(`  add ${h.name.padEnd(30)} ${h.startDate} → ${h.endDate}  commit=${h.commitmentSP} done=${h.completedSP}`);
    }
  }

  db.close();
  console.log(`\nHistorical velocity: ${added} sprint(s) added, ${updated} updated.`);
}

main();
