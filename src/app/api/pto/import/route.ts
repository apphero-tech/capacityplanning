import { NextRequest, NextResponse } from "next/server";
import { parseCsvText } from "@/lib/excel-import";
import { insertPtoEntry } from "@/lib/data";

// ---------------------------------------------------------------------------
// Column detection patterns (flexible, case-insensitive)
// ---------------------------------------------------------------------------

const WHO_PATTERNS = [/^who$/i, /^name$/i, /^nom$/i, /^employee$/i, /^member$/i, /^person$/i, /^team\s*member$/i, /^assigned/i];
const LOCATION_PATTERNS = [/^location$/i, /^country$/i, /^pays$/i, /^lieu$/i, /^site$/i];
const START_PATTERNS = [/^start/i, /^from$/i, /^d[eé]but$/i, /^begin/i];
const END_PATTERNS = [/^end/i, /^to$/i, /^fin$/i, /^until$/i, /^return$/i, /^due/i];
const TEAM_PATTERNS = [/^team$/i, /^[eé]quipe$/i, /^group$/i];

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(value.trim()));
}

function stripInvisible(s: string): string {
  return s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u2028\u2029]/g, "").trim();
}

type DateFormat = "DD/MM" | "MM/DD";

/**
 * Scan every date-looking cell in the rows and pick the format best supported
 * by the evidence. A cell like "31/05/2026" forces DD/MM (day > 12), "05/31/
 * 2026" forces MM/DD. In the ambiguous case (both components ≤ 12) we count
 * nothing and fall back to the configured default. The default is DD/MM since
 * most of our sources (Microsoft Planner in Canada/EU locale) emit that.
 */
function detectDateFormat(
  rows: string[][],
  dateColumns: number[],
  defaultFormat: DateFormat = "DD/MM",
): DateFormat {
  let ddmm = 0;
  let mmdd = 0;
  for (const row of rows) {
    for (const c of dateColumns) {
      const s = (row[c] ?? "").trim();
      const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 12 && b <= 12) ddmm++;
      else if (b > 12 && a <= 12) mmdd++;
    }
  }
  if (ddmm === 0 && mmdd === 0) return defaultFormat;
  return ddmm >= mmdd ? "DD/MM" : "MM/DD";
}

/**
 * Normalise a date string to YYYY-MM-DD using the detected format for the
 * slash/dash/period cases. ISO (YYYY-MM-DD) and YYYY/MM/DD are always parsed
 * unambiguously regardless of the hint.
 */
function normaliseDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parts = s.split(/[/.-]/);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts.map(Number);

  // YYYY/MM/DD
  if (a > 1000) {
    return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
  }

  // DD/MM/YYYY or MM/DD/YYYY — disambiguate with hard constraints first, then
  // fall back to the detected format.
  if (c <= 1000) return null;
  if (a > 12 && b <= 12) {
    return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  if (b > 12 && a <= 12) {
    return `${c}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // Both ≤ 12 — ambiguous, trust the detected format.
  if (format === "DD/MM") {
    return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  return `${c}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Unsupported file type. Please provide a CSV file." },
        { status: 400 }
      );
    }

    const text = Buffer.from(await file.arrayBuffer()).toString("utf-8");
    const rows = parseCsvText(text);

    if (rows.length < 2) {
      return NextResponse.json(
        { error: "CSV file has no data rows" },
        { status: 400 }
      );
    }

    // Detect columns from header row
    const headers = rows[0];
    let whoCol: number | null = null;
    let locationCol: number | null = null;
    let startCol: number | null = null;
    let endCol: number | null = null;
    let teamCol: number | null = null;

    for (let i = 0; i < headers.length; i++) {
      const val = stripInvisible(headers[i]);
      if (!val) continue;
      if (whoCol === null && matchesAny(val, WHO_PATTERNS)) whoCol = i;
      else if (locationCol === null && matchesAny(val, LOCATION_PATTERNS)) locationCol = i;
      else if (startCol === null && matchesAny(val, START_PATTERNS)) startCol = i;
      else if (endCol === null && matchesAny(val, END_PATTERNS)) endCol = i;
      else if (teamCol === null && matchesAny(val, TEAM_PATTERNS)) teamCol = i;
    }

    if (whoCol === null || startCol === null || endCol === null) {
      return NextResponse.json(
        {
          error: "Could not detect required columns. Expected: Who/Name, Start Date, End Date. Optional: Location, Team.",
          detectedHeaders: headers.map((h) => stripInvisible(h)).filter(Boolean),
        },
        { status: 400 }
      );
    }

    const detectedColumns: string[] = ["Who", "Start Date", "End Date"];
    if (locationCol !== null) detectedColumns.push("Location");
    if (teamCol !== null) detectedColumns.push("Team");

    // Figure out whether the date columns are DD/MM or MM/DD before parsing
    // any row — a single global answer avoids inconsistencies across a file.
    const dataRows = rows.slice(1);
    const dateFormat = detectDateFormat(dataRows, [startCol, endCol]);
    detectedColumns.push(`Dates: ${dateFormat}/YYYY`);

    // Process data rows
    const errors: string[] = [];
    let imported = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      const who = stripInvisible(row[whoCol] ?? "");
      if (!who) continue; // skip empty rows

      const startRaw = stripInvisible(row[startCol] ?? "");
      const endRaw = stripInvisible(row[endCol] ?? "");

      let startDate = normaliseDate(startRaw, dateFormat);
      let endDate = normaliseDate(endRaw, dateFormat);

      // One-date rows mean a single-day PTO. Fall back to the other date so
      // we still capture the entry instead of dropping it. If neither is
      // valid we skip and keep the warning.
      if (startDate && !endDate) endDate = startDate;
      if (!startDate && endDate) startDate = endDate;

      if (!startDate || !endDate) {
        errors.push(`Row ${rowNum}: no valid date for ${who}`);
        continue;
      }

      const location = locationCol !== null
        ? stripInvisible(row[locationCol] ?? "") || "Unknown"
        : "Unknown";
      const team = teamCol !== null
        ? stripInvisible(row[teamCol] ?? "") || null
        : null;

      insertPtoEntry({ who, location, team, startDate, endDate });
      imported++;
    }

    return NextResponse.json({
      success: true,
      imported,
      warnings: errors,
      detectedColumns,
    });
  } catch (err) {
    console.error("PTO import error:", err);
    return NextResponse.json(
      { error: "Failed to import PTO entries", details: String(err) },
      { status: 500 }
    );
  }
}
