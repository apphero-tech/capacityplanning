import { NextRequest, NextResponse } from "next/server";
import { insertSprint } from "@/lib/data";

/**
 * POST /api/sprints
 * Create a new sprint with the given params.
 * Body: { name, startDate?, endDate?, durationWeeks?, workingDays?, focusFactor?, isCurrent? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name: string = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const id = insertSprint({
      name,
      startDate: typeof body.startDate === "string" && body.startDate ? body.startDate : null,
      endDate: typeof body.endDate === "string" && body.endDate ? body.endDate : null,
      durationWeeks: typeof body.durationWeeks === "number" ? body.durationWeeks : undefined,
      workingDays: typeof body.workingDays === "number" ? body.workingDays : undefined,
      focusFactor: typeof body.focusFactor === "number" ? body.focusFactor : undefined,
      isCurrent: body.isCurrent === true,
    });

    return NextResponse.json({ ok: true, id, name }, { status: 201 });
  } catch (err) {
    console.error("POST /api/sprints error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
