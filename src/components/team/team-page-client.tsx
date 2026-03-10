"use client";

import { useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamTable } from "@/components/team/team-table";
import { DevProjectionPanel } from "@/components/team/dev-projection";
import { Users, Code } from "lucide-react";
import { useSprint } from "@/contexts/sprint-context";
import {
  computeICMemberNetHrs,
  computeDevCapacityFromIC,
  computeDevProjection,
} from "@/lib/capacity-engine";
import type { SprintStory } from "@/types";

interface TeamPageClientProps {
  storiesBySprint: Record<string, SprintStory[]>;
}

export interface ComputedMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  location: string;
  ftPt: string;
  hrsPerWeek: number;
  isActive: boolean;
  refinement: number;
  design: number;
  development: number;
  qa: number;
  kt: number;
  lead: number;
  pmo: number;
  other: number;
  netHrs: number;
}

export function TeamPageClient({
  storiesBySprint,
}: TeamPageClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const {
    selectedSprint,
    selectedForecast,
    initialCapacities,
    publicHolidays,
    projectHolidays,
    ptoEntries,
  } = useSprint();

  const handleUpdate = useCallback(async (id: string, field: string, value: string | number | boolean) => {
    await fetch(`/api/allocations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    startTransition(() => router.refresh());
  }, [router, startTransition]);

  const computedMembers = useMemo(() => {
    if (!selectedSprint) return [];
    return initialCapacities.map((m): ComputedMember => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      role: m.role,
      location: m.location,
      ftPt: m.ftPt,
      hrsPerWeek: m.hrsPerWeek,
      isActive: m.isActive,
      refinement: m.refinement,
      design: m.design,
      development: m.development,
      qa: m.qa,
      kt: m.kt,
      lead: m.lead,
      pmo: m.pmo,
      other: m.other,
      netHrs: m.isActive
        ? Math.round(computeICMemberNetHrs(m, selectedSprint, publicHolidays, projectHolidays, ptoEntries) * 100) / 100
        : 0,
    }));
  }, [initialCapacities, selectedSprint, publicHolidays, projectHolidays, ptoEntries]);

  const projection = useMemo(() => {
    if (!selectedSprint) {
      return {
        netDevCapacity: 0,
        velocityProven: 0,
        velocityTarget: 0,
        projectedSPProven: 0,
        projectedSPTarget: 0,
        backlogDevSP: 0,
        gapProven: 0,
        gapTarget: 0,
        coverageProven: 0,
        coverageTarget: 0,
      };
    }
    const devCapacities = computeDevCapacityFromIC(initialCapacities, selectedSprint, publicHolidays, projectHolidays, ptoEntries);
    const stories = storiesBySprint[selectedSprint.id] ?? [];
    const totalBacklogSP = stories
      .filter((s) => !s.isExcluded)
      .reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
    return computeDevProjection(
      devCapacities,
      selectedForecast?.velocityProven ?? selectedSprint.velocityProven ?? 0,
      selectedForecast?.velocityTarget ?? selectedSprint.velocityTarget ?? 0,
      totalBacklogSP,
    );
  }, [initialCapacities, selectedSprint, publicHolidays, projectHolidays, ptoEntries, storiesBySprint, selectedForecast]);

  if (!selectedSprint) {
    return <p className="text-sm text-slate-400">No sprint selected.</p>;
  }

  return (
    <Tabs defaultValue="all-team">
      <TabsList>
        <TabsTrigger value="all-team" className="gap-1.5">
          <Users className="size-4" />
          All Team
        </TabsTrigger>
        <TabsTrigger value="dev-capacity" className="gap-1.5">
          <Code className="size-4" />
          Dev Capacity
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all-team" className="mt-4">
        <TeamTable members={computedMembers} onUpdate={handleUpdate} />
      </TabsContent>

      <TabsContent value="dev-capacity" className="mt-4">
        <DevProjectionPanel projection={projection} />
      </TabsContent>
    </Tabs>
  );
}
