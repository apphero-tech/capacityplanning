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
    isActive: m.isActive,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Time Off
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Public holidays, project closures, and personal time off impacting team capacity.
        </p>
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
