import { NextResponse } from "next/server";
import {
  deleteAllInitialCapacities,
  insertInitialCapacity,
} from "@/lib/data";

// Accepts tab-separated or comma-separated text pasted from Excel / Google Sheets.
// Columns are matched by header name (not position) so that sheets with different
// column orders or extra columns still import correctly. Expected headers include:
//
//   Last name · First name · Role · FT/PT · Hrs per week · Stream · Comments
//   Refinement · Design · Development · QA · KT · Lead · PMO
//   Retrofits / Integrations · OCM (Comms & Engagement) · OCM (End-User Training) · Other
//
// The caller may also pass `organization` in the body to tag every imported row
// (e.g. "Deloitte" or "York"). Rows without any header are rejected.

type TargetField =
  | "lastName" | "firstName" | "role" | "ftPt" | "hrsPerWeek"
  | "stream" | "comments"
  | "refinement" | "design" | "development" | "qa" | "kt"
  | "lead" | "pmo" | "retrofits" | "ocmComms" | "ocmTraining" | "other";

// Normalise a header cell to a lookup key (lowercase, strip punctuation/spaces).
function normalizeHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Map normalised header → target field on InitialCapacity.
const HEADER_MAP: Record<string, TargetField> = {
  lastname: "lastName",
  firstname: "firstName",
  role: "role",
  ftpt: "ftPt",
  hrsperweek: "hrsPerWeek",
  hrsperweekonproject: "hrsPerWeek",
  stream: "stream",
  team: "stream",
  comments: "comments",
  comment: "comments",
  refinement: "refinement",
  design: "design",
  development: "development",
  dev: "development",
  qa: "qa",
  kt: "kt",
  lead: "lead",
  pmo: "pmo",
  retrofits: "retrofits",
  retrofitsintegrations: "retrofits",
  integrations: "retrofits",
  ocmcommsengagement: "ocmComms",
  ocmcomms: "ocmComms",
  commsengagement: "ocmComms",
  ocmendusertraining: "ocmTraining",
  ocmtraining: "ocmTraining",
  endusertraining: "ocmTraining",
  other: "other",
};

function splitRow(line: string): string[] {
  return line.includes("\t") ? line.split("\t") : line.split(",");
}

function parsePercent(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.trim().replace("%", "").replace(",", ".");
  if (!cleaned) return 0;
  const num = Number(cleaned);
  if (Number.isNaN(num)) return 0;
  // Stored as fraction 0-1. Values > 1 are treated as percentages (50 → 0.5).
  return num > 1 ? num / 100 : num;
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const num = Number(raw.trim().replace(",", "."));
  return Number.isNaN(num) ? 0 : num;
}

function buildColumnIndex(headerCells: string[]): Partial<Record<TargetField, number>> {
  const index: Partial<Record<TargetField, number>> = {};
  headerCells.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    const field = HEADER_MAP[key];
    if (field && index[field] === undefined) {
      index[field] = i;
    }
  });
  return index;
}

function getCell(cols: string[], idx: number | undefined): string {
  if (idx === undefined) return "";
  return cols[idx]?.trim() ?? "";
}

export async function POST(request: Request) {
  const body = await request.json();
  const data: string = typeof body.data === "string" ? body.data : "";
  const replaceAll: boolean = body.replaceAll === true;
  const organization: string =
    typeof body.organization === "string" ? body.organization.trim() : "";

  if (!data.trim()) {
    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  }

  const lines = data.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json(
      { error: "Need at least a header row and one data row" },
      { status: 400 },
    );
  }

  const headerCells = splitRow(lines[0]);
  const col = buildColumnIndex(headerCells);

  if (col.lastName === undefined || col.firstName === undefined) {
    return NextResponse.json(
      {
        error:
          "Header row must include 'Last name' and 'First name'. Recognised columns: " +
          Object.keys(HEADER_MAP).sort().join(", "),
      },
      { status: 400 },
    );
  }

  const rows = lines.slice(1);
  const errors: { row: number; reason: string }[] = [];
  let imported = 0;
  let deleted = 0;

  if (replaceAll) {
    deleted = deleteAllInitialCapacities();
  }

  rows.forEach((line, idx) => {
    const cols = splitRow(line);
    const lastName = getCell(cols, col.lastName);
    const firstName = getCell(cols, col.firstName);

    if (!lastName && !firstName) return; // blank row

    const role = getCell(cols, col.role);
    if (!role) {
      errors.push({ row: idx + 2, reason: "Missing role" });
      return;
    }

    const ftPtRaw = (getCell(cols, col.ftPt) || "FT").toUpperCase();
    const ftPt = ftPtRaw === "PT" ? "PT" : "FT";

    try {
      insertInitialCapacity({
        lastName,
        firstName,
        role,
        location: "",
        organization,
        stream: getCell(cols, col.stream),
        ftPt,
        hrsPerWeek: parseNumber(getCell(cols, col.hrsPerWeek)),
        isActive: true,
        refinement: parsePercent(getCell(cols, col.refinement)),
        design: parsePercent(getCell(cols, col.design)),
        development: parsePercent(getCell(cols, col.development)),
        qa: parsePercent(getCell(cols, col.qa)),
        kt: parsePercent(getCell(cols, col.kt)),
        lead: parsePercent(getCell(cols, col.lead)),
        pmo: parsePercent(getCell(cols, col.pmo)),
        retrofits: parsePercent(getCell(cols, col.retrofits)),
        ocmComms: parsePercent(getCell(cols, col.ocmComms)),
        ocmTraining: parsePercent(getCell(cols, col.ocmTraining)),
        other: parsePercent(getCell(cols, col.other)),
      });
      imported++;
    } catch (e) {
      errors.push({
        row: idx + 2,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return NextResponse.json({
    imported,
    deleted,
    replaced: replaceAll,
    organization,
    errors,
  });
}
