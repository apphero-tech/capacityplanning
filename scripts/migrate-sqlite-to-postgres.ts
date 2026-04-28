/**
 * One-shot migration — copy every row from the local SQLite database
 * (`prisma/dev.db`) into Supabase Postgres, scoped to a fresh workspace.
 *
 * Usage:
 *
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Idempotent: if the workspace already exists (by slug), the script aborts
 * with a clear message — re-running would otherwise duplicate rows.
 *
 * The script uses the `service_role` Supabase key to bypass RLS, since at
 * the time it runs there is no authenticated user yet. The first
 * Membership for Jerome (OWNER of york-planning) is also created so he
 * can sign in and immediately see the workspace.
 */

import { config as dotenvConfig } from "dotenv";
import path from "path";
import Database from "better-sqlite3";
import crypto from "crypto";
import { Client } from "pg";

// Load secrets from .env.local first (Next.js convention), .env as fallback.
dotenvConfig({ path: path.join(process.cwd(), ".env.local") });
dotenvConfig({ path: path.join(process.cwd(), ".env") });

const SQLITE_PATH = path.join(process.cwd(), "prisma/dev.db");
const WORKSPACE_SLUG = "york-planning";
const WORKSPACE_NAME = "York Planning";

// Set this to the Supabase auth user UUID for Jerome to auto-create his
// OWNER membership. Leave empty to skip — you'll bootstrap membership
// manually in Supabase after the first sign-in.
const OWNER_USER_ID = process.env.OWNER_USER_ID ?? "";

function uuid(): string {
  return crypto.randomUUID();
}

async function main() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) throw new Error("DIRECT_URL missing in env");

  const pg = new Client({ connectionString: directUrl });
  await pg.connect();
  console.log("→ Connected to Postgres");

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  console.log(`→ Reading ${SQLITE_PATH}`);

  // ─── Workspace ──────────────────────────────────────────────────────────
  const existing = await pg.query(
    `SELECT "id" FROM "Workspace" WHERE "slug" = $1`,
    [WORKSPACE_SLUG],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.error(
      `✗ Workspace "${WORKSPACE_SLUG}" already exists — aborting to avoid duplicates.`,
    );
    console.error("  Delete it manually in Supabase if you want to re-run.");
    await pg.end();
    process.exit(1);
  }

  const workspaceId = uuid();
  await pg.query(
    `INSERT INTO "Workspace" ("id", "slug", "name", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, NOW(), NOW())`,
    [workspaceId, WORKSPACE_SLUG, WORKSPACE_NAME],
  );
  console.log(`✓ Workspace ${WORKSPACE_NAME} (${workspaceId})`);

  if (OWNER_USER_ID) {
    await pg.query(
      `INSERT INTO "Membership" ("id", "userId", "workspaceId", "role", "createdAt")
       VALUES ($1, $2, $3, 'OWNER', NOW())`,
      [uuid(), OWNER_USER_ID, workspaceId],
    );
    console.log(`✓ Membership OWNER for ${OWNER_USER_ID}`);
  } else {
    console.log("⚠ OWNER_USER_ID not set — membership will be created later.");
  }

  // ─── Phase ──────────────────────────────────────────────────────────────
  // Phase has no SQLite data yet (empty in dev.db) but we map it for safety.
  const phases = sqlite.prepare("SELECT * FROM Phase").all() as {
    id: string;
    name: string;
    displayOrder: number;
    color: string | null;
    description: string | null;
  }[];
  const phaseIdMap = new Map<string, string>();
  for (const p of phases) {
    const newId = uuid();
    phaseIdMap.set(p.id, newId);
    await pg.query(
      `INSERT INTO "Phase" ("id", "workspaceId", "name", "displayOrder", "color", "description", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [newId, workspaceId, p.name, p.displayOrder, p.color ?? "#E31837", p.description],
    );
  }
  console.log(`✓ Phases × ${phases.length}`);

  // ─── Sprint ─────────────────────────────────────────────────────────────
  const sprints = sqlite.prepare("SELECT * FROM Sprint").all() as Record<string, unknown>[];
  const sprintIdMap = new Map<string, string>();
  for (const s of sprints) {
    const newId = uuid();
    sprintIdMap.set(s.id as string, newId);
    await pg.query(
      `INSERT INTO "Sprint" (
         "id", "workspaceId", "name", "startDate", "endDate", "durationWeeks",
         "workingDays", "focusFactor", "velocityProven", "velocityTarget",
         "isCurrent", "isDemo", "progressFactor", "storyCount", "storyPoints",
         "commitmentSP", "completedSP", "phaseId", "createdAt", "updatedAt"
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())`,
      [
        newId,
        workspaceId,
        s.name,
        s.startDate ?? null,
        s.endDate ?? null,
        s.durationWeeks ?? 4,
        s.workingDays ?? 20,
        s.focusFactor ?? 0.9,
        s.velocityProven ?? null,
        s.velocityTarget ?? null,
        Boolean(s.isCurrent),
        Boolean(s.isDemo),
        s.progressFactor ?? 0,
        s.storyCount ?? null,
        s.storyPoints ?? null,
        s.commitmentSP ?? null,
        s.completedSP ?? null,
        s.phaseId ? (phaseIdMap.get(s.phaseId as string) ?? null) : null,
      ],
    );
  }
  console.log(`✓ Sprints × ${sprints.length}`);

  // ─── TeamMember ─────────────────────────────────────────────────────────
  const teamMembers = sqlite.prepare("SELECT * FROM TeamMember").all() as Record<string, unknown>[];
  for (const m of teamMembers) {
    await pg.query(
      `INSERT INTO "TeamMember" (
         "id", "workspaceId", "lastName", "firstName", "role", "location",
         "stream", "ftPt", "hrsPerWeek", "allocation", "pod", "sheetRow",
         "createdAt", "updatedAt"
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
      [
        uuid(),
        workspaceId,
        m.lastName, m.firstName, m.role, m.location ?? "",
        m.stream, m.ftPt ?? "FT", m.hrsPerWeek, m.allocation ?? 1.0,
        m.pod ?? null, m.sheetRow ?? null,
      ],
    );
  }
  console.log(`✓ TeamMembers × ${teamMembers.length}`);

  // ─── Story ──────────────────────────────────────────────────────────────
  const stories = sqlite.prepare("SELECT * FROM Story").all() as Record<string, unknown>[];
  for (const st of stories) {
    await pg.query(
      `INSERT INTO "Story" (
         "id", "workspaceId", "key", "summary", "status", "storyPoints",
         "pod", "dependency", "stream", "sheetRow", "createdAt", "updatedAt"
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      [
        uuid(),
        workspaceId,
        st.key, st.summary, st.status, st.storyPoints ?? null,
        st.pod ?? null, st.dependency ?? null, st.stream, st.sheetRow ?? null,
      ],
    );
  }
  console.log(`✓ Stories × ${stories.length}`);

  // ─── PublicHoliday ──────────────────────────────────────────────────────
  const publicHolidays = sqlite.prepare("SELECT * FROM PublicHoliday").all() as Record<string, unknown>[];
  for (const h of publicHolidays) {
    await pg.query(
      `INSERT INTO "PublicHoliday" ("id", "workspaceId", "date", "name", "country", "sprint", "days")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uuid(), workspaceId, h.date, h.name, h.country, h.sprint ?? null, h.days ?? 1],
    );
  }
  console.log(`✓ PublicHolidays × ${publicHolidays.length}`);

  // ─── ProjectHoliday ─────────────────────────────────────────────────────
  const projectHolidays = sqlite.prepare("SELECT * FROM ProjectHoliday").all() as Record<string, unknown>[];
  for (const h of projectHolidays) {
    await pg.query(
      `INSERT INTO "ProjectHoliday" ("id", "workspaceId", "date", "name", "sprint", "days")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), workspaceId, h.date, h.name, h.sprint ?? null, h.days ?? 1],
    );
  }
  console.log(`✓ ProjectHolidays × ${projectHolidays.length}`);

  // ─── PtoEntry ───────────────────────────────────────────────────────────
  const ptoEntries = sqlite.prepare("SELECT * FROM PtoEntry").all() as Record<string, unknown>[];
  for (const p of ptoEntries) {
    await pg.query(
      `INSERT INTO "PtoEntry" ("id", "workspaceId", "who", "location", "team", "startDate", "endDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uuid(), workspaceId, p.who, p.location ?? "", p.team ?? null, p.startDate, p.endDate],
    );
  }
  console.log(`✓ PtoEntries × ${ptoEntries.length}`);

  // ─── InitialCapacity ────────────────────────────────────────────────────
  const initCaps = sqlite.prepare("SELECT * FROM InitialCapacity").all() as Record<string, unknown>[];
  for (const c of initCaps) {
    await pg.query(
      `INSERT INTO "InitialCapacity" (
         "id", "workspaceId", "lastName", "firstName", "role", "location",
         "organization", "stream", "ftPt", "hrsPerWeek", "isActive",
         "refinement", "design", "development", "qa", "kt", "lead", "pmo",
         "retrofits", "ocmComms", "ocmTraining", "other"
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        uuid(),
        workspaceId,
        c.lastName, c.firstName, c.role, c.location ?? "",
        c.organization ?? "", c.stream ?? "", c.ftPt ?? "FT", c.hrsPerWeek,
        Boolean(c.isActive),
        c.refinement ?? 0, c.design ?? 0, c.development ?? 0, c.qa ?? 0,
        c.kt ?? 0, c.lead ?? 0, c.pmo ?? 0, c.retrofits ?? 0,
        c.ocmComms ?? 0, c.ocmTraining ?? 0, c.other ?? 0,
      ],
    );
  }
  console.log(`✓ InitialCapacities × ${initCaps.length}`);

  // ─── GuideEntry ─────────────────────────────────────────────────────────
  const guides = sqlite.prepare("SELECT * FROM GuideEntry").all() as Record<string, unknown>[];
  for (const g of guides) {
    await pg.query(
      `INSERT INTO "GuideEntry" ("id", "workspaceId", "section", "term", "defaultVal", "description")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), workspaceId, g.section, g.term, g.defaultVal ?? null, g.description ?? null],
    );
  }
  console.log(`✓ GuideEntries × ${guides.length}`);

  // ─── SprintStory ────────────────────────────────────────────────────────
  const sprintStories = sqlite.prepare("SELECT * FROM SprintStory").all() as Record<string, unknown>[];
  for (const ss of sprintStories) {
    const newSprintId = sprintIdMap.get(ss.sprintId as string);
    if (!newSprintId) {
      console.warn(`⚠ Skipping SprintStory with unknown sprintId: ${ss.sprintId}`);
      continue;
    }
    await pg.query(
      `INSERT INTO "SprintStory" (
         "id", "workspaceId", "sprintId", "key", "summary", "status",
         "storyPoints", "pod", "dependency", "stream", "groupName", "importedAt"
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamp, NOW()))`,
      [
        uuid(),
        workspaceId,
        newSprintId,
        ss.key, ss.summary, ss.status, ss.storyPoints ?? null,
        ss.pod ?? null, ss.dependency ?? null, ss.stream, ss.groupName ?? null,
        ss.importedAt ?? null,
      ],
    );
  }
  console.log(`✓ SprintStories × ${sprintStories.length}`);

  sqlite.close();
  await pg.end();
  console.log("\n✅ Migration complete.");
  console.log(`   Workspace slug: ${WORKSPACE_SLUG}`);
  console.log(`   Workspace id  : ${workspaceId}`);
  if (!OWNER_USER_ID) {
    console.log("\n   Next: sign in to the app at least once (Supabase will create your auth.users row),");
    console.log("   then run the bootstrap-membership SQL to make yourself OWNER of york-planning.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
