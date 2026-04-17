import {
  getPublicHolidays,
  getProjectHolidays,
  getPtoEntries,
  getInitialCapacities,
} from "@/lib/data";
import { TimeOffView } from "@/components/time-off/time-off-view";

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
  }));

  const subtitle =
    publicHolidays.length + projectHolidays.length + ptoEntries.length === 0
      ? "No time-off data yet — import the Planner CSV to populate PTO, and add holidays."
      : `${publicHolidays.length} public holiday${publicHolidays.length !== 1 ? "s" : ""} · ${projectHolidays.length} project closure${projectHolidays.length !== 1 ? "s" : ""} · ${ptoEntries.length} PTO entries`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Time Off
        </h2>
        <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
      </div>

      <TimeOffView
        publicHolidays={publicHolidays}
        projectHolidays={projectHolidays}
        ptoEntries={ptoEntries}
        teamMembers={teamMembersMinimal}
      />
    </div>
  );
}
