import { differenceInBusinessDays } from "date-fns";
import type { Sprint, PublicHoliday, ProjectHoliday, PtoEntry } from "@/types";

function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
  const d = new Date(dateStr);
  const start = new Date(startStr);
  const end = new Date(endStr);
  return d >= start && d <= end;
}

/** Count business days of a PTO entry that overlap with a sprint. */
function ptoDaysInSprint(entry: PtoEntry, sprint: Sprint): number {
  if (!sprint.startDate || !sprint.endDate) return 0;

  const ptoStart = new Date(entry.startDate + "T00:00:00");
  const ptoEnd = new Date(entry.endDate + "T00:00:00");
  const sprintStart = new Date(sprint.startDate + "T00:00:00");
  const sprintEnd = new Date(sprint.endDate + "T00:00:00");

  // No overlap
  if (ptoEnd < sprintStart || ptoStart > sprintEnd) return 0;

  // Clamp to sprint range
  const overlapStart = ptoStart > sprintStart ? ptoStart : sprintStart;
  const overlapEnd = ptoEnd < sprintEnd ? ptoEnd : sprintEnd;

  const days = differenceInBusinessDays(overlapEnd, overlapStart) + 1;
  return Math.max(days, 0);
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

  const pubDays = publicHolidays
    .filter(h =>
      countries.includes(h.country) &&
      isDateInRange(h.date, sprint.startDate!, sprint.endDate!)
    )
    .reduce((sum, h) => sum + h.days, 0);

  const projDays = projectHolidays
    .filter(h =>
      h.date && isDateInRange(h.date, sprint.startDate!, sprint.endDate!)
    )
    .reduce((sum, h) => sum + h.days, 0);

  // PTO days for this specific member
  // PTO `who` may be "LastName, FirstName" while memberName is "FirstName LastName"
  // Also strip accents for robust matching (e.g. "Séréna" matches "Serena")
  let ptoDays = 0;
  if (ptoEntries && memberName) {
    const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalized = stripAccents(memberName.toLowerCase().trim());
    ptoDays = ptoEntries
      .filter(e => {
        const ptoName = stripAccents(e.who.toLowerCase().trim());
        if (ptoName === normalized) return true;
        // Convert "LastName, FirstName" → "FirstName LastName"
        if (ptoName.includes(",")) {
          const [last, first] = ptoName.split(",").map(s => s.trim());
          if (`${first} ${last}` === normalized) return true;
        }
        return false;
      })
      .reduce((sum, e) => sum + ptoDaysInSprint(e, sprint), 0);
  }

  return pubDays + projDays + ptoDays;
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
