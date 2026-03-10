import Database from "better-sqlite3";

const db = new Database("./prisma/dev.db");

// Check current sprints
const sprints = db
  .prepare(
    "SELECT id, name, startDate, endDate, durationWeeks, phaseId FROM Sprint ORDER BY name"
  )
  .all() as any[];

console.log("Current sprints:");
sprints.forEach((s: any) =>
  console.log(
    " ",
    s.name,
    "| dates:",
    s.startDate || "N/A",
    "-",
    s.endDate || "N/A",
    "| phaseId:",
    s.phaseId?.substring(0, 8) || "null"
  )
);

// Check if Sprint 0 already exists
const s0 = db.prepare("SELECT * FROM Sprint WHERE name = 'Sprint 0'").get();
if (s0) {
  console.log("\nSprint 0 already exists, skipping.");
  process.exit(0);
}

// Get Build phase ID
const buildPhase = db
  .prepare("SELECT id FROM Phase WHERE name = 'Build'")
  .get() as any;

console.log("\nBuild phase ID:", buildPhase?.id);

// Insert Sprint 0 (no dates, same as Sprint 1-4)
db.prepare(
  `INSERT INTO Sprint (id, name, startDate, endDate, durationWeeks, workingDays, focusFactor, isCurrent, phaseId, createdAt, updatedAt)
   VALUES ('sprint-0', 'Sprint 0', NULL, NULL, 4, 20, 0.9, 0, ?, datetime('now'), datetime('now'))`
).run(buildPhase?.id);

console.log("\nSprint 0 added successfully!");

// Verify
const allSprints = db
  .prepare("SELECT name, phaseId FROM Sprint ORDER BY name")
  .all() as any[];
console.log("\nUpdated sprint list:");
allSprints.forEach((s: any) =>
  console.log("  ", s.name, "| phaseId:", s.phaseId?.substring(0, 8) || "null")
);
console.log(`\nTotal sprints: ${allSprints.length}`);
