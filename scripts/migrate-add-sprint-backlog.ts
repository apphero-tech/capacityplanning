/**
 * Migration: Create SprintStory table and backfill from existing Story table.
 *
 * This supports per-sprint backlog management where the user uploads
 * Jira Excel exports per sprint.
 *
 * Run with: npx tsx scripts/migrate-add-sprint-backlog.ts
 */

import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// 1. Create SprintStory table
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS SprintStory (
    id TEXT PRIMARY KEY,
    sprintId TEXT NOT NULL,
    key TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL,
    storyPoints REAL,
    pod TEXT,
    dependency TEXT,
    stream TEXT NOT NULL,
    groupName TEXT,
    importedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(sprintId, key)
  );
`);

console.log("✓ Created SprintStory table (if not exists).");

// ---------------------------------------------------------------------------
// 2. Create index on sprintId
// ---------------------------------------------------------------------------

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sprintstory_sprint ON SprintStory(sprintId);
`);

console.log("✓ Created index idx_sprintstory_sprint (if not exists).");

// ---------------------------------------------------------------------------
// 3. Backfill: Copy existing Story rows → SprintStory for the current sprint
// ---------------------------------------------------------------------------

const existingCount = (
  db.prepare("SELECT COUNT(*) as cnt FROM SprintStory").get() as { cnt: number }
).cnt;

if (existingCount === 0) {
  // Find the current sprint
  const currentSprint = db
    .prepare("SELECT id, name FROM Sprint WHERE isCurrent = 1 LIMIT 1")
    .get() as { id: string; name: string } | undefined;

  if (!currentSprint) {
    console.log("⚠ No current sprint found — skipping backfill.");
  } else {
    const stories = db
      .prepare("SELECT key, summary, status, storyPoints, pod, dependency, stream FROM Story")
      .all() as {
      key: string;
      summary: string;
      status: string;
      storyPoints: number | null;
      pod: string | null;
      dependency: string | null;
      stream: string;
    }[];

    if (stories.length === 0) {
      console.log("⚠ No stories in Story table — nothing to backfill.");
    } else {
      const insert = db.prepare(`
        INSERT INTO SprintStory (id, sprintId, key, summary, status, storyPoints, pod, dependency, stream, groupName, importedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const backfill = db.transaction(() => {
        let count = 0;
        for (const s of stories) {
          insert.run(
            randomUUID(),
            currentSprint.id,
            s.key,
            s.summary,
            s.status,
            s.storyPoints,
            s.pod,
            s.dependency,
            s.stream,
            null // groupName not available in old data
          );
          count++;
        }
        return count;
      });

      const backfilled = backfill();
      console.log(
        `✓ Backfilled ${backfilled} stories from Story → SprintStory (sprint: ${currentSprint.name}, id: ${currentSprint.id}).`
      );
    }
  }
} else {
  console.log(
    `ℹ SprintStory already has ${existingCount} entries — skipping backfill.`
  );
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const totalSprintStories = (
  db.prepare("SELECT COUNT(*) as cnt FROM SprintStory").get() as { cnt: number }
).cnt;
const totalOldStories = (
  db.prepare("SELECT COUNT(*) as cnt FROM Story").get() as { cnt: number }
).cnt;
const distinctSprints = (
  db.prepare("SELECT COUNT(DISTINCT sprintId) as cnt FROM SprintStory").get() as {
    cnt: number;
  }
).cnt;

console.log(
  `\nDone! SprintStory: ${totalSprintStories} rows, ${distinctSprints} sprint(s). Old Story table: ${totalOldStories} rows (retained).`
);

db.close();
