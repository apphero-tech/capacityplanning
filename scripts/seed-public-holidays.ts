/**
 * Seed public holidays for Quebec, Canada (excluding QC) and India for 2026
 * and 2027. Idempotent: runs a "skip if same (country, date)" check so the
 * script is safe to re-run after every pull.
 *
 * Usage:
 *   npm run seed:holidays
 *
 * Country convention — kept consistent with the allocation file's "location"
 * column and the existing capacity engine:
 *   - "Quebec" = Quebec-specific statutory holidays
 *   - "Canada" = federal/provincial holidays observed outside Quebec
 *   - "India"  = India national holidays
 *
 * Religious Indian holidays (Holi, Diwali, Eid) vary by lunar/Hindu
 * calendar so only nationally-fixed gazetted dates are hardcoded here.
 */
import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "prisma/dev.db");

type Holiday = { date: string; name: string; country: string };

const HOLIDAYS: Holiday[] = [
  // ─────────────────────── Quebec 2026 ──────────────────────────────────
  { date: "2026-01-01", name: "Jour de l'An",                              country: "Quebec" },
  { date: "2026-04-03", name: "Vendredi saint",                            country: "Quebec" },
  { date: "2026-04-06", name: "Lundi de Pâques",                           country: "Quebec" },
  { date: "2026-05-18", name: "Journée nationale des patriotes",           country: "Quebec" },
  { date: "2026-06-24", name: "Fête nationale du Québec",                  country: "Quebec" },
  { date: "2026-07-01", name: "Fête du Canada",                            country: "Quebec" },
  { date: "2026-09-07", name: "Fête du Travail",                           country: "Quebec" },
  { date: "2026-10-12", name: "Action de grâce",                           country: "Quebec" },
  { date: "2026-12-25", name: "Noël",                                      country: "Quebec" },

  // ─────────────────────── Quebec 2027 ──────────────────────────────────
  { date: "2027-01-01", name: "Jour de l'An",                              country: "Quebec" },
  { date: "2027-03-26", name: "Vendredi saint",                            country: "Quebec" },
  { date: "2027-03-29", name: "Lundi de Pâques",                           country: "Quebec" },
  { date: "2027-05-24", name: "Journée nationale des patriotes",           country: "Quebec" },
  { date: "2027-06-24", name: "Fête nationale du Québec",                  country: "Quebec" },
  { date: "2027-07-01", name: "Fête du Canada",                            country: "Quebec" },
  { date: "2027-09-06", name: "Fête du Travail",                           country: "Quebec" },
  { date: "2027-10-11", name: "Action de grâce",                           country: "Quebec" },
  { date: "2027-12-27", name: "Noël (observé)",                            country: "Quebec" },

  // ─────────────────────── Canada (rest of country) 2026 ────────────────
  { date: "2026-01-01", name: "New Year's Day",                            country: "Canada" },
  { date: "2026-02-16", name: "Family Day",                                country: "Canada" },
  { date: "2026-04-03", name: "Good Friday",                               country: "Canada" },
  { date: "2026-05-18", name: "Victoria Day",                              country: "Canada" },
  { date: "2026-07-01", name: "Canada Day",                                country: "Canada" },
  { date: "2026-08-03", name: "Civic Holiday",                             country: "Canada" },
  { date: "2026-09-07", name: "Labour Day",                                country: "Canada" },
  { date: "2026-09-30", name: "National Day for Truth and Reconciliation", country: "Canada" },
  { date: "2026-10-12", name: "Thanksgiving",                              country: "Canada" },
  { date: "2026-11-11", name: "Remembrance Day",                           country: "Canada" },
  { date: "2026-12-25", name: "Christmas Day",                             country: "Canada" },
  { date: "2026-12-28", name: "Boxing Day (observed)",                     country: "Canada" },

  // ─────────────────────── Canada (rest of country) 2027 ────────────────
  { date: "2027-01-01", name: "New Year's Day",                            country: "Canada" },
  { date: "2027-02-15", name: "Family Day",                                country: "Canada" },
  { date: "2027-03-26", name: "Good Friday",                               country: "Canada" },
  { date: "2027-05-24", name: "Victoria Day",                              country: "Canada" },
  { date: "2027-07-01", name: "Canada Day",                                country: "Canada" },
  { date: "2027-08-02", name: "Civic Holiday",                             country: "Canada" },
  { date: "2027-09-06", name: "Labour Day",                                country: "Canada" },
  { date: "2027-09-30", name: "National Day for Truth and Reconciliation", country: "Canada" },
  { date: "2027-10-11", name: "Thanksgiving",                              country: "Canada" },
  { date: "2027-11-11", name: "Remembrance Day",                           country: "Canada" },
  { date: "2027-12-27", name: "Christmas (observed)",                      country: "Canada" },
  { date: "2027-12-28", name: "Boxing Day (observed)",                     country: "Canada" },

  // ─────────────────────── India 2026 ────────────────────────────────────
  { date: "2026-01-26", name: "Republic Day",                              country: "India" },
  { date: "2026-03-04", name: "Holi",                                      country: "India" },
  { date: "2026-03-20", name: "Eid ul-Fitr",                               country: "India" },
  { date: "2026-08-15", name: "Independence Day",                          country: "India" },
  { date: "2026-10-02", name: "Gandhi Jayanti",                            country: "India" },
  { date: "2026-10-20", name: "Dussehra",                                  country: "India" },
  { date: "2026-11-08", name: "Diwali",                                    country: "India" },
  { date: "2026-12-25", name: "Christmas",                                 country: "India" },

  // ─────────────────────── India 2027 ────────────────────────────────────
  { date: "2027-01-26", name: "Republic Day",                              country: "India" },
  { date: "2027-03-22", name: "Holi",                                      country: "India" },
  { date: "2027-03-10", name: "Eid ul-Fitr",                               country: "India" },
  { date: "2027-08-15", name: "Independence Day",                          country: "India" },
  { date: "2027-10-02", name: "Gandhi Jayanti",                            country: "India" },
  { date: "2027-10-09", name: "Dussehra",                                  country: "India" },
  { date: "2027-10-28", name: "Diwali",                                    country: "India" },
  { date: "2027-12-25", name: "Christmas",                                 country: "India" },
];

function main() {
  const db = new Database(DB_PATH);

  // Existing (country, date) pairs so we don't insert duplicates.
  const existing = new Set<string>(
    (db.prepare("SELECT country, date FROM PublicHoliday").all() as {
      country: string;
      date: string;
    }[]).map((r) => `${r.country}|${r.date}`),
  );

  const insert = db.prepare(
    "INSERT INTO PublicHoliday (id, date, name, country, days) VALUES (?, ?, ?, ?, 1)",
  );

  let inserted = 0;
  let skipped = 0;
  for (const h of HOLIDAYS) {
    if (existing.has(`${h.country}|${h.date}`)) {
      skipped++;
      continue;
    }
    insert.run(randomUUID(), h.date, h.name, h.country);
    inserted++;
  }

  db.close();
  console.log(
    `Public holidays: ${inserted} added, ${skipped} already present (${HOLIDAYS.length} total in seed).`,
  );
}

main();
