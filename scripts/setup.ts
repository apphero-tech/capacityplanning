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

const ENV_PATH = path.join(process.cwd(), ".env");
const ENV_CONTENT = 'DATABASE_URL="file:./prisma/dev.db"\n';
const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

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

  const dbExists = fs.existsSync(DB_PATH);
  if (!dbExists) {
    console.log(`\nDatabase not found at prisma/dev.db — creating it.`);
    run("npx prisma db push --skip-generate", "prisma db push (create schema)");
  } else {
    console.log("\nDatabase found — applying additive migrations only.");
    run("npm run migrate:local", "npm run migrate:local");
  }

  run("npx prisma generate", "npx prisma generate");

  console.log("\nSetup complete. You can now run:  npm run dev");
}

main();
