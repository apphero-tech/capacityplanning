import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { SprintProvider } from "@/contexts/sprint-context"
import { ProjectionSettingsProvider } from "@/contexts/projection-settings-context"
import { WorkspaceProvider } from "@/contexts/workspace-context"
import { getCurrentWorkspace } from "@/lib/auth/workspace"
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
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  // Validate the slug + membership before loading any workspace data.
  // notFound() fires inside getCurrentWorkspace if the user can't see it.
  const { slug } = await params;
  const ctx = await getCurrentWorkspace(slug);

  const [allSprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries] =
    await Promise.all([
      getAllSprints(),
      getInitialCapacities(),
      getPublicHolidays(),
      getProjectHolidays(),
      getPtoEntries(),
    ]);

  const activeSprints = allSprints.filter((s) => s.isActive);

  // Default to the sprint we are actively *planning for* — which is the
  // upcoming one, not the one already in flight. At any given moment the
  // current sprint's scope is frozen; the interesting capacity question is
  // always about the next non-demo sprint that hasn't started yet.
  const nextIndex = activeSprints.findIndex((s) => s.status === "next");
  const currentIndex = activeSprints.findIndex((s) => s.isCurrent);
  const initialIndex = nextIndex >= 0 ? nextIndex : currentIndex >= 0 ? currentIndex : 0;

  // Compute forecasts ONCE for the entire app
  const forecasts = computeAllSprintForecasts(
    allSprints,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  );

  // Workspace accent colour overrides --coral for everything rendered
  // inside this subtree. The default value in globals.css remains coral
  // for non-workspace pages (login etc.); inside the dashboard, every
  // mention of var(--coral) resolves to the workspace's brand colour.
  const accentColor = ctx.workspace.accentColor;
  const accentSoft = `${accentColor}1f`; // ~12% alpha as 8-digit hex

  return (
    <WorkspaceProvider
      slug={ctx.workspace.slug}
      name={ctx.workspace.name}
      role={ctx.role}
      email={ctx.email}
      accentColor={accentColor}
    >
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
        <ProjectionSettingsProvider>
          <div
            className="flex h-screen overflow-hidden"
            style={
              {
                "--coral": accentColor,
                "--coral-soft": accentSoft,
                "--primary": accentColor,
                "--ring": accentColor,
              } as React.CSSProperties
            }
          >
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto px-10 py-10">
                <div className="mx-auto w-full max-w-[1400px]">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </ProjectionSettingsProvider>
      </SprintProvider>
    </WorkspaceProvider>
  )
}
