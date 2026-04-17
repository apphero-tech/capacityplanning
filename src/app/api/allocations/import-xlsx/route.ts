import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  deleteAllInitialCapacities,
  insertInitialCapacity,
} from "@/lib/data";

// Accepts an .xlsx file with one or more sheets, where each sheet represents an
// organization (e.g. "Deloitte", "York"). The sheet name is used as the
// organization tag. Header rows are detected automatically by searching for
// "Last name" / "First name" in the first few rows — this accommodates the
// common pattern of a decorative title on row 1 and real headers on row 2.

type TargetField =
  | "lastName" | "firstName" | "role" | "ftPt" | "hrsPerWeek"
  | "stream" | "comments"
  | "refinement" | "design" | "development" | "qa" | "kt"
  | "lead" | "pmo" | "retrofits" | "ocmComms" | "ocmTraining" | "other";

function normalizeHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

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

function cellString(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v && v.result != null) return String(v.result);
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
  }
  return String(v);
}

function toPercent(v: ExcelJS.CellValue): number {
  const s = cellString(v).trim();
  if (!s) return 0;
  const cleaned = s.replace("%", "").replace(",", ".");
  const num = Number(cleaned);
  if (Number.isNaN(num)) return 0;
  return num > 1 ? num / 100 : num;
}

function toNumber(v: ExcelJS.CellValue): number {
  const s = cellString(v).trim();
  if (!s) return 0;
  const num = Number(s.replace(",", "."));
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Scan a worksheet's first few rows to locate the header row — the one
 * containing both "last name" and "first name". Returns -1 when no such row
 * is found (sheet is probably not an allocation sheet and should be skipped).
 */
function findHeaderRow(ws: ExcelJS.Worksheet): number {
  const maxScan = Math.min(5, ws.rowCount);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const normalisedCells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      normalisedCells.push(normalizeHeader(cellString(row.getCell(c).value)));
    }
    if (normalisedCells.includes("lastname") && normalisedCells.includes("firstname")) {
      return r;
    }
  }
  return -1;
}

/** Build a mapping from our target fields to column indices (1-based). */
function buildColumnIndex(
  ws: ExcelJS.Worksheet,
  headerRow: number,
): Partial<Record<TargetField, number>> {
  const row = ws.getRow(headerRow);
  const index: Partial<Record<TargetField, number>> = {};
  for (let c = 1; c <= ws.columnCount; c++) {
    const key = normalizeHeader(cellString(row.getCell(c).value));
    const field = HEADER_MAP[key];
    if (field && index[field] === undefined) {
      index[field] = c;
    }
  }
  return index;
}

function getCell(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  col: number | undefined,
): ExcelJS.CellValue {
  if (col === undefined) return null;
  return ws.getRow(rowNum).getCell(col).value;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const replaceAll = formData.get("replaceAll") === "true";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Only .xlsx files are supported" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    return NextResponse.json(
      { error: `Could not open spreadsheet: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  let deleted = 0;
  if (replaceAll) {
    deleted = deleteAllInitialCapacities();
  }

  const perSheet: {
    sheet: string;
    organization: string;
    imported: number;
    skippedNoRole: number;
    skippedEmpty: number;
    rows: number;
  }[] = [];
  const errors: { sheet: string; row: number; reason: string }[] = [];

  for (const ws of wb.worksheets) {
    const headerRow = findHeaderRow(ws);
    if (headerRow === -1) {
      // Not an allocation sheet — silently skip (a doc may have a "Guide" tab etc.)
      continue;
    }

    const col = buildColumnIndex(ws, headerRow);
    const organization = ws.name.trim();
    let imported = 0;
    let skippedNoRole = 0;
    let skippedEmpty = 0;
    let totalRows = 0;

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const lastName = cellString(getCell(ws, r, col.lastName)).trim();
      const firstName = cellString(getCell(ws, r, col.firstName)).trim();
      if (!lastName && !firstName) {
        skippedEmpty++;
        continue;
      }
      // Exclude obvious aggregate rows like "Total".
      if (/^total$/i.test(lastName)) {
        skippedEmpty++;
        continue;
      }

      totalRows++;
      const role = cellString(getCell(ws, r, col.role)).trim();
      // Rows without a role are placeholders (e.g. future SFMC team — flagged
      // by a "Comments" cell in the xlsx). Skip them: one line = one actual
      // resource. When those people join, their role gets filled in the
      // source sheet and the next import will pick them up.
      if (!role) {
        skippedNoRole++;
        errors.push({ sheet: ws.name, row: r, reason: "Missing role — likely placeholder, skipped" });
        continue;
      }

      const ftPtRaw = cellString(getCell(ws, r, col.ftPt)).trim().toUpperCase();
      const ftPt = ftPtRaw === "PT" ? "PT" : "FT";

      try {
        insertInitialCapacity({
          lastName,
          firstName,
          role,
          location: "",
          organization,
          stream: cellString(getCell(ws, r, col.stream)).trim(),
          ftPt,
          hrsPerWeek: toNumber(getCell(ws, r, col.hrsPerWeek)),
          isActive: true,
          refinement: toPercent(getCell(ws, r, col.refinement)),
          design: toPercent(getCell(ws, r, col.design)),
          development: toPercent(getCell(ws, r, col.development)),
          qa: toPercent(getCell(ws, r, col.qa)),
          kt: toPercent(getCell(ws, r, col.kt)),
          lead: toPercent(getCell(ws, r, col.lead)),
          pmo: toPercent(getCell(ws, r, col.pmo)),
          retrofits: toPercent(getCell(ws, r, col.retrofits)),
          ocmComms: toPercent(getCell(ws, r, col.ocmComms)),
          ocmTraining: toPercent(getCell(ws, r, col.ocmTraining)),
          other: toPercent(getCell(ws, r, col.other)),
        });
        imported++;
      } catch (e) {
        errors.push({
          sheet: ws.name,
          row: r,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    perSheet.push({
      sheet: ws.name,
      organization,
      imported,
      skippedNoRole,
      skippedEmpty,
      rows: totalRows,
    });
  }

  const totalImported = perSheet.reduce((s, p) => s + p.imported, 0);
  if (perSheet.length === 0) {
    return NextResponse.json(
      { error: "No recognizable allocation sheet found (needs 'Last name' + 'First name' headers)" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    imported: totalImported,
    replaced: replaceAll,
    deleted,
    perSheet,
    errors,
  });
}
