import ExcelJS from "exceljs";
import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.resolve(__dirname, "../prisma/dev.db");
const EXCEL_PATH = path.resolve(__dirname, "../York_Capacity_Planning_FINAL.xlsx");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS Sprint (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    startDate TEXT,
    endDate TEXT,
    durationWeeks INTEGER DEFAULT 4,
    workingDays INTEGER DEFAULT 20,
    focusFactor REAL DEFAULT 0.9,
    velocityProven REAL,
    velocityTarget REAL,
    isCurrent INTEGER DEFAULT 0,
    storyCount INTEGER,
    storyPoints REAL,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS TeamMember (
    id TEXT PRIMARY KEY,
    lastName TEXT NOT NULL,
    firstName TEXT NOT NULL,
    role TEXT NOT NULL,
    location TEXT DEFAULT '',
    stream TEXT NOT NULL,
    ftPt TEXT DEFAULT 'FT',
    hrsPerWeek REAL NOT NULL,
    allocation REAL DEFAULT 1.0,
    pod TEXT,
    sheetRow INTEGER,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS Story (
    key TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    status TEXT NOT NULL,
    storyPoints REAL,
    pod TEXT,
    dependency TEXT,
    stream TEXT NOT NULL,
    sheetRow INTEGER,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS PublicHoliday (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    sprint TEXT,
    days REAL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS ProjectHoliday (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    sprint TEXT,
    days REAL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS PtoEntry (
    id TEXT PRIMARY KEY,
    who TEXT NOT NULL,
    location TEXT DEFAULT '',
    team TEXT,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS InitialCapacity (
    id TEXT PRIMARY KEY,
    lastName TEXT NOT NULL,
    firstName TEXT NOT NULL,
    role TEXT NOT NULL,
    ftPt TEXT DEFAULT 'FT',
    hrsPerWeek REAL NOT NULL,
    refinement REAL DEFAULT 0,
    design REAL DEFAULT 0,
    development REAL DEFAULT 0,
    qa REAL DEFAULT 0,
    kt REAL DEFAULT 0,
    lead REAL DEFAULT 0,
    pmo REAL DEFAULT 0,
    other REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS GuideEntry (
    id TEXT PRIMARY KEY,
    section TEXT NOT NULL,
    term TEXT NOT NULL,
    defaultVal TEXT,
    description TEXT
  );
`);

function clean(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && val !== null && "richText" in (val as Record<string, unknown>)) {
    const rt = val as { richText: Array<{ text: string }> };
    return rt.richText.map(r => r.text).join("").replace(/\u200b/g, "").trim();
  }
  return String(val).replace(/\u200b/g, "").trim();
}

function toDateStr(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function toFloat(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function getCellValue(row: ExcelJS.Row, col: number): unknown {
  const cell = row.getCell(col);
  if (cell.value && typeof cell.value === "object" && "result" in cell.value) {
    return (cell.value as { result: unknown }).result;
  }
  return cell.value;
}

function now(): string {
  return new Date().toISOString();
}

function seedDates(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Dates");
  if (!ws) { console.log("  Sheet 'Dates' not found"); return; }

  db.exec("DELETE FROM Sprint");

  const stmt = db.prepare(`INSERT INTO Sprint (id, name, startDate, endDate, durationWeeks, workingDays, focusFactor, isCurrent, createdAt, updatedAt) VALUES (?, ?, ?, ?, 4, 20, 0.9, 0, ?, ?)`);

  let count = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const name = clean(getCellValue(row, 1));
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-");
    const startDate = toDateStr(getCellValue(row, 2));
    const endDate = toDateStr(getCellValue(row, 3));
    stmt.run(id, name, startDate, endDate, now(), now());
    count++;
  });
  console.log(`  Dates: ${count} sprints`);
}

function seedSprintParams(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Sprint");
  if (!ws) { console.log("  Sheet 'Sprint' not found"); return; }

  const params: Record<string, unknown> = {};
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    const key = clean(getCellValue(row, 1));
    const val = getCellValue(row, 2);
    if (key) params[key] = val;
  });

  const currentSprintNum = Math.floor(toFloat(params["Current Sprint"]));
  const sprintId = `sprint-${currentSprintNum}`;

  const stmt = db.prepare(`UPDATE Sprint SET isCurrent = 1, durationWeeks = ?, workingDays = ?, velocityProven = ?, velocityTarget = ?, storyCount = ?, storyPoints = ?, updatedAt = ? WHERE id = ?`);
  const result = stmt.run(
    toFloat(params["Weeks"]) || 4,
    toFloat(params["Net Working Days"]) || 20,
    toFloat(params["Last Sprint Velocity"]) || null,
    toFloat(params["Target Velocity"]) || null,
    toFloat(params["Story Count"]) || null,
    toFloat(params["Story Points"]) || null,
    now(),
    sprintId,
  );
  console.log(`  Sprint params: current = Sprint ${currentSprintNum} (updated ${result.changes} row)`);
}

function seedBacklog(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Backlog");
  if (!ws) { console.log("  Sheet 'Backlog' not found"); return; }

  db.exec("DELETE FROM Story");

  const stmt = db.prepare(`INSERT INTO Story (key, summary, status, storyPoints, pod, dependency, stream, sheetRow, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const key = clean(getCellValue(row, 1));
    if (!key) return;

    const sp = getCellValue(row, 4);
    stmt.run(
      key,
      clean(getCellValue(row, 2)),
      clean(getCellValue(row, 3)),
      sp !== null && sp !== undefined ? toFloat(sp) : null,
      clean(getCellValue(row, 5)) || null,
      clean(getCellValue(row, 6)) || null,
      clean(getCellValue(row, 7)),
      rowNumber,
      now(),
      now(),
    );
    count++;
  });
  console.log(`  Backlog: ${count} stories`);
}

function seedPublicHolidays(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Public Holidays");
  if (!ws) { console.log("  Sheet 'Public Holidays' not found"); return; }

  db.exec("DELETE FROM PublicHoliday");

  const countryConfigs = [
    { name: "Canada", dateCol: 5, nameCol: 6, sprintCol: 7, daysCol: 8 },
    { name: "Quebec", dateCol: 10, nameCol: 11, sprintCol: 12, daysCol: 13 },
    { name: "India", dateCol: 15, nameCol: 16, sprintCol: 17, daysCol: 18 },
    { name: "USA", dateCol: 20, nameCol: 21, sprintCol: 22, daysCol: 23 },
    { name: "Venezuela", dateCol: 25, nameCol: 26, sprintCol: 27, daysCol: 28 },
  ];

  const stmt = db.prepare(`INSERT INTO PublicHoliday (id, date, name, country, sprint, days) VALUES (?, ?, ?, ?, ?, ?)`);

  let count = 0;
  for (const cc of countryConfigs) {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return;
      const dateVal = toDateStr(getCellValue(row, cc.dateCol));
      const nameVal = clean(getCellValue(row, cc.nameCol));
      if (!dateVal || !nameVal) return;
      const sprintNum = toFloat(getCellValue(row, cc.sprintCol));
      const sprintStr = sprintNum > 0 ? `Sprint ${sprintNum}` : null;
      const days = toFloat(getCellValue(row, cc.daysCol)) || 1;

      stmt.run(randomUUID(), dateVal, nameVal, cc.name, sprintStr, days);
      count++;
    });
  }
  console.log(`  Public Holidays: ${count} entries`);
}

function seedProjectHolidays(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Project Holidays");
  if (!ws) { console.log("  Sheet 'Project Holidays' not found"); return; }

  db.exec("DELETE FROM ProjectHoliday");

  const stmt = db.prepare(`INSERT INTO ProjectHoliday (id, date, name, sprint, days) VALUES (?, ?, ?, ?, ?)`);

  let count = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const dateVal = toDateStr(getCellValue(row, 5));
    const nameVal = clean(getCellValue(row, 6));
    if (!dateVal || !nameVal) return;
    const sprintNum = toFloat(getCellValue(row, 7));
    const sprintStr = sprintNum > 0 ? `Sprint ${sprintNum}` : null;
    const days = toFloat(getCellValue(row, 8)) || 1;

    stmt.run(randomUUID(), dateVal, nameVal, sprintStr, days);
    count++;
  });
  console.log(`  Project Holidays: ${count} entries`);
}

function seedTeamMembers(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Deloitte");
  if (!ws) { console.log("  Sheet 'Deloitte' not found"); return; }

  db.exec("DELETE FROM TeamMember");

  const stmt = db.prepare(`INSERT INTO TeamMember (id, lastName, firstName, role, location, stream, ftPt, hrsPerWeek, allocation, pod, sheetRow, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  let foundTotal = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    if (foundTotal) return; // Stop after TOTAL row (Dev Capacity section follows)
    const lastName = clean(getCellValue(row, 6));
    const firstName = clean(getCellValue(row, 7));
    if (!lastName && !firstName) return;
    if (lastName.toLowerCase() === "total" || firstName.toLowerCase() === "total") {
      foundTotal = true;
      return;
    }

    const alloc = toFloat(getCellValue(row, 13));
    stmt.run(
      randomUUID(),
      lastName,
      firstName,
      clean(getCellValue(row, 8)),
      clean(getCellValue(row, 9)),
      clean(getCellValue(row, 10)),
      clean(getCellValue(row, 11)) || "FT",
      toFloat(getCellValue(row, 12)),
      alloc > 0 ? alloc : 1.0,
      clean(getCellValue(row, 14)) || null,
      rowNumber,
      now(),
      now(),
    );
    count++;
  });
  console.log(`  Team Members: ${count} members`);
}

function seedInitialCapacity(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Initial Capacity");
  if (!ws) { console.log("  Sheet 'Initial Capacity' not found"); return; }

  db.exec("DELETE FROM InitialCapacity");

  const stmt = db.prepare(`INSERT INTO InitialCapacity (id, lastName, firstName, role, ftPt, hrsPerWeek, refinement, design, development, qa, kt, lead, pmo, other) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const norm = (v: number) => (v > 1 ? v / 100 : v);

  let count = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const lastName = clean(getCellValue(row, 1));
    const firstName = clean(getCellValue(row, 2));
    if (!lastName && !firstName) return;
    if (lastName.toLowerCase() === "total") return;

    stmt.run(
      randomUUID(),
      lastName,
      firstName,
      clean(getCellValue(row, 3)),
      clean(getCellValue(row, 4)) || "FT",
      toFloat(getCellValue(row, 5)),
      norm(toFloat(getCellValue(row, 6))),
      norm(toFloat(getCellValue(row, 7))),
      norm(toFloat(getCellValue(row, 8))),
      norm(toFloat(getCellValue(row, 9))),
      norm(toFloat(getCellValue(row, 10))),
      norm(toFloat(getCellValue(row, 11))),
      norm(toFloat(getCellValue(row, 12))),
      norm(toFloat(getCellValue(row, 13))),
    );
    count++;
  });
  console.log(`  Initial Capacity: ${count} entries`);
}

function seedGuide(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet("Guide");
  if (!ws) { console.log("  Sheet 'Guide' not found"); return; }

  db.exec("DELETE FROM GuideEntry");

  const stmt = db.prepare(`INSERT INTO GuideEntry (id, section, term, defaultVal, description) VALUES (?, ?, ?, ?, ?)`);

  let currentSection = "General";
  let count = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    const col1 = clean(getCellValue(row, 1));
    const col2 = clean(getCellValue(row, 2));
    const col3 = clean(getCellValue(row, 3));

    if (!col1 && !col2 && !col3) return;

    if (col1.toUpperCase().includes("HOW TO USE") || col1.toUpperCase().includes("DEFINITION")) {
      currentSection = col1;
      return;
    }

    stmt.run(randomUUID(), currentSection, col1 || col2, col2 || null, col3 || null);
    count++;
  });
  console.log(`  Guide: ${count} entries`);
}

async function main() {
  console.log("Seeding database from Excel...");
  console.log(`Database: ${DB_PATH}`);
  console.log(`Excel: ${EXCEL_PATH}\n`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  console.log(`Sheets found: ${wb.worksheets.map(w => w.name).join(", ")}\n`);

  seedDates(wb);
  seedSprintParams(wb);
  seedBacklog(wb);
  seedPublicHolidays(wb);
  seedProjectHolidays(wb);
  seedTeamMembers(wb);
  seedInitialCapacity(wb);
  seedGuide(wb);

  console.log("\nSeed complete!");
  db.close();
}

main().catch(console.error);
