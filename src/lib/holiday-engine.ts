import type { Sprint, PublicHoliday, ProjectHoliday, PtoEntry } from "@/types";

function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
  const d = new Date(dateStr);
  const start = new Date(startStr);
  const end = new Date(endStr);
  return d >= start && d <= end;
}

/**
 * Expand a start→end range (both inclusive, ISO YYYY-MM-DD) into every
 * business day between them. Used to deduplicate days when a member is off
 * for both a public holiday and a PTO on the same date — the day only
 * counts once.
 */
function businessDaysInRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay(); // 0 Sun, 6 Sat
    if (dow !== 0 && dow !== 6) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function getHolidayDaysForMember(
  location: string,
  sprint: Sprint,
  publicHolidays: PublicHoliday[],
  projectHolidays: ProjectHoliday[],
  ptoEntries?: PtoEntry[],
  memberName?: string,
): number {
  if (!sprint.startDate || !sprint.endDate) return 0;

  // Quebec is standalone; USA and Venezuela follow Quebec holidays
  const countries = (location === "Venezuela" || location === "USA")
    ? ["Quebec"]
    : [location];

  // Build a single Set of distinct "off" dates within the sprint window.
  // Public, project and personal time off that fall on the same date are
  // deduplicated — the member loses 1 day of work, not 2 or 3.
  const offDates = new Set<string>();

  publicHolidays.forEach((h) => {
    if (countries.includes(h.country) && isDateInRange(h.date, sprint.startDate!, sprint.endDate!)) {
      offDates.add(h.date);
    }
  });

  projectHolidays.forEach((h) => {
    if (h.date && isDateInRange(h.date, sprint.startDate!, sprint.endDate!)) {
      offDates.add(h.date);
    }
  });

  if (ptoEntries && memberName) {
    const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalized = stripAccents(memberName.toLowerCase().trim());
    const sprintStart = new Date(sprint.startDate + "T00:00:00");
    const sprintEnd = new Date(sprint.endDate + "T00:00:00");

    for (const e of ptoEntries) {
      const ptoName = stripAccents(e.who.toLowerCase().trim());
      let matches = ptoName === normalized;
      if (!matches && ptoName.includes(",")) {
        const [last, first] = ptoName.split(",").map((s) => s.trim());
        if (`${first} ${last}` === normalized) matches = true;
      }
      if (!matches) continue;

      const ptoStart = new Date(e.startDate + "T00:00:00");
      const ptoEnd = new Date(e.endDate + "T00:00:00");
      if (ptoEnd < sprintStart || ptoStart > sprintEnd) continue;

      const overlapStart = ptoStart > sprintStart ? ptoStart : sprintStart;
      const overlapEnd = ptoEnd < sprintEnd ? ptoEnd : sprintEnd;

      for (const d of businessDaysInRange(overlapStart, overlapEnd)) {
        offDates.add(d);
      }
    }
  }

  return offDates.size;
}

export function getHolidaySummaryBySprint(
  sprint: Sprint,
  publicHolidays: PublicHoliday[],
  projectHolidays: ProjectHoliday[],
  ptoEntries?: PtoEntry[],
): Record<string, number> {
  if (!sprint.startDate || !sprint.endDate) return {};

  const countries = ["Canada", "Quebec", "India"];
  const summary: Record<string, number> = {};

  for (const country of countries) {
    const inherited = [country];
    summary[country] = publicHolidays
      .filter(h =>
        inherited.includes(h.country) &&
        isDateInRange(h.date, sprint.startDate!, sprint.endDate!)
      )
      .reduce((sum, h) => sum + h.days, 0);
  }

  summary["Project"] = projectHolidays
    .filter(h =>
      h.date && isDateInRange(h.date, sprint.startDate!, sprint.endDate!)
    )
    .reduce((sum, h) => sum + h.days, 0);

  // Personal (PTO) days in the sprint
  if (ptoEntries && ptoEntries.length > 0) {
    summary["Personal"] = ptoEntries.reduce(
      (sum, e) => sum + ptoDaysInSprint(e, sprint),
      0
    );
  }

  return summary;
}
