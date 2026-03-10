"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { Sprint, InitialCapacity, PublicHoliday, ProjectHoliday, PtoEntry } from "@/types";
import type { SprintForecast } from "@/lib/capacity-engine";

interface SprintContextValue {
  /** Active sprints only (previous / current / next / planning) — used for navigation. */
  sprints: Sprint[];
  /** All sprints in the project — used for export and reference. */
  allSprints: Sprint[];
  selectedSprint: Sprint | null;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  goToPrevSprint: () => void;
  goToNextSprint: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  /** Sprint forecasts for all sprints (velocity, projected SP, etc.). */
  forecasts: SprintForecast[];
  /** O(1) lookup: sprintId → SprintForecast. */
  forecastMap: Map<string, SprintForecast>;
  /** Forecast for the currently selected sprint. */
  selectedForecast: SprintForecast | null;
  /** Shared data — avoids duplicate fetches across pages. */
  initialCapacities: InitialCapacity[];
  publicHolidays: PublicHoliday[];
  projectHolidays: ProjectHoliday[];
  ptoEntries: PtoEntry[];
}

const SprintContext = createContext<SprintContextValue | null>(null);

interface SprintProviderProps {
  /** Active sprints (previous / current / next / planning) — for navigation. */
  sprints: Sprint[];
  /** All sprints — for export popover. */
  allSprints: Sprint[];
  initialIndex: number;
  /** Computed forecasts for all sprints (from layout). */
  forecasts: SprintForecast[];
  /** Shared data — passed from layout to avoid per-page fetches. */
  initialCapacities: InitialCapacity[];
  publicHolidays: PublicHoliday[];
  projectHolidays: ProjectHoliday[];
  ptoEntries: PtoEntry[];
  children: React.ReactNode;
}

export function SprintProvider({
  sprints,
  allSprints,
  initialIndex,
  forecasts,
  initialCapacities,
  publicHolidays,
  projectHolidays,
  ptoEntries,
  children,
}: SprintProviderProps) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex < sprints.length - 1;

  const goToPrevSprint = useCallback(() => {
    if (canGoPrev) setSelectedIndex((i) => i - 1);
  }, [canGoPrev]);

  const goToNextSprint = useCallback(() => {
    if (canGoNext) setSelectedIndex((i) => i + 1);
  }, [canGoNext]);

  const forecastMap = useMemo(() => {
    const map = new Map<string, SprintForecast>();
    for (const f of forecasts) map.set(f.sprintId, f);
    return map;
  }, [forecasts]);

  const selectedSprint = sprints[selectedIndex] ?? null;

  const selectedForecast = useMemo(() => {
    return selectedSprint ? forecastMap.get(selectedSprint.id) ?? null : null;
  }, [selectedSprint, forecastMap]);

  const value = useMemo<SprintContextValue>(
    () => ({
      sprints,
      allSprints,
      selectedSprint,
      selectedIndex,
      setSelectedIndex,
      goToPrevSprint,
      goToNextSprint,
      canGoPrev,
      canGoNext,
      forecasts,
      forecastMap,
      selectedForecast,
      initialCapacities,
      publicHolidays,
      projectHolidays,
      ptoEntries,
    }),
    [
      sprints, allSprints, selectedSprint, selectedIndex,
      goToPrevSprint, goToNextSprint, canGoPrev, canGoNext,
      forecasts, forecastMap, selectedForecast,
      initialCapacities, publicHolidays, projectHolidays, ptoEntries,
    ],
  );

  return (
    <SprintContext.Provider value={value}>{children}</SprintContext.Provider>
  );
}

export function useSprint(): SprintContextValue {
  const ctx = useContext(SprintContext);
  if (!ctx) {
    throw new Error("useSprint must be used within a <SprintProvider>");
  }
  return ctx;
}
