/**
 * Jira backlog import parser — CSV only.
 *
 * Handles variable column names (EN/FR), zero-width Unicode characters,
 * and flexible header detection.
 */

import { deriveStream, cleanStatus } from "./stream-mapper";
import type { BacklogStream } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Detected column indices (0-based). */
interface ColumnMap {
  key: number;
  summary: number;
  status: number;
  storyPoints: number | null;
  pod: number | null;
  dependency: number | null;
  group: number | null;
  sprint: number | null;
}

/** A parsed story row before DB insertion. */
export interface ParsedStory {
  key: string;
  summary: string;
  status: string;
  storyPoints: number | null;
  pod: string | null;
  dependency: string | null;
  groupName: string | null;
  stream: BacklogStream;
  /** Raw Sprint cell value, e.g. "Sprint 5" or "Sprint 4;Sprint 5" — null when empty. */
  sprintRaw: string | null;
}

export interface ParseResult {
  stories: ParsedStory[];
  errors: string[];
  detectedColumns: string[];
}

// ---------------------------------------------------------------------------
// Header detection patterns (case-insensitive)
// ---------------------------------------------------------------------------

const KEY_PATTERNS = [/^key$/i, /^issue\s*key$/i, /^cl[eé]$/i, /^num[eé]ro$/i, /^issue\s*id$/i];
const SUMMARY_PATTERNS = [/^summary$/i, /^title$/i, /^r[eé]sum[eé]$/i, /^titre$/i];
const STATUS_PATTERNS = [/^status$/i, /^statut$/i, /^[eé]tat$/i, /^state$/i];
const SP_PATTERNS = [/^story\s*point/i, /^sp$/i, /^points?$/i, /point.*histoire/i, /^effort$/i, /^custom\s*field.*story\s*point/i];
const POD_PATTERNS = [/^pod$/i, /pod.?name/i, /^custom\s*field.*pod_?name/i];
const DEP_PATTERNS = [/depend/i, /d[eé]pendance/i, /^delivery\s*depend/i, /^blocker$/i];
const GROUP_PATTERNS = [/^group$/i, /^groupe$/i, /\(group\)/i, /^custom\s*field.*\bgroup\b/i];
const SPRINT_PATTERNS = [/^sprint$/i, /^sprints$/i, /^custom\s*field.*sprint$/i];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(value.trim()));
}

/** Strip zero-width and invisible Unicode characters from any value. */
function stripInvisible(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u2028\u2029]/g, "").trim();
}

/** Convert a cell value to a number or null. */
function toNumber(val: string): number | null {
  const str = val.trim();
  if (!str) return null;
  const n = Number(str);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

/** Detect column mapping from an array of header strings. Returns 0-based indices. */
function detectColumnsFromArray(headers: string[]): ColumnMap | null {
  const map: Partial<ColumnMap> = {};

  for (let i = 0; i < headers.length; i++) {
    const val = stripInvisible(headers[i]);
    if (!val) continue;

    if (map.key === undefined && matchesAny(val, KEY_PATTERNS)) map.key = i;
    else if (map.summary === undefined && matchesAny(val, SUMMARY_PATTERNS)) map.summary = i;
    else if (map.status === undefined && matchesAny(val, STATUS_PATTERNS)) map.status = i;
    else if (map.storyPoints === undefined && matchesAny(val, SP_PATTERNS)) map.storyPoints = i;
    else if (map.pod === undefined && matchesAny(val, POD_PATTERNS)) map.pod = i;
    else if (map.dependency === undefined && matchesAny(val, DEP_PATTERNS)) map.dependency = i;
    else if (map.group === undefined && matchesAny(val, GROUP_PATTERNS)) map.group = i;
    else if (map.sprint === undefined && matchesAny(val, SPRINT_PATTERNS)) map.sprint = i;
  }

  // Key, summary, and status are required
  if (map.key === undefined || map.summary === undefined || map.status === undefined) return null;

  return {
    key: map.key,
    summary: map.summary,
    status: map.status,
    storyPoints: map.storyPoints ?? null,
    pod: map.pod ?? null,
    dependency: map.dependency ?? null,
    group: map.group ?? null,
    sprint: map.sprint ?? null,
  };
}

/** Build list of detected column names for user feedback. */
function buildDetectedList(cm: ColumnMap): string[] {
  const detected: string[] = ["Key", "Summary", "Status"];
  if (cm.storyPoints !== null) detected.push("Story Points");
  if (cm.pod !== null) detected.push("Pod");
  if (cm.dependency !== null) detected.push("Dependency");
  if (cm.group !== null) detected.push("Group");
  if (cm.sprint !== null) detected.push("Sprint");
  return detected;
}

/** Process rows into ParsedStory[] (legacy single-sprint). */
function processRows(
  rows: string[][],
  columnMap: ColumnMap,
  startRow: number,
): { stories: ParsedStory[]; errors: string[] } {
  const stories: ParsedStory[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = startRow + i;

    const key = stripInvisible(row[columnMap.key] ?? "");
    if (!key) continue; // skip empty rows

    const summary = stripInvisible(row[columnMap.summary] ?? "");
    const rawStatus = stripInvisible(row[columnMap.status] ?? "");

    if (!summary && !rawStatus) continue; // skip fully empty data rows

    if (!summary) {
      errors.push(`Row ${rowNumber}: missing summary for key "${key}"`);
      continue;
    }
    if (!rawStatus) {
      errors.push(`Row ${rowNumber}: missing status for key "${key}"`);
      continue;
    }

    // Deduplicate by key (keep first occurrence)
    if (seenKeys.has(key)) {
      errors.push(`Row ${rowNumber}: duplicate key "${key}" — skipped`);
      continue;
    }
    seenKeys.add(key);

    const status = cleanStatus(rawStatus);

    const storyPoints =
      columnMap.storyPoints !== null ? toNumber(row[columnMap.storyPoints] ?? "") : null;

    const pod =
      columnMap.pod !== null ? stripInvisible(row[columnMap.pod] ?? "") || null : null;

    const dependency =
      columnMap.dependency !== null ? stripInvisible(row[columnMap.dependency] ?? "") || null : null;

    const groupName =
      columnMap.group !== null ? stripInvisible(row[columnMap.group] ?? "") || null : null;

    const sprintRaw =
      columnMap.sprint !== null ? stripInvisible(row[columnMap.sprint] ?? "") || null : null;

    const stream = deriveStream(status);

    stories.push({
      key,
      summary,
      status,
      storyPoints,
      pod,
      dependency,
      groupName,
      stream,
      sprintRaw,
    });
  }

  return { stories, errors };
}

// ---------------------------------------------------------------------------
// CSV parser (RFC 4180)
// ---------------------------------------------------------------------------

/**
 * Parse CSV text, handling quoted fields with embedded commas and newlines.
 * Jira CSV uses standard RFC 4180 format.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
      } else if (ch === "\r") {
        // Handle \r\n or \r alone
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.some((f) => f.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        if (i < text.length && text[i] === "\n") i++;
      } else if (ch === "\n") {
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.some((f) => f.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Last field/row
  currentRow.push(currentField);
  if (currentRow.some((f) => f.trim())) {
    rows.push(currentRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Shared CSV parsing setup
// ---------------------------------------------------------------------------

function parseAndDetect(buffer: Buffer, fileName: string): {
  error?: ParseResult;
  columnMap: ColumnMap;
  headerRowIdx: number;
  allRows: string[][];
} | { error: ParseResult } {
  const name = fileName.toLowerCase();

  if (!name.endsWith(".csv")) {
    return {
      error: {
        stories: [],
        errors: [`Unsupported file format. Please export from Jira as CSV.`],
        detectedColumns: [],
      },
    };
  }

  const text = buffer.toString("utf-8");
  const allRows = parseCsvText(text);

  if (allRows.length < 2) {
    return {
      error: {
        stories: [],
        errors: ["CSV file has no data rows"],
        detectedColumns: [],
      },
    };
  }

  // Try header detection on row 0, then row 1 (in case of title row)
  let columnMap = detectColumnsFromArray(allRows[0]);
  let headerRowIdx = 0;

  if (!columnMap && allRows.length > 2) {
    columnMap = detectColumnsFromArray(allRows[1]);
    headerRowIdx = 1;
  }

  if (!columnMap) {
    return {
      error: {
        stories: [],
        errors: [
          "Could not detect required columns (Key, Summary, Status). Check the CSV file headers.",
        ],
        detectedColumns: [],
      },
    };
  }

  return { columnMap, headerRowIdx, allRows };
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

/**
 * Parse a Jira CSV export and return structured story data.
 * Used when the user selects a target sprint and uploads its backlog CSV.
 */
export async function parseJiraFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  const result = parseAndDetect(buffer, fileName);
  if ("error" in result && !("columnMap" in result)) {
    return result.error;
  }
  const { columnMap, headerRowIdx, allRows } = result as {
    columnMap: ColumnMap;
    headerRowIdx: number;
    allRows: string[][];
  };

  const dataRows = allRows.slice(headerRowIdx + 1);
  const detected = buildDetectedList(columnMap);
  const { stories, errors } = processRows(dataRows, columnMap, headerRowIdx + 2);

  return { stories, errors, detectedColumns: detected };
}
