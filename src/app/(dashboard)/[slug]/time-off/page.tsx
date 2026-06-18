import {
  getPublicHolidays,
  getProjectHolidays,
  getPtoEntries,
  getInitialCapacities,
} from "@/lib/data";
import { TimeOffView } from "@/components/time-off/time-off-view";
import { PageHeader } from "@/components/layout/page-header";

export default async function TimeOffPage() {
  const [publicHolidays, projectHolidays, ptoEntries, initialCapacities] =
    await Promise.all([
      getPublicHolidays(),
      getProjectHolidays(),
      getPtoEntries(),
      getInitialCapacities(),
    ]);

  const teamMembersMinimal = initialCapacities.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    location: m.location,
    organization: m.organization,
    isActive: m.isActive,
    // Carry the four DEV-cycle stream percentages so the Time Off filter
    // can decide who counts as REF / DES / DEV / QA. A person belongs to
    // every stream where their allocation is strictly positive.
    refinement: m.refinement,
    design: m.design,
    development: m.development,
    qa: m.qa,
  }));

  const subtitle =
    publicHolidays.length + projectHolidays.length + ptoEntries.length === 0
      ? "No time-off data yet — import the Planner CSV to populate PTO, and add holidays."
      : `${publicHolidays.length} public holiday${publicHolidays.length !== 1 ? "s" : ""} · ${projectHolidays.length} project closure${projectHolidays.length !== 1 ? "s" : ""} · ${ptoEntries.length} PTO entries`;

  return (
    <div className="flex flex-col gap-8" data-stagger>
      <PageHeader title="Time Off" subtitle={`${subtitle}.`} />
      <TimeOffView
        publicHolidays={publicHolidays}
        projectHolidays={projectHolidays}
        ptoEntries={ptoEntries}
        teamMembers={teamMembersMinimal}
      />
    </div>
  );
}
