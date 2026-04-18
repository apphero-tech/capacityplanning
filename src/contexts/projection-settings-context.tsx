"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { VelocityBasis } from "@/lib/capacity-engine";

/**
 * Tunable parameters that drive every "team can deliver" projection:
 *
 *  • basis      — which historical window the average velocity is
 *                 computed over.
 *  • growthPct  — a user-set percentage added on top of that velocity
 *                 to model an expected team progression (e.g. +5%).
 *
 * Persisted in localStorage so the choice follows the user across
 * sessions and pages.
 */
interface ProjectionSettings {
  basis: VelocityBasis;
  growthPct: number;
  setBasis: (b: VelocityBasis) => void;
  setGrowthPct: (g: number) => void;
  effectiveMultiplier: number;
}

const ProjectionSettingsContext = createContext<ProjectionSettings | null>(null);

const STORAGE_KEY = "projectionSettings.v1";

function loadInitial(): { basis: VelocityBasis; growthPct: number } {
  if (typeof window === "undefined") {
    return { basis: "last3", growthPct: 0 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { basis: "last3", growthPct: 0 };
    const parsed = JSON.parse(raw) as Partial<{ basis: VelocityBasis; growthPct: number }>;
    return {
      basis: parsed.basis ?? "last3",
      growthPct: typeof parsed.growthPct === "number" ? parsed.growthPct : 0,
    };
  } catch {
    return { basis: "last3", growthPct: 0 };
  }
}

export function ProjectionSettingsProvider({ children }: { children: React.ReactNode }) {
  const [basis, setBasisState] = useState<VelocityBasis>("last3");
  const [growthPct, setGrowthPctState] = useState<number>(0);

  useEffect(() => {
    const init = loadInitial();
    setBasisState(init.basis);
    setGrowthPctState(init.growthPct);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ basis, growthPct }));
    } catch {
      // localStorage can be unavailable in private modes — fail silently.
    }
  }, [basis, growthPct]);

  const value = useMemo<ProjectionSettings>(
    () => ({
      basis,
      growthPct,
      setBasis: setBasisState,
      setGrowthPct: setGrowthPctState,
      effectiveMultiplier: 1 + growthPct / 100,
    }),
    [basis, growthPct],
  );

  return (
    <ProjectionSettingsContext.Provider value={value}>
      {children}
    </ProjectionSettingsContext.Provider>
  );
}

export function useProjectionSettings(): ProjectionSettings {
  const ctx = useContext(ProjectionSettingsContext);
  if (!ctx) {
    throw new Error("useProjectionSettings must be used within <ProjectionSettingsProvider>");
  }
  return ctx;
}
