import { NextRequest, NextResponse } from "next/server";
import { updateSprintActuals } from "@/lib/data";

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

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update. Provide commitmentSP and/or completedSP." },
        { status: 400 }
      );
    }

    const updated = updateSprintActuals(id, updates);

    if (!updated) {
      return NextResponse.json(
        { error: `Sprint "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, id, ...updates });
  } catch (err) {
    console.error("PATCH /api/sprints/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
