/**
 * fix-data-and-import-pto.ts
 *
 * Single migration script that:
 *   Part 1 — Fixes TeamMember records (stream/allocation/hours errors)
 *   Part 2 — Fixes InitialCapacity records (matching allocation errors)
 *   Part 3 — Inserts 14 new team members (both tables)
 *   Part 4 — Bulk-imports PTO entries from the roster file
 *
 * Idempotent: safe to re-run. Uses a single transaction for atomicity.
 *
 * Run:  npx tsx scripts/fix-data-and-import-pto.ts
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("./prisma/dev.db");
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const updateTM = db.prepare(`
  UPDATE TeamMember
  SET stream = ?, allocation = ?, hrsPerWeek = ?, updatedAt = datetime('now')
  WHERE lastName = ? AND firstName = ?
`);

const updateIC = db.prepare(`
  UPDATE InitialCapacity
  SET hrsPerWeek = ?, refinement = ?, design = ?, development = ?,
      qa = ?, kt = ?, lead = ?, pmo = ?, other = ?
  WHERE lastName = ? AND firstName = ?
`);

const checkTM = db.prepare(
  "SELECT id FROM TeamMember WHERE lastName = ? AND firstName = ?"
);

const insertTM = db.prepare(`
  INSERT INTO TeamMember
    (id, lastName, firstName, role, location, stream, ftPt, hrsPerWeek, allocation, pod, sheetRow, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const insertIC = db.prepare(`
  INSERT INTO InitialCapacity
    (id, lastName, firstName, role, ftPt, hrsPerWeek, refinement, design, development, qa, kt, lead, pmo, other)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const checkPTO = db.prepare(
  "SELECT id FROM PtoEntry WHERE who = ? AND startDate = ? AND endDate = ?"
);

const insertPTO = db.prepare(
  "INSERT INTO PtoEntry (id, who, location, team, startDate, endDate) VALUES (?, ?, ?, ?, ?, ?)"
);

// ---------------------------------------------------------------------------
// Part 1: TeamMember fixes
// ---------------------------------------------------------------------------

const teamMemberFixes = [
  { lastName: "Vargas",      firstName: "Alexis",  stream: "DEV", allocation: 1.0, hrsPerWeek: 40 },
  { lastName: "Aubé",        firstName: "Carl",    stream: "DEV", allocation: 1.0, hrsPerWeek: 32 },
  { lastName: "Ojeda",       firstName: "Joel",    stream: "DEV", allocation: 1.0, hrsPerWeek: 40 },
  { lastName: "Ran",         firstName: "Elaine",  stream: "DEV", allocation: 0.75, hrsPerWeek: 40 },
  { lastName: "Chow",        firstName: "Charlie", stream: "DEV", allocation: 0.8, hrsPerWeek: 40 },
  { lastName: "Porwal",      firstName: "Asit",    stream: "DEV", allocation: 0.5, hrsPerWeek: 45 },
  { lastName: "Rose",        firstName: "Jimmy",   stream: "DES", allocation: 1.0, hrsPerWeek: 32 },
  { lastName: "Schumacher",  firstName: "Jérôme",  stream: "PMO", allocation: 1.0, hrsPerWeek: 40 },
];

// ---------------------------------------------------------------------------
// Part 2: InitialCapacity fixes
// ---------------------------------------------------------------------------
//                                              hrs   ref   des   dev   qa    kt    lead  pmo   other
const capacityFixes = [
  { lastName: "Vargas",      firstName: "Alexis",  hrsPerWeek: 40, refinement: 0, design: 0,    development: 1.0,  qa: 0,   kt: 0, lead: 0,   pmo: 0,   other: 0   },
  { lastName: "Aubé",        firstName: "Carl",    hrsPerWeek: 32, refinement: 0, design: 0,    development: 1.0,  qa: 0,   kt: 0, lead: 0,   pmo: 0,   other: 0   },
  { lastName: "Ojeda",       firstName: "Joel",    hrsPerWeek: 40, refinement: 0, design: 0,    development: 1.0,  qa: 0,   kt: 0, lead: 0,   pmo: 0,   other: 0   },
  { lastName: "Ran",         firstName: "Elaine",  hrsPerWeek: 40, refinement: 0, design: 0.25, development: 0.75, qa: 0,   kt: 0, lead: 0,   pmo: 0,   other: 0   },
  { lastName: "Chow",        firstName: "Charlie", hrsPerWeek: 40, refinement: 0, design: 0,    development: 0.8,  qa: 0,   kt: 0, lead: 0.2, pmo: 0,   other: 0   },
  { lastName: "Porwal",      firstName: "Asit",    hrsPerWeek: 45, refinement: 0, design: 0,    development: 0.5,  qa: 0.3, kt: 0, lead: 0.2, pmo: 0,   other: 0   },
  { lastName: "Rose",        firstName: "Jimmy",   hrsPerWeek: 32, refinement: 0, design: 1.0,  development: 0,    qa: 0,   kt: 0, lead: 0,   pmo: 0,   other: 0   },
  { lastName: "Schumacher",  firstName: "Jérôme",  hrsPerWeek: 40, refinement: 0, design: 0,    development: 0,    qa: 0,   kt: 0, lead: 0,   pmo: 0.5, other: 0.5 },
  { lastName: "Van Goethem", firstName: "Emily",   hrsPerWeek: 40, refinement: 1.0, design: 0,  development: 0,    qa: 0,   kt: 0, lead: 0,   pmo: 0,   other: 0   },
  { lastName: "Singh",       firstName: "Ankita",  hrsPerWeek: 4,  refinement: 0, design: 0,    development: 0,    qa: 0,   kt: 0, lead: 1.0, pmo: 0,   other: 0   },
];

// ---------------------------------------------------------------------------
// Part 3: New team members (14 people)
// ---------------------------------------------------------------------------

interface NewMember {
  lastName: string;
  firstName: string;
  role: string;
  location: string;
  stream: string;
  ftPt: string;
  hrsPerWeek: number;
  allocation: number;
  pod: string | null;
  refinement: number;
  design: number;
  development: number;
  qa: number;
  kt: number;
  lead: number;
  pmo: number;
  other: number;
}

const newMembers: NewMember[] = [
  {
    lastName: "Clermont", firstName: "Serena",
    role: "Solution Architect", location: "Quebec", stream: "DES", ftPt: "FT",
    hrsPerWeek: 40, allocation: 0, pod: null, // allocation=0 → maternity leave
    refinement: 0, design: 0.5, development: 0, qa: 0, kt: 0, lead: 0.5, pmo: 0, other: 0,
  },
  {
    lastName: "Benadela", firstName: "Djelloul",
    role: "Technical Consultant", location: "Canada", stream: "DEV", ftPt: "PT",
    hrsPerWeek: 32, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 1.0, qa: 0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
  {
    lastName: "Tagore", firstName: "Rahil",
    role: "Developer", location: "India", stream: "DEV", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 1.0, qa: 0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
  {
    lastName: "Salwe", firstName: "Prakhar",
    role: "Developer", location: "India", stream: "DEV", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 1.0, qa: 0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
  {
    lastName: "Bhosale", firstName: "Akshay",
    role: "Developer", location: "India", stream: "DEV", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 1.0, qa: 0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
  {
    lastName: "Pal", firstName: "Tanmay",
    role: "Developer", location: "India", stream: "DEV", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 1.0, qa: 0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
  {
    lastName: "Tyagi", firstName: "Lalit",
    role: "DevOps", location: "India", stream: "DEV", ftPt: "PT",
    hrsPerWeek: 20, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 0, qa: 0, kt: 0, lead: 0, pmo: 0, other: 1.0,
  },
  {
    lastName: "Chan", firstName: "Zack",
    role: "MC Functional Lead", location: "Canada", stream: "REF", ftPt: "FT",
    hrsPerWeek: 40, allocation: 1.0, pod: null,
    refinement: 0.5, design: 0, development: 0, qa: 0, kt: 0, lead: 0.5, pmo: 0, other: 0,
  },
  {
    lastName: "Tran", firstName: "Minh",
    role: "MC Lead", location: "Canada", stream: "MAN", ftPt: "FT",
    hrsPerWeek: 40, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 0, qa: 0, kt: 0, lead: 1.0, pmo: 0, other: 0,
  },
  {
    lastName: "Minocha", firstName: "Prerit",
    role: "India Manager", location: "India", stream: "MAN", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 0, qa: 0, kt: 0, lead: 1.0, pmo: 0, other: 0,
  },
  {
    lastName: "Mishra", firstName: "Priyanka",
    role: "Lead Developer", location: "India", stream: "DEV", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 0.5, qa: 0, kt: 0, lead: 0.5, pmo: 0, other: 0,
  },
  {
    lastName: "Srivastava", firstName: "Siddhant",
    role: "Developer", location: "India", stream: "DEV", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 1.0, qa: 0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
  {
    lastName: "Chavan", firstName: "Kunal",
    role: "QA Analyst", location: "India", stream: "QA", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 0, qa: 1.0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
  {
    lastName: "Gabriel", firstName: "Nishie",
    role: "QA Analyst", location: "India", stream: "QA", ftPt: "FT",
    hrsPerWeek: 45, allocation: 1.0, pod: null,
    refinement: 0, design: 0, development: 0, qa: 1.0, kt: 0, lead: 0, pmo: 0, other: 0,
  },
];

// ---------------------------------------------------------------------------
// Part 4: PTO entries (parsed from roster file)
// ---------------------------------------------------------------------------

interface PtoData {
  who: string;       // "LastName, FirstName"
  location: string;
  startDate: string; // ISO "YYYY-MM-DD"
  endDate: string;
}

const ptoEntries: PtoData[] = [
  // --- Marc Van Oordt ---
  { who: "Van Oordt, Marc", location: "Quebec", startDate: "2026-01-31", endDate: "2026-02-08" },

  // --- Ryan To ---
  { who: "To, Ryan", location: "Quebec", startDate: "2026-03-17", endDate: "2026-03-21" },

  // --- Emily Van Goethem ---
  { who: "Van Goethem, Emily", location: "Quebec", startDate: "2026-09-09", endDate: "2026-09-30" },

  // --- Carl Aubé ---
  { who: "Aubé, Carl", location: "Quebec", startDate: "2026-01-31", endDate: "2026-02-15" },

  // --- Serena Clermont (maternity leave — full range) ---
  { who: "Clermont, Serena", location: "Quebec", startDate: "2026-01-16", endDate: "2026-08-21" },

  // --- Rukmini Muley (single days) ---
  { who: "Muley, Rukmini", location: "India", startDate: "2026-01-13", endDate: "2026-01-13" },
  { who: "Muley, Rukmini", location: "India", startDate: "2026-01-14", endDate: "2026-01-14" },
  { who: "Muley, Rukmini", location: "India", startDate: "2026-01-15", endDate: "2026-01-15" },
  { who: "Muley, Rukmini", location: "India", startDate: "2026-01-16", endDate: "2026-01-16" },
  { who: "Muley, Rukmini", location: "India", startDate: "2026-01-23", endDate: "2026-01-23" },
  { who: "Muley, Rukmini", location: "India", startDate: "2026-02-19", endDate: "2026-02-19" },
  { who: "Muley, Rukmini", location: "India", startDate: "2026-03-04", endDate: "2026-03-04" },
  { who: "Muley, Rukmini", location: "India", startDate: "2026-03-19", endDate: "2026-03-19" },

  // --- Sanjeeb Mohapatra ---
  { who: "Mohapatra, Sanjeeb", location: "India", startDate: "2026-03-02", endDate: "2026-03-04" },

  // --- Abhishek Jha (single days + range) ---
  { who: "Jha, Abhishek", location: "India", startDate: "2026-01-15", endDate: "2026-01-15" },
  { who: "Jha, Abhishek", location: "India", startDate: "2026-02-25", endDate: "2026-02-25" },
  { who: "Jha, Abhishek", location: "India", startDate: "2026-02-27", endDate: "2026-02-27" },
  { who: "Jha, Abhishek", location: "India", startDate: "2026-03-03", endDate: "2026-03-05" },

  // --- Gopalakrishnan Subramaniam (range + single days) ---
  { who: "Subramaniam, Gopalakrishnan", location: "India", startDate: "2026-03-03", endDate: "2026-03-06" },
  { who: "Subramaniam, Gopalakrishnan", location: "India", startDate: "2026-03-31", endDate: "2026-03-31" },
  { who: "Subramaniam, Gopalakrishnan", location: "India", startDate: "2026-04-01", endDate: "2026-04-01" },

  // --- Carika Du Preez (long range) ---
  { who: "Du Preez, Carika", location: "Canada", startDate: "2026-01-30", endDate: "2026-02-24" },

  // --- Sahil Bhongade (single days) ---
  { who: "Bhongade, Sahil", location: "India", startDate: "2026-01-15", endDate: "2026-01-15" },
  { who: "Bhongade, Sahil", location: "India", startDate: "2026-01-23", endDate: "2026-01-23" },
  { who: "Bhongade, Sahil", location: "India", startDate: "2026-01-26", endDate: "2026-01-26" },
  { who: "Bhongade, Sahil", location: "India", startDate: "2026-02-19", endDate: "2026-02-19" },
  { who: "Bhongade, Sahil", location: "India", startDate: "2026-03-04", endDate: "2026-03-04" },

  // --- Mallika Jain (single days) ---
  { who: "Jain, Mallika", location: "India", startDate: "2026-02-13", endDate: "2026-02-13" },
  { who: "Jain, Mallika", location: "India", startDate: "2026-02-26", endDate: "2026-02-26" },
  { who: "Jain, Mallika", location: "India", startDate: "2026-03-18", endDate: "2026-03-18" },
  { who: "Jain, Mallika", location: "India", startDate: "2026-03-31", endDate: "2026-03-31" },
  { who: "Jain, Mallika", location: "India", startDate: "2026-04-02", endDate: "2026-04-02" },
  { who: "Jain, Mallika", location: "India", startDate: "2026-04-30", endDate: "2026-04-30" },
];

// ---------------------------------------------------------------------------
// Execute everything in a single transaction
// ---------------------------------------------------------------------------

const runAll = db.transaction(() => {
  console.log("=== Part 1: Fix TeamMember records ===\n");

  for (const fix of teamMemberFixes) {
    const result = updateTM.run(
      fix.stream, fix.allocation, fix.hrsPerWeek,
      fix.lastName, fix.firstName
    );
    if (result.changes > 0) {
      console.log(`  [FIX] TeamMember: ${fix.lastName}, ${fix.firstName} => stream=${fix.stream}, alloc=${fix.allocation}, hrs=${fix.hrsPerWeek}`);
    } else {
      console.log(`  [WARN] TeamMember: ${fix.lastName}, ${fix.firstName} — not found, skipped`);
    }
  }

  console.log("\n=== Part 2: Fix InitialCapacity records ===\n");

  for (const fix of capacityFixes) {
    const result = updateIC.run(
      fix.hrsPerWeek,
      fix.refinement, fix.design, fix.development, fix.qa,
      fix.kt, fix.lead, fix.pmo, fix.other,
      fix.lastName, fix.firstName
    );
    if (result.changes > 0) {
      console.log(`  [FIX] InitialCapacity: ${fix.lastName}, ${fix.firstName} => dev=${fix.development}, des=${fix.design}, qa=${fix.qa}, lead=${fix.lead}`);
    } else {
      console.log(`  [WARN] InitialCapacity: ${fix.lastName}, ${fix.firstName} — not found, skipped`);
    }
  }

  console.log("\n=== Part 3: Add new team members (14) ===\n");

  for (const m of newMembers) {
    const existing = checkTM.get(m.lastName, m.firstName) as any;
    if (existing) {
      console.log(`  [SKIP] ${m.lastName}, ${m.firstName} — already exists`);
      continue;
    }

    const tmId = randomUUID();
    insertTM.run(
      tmId,
      m.lastName, m.firstName, m.role, m.location,
      m.stream, m.ftPt, m.hrsPerWeek, m.allocation,
      m.pod, null // sheetRow
    );

    const icId = randomUUID();
    insertIC.run(
      icId,
      m.lastName, m.firstName, m.role, m.ftPt, m.hrsPerWeek,
      m.refinement, m.design, m.development, m.qa,
      m.kt, m.lead, m.pmo, m.other
    );

    console.log(`  [NEW] ${m.lastName}, ${m.firstName} — ${m.role} (${m.stream}, ${m.hrsPerWeek}h, alloc=${m.allocation})`);
  }

  console.log("\n=== Part 4: Import PTO entries ===\n");

  let ptoInserted = 0;
  let ptoSkipped = 0;

  for (const pto of ptoEntries) {
    const existing = checkPTO.get(pto.who, pto.startDate, pto.endDate) as any;
    if (existing) {
      ptoSkipped++;
      continue;
    }

    insertPTO.run(
      randomUUID(),
      pto.who, pto.location, null, // team = null
      pto.startDate, pto.endDate
    );
    ptoInserted++;

    const range = pto.startDate === pto.endDate
      ? pto.startDate
      : `${pto.startDate} → ${pto.endDate}`;
    console.log(`  [PTO] ${pto.who} | ${range}`);
  }

  if (ptoSkipped > 0) {
    console.log(`  [SKIP] ${ptoSkipped} PTO entries already existed`);
  }
  console.log(`  Inserted: ${ptoInserted} | Skipped: ${ptoSkipped}`);
});

// Run the transaction
try {
  runAll();
} catch (err) {
  console.error("\n[ERROR] Transaction failed, all changes rolled back:", err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Verification summary
// ---------------------------------------------------------------------------

console.log("\n=== Verification Summary ===\n");

const tmCount = (db.prepare("SELECT COUNT(*) as cnt FROM TeamMember").get() as any).cnt;
const icCount = (db.prepare("SELECT COUNT(*) as cnt FROM InitialCapacity").get() as any).cnt;
const ptoCount = (db.prepare("SELECT COUNT(*) as cnt FROM PtoEntry").get() as any).cnt;

console.log(`  TeamMembers:      ${tmCount} (was 28, expect 42)`);
console.log(`  InitialCapacity:  ${icCount} (was 28, expect 42)`);
console.log(`  PTO Entries:      ${ptoCount} (was 0, expect ~32)`);

// Verify architects are now DEV
const architects = db.prepare(
  "SELECT lastName, stream, allocation FROM TeamMember WHERE lastName IN ('Vargas', 'Aubé', 'Ojeda', 'Ran') ORDER BY lastName"
).all() as any[];

console.log("\n  Architects (should all be DEV):");
for (const a of architects) {
  const ok = a.stream === "DEV" ? "✓" : "✗";
  console.log(`    ${ok} ${a.lastName}: stream=${a.stream}, alloc=${a.allocation}`);
}

// Verify Chow and Porwal
const leads = db.prepare(
  "SELECT lastName, stream, allocation FROM TeamMember WHERE lastName IN ('Chow', 'Porwal') ORDER BY lastName"
).all() as any[];

console.log("\n  Dev Leads (allocation should be 0.8 and 0.5):");
for (const l of leads) {
  console.log(`    ${l.lastName}: stream=${l.stream}, alloc=${l.allocation}`);
}

console.log("\nDone!");
db.close();
