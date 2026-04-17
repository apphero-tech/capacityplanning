import { NextRequest, NextResponse } from "next/server";
import { deleteSprint, updateSprint, updateSprintActuals } from "@/lib/data";

/**
 * PATCH /api/sprints/:id
 * Update commitment/completed SP for a sprint.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate fields
    const updates: { commitmentSP?: number | null; completedSP?: number | null } = {};

    if ("commitmentSP" in body) {
      if (body.commitmentSP !== null && (typeof body.commitmentSP !== "number" || body.commitmentSP < 0)) {
        return NextResponse.json(
          { error: "commitmentSP must be a non-negative number or null" },
          { status: 400 }
        );
      }
      updates.commitmentSP = body.commitmentSP;
    }

    if ("completedSP" in body) {
      if (body.completedSP !== null && (typeof body.completedSP !== "number" || body.completedSP < 0)) {
        return NextResponse.json(
          { error: "completedSP must be a non-negative number or null" },
          { status: 400 }
        );
      }
      updates.completedSP = body.completedSP;
    }

    // Optional edit fields (name / dates / focus factor). When any of these
    // are present, route through updateSprint which also handles the derived
    // fields (workingDays, durationWeeks, isCurrent).
    const edit: Parameters<typeof updateSprint>[1] = {};
    if (typeof body.name === "string") edit.name = body.name.trim();
    if (body.startDate === null || typeof body.startDate === "string") {
      edit.startDate = body.startDate || null;
    }
    if (body.endDate === null || typeof body.endDate === "string") {
      edit.endDate = body.endDate || null;
    }
    if (typeof body.focusFactor === "number") {
      if (body.focusFactor < 0 || body.focusFactor > 1) {
        return NextResponse.json(
          { error: "focusFactor must be between 0 and 1" },
          { status: 400 },
        );
      }
      edit.focusFactor = body.focusFactor;
    }

    const hasEdit = Object.keys(edit).length > 0;
    const hasActuals = Object.keys(updates).length > 0;

    if (!hasEdit && !hasActuals) {
      return NextResponse.json(
        {
          error:
            "No valid fields to update. Provide commitmentSP, completedSP, name, startDate, endDate, or focusFactor.",
        },
        { status: 400 },
      );
    }

    if (hasEdit) {
      const ok = updateSprint(id, edit);
      if (!ok) {
        return NextResponse.json({ error: `Sprint "${id}" not found` }, { status: 404 });
      }
    }

    if (hasActuals) {
      const ok = updateSprintActuals(id, updates);
      if (!ok) {
        return NextResponse.json({ error: `Sprint "${id}" not found` }, { status: 404 });
      }
    }

    return NextResponse.json({ ok: true, id, ...updates, ...edit });
  } catch (err) {
    console.error("PATCH /api/sprints/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** DELETE /api/sprints/:id — remove a sprint (does not touch stories by design). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const removed = deleteSprint(id);
    if (!removed) {
      return NextResponse.json({ error: `Sprint "${id}" not found` }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/sprints/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
