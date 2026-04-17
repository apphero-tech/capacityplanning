/**
 * Idempotent migration script: brings the local SQLite dev.db in line with the
 * current Prisma schema by adding any missing columns. Safe to re-run.
 *
 * Usage:
 *   npm run migrate:local
 *
 * Each ALTER is wrapped so that if the column already exists the script just
 * skips it and continues.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

type ColumnSpec = {
  table: string;
  column: string;
  type: string;
  notNull?: boolean;
  default?: string; // raw SQL default, e.g. "''" or "0"
};

const EXPECTED: ColumnSpec[] = [
  { table: "InitialCapacity", column: "organization", type: "TEXT",    notNull: true, default: "''" },
  { table: "InitialCapacity", column: "stream",       type: "TEXT",    notNull: true, default: "''" },
  { table: "InitialCapacity", column: "retrofits",    type: "REAL",    notNull: true, default: "0" },
  { table: "InitialCapacity", column: "ocmComms",     type: "REAL",    notNull: true, default: "0" },
  { table: "InitialCapacity", column: "ocmTraining",  type: "REAL",    notNull: true, default: "0" },
  { table: "Sprint",          column: "isDemo",       type: "BOOLEAN", notNull: true, default: "0" },
];

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function addColumnIfMissing(db: Database.Database, spec: ColumnSpec): "added" | "exists" {
  if (columnExists(db, spec.table, spec.column)) return "exists";
  const nn = spec.notNull ? " NOT NULL" : "";
  const def = spec.default !== undefined ? ` DEFAULT ${spec.default}` : "";
  const sql = `ALTER TABLE ${spec.table} ADD COLUMN ${spec.column} ${spec.type}${nn}${def};`;
  db.exec(sql);
  return "added";
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    console.error("Run the app once to let Prisma create it, then retry.");
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  console.log(`Migrating ${DB_PATH}...`);

  let added = 0;
  let existed = 0;
  for (const spec of EXPECTED) {
    const result = addColumnIfMissing(db, spec);
    if (result === "added") {
      console.log(`  + ${spec.table}.${spec.column} (${spec.type})`);
      added++;
    } else {
      existed++;
    }
  }

  db.close();

  if (added === 0) {
    console.log(`Nothing to do — all ${existed} columns already present.`);
  } else {
    console.log(`Done. ${added} column(s) added, ${existed} already present.`);
  }
}

main();
