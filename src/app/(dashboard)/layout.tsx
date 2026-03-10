import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { SprintProvider } from "@/contexts/sprint-context"
import {
  getAllSprints,
  getInitialCapacities,
  getPublicHolidays,
  getProjectHolidays,
  getPtoEntries,
} from "@/lib/data"
import { computeAllSprintForecasts } from "@/lib/capacity-engine"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [allSprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries] =
    await Promise.all([
      getAllSprints(),
      getInitialCapacities(),
      getPublicHolidays(),
      getProjectHolidays(),
      getPtoEntries(),
    ]);

  const activeSprints = allSprints.filter((s) => s.isActive);

  // Default to the current sprint within the active window
  const currentIndex = activeSprints.findIndex((s) => s.isCurrent);
  const initialIndex = currentIndex >= 0 ? currentIndex : 0;

  // Compute forecasts ONCE for the entire app
  const forecasts = computeAllSprintForecasts(
    allSprints,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  );

  return (
    <SprintProvider
      sprints={activeSprints}
      allSprints={allSprints}
      initialIndex={initialIndex}
      forecasts={forecasts}
      initialCapacities={initialCapacities}
      publicHolidays={publicHolidays}
      projectHolidays={projectHolidays}
      ptoEntries={ptoEntries}
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SprintProvider>
  )
}
