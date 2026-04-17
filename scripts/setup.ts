/**
 * First-time / repair setup: idempotent, safe to run any time.
 *
 *   1. Ensure a valid .env with DATABASE_URL exists.
 *   2. Ensure the local SQLite DB exists and matches the Prisma schema.
 *   3. Regenerate the Prisma client.
 *
 * Usage:
 *   npm run setup
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import Database from "better-sqlite3";

const ENV_PATH = path.join(process.cwd(), ".env");
const ENV_CONTENT = 'DATABASE_URL="file:./prisma/dev.db"\n';
const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

/** Return true when the DB file exists AND contains all the tables the app needs. */
function hasExpectedSchema(): boolean {
  if (!fs.existsSync(DB_PATH)) return false;
  const required = ["Sprint", "TeamMember", "InitialCapacity", "PtoEntry"];
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = new Set(rows.map((r) => r.name));
    return required.every((t) => names.has(t));
  } finally {
    db.close();
  }
}

function ensureEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    fs.writeFileSync(ENV_PATH, ENV_CONTENT);
    console.log("Wrote .env with default DATABASE_URL");
    return;
  }
  const current = fs.readFileSync(ENV_PATH, "utf8");
  if (!/DATABASE_URL=/.test(current)) {
    fs.appendFileSync(ENV_PATH, ENV_CONTENT);
    console.log("Added DATABASE_URL to existing .env");
    return;
  }
  // If DATABASE_URL points somewhere other than prisma/dev.db, rewrite it — the
  // app hardcodes prisma/dev.db, so a divergent URL means the Prisma CLI and the
  // app would operate on two different databases (we hit this bug before).
  if (!/DATABASE_URL=.*prisma\/dev\.db/.test(current)) {
    const fixed = current.replace(/DATABASE_URL=.*/g, ENV_CONTENT.trim());
    fs.writeFileSync(ENV_PATH, fixed);
    console.log("Corrected DATABASE_URL in .env to point at prisma/dev.db");
    return;
  }
  console.log(".env already configured");
}

function run(cmd: string, label: string) {
  console.log(`\n> ${label}`);
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  console.log("Running setup...");
  ensureEnv();

  if (!hasExpectedSchema()) {
    console.log(
      "\nLocal DB is missing or incomplete — running prisma db push to create/sync tables.",
    );
    run("npx prisma db push --accept-data-loss", "prisma db push (create schema)");
  } else {
    console.log("\nLocal DB has all expected tables — applying additive column migrations.");
    run("npm run migrate:local", "npm run migrate:local");
  }

  run("npx prisma generate", "npx prisma generate");

  console.log("\nSetup complete. You can now run:  npm run dev");
}

main();
