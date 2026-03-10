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

/** Normalise a date string to YYYY-MM-DD. Accepts YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY. */
function normaliseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or MM/DD/YYYY
  const slashParts = s.split(/[/.-]/);
  if (slashParts.length === 3) {
    const [a, b, c] = slashParts.map(Number);
    // If c looks like a 4-digit year
    if (c > 1000) {
      // If a > 12 it must be DD/MM/YYYY
      if (a > 12) {
        return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
      }
      // Otherwise treat as MM/DD/YYYY (US) if b <= 31
      if (b <= 31) {
        return `${c}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
      }
    }
    // If a is a 4-digit year (YYYY/MM/DD)
    if (a > 1000) {
      return `${a}-${String(b).padStart(2, "0")}-${String(c).padStart(2, "0")}`;
    }
  }

  return null;
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

      const startDate = normaliseDate(startRaw);
      const endDate = normaliseDate(endRaw);

      if (!startDate) {
        errors.push(`Row ${rowNum}: invalid start date "${startRaw}" for ${who}`);
        continue;
      }
      if (!endDate) {
        errors.push(`Row ${rowNum}: invalid end date "${endRaw}" for ${who}`);
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
