/**
 * Migration: Add Phase table and phaseId column to Sprint.
 * Seeds 7 standard Salesforce implementation phases.
 *
 * Run with: npx tsx scripts/migrate-add-phases.ts
 */

import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// 1. Create Phase table
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS Phase (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    displayOrder INTEGER NOT NULL,
    color TEXT DEFAULT '#E31837',
    description TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );
`);

console.log("Created Phase table (if not exists).");

// ---------------------------------------------------------------------------
// 2. Add phaseId column to Sprint (idempotent)
// ---------------------------------------------------------------------------

const cols = db
  .prepare("PRAGMA table_info(Sprint)")
  .all() as { name: string }[];
const hasPhaseId = cols.some((c) => c.name === "phaseId");

if (!hasPhaseId) {
  db.exec("ALTER TABLE Sprint ADD COLUMN phaseId TEXT;");
  console.log("Added phaseId column to Sprint.");
} else {
  console.log("Sprint.phaseId already exists — skipping.");
}

// ---------------------------------------------------------------------------
// 3. Seed standard Salesforce implementation phases
// ---------------------------------------------------------------------------

const existingPhases = db.prepare("SELECT COUNT(*) as cnt FROM Phase").get() as { cnt: number };

if (existingPhases.cnt === 0) {
  const phases = [
    { name: "Discovery", order: 1, color: "#8b5cf6", desc: "Requirements gathering, stakeholder interviews, current state analysis" },
    { name: "Design", order: 2, color: "#3b82f6", desc: "Solution design, architecture, data model, integration blueprints" },
    { name: "Build", order: 3, color: "#10b981", desc: "Development, configuration, customization, unit testing" },
    { name: "Testing / QA", order: 4, color: "#f59e0b", desc: "System testing, integration testing, regression testing" },
    { name: "UAT", order: 5, color: "#06b6d4", desc: "User acceptance testing, business validation, sign-off" },
    { name: "Deployment", order: 6, color: "#E31837", desc: "Go-live preparation, data migration, cutover, launch" },
    { name: "Hypercare", order: 7, color: "#ec4899", desc: "Post go-live support, issue resolution, knowledge transfer" },
  ];

  const insert = db.prepare(
    "INSERT INTO Phase (id, name, displayOrder, color, description) VALUES (?, ?, ?, ?, ?)"
  );

  const phaseIds: Record<string, string> = {};

  const insertAll = db.transaction(() => {
    for (const p of phases) {
      const id = randomUUID();
      insert.run(id, p.name, p.order, p.color, p.desc);
      phaseIds[p.name] = id;
      console.log(`  Seeded phase: ${p.name} (${p.color})`);
    }
  });

  insertAll();
  console.log(`Seeded ${phases.length} phases.`);

  // ---------------------------------------------------------------------------
  // 4. Assign existing sprints to phases (reasonable defaults)
  // ---------------------------------------------------------------------------

  const assignPhase = db.prepare("UPDATE Sprint SET phaseId = ? WHERE id = ?");

  const assignments = db.transaction(() => {
    // Discovery: Sprint 1-4 (early sprints, no dates)
    for (const sid of ["sprint-1", "sprint-2", "sprint-3", "sprint-3-pd1", "sprint-4"]) {
      assignPhase.run(phaseIds["Discovery"], sid);
    }
    // Design: Sprint 5-6
    for (const sid of ["sprint-5", "sprint-6"]) {
      assignPhase.run(phaseIds["Design"], sid);
    }
    // Build: Sprint 6-PD2, Sprint 7, Sprint 8
    for (const sid of ["sprint-6-pd2", "sprint-7", "sprint-8"]) {
      assignPhase.run(phaseIds["Build"], sid);
    }
    // Testing / QA: Sprint 9
    for (const sid of ["sprint-9"]) {
      assignPhase.run(phaseIds["Testing / QA"], sid);
    }
    // UAT: Sprint 9-PD3
    for (const sid of ["sprint-9-pd3"]) {
      assignPhase.run(phaseIds["UAT"], sid);
    }
    // Deployment: Sprint 10
    for (const sid of ["sprint-10"]) {
      assignPhase.run(phaseIds["Deployment"], sid);
    }
    // Hypercare: Sprint 11-12
    for (const sid of ["sprint-11", "sprint-12"]) {
      assignPhase.run(phaseIds["Hypercare"], sid);
    }
  });

  assignments();
  console.log("Assigned sprints to phases.");
} else {
  console.log(`Phase table already has ${existingPhases.cnt} entries — skipping seed.`);
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const phaseCount = (db.prepare("SELECT COUNT(*) as cnt FROM Phase").get() as { cnt: number }).cnt;
const assignedCount = (db.prepare("SELECT COUNT(*) as cnt FROM Sprint WHERE phaseId IS NOT NULL").get() as { cnt: number }).cnt;
const totalSprints = (db.prepare("SELECT COUNT(*) as cnt FROM Sprint").get() as { cnt: number }).cnt;

console.log(`\nDone! ${phaseCount} phases, ${assignedCount}/${totalSprints} sprints assigned.`);

db.close();
