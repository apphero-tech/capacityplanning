import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  getAllSprints,
  getInitialCapacities,
  getStoriesBySprint,
  getPublicHolidays,
  getProjectHolidays,
  getPtoEntries,
} from "@/lib/data";
import { isExcludedStory } from "@/lib/capacity-engine";
import type { SprintStory } from "@/types";
import {
  buildDashboardSheet,
  buildTeamSheet,
  buildBacklogSheet,
  buildCapacitySheet,
  buildHolidaysSheet,
} from "@/lib/excel-export";

export async function GET(request: NextRequest) {
  try {
    const sprintIds = request.nextUrl.searchParams.get("sprints");

    // Fetch base data in parallel
    const [sprints, initialCapacities, publicHolidays, projectHolidays, ptoEntries] =
      await Promise.all([
        getAllSprints(),
        getInitialCapacities(),
        getPublicHolidays(),
        getProjectHolidays(),
        getPtoEntries(),
      ]);

    // Determine which sprints to export
    let selectedSprints = sprints;
    if (sprintIds) {
      const ids = sprintIds.split(",").map((s) => s.trim());
      selectedSprints = sprints.filter((s) => ids.includes(s.id));
      if (selectedSprints.length === 0) {
        selectedSprints = sprints.filter((s) => s.isCurrent);
      }
    }

    if (selectedSprints.length === 0 && sprints.length > 0) {
      selectedSprints = [sprints[0]];
    }

    // Fetch stories for active sprints
    const activeSprints = sprints.filter((s) => s.isActive);
    const allSprintStories = await Promise.all(
      activeSprints.map(async (sprint) => {
        const stories = await getStoriesBySprint(sprint.id);
        return stories.map(
          (s): SprintStory => ({
            ...s,
            isExcluded: isExcludedStory(s.status),
          })
        );
      })
    );

    const storiesBySprint: Record<string, SprintStory[]> = {};
    for (let i = 0; i < activeSprints.length; i++) {
      storiesBySprint[activeSprints[i].id] = allSprintStories[i];
    }

    const data = {
      sprints,
      selectedSprints,
      initialCapacities,
      storiesBySprint,
      publicHolidays,
      projectHolidays,
      ptoEntries,
    };

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Capacity Planning";
    workbook.created = new Date();

    // Build all sheets
    buildDashboardSheet(workbook, data);
    buildTeamSheet(workbook, data);
    buildBacklogSheet(workbook, data);
    buildCapacitySheet(workbook, data);
    buildHolidaysSheet(workbook, data);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // File name
    const sprintLabel =
      selectedSprints.length === 1
        ? selectedSprints[0].name.replace(/\s+/g, "_")
        : `${selectedSprints.length}_sprints`;
    const fileName = `Capacity_Planning_${sprintLabel}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json(
      { error: "Failed to generate export" },
      { status: 500 }
    );
  }
}
