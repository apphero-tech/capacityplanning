import { getGuideEntries } from "@/lib/data";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const guideEntries = await getGuideEntries();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          Settings
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Sprint parameters, definitions, and configuration reference.
        </p>
      </div>

      <SettingsView guideEntries={guideEntries} />
    </div>
  );
}
