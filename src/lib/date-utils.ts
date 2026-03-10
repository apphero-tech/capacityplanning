/**
 * Shared date utilities.
 *
 * IMPORTANT — All date strings stored in the DB are ISO date-only ("2026-03-02").
 * `new Date("2026-03-02")` parses as **UTC midnight**, which shifts to the
 * previous day in negative-offset timezones (e.g. EST = UTC-5).
 *
 * Always use `parseLocalDate()` (or append "T00:00:00") so the date is
 * interpreted as **local midnight**.
 */

import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Core parser — single source of truth
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date-only string ("2026-03-02") as local midnight.
 * Returns `null` for null/undefined/empty input.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00");
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** "Mar 2, 2026" */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Not set";
  try {
    return format(parseLocalDate(dateStr)!, "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

/** "Mar 2" */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return format(parseLocalDate(dateStr)!, "MMM d");
  } catch {
    return dateStr;
  }
}

/** "Mar 2, 2026 – Mar 27, 2026" */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start || !end) return "No dates";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const s = parseLocalDate(start)!.toLocaleDateString("en-US", opts);
  const e = parseLocalDate(end)!.toLocaleDateString("en-US", opts);
  return `${s} \u2013 ${e}`;
}

/** "Mar 2 – Mar 27" (no year) */
export function formatDateRangeShort(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start || !end) return "No dates";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = parseLocalDate(start)!.toLocaleDateString("en-US", opts);
  const e = parseLocalDate(end)!.toLocaleDateString("en-US", opts);
  return `${s} \u2013 ${e}`;
}
