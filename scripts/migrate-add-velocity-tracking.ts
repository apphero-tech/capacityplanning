/**
 * Migration: Add commitmentSP and completedSP columns to Sprint table,
 * then seed historical velocity data.
 *
 * Run with: npx tsx scripts/migrate-add-velocity-tracking.ts
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// 1. Add columns (safe: ALTER TABLE ignores if column exists in better-sqlite3)
// ---------------------------------------------------------------------------

const columns = db.pragma("table_info(Sprint)") as { name: string }[];
const colNames = new Set(columns.map((c) => c.name));

if (!colNames.has("commitmentSP")) {
  db.exec(`ALTER TABLE Sprint ADD COLUMN commitmentSP REAL`);
  console.log("✓ Added commitmentSP column");
} else {
  console.log("⤳ commitmentSP column already exists");
}

if (!colNames.has("completedSP")) {
  db.exec(`ALTER TABLE Sprint ADD COLUMN completedSP REAL`);
  console.log("✓ Added completedSP column");
} else {
  console.log("⤳ completedSP column already exists");
}

// ---------------------------------------------------------------------------
// 2. Seed historical commitment/completed data
// ---------------------------------------------------------------------------

const historicalData: { id: string; commitment: number; completed: number }[] = [
  { id: "sprint-0", commitment: 0, completed: 0 },
  { id: "sprint-2", commitment: 1561, completed: 0 },
  { id: "sprint-3", commitment: 521, completed: 770 },
  { id: "sprint-3-pd1", commitment: 202, completed: 946 },
  { id: "sprint-4", commitment: 458, completed: 389 },
  { id: "sprint-5", commitment: 599, completed: 489 },
];

const updateStmt = db.prepare(
  `UPDATE Sprint SET commitmentSP = ?, completedSP = ? WHERE id = ?`
);

const seedTx = db.transaction(() => {
  for (const row of historicalData) {
    const result = updateStmt.run(row.commitment, row.completed, row.id);
    if (result.changes > 0) {
      console.log(`✓ ${row.id}: commitment=${row.commitment}, completed=${row.completed}`);
    } else {
      console.log(`⚠ ${row.id}: not found in DB`);
    }
  }
});

seedTx();

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const verify = db
  .prepare(
    `SELECT id, name, commitmentSP, completedSP FROM Sprint WHERE commitmentSP IS NOT NULL ORDER BY id`
  )
  .all() as { id: string; name: string; commitmentSP: number; completedSP: number }[];

console.log("\n--- Sprints with velocity data ---");
for (const s of verify) {
  const conf = s.commitmentSP > 0
    ? `${((s.completedSP / s.commitmentSP) * 100).toFixed(1)}%`
    : "N/A";
  console.log(`  ${s.name}: ${s.completedSP}/${s.commitmentSP} SP (confidence: ${conf})`);
}

db.close();
console.log("\n✅ Migration complete!");
