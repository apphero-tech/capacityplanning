import ExcelJS from "exceljs";
import type {
  Sprint,
  InitialCapacity,
  Story,
  SprintStory,
  PublicHoliday,
  ProjectHoliday,
  PtoEntry,
} from "@/types";
import {
  computeDevCapacityFromIC,
  computeStreamCapacityFromIC,
  computeICMemberNetHrs,
  computeDevProjection,
  computeCapacityRows,
  isExcludedStory,
} from "./capacity-engine";
import { STREAM_LABELS } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportData {
  sprints: Sprint[];
  selectedSprints: Sprint[];
  initialCapacities: InitialCapacity[];
  storiesBySprint: Record<string, SprintStory[]>;
  publicHolidays: PublicHoliday[];
  projectHolidays: ProjectHoliday[];
  ptoEntries: PtoEntry[];
}

// ---------------------------------------------------------------------------
// York brand colours (ARGB)
// ---------------------------------------------------------------------------

const YORK_RED = "FFE31837";
const YORK_DARK = "FFAF0D1A";
const WHITE = "FFFFFFFF";
const LIGHT_GRAY = "FFF2F2F2";
const MEDIUM_GRAY = "FFD9D9D9";
const DARK_TEXT = "FF1A1A1A";
const GREEN = "FF10B981";
const AMBER = "FFF59E0B";
const RED_STATUS = "FFDC2626";

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function applyTitleRow(
  sheet: ExcelJS.Worksheet,
  text: string,
  columnCount: number,
): void {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, columnCount);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 16, color: { argb: WHITE } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: YORK_RED },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  row.height = 32;
}

function applySubtitleRow(
  sheet: ExcelJS.Worksheet,
  text: string,
  columnCount: number,
): void {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, columnCount);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 11, color: { argb: WHITE } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: YORK_DARK },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  row.height = 24;
}

function applyHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: YORK_RED },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: YORK_DARK } },
    };
  });
  row.height = 22;
}

function applyDataRowStriping(row: ExcelJS.Row, rowIndex: number): void {
  if (rowIndex % 2 === 0) {
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: LIGHT_GRAY },
      };
    });
  }
}

function applyDataCellDefaults(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { size: 10, color: { argb: DARK_TEXT } };
    cell.alignment = { vertical: "middle" };
    cell.border = {
      bottom: { style: "hair", color: { argb: MEDIUM_GRAY } },
    };
  });
}

function autoWidth(sheet: ExcelJS.Worksheet, minWidth = 10, maxWidth = 40): void {
  sheet.columns.forEach((column) => {
    let max = minWidth;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const length = cell.value ? String(cell.value).length + 2 : minWidth;
      if (length > max) max = length;
    });
    column.width = Math.min(max, maxWidth);
  });
}

function addBlankRow(sheet: ExcelJS.Worksheet): void {
  sheet.addRow([]);
}

function formatPercent(value: number | null): string {
  if (value === null) return "N/A";
  return `${value.toFixed(1)}%`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusColor(status: string): string {
  switch (status) {
    case "OK":
      return GREEN;
    case "At Risk":
      return AMBER;
    case "Over":
      return RED_STATUS;
    default:
      return MEDIUM_GRAY;
  }
}

function sprintLabel(sprints: Sprint[]): string {
  if (sprints.length === 1) return sprints[0].name;
  return `${sprints[0].name} - ${sprints[sprints.length - 1].name}`;
}

// ---------------------------------------------------------------------------
// Computation helpers (derive computed data from raw inputs)
// ---------------------------------------------------------------------------

function computeStoriesForSprint(data: ExportData, sprint?: Sprint): Story[] {
  const s = sprint ?? primarySprint(data);
  const sprintStories = data.storiesBySprint[s.id] ?? [];
  return sprintStories.map((st) => ({
    key: st.key,
    summary: st.summary,
    status: st.status,
    storyPoints: st.storyPoints,
    pod: st.pod,
    dependency: st.dependency,
    stream: st.stream,
    isExcluded: st.isExcluded,
  }));
}

function primarySprint(data: ExportData): Sprint {
  return data.selectedSprints[0];
}

// ---------------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------------

/**
 * Dashboard sheet: KPI summary table and capacity-vs-scope overview.
 */
export function buildDashboardSheet(
  workbook: ExcelJS.Workbook,
  data: ExportData,
): void {
  const sheet = workbook.addWorksheet("Dashboard", {
    properties: { tabColor: { argb: YORK_RED } },
  });

  const sprint = primarySprint(data);
  const stories = computeStoriesForSprint(data);
  const devCapacities = computeDevCapacityFromIC(data.initialCapacities, sprint, data.publicHolidays, data.projectHolidays, data.ptoEntries);
  const streamHrs = computeStreamCapacityFromIC(data.initialCapacities, sprint, data.publicHolidays, data.projectHolidays, data.ptoEntries);
  const totalBacklogSP = stories
    .filter((s) => !s.isExcluded)
    .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
  const devProjection = computeDevProjection(
    devCapacities,
    sprint.velocityProven ?? 0,
    sprint.velocityTarget ?? 0,
    totalBacklogSP,
  );

  // KPI values
  const activeStories = stories.filter((s) => !s.isExcluded);
  const teamSize = data.initialCapacities.length;
  const totalNetCapacity = data.initialCapacities.reduce(
    (sum, m) => sum + computeICMemberNetHrs(m, sprint, data.publicHolidays, data.projectHolidays, data.ptoEntries),
    0,
  );

  const colCount = 4;

  // Title
  applyTitleRow(sheet, `Dashboard - ${sprintLabel(data.selectedSprints)}`, colCount);
  addBlankRow(sheet);

  // KPI summary section
  applySubtitleRow(sheet, "Key Performance Indicators", colCount);

  const kpiData: [string, string | number][] = [
    ["Current Sprint", sprint.name],
    ["Team Size", teamSize],
    ["Total Net Capacity (hrs)", totalNetCapacity.toFixed(1)],
    ["DEV Net Capacity (hrs)", devProjection.netDevCapacity.toFixed(1)],
    ["Total Backlog SP", totalBacklogSP],
    ["Active Stories", activeStories.length],
    ["DEV Gap (SP)", devProjection.gapProven.toFixed(1)],
    ["DEV Coverage", formatPercent(devProjection.coverageProven * 100)],
  ];

  kpiData.forEach(([label, value], idx) => {
    const row = sheet.addRow([label, "", value, ""]);
    sheet.mergeCells(row.number, 1, row.number, 2);
    sheet.mergeCells(row.number, 3, row.number, 4);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: DARK_TEXT } };
    row.getCell(3).font = { size: 10, color: { argb: DARK_TEXT } };
    row.getCell(3).alignment = { horizontal: "right" };
    applyDataRowStriping(row, idx);
  });

  addBlankRow(sheet);

  // Capacity vs Scope table
  applySubtitleRow(sheet, "Capacity vs Scope by Stream", colCount);

  const capHeaders = ["Stream", "Scope (SP)", "Stories", "Coverage"];
  const capHeaderRow = sheet.addRow(capHeaders);
  applyHeaderRow(capHeaderRow);

  const capacityRows = computeCapacityRows(stories, [], devProjection, streamHrs);
  capacityRows.forEach((cr, idx) => {
    const row = sheet.addRow([
      STREAM_LABELS[cr.stream] ?? cr.stream,
      cr.scopeSP,
      cr.stories,
      cr.status === "N/A" ? "N/A" : formatPercent(cr.coveragePercent),
    ]);
    applyDataCellDefaults(row);
    applyDataRowStriping(row, idx);

    // Colour-code the status column
    if (cr.status !== "N/A") {
      row.getCell(4).font = {
        bold: true,
        size: 10,
        color: { argb: statusColor(cr.status) },
      };
    }
  });

  addBlankRow(sheet);

  // DEV projection summary
  applySubtitleRow(sheet, "Development Projection", colCount);

  const projData: [string, string][] = [
    ["Net DEV Capacity (hrs)", devProjection.netDevCapacity.toFixed(1)],
    ["Velocity (Proven)", devProjection.velocityProven.toFixed(2)],
    ["Velocity (Target)", devProjection.velocityTarget.toFixed(2)],
    ["Projected SP (Proven)", devProjection.projectedSPProven.toFixed(1)],
    ["Projected SP (Target)", devProjection.projectedSPTarget.toFixed(1)],
    ["Sprint Scope SP", String(devProjection.backlogDevSP)],
    ["Gap (Proven)", devProjection.gapProven.toFixed(1)],
    ["Gap (Target)", devProjection.gapTarget.toFixed(1)],
    ["Coverage (Proven)", formatPercent(devProjection.coverageProven * 100)],
    ["Coverage (Target)", formatPercent(devProjection.coverageTarget * 100)],
  ];

  projData.forEach(([label, value], idx) => {
    const row = sheet.addRow([label, "", value, ""]);
    sheet.mergeCells(row.number, 1, row.number, 2);
    sheet.mergeCells(row.number, 3, row.number, 4);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: DARK_TEXT } };
    row.getCell(3).font = { size: 10, color: { argb: DARK_TEXT } };
    row.getCell(3).alignment = { horizontal: "right" };
    applyDataRowStriping(row, idx);
  });

  autoWidth(sheet);
}

/**
 * Team sheet: Allocation matrix for all IC members.
 */
export function buildTeamSheet(
  workbook: ExcelJS.Workbook,
  data: ExportData,
): void {
  const sheet = workbook.addWorksheet("Team", {
    properties: { tabColor: { argb: YORK_RED } },
  });

  const sprint = primarySprint(data);
  const colCount = 14;

  applyTitleRow(sheet, `Team Allocations - ${sprintLabel(data.selectedSprints)}`, colCount);
  addBlankRow(sheet);

  // Sprint info row
  const infoRow = sheet.addRow([
    `Sprint: ${sprint.name}`,
    "",
    `Duration: ${sprint.durationWeeks} weeks`,
    "",
    `Focus Factor: ${(sprint.focusFactor * 100).toFixed(0)}%`,
    "",
    `Dates: ${formatDate(sprint.startDate)} - ${formatDate(sprint.endDate)}`,
  ]);
  infoRow.getCell(1).font = { italic: true, size: 10, color: { argb: DARK_TEXT } };
  infoRow.getCell(3).font = { italic: true, size: 10, color: { argb: DARK_TEXT } };
  infoRow.getCell(5).font = { italic: true, size: 10, color: { argb: DARK_TEXT } };
  infoRow.getCell(7).font = { italic: true, size: 10, color: { argb: DARK_TEXT } };
  addBlankRow(sheet);

  const headers = [
    "Last Name",
    "First Name",
    "Role",
    "Location",
    "FT/PT",
    "Hrs/Week",
    "REF %",
    "DES %",
    "DEV %",
    "QA %",
    "KT %",
    "Lead %",
    "PMO %",
    "Other %",
  ];

  const headerRow = sheet.addRow(headers);
  applyHeaderRow(headerRow);

  data.initialCapacities.forEach((m, idx) => {
    const row = sheet.addRow([
      m.lastName,
      m.firstName,
      m.role,
      m.location,
      m.ftPt,
      m.hrsPerWeek,
      `${Math.round(m.refinement * 100)}%`,
      `${Math.round(m.design * 100)}%`,
      `${Math.round(m.development * 100)}%`,
      `${Math.round(m.qa * 100)}%`,
      `${Math.round(m.kt * 100)}%`,
      `${Math.round(m.lead * 100)}%`,
      `${Math.round(m.pmo * 100)}%`,
      `${Math.round(m.other * 100)}%`,
    ]);
    applyDataCellDefaults(row);
    applyDataRowStriping(row, idx);
  });

  // Totals row
  addBlankRow(sheet);
  const totalHrsWeek = data.initialCapacities.reduce((s, m) => s + m.hrsPerWeek, 0);
  const totalNetHrs = data.initialCapacities.reduce(
    (s, m) => s + computeICMemberNetHrs(m, sprint, data.publicHolidays, data.projectHolidays, data.ptoEntries),
    0,
  );
  const totalsRow = sheet.addRow([
    "TOTALS",
    "",
    `${data.initialCapacities.length} members`,
    "",
    "",
    totalHrsWeek.toFixed(1),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    `Net: ${totalNetHrs.toFixed(1)} hrs`,
  ]);
  totalsRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: YORK_DARK },
    };
  });

  autoWidth(sheet);
}

/**
 * Backlog sheet: All stories with metadata.
 */
export function buildBacklogSheet(
  workbook: ExcelJS.Workbook,
  data: ExportData,
): void {
  const sheet = workbook.addWorksheet("Backlog", {
    properties: { tabColor: { argb: YORK_RED } },
  });

  const stories = computeStoriesForSprint(data);
  const colCount = 8;

  applyTitleRow(sheet, `Backlog - ${sprintLabel(data.selectedSprints)}`, colCount);
  addBlankRow(sheet);

  // Summary counts
  const activeStories = stories.filter((s) => !s.isExcluded);
  const excludedStories = stories.filter((s) => s.isExcluded);
  const totalSP = activeStories.reduce((s, st) => s + (st.storyPoints ?? 0), 0);

  const summaryRow = sheet.addRow([
    `Active: ${activeStories.length}`,
    "",
    `Excluded: ${excludedStories.length}`,
    "",
    `Total SP: ${totalSP}`,
  ]);
  summaryRow.getCell(1).font = { bold: true, size: 10, color: { argb: DARK_TEXT } };
  summaryRow.getCell(3).font = { bold: true, size: 10, color: { argb: DARK_TEXT } };
  summaryRow.getCell(5).font = { bold: true, size: 10, color: { argb: DARK_TEXT } };
  addBlankRow(sheet);

  const headers = [
    "Key",
    "Summary",
    "Status",
    "Story Points",
    "Stream",
    "Pod",
    "Dependency",
    "Excluded",
  ];

  const headerRow = sheet.addRow(headers);
  applyHeaderRow(headerRow);

  // Sort: active first, then excluded; within each group, by stream then key
  const sorted = [...stories].sort((a, b) => {
    if (a.isExcluded !== b.isExcluded) return a.isExcluded ? 1 : -1;
    if (a.stream !== b.stream) return a.stream.localeCompare(b.stream);
    return a.key.localeCompare(b.key);
  });

  sorted.forEach((s, idx) => {
    const row = sheet.addRow([
      s.key,
      s.summary,
      s.status,
      s.storyPoints ?? "",
      STREAM_LABELS[s.stream] ?? s.stream,
      s.pod ?? "",
      s.dependency ?? "",
      s.isExcluded ? "Yes" : "",
    ]);
    applyDataCellDefaults(row);
    applyDataRowStriping(row, idx);

    // Dim excluded rows
    if (s.isExcluded) {
      row.eachCell((cell) => {
        cell.font = { size: 10, color: { argb: "FF999999" }, italic: true };
      });
    }
  });

  autoWidth(sheet, 10, 60);

  // Make summary column wider
  const summaryCol = sheet.getColumn(2);
  if (summaryCol.width && summaryCol.width < 40) {
    summaryCol.width = 40;
  }
}

/**
 * Capacity sheet: Stream breakdown table + DEV capacity detail + projection.
 */
export function buildCapacitySheet(
  workbook: ExcelJS.Workbook,
  data: ExportData,
): void {
  const sheet = workbook.addWorksheet("Capacity", {
    properties: { tabColor: { argb: YORK_RED } },
  });

  const sprint = primarySprint(data);
  const stories = computeStoriesForSprint(data);
  const devCapacities = computeDevCapacityFromIC(data.initialCapacities, sprint, data.publicHolidays, data.projectHolidays, data.ptoEntries);
  const streamHrs = computeStreamCapacityFromIC(data.initialCapacities, sprint, data.publicHolidays, data.projectHolidays, data.ptoEntries);
  const totalBacklogSP = stories
    .filter((s) => !s.isExcluded)
    .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
  const devProjection = computeDevProjection(
    devCapacities,
    sprint.velocityProven ?? 0,
    sprint.velocityTarget ?? 0,
    totalBacklogSP,
  );
  const capacityRows = computeCapacityRows(stories, [], devProjection, streamHrs);

  const colCount = 9;

  applyTitleRow(sheet, `Capacity Analysis - ${sprintLabel(data.selectedSprints)}`, colCount);
  addBlankRow(sheet);

  // --- Stream Breakdown ---
  applySubtitleRow(sheet, "Capacity vs Scope by Stream", colCount);

  const streamHeaders = [
    "Stream",
    "Scope (SP)",
    "Stories",
    "Capacity (hrs)",
    "Velocity",
    "Projected SP",
    "Gap",
    "Coverage",
    "Status",
  ];
  const streamHeaderRow = sheet.addRow(streamHeaders);
  applyHeaderRow(streamHeaderRow);

  capacityRows.forEach((cr, idx) => {
    const row = sheet.addRow([
      STREAM_LABELS[cr.stream] ?? cr.stream,
      cr.scopeSP,
      cr.stories,
      cr.totalHrs.toFixed(1),
      cr.velocity !== null ? cr.velocity.toFixed(2) : "N/A",
      cr.projectedSP !== null ? cr.projectedSP.toFixed(1) : "N/A",
      cr.gap !== null ? cr.gap.toFixed(1) : "N/A",
      cr.coveragePercent !== null ? formatPercent(cr.coveragePercent) : "N/A",
      cr.status,
    ]);
    applyDataCellDefaults(row);
    applyDataRowStriping(row, idx);

    // Status-colour the last cell
    if (cr.status !== "N/A") {
      const statusCell = row.getCell(9);
      statusCell.font = { bold: true, size: 10, color: { argb: statusColor(cr.status) } };
    }
  });

  addBlankRow(sheet);

  // --- DEV Capacity Detail ---
  applySubtitleRow(sheet, "DEV Team Capacity Detail", colCount);

  const devHeaders = [
    "Name",
    "Role",
    "Location",
    "Hrs/Week",
    "DEV %",
    "Eff Hrs/Week",
    "Weeks",
    "Gross Hrs",
    "Holiday Hrs",
    "Net DEV Hrs",
  ];
  const devHeaderRow = sheet.addRow(devHeaders);
  applyHeaderRow(devHeaderRow);

  devCapacities.forEach((dc, idx) => {
    const row = sheet.addRow([
      dc.name,
      dc.role,
      dc.location,
      dc.hrsPerWeek,
      `${(dc.devPercent * 100).toFixed(0)}%`,
      dc.effHrsPerWeek.toFixed(2),
      dc.weeks,
      dc.grossHrs.toFixed(2),
      dc.holidayHrs.toFixed(2),
      dc.netDevHrs.toFixed(2),
    ]);
    applyDataCellDefaults(row);
    applyDataRowStriping(row, idx);
  });

  // DEV totals
  const totalNetDev = devCapacities.reduce((s, d) => s + d.netDevHrs, 0);
  const totalGross = devCapacities.reduce((s, d) => s + d.grossHrs, 0);
  const totalHolHrs = devCapacities.reduce((s, d) => s + d.holidayHrs, 0);
  const devTotalsRow = sheet.addRow([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    totalGross.toFixed(2),
    totalHolHrs.toFixed(2),
    totalNetDev.toFixed(2),
  ]);
  devTotalsRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: WHITE } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: YORK_DARK },
    };
  });

  addBlankRow(sheet);

  // --- DEV Projection ---
  applySubtitleRow(sheet, "Development Projection", colCount);

  const projKV: [string, string][] = [
    ["Net DEV Capacity (hrs)", devProjection.netDevCapacity.toFixed(1)],
    ["Velocity (Proven)", devProjection.velocityProven.toFixed(2)],
    ["Velocity (Target)", devProjection.velocityTarget.toFixed(2)],
    ["Projected SP (Proven)", devProjection.projectedSPProven.toFixed(1)],
    ["Projected SP (Target)", devProjection.projectedSPTarget.toFixed(1)],
    ["Sprint Scope SP", String(devProjection.backlogDevSP)],
    ["Gap (Proven)", devProjection.gapProven.toFixed(1)],
    ["Gap (Target)", devProjection.gapTarget.toFixed(1)],
    ["Coverage (Proven)", formatPercent(devProjection.coverageProven * 100)],
    ["Coverage (Target)", formatPercent(devProjection.coverageTarget * 100)],
  ];

  projKV.forEach(([label, value], idx) => {
    const row = sheet.addRow([label, "", value]);
    sheet.mergeCells(row.number, 1, row.number, 2);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: DARK_TEXT } };
    row.getCell(3).font = { size: 10, color: { argb: DARK_TEXT } };
    row.getCell(3).alignment = { horizontal: "right" };
    applyDataRowStriping(row, idx);
  });

  autoWidth(sheet);
}

/**
 * Holidays sheet: Public holidays, project holidays, and PTO entries.
 * Filters by selected sprint date ranges.
 */
export function buildHolidaysSheet(
  workbook: ExcelJS.Workbook,
  data: ExportData,
): void {
  const sheet = workbook.addWorksheet("Holidays", {
    properties: { tabColor: { argb: YORK_RED } },
  });

  const colCount = 6;

  applyTitleRow(sheet, `Holidays & PTO - ${sprintLabel(data.selectedSprints)}`, colCount);
  addBlankRow(sheet);

  // Determine date range from selected sprints
  const startDates = data.selectedSprints
    .map((s) => s.startDate)
    .filter((d): d is string => d !== null)
    .sort();
  const endDates = data.selectedSprints
    .map((s) => s.endDate)
    .filter((d): d is string => d !== null)
    .sort();

  const rangeStart = startDates[0] ?? null;
  const rangeEnd = endDates[endDates.length - 1] ?? null;

  function isInRange(dateStr: string): boolean {
    if (!rangeStart || !rangeEnd) return true;
    return dateStr >= rangeStart && dateStr <= rangeEnd;
  }

  // --- Public Holidays ---
  applySubtitleRow(sheet, "Public Holidays", colCount);

  const pubHeaders = ["Date", "Name", "Country", "Sprint", "Days", ""];
  const pubHeaderRow = sheet.addRow(pubHeaders);
  applyHeaderRow(pubHeaderRow);

  const filteredPublic = data.publicHolidays
    .filter((h) => isInRange(h.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (filteredPublic.length === 0) {
    const emptyRow = sheet.addRow(["No public holidays in selected period"]);
    sheet.mergeCells(emptyRow.number, 1, emptyRow.number, colCount);
    emptyRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF999999" } };
  } else {
    filteredPublic.forEach((h, idx) => {
      const row = sheet.addRow([
        formatDate(h.date),
        h.name,
        h.country,
        h.sprint ?? "",
        h.days,
        "",
      ]);
      applyDataCellDefaults(row);
      applyDataRowStriping(row, idx);
    });
  }

  addBlankRow(sheet);

  // --- Project Holidays ---
  applySubtitleRow(sheet, "Project Holidays", colCount);

  const projHeaders = ["Date", "Name", "Sprint", "Days", "", ""];
  const projHeaderRow = sheet.addRow(projHeaders);
  applyHeaderRow(projHeaderRow);

  const filteredProject = data.projectHolidays
    .filter((h) => isInRange(h.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (filteredProject.length === 0) {
    const emptyRow = sheet.addRow(["No project holidays in selected period"]);
    sheet.mergeCells(emptyRow.number, 1, emptyRow.number, colCount);
    emptyRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF999999" } };
  } else {
    filteredProject.forEach((h, idx) => {
      const row = sheet.addRow([
        formatDate(h.date),
        h.name,
        h.sprint ?? "",
        h.days,
        "",
        "",
      ]);
      applyDataCellDefaults(row);
      applyDataRowStriping(row, idx);
    });
  }

  addBlankRow(sheet);

  // --- PTO Entries ---
  applySubtitleRow(sheet, "Personal Time Off (PTO)", colCount);

  const ptoHeaders = ["Who", "Location", "Team", "Start Date", "End Date", ""];
  const ptoHeaderRow = sheet.addRow(ptoHeaders);
  applyHeaderRow(ptoHeaderRow);

  const filteredPto = data.ptoEntries
    .filter((e) => {
      if (!rangeStart || !rangeEnd) return true;
      // PTO overlaps with range if it starts before range ends and ends after range starts
      return e.startDate <= rangeEnd && e.endDate >= rangeStart;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.who.localeCompare(b.who));

  if (filteredPto.length === 0) {
    const emptyRow = sheet.addRow(["No PTO entries in selected period"]);
    sheet.mergeCells(emptyRow.number, 1, emptyRow.number, colCount);
    emptyRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF999999" } };
  } else {
    filteredPto.forEach((e, idx) => {
      const row = sheet.addRow([
        e.who,
        e.location,
        e.team ?? "",
        formatDate(e.startDate),
        formatDate(e.endDate),
        "",
      ]);
      applyDataCellDefaults(row);
      applyDataRowStriping(row, idx);
    });
  }

  autoWidth(sheet);
}
